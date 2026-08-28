import { DEFAULT_MEMORY, type OperatorMemory } from '../types'

const REMEMBER_PATTERNS: { test: RegExp; apply: (memory: OperatorMemory, match: RegExpExecArray) => void }[] =
  [
    {
      test: /\b(?:remember that )?i (?:like|love|enjoy) ([^.!?]+)/i,
      apply: (memory, match) => {
        const value = clean(match[1])
        if (value && !memory.likes.includes(value)) {
          memory.likes.push(value)
        }
      }
    },
    {
      test: /\b(?:remember that )?i (?:dislike|hate|can'?t stand) ([^.!?]+)/i,
      apply: (memory, match) => {
        const value = clean(match[1])
        if (value && !memory.dislikes.includes(value)) {
          memory.dislikes.push(value)
        }
      }
    },
    {
      test: /\b(?:remember(?: this| that)?[:\s]+)(.+)/i,
      apply: (memory, match) => {
        const value = clean(match[1])
        if (value && !memory.notes.includes(value)) {
          memory.notes.push(value)
        }
      }
    }
  ]

function clean(value: string | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim().replace(/[.,;]+$/, '')
}

export function createMemory(partial?: Partial<OperatorMemory>): OperatorMemory {
  return {
    ...DEFAULT_MEMORY,
    likes: [...(partial?.likes ?? DEFAULT_MEMORY.likes)],
    dislikes: [...(partial?.dislikes ?? DEFAULT_MEMORY.dislikes)],
    notes: [...(partial?.notes ?? DEFAULT_MEMORY.notes)],
    facts: { ...DEFAULT_MEMORY.facts, ...(partial?.facts ?? {}) },
    operatorName: partial?.operatorName ?? DEFAULT_MEMORY.operatorName,
    addressAs: partial?.addressAs ?? DEFAULT_MEMORY.addressAs,
    updatedAt: partial?.updatedAt ?? Date.now()
  }
}

export function rememberFact(memory: OperatorMemory, key: string, value: string): OperatorMemory {
  const next = createMemory(memory)
  next.facts[key.trim()] = value.trim()
  next.updatedAt = Date.now()
  return next
}

export function rememberNote(memory: OperatorMemory, note: string): OperatorMemory {
  const next = createMemory(memory)
  const trimmed = note.trim()
  if (trimmed.length > 0 && !next.notes.includes(trimmed)) {
    next.notes.push(trimmed)
  }
  next.updatedAt = Date.now()
  return next
}

export function ingestOperatorUtterance(memory: OperatorMemory, text: string): OperatorMemory {
  const next = createMemory(memory)
  for (const pattern of REMEMBER_PATTERNS) {
    const match = pattern.test.exec(text)
    if (match) {
      pattern.apply(next, match)
    }
  }
  next.updatedAt = Date.now()
  return next
}

export function summarizeMemory(memory: OperatorMemory): string {
  const bits: string[] = [`${memory.addressAs} (${memory.operatorName})`]
  if (memory.likes.length > 0) {
    bits.push(`likes ${memory.likes.join(', ')}`)
  }
  if (memory.dislikes.length > 0) {
    bits.push(`dislikes ${memory.dislikes.join(', ')}`)
  }
  if (memory.notes.length > 0) {
    bits.push(`${memory.notes.length} habitat notes`)
  }
  return bits.join(' · ')
}
