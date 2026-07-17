import type { AppSettings, Reminder } from './types'

export type ProactiveHistory = {
  deliveredToday: number
  lastDeliveredAt: string | null
  dedupeKeys: string[]
  fullscreen: boolean
  avatarBusy: boolean
}

export type PolicyDecision = {
  allowed: boolean
  reason:
    | 'allowed'
    | 'disabled'
    | 'quiet-hours'
    | 'daily-limit'
    | 'minimum-gap'
    | 'duplicate'
    | 'fullscreen'
    | 'busy'
    | 'dismissed'
    | 'snoozed'
}

export function evaluateProactivePolicy(
  reminder: Reminder,
  settings: AppSettings['proactive'],
  history: ProactiveHistory,
  now: Date
): PolicyDecision {
  if (!settings.enabled) return denied('disabled')
  if (reminder.dismissedAt) return denied('dismissed')
  if (reminder.snoozedUntil && new Date(reminder.snoozedUntil) > now) return denied('snoozed')
  if (isQuietTime(now, settings.quietStart, settings.quietEnd, settings.timezone)) {
    return denied('quiet-hours')
  }
  if (history.deliveredToday >= settings.dailyLimit) return denied('daily-limit')
  if (history.dedupeKeys.includes(reminder.dedupeKey)) return denied('duplicate')
  if (history.fullscreen) return denied('fullscreen')
  if (history.avatarBusy) return denied('busy')
  if (history.lastDeliveredAt) {
    const gapMs = now.getTime() - new Date(history.lastDeliveredAt).getTime()
    if (gapMs < settings.minimumGapMinutes * 60_000) return denied('minimum-gap')
  }
  return { allowed: true, reason: 'allowed' }
}

function denied(reason: Exclude<PolicyDecision['reason'], 'allowed'>): PolicyDecision {
  return { allowed: false, reason }
}

export function isQuietTime(
  now: Date,
  quietStart: string,
  quietEnd: string,
  timezone: string
): boolean {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  })
  const parts = formatter.formatToParts(now)
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0)
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0)
  const current = hour * 60 + minute
  const start = toMinutes(quietStart)
  const end = toMinutes(quietEnd)

  if (start === end) return false
  return start < end ? current >= start && current < end : current >= start || current < end
}

function toMinutes(value: string): number {
  const [hours = '0', minutes = '0'] = value.split(':')
  return Number(hours) * 60 + Number(minutes)
}
