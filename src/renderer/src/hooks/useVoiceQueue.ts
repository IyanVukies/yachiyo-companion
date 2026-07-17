import { useCallback, useEffect, useRef, useState } from 'react'

import { splitSentenceChunks } from '@shared/text'
import type { AppSettings, AvatarState, VoiceResult } from '@shared/types'

type VoiceQueueOptions = {
  onAvatarState: (state: AvatarState) => void
  onLipSync: (value: number) => void
}

export function useVoiceQueue({ onAvatarState, onLipSync }: VoiceQueueOptions): {
  speaking: boolean
  speak: (text: string, voice: AppSettings['voice']) => Promise<void>
  stop: () => void
} {
  const [speaking, setSpeaking] = useState(false)
  const generation = useRef(0)
  const audio = useRef<HTMLAudioElement | null>(null)
  const animationFrame = useRef<number | null>(null)

  const stop = useCallback(() => {
    generation.current += 1
    audio.current?.pause()
    audio.current = null
    if (animationFrame.current !== null) cancelAnimationFrame(animationFrame.current)
    animationFrame.current = null
    window.speechSynthesis.cancel()
    onLipSync(0)
    onAvatarState('idle')
    setSpeaking(false)
    void window.yachiyo.stopVoice()
  }, [onAvatarState, onLipSync])

  const speak = useCallback(
    async (text: string, voice: AppSettings['voice']): Promise<void> => {
      stop()
      if (voice.mode === 'disabled') return
      const token = generation.current
      const chunks = splitSentenceChunks(text, 260)
      setSpeaking(true)
      onAvatarState('speaking')
      try {
        for (const chunk of chunks) {
          if (token !== generation.current) return
          const result = await window.yachiyo.synthesizeVoice({
            text: chunk,
            mode: voice.mode,
            voice: voice.ttsVoice,
            speed: voice.speed,
            pitch: voice.pitch,
            rvc: voice.rvc
          })
          if (token !== generation.current) return
          await playResult(
            result,
            chunk,
            voice,
            token,
            generation,
            audio,
            animationFrame,
            onLipSync
          )
        }
      } finally {
        if (token === generation.current) {
          onLipSync(0)
          onAvatarState('idle')
          setSpeaking(false)
        }
      }
    },
    [onAvatarState, onLipSync, stop]
  )

  useEffect(() => stop, [stop])
  return { speaking, speak, stop }
}

async function playResult(
  result: VoiceResult,
  text: string,
  voice: AppSettings['voice'],
  token: number,
  generation: React.RefObject<number>,
  audioRef: React.RefObject<HTMLAudioElement | null>,
  frameRef: React.RefObject<number | null>,
  onLipSync: (value: number) => void
): Promise<void> {
  if (result.source === 'browser-basic' || !result.audioBase64 || !result.mimeType) {
    await playBrowserSpeech(text, voice, token, generation, frameRef, onLipSync)
    return
  }
  const bytes = Uint8Array.from(atob(result.audioBase64), (character) => character.charCodeAt(0))
  const url = URL.createObjectURL(new Blob([bytes], { type: result.mimeType }))
  try {
    await playAudioElement(url, token, generation, audioRef, frameRef, onLipSync)
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function playAudioElement(
  url: string,
  token: number,
  generation: React.RefObject<number>,
  audioRef: React.RefObject<HTMLAudioElement | null>,
  frameRef: React.RefObject<number | null>,
  onLipSync: (value: number) => void
): Promise<void> {
  const element = new Audio(url)
  audioRef.current = element
  let context: AudioContext | null = null
  try {
    context = new AudioContext()
    const analyser = context.createAnalyser()
    analyser.fftSize = 256
    context.createMediaElementSource(element).connect(analyser)
    analyser.connect(context.destination)
    const samples = new Uint8Array(analyser.frequencyBinCount)
    const update = (): void => {
      if (token !== generation.current || element.paused) return
      analyser.getByteTimeDomainData(samples)
      let sum = 0
      for (const value of samples) {
        const normalized = (value - 128) / 128
        sum += normalized * normalized
      }
      onLipSync(Math.min(1, Math.sqrt(sum / samples.length) * 4.2))
      frameRef.current = requestAnimationFrame(update)
    }
    await element.play()
    update()
    await new Promise<void>((resolvePromise, reject) => {
      element.addEventListener('ended', () => resolvePromise(), { once: true })
      element.addEventListener('error', () => reject(new Error('Audio tidak dapat diputar.')), {
        once: true
      })
    })
  } finally {
    element.pause()
    audioRef.current = null
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
    onLipSync(0)
    await context?.close().catch(() => undefined)
  }
}

async function playBrowserSpeech(
  text: string,
  voice: AppSettings['voice'],
  token: number,
  generation: React.RefObject<number>,
  frameRef: React.RefObject<number | null>,
  onLipSync: (value: number) => void
): Promise<void> {
  if (!('speechSynthesis' in window)) return
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'id-ID'
  utterance.rate = voice.speed
  utterance.pitch = Math.min(2, Math.max(0, 1 + voice.pitch / 50))
  utterance.volume = voice.volume
  const matchingVoice = window.speechSynthesis
    .getVoices()
    .find((candidate) => candidate.lang.toLowerCase().startsWith('id'))
  if (matchingVoice) utterance.voice = matchingVoice

  const startedAt = performance.now()
  const animate = (): void => {
    if (token !== generation.current || !window.speechSynthesis.speaking) return
    const phase = (performance.now() - startedAt) / 90
    onLipSync(0.18 + Math.abs(Math.sin(phase)) * 0.62)
    frameRef.current = requestAnimationFrame(animate)
  }
  await new Promise<void>((resolvePromise) => {
    utterance.onstart = animate
    utterance.onend = () => resolvePromise()
    utterance.onerror = () => resolvePromise()
    window.speechSynthesis.speak(utterance)
  })
  if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
  frameRef.current = null
  onLipSync(0)
}
