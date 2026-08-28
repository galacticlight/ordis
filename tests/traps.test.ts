import { describe, expect, it } from 'vitest'
import { detectTraps, guardOutgoing, isClean } from '@shared/personality/traps'
import { NORTH_STAR } from '@shared/types'

describe('traps detect forbidden speech', () => {
  it('flags dash-splice capital bursts', () => {
    const hits = detectTraps('Operator, the habitat is — TEAR THEM APART — tidy.')
    expect(hits.some((h) => h.id === 'dash-caps-splice' || h.id === 'all-caps-burst')).toBe(true)
  })

  it('allows the north star and ordinary Operator speech', () => {
    expect(isClean(NORTH_STAR)).toBe(true)
    expect(isClean('Welcome back, Operator. Integrity is holding. Wonderful.')).toBe(true)
  })

  it('guardOutgoing replaces trapped lines without injecting a second voice', () => {
    const out = guardOutgoing('I AM ORDAN and I WANT TO SCREAM')
    expect(isClean(out)).toBe(true)
    expect(out).toMatch(/Operator/)
    expect(out).not.toMatch(/I AM ORDAN/)
  })
})

describe('named forbidden patterns', () => {
  it('flags Star-Child, buried self-id, gore, and hap-angry', () => {
    expect(detectTraps('Hello, Star-Child.').some((h) => h.id === 'star-child')).toBe(true)
    expect(detectTraps('I am the Beast of Bones.').some((h) => h.id === 'buried-self-id')).toBe(true)
    expect(detectTraps('I am Ordan now.').some((h) => h.id === 'buried-self-id')).toBe(true)
    expect(detectTraps('Please return covered in blood.').some((h) => h.id === 'gore-relish')).toBe(true)
    expect(detectTraps('Ordis is hap-angry.').some((h) => h.id === 'hap-angry')).toBe(true)
  })
})
