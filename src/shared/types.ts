export type CompanionStatus = 'idle' | 'listening' | 'thinking' | 'speaking'

export interface ChatMessage {
  id: string
  role: 'operator' | 'ordis' | 'system'
  content: string
  createdAt: number
}

export interface LlmSettings {
  apiBaseUrl: string
  apiKey: string
  model: string
  temperature: number
}

export interface OverlaySettings {
  alwaysOnTop: boolean
  clickThroughIdle: boolean
  captionsEnabled: boolean
  chatterFrequency: number
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
  type: 'token' | 'status' | 'done' | 'error'
  value: string
}

export const DEFAULT_SETTINGS: AppSettings = {
  apiBaseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o-mini',
  temperature: 0.85,
  alwaysOnTop: true,
  clickThroughIdle: true,
  captionsEnabled: true,
  chatterFrequency: 0,
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
  'I am Ordis, ship Cephalon. I serve the Operator. I make new memories.'

export const NORTH_STAR = SIGNATURE_LINE

export interface PublicSettings {
  apiBaseUrl: string
  model: string
  temperature: number
  alwaysOnTop: boolean
  clickThroughIdle: boolean
  captionsEnabled: boolean
  chatterFrequency: number
  voiceOutEnabled: boolean
  voiceInEnabled: boolean
  hasApiKey: boolean
}
