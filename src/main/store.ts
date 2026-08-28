import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DEFAULT_MEMORY, DEFAULT_SETTINGS, type AppSettings, type OperatorMemory } from '@shared/types'

interface DiskState {
  settings: AppSettings
  memory: OperatorMemory
}

const EMPTY: DiskState = {
  settings: { ...DEFAULT_SETTINGS },
  memory: { ...DEFAULT_MEMORY, likes: [], dislikes: [], notes: [], facts: {} }
}

export class HabitatStore {
  constructor(private readonly filePath: string) {}

  load(): DiskState {
    try {
      if (!existsSync(this.filePath)) {
        return structuredClone(EMPTY)
      }
      const raw = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<DiskState>
      return {
        settings: { ...DEFAULT_SETTINGS, ...(raw.settings ?? {}) },
        memory: {
          ...DEFAULT_MEMORY,
          ...(raw.memory ?? {}),
          likes: [...(raw.memory?.likes ?? [])],
          dislikes: [...(raw.memory?.dislikes ?? [])],
          notes: [...(raw.memory?.notes ?? [])],
          facts: { ...(raw.memory?.facts ?? {}) }
        }
      }
    } catch {
      return structuredClone(EMPTY)
    }
  }

  save(state: DiskState): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileSync(this.filePath, JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600 })
  }
}

export function habitatPath(userData: string): string {
  return join(userData, 'ordis-habitat.json')
}
