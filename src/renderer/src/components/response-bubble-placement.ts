export type AvatarBounds = { left: number; top: number; width: number; height: number }

export function placeResponseBubble(
  viewport: { width: number; headerBottom: number; availableBottom: number },
  avatar: AvatarBounds | null,
  bubble: { width: number; height: number }
): { left: number; top: number } {
  const margin = 12
  const minimumTop = viewport.headerBottom + margin
  const maximumLeft = Math.max(margin, viewport.width - bubble.width - margin)
  const maximumTop = Math.max(minimumTop, viewport.availableBottom - bubble.height - margin)
  const clamp = (candidate: { left: number; top: number }): { left: number; top: number } => ({
    left: Math.min(maximumLeft, Math.max(margin, candidate.left)),
    top: Math.min(maximumTop, Math.max(minimumTop, candidate.top))
  })
  if (!avatar) return clamp({ left: maximumLeft, top: minimumTop })

  const headX = avatar.left + avatar.width / 2
  const headY = avatar.top + avatar.height * 0.26
  const headRadius = Math.min(74, avatar.width * 0.2)
  const fallback = { left: maximumLeft, top: maximumTop }
  const candidates = [
    { left: headX + headRadius, top: headY - bubble.height * 0.24 },
    { left: headX - headRadius - bubble.width, top: headY - bubble.height * 0.24 },
    fallback,
    { left: margin, top: minimumTop }
  ]
  const fitting = candidates.find(
    ({ left, top }) =>
      left >= margin &&
      left + bubble.width <= viewport.width - margin &&
      top >= minimumTop &&
      top + bubble.height <= viewport.availableBottom - margin
  )
  return clamp(fitting ?? fallback)
}
