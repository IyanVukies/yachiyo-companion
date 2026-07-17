import type { AvatarTransform } from './types'

export const DEFAULT_AVATAR_TRANSFORM: AvatarTransform = {
  scale: 1,
  positionX: 0,
  positionY: 0,
  avatarAnchor: 'bottom-center',
  avatarPositionLocked: true
}

export function clampAvatarTransform(transform: AvatarTransform): AvatarTransform {
  return {
    scale: clampFinite(transform.scale, 0.5, 2, 1),
    positionX: clampFinite(transform.positionX, -1, 1, 0),
    positionY: clampFinite(transform.positionY, -1, 1, 0),
    avatarAnchor: 'bottom-center',
    avatarPositionLocked: transform.avatarPositionLocked
  }
}

export function positionAvatarFromDrag(
  transform: AvatarTransform,
  deltaX: number,
  deltaY: number,
  viewportWidth: number,
  viewportHeight: number
): AvatarTransform {
  const safeWidth = Math.max(1, viewportWidth)
  const safeHeight = Math.max(1, viewportHeight)
  return clampAvatarTransform({
    ...transform,
    positionX: transform.positionX + deltaX / (safeWidth * 0.5),
    positionY: transform.positionY + deltaY / (safeHeight * 0.5)
  })
}

export function resetAvatarPosition(transform: AvatarTransform): AvatarTransform {
  return { ...clampAvatarTransform(transform), positionX: 0, positionY: 0 }
}

export function resetAvatarTransform(locked = true): AvatarTransform {
  return { ...DEFAULT_AVATAR_TRANSFORM, avatarPositionLocked: locked }
}

function clampFinite(value: number, minimum: number, maximum: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(maximum, Math.max(minimum, value))
}
