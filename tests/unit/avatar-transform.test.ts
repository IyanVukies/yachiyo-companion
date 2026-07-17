import { describe, expect, it } from 'vitest'

import {
  clampAvatarTransform,
  positionAvatarFromDrag,
  resetAvatarPosition,
  resetAvatarTransform
} from '../../src/shared/avatar-transform'

describe('avatar transform safety', () => {
  it('clamps scale and normalized coordinates to the safe viewport range', () => {
    expect(
      clampAvatarTransform({
        scale: 9,
        positionX: 4,
        positionY: -3,
        avatarAnchor: 'bottom-center',
        avatarPositionLocked: false
      })
    ).toEqual({
      scale: 2,
      positionX: 1,
      positionY: -1,
      avatarAnchor: 'bottom-center',
      avatarPositionLocked: false
    })
  })

  it('stores drag movement as normalized coordinates and remains safe after resize', () => {
    const moved = positionAvatarFromDrag(resetAvatarTransform(false), 115, -180, 460, 720)
    expect(moved.positionX).toBeCloseTo(0.5)
    expect(moved.positionY).toBeCloseTo(-0.5)

    const resized = positionAvatarFromDrag(moved, 4_000, 4_000, 390, 600)
    expect(resized.positionX).toBe(1)
    expect(resized.positionY).toBe(1)
  })

  it('resets position independently from scale and can reset the complete transform', () => {
    const transformed = {
      scale: 1.7,
      positionX: 0.8,
      positionY: -0.4,
      avatarAnchor: 'bottom-center' as const,
      avatarPositionLocked: false
    }
    expect(resetAvatarPosition(transformed)).toMatchObject({
      scale: 1.7,
      positionX: 0,
      positionY: 0,
      avatarPositionLocked: false
    })
    expect(resetAvatarTransform()).toMatchObject({
      scale: 1,
      positionX: 0,
      positionY: 0,
      avatarPositionLocked: true
    })
  })
})
