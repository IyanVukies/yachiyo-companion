import { useLayoutEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, MessageCircleMore, X } from 'lucide-react'

import type { ChatMessage } from '@shared/types'

import { placeResponseBubble, type AvatarBounds } from './response-bubble-placement'

type Props = {
  message: ChatMessage | null
  avatarBounds: AvatarBounds | null
  availableBottom: number
  streaming: boolean
  onOpenConversation: () => void
}

export function ResponseBubble({
  message,
  avatarBounds,
  availableBottom,
  streaming,
  onOpenConversation
}: Props): React.JSX.Element | null {
  const bubbleRef = useRef<HTMLElement>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [dismissedId, setDismissedId] = useState<string | null>(null)
  const [position, setPosition] = useState({ left: 16, top: 88 })
  const expanded = expandedId !== null && expandedId === message?.id

  useLayoutEffect(() => {
    const bubble = bubbleRef.current
    if (!bubble || !message) return
    const place = (): void => {
      const rect = bubble.getBoundingClientRect()
      const next = placeResponseBubble(
        { width: window.innerWidth, headerBottom: 68, availableBottom },
        avatarBounds,
        { width: rect.width, height: rect.height }
      )
      setPosition((current) =>
        current.left === next.left && current.top === next.top ? current : next
      )
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(bubble)
    window.addEventListener('resize', place)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', place)
    }
  }, [availableBottom, avatarBounds, expanded, message])

  if (!message?.content.trim() || dismissedId === message.id) return null
  const longResponse = message.content.length > 180 || message.content.split('\n').length > 4

  return (
    <aside
      ref={bubbleRef}
      className="response-bubble no-drag"
      data-expanded={expanded}
      data-streaming={streaming}
      style={{ left: position.left, top: position.top }}
      aria-label="Respons terbaru Yachiyo"
    >
      <div className="response-bubble-heading">
        <span>{streaming ? 'Yachiyo sedang menjawab…' : 'Yachiyo'}</span>
        <button type="button" onClick={() => setDismissedId(message.id)} aria-label="Tutup respons">
          <X size={13} aria-hidden="true" />
        </button>
      </div>
      <p aria-live="polite">{message.content}</p>
      <div className="response-bubble-actions">
        {longResponse ? (
          <button type="button" onClick={() => setExpandedId(expanded ? null : message.id)}>
            {expanded ? (
              <ChevronUp size={13} aria-hidden="true" />
            ) : (
              <ChevronDown size={13} aria-hidden="true" />
            )}
            {expanded ? 'Ringkas' : 'Perluas'}
          </button>
        ) : null}
        <button type="button" onClick={onOpenConversation}>
          <MessageCircleMore size={13} aria-hidden="true" />
          Buka percakapan
        </button>
      </div>
    </aside>
  )
}
