import { describe, expect, it } from 'vitest'
import {
  MOTION,
  decayVoiceAmp,
  effectiveRippleGap,
  gainVoiceAmp,
  idleBreathOffset,
  idlePrecession,
  rippleAmpFromVoice,
  rippleFadeEnvelope,
  softCorePulse,
  smoothstep01
} from '../src/renderer/src/avatar/OrdisAvatar'

describe('avatar motion envelopes', () => {
  it('smoothstep01 clamps and eases through the middle', () => {
    expect(smoothstep01(-1)).toBe(0)
    expect(smoothstep01(2)).toBe(1)
    expect(smoothstep01(0)).toBe(0)
    expect(smoothstep01(1)).toBe(1)
    expect(smoothstep01(0.5)).toBeCloseTo(0.5, 5)
    // Slope is steeper in the middle than a linear ramp near the ends.
    expect(smoothstep01(0.25)).toBeLessThan(0.25)
    expect(smoothstep01(0.75)).toBeGreaterThan(0.75)
  })

  it('rippleFadeEnvelope attacks softly and releases before life=1', () => {
    expect(rippleFadeEnvelope(0)).toBe(0)
    expect(rippleFadeEnvelope(0.06)).toBeGreaterThan(0)
    expect(rippleFadeEnvelope(0.06)).toBeLessThan(rippleFadeEnvelope(0.2))
    expect(rippleFadeEnvelope(0.95)).toBeLessThan(rippleFadeEnvelope(0.4))
    expect(rippleFadeEnvelope(1)).toBe(0)
  })

  it('idle breath stays within idleBreathWorld and is not a pure single sine', () => {
    const samples: number[] = []
    for (let i = 0; i < 240; i += 1) {
      samples.push(idleBreathOffset(i * 0.05))
    }
    const peak = Math.max(...samples.map(Math.abs))
    expect(peak).toBeLessThanOrEqual(MOTION.idleBreathWorld + 1e-9)
    // A pure period-12 sine would be antisymmetric around t=0 over one half-period;
    // layered periods break that exact symmetry at an off-grid sample.
    const a = idleBreathOffset(1.7)
    const pure = Math.sin((1.7 * Math.PI * 2) / MOTION.idleBreathPeriod) * MOTION.idleBreathWorld
    expect(Math.abs(a - pure)).toBeGreaterThan(1e-6)
  })

  it('idle precession stays within idlePrecessionRad and includes drift', () => {
    let maxYaw = 0
    let maxPitch = 0
    for (let i = 0; i < 400; i += 1) {
      const { yaw, pitch } = idlePrecession(i * 0.05)
      maxYaw = Math.max(maxYaw, Math.abs(yaw))
      maxPitch = Math.max(maxPitch, Math.abs(pitch))
    }
    expect(maxYaw).toBeLessThanOrEqual(MOTION.idlePrecessionRad + 1e-9)
    expect(maxPitch).toBeLessThanOrEqual(MOTION.idlePrecessionRad * 0.55 + 1e-9)
    const at = idlePrecession(4.2)
    const pureYaw =
      Math.sin((4.2 * Math.PI * 2) / MOTION.idlePrecessionPeriod) * MOTION.idlePrecessionRad
    expect(Math.abs(at.yaw - pureYaw)).toBeGreaterThan(1e-6)
  })

  it('softCorePulse respects corePulseAmt and lifts with speak amp', () => {
    const idlePeaks: number[] = []
    const speakPeaks: number[] = []
    for (let i = 0; i < 200; i += 1) {
      idlePeaks.push(softCorePulse(i * 0.05, 0))
      speakPeaks.push(softCorePulse(i * 0.05, 1))
    }
    expect(Math.max(...idlePeaks)).toBeLessThanOrEqual(1 + MOTION.corePulseAmt + 1e-9)
    expect(Math.max(...speakPeaks)).toBeGreaterThan(Math.max(...idlePeaks))
    expect(Math.max(...speakPeaks)).toBeLessThanOrEqual(
      1 + MOTION.corePulseAmt + MOTION.corePulseSpeakBoost + 1e-9
    )
  })

  it('voice amp gain and decay are time-based through MOTION', () => {
    expect(gainVoiceAmp(0)).toBe(0)
    expect(gainVoiceAmp(1)).toBe(1)
    expect(gainVoiceAmp(0.1)).toBeCloseTo(0.5, 5)
    const mid = decayVoiceAmp(1, 0.1)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
    expect(decayVoiceAmp(1, 0)).toBe(1)
    // Two half-steps equal one full step (frame-skip safe).
    const a = decayVoiceAmp(decayVoiceAmp(1, 0.05), 0.05)
    const b = decayVoiceAmp(1, 0.1)
    expect(a).toBeCloseTo(b, 10)
  })

  it('effectiveRippleGap shortens with amplitude but never below the floor', () => {
    const quiet = effectiveRippleGap(0)
    const loud = effectiveRippleGap(1)
    const floor = MOTION.speakRippleLife * MOTION.speakRippleGapFloorFrac
    expect(quiet).toBe(MOTION.speakRippleGap)
    expect(loud).toBeLessThan(quiet)
    expect(loud).toBeGreaterThanOrEqual(floor)
    expect(MOTION.speakRippleGap).toBeGreaterThanOrEqual(MOTION.speakRippleLife)
  })

  it('rippleAmpFromVoice couples live amp and keeps a speaking floor', () => {
    expect(rippleAmpFromVoice(0, false)).toBe(0)
    expect(rippleAmpFromVoice(0, true)).toBe(MOTION.speakAmpFloor)
    expect(rippleAmpFromVoice(1, true)).toBeGreaterThan(MOTION.speakAmpFloor)
    expect(rippleAmpFromVoice(1, true)).toBeLessThanOrEqual(1)
    expect(rippleAmpFromVoice(0.8, false)).toBeCloseTo(0.8 * MOTION.voiceAmpToRipple, 5)
  })

  it('keeps speak-floor wobble and halo lerp tunable via MOTION', async () => {
    expect(MOTION.speakFloorWobbleA).toBeGreaterThan(0)
    expect(MOTION.speakFloorWobbleB).toBeGreaterThan(0)
    expect(MOTION.haloLerpPerSec).toBeGreaterThan(0)
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(join(process.cwd(), 'src/renderer/src/avatar/OrdisAvatar.ts'), 'utf8')
    expect(src).toContain('MOTION.speakFloorWobbleA')
    expect(src).toContain('MOTION.haloLerpPerSec')
    expect(src).not.toMatch(/dt \* 4\b/)
  })
})

describe('avatar motion source guards', () => {
  it('keeps idle frame-skip and leaves voice-in dormant', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(join(process.cwd(), 'src/renderer/src/avatar/OrdisAvatar.ts'), 'utf8')
    expect(src).toContain('idleSkip % 2 === 1')
    expect(src).toContain('powerPreference: \'low-power\'')
    expect(src).toMatch(/TODO\(voice-in\).*STT/s)
    expect(src).not.toMatch(/webkitSpeechRecognition|SpeechRecognition|getUserMedia/)
    expect(src).toContain('uSpeed')
    expect(src).toContain('effectiveRippleGap')
    expect(src).toContain('idleBreathOffset')
  })
})
