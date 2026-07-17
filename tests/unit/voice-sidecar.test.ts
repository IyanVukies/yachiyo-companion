import { afterEach, describe, expect, it, vi } from 'vitest'

import { VoiceSidecar } from '../../src/main/services/voice-sidecar'
import { defaultSettings } from '../../src/shared/schemas'

describe('VoiceSidecar fallback and playback proof', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('falls back to Basic TTS when RVC returns an error without throwing into Electron', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{"error":"rvc_conversion_failed"}', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(Uint8Array.from([0x49, 0x44, 0x33, 0x01]), {
          status: 200,
          headers: { 'Content-Type': 'audio/mpeg' }
        })
      )
    vi.stubGlobal('fetch', fetchMock)
    const sidecar = readySidecar()

    const result = await sidecar.synthesize({
      text: 'Halo dalam bahasa Indonesia.',
      mode: 'rvc',
      voice: defaultSettings.voice.ttsVoice,
      speed: 1,
      pitch: 0,
      rvc: defaultSettings.voice.rvc
    })

    expect(result.ok).toBe(true)
    expect(result.source).toBe('sidecar-basic')
    expect(result.fellBack).toBe(true)
    expect(result.audioBase64).toBe('SUQzAQ==')
    expect(result.message).toContain('Basic TTS dipakai otomatis')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('rejects renderer playback reports that were not issued by this sidecar instance', () => {
    const sidecar = readySidecar()
    expect(
      sidecar.reportPlayback({
        requestId: '00000000-0000-4000-8000-000000000220',
        durationMs: 100,
        maxLipSync: 0.5
      })
    ).toEqual({ ok: false, message: 'Laporan playback tidak dikenali.' })
  })
})

function readySidecar(): VoiceSidecar {
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
  const sidecar = new VoiceSidecar('.', '.', '.', '.', logger as never)
  const mutable = sidecar as unknown as {
    state: 'ready'
    health: {
      rvc: boolean
      edge_tts: boolean
      ffmpeg: boolean
      ffprobe: boolean
      runtime: {
        state: 'ready'
        stage: string
        progress: number
        downloadedBytes: number
        totalBytes: number
        currentAsset: null
        error: null
        assets: Record<string, never>
      }
    }
    token: string
    port: number
  }
  mutable.state = 'ready'
  mutable.health = {
    rvc: true,
    edge_tts: true,
    ffmpeg: true,
    ffprobe: true,
    runtime: {
      state: 'ready',
      stage: 'Runtime RVC siap.',
      progress: 100,
      downloadedBytes: 558_749_677,
      totalBytes: 558_749_677,
      currentAsset: null,
      error: null,
      assets: {}
    }
  }
  mutable.token = 'test-token'
  mutable.port = 49152
  return sidecar
}
