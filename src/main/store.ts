import { app, safeStorage } from 'electron'
import { packSecret, unpackSecret, type SecretBox } from '../shared/secrets'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEFAULT_MEMORY,
  DEFAULT_SETTINGS,
  type AppSettings,
  type OperatorMemory,
  type PublicSettings
} from '../shared/types'

function dir(): string {
  const d = app.getPath('userData')
  if (!existsSync(d)) mkdirSync(d, { recursive: true })
  return d
}

function settingsFile(): string {
  return join(dir(), 'settings.json')
}

function secretsFile(): string {
  return join(dir(), 'secrets.json')
}

function memoryFile(): string {
  return join(dir(), 'memory.json')
}

function electronSecretBox(): SecretBox {
  return {
    isAvailable: () => {
      try {
        return safeStorage.isEncryptionAvailable()
      } catch {
        return false
      }
    },
    encrypt: (value: string) => safeStorage.encryptString(value).toString('base64'),
    decrypt: (enc: string) => safeStorage.decryptString(Buffer.from(enc, 'base64'))
  }
}

export function loadSettings(): AppSettings {
  const base: AppSettings = {
    ...DEFAULT_SETTINGS,
    apiBaseUrl: process.env.ORDIS_API_BASE_URL?.trim() || DEFAULT_SETTINGS.apiBaseUrl,
    model: process.env.ORDIS_MODEL?.trim() || DEFAULT_SETTINGS.model,
    apiKey: (process.env.ORDIS_API_KEY ?? '').trim()
  }
  try {
    if (existsSync(settingsFile())) {
      const disk = JSON.parse(readFileSync(settingsFile(), "utf8")) as Record<string, unknown>
      delete disk.apiKey
      const allowed = new Set(Object.keys(DEFAULT_SETTINGS).filter((k) => k !== "apiKey"))
      const patch: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(disk)) {
        if (allowed.has(k)) patch[k] = v
      }
      Object.assign(base, patch)
    }
    if (existsSync(secretsFile())) {
      const secret = JSON.parse(readFileSync(secretsFile(), 'utf8')) as { enc?: string; plain?: string }
      const key = unpackSecret(secret, electronSecretBox())
      if (key) base.apiKey = key
    }
  } catch {
    // keep defaults
  }
  base.voiceInEnabled = false
  base.voiceOutEnabled = false
  return base
}

export function saveSettings(next: AppSettings): void {
  const packed = packSecret(next.apiKey, electronSecretBox())
  const publicBit = { ...next, apiKey: undefined, voiceInEnabled: false, voiceOutEnabled: false }
  delete (publicBit as { apiKey?: string }).apiKey
  writeFileSync(settingsFile(), JSON.stringify(publicBit, null, 2), 'utf8')
  writeFileSync(secretsFile(), JSON.stringify(packed, null, 2), 'utf8')
  try {
    chmodSync(secretsFile(), 0o600)
  } catch {
    // best-effort
  }
}

export function toPublicSettings(settings: AppSettings): PublicSettings {
  return {
    apiBaseUrl: settings.apiBaseUrl,
    model: settings.model,
    temperature: settings.temperature,
    alwaysOnTop: settings.alwaysOnTop,
    clickThroughIdle: settings.clickThroughIdle,
    captionsEnabled: settings.captionsEnabled,
    chatterFrequency: settings.chatterFrequency,
    voiceOutEnabled: settings.voiceOutEnabled,
    voiceInEnabled: settings.voiceInEnabled,
    hasApiKey: settings.apiKey.trim().length > 0
  }
}

export function loadMemory(): OperatorMemory {
  if (!existsSync(memoryFile())) {
    return { ...DEFAULT_MEMORY, likes: [], dislikes: [], notes: [], facts: {} }
  }
  try {
    const disk = JSON.parse(readFileSync(memoryFile(), 'utf8')) as Partial<OperatorMemory>
    return {
      ...DEFAULT_MEMORY,
      ...disk,
      likes: disk.likes ?? [],
      dislikes: disk.dislikes ?? [],
      notes: disk.notes ?? [],
      facts: disk.facts ?? {}
    }
  } catch {
    return { ...DEFAULT_MEMORY, likes: [], dislikes: [], notes: [], facts: {} }
  }
}

export function saveMemory(memory: OperatorMemory): void {
  writeFileSync(memoryFile(), JSON.stringify(memory, null, 2), 'utf8')
}
