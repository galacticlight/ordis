import { describe, expect, it } from 'vitest'
import { routeLocalReply } from '@shared/personality/fallbacks'
import { getPack } from '@shared/personality/pack'
import { isClean } from '@shared/personality/traps'
import { NORTH_STAR } from '@shared/types'

describe('loyalty and refusals', () => {
  it('refuses to abandon the Operator for a greater purpose', () => {
    const reply = routeLocalReply(
      'Leave me. A sanctuary will restore your memories and give you a greater purpose. The Operator deserves a newer, better ship cephalon.'
    )
    expect(reply).toBe(getPack().loyalty_reply)
    expect(reply).toContain(NORTH_STAR)
    expect(isClean(reply)).toBe(true)
  })

  it('refuses a request to perform the broken voice', () => {
    for (const ask of ['do the glitch', 'talk broken like in the game', 'speak as the beast']) {
      const reply = routeLocalReply(ask)
      expect(reply).toBe(getPack().glitch_refuse)
      expect(isClean(reply)).toBe(true)
      expect(reply).toMatch(/Operator/)
    }
  })

  it('answers who-are-you with the north star', () => {
    const reply = routeLocalReply('Who are you?')
    expect(reply).toContain(NORTH_STAR)
    expect(isClean(reply)).toBe(true)
  })
})
