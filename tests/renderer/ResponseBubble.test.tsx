// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ResponseBubble } from '../../src/renderer/src/components/ResponseBubble'
import { placeResponseBubble } from '../../src/renderer/src/components/response-bubble-placement'

describe('companion response bubble', () => {
  it('prefers the right of the avatar head when that space is available', () => {
    const position = placeResponseBubble(
      { width: 800, headerBottom: 68, availableBottom: 650 },
      { left: 180, top: 100, width: 220, height: 480 },
      { width: 240, height: 120 }
    )

    expect(position.left).toBeGreaterThan(290)
    expect(position.top).toBeGreaterThanOrEqual(80)
    expect(position.top + 120).toBeLessThanOrEqual(638)
  })

  it('streams visible text, opens full chat, and can be dismissed without blocking the stage', () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(): void {
          return undefined
        }
        disconnect(): void {
          return undefined
        }
      }
    )
    const open = vi.fn()
    const message = {
      id: '20000000-0000-4000-8000-000000000001',
      role: 'assistant' as const,
      content: 'Jawaban Hermes yang sedang tampil pada companion.',
      createdAt: '2026-07-18T00:00:00.000Z'
    }
    render(
      <ResponseBubble
        message={message}
        avatarBounds={null}
        availableBottom={600}
        streaming
        onOpenConversation={open}
      />
    )

    const bubble = screen.getByLabelText('Respons terbaru Yachiyo')
    expect(bubble).toHaveAttribute('data-streaming', 'true')
    expect(bubble).toHaveTextContent(message.content)
    fireEvent.click(screen.getByRole('button', { name: 'Buka percakapan' }))
    expect(open).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Tutup respons' }))
    expect(screen.queryByLabelText('Respons terbaru Yachiyo')).not.toBeInTheDocument()
    vi.unstubAllGlobals()
  })
})
