import { describe, expect, it } from 'vitest'
import { canSpeak, consumeGreeting, createVoiceGate, reset, unlock } from '@shared/audio/voiceGate'

describe('voiceGate', () => {
  it('stays locked with no speak until unlock, greets once, and tuck does not re-greet', () => {
    const gate = createVoiceGate()
    expect(canSpeak(gate)).toBe(false)
    expect(consumeGreeting(gate)).toBe(false)

    unlock(gate)
    expect(canSpeak(gate)).toBe(true)
    expect(consumeGreeting(gate)).toBe(true)
    expect(canSpeak(gate)).toBe(true)
    expect(consumeGreeting(gate)).toBe(false)

    // tuck: do not reset; later replies still speak; greeting stays consumed
    expect(canSpeak(gate)).toBe(true)
    unlock(gate)
    expect(consumeGreeting(gate)).toBe(false)

    reset(gate)
    expect(canSpeak(gate)).toBe(false)
    expect(consumeGreeting(gate)).toBe(false)
    unlock(gate)
    expect(consumeGreeting(gate)).toBe(true)
  })

  it('does not consume a greeting if the Operator has not woken Ordis', () => {
    const gate = createVoiceGate()
    expect(canSpeak(gate)).toBe(false)
    expect(consumeGreeting(gate)).toBe(false)
    expect(gate.greeted).toBe(false)
  })
})
