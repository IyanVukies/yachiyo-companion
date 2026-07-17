import type { YachiyoApi } from '../../shared/ipc'

declare global {
  interface Window {
    yachiyo: YachiyoApi
  }
}

export {}
