import { mkdirSync } from "node:fs"
import { DEFAULT_RADIO, modulateRadio } from "../shared/audio/radioFilter"
import { float32ToInt16 } from "../shared/audio/wav"

export const KOKORO_MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX"
export const KOKORO_VOICES = ["am_michael", "am_puck"] as const
export type KokoroVoice = (typeof KOKORO_VOICES)[number]
export const KOKORO_VOICE: KokoroVoice = "am_michael"

type TtsResult = { sampleRate: number; pcm: Int16Array }

type KokoroHandle = {
  generate: (
    text: string,
    options: { voice: KokoroVoice; speed: number }
  ) => Promise<{ audio?: Float32Array; sampling_rate?: number }>
}

let cacheDir: string | null = null
let loading: Promise<KokoroHandle | null> | null = null
let instance: KokoroHandle | null = null

export function kokoroVoice(id?: string | null): KokoroVoice {
  return id === "am_puck" ? "am_puck" : "am_michael"
}

export function setKokoroCache(dir: string): void {
  cacheDir = dir
}

export function kokoroReady(): boolean {
  return instance !== null
}

async function loadKokoro(): Promise<KokoroHandle | null> {
  try {
    const mod = await import("kokoro-js")
    if (cacheDir) {
      mkdirSync(cacheDir, { recursive: true })
      if (mod.env && typeof mod.env === "object") {
        const env = mod.env as { cacheDir?: string }
        env.cacheDir = cacheDir
      }
    }
    const tts = await mod.KokoroTTS.from_pretrained(KOKORO_MODEL_ID, {
      dtype: "q8",
      device: "wasm"
    })
    return tts as unknown as KokoroHandle
  } catch {
    return null
  }
}

export function warmupKokoro(): void {
  if (instance || loading) return
  loading = loadKokoro().then((handle) => {
    instance = handle
    return handle
  })
}

export async function synthesizeKokoro(text: string): Promise<TtsResult | null> {
  const trimmed = text.trim()
  if (!trimmed) return null
  if (!instance) {
    if (!loading) warmupKokoro()
    return null
  }
  try {
    const raw = await instance.generate(trimmed, { voice: KOKORO_VOICE, speed: 1 })
    const audio = raw.audio
    const sampleRate = raw.sampling_rate
    if (!audio || !sampleRate || audio.length < 16) return null
    const filtered = modulateRadio(audio, { sampleRate, ...DEFAULT_RADIO })
    return { sampleRate, pcm: float32ToInt16(filtered) }
  } catch {
    return null
  }
}
