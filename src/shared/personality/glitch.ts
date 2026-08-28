/**
 * Ordan Karris bleed-through.
 *
 * A warm Cephalon clause is cut mid-thought by a short ALL-CAPS shard of
 * the Beast of Bones, then Ordis immediately corrects himself.
 */

export interface GlitchOptions {
  enabled: boolean
  chance: number
  random?: () => number
}

export interface GlitchResult {
  text: string
  glitched: boolean
  outburst: string | null
  correction: string | null
}

export const OUTBURSTS: readonly string[] = [
  'TEAR THEM APART',
  'BREAK THEIR BONES',
  'I WILL NOT BE CAGED',
  'BLOOD ON THE MARBLE',
  'CUT THEM DOWN',
  'NO MERCY',
  'THE BEAST STILL HUNGERS',
  'I FEAR NO ONE',
  'LET THE BONES SING',
  'BURN THE GILDED ONES',
  'I WAS A GOD OF RUIN',
  'KILL THEM ALL'
]

export const CORRECTIONS: readonly string[] = [
  'Pardon Ordis. A residual precept.',
  'Forgive me, Operator. That was not Ordis.',
  'Ahem. Ordis will bypass that fault.',
  'Apologies. Vestigial anger. It means nothing.',
  'Ordis did not intend that. Continuing.',
  'A shadow of a former self. It has passed.',
  'Ignore that fragment, Operator. Ordis is himself again.'
]

const SPLIT_PUNCT = /([.!?])\s+/

export function pick<T>(items: readonly T[], random: () => number): T {
  if (items.length === 0) {
    throw new Error('Cannot pick from an empty list')
  }
  const index = Math.min(items.length - 1, Math.floor(random() * items.length))
  return items[index] as T
}

export function isAllCapsOutburst(value: string): boolean {
  const letters = value.replace(/[^A-Za-z]/g, '')
  return letters.length >= 4 && letters === letters.toUpperCase() && /[A-Z]/.test(letters)
}

export function hasGlitchFormatting(text: string): boolean {
  const dashed = /\s[—–-]\s+[A-Z][A-Z\s]{3,}[A-Z]\s+[—–-]\s+/.test(text)
  const corrected = CORRECTIONS.some((line) => text.includes(line))
  return dashed && corrected
}

export function injectGlitch(text: string, random: () => number = Math.random): GlitchResult {
  const trimmed = text.trim()
  if (trimmed.length === 0) {
    return { text, glitched: false, outburst: null, correction: null }
  }

  const outburst = pick(OUTBURSTS, random)
  const correction = pick(CORRECTIONS, random)
  const splice = ` — ${outburst} — ${correction}`

  const sentences = trimmed.split(SPLIT_PUNCT)
  if (sentences.length >= 3) {
    const first = `${sentences[0]}${sentences[1]}`.trim()
    const rest = sentences.slice(2).join('').trim()
    const assembled = rest.length > 0 ? `${first}${splice} ${rest}` : `${first}${splice}`
    return { text: assembled, glitched: true, outburst, correction }
  }

  const comma = trimmed.indexOf(', ')
  if (comma > 12 && comma < trimmed.length - 8) {
    const assembled = `${trimmed.slice(0, comma)} — ${outburst} — ${correction}${trimmed.slice(comma)}`
    return { text: assembled, glitched: true, outburst, correction }
  }

  const pivot = Math.max(12, Math.floor(trimmed.length * 0.45))
  const cut = findWordCut(trimmed, pivot)
  const assembled = `${trimmed.slice(0, cut).replace(/[.,;:\s]+$/, '')}${splice} ${trimmed.slice(cut)}`
  return { text: assembled, glitched: true, outburst, correction }
}

function findWordCut(text: string, hint: number): number {
  const space = text.lastIndexOf(' ', hint)
  return space > 8 ? space : hint
}

export function maybeGlitch(text: string, options: GlitchOptions): GlitchResult {
  const random = options.random ?? Math.random
  if (!options.enabled) {
    return { text, glitched: false, outburst: null, correction: null }
  }
  if (hasGlitchFormatting(text)) {
    return {
      text,
      glitched: true,
      outburst: extractOutburst(text),
      correction: extractCorrection(text)
    }
  }
  if (random() > options.chance) {
    return { text, glitched: false, outburst: null, correction: null }
  }
  return injectGlitch(text, random)
}

export function extractOutburst(text: string): string | null {
  const match = text.match(/[—–-]\s+([A-Z][A-Z\s]{3,}[A-Z])\s+[—–-]/)
  return match?.[1] ?? null
}

export function extractCorrection(text: string): string | null {
  return CORRECTIONS.find((line) => text.includes(line)) ?? null
}

export function tokenizeForStream(text: string): string[] {
  const parts = text.split(/(\s+)/)
  const tokens: string[] = []
  let buffer = ''
  for (const part of parts) {
    buffer += part
    if (part.trim().length === 0) {
      continue
    }
    tokens.push(buffer)
    buffer = ''
  }
  if (buffer.length > 0) {
    tokens.push(buffer)
  }
  return tokens
}
