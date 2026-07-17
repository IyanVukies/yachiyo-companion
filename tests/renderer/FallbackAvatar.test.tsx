// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { FallbackAvatar } from '../../src/renderer/src/components/FallbackAvatar'

describe('fallback avatar', () => {
  it('is keyboard-accessible and reflects animation state', () => {
    const activate = vi.fn()
    render(<FallbackAvatar state="speaking" lipSync={0.8} scale={1.2} onActivate={activate} />)
    const avatar = screen.getByRole('button', { name: 'Buka chat dengan Yachiyo' })

    expect(avatar).toHaveAttribute('data-state', 'speaking')
    expect(avatar).toHaveAttribute('data-mouth', '3')
    expect(avatar).toHaveAttribute('data-scale', 'large')
    expect(avatar).toHaveStyle({ '--fallback-avatar-scale': '1.2' })
    fireEvent.click(avatar)
    expect(activate).toHaveBeenCalledOnce()
  })
})
