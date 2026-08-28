export type VoiceGate = {
  unlocked: boolean
  greeted: boolean
}

export function createVoiceGate(): VoiceGate {
  return { unlocked: false, greeted: false }
}

export function reset(gate: VoiceGate): void {
  gate.unlocked = false
  gate.greeted = false
}

export function canSpeak(gate: VoiceGate): boolean {
  return gate.unlocked
}

/** Sticky: the Operator already woke Ordis. Tucking does not lock again. */
export function unlock(gate: VoiceGate): void {
  gate.unlocked = true
}

/**
 * True only the first time an unlocked gate still owes the launch greeting.
 * Call only when that greeting text is in hand so a pre-ready wake can still greet once.
 */
export function consumeGreeting(gate: VoiceGate): boolean {
  if (!gate.unlocked || gate.greeted) return false
  gate.greeted = true
  return true
}
