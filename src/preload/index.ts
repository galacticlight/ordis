import { contextBridge, ipcRenderer } from 'electron'
import type { AppSettings, ChatMessage, CompanionStatus, OperatorMemory } from '@shared/types'

export interface OrdisBridge {
  chat: (text: string) => Promise<void>
  abortChat: () => Promise<void>
  onToken: (handler: (token: string) => void) => () => void
  onDone: (handler: (payload: { content: string; glitched: boolean }) => void) => () => void
  onError: (handler: (message: string) => void) => () => void
  onStatus: (handler: (status: CompanionStatus) => void) => () => void
  onGreeting: (handler: (text: string) => void) => () => void
  getSettings: () => Promise<AppSettings>
  saveSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>
  getMemory: () => Promise<OperatorMemory>
  remember: (note: string) => Promise<OperatorMemory>
  getHistory: () => Promise<ChatMessage[]>
  setTuck: (tucked: boolean) => Promise<void>
  setIgnoreMouse: (ignore: boolean) => Promise<void>
}

function subscribe<T>(channel: string, handler: (payload: T) => void): () => void {
  const wrapped = (_event: unknown, payload: T): void => {
    handler(payload)
  }
  ipcRenderer.on(channel, wrapped)
  return () => {
    ipcRenderer.removeListener(channel, wrapped)
  }
}

const ordis: OrdisBridge = {
  chat: (text) => ipcRenderer.invoke('ordis:chat', text),
  abortChat: () => ipcRenderer.invoke('ordis:abort'),
  onToken: (handler) => subscribe('ordis:token', handler),
  onDone: (handler) => subscribe('ordis:done', handler),
  onError: (handler) => subscribe('ordis:error', handler),
  onStatus: (handler) => subscribe('ordis:status', handler),
  onGreeting: (handler) => subscribe('ordis:greeting', handler),
  getSettings: () => ipcRenderer.invoke('ordis:settings:get'),
  saveSettings: (patch) => ipcRenderer.invoke('ordis:settings:save', patch),
  getMemory: () => ipcRenderer.invoke('ordis:memory:get'),
  remember: (note) => ipcRenderer.invoke('ordis:memory:remember', note),
  getHistory: () => ipcRenderer.invoke('ordis:history:get'),
  setTuck: (tucked) => ipcRenderer.invoke('ordis:tuck', tucked),
  setIgnoreMouse: (ignore) => ipcRenderer.invoke('ordis:ignore-mouse', ignore)
}

contextBridge.exposeInMainWorld('ordis', ordis)
