import { describe, expect, it } from 'vitest'

import { avatarReducer, initialAvatarState } from '../../src/shared/avatar-state'

describe('avatar state reducer', () => {
  it('tracks the previous state on transitions', () => {
    const thinking = avatarReducer(initialAvatarState, {
      type: 'transition',
      state: 'thinking'
    })
    const speaking = avatarReducer(thinking, { type: 'transition', state: 'speaking' })

    expect(thinking).toMatchObject({ current: 'thinking', previous: 'idle' })
    expect(speaking).toMatchObject({ current: 'speaking', previous: 'thinking' })
  })

  it('clamps lip-sync values and clears them outside speaking', () => {
    const speaking = avatarReducer(initialAvatarState, {
      type: 'transition',
      state: 'speaking'
    })
    const open = avatarReducer(speaking, { type: 'lip-sync', value: 3 })
    const idle = avatarReducer(open, { type: 'transition', state: 'idle' })

    expect(open.lipSync).toBe(1)
    expect(idle.lipSync).toBe(0)
  })

  it('settles transient emotions but preserves persistent states', () => {
    const happy = avatarReducer(initialAvatarState, { type: 'transition', state: 'happy' })
    const thinking = avatarReducer(initialAvatarState, {
      type: 'transition',
      state: 'thinking'
    })

    expect(avatarReducer(happy, { type: 'settle' }).current).toBe('idle')
    expect(avatarReducer(thinking, { type: 'settle' })).toBe(thinking)
  })
})
