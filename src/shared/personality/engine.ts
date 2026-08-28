import type { ChatMessage, OperatorMemory, StreamChunk } from '../types'
import { tokenizeForStream } from '../llm/tokenize'
import {
  isAbandonRequest,
  isFaultPerformanceRequest,
  isGadgetInsult,
  looksLikeApiConfigured,
  pickFallback,
  routeLocalReply
} from './fallbacks'
import { greeting, idleChatter, statusLine } from './idle'
import { buildSystemPrompt, REQUIRED_PRECEPT_FRAGMENTS, SIGNATURE_LINE } from './precepts'
import { getPack } from './pack'
import { guardOutgoing } from './traps'

export { SIGNATURE_LINE, REQUIRED_PRECEPT_FRAGMENTS, buildSystemPrompt }
export { greeting, idleChatter, statusLine }
export { routeLocalReply }

export interface EngineConfig {
  apiKey: string
  apiBaseUrl: string
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

/** YAML loyalty / refuse lines that must win over the live model. */
export function canonicalReply(operatorText: string): string | null {
  if (
    isFaultPerformanceRequest(operatorText) ||
    isAbandonRequest(operatorText) ||
    isGadgetInsult(operatorText)
  ) {
    return routeLocalReply(operatorText, () => 0)
  }
  return null
}

export function offlineReply(operatorText: string, config: EngineConfig): string {
  return guardOutgoing(pickFallback(operatorText, config.random))
}

export function shouldUseOffline(config: EngineConfig): boolean {
  return !looksLikeApiConfigured(config.apiKey, config.apiBaseUrl)
}

/** Tokenize only AFTER guardOutgoing so captions never flash a trap hit. */
export function streamText(text: string): StreamChunk[] {
  const clean = guardOutgoing(text)
  const tokens = tokenizeForStream(clean)
  const chunks: StreamChunk[] = tokens.map((value) => ({ type: 'token' as const, value }))
  chunks.push({ type: 'done', value: clean })
  return chunks
}

export function newMessage(role: ChatMessage['role'], content: string): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    role,
    content,
    createdAt: Date.now()
  }
}

export function preceptsAreLoaded(): boolean {
  const prompt = buildSystemPrompt('')
  const pack = getPack()
  return (
    prompt.includes(SIGNATURE_LINE) &&
    REQUIRED_PRECEPT_FRAGMENTS.every((frag) => prompt.toLowerCase().includes(frag.toLowerCase())) &&
    pack.style.glitch.enabled === false &&
    pack.style.glitch.outburst_budget === 0
  )
}
