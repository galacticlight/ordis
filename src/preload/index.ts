import { contextBridge, ipcRenderer } from 'electron'
import type { PublicSettings, StreamChunk } from '../shared/types'

export interface OrdisBridge {
  getSettings: () => Promise<PublicSettings>
  saveSettings: (patch: Partial<PublicSettings> & { apiKey?: string }) => Promise<PublicSettings>
  testConnection: () => Promise<{ ok: boolean; error?: string }>
  sendChat: (text: string) => Promise<void>
  setInteractive: (next: boolean) => Promise<void>
  openSettings: () => Promise<void>
  ready: () => Promise<void>
  quit: () => Promise<void>
  onChunk: (cb: (chunk: StreamChunk) => void) => () => void
  onStatus: (cb: (status: string) => void) => () => void
  onGreeting: (cb: (text: string) => void) => () => void
  onInteractive: (cb: (next: boolean) => void) => () => void
  onCaptions: (cb: (enabled: boolean) => void) => () => void
  onVoice: (cb: (payload: { sampleRate: number; pcm: Uint8Array }) => void) => () => void
}

function subscribe<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_event: unknown, payload: T) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const bridge: OrdisBridge = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch) => ipcRenderer.invoke('settings:save', patch),
  testConnection: () => ipcRenderer.invoke('settings:test'),
  sendChat: (text) => ipcRenderer.invoke('chat:send', text),
  setInteractive: (next) => ipcRenderer.invoke('overlay:set-interactive', next),
  openSettings: () => ipcRenderer.invoke('overlay:open-settings'),
  ready: () => ipcRenderer.invoke('overlay:ready'),
  quit: () => ipcRenderer.invoke('app:quit'),
  onChunk: (cb) => subscribe('ordis:chunk', cb),
  onStatus: (cb) => subscribe('ordis:status', cb),
  onGreeting: (cb) => subscribe('ordis:greeting', cb),
  onInteractive: (cb) => subscribe('ordis:interactive', cb),
  onCaptions: (cb) => subscribe('ordis:captions', cb),
  onVoice: (cb) => subscribe('ordis:voice', cb)
}

contextBridge.exposeInMainWorld('ordis', bridge)
