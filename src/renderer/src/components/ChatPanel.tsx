import { forwardRef, useEffect, useRef } from 'react'
import { ArrowLeft, Copy, Mic, RotateCcw, Send, Square, Trash2 } from 'lucide-react'

import type { ChatMessage, NormalizedError } from '@shared/types'

type Props = {
  messages: ChatMessage[]
  draft: string
  busy: boolean
  error: NormalizedError | null
  lastUserText: string
  microphoneEnabled: boolean
  onBack: () => void
  onDraftChange: (value: string) => void
  onSend: (text: string) => void
  onStop: () => void
  onRetry: () => void
  onClear: () => void
  onPtt: () => void
}

export const ChatPanel = forwardRef<HTMLTextAreaElement, Props>(
  function ChatPanel(props, composerRef): React.JSX.Element {
    const listRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
      const list = listRef.current
      if (list) list.scrollTop = list.scrollHeight
    }, [props.messages])

    const submit = (): void => {
      const value = props.draft.trim()
      if (!value || props.busy) return
      props.onSend(value)
    }

    return (
      <section className="full-chat-view no-drag" aria-label="Chat Yachiyo">
        <header className="full-chat-header">
          <button
            className="icon-button"
            type="button"
            onClick={props.onBack}
            aria-label="Tutup chat dan kembali ke Companion Mode"
          >
            <ArrowLeft size={18} aria-hidden="true" />
          </button>
          <div>
            <span className="eyebrow">Full Chat Mode</span>
            <h2>Chat dengan Yachiyo</h2>
          </div>
          <span className="streaming-indicator" data-active={props.busy} role="status">
            {props.busy ? 'Streaming…' : 'Siap'}
          </span>
        </header>

        <div className="message-list" ref={listRef} aria-live="polite">
          {props.messages.map((message) => (
            <article className="message" data-role={message.role} key={message.id}>
              <span className="message-author">{message.role === 'user' ? 'Kamu' : 'Yachiyo'}</span>
              <p>{message.content || (props.busy && message.role === 'assistant' ? '…' : '')}</p>
              {message.role === 'assistant' && message.content ? (
                <button
                  className="message-copy"
                  type="button"
                  onClick={() => void window.yachiyo.writeClipboard(message.content)}
                  aria-label="Salin jawaban"
                >
                  <Copy size={13} aria-hidden="true" />
                  Salin
                </button>
              ) : null}
            </article>
          ))}
        </div>

        {props.error ? (
          <div className="plain-error" role="alert">
            <strong>{props.error.title}</strong>
            <span>{props.error.message}</span>
            <small>Data lokal aman. {props.error.nextAction}</small>
          </div>
        ) : null}

        <div className="composer">
          <textarea
            ref={composerRef}
            value={props.draft}
            onChange={(event) => props.onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                submit()
              }
            }}
            maxLength={20_000}
            rows={2}
            placeholder="Tulis pesan…"
            aria-label="Pesan untuk Yachiyo"
          />
          <div className="composer-actions">
            <button
              className="icon-button"
              type="button"
              onClick={props.onPtt}
              aria-label="Push-to-talk"
              title={
                props.microphoneEnabled
                  ? 'Endpoint STT belum tersedia; teks tetap dapat digunakan.'
                  : 'Aktifkan mikrofon di Pengaturan Privasi.'
              }
            >
              <Mic size={17} aria-hidden="true" />
            </button>
            {props.busy ? (
              <button className="send-button is-stop" type="button" onClick={props.onStop}>
                <Square size={14} fill="currentColor" aria-hidden="true" />
                Stop
              </button>
            ) : (
              <button
                className="send-button"
                type="button"
                onClick={submit}
                disabled={!props.draft.trim()}
              >
                <Send size={15} aria-hidden="true" />
                Kirim
              </button>
            )}
          </div>
        </div>

        <footer className="sheet-footer chat-footer">
          <button
            type="button"
            onClick={props.onRetry}
            disabled={!props.lastUserText || props.busy}
          >
            <RotateCcw size={14} aria-hidden="true" />
            Coba lagi
          </button>
          <button type="button" onClick={props.onClear} disabled={props.busy}>
            <Trash2 size={14} aria-hidden="true" />
            Bersihkan
          </button>
          <span>Enter kirim · Shift+Enter baris baru</span>
        </footer>
      </section>
    )
  }
)
