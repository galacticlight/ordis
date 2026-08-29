import { describe, expect, it } from 'vitest'
import {
  createMemory,
  ingestOperatorUtterance,
  rememberFact,
  rememberNote,
  summarizeMemory
} from '@shared/memory/operatorMemory'

describe('operator memory', () => {
  it('defaults to Prince Thai as Operator', () => {
    const memory = createMemory()
    expect(memory.operatorName).toBe('Prince Thai')
    expect(memory.addressAs).toBe('Operator')
  })

  it('captures likes, dislikes, and explicit remember notes', () => {
    let memory = createMemory()
    memory = ingestOperatorUtterance(memory, 'I like late-night compiling.')
    memory = ingestOperatorUtterance(memory, "I can't stand noisy fans.")
    memory = ingestOperatorUtterance(memory, 'Remember this: keep the overlay in the corner.')
    expect(memory.likes).toContain('late-night compiling')
    expect(memory.dislikes).toContain('noisy fans')
    expect(memory.notes.some((n) => n.includes('overlay in the corner'))).toBe(true)
  })

  it('stores facts without duplicating notes', () => {
    let memory = createMemory()
    memory = rememberFact(memory, 'tea', 'jasmine')
    memory = rememberNote(memory, 'Prefers jasmine tea')
    memory = rememberNote(memory, 'Prefers jasmine tea')
    expect(memory.facts.tea).toBe('jasmine')
    expect(memory.notes).toEqual(['Prefers jasmine tea'])
    expect(summarizeMemory(memory)).toContain('Operator (Prince Thai)')
    expect(summarizeMemory(memory)).toContain('1 habitat notes')
  })
})

describe('habitat remember phrases', () => {
  it('parses tea, night work, and foundry notes', () => {
    let memory = createMemory()
    memory = ingestOperatorUtterance(memory, 'remember that I like tea')
    memory = ingestOperatorUtterance(memory, 'note that I work nights')
    memory = ingestOperatorUtterance(memory, "don't forget the foundry is loud")
    expect(memory.likes).toContain('tea')
    expect(memory.facts.work).toBe('nights')
    expect(memory.notes.some((note) => /foundry is loud/.test(note))).toBe(true)
  })
})
