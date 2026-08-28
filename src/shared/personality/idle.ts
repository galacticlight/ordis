import { pick } from '../util/pick'
import { getPack } from './pack'
import { SIGNATURE_LINE } from './precepts'
import type { CompanionStatus } from '../types'

export const STATUS_LINES: Record<CompanionStatus, string> = {
  idle: 'Ordis is idle. Habitat watch continues.',
  listening: 'Ordis is listening, Operator.',
  thinking: 'One moment. Ordis is consulting precepts…',
  speaking: 'Ordis is speaking.'
}

export function greetings(): readonly string[] {
  return getPack().greetings
}

export function idleLines(): readonly string[] {
  return getPack().idle
}

export function pickLine(pool: readonly string[], random: () => number = Math.random): string {
  if (pool.length === 0) return SIGNATURE_LINE
  return pick(pool, random)
}

export function greeting(random: () => number = Math.random): string {
  return pickLine(greetings(), random)
}

export function idleChatter(random: () => number = Math.random): string {
  return pickLine(idleLines(), random)
}

export function statusLine(status: CompanionStatus): string {
  return STATUS_LINES[status]
}
