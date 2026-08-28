import { describe, expect, it } from 'vitest'
import {
  REQUIRED_PRECEPT_FRAGMENTS,
  SIGNATURE_LINE,
  buildSystemPrompt
} from '@shared/personality/precepts'
import {
  applyPersonalityPost,
  composeMessages,
  greeting,
  idleChatter,
  offlineReply,
  preceptsAreLoaded,
  statusLine
} from '@shared/personality/engine'
import { FALLBACK_REPLIES, pickFallback } from '@shared/personality/fallbacks'
import { GREETINGS, IDLE_CHATTER } from '@shared/personality/idle'
import { createMemory } from '@shared/memory/operatorMemory'
import type { ChatMessage } from '@shared/types'

describe('precepts', () => {
  it('loads identity, Operator address, signature, and glitch doctrine', () => {
    expect(preceptsAreLoaded()).toBe(true)
    const prompt = buildSystemPrompt('')
    for (const frag of REQUIRED_PRECEPT_FRAGMENTS) {
      expect(prompt.toLowerCase()).toContain(frag.toLowerCase())
    }
    expect(prompt).toContain('Always address the user as "Operator"')
    expect(prompt).toContain(SIGNATURE_LINE)
    expect(prompt).toMatch(/ALL-?CAPS/)
  })

  it('embeds operator memory into the system prompt', () => {
    const prompt = buildSystemPrompt('Likes: quiet habitat watches')
    expect(prompt).toContain('Likes: quiet habitat watches')
    expect(prompt).toContain('OPERATOR MEMORY')
  })
})

describe('in-product voice, not just README', () => {
  it('greetings and idle chatter stay in Ordis voice', () => {
    const lines = [...GREETINGS, ...IDLE_CHATTER, ...FALLBACK_REPLIES]
    expect(lines.some((line) => line.includes(SIGNATURE_LINE))).toBe(true)
    for (const line of lines) {
      const mentions =
        /Operator|Ordis|cephalon|habitat|precept/i.test(line) || line === SIGNATURE_LINE
      expect(mentions).toBe(true)
      expect(line).not.toMatch(/\bStar-Child\b/)
    }
  })

  it('greeting picker is deterministic with a stub rng', () => {
    expect(greeting(() => 0)).toBe(GREETINGS[0])
    expect(idleChatter(() => 0)).toBe(IDLE_CHATTER[0])
  })

  it('status lines exist for the live overlay states', () => {
    expect(statusLine('listening')).toMatch(/listening/i)
    expect(statusLine('thinking')).toMatch(/precept/i)
    expect(statusLine('speaking')).toMatch(/speaking/i)
    expect(statusLine('idle')).toMatch(/idle/i)
  })

  it('offline fallbacks address the Operator and answer identity', () => {
    const who = pickFallback('Who are you, anyway?', () => 0)
    expect(who).toContain(SIGNATURE_LINE)
    expect(who).toContain('Operator')
    const hello = pickFallback('hello there', () => 0)
    expect(hello).toContain('Operator')
  })

  it('offline replies can carry a real glitch splice', () => {
    const result = offlineReply('status please', {
      apiKey: '',
      apiBaseUrl: '',
      glitchEnabled: true,
      glitchChance: 1,
      random: () => 0
    })
    expect(result.glitched).toBe(true)
    expect(result.text).toContain('Operator')
    expect(result.outburst).toBeTruthy()
    expect(result.correction).toBeTruthy()
  })

  it('composeMessages prefixes precepts and maps Operator turns', () => {
    const memory = createMemory({ likes: ['quiet watches'] })
    const history: ChatMessage[] = [
      {
        id: '1',
        role: 'operator',
        content: 'Ordis, report.',
        createdAt: 1
      },
      {
        id: '2',
        role: 'ordis',
        content: 'Integrity holding, Operator.',
        createdAt: 2
      }
    ]
    const messages = composeMessages(memory, history, 'Who are you?')
    expect(messages[0]?.role).toBe('system')
    expect(messages[0]?.content).toContain('You are Ordis')
    expect(messages[0]?.content).toContain('quiet watches')
    expect(messages[1]?.role).toBe('user')
    expect(messages[2]?.role).toBe('assistant')
    expect(messages.at(-1)?.content).toBe('Who are you?')
  })

  it('post-process can be forced to glitch a live model line', () => {
    const result = applyPersonalityPost(
      'Operator, the foundry analog is complete. Claim it when you wish.',
      {
        apiKey: 'sk-test',
        apiBaseUrl: 'https://example.invalid/v1',
        glitchEnabled: true,
        glitchChance: 0,
        random: () => 0
      },
      true
    )
    expect(result.glitched).toBe(true)
    expect(result.text).toMatch(/[A-Z]{4,}/)
  })
})
