import type { OrdisBridge } from '../../preload/index'

declare global {
  interface Window {
    ordis: OrdisBridge
  }
}

declare module '*.css' {
  const value: string
  export default value
}

export {}
