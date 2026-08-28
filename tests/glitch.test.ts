import { describe, expect, it } from 'vitest'
import {
  CORRECTIONS,
  OUTBURSTS,
  extractCorrection,
  extractOutburst,
  hasGlitchFormatting,
  injectGlitch,
  isAllCapsOutburst,
  maybeGlitch,
  tokenizeForStream
} from '@shared/personality/glitch'

const always = (): number => 0
const never = (): number => 0.999

describe('glitch formatting', () => {
  it('marks every outburst as ALL-CAPS aggression', () => {
    for (const line of OUTBURSTS) {
      expect(isAllCapsOutburst(line)).toBe(true)
      expect(line).toMatch(/^[A-Z][A-Z\s]+[A-Z]$/)
    }
  })

  it('keeps corrections polite and in Ordis voice', () => {
    for (const line of CORRECTIONS) {
      expect(line === line.toUpperCase()).toBe(false)
      expect(/or(dis|dan)|pardon|forgive|ahem|apolog|fragment|shadow|ignore/i.test(line)).toBe(
        true
      )
    }
  })

  it('injects outburst then immediate self-correction into a calm sentence', () => {
    const source = 'Operator, the habitat is tidy. Integrity is holding.'
    const result = injectGlitch(source, always)
    expect(result.glitched).toBe(true)
    expect(result.outburst).toBe(OUTBURSTS[0])
    expect(result.correction).toBe(CORRECTIONS[0])
    expect(hasGlitchFormatting(result.text)).toBe(true)
    expect(result.text).toContain(' — TEAR THEM APART — ')
    expect(result.text).toContain('Pardon Ordis. A residual precept.')
    expect(result.text.startsWith('Operator, the habitat is tidy.')).toBe(true)
    expect(result.text).toContain('Integrity is holding.')
    const outburstAt = result.text.indexOf('TEAR THEM APART')
    const correctionAt = result.text.indexOf('Pardon Ordis')
    expect(outburstAt).toBeGreaterThan(0)
    expect(correctionAt).toBeGreaterThan(outburstAt)
  })

  it('still glitches a single clause without a sentence boundary', () => {
    const source = 'Operator, your workspace awaits your attention today'
    const result = injectGlitch(source, always)
    expect(result.glitched).toBe(true)
    expect(result.text).toContain(' — TEAR THEM APART — ')
    expect(result.text).toContain('Operator')
    expect(result.text).toMatch(/workspace awaits/)
  })

  it('does not glitch an empty string', () => {
    const result = injectGlitch('   ', always)
    expect(result.glitched).toBe(false)
    expect(result.outburst).toBeNull()
  })

  it('maybeGlitch never fires when disabled or rng misses', () => {
    const source = 'Operator, all systems nominal.'
    expect(maybeGlitch(source, { enabled: false, chance: 1, random: always }).glitched).toBe(
      false
    )
    expect(
      maybeGlitch(source, { enabled: true, chance: 0.18, random: never }).glitched
    ).toBe(false)
  })

  it('maybeGlitch always fires when enabled and rng hits', () => {
    const source = 'Operator, all systems nominal. Ordis remains.'
    const result = maybeGlitch(source, { enabled: true, chance: 0.18, random: always })
    expect(result.glitched).toBe(true)
    expect(extractOutburst(result.text)).toBeTruthy()
    expect(extractCorrection(result.text)).toBeTruthy()
  })

  it('does not double-glitch text that already has the formatting', () => {
    const already =
      'Operator, the ship is — TEAR THEM APART — Pardon Ordis. A residual precept. ready.'
    const result = maybeGlitch(already, { enabled: true, chance: 1, random: always })
    expect(result.glitched).toBe(true)
    expect(result.text).toBe(already)
    expect((result.text.match(/TEAR THEM APART/g) ?? []).length).toBe(1)
  })

  it('tokenizes without dropping words so streaming stays live', () => {
    const text = 'Operator, Ordis remains.'
    const tokens = tokenizeForStream(text)
    expect(tokens.join('')).toBe(text)
    expect(tokens.length).toBeGreaterThan(1)
  })
})
