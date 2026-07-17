import type { LauncherPosition } from '../../shared/types'

export type LauncherWorkArea = {
  id: number
  workArea: {
    x: number
    y: number
    width: number
    height: number
  }
}

export type LauncherBounds = {
  x: number
  y: number
  width: number
  height: number
}

const PARTIAL_VISIBLE_SIZE = 18

export function resolveLauncherPosition(
  saved: LauncherPosition | null,
  displays: readonly LauncherWorkArea[],
  primaryDisplayId: number,
  size: number
): LauncherPosition {
  const display = selectDisplay(saved?.displayId, displays, primaryDisplayId)
  if (!display) {
    return { displayId: primaryDisplayId, x: 0, y: 0, snappedEdge: null }
  }
  if (saved?.displayId !== display.id) return defaultLauncherPosition(display, size)

  const clamped = clampCoordinates(saved.x, saved.y, display, size)
  return saved.snappedEdge
    ? positionAtEdge(clamped.x, clamped.y, saved.snappedEdge, display, size)
    : { displayId: display.id, ...clamped, snappedEdge: null }
}

export function clampLauncherPosition(
  position: LauncherPosition,
  display: LauncherWorkArea,
  size: number
): LauncherPosition {
  const clamped = clampCoordinates(position.x, position.y, display, size)
  return {
    displayId: display.id,
    ...clamped,
    snappedEdge: position.snappedEdge
  }
}

export function snapLauncherPosition(
  x: number,
  y: number,
  display: LauncherWorkArea,
  size: number
): LauncherPosition {
  const clamped = clampCoordinates(x, y, display, size)
  const area = display.workArea
  const maximumX = maxCoordinate(area.x, area.width, size)
  const maximumY = maxCoordinate(area.y, area.height, size)
  const distances = [
    { edge: 'left' as const, distance: Math.abs(clamped.x - area.x) },
    { edge: 'right' as const, distance: Math.abs(maximumX - clamped.x) },
    { edge: 'top' as const, distance: Math.abs(clamped.y - area.y) },
    { edge: 'bottom' as const, distance: Math.abs(maximumY - clamped.y) }
  ]
  distances.sort((left, right) => left.distance - right.distance)
  const edge = distances[0]?.edge ?? 'right'
  return positionAtEdge(clamped.x, clamped.y, edge, display, size)
}

export function launcherBounds(
  position: LauncherPosition,
  display: LauncherWorkArea,
  size: number,
  autoHidePartially: boolean
): LauncherBounds {
  const safe = clampLauncherPosition(position, display, size)
  if (!autoHidePartially || !safe.snappedEdge) {
    return { x: safe.x, y: safe.y, width: size, height: size }
  }

  const visible = Math.min(size, PARTIAL_VISIBLE_SIZE)
  const area = display.workArea
  const partiallyHidden = { x: safe.x, y: safe.y }
  if (safe.snappedEdge === 'left') partiallyHidden.x = area.x - size + visible
  if (safe.snappedEdge === 'right') partiallyHidden.x = area.x + area.width - visible
  if (safe.snappedEdge === 'top') partiallyHidden.y = area.y - size + visible
  if (safe.snappedEdge === 'bottom') partiallyHidden.y = area.y + area.height - visible
  return { ...partiallyHidden, width: size, height: size }
}

export function defaultLauncherPosition(display: LauncherWorkArea, size: number): LauncherPosition {
  const area = display.workArea
  return {
    displayId: display.id,
    x: maxCoordinate(area.x, area.width, size),
    y: Math.round(area.y + Math.max(0, area.height - size) / 2),
    snappedEdge: 'right'
  }
}

function selectDisplay(
  savedDisplayId: number | undefined,
  displays: readonly LauncherWorkArea[],
  primaryDisplayId: number
): LauncherWorkArea | undefined {
  return (
    displays.find((display) => display.id === savedDisplayId) ??
    displays.find((display) => display.id === primaryDisplayId) ??
    displays[0]
  )
}

function clampCoordinates(
  x: number,
  y: number,
  display: LauncherWorkArea,
  size: number
): { x: number; y: number } {
  const area = display.workArea
  return {
    x: clampInteger(x, area.x, maxCoordinate(area.x, area.width, size)),
    y: clampInteger(y, area.y, maxCoordinate(area.y, area.height, size))
  }
}

function positionAtEdge(
  x: number,
  y: number,
  edge: NonNullable<LauncherPosition['snappedEdge']>,
  display: LauncherWorkArea,
  size: number
): LauncherPosition {
  const area = display.workArea
  const clamped = clampCoordinates(x, y, display, size)
  if (edge === 'left') clamped.x = area.x
  if (edge === 'right') clamped.x = maxCoordinate(area.x, area.width, size)
  if (edge === 'top') clamped.y = area.y
  if (edge === 'bottom') clamped.y = maxCoordinate(area.y, area.height, size)
  return { displayId: display.id, ...clamped, snappedEdge: edge }
}

function maxCoordinate(origin: number, span: number, size: number): number {
  return origin + Math.max(0, span - size)
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(Math.round(value), minimum), maximum)
}
