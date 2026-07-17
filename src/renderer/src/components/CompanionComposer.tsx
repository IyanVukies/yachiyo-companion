import { forwardRef } from 'react'
import { Maximize2, Mic, Send, Square } from 'lucide-react'

import type { AvatarState } from '@shared/types'

type Props = {
  draft: string
  busy: boolean
  microphoneEnabled: boolean
  state: AvatarState
  speaking: boolean
  onDraftChange: (value: string) => void
  onSend: () => void
  onStop: () => void
  onPtt: () => void
  onOpenFullChat: () => void
  onFocus?: () => void
}

export const CompanionComposer = forwardRef<HTMLTextAreaElement, Props>(
  function CompanionComposer(props, ref): React.JSX.Element {
    const status = statusLabel(props.state, props.speaking)
    return (
      <section className="companion-composer no-drag" aria-label="Pesan ringkas untuk Yachiyo">
        <div className="companion-composer-status" role="status" aria-live="polite">
          <i data-state={status.key} aria-hidden="true" />
          <span>{status.label}</span>
        </div>
        <textarea
          ref={ref}
          value={props.draft}
          onChange={(event) => props.onDraftChange(event.target.value)}
          onFocus={props.onFocus}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              props.onSend()
            }
          }}
          maxLength={20_000}
          rows={1}
          placeholder="Tulis pesan singkat…"
          aria-label="Pesan ringkas untuk Yachiyo"
        />
        <div className="companion-composer-actions">
          <button
            className="icon-button"
            type="button"
            onClick={props.onPtt}
            aria-label="Mikrofon"
            title={
              props.microphoneEnabled
                ? 'Endpoint STT belum tersedia; teks tetap dapat digunakan.'
                : 'Aktifkan mikrofon di Pengaturan Privasi.'
            }
          >
            <Mic size={16} aria-hidden="true" />
          </button>
          <button
            className="icon-button"
            type="button"
            onClick={props.onOpenFullChat}
            aria-label="Buka percakapan lengkap"
            title="Buka percakapan lengkap"
          >
            <Maximize2 size={16} aria-hidden="true" />
          </button>
          {props.busy ? (
            <button className="compact-send is-stop" type="button" onClick={props.onStop}>
              <Square size={12} fill="currentColor" aria-hidden="true" />
              Stop
            </button>
          ) : (
            <button
              className="compact-send"
              type="button"
              onClick={props.onSend}
              disabled={!props.draft.trim()}
            >
              <Send size={14} aria-hidden="true" />
              Kirim
            </button>
          )}
        </div>
      </section>
    )
  }
)

function statusLabel(
  state: AvatarState,
  speaking: boolean
): { key: 'idle' | 'listening' | 'thinking' | 'speaking'; label: string } {
  if (speaking || state === 'speaking') return { key: 'speaking', label: 'Sedang berbicara' }
  if (state === 'listening') return { key: 'listening', label: 'Mendengarkan' }
  if (state === 'thinking') return { key: 'thinking', label: 'Hermes sedang berpikir' }
  return { key: 'idle', label: 'Siap' }
}
