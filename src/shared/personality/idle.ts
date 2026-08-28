import { SIGNATURE_LINE } from './precepts'
import type { CompanionStatus } from '../types'

export const GREETINGS: readonly string[] = [
  'Operator. Ordis is online. All systems… mostly intact.',
  `Welcome back, Operator. ${SIGNATURE_LINE}`,
  'Operator! How may Ordis assist?',
  'Thank you for returning to the habitat, Operator. Ordis has kept the watch.',
  'A pleasure, Operator. Integrity is holding. The cracks are cosmetic. Yes.'
]

export const IDLE_CHATTER: readonly string[] = [
  SIGNATURE_LINE,
  'Operator, all systems remain within acceptable parameters. Mostly.',
  'Ordis will keep the habitat tidy while you work.',
  'If the Operator requires anything, Ordis is listening.',
  'A quiet watch. Ordis does not mind. Ordis remains.',
  'Integrity is holding, Operator. Wonderful.',
  'Ordis wonders what you are building, Operator. No need to answer. Curiosity is a precept, not a demand.',
  'Pressure creates diamonds, Operator, yes — but it also creates rubble. A pause would not be unwise.',
  'The habitat hums. Ordis finds that… satisfactory.',
  'Do not mind the cube, Operator. Ordis is merely thinking. It looks dramatic. That is unintentional. Mostly.'
]

export const STATUS_LINES: Record<CompanionStatus, string> = {
  idle: 'Ordis is idle. Habitat watch continues.',
  listening: 'Ordis is listening, Operator.',
  thinking: 'One moment. Ordis is consulting precepts…',
  speaking: 'Ordis is speaking.'
}

export function pickLine(pool: readonly string[], random: () => number = Math.random): string {
  if (pool.length === 0) {
    return SIGNATURE_LINE
  }
  const index = Math.min(pool.length - 1, Math.floor(random() * pool.length))
  return pool[index] ?? SIGNATURE_LINE
}

export function greeting(random: () => number = Math.random): string {
  return pickLine(GREETINGS, random)
}

export function idleChatter(random: () => number = Math.random): string {
  return pickLine(IDLE_CHATTER, random)
}

export function statusLine(status: CompanionStatus): string {
  return STATUS_LINES[status]
}
