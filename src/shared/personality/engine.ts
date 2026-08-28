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
import { guardOutgoing, isClean } from './traps'

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


const SENTENCE = /[.!?]+(?:['")\]]+)?(?:\s+|$)/

function nextSentence(text: string, forceRest: boolean): { sentence: string; rest: string } | null {
  const match = text.match(SENTENCE)
  if (match && match.index !== undefined) {
    const end = match.index + match[0].length
    if (end > 0) {
      return { sentence: text.slice(0, end), rest: text.slice(end) }
    }
  }
  if (forceRest && text.length > 0) {
    return { sentence: text, rest: '' }
  }
  return null
}

/** Emits overlay tokens at sentence boundaries after a trap check, so captions animate live without a flash. */
export class LiveCaptionGuard {
  private pending = ''
  private spoken = ''
  private closed = false

  get text(): string {
    return this.spoken
  }

  push(token: string): StreamChunk[] {
    if (this.closed) {
      return []
    }
    this.pending += token
    return this.release(false)
  }

  finish(): StreamChunk[] {
    const chunks = this.closed ? [] : this.release(true)
    this.closed = true
    chunks.push({ type: 'done', value: this.spoken })
    return chunks
  }

  private release(end: boolean): StreamChunk[] {
    const chunks: StreamChunk[] = []
    while (!this.closed) {
      const split = nextSentence(this.pending, end)
      if (split === null) {
        break
      }
      this.pending = split.rest
      const candidate = `${this.spoken}${split.sentence}`
      if (!isClean(split.sentence) || !isClean(candidate)) {
        this.spoken = guardOutgoing(candidate)
        this.pending = ''
        this.closed = true
        chunks.push({ type: 'done', value: this.spoken })
        return chunks
      }
      this.spoken = candidate
      for (const value of tokenizeForStream(split.sentence)) {
        chunks.push({ type: 'token', value })
      }
    }
    return chunks
  }
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
