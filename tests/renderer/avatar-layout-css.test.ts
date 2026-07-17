import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const stylesheet = readFileSync(
  new URL('../../src/renderer/src/styles.css', import.meta.url),
  'utf8'
)

describe('avatar layout CSS contract', () => {
  it('gives the Live2D transform layer a stage-relative size', () => {
    const rule = cssRule(".avatar-transform-layer[data-avatar-variant='live2d']")

    expect(rule).toContain('width: min(94%, 430px)')
    expect(rule).toContain('height: min(92%, 590px)')
  })

  it('keeps the Live2D element and canvas sized by their non-zero transform layer', () => {
    const avatarRule = cssRule('.live2d-avatar')
    const canvasRule = cssRule('.live2d-avatar canvas')

    expect(avatarRule).toContain('width: 100%')
    expect(avatarRule).toContain('height: 100%')
    expect(avatarRule).toContain('margin-top: 0')
    expect(canvasRule).toContain('width: 100%')
    expect(canvasRule).toContain('height: 100%')
  })
})

function cssRule(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`).exec(stylesheet)

  if (!match?.[1]) throw new Error(`CSS rule not found: ${selector}`)
  return match[1]
}
