import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { positionAvatarFromDrag } from '@shared/avatar-transform'
import type { AvatarTransform } from '@shared/types'

type Bounds = { left: number; top: number; width: number; height: number }

type Props = {
  transform: AvatarTransform
  variant: 'live2d' | 'fallback'
  editing: boolean
  onTransformChange: (transform: AvatarTransform) => void
  onBoundsChange?: (bounds: Bounds) => void
  children: React.ReactNode
}

const MINIMUM_REACHABLE_PX = 64

export function AvatarTransformLayer({
  transform,
  variant,
  editing,
  onTransformChange,
  onBoundsChange,
  children
}: Props): React.JSX.Element {
  const layerRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{
    pointerId: number
    clientX: number
    clientY: number
    transform: AvatarTransform
    width: number
    height: number
  } | null>(null)
  const [metrics, setMetrics] = useState({ stageWidth: 1, stageHeight: 1, width: 1, height: 1 })

  useLayoutEffect(() => {
    const layer = layerRef.current
    const stage = layer?.parentElement
    if (!layer || !stage) return

    const measure = (): void => {
      const next = {
        stageWidth: Math.max(1, stage.clientWidth),
        stageHeight: Math.max(1, stage.clientHeight),
        width: Math.max(1, layer.offsetWidth),
        height: Math.max(1, layer.offsetHeight)
      }
      setMetrics((current) =>
        current.stageWidth === next.stageWidth &&
        current.stageHeight === next.stageHeight &&
        current.width === next.width &&
        current.height === next.height
          ? current
          : next
      )
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    observer.observe(layer)
    return () => observer.disconnect()
  }, [])

  const offset = safeViewportOffset(transform, metrics)

  useLayoutEffect(() => {
    const layer = layerRef.current
    if (!layer || !onBoundsChange) return
    const bounds = layer.getBoundingClientRect()
    onBoundsChange({
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height
    })
  }, [metrics, offset.x, offset.y, onBoundsChange, transform.scale])

  useEffect(() => {
    if (!editing) dragRef.current = null
  }, [editing])

  return (
    <div
      ref={layerRef}
      className="avatar-transform-layer"
      data-avatar-variant={variant}
      data-editing={editing}
      style={
        {
          '--avatar-offset-x': `${String(offset.x)}px`,
          '--avatar-offset-y': `${String(offset.y)}px`
        } as React.CSSProperties
      }
      onPointerDown={(event) => {
        if (!editing || event.button !== 0) return
        event.preventDefault()
        event.currentTarget.setPointerCapture(event.pointerId)
        dragRef.current = {
          pointerId: event.pointerId,
          clientX: event.clientX,
          clientY: event.clientY,
          transform,
          width: metrics.stageWidth,
          height: metrics.stageHeight
        }
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current
        if (!editing || drag?.pointerId !== event.pointerId) return
        event.preventDefault()
        onTransformChange(
          positionAvatarFromDrag(
            drag.transform,
            event.clientX - drag.clientX,
            event.clientY - drag.clientY,
            drag.width,
            drag.height
          )
        )
      }}
      onPointerUp={(event) => {
        if (dragRef.current?.pointerId !== event.pointerId) return
        event.preventDefault()
        dragRef.current = null
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId)
        }
      }}
      onPointerCancel={() => {
        dragRef.current = null
      }}
    >
      {children}
    </div>
  )
}

function safeViewportOffset(
  transform: AvatarTransform,
  metrics: { stageWidth: number; stageHeight: number; width: number; height: number }
): { x: number; y: number } {
  const horizontalRange = Math.max(
    0,
    metrics.stageWidth / 2 + metrics.width / 2 - MINIMUM_REACHABLE_PX
  )
  const upwardRange = Math.max(0, metrics.stageHeight - MINIMUM_REACHABLE_PX)
  const downwardRange = Math.max(0, metrics.height - MINIMUM_REACHABLE_PX)
  return {
    x: transform.positionX * horizontalRange,
    y:
      transform.positionY < 0
        ? transform.positionY * upwardRange
        : transform.positionY * downwardRange
  }
}
