import './launcher.css'

type LauncherViewState = {
  status: 'online' | 'offline' | 'listening' | 'thinking' | 'speaking' | 'unread'
  showStatusIndicator: boolean
}

type LauncherApi = {
  restore: () => Promise<void>
  showContextMenu: () => Promise<void>
  drag: (payload: { phase: 'start' | 'move' | 'end'; screenX: number; screenY: number }) => void
  onState: (callback: (state: LauncherViewState) => void) => () => void
}

const launcher = requireLauncher()
const launcherApi = (window as unknown as { yachiyoLauncher: LauncherApi }).yachiyoLauncher

let pointerId: number | null = null
let startX = 0
let startY = 0
let dragged = false
let suppressClick = false

launcherApi.onState((state) => {
  launcher.dataset.status = state.status
  launcher.dataset.indicator = state.showStatusIndicator ? 'visible' : 'hidden'
  launcher.title = statusTooltip(state.status)
  launcher.setAttribute('aria-label', statusTooltip(state.status))
})

launcher.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return
  pointerId = event.pointerId
  startX = event.screenX
  startY = event.screenY
  dragged = false
  launcher.setPointerCapture(event.pointerId)
  launcherApi.drag({ phase: 'start', screenX: event.screenX, screenY: event.screenY })
})

launcher.addEventListener('pointermove', (event) => {
  if (pointerId !== event.pointerId) return
  if (Math.hypot(event.screenX - startX, event.screenY - startY) >= 4) dragged = true
  launcherApi.drag({ phase: 'move', screenX: event.screenX, screenY: event.screenY })
})

launcher.addEventListener('pointerup', finishDrag)
launcher.addEventListener('pointercancel', finishDrag)

launcher.addEventListener('click', () => {
  if (suppressClick) {
    suppressClick = false
    return
  }
  void launcherApi.restore()
})

launcher.addEventListener('contextmenu', (event) => {
  event.preventDefault()
  void launcherApi.showContextMenu()
})

function finishDrag(event: PointerEvent): void {
  if (pointerId !== event.pointerId) return
  launcherApi.drag({ phase: 'end', screenX: event.screenX, screenY: event.screenY })
  if (launcher.hasPointerCapture(event.pointerId)) launcher.releasePointerCapture(event.pointerId)
  suppressClick = dragged
  pointerId = null
}

function statusTooltip(status: string): string {
  const labels: Record<string, string> = {
    online: 'Buka Yachiyo Companion · Hermes online',
    offline: 'Buka Yachiyo Companion · Hermes offline',
    listening: 'Buka Yachiyo Companion · sedang mendengarkan',
    thinking: 'Buka Yachiyo Companion · sedang berpikir',
    speaking: 'Buka Yachiyo Companion · sedang berbicara',
    unread: 'Buka Yachiyo Companion · ada respons baru'
  }
  return labels[status] ?? 'Buka Yachiyo Companion'
}

function requireLauncher(): HTMLButtonElement {
  const element = document.querySelector<HTMLButtonElement>('#launcher')
  if (!element) throw new Error('Launcher button unavailable.')
  return element
}

export {}
