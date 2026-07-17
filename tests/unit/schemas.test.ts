import { describe, expect, it } from 'vitest'

import {
  chatStartSchema,
  defaultSettings,
  settingsSchema,
  voiceRequestSchema
} from '../../src/shared/schemas'

describe('IPC boundary schemas', () => {
  it('accepts the safe mock-first defaults', () => {
    const parsed = settingsSchema.parse(defaultSettings)

    expect(parsed.connection.mode).toBe('mock')
    expect(parsed.privacy.microphoneEnabled).toBe(false)
    expect(parsed.privacy.saveConversation).toBe(false)
  })

  it('rejects unknown settings keys', () => {
    expect(() => settingsSchema.parse({ ...defaultSettings, debugShell: true })).toThrow()
  })

  it('rejects malformed request IDs and oversized messages', () => {
    expect(() =>
      chatStartSchema.parse({
        requestId: 'not-a-uuid',
        messages: [{ role: 'user', content: 'halo' }]
      })
    ).toThrow()
    expect(() =>
      chatStartSchema.parse({
        requestId: crypto.randomUUID(),
        messages: [{ role: 'user', content: 'x'.repeat(20_001) }]
      })
    ).toThrow()
  })

  it('constrains RVC controls to the documented safe range', () => {
    expect(() =>
      voiceRequestSchema.parse({
        text: 'halo',
        mode: 'rvc',
        voice: 'id-ID-GadisNeural',
        speed: 1,
        pitch: 0,
        rvc: {
          ...defaultSettings.voice.rvc,
          pitch: 99
        }
      })
    ).toThrow()
  })
})
