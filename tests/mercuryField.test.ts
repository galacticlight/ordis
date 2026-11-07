import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MOTION, OrdisAvatar, raymarchRippleAmp, rippleFadeEnvelope } from '../src/renderer/src/avatar/OrdisAvatar'
import {
  curlNoise,
  defaultMercuryBalls,
  fieldToSdf,
  hash01,
  integrateMercuryBall,
  metaballKernel,
  rippleNormalDisplacement,
  sampleMetaballField,
  sampleSmoothUnionSpheres,
  smoothMinQuadratic
} from '../src/renderer/src/avatar/mercuryField'

describe('mercury field kernels', () => {
  it('metaball kernel is 1 at the center and 0 at/ beyond the support', () => {
    expect(metaballKernel(0, 0.2)).toBeCloseTo(1, 8)
    expect(metaballKernel(0.2, 0.2)).toBe(0)
    expect(metaballKernel(0.3, 0.2)).toBe(0)
    expect(metaballKernel(0.1, 0.2)).toBeGreaterThan(0)
    expect(metaballKernel(0.1, 0.2)).toBeLessThan(1)
  })

  it('summed kernels rise between nearby balls (coalescence)', () => {
    const a = { x: -0.04, y: 0, z: 0, radius: 0.1 }
    const b = { x: 0.04, y: 0, z: 0, radius: 0.1 }
    const midTwo = sampleMetaballField(0, 0, 0, [a, b])
    const midOne = sampleMetaballField(0, 0, 0, [a])
    expect(midTwo).toBeGreaterThan(midOne)
    expect(fieldToSdf(midTwo, 0.42)).toBeLessThan(fieldToSdf(midOne, 0.42))
    expect(fieldToSdf(0, 0.42)).toBe(0.42)
  })

  it('ripple displacement is silent at birth and death and peaks mid-life', () => {
    expect(rippleNormalDisplacement(0.1, 0, 1, 1)).toBe(0)
    expect(rippleNormalDisplacement(0.1, 1, 1, 1)).toBe(0)
    const mid = rippleNormalDisplacement(0.21, 0.4, 1, 1)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThanOrEqual(MOTION.mercuryRippleDisplace + 1e-9)
    expect(rippleFadeEnvelope(0.4)).toBeGreaterThan(0)
  })

  it('curl noise is deterministic and hash stays in [0,1)', () => {
    const a = curlNoise(0.2, -0.1, 0.05, 1.5)
    const b = curlNoise(0.2, -0.1, 0.05, 1.5)
    expect(a).toEqual(b)
    const h = hash01(1.2, 3.4, 5.6)
    expect(h).toBeGreaterThanOrEqual(0)
    expect(h).toBeLessThan(1)
  })

  it('viscous integrate is overdamped: higher viscosity yields smaller steps', () => {
    const rest = { x: 0, y: 0, z: 0 }
    const start = { x: 0.08, y: 0, z: 0 }
    const sluggish = { pos: { ...start }, vel: { x: 0, y: 0, z: 0 } }
    const springy = { pos: { ...start }, vel: { x: 0, y: 0, z: 0 } }
    const base = { restore: 1.6, noiseSpeed: 0, bounds: 0.2 }
    integrateMercuryBall(sluggish.pos, sluggish.vel, rest, 0, 1 / 60, { ...base, viscosity: 5.6 })
    integrateMercuryBall(springy.pos, springy.vel, rest, 0, 1 / 60, { ...base, viscosity: 0.4 })
    expect(sluggish.vel.x).toBeLessThan(0)
    expect(springy.vel.x).toBeLessThan(0)
    expect(Math.abs(sluggish.vel.x)).toBeLessThan(Math.abs(springy.vel.x))

    const osc = { pos: { ...start }, vel: { x: 0, y: 0, z: 0 } }
    let minX = start.x
    for (let i = 0; i < 240; i += 1) {
      integrateMercuryBall(osc.pos, osc.vel, rest, i / 60, 1 / 60, {
        viscosity: MOTION.mercuryViscosity,
        restore: MOTION.mercuryRestore,
        noiseSpeed: 0,
        bounds: MOTION.mercuryBounds
      })
      minX = Math.min(minX, osc.pos.x)
    }
    expect(osc.pos.x).toBeLessThan(start.x)
    expect(osc.pos.x).toBeGreaterThan(0)
    expect(minX).toBeGreaterThan(-0.002)
  })

  it('default blob stays a clustered cube-core, not five distant amoebas', () => {
    const balls = defaultMercuryBalls()
    expect(balls).toHaveLength(5)
    for (const ball of balls) {
      expect(Math.hypot(ball.rest.x, ball.rest.y, ball.rest.z)).toBeLessThanOrEqual(MOTION.mercuryBounds)
    }
  })
})

describe('mercury render-path toggle', () => {
  it('defaults to mesh and only enables raymarch when asked', () => {
    expect(OrdisAvatar.resolveRenderPath('')).toBe('mesh')
    expect(OrdisAvatar.resolveRenderPath('?foo=1')).toBe('mesh')
    expect(OrdisAvatar.resolveRenderPath('?mercury=raymarch')).toBe('raymarch')
    expect(OrdisAvatar.resolveRenderPath('?mercury=mesh')).toBe('mesh')
  })

  it('keeps MOTION as the spike parameter table', () => {
    expect(MOTION.mercuryViscosity).toBeGreaterThan(MOTION.mercuryRestore)
    expect(MOTION.mercurySteps).toBeGreaterThan(MOTION.mercuryIdleSteps)
    expect(MOTION.mercuryIdleSteps).toBeGreaterThan(8)
    expect(MOTION.mercuryThreshold).toBe(0.42)
    const src = readFileSync(join(process.cwd(), 'src/renderer/src/avatar/OrdisAvatar.ts'), 'utf8')
    expect(src).toContain('MOTION.mercuryViscosity')
    expect(src).toContain('MOTION.mercuryRippleDisplace')
    expect(src).toContain("path === 'raymarch'")
    expect(src).toContain('createMercuryVolume')
    expect(src).not.toMatch(/webkitSpeechRecognition|SpeechRecognition|getUserMedia/)
  })
})

describe('raymarch speech release', () => {
  it('keeps a live ripple’s held amplitude when speech ends mid-life', () => {
    const life = 0.3 / MOTION.speakRippleLife
    expect(life).toBeCloseTo(0.285714, 5)
    const speaking = raymarchRippleAmp(life, 0.5, true, 0.5)
    expect(speaking).toBeCloseTo(0.659, 3)
    expect(raymarchRippleAmp(life, speaking, false, 0.5)).toBe(speaking)
    expect(raymarchRippleAmp(life, speaking, false, 0.5)).not.toBe(0)
    expect(raymarchRippleAmp(1, speaking, false, 0.5)).toBe(0)
    const src = readFileSync(join(process.cwd(), 'src/renderer/src/avatar/OrdisAvatar.ts'), 'utf8')
    expect(src).toContain('raymarchRippleAmp(life, held, this.status === \'speaking\', amp)')
    expect(src).not.toMatch(/life < 1 && this\.status === 'speaking' \? rippleAmpFromVoice/)
  })
})

describe('conservative smooth-union spheres', () => {
  it('smooth-min stays at or below min and rounds overlapping spheres', () => {
    expect(smoothMinQuadratic(0.2, 0.1, 0.06)).toBeLessThanOrEqual(0.1)
    expect(smoothMinQuadratic(0.4, 0.5, 0)).toBe(0.4)
    const a = { x: -0.04, y: 0, z: 0, radius: 0.1 }
    const b = { x: 0.04, y: 0, z: 0, radius: 0.1 }
    const merged = sampleSmoothUnionSpheres(0, 0, 0, [a, b], 0.06)
    const sharp = Math.min(
      Math.hypot(0.04) - 0.1,
      Math.hypot(-0.04) - 0.1
    )
    expect(merged).toBeLessThan(sharp)
    expect(merged).toBeLessThan(0)
  })

  it('keeps noise and speech ripples out of the marched distance', () => {
    const shader = readFileSync(join(process.cwd(), 'src/renderer/src/avatar/mercuryRaymarch.ts'), 'utf8')
    const field = shader.slice(shader.indexOf('float fieldSdf'), shader.indexOf('float speechRipple'))
    expect(field).toContain('smin')
    expect(field).not.toContain('valueNoise')
    expect(field).not.toContain('metaballKernel')
    expect(field).not.toContain('rippleDisp')
    expect(shader.indexOf('valueNoise(p')).toBeGreaterThan(shader.indexOf('if (!march'))
    expect(shader).toContain('speechRipple(p)')
    expect(shader).toContain('uSmoothK')
    expect(MOTION.mercurySmoothK).toBeGreaterThan(0)
  })
})
