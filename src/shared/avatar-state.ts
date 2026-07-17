import type { AvatarState } from './types'

const TRANSIENT_STATES = new Set<AvatarState>([
  'happy',
  'concerned',
  'confused',
  'reminder',
  'success',
  'error'
])

export type AvatarStateModel = {
  current: AvatarState
  previous: AvatarState
  lipSync: number
}

export type AvatarAction =
  | { type: 'transition'; state: AvatarState }
  | { type: 'lip-sync'; value: number }
  | { type: 'settle' }
  | { type: 'reset' }

export const initialAvatarState: AvatarStateModel = {
  current: 'idle',
  previous: 'idle',
  lipSync: 0
}

export function avatarReducer(state: AvatarStateModel, action: AvatarAction): AvatarStateModel {
  switch (action.type) {
    case 'transition':
      return {
        current: action.state,
        previous: state.current,
        lipSync: action.state === 'speaking' ? state.lipSync : 0
      }
    case 'lip-sync':
      return { ...state, lipSync: Math.min(1, Math.max(0, action.value)) }
    case 'settle':
      return TRANSIENT_STATES.has(state.current)
        ? { current: 'idle', previous: state.current, lipSync: 0 }
        : state
    case 'reset':
      return initialAvatarState
  }
}
