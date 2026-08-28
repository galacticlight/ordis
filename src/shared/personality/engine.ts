import type { ChatMessage, OperatorMemory, StreamChunk } from '../types'
import { pickFallback } from './fallbacks'
import { injectGlitch, maybeGlitch, tokenizeForStream, type GlitchResult } from './glitch'
import { buildSystemPrompt, REQUIRED_PRECEPT_FRAGMENTS, SIGNATURE_LINE } from './precepts'

export { SIGNATURE_LINE, REQUIRED_PRECEPT_FRAGMENTS, buildSystemPrompt }
export { greeting, idleChatter, statusLine } from './idle'

export interface EngineConfig {
  apiKey: string
  apiBaseUrl: string
  glitchEnabled: boolean
  glitchChance: number
  random?: () => number
}

export function formatMemoryBlock(memory: OperatorMemory): string {
  const lines: string[] = [
    `Preferred address: ${memory.addressAs}`,
    `Operator true name (rarely use): ${memory.operatorName}`
  ]
  if (memory.likes.length > 0) {
    lines.push(`Likes: ${memory.likes.join('; ')}`)
  }
  if (memory.dislikes.length > 0) {
    lines.push(`Dislikes: ${memory.dislikes.join('; ')}`)
  }
  if (memory.notes.length > 0) {
    lines.push(`Notes:\n- ${memory.notes.join('\n- ')}`)
  }
  const facts = Object.entries(memory.facts)
  if (facts.length > 0) {
    lines.push(`Facts:\n${facts.map(([k, v]) => `- ${k}: ${v}`).join('\n')}`)
  }
  return lines.join('\n')
}

export function composeMessages(
  memory: OperatorMemory,
  history: readonly ChatMessage[],
  latest: string
): { role: 'system' | 'user' | 'assistant'; content: string }[] {
  const system = buildSystemPrompt(formatMemoryBlock(memory))
  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: system }
  ]
  for (const item of history.slice(-16)) {
    if (item.role === 'system') {
      continue
    }
    messages.push({
      role: item.role === 'operator' ? 'user' : 'assistant',
      content: item.content
    })
  }
  messages.push({ role: 'user', content: latest })
  return messages
}

export function applyPersonalityPost(
  raw: string,
  config: EngineConfig,
  forceGlitch = false
): GlitchResult {
  const text = raw.trim()
  if (forceGlitch) {
    return injectGlitch(text, config.random)
  }
  return maybeGlitch(text, {
    enabled: config.glitchEnabled,
    chance: config.glitchChance,
    random: config.random
  })
}

export function offlineReply(operatorText: string, config: EngineConfig): GlitchResult {
  const base = pickFallback(operatorText, config.random)
  return applyPersonalityPost(base, config)
}

export function streamText(text: string): StreamChunk[] {
  const tokens = tokenizeForStream(text)
  const chunks: StreamChunk[] = tokens.map((value) => ({ type: 'token' as const, value }))
  chunks.push({ type: 'done', value: text })
  return chunks
}

export function newMessage(
  role: ChatMessage['role'],
  content: string,
  glitched = false
): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content,
    createdAt: Date.now(),
    glitched
  }
}

export function preceptsAreLoaded(): boolean {
  const prompt = buildSystemPrompt('')
  return REQUIRED_PRECEPT_FRAGMENTS.every((frag) =>
    prompt.toLowerCase().includes(frag.toLowerCase())
  )
}
