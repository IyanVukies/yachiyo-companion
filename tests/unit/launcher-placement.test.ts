import { describe, expect, it } from 'vitest'

import {
  defaultLauncherPosition,
  launcherBounds,
  resolveLauncherPosition,
  snapLauncherPosition,
  type LauncherWorkArea
} from '../../src/main/windows/launcher-placement'

const primary: LauncherWorkArea = {
  id: 1,
  workArea: { x: 0, y: 0, width: 1_920, height: 1_040 }
}
const secondary: LauncherWorkArea = {
  id: 2,
  workArea: { x: -1_280, y: 80, width: 1_280, height: 984 }
}

describe('floating launcher placement', () => {
  it('starts at the right-center of the primary work area', () => {
    expect(resolveLauncherPosition(null, [primary, secondary], primary.id, 64)).toEqual({
      displayId: 1,
      x: 1_856,
      y: 488,
      snappedEdge: 'right'
    })
  })

  it('persists a valid multi-monitor position and clamps it after a resolution change', () => {
    const restored = resolveLauncherPosition(
      { displayId: 2, x: -800, y: 900, snappedEdge: null },
      [primary, secondary],
      primary.id,
      64
    )
    expect(restored).toEqual({ displayId: 2, x: -800, y: 900, snappedEdge: null })

    const resized = { ...secondary, workArea: { x: -1_024, y: 0, width: 1_024, height: 700 } }
    expect(resolveLauncherPosition(restored, [primary, resized], primary.id, 64)).toEqual({
      displayId: 2,
      x: -800,
      y: 636,
      snappedEdge: null
    })
  })

  it('uses a safe primary-display fallback when the persisted monitor is removed', () => {
    expect(
      resolveLauncherPosition(
        { displayId: 2, x: -1_200, y: 700, snappedEdge: 'left' },
        [primary],
        primary.id,
        64
      )
    ).toEqual(defaultLauncherPosition(primary, 64))
  })

  it('snaps to the nearest work-area edge without leaving the viewport', () => {
    expect(snapLauncherPosition(1_810, 400, primary, 64)).toEqual({
      displayId: 1,
      x: 1_856,
      y: 400,
      snappedEdge: 'right'
    })
    expect(snapLauncherPosition(-500, -200, primary, 64)).toEqual({
      displayId: 1,
      x: 0,
      y: 0,
      snappedEdge: 'left'
    })
  })

  it('keeps a reachable strip visible when partial edge hiding is enabled', () => {
    const position = { displayId: 1, x: 1_856, y: 488, snappedEdge: 'right' as const }
    expect(launcherBounds(position, primary, 64, true)).toEqual({
      x: 1_902,
      y: 488,
      width: 64,
      height: 64
    })
  })
})
