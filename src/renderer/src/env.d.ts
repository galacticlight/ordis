import type { AppSettings, ChatMessage, CompanionStatus, OperatorMemory } from '@shared/types'

interface OrdisBridge {
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
