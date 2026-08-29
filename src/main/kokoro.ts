import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_RADIO, modulateRadio } from '../shared/audio/radioFilter'
import { float32ToInt16 } from '../shared/audio/wav'

export const KOKORO_MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX'
export const KOKORO_VOICES = ['am_michael', 'am_puck'] as const
export type KokoroVoice = (typeof KOKORO_VOICES)[number]
export const KOKORO_VOICE: KokoroVoice = 'am_michael'
export const KOKORO_DTYPE = 'q8' as const
export const KOKORO_DEVICE = 'cpu' as const

type TtsResult = { sampleRate: number; pcm: Int16Array }

type KokoroHandle = {
  generate: (
    text: string,
    options: { voice: KokoroVoice; speed: number }
  ) => Promise<{ audio?: Float32Array; sampling_rate?: number }>
}

type TransformersEnv = {
  cacheDir?: string
  allowRemoteModels: boolean
  allowLocalModels: boolean
  localModelPath: string
  useFSCache?: boolean
}

let cacheDir: string | null = null
let loading: Promise<KokoroHandle | null> | null = null
let instance: KokoroHandle | null = null

export function kokoroVoice(id?: string | null): KokoroVoice {
  return id === 'am_puck' ? 'am_puck' : 'am_michael'
}

export function setKokoroCache(dir: string): void {
  cacheDir = dir
}

export function kokoroReady(): boolean {
  return instance !== null
}

function resourceRoots(): string[] {
  const roots: string[] = []
  if (typeof process.resourcesPath === 'string' && process.resourcesPath.length > 0) {
    roots.push(process.resourcesPath)
  }
  roots.push(join(process.cwd(), 'vendor/voice'))
  return roots
}

export function kokoroLocalModelRoots(): string[] {
  return resourceRoots().map((root) => join(root, 'kokoro'))
}

function hasVendoredQ8(root: string): boolean {
  return existsSync(join(root, KOKORO_MODEL_ID, 'onnx', 'model_quantized.onnx'))
}

async function transformersEnv(): Promise<TransformersEnv> {
  const hf = await import('@huggingface/transformers')
  return hf.env as TransformersEnv
}

async function configureLocalWeights(): Promise<boolean> {
  const hfEnv = await transformersEnv()
  hfEnv.allowLocalModels = true
  if (cacheDir) {
    mkdirSync(cacheDir, { recursive: true })
    hfEnv.cacheDir = cacheDir
    hfEnv.useFSCache = true
  }
  const local = kokoroLocalModelRoots().find(hasVendoredQ8)
  if (local) {
    hfEnv.localModelPath = local.endsWith('/') ? local : `${local}/`
    hfEnv.allowRemoteModels = false
    return true
  }
  if (cacheDir && existsSync(join(cacheDir, KOKORO_MODEL_ID, 'onnx', 'model_quantized.onnx'))) {
    hfEnv.localModelPath = cacheDir.endsWith('/') ? cacheDir : `${cacheDir}/`
    hfEnv.allowRemoteModels = false
    return true
  }
  hfEnv.allowRemoteModels = false
  return false
}

async function loadKokoro(): Promise<KokoroHandle | null> {
  try {
    const vendored = await configureLocalWeights()
    if (!vendored) {
      console.error('Ordis Kokoro load missed: vendored q8 ONNX not found in extraResources or cache')
      return null
    }
    const mod = await import('kokoro-js')
    const tts = await mod.KokoroTTS.from_pretrained(KOKORO_MODEL_ID, {
      dtype: KOKORO_DTYPE,
      device: KOKORO_DEVICE
    })
    return tts as unknown as KokoroHandle
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    console.error('Ordis Kokoro load missed:', detail)
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
    if (loading) {
      instance = await loading
    }
  }
  if (!instance) {
    console.error('Ordis Kokoro synth missed: model is not loaded')
    return null
  }
  try {
    const raw = await instance.generate(trimmed, { voice: KOKORO_VOICE, speed: 1 })
    const audio = raw.audio
    const sampleRate = raw.sampling_rate
    if (!audio || !sampleRate || audio.length < 16) {
      console.error('Ordis Kokoro synth missed: empty audio')
      return null
    }
    const filtered = modulateRadio(audio, { sampleRate, ...DEFAULT_RADIO })
    return { sampleRate, pcm: float32ToInt16(filtered) }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    console.error('Ordis Kokoro synth missed:', detail)
    return null
  }
}
