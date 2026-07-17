// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useVoiceQueue } from '../../src/renderer/src/hooks/useVoiceQueue'
import { defaultSettings } from '../../src/shared/schemas'
import type { VoiceResult } from '../../src/shared/types'

const avatar = vi.fn()
const lipSync = vi.fn()

describe('voice queue', () => {
  beforeEach(() => {
    avatar.mockReset()
    lipSync.mockReset()
    vi.stubGlobal('Audio', FakeAudio)
    vi.stubGlobal('AudioContext', FakeAudioContext)
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 1)
    )
    vi.stubGlobal('cancelAnimationFrame', (handle: number) => window.clearTimeout(handle))
    Object.defineProperty(URL, 'createObjectURL', {
      value: vi.fn(() => 'blob:test'),
      configurable: true
    })
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true })
    Object.defineProperty(window, 'speechSynthesis', {
      value: { cancel: vi.fn(), speaking: false, getVoices: () => [], speak: vi.fn() },
      configurable: true
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('converts a long reply sentence by sentence and reports only completed WebAudio playback', async () => {
    let sequence = 0
    const synthesizeVoice = vi.fn<typeof window.yachiyo.synthesizeVoice>(
      (): Promise<VoiceResult> => {
        sequence += 1
        return Promise.resolve({
          ok: true,
          source: 'sidecar-rvc',
          mimeType: 'audio/wav',
          audioBase64: 'UklGRg==',
          message: 'Audio RVC siap.',
          fellBack: false,
          requestId: `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
          metrics: { audioDurationMs: 10 }
        })
      }
    )
    const reportVoicePlayback = vi
      .fn<typeof window.yachiyo.reportVoicePlayback>()
      .mockResolvedValue({ ok: true, message: 'verified' })
    Object.defineProperty(window, 'yachiyo', {
      value: {
        synthesizeVoice,
        reportVoicePlayback,
        stopVoice: vi.fn().mockResolvedValue({ ok: true, message: 'stopped' })
      },
      configurable: true
    })

    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Bicara' }))

    await waitFor(() => expect(reportVoicePlayback).toHaveBeenCalledTimes(3), { timeout: 3_000 })
    expect(synthesizeVoice).toHaveBeenCalledTimes(3)
    expect(synthesizeVoice.mock.calls.map(([request]) => request.text)).toEqual([
      'Kalimat pertama.',
      'Kalimat kedua?',
      'Kalimat ketiga!'
    ])
    expect(reportVoicePlayback.mock.calls.every(([report]) => report.maxLipSync > 0)).toBe(true)
    expect(avatar).toHaveBeenCalledWith('speaking')
    expect(avatar).toHaveBeenLastCalledWith('idle')
    expect(lipSync.mock.calls.some(([value]) => value > 0)).toBe(true)
  })
})

function Harness(): React.JSX.Element {
  const queue = useVoiceQueue({ onAvatarState: avatar, onLipSync: lipSync })
  return (
    <button
      type="button"
      onClick={() =>
        void queue.speak('Kalimat pertama. Kalimat kedua? Kalimat ketiga!', {
          ...defaultSettings.voice,
          mode: 'rvc'
        })
      }
    >
      Bicara
    </button>
  )
}

class FakeAudio extends EventTarget {
  paused = true

  constructor(public readonly src: string) {
    super()
  }

  play(): Promise<void> {
    this.paused = false
    window.setTimeout(() => {
      this.paused = true
      this.dispatchEvent(new Event('ended'))
    }, 8)
    return Promise.resolve()
  }

  pause(): void {
    this.paused = true
  }
}

class FakeAudioContext {
  destination = {}

  createAnalyser(): {
    fftSize: number
    readonly frequencyBinCount: number
    connect: () => void
    getByteTimeDomainData: (target: Uint8Array) => void
  } {
    return {
      fftSize: 256,
      frequencyBinCount: 4,
      connect: () => undefined,
      getByteTimeDomainData: (target) => target.set([128, 164, 92, 148])
    }
  }

  createMediaElementSource(): { connect: () => void } {
    return { connect: () => undefined }
  }

  close(): Promise<void> {
    return Promise.resolve()
  }
}
