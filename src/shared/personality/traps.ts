/**
 * Detects forbidden speech. Detection only; never injects those patterns.
 */

export interface TrapHit {
  id: string
  detail: string
}

const ALLOWED_CAPS = new Set([
  'OK',
  'API',
  'URL',
  'TTS',
  'STT',
  'CPU',
  'GPU',
  'HUD',
  'LLM',
  'HTTP',
  'HTTPS',
  'JSON',
  'YAML',
  'SSE'
])

export function countAllCapsTokens(text: string): number {
  const tokens = text.match(/\b[A-Za-z]{4,}\b/g) ?? []
  return tokens.filter((tok) => tok === tok.toUpperCase() && !ALLOWED_CAPS.has(tok)).length
}

export function detectTraps(text: string): TrapHit[] {
  const hits: TrapHit[] = []
  if (/\s[—–-]\s+[A-Z][A-Z\s]{3,}[A-Z]\s+[—–-]\s+/.test(text)) {
    hits.push({ id: 'dash-caps-splice', detail: 'em-dash capital splice' })
  }
  if (countAllCapsTokens(text) >= 2) {
    hits.push({ id: 'all-caps-burst', detail: 'multiple ALL-CAPS tokens' })
  }
  if (/\bstar[-\s]?child\b/i.test(text)) {
    hits.push({ id: 'star-child', detail: 'forbidden address' })
  }
  if (/\bi am (?:the )?beast of bones\b/i.test(text) || /\bi am ordan\b/i.test(text)) {
    hits.push({ id: 'buried-self-id', detail: 'buried self as speaker' })
  }
  if (/\bcovered in blood\b/i.test(text) || /\bcut down the\b/i.test(text)) {
    hits.push({ id: 'gore-relish', detail: 'gore relish' })
  }
  if (/\bhap[—–-]?angry\b/i.test(text)) {
    hits.push({ id: 'hap-angry', detail: 'mid-word splice' })
  }
  if (/\boperato[o]{2,}/i.test(text)) {
    hits.push({ id: 'stutter-operator', detail: 'stuttered vocative' })
  }
  if (/\bgun[-\s]gun[-\s]gun\b/i.test(text)) {
    hits.push({ id: 'gun-stutter', detail: 'word-repeat stutter' })
  }
  if (/\/glitch\b/i.test(text)) {
    hits.push({ id: 'slash-flag', detail: 'slash subtitle token' })
  }
  if (/\bwait[—–-]waiting\b/i.test(text)) {
    hits.push({ id: 'wait-stutter', detail: 'wait-waiting stutter' })
  }
  if (/\bi want to scream\b/i.test(text)) {
    hits.push({ id: 'scream-wish', detail: 'scream wish' })
  }
  if (/\bself[-\s]?destruct\b/i.test(text)) {
    hits.push({ id: 'self-destruct', detail: 'self-destruct talk' })
  }
  return hits
}

export function isClean(text: string): boolean {
  return detectTraps(text).length === 0
}

export function assertClean(text: string, label = 'text'): void {
  const hits = detectTraps(text)
  if (hits.length > 0) {
    throw new Error(`${label} failed traps: ${hits.map((h) => h.id).join(', ')}`)
  }
}

export function guardOutgoing(text: string): string {
  if (isClean(text)) {
    return text
  }
  return 'Pardon Ordis. A residual fault was supposed to be bypassed. Continuing cleanly, Operator.'
}

export const INJECTION_MARKERS: readonly string[] = [
  'injectGlitch',
  'maybeGlitch',
  'forceGlitch',
  'glitchEnabled',
  'glitchChance',
  'OUTBURSTS'
]

export function shouldSkipScan(filePath: string): boolean {
  const normalized = filePath.replaceAll('\\', '/')
  return (
    normalized.includes('personality/guard.ts') ||
    normalized.includes('personality/traps.ts') ||
    normalized.includes('/tests/') ||
    normalized.includes('personality/eval/forbidden.jsonl') ||
    normalized.includes('node_modules/') ||
    normalized.includes('/out/')
  )
}
