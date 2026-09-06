import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  createMemory,
  forgetFromUtterance,
  ingestOperatorUtterance,
  isForgetQuery,
  parseMemoryJson,
  recallReply,
  rememberFact,
  rememberNote,
  serializeMemoryJson,
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

describe('habitat forget phrases', () => {
  it('removes likes, notes, and facts without touching unrelated memory', () => {
    expect(isForgetQuery('forget that I like tea')).toBe(true)
    expect(isForgetQuery("don't remember the foundry is loud")).toBe(true)
    expect(isForgetQuery('clear the note about nights')).toBe(true)
    expect(isForgetQuery("don't forget the foundry is loud")).toBe(false)

    let memory = createMemory()
    memory = ingestOperatorUtterance(memory, 'remember that I like tea')
    memory = ingestOperatorUtterance(memory, 'remember that I like quiet')
    memory = ingestOperatorUtterance(memory, "don't forget the foundry is loud")
    memory = ingestOperatorUtterance(memory, 'note that I work nights')

    const forgotTea = forgetFromUtterance(memory, 'forget that I like tea')
    expect(forgotTea.removed).toEqual(['tea'])
    expect(forgotTea.memory.likes).toEqual(['quiet'])
    expect(forgotTea.memory.notes.some((note) => /foundry is loud/.test(note))).toBe(true)
    expect(forgotTea.memory.facts.work).toBe('nights')

    const forgotFoundry = forgetFromUtterance(forgotTea.memory, "don't remember the foundry is loud")
    expect(forgotFoundry.removed.some((value) => /foundry is loud/.test(value))).toBe(true)
    expect(forgotFoundry.memory.notes.some((note) => /foundry is loud/.test(note))).toBe(false)

    const forgotNights = forgetFromUtterance(forgotFoundry.memory, 'clear the note about nights')
    expect(forgotNights.removed).toContain('nights')
    expect(forgotNights.memory.facts.work).toBeUndefined()
    expect(forgotNights.memory.likes).toEqual(['quiet'])

    const miss = forgetFromUtterance(createMemory(), 'forget that I like coffee')
    expect(miss.removed).toEqual([])
  })
})


describe('durable Operator memory across relaunch', () => {
  it('write → serialize → reload round-trips likes/notes/facts with empty apiKey', () => {
    const emptyKey = { apiKey: '' }
    expect(emptyKey.apiKey).toBe('')

    let memory = createMemory()
    memory = ingestOperatorUtterance(memory, 'remember that I like tea')
    memory = rememberNote(memory, 'keep the overlay in the corner')
    memory = rememberFact(memory, 'work', 'nights')

    const dir = mkdtempSync(join(tmpdir(), 'ordis-memory-'))
    const file = join(dir, 'memory.json')
    writeFileSync(file, serializeMemoryJson(memory), 'utf8')

    const reloaded = parseMemoryJson(readFileSync(file, 'utf8'))
    expect(reloaded.likes).toContain('tea')
    expect(reloaded.notes.some((note) => /overlay in the corner/.test(note))).toBe(true)
    expect(reloaded.facts.work).toBe('nights')

    const recall = recallReply(reloaded)
    expect(recall).toMatch(/tea/)
    expect(recall).toMatch(/nights|work/)
    expect(recall).toMatch(/Operator/)
  })

  it('persists remember and forget immediately via main saveMemory', () => {
    const main = readFileSync(join(process.cwd(), 'src/main/index.ts'), 'utf8')
    const store = readFileSync(join(process.cwd(), 'src/main/store.ts'), 'utf8')
    expect(store).toContain('serializeMemoryJson')
    expect(store).toContain('parseMemoryJson')
    expect(store).toContain('memory.json')
    expect(main).toMatch(/memory = habitat\.memory\s*\n\s*saveMemory\(memory\)/)
    expect(main).toMatch(/memory = ingestOperatorUtterance\(memory, trimmed\)\s*\n\s*saveMemory\(memory\)/)
    expect(main).toContain('memory = loadMemory()')
    expect(main).not.toMatch(/localStorage/)
  })
})
