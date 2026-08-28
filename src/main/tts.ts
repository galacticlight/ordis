import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { DEFAULT_RADIO, modulateRadio } from '../shared/audio/radioFilter'
import { float32ToInt16, int16ToFloat32, parsePcm16Wav } from '../shared/audio/wav'

const ESPEAK_ARGS = ['-v', 'en+m3', '-s', '138', '-p', '38', '--stdout', '--'] as const
const SPAWN_TIMEOUT_MS = 20_000
const PATH_CANDIDATES = ['espeak-ng', '/usr/bin/espeak-ng', '/usr/local/bin/espeak-ng', '/opt/homebrew/bin/espeak-ng']

let cachedBin: string | null | undefined
let epoch = 0
let pumping = false
let activeChild: ChildProcess | null = null

type TtsResult = { sampleRate: number; pcm: Int16Array }

type Job = {
  text: string
  epoch: number
  resolve: (value: TtsResult | null) => void
}

const jobs: Job[] = []

function probeBin(bin: string): boolean {
  if (bin.includes('/') && !existsSync(bin)) return false
  try {
    const probed = spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: 4000 })
    return !probed.error
  } catch {
    return false
  }
}

function findEspeak(): string | null {
  for (const candidate of PATH_CANDIDATES) {
    if (probeBin(candidate)) return candidate
  }
  try {
    const which = spawnSync('which', ['espeak-ng'], { encoding: 'utf8', timeout: 4000 })
    const path = which.stdout?.trim()
    if (which.status === 0 && path && existsSync(path) && probeBin(path)) return path
  } catch {
    // PATH lookup is best-effort
  }
  return null
}

function espeakBin(): string | null {
  if (cachedBin === undefined) cachedBin = findEspeak()
  return cachedBin
}

export function ttsAvailable(): boolean {
  return espeakBin() !== null
}

export function cancelTtsQueue(): void {
  epoch += 1
  while (jobs.length > 0) {
    jobs.shift()?.resolve(null)
  }
  if (activeChild && !activeChild.killed) {
    try {
      activeChild.kill('SIGKILL')
    } catch {
      // already gone
    }
  }
}

function captureStdout(text: string, bin: string): Promise<Buffer | null> {
  return new Promise((resolve) => {
    let child: ChildProcess
    try {
      child = spawn(bin, [...ESPEAK_ARGS, text], {
        stdio: ['ignore', 'pipe', 'pipe']
      })
    } catch {
      resolve(null)
      return
    }
    activeChild = child
    const chunks: Buffer[] = []
    let settled = false
    const finish = (value: Buffer | null): void => {
      if (settled) return
      settled = true
      if (activeChild === child) activeChild = null
      clearTimeout(timer)
      resolve(value)
    }
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        // hang kill is best-effort
      }
    }, SPAWN_TIMEOUT_MS)
    child.stdout?.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })
    child.stderr?.resume()
    child.on('error', () => finish(null))
    child.on('close', (code) => {
      if (code !== 0 && chunks.length === 0) {
        finish(null)
        return
      }
      finish(Buffer.concat(chunks))
    })
  })
}

export async function synthesizeRadio(text: string): Promise<TtsResult | null> {
  const trimmed = text.trim()
  if (!trimmed) return null
  const bin = espeakBin()
  if (!bin) return null
  try {
    const raw = await captureStdout(trimmed, bin)
    if (!raw || raw.byteLength < 44) return null
    const wav = parsePcm16Wav(raw)
    const floats = int16ToFloat32(wav.pcm)
    const filtered = modulateRadio(floats, { sampleRate: wav.sampleRate, ...DEFAULT_RADIO })
    return { sampleRate: wav.sampleRate, pcm: float32ToInt16(filtered) }
  } catch {
    return null
  }
}

async function pump(): Promise<void> {
  if (pumping) return
  pumping = true
  try {
    while (jobs.length > 0) {
      const job = jobs.shift()
      if (!job) break
      if (job.epoch !== epoch) {
        job.resolve(null)
        continue
      }
      let result: TtsResult | null = null
      try {
        result = await synthesizeRadio(job.text)
      } catch {
        result = null
      }
      job.resolve(job.epoch === epoch ? result : null)
    }
  } finally {
    pumping = false
    if (jobs.length > 0) void pump()
  }
}

/** One utterance at a time. Cancelled jobs resolve null. */
export function enqueueSynthesize(text: string): Promise<TtsResult | null> {
  const trimmed = text.trim()
  if (!trimmed) return Promise.resolve(null)
  const myEpoch = epoch
  return new Promise((resolve) => {
    jobs.push({ text: trimmed, epoch: myEpoch, resolve })
    void pump()
  })
}
