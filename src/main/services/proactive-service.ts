import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

import { Notification } from 'electron'

import { evaluateProactivePolicy } from '../../shared/proactive-policy'
import type { AppSettings, OperationResult, ProactiveEvent, Reminder } from '../../shared/types'
import type { AppLogger } from './logger'

type PersistedState = {
  version: 1
  reminders: Reminder[]
}

export class ProactiveService {
  private reminders: Reminder[] = []
  private timer: NodeJS.Timeout | null = null
  private readonly deliveredListeners = new Set<(event: ProactiveEvent) => void>()

  constructor(
    private readonly filePath: string,
    private readonly getSettings: () => AppSettings,
    private readonly logger: AppLogger,
    private readonly isFullscreen: () => boolean = () => false,
    private readonly isAvatarBusy: () => boolean = () => false
  ) {}

  async start(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    await this.load()
    await this.tick()
    this.timer = setInterval(() => void this.tick(), 30_000)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  onEvent(listener: (event: ProactiveEvent) => void): () => void {
    this.deliveredListeners.add(listener)
    return () => this.deliveredListeners.delete(listener)
  }

  list(): Reminder[] {
    return this.reminders.map((reminder) => ({ ...reminder }))
  }

  async schedule(input: {
    kind: 'custom' | 'event' | 'deadline'
    title: string
    body: string
    scheduledAt: string
  }): Promise<OperationResult> {
    const reminder: Reminder = {
      id: randomUUID(),
      kind: input.kind,
      title: input.title,
      body: input.body,
      dedupeKey: `${input.kind}:${input.title.toLowerCase()}:${input.scheduledAt}`,
      scheduledAt: input.scheduledAt,
      deliveredAt: null,
      snoozedUntil: null,
      dismissedAt: null
    }
    this.reminders.push(reminder)
    await this.persist()
    return { ok: true, message: 'Pengingat tersimpan.' }
  }

  async manualTest(): Promise<OperationResult> {
    const now = new Date()
    const reminder: Reminder = {
      id: randomUUID(),
      kind: 'manual',
      title: 'Tes pengingat Yachiyo',
      body: 'Notifikasi lokal berfungsi. Kamu dapat snooze atau dismiss tanpa menghubungi Hermes.',
      dedupeKey: `manual:${now.toISOString()}`,
      scheduledAt: now.toISOString(),
      deliveredAt: null,
      snoozedUntil: null,
      dismissedAt: null
    }
    this.reminders.push(reminder)
    const result = this.tryDeliver(reminder, now)
    await this.persist()
    return result
  }

  async act(id: string, action: 'snooze-10' | 'snooze-60' | 'dismiss'): Promise<OperationResult> {
    const reminder = this.reminders.find((item) => item.id === id)
    if (!reminder) return { ok: false, message: 'Pengingat tidak ditemukan.' }
    if (action === 'dismiss') {
      reminder.dismissedAt = new Date().toISOString()
      reminder.snoozedUntil = null
    } else {
      const minutes = action === 'snooze-10' ? 10 : 60
      reminder.snoozedUntil = new Date(Date.now() + minutes * 60_000).toISOString()
      reminder.scheduledAt = reminder.snoozedUntil
      reminder.deliveredAt = null
    }
    await this.persist()
    this.emit({ type: 'updated', reminder: { ...reminder } })
    return {
      ok: true,
      message: action === 'dismiss' ? 'Pengingat ditutup.' : 'Pengingat ditunda.'
    }
  }

  private async tick(): Promise<void> {
    const now = new Date()
    this.ensureDailyReminders(now)
    for (const reminder of this.reminders) {
      if (reminder.deliveredAt || reminder.dismissedAt) continue
      if (new Date(reminder.scheduledAt) > now) continue
      this.tryDeliver(reminder, now)
    }
    await this.persist()
  }

  private tryDeliver(reminder: Reminder, now: Date): OperationResult {
    const settings = this.getSettings().proactive
    const deliveredToday = this.reminders.filter(
      (item) =>
        item.deliveredAt &&
        localDate(new Date(item.deliveredAt), settings.timezone) ===
          localDate(now, settings.timezone)
    )
    const lastDeliveredAt =
      deliveredToday
        .map((item) => item.deliveredAt)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? null
    const decision = evaluateProactivePolicy(
      reminder,
      settings,
      {
        deliveredToday: deliveredToday.length,
        lastDeliveredAt,
        dedupeKeys: this.reminders
          .filter(
            (item) =>
              item.id !== reminder.id && (item.deliveredAt !== null || item.dismissedAt !== null)
          )
          .map((item) => item.dedupeKey),
        fullscreen: this.isFullscreen(),
        avatarBusy: this.isAvatarBusy()
      },
      now
    )
    if (!decision.allowed) {
      return {
        ok: false,
        message: policyMessage(decision.reason)
      }
    }

    reminder.deliveredAt = now.toISOString()
    if (Notification.isSupported()) {
      const notification = new Notification({
        title: reminder.title,
        body: reminder.body,
        silent: true,
        timeoutType: 'default'
      })
      notification.show()
    }
    this.emit({ type: 'delivered', reminder: { ...reminder } })
    return { ok: true, message: 'Notifikasi tes dikirim.' }
  }

  private ensureDailyReminders(now: Date): void {
    const settings = this.getSettings().proactive
    const date = localDate(now, settings.timezone)
    const time = localTime(now, settings.timezone)
    const additions: Reminder[] = []
    if (settings.morningGreeting && time >= '07:00' && time < '07:05') {
      additions.push(
        dailyReminder(
          'morning',
          date,
          'Selamat pagi',
          'Semoga harimu berjalan tenang. Ada yang ingin kamu susun pagi ini?',
          now
        )
      )
    }
    if (settings.eveningReview && time >= '20:30' && time < '20:35') {
      additions.push(
        dailyReminder(
          'evening',
          date,
          'Review singkat',
          'Ingin menutup hari dengan satu catatan atau rencana untuk besok?',
          now
        )
      )
    }
    for (const addition of additions) {
      if (!this.reminders.some((item) => item.dedupeKey === addition.dedupeKey)) {
        this.reminders.push(addition)
      }
    }
  }

  private emit(event: ProactiveEvent): void {
    for (const listener of this.deliveredListeners) listener(event)
  }

  private async load(): Promise<void> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, 'utf8')) as Partial<PersistedState>
      this.reminders = Array.isArray(parsed.reminders)
        ? parsed.reminders.filter(isReminder).slice(-500)
        : []
    } catch {
      this.reminders = []
      await this.persist()
    }
  }

  private async persist(): Promise<void> {
    const state: PersistedState = { version: 1, reminders: this.reminders.slice(-500) }
    const temporary = `${this.filePath}.tmp`
    await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
    await rename(temporary, this.filePath)
  }
}

function dailyReminder(
  kind: 'morning' | 'evening',
  date: string,
  title: string,
  body: string,
  now: Date
): Reminder {
  return {
    id: randomUUID(),
    kind,
    title,
    body,
    dedupeKey: `${kind}:${date}`,
    scheduledAt: now.toISOString(),
    deliveredAt: null,
    snoozedUntil: null,
    dismissedAt: null
  }
}

function localDate(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date)
}

function localTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(date)
}

function isReminder(value: unknown): value is Reminder {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return (
    typeof item.id === 'string' &&
    typeof item.kind === 'string' &&
    typeof item.title === 'string' &&
    typeof item.body === 'string' &&
    typeof item.dedupeKey === 'string' &&
    typeof item.scheduledAt === 'string'
  )
}

function policyMessage(reason: string): string {
  const messages: Record<string, string> = {
    disabled: 'Interaksi proaktif sedang dinonaktifkan.',
    'quiet-hours': 'Tes ditahan karena sedang quiet hours.',
    'daily-limit': 'Batas notifikasi harian sudah tercapai.',
    'minimum-gap': 'Tes ditahan agar notifikasi tidak terlalu rapat.',
    duplicate: 'Notifikasi duplikat ditahan.',
    fullscreen: 'Tes ditahan karena mode fullscreen/presentasi.',
    busy: 'Tes ditahan karena avatar sedang sibuk.',
    dismissed: 'Pengingat sudah ditutup.',
    snoozed: 'Pengingat masih dalam masa snooze.'
  }
  return messages[reason] ?? 'Notifikasi ditahan oleh kebijakan lokal.'
}
