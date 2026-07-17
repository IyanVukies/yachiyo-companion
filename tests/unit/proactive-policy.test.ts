import { describe, expect, it } from 'vitest'

import { evaluateProactivePolicy, isQuietTime } from '../../src/shared/proactive-policy'
import { defaultSettings } from '../../src/shared/schemas'
import type { ProactiveHistory, PolicyDecision } from '../../src/shared/proactive-policy'
import type { Reminder } from '../../src/shared/types'

const middayJakarta = new Date('2026-07-17T05:00:00.000Z')
const midnightJakarta = new Date('2026-07-17T17:30:00.000Z')

describe('proactive interaction policy', () => {
  it('handles quiet hours that cross midnight in Asia/Jakarta', () => {
    expect(isQuietTime(midnightJakarta, '23:00', '07:00', 'Asia/Jakarta')).toBe(true)
    expect(isQuietTime(middayJakarta, '23:00', '07:00', 'Asia/Jakarta')).toBe(false)
  })

  it.each<[string, Partial<ProactiveHistory>, Partial<Reminder>, PolicyDecision['reason']]>([
    ['daily limit', { deliveredToday: 5 }, {}, 'daily-limit'],
    ['duplicate', { dedupeKeys: ['test:key'] }, {}, 'duplicate'],
    ['fullscreen', { fullscreen: true }, {}, 'fullscreen'],
    ['avatar busy', { avatarBusy: true }, {}, 'busy'],
    ['dismissed', {}, { dismissedAt: middayJakarta.toISOString() }, 'dismissed'],
    [
      'snoozed',
      {},
      { snoozedUntil: new Date(middayJakarta.getTime() + 60_000).toISOString() },
      'snoozed'
    ]
  ])('denies %s locally', (_name, historyPatch, reminderPatch, reason) => {
    const decision = evaluateProactivePolicy(
      { ...reminder(), ...reminderPatch },
      defaultSettings.proactive,
      { ...history(), ...historyPatch },
      middayJakarta
    )

    expect(decision).toEqual({ allowed: false, reason })
  })

  it('allows a unique, spaced notification during active hours', () => {
    expect(
      evaluateProactivePolicy(reminder(), defaultSettings.proactive, history(), middayJakarta)
    ).toEqual({ allowed: true, reason: 'allowed' })
  })
})

function reminder(): Reminder {
  return {
    id: crypto.randomUUID(),
    kind: 'custom',
    title: 'Tes',
    body: 'Isi tes',
    dedupeKey: 'test:key',
    scheduledAt: middayJakarta.toISOString(),
    deliveredAt: null,
    snoozedUntil: null,
    dismissedAt: null
  }
}

function history(): ProactiveHistory {
  return {
    deliveredToday: 0,
    lastDeliveredAt: null,
    dedupeKeys: [],
    fullscreen: false,
    avatarBusy: false
  }
}
