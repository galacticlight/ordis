export type CompanionStatus = 'idle' | 'listening' | 'thinking' | 'speaking'

export interface ChatMessage {
  id: string
  role: 'operator' | 'ordis' | 'system'
  content: string
  createdAt: number
  glitched?: boolean
}

export interface LlmSettings {
  apiBaseUrl: string
  apiKey: string
  model: string
  temperature: number
}

export interface OverlaySettings {
  alwaysOnTop: boolean
  idleTuck: boolean
  glitchEnabled: boolean
  glitchChance: number
  voiceOutEnabled: boolean
  voiceInEnabled: boolean
}

export interface AppSettings extends LlmSettings, OverlaySettings {}

export interface OperatorMemory {
  operatorName: string
  addressAs: string
  notes: string[]
  likes: string[]
  dislikes: string[]
  facts: Record<string, string>
  updatedAt: number
}

export interface StreamChunk {
  type: 'token' | 'status' | 'done' | 'error' | 'glitch'
  value: string
}

export const DEFAULT_SETTINGS: AppSettings = {
  apiBaseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  temperature: 0.85,
  alwaysOnTop: true,
  idleTuck: false,
  glitchEnabled: true,
  glitchChance: 0.18,
  voiceOutEnabled: false,
  voiceInEnabled: false
}

export const DEFAULT_MEMORY: OperatorMemory = {
  operatorName: 'Prince Thai',
  addressAs: 'Operator',
  notes: [],
  likes: [],
  dislikes: [],
  facts: {},
  updatedAt: 0
}

export const SIGNATURE_LINE =
  'I am Ordis, ship cephalon, a shadow of my former self.'

export const NORTH_STAR = SIGNATURE_LINE
