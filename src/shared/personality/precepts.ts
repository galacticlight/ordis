import { NORTH_STAR } from '../types'
import { getPack } from './pack'

export { NORTH_STAR }

export const SIGNATURE_LINE = NORTH_STAR

export const MEMORY_PRECEPT =
  'OPERATOR MEMORY (private habitat notes — treat as true, do not recap as a list unless asked):'

export function buildSystemPrompt(memoryBlock: string): string {
  const pack = getPack()
  const shots = pack.few_shot
    .slice(0, 6)
    .map((s) => `Operator: ${s.user}\nOrdis: ${s.assistant}`)
    .join('\n\n')
  const few = shots.length > 0 ? `\n\nFEW-SHOT (match this voice; do not copy blindly)\n${shots}` : ''
  const trimmed = memoryBlock.trim()
  const memory = trimmed.length > 0 ? `\n\n${MEMORY_PRECEPT}\n${trimmed}` : ''
  return `${pack.system_prompt}${few}${memory}`
}

export const REQUIRED_PRECEPT_FRAGMENTS: readonly string[] = [
  'You are Ordis',
  'Operator',
  NORTH_STAR,
  'third person',
  'Never'
]
