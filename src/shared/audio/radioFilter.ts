export interface RadioParams {
  sampleRate: number
  highpassHz: number
  lowpassHz: number
  presenceHz: number
  presenceGain: number
  amHz: number
  amDepth: number
}

/** Matches personality/voice.profile.json radio_filter once enabled. */
export const DEFAULT_RADIO: Omit<RadioParams, 'sampleRate'> = {
  highpassHz: 520,
  lowpassHz: 3300,
  presenceHz: 1750,
  presenceGain: 2.2,
  amHz: 72,
  amDepth: 0.14
}

function onePoleAlpha(cutoffHz: number, sampleRate: number): number {
  const nyquist = sampleRate / 2
  const hz = Math.min(Math.max(cutoffHz, 1), nyquist * 0.98)
  const a = 1 - Math.exp((-2 * Math.PI * hz) / sampleRate)
  if (!Number.isFinite(a)) return 0
  if (a < 0) return 0
  if (a > 1) return 1
  return a
}

function softClip(sample: number): number {
  if (!Number.isFinite(sample)) return 0
  const t = Math.tanh(sample)
  if (t > 0.95) return 0.95
  if (t < -0.95) return -0.95
  return t
}

export function modulateRadio(input: Float32Array, params: RadioParams): Float32Array {
  const out = new Float32Array(input.length)
  const sr = params.sampleRate
  if (!Number.isFinite(sr) || sr < 1 || input.length === 0) {
    for (let i = 0; i < out.length; i++) out[i] = 0
    return out
  }

  const hpA = onePoleAlpha(params.highpassHz, sr)
  const lpA = onePoleAlpha(params.lowpassHz, sr)
  const presA = onePoleAlpha(params.presenceHz, sr)
  const mix = Number.isFinite(params.presenceGain) ? Math.max(0, params.presenceGain - 1) : 0
  const depth = Number.isFinite(params.amDepth) ? params.amDepth : 0
  const amHz = Number.isFinite(params.amHz) ? params.amHz : 0
  const twoPiAm = (2 * Math.PI * amHz) / sr

  let hpLp = 0
  let lp = 0
  let presLp = 0
  let presBp = 0

  for (let i = 0; i < input.length; i++) {
    const x = Number.isFinite(input[i]!) ? input[i]! : 0
    hpLp += hpA * (x - hpLp)
    const hp = x - hpLp
    lp += lpA * (hp - lp)
    presLp += presA * (lp - presLp)
    const presHp = lp - presLp
    presBp += presA * (presHp - presBp)
    const peaked = lp + mix * presBp
    const am = 1 + depth * Math.sin(twoPiAm * i)
    out[i] = softClip(peaked * am)
  }
  return out
}
