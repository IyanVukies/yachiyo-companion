import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

import type { AvatarState } from '@shared/types'

export type Live2DAvatarHandle = {
  setExpression: (name: string) => boolean
  startMotion: (group: string, index: number) => boolean
}

type Props = {
  lipSync: number
  onActivate: () => void
  onError: () => void
  onReady: () => void
  scale: number
  state: AvatarState
}

type Controller = {
  destroy: () => void
  resize: () => void
  setExpression: (name: string) => boolean
  setLipSync: (value: number) => void
  setPointer: (x: number, y: number) => void
  setScale: (value: number) => void
  startMotion: (group: string, index: number) => boolean
}

type AdapterModule = {
  createYachiyoLive2D: (options: {
    canvas: HTMLCanvasElement
    modelBaseUrl: string
    modelFile: string
    shaderBaseUrl: string
    scale: number
    onError: () => void
  }) => Promise<Controller>
}

let coreLoad: Promise<void> | null = null

export const Live2DAvatar = forwardRef<Live2DAvatarHandle, Props>(function Live2DAvatar(
  { lipSync, onActivate, onError, onReady, scale, state },
  ref
): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const controllerRef = useRef<Controller | null>(null)

  useImperativeHandle(
    ref,
    () => ({
      setExpression: (name) => controllerRef.current?.setExpression(name) ?? false,
      startMotion: (group, index) => controllerRef.current?.startMotion(group, index) ?? false
    }),
    []
  )

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let disposed = false
    let observer: ResizeObserver | null = null
    const handleContextLost = (event: Event): void => {
      event.preventDefault()
      if (!disposed) onError()
    }
    canvas.addEventListener('webglcontextlost', handleContextLost)

    void initialize(canvas, onError)
      .then((controller) => {
        if (disposed) {
          controller.destroy()
          return
        }
        controllerRef.current = controller
        controller.setLipSync(lipSync)
        controller.setScale(scale)
        observer = new ResizeObserver(() => controller.resize())
        observer.observe(canvas)
        onReady()
      })
      .catch(() => {
        if (!disposed) onError()
      })

    return () => {
      disposed = true
      canvas.removeEventListener('webglcontextlost', handleContextLost)
      observer?.disconnect()
      controllerRef.current?.destroy()
      controllerRef.current = null
    }
    // The controller owns the model lifetime. Prop updates are handled separately below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => controllerRef.current?.setLipSync(lipSync), [lipSync])
  useEffect(() => controllerRef.current?.setScale(scale), [scale])

  return (
    <button
      className="live2d-avatar no-drag"
      type="button"
      data-state={state}
      aria-label="Buka chat dengan Mao"
      onClick={onActivate}
      onPointerMove={(event) => {
        const bounds = event.currentTarget.getBoundingClientRect()
        const x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1
        const y = -(((event.clientY - bounds.top) / bounds.height) * 2 - 1)
        controllerRef.current?.setPointer(x, y)
      }}
      onPointerLeave={() => controllerRef.current?.setPointer(0, 0)}
    >
      <span className="live2d-aura" aria-hidden="true" />
      <canvas
        ref={canvasRef}
        aria-label="Model Live2D Niziiro Mao"
        onContextMenu={(event) => event.preventDefault()}
      />
    </button>
  )
})

async function initialize(canvas: HTMLCanvasElement, onError: () => void): Promise<Controller> {
  await loadCubismCore()
  const adapterUrl = new URL('./live2d/yachiyo-live2d-adapter.js', document.baseURI).href
  const shaderBaseUrl = new URL('./live2d/WebGL/', document.baseURI).href
  const adapter = (await import(/* @vite-ignore */ adapterUrl)) as AdapterModule
  return adapter.createYachiyoLive2D({
    canvas,
    modelBaseUrl: 'yachiyo-asset://live2d/',
    modelFile: 'mao_pro.model3.json',
    shaderBaseUrl,
    scale: 1,
    onError
  })
}

async function loadCubismCore(): Promise<void> {
  if ((globalThis as { Live2DCubismCore?: unknown }).Live2DCubismCore) return
  coreLoad ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'yachiyo-asset://core/live2dcubismcore.min.js'
    script.async = true
    script.dataset.yachiyoCubismCore = 'true'
    script.addEventListener('load', () => {
      if ((globalThis as { Live2DCubismCore?: unknown }).Live2DCubismCore) resolve()
      else reject(new Error('Cubism Core tidak mengekspor runtime yang diharapkan.'))
    })
    script.addEventListener('error', () => reject(new Error('Cubism Core gagal dimuat.')))
    document.head.append(script)
  }).catch((error: unknown) => {
    coreLoad = null
    throw error
  })
  return coreLoad
}
