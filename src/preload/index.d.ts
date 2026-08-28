import type { OrdisBridge } from './index'

declare global {
  interface Window {
    ordis: OrdisBridge
  }
}

export {}
