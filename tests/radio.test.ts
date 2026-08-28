import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_RADIO, modulateRadio } from '@shared/audio/radioFilter'
import { int16ToFloat32, parsePcm16Wav, writePcm16Wav } from '@shared/audio/wav'
import { DEFAULT_SETTINGS } from '@shared/types'

function magAt(samples: Float32Array, sampleRate: number, freq: number): number {
  let re = 0
  let im = 0
  const w = (2 * Math.PI * freq) / sampleRate
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i]!
    re += x * Math.cos(w * i)
    im += x * Math.sin(w * i)
  }
  return Math.hypot(re, im) / samples.length
}

describe('modulateRadio', () => {
  it('reduces low-band energy and keeps presence energy on a mixed sine', () => {
    const sampleRate = 22050
    const n = sampleRate
    const raw = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const t = i / sampleRate
      raw[i] = 0.4 * Math.sin(2 * Math.PI * 120 * t) + 0.4 * Math.sin(2 * Math.PI * 1800 * t)
    }
    const out = modulateRadio(raw, { sampleRate, ...DEFAULT_RADIO })
    expect(magAt(out, sampleRate, 120)).toBeLessThan(magAt(raw, sampleRate, 120) * 0.55)
    expect(magAt(out, sampleRate, 1800)).toBeGreaterThan(magAt(raw, sampleRate, 1800) * 0.35)
  })

  it('stays finite and inside [-1, 1]', () => {
    const sampleRate = 22050
    const raw = new Float32Array(2048)
    for (let i = 0; i < raw.length; i++) {
      raw[i] = Math.sin((2 * Math.PI * 1800 * i) / sampleRate) * 1.8
    }
    const out = modulateRadio(raw, { sampleRate, ...DEFAULT_RADIO })
    expect(out.length).toBe(raw.length)
    for (let i = 0; i < out.length; i++) {
      const y = out[i]!
      expect(Number.isFinite(y)).toBe(true)
      expect(y).toBeLessThanOrEqual(1)
      expect(y).toBeGreaterThanOrEqual(-1)
    }
  })
})

describe('pcm16 wav', () => {
  it('roundtrips sampleRate, mono, and int16 samples', () => {
    const pcm = new Int16Array([0, 1, -1, 32767, -32768, 42, -30000])
    const wav = writePcm16Wav(pcm, 22050, 1)
    const parsed = parsePcm16Wav(wav)
    expect(parsed.sampleRate).toBe(22050)
    expect(parsed.channels).toBe(1)
    expect(Array.from(parsed.pcm)).toEqual(Array.from(pcm))
  })

  it('parses fmt extras and skipped chunks without assuming a 44-byte header', () => {
    const pcm = new Int16Array([12, -34, 56, -78])
    const dataBytes = pcm.byteLength
    // RIFF + fmt(size 18) + JUNK(4) + data
    const bytes = new Uint8Array(12 + 8 + 18 + 8 + 4 + 8 + dataBytes)
    const view = new DataView(bytes.buffer)
    const stamp = (at: number, text: string): void => {
      for (let i = 0; i < text.length; i++) bytes[at + i] = text.charCodeAt(i)
    }
    stamp(0, 'RIFF')
    view.setUint32(4, bytes.byteLength - 8, true)
    stamp(8, 'WAVE')
    stamp(12, 'fmt ')
    view.setUint32(16, 18, true)
    view.setUint16(20, 1, true)
    view.setUint16(22, 1, true)
    view.setUint32(24, 16000, true)
    view.setUint32(28, 32000, true)
    view.setUint16(32, 2, true)
    view.setUint16(34, 16, true)
    view.setUint16(36, 0, true)
    stamp(38, 'JUNK')
    view.setUint32(42, 4, true)
    view.setUint32(46, 0, true)
    stamp(50, 'data')
    view.setUint32(54, dataBytes, true)
    bytes.set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength), 58)
    const parsed = parsePcm16Wav(bytes)
    expect(parsed.sampleRate).toBe(16000)
    expect(parsed.channels).toBe(1)
    expect(Array.from(parsed.pcm)).toEqual(Array.from(pcm))
  })

  it('int16 converts into [-1, 1]', () => {
    const pcm = new Int16Array([-32768, 0, 32767])
    const f = int16ToFloat32(pcm)
    expect(f[0]).toBe(-1)
    expect(f[1]).toBe(0)
    expect(f[2]!).toBeLessThanOrEqual(1)
    expect(f[2]!).toBeGreaterThan(0.99)
  })
})

describe('radio path constraints', () => {
  it('radioFilter source omits banned dsp names', () => {
    const src = readFileSync(join(process.cwd(), 'src/shared/audio/radioFilter.ts'), 'utf8')
    for (const banned of ['bitcrush', 'stutter', 'dual-voice', 'shout']) {
      expect(src.toLowerCase()).not.toContain(banned)
    }
  })

  it('defaults voice out on and voice in off', () => {
    expect(DEFAULT_SETTINGS.voiceOutEnabled).toBe(true)
    expect(DEFAULT_SETTINGS.voiceInEnabled).toBe(false)
  })
})
