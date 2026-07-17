import { useEffect, useRef, useState } from 'react'
import { Copy, Mic, RotateCcw, Send, Square, Trash2, X } from 'lucide-react'

import type { ChatMessage, NormalizedError } from '@shared/types'

type Props = {
  messages: ChatMessage[]
  busy: boolean
  error: NormalizedError | null
  lastUserText: string
  microphoneEnabled: boolean
  onClose: () => void
  onSend: (text: string) => void
  onStop: () => void
  onRetry: () => void
  onClear: () => void
  onPtt: () => void
}

export function ChatPanel(props: Props): React.JSX.Element {
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const list = listRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [props.messages])

  const submit = (): void => {
    const value = draft.trim()
    if (!value || props.busy) return
    setDraft('')
    props.onSend(value)
  }

  return (
    <section className="sheet chat-sheet no-drag" aria-label="Chat Yachiyo">
      <header className="sheet-header">
        <div>
          <span className="eyebrow">Percakapan</span>
          <h2>Chat dengan Yachiyo</h2>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={props.onClose}
          aria-label="Tutup chat"
        >
          <X size={18} aria-hidden="true" />
        </button>
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
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
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
          disabled={props.busy}
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
            <button className="send-button" type="button" onClick={submit} disabled={!draft.trim()}>
              <Send size={15} aria-hidden="true" />
              Kirim
            </button>
          )}
        </div>
      </div>

      <footer className="sheet-footer chat-footer">
        <button type="button" onClick={props.onRetry} disabled={!props.lastUserText || props.busy}>
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
