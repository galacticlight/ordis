import { DEFAULT_MEMORY, type OperatorMemory } from '../types'

const REMEMBER_PATTERNS: { test: RegExp; apply: (memory: OperatorMemory, match: RegExpExecArray) => void }[] =
  [
    {
      test: /\b(?:remember that |note that )?i (?:like|love|enjoy) ([^.!?]+)/i,
      apply: (memory, match) => {
        const value = clean(match[1])
        if (value && !memory.likes.includes(value)) {
          memory.likes.push(value)
        }
      }
    },
    {
      test: /\b(?:remember that |note that )?i (?:dislike|hate|can'?t stand) ([^.!?]+)/i,
      apply: (memory, match) => {
        const value = clean(match[1])
        if (value && !memory.dislikes.includes(value)) {
          memory.dislikes.push(value)
        }
      }
    },
    {
      test: /\b(?:note that |remember that )?i work ([^.!?]+)/i,
      apply: (memory, match) => {
        const value = clean(match[1])
        if (value) memory.facts.work = value
      }
    },
    {
      test: /\b(?:note that|don'?t forget(?: that)?|remember(?: this| that)?)[:\s]+(.+)/i,
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
  if (isRecallQuery(text)) return memory
  const next = createMemory(memory)
  for (const pattern of REMEMBER_PATTERNS) {
    const match = pattern.test.exec(text)
    if (match) {
      pattern.apply(next, match)
      break
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

export function isRecallQuery(text: string): boolean {
  return /\b(what do you remember|what have you (?:stored|remembered)|what do you know about me)\b/i.test(
    text
  )
}

export function memoryChanged(before: OperatorMemory, after: OperatorMemory): boolean {
  return (
    before.likes.join('\0') !== after.likes.join('\0') ||
    before.dislikes.join('\0') !== after.dislikes.join('\0') ||
    before.notes.join('\0') !== after.notes.join('\0') ||
    JSON.stringify(before.facts) !== JSON.stringify(after.facts)
  )
}

export function recallReply(memory: OperatorMemory): string {
  const bits: string[] = []
  if (memory.likes.length > 0) {
    bits.push(`you like ${memory.likes.join(', ')}`)
  }
  if (memory.dislikes.length > 0) {
    bits.push(`you dislike ${memory.dislikes.join(', ')}`)
  }
  if (memory.notes.length > 0) {
    bits.push(memory.notes.join('; '))
  }
  const facts = Object.entries(memory.facts)
  if (facts.length > 0) {
    bits.push(facts.map(([key, value]) => `${key} is ${value}`).join('; '))
  }
  if (bits.length === 0) {
    return 'Ordis has no habitat notes yet, Operator. Speak a preference, and it will be kept.'
  }
  return `Operator, Ordis remembers ${bits.join('; ')}. Wonderful.`
}

export function recallSpeech(memory: OperatorMemory, dump = false): string {
  if (dump && (memory.notes.length > 0 || Object.keys(memory.facts).length > 0 || memory.likes.length > 0)) {
    return recallReply(memory)
  }
  return recallReply(memory)
}
