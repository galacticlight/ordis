import { describe, expect, it } from 'vitest'
import { NORTH_STAR } from '@shared/types'
import {
  REQUIRED_PRECEPT_FRAGMENTS,
  SIGNATURE_LINE,
  buildSystemPrompt
} from '@shared/personality/precepts'
import {
  composeMessages,
  greeting,
  idleChatter,
  offlineReply,
  preceptsAreLoaded,
  statusLine
} from '@shared/personality/engine'
import { getPack } from '@shared/personality/pack'
import { isClean } from '@shared/personality/traps'
import { createMemory } from '@shared/memory/operatorMemory'

describe('personality pack', () => {
  it('loads YAML with fault style disabled and north star intact', () => {
    const pack = getPack()
    expect(pack.style.glitch.enabled).toBe(false)
    expect(pack.style.glitch.outburst_budget).toBe(0)
    expect(pack.north_star).toBe(NORTH_STAR)
    expect(pack.address).toBe('Operator')
    expect(preceptsAreLoaded()).toBe(true)
  })

  it('system prompt addresses Operator, never instructs capital-letter rage', () => {
    const prompt = buildSystemPrompt('')
    for (const frag of REQUIRED_PRECEPT_FRAGMENTS) {
      expect(prompt.toLowerCase()).toContain(frag.toLowerCase())
    }
    expect(prompt).toContain(SIGNATURE_LINE)
    expect(prompt).not.toMatch(/interrupt yourself/i)
    expect(prompt).not.toMatch(/mandatory character behavior/i)
  })

  it('embeds operator memory into the system prompt', () => {
    const prompt = buildSystemPrompt('Likes: quiet habitat watches')
    expect(prompt).toContain('Likes: quiet habitat watches')
    expect(prompt).toContain('OPERATOR MEMORY')
  })
})

describe('in-product voice', () => {
  it('greetings, idle, and offline replies stay clean and address Operator', () => {
    const pack = getPack()
    for (const line of [...pack.greetings, ...pack.idle, ...pack.fallbacks]) {
      expect(isClean(line)).toBe(true)
    }
    expect(greeting(() => 0)).toMatch(/Operator/)
    expect(idleChatter(() => 0)).toBeTruthy()
    expect(statusLine('listening')).toMatch(/Operator/)
    const reply = offlineReply('hello', { apiKey: '', apiBaseUrl: '', random: () => 0 })
    expect(reply).toMatch(/Operator/)
    expect(isClean(reply)).toBe(true)
  })

  it('composeMessages starts with the system precepts', () => {
    const memory = createMemory()
    const messages = composeMessages(memory, [], 'hello')
    expect(messages[0]?.role).toBe('system')
    expect(messages[0]?.content).toContain(NORTH_STAR)
    expect(messages.at(-1)?.content).toBe('hello')
  })
})
