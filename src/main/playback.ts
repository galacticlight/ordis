import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writePcm16Wav } from '../shared/audio/wav'

const SPAWN_TIMEOUT_MS = 30_000

export function osPlaybackCandidates(platform = process.platform): string[] {
  if (platform === 'darwin') return ['/usr/bin/afplay', 'afplay']
  if (platform === 'linux') return ['paplay', 'aplay', '/usr/bin/paplay', '/usr/bin/aplay']
  return []
}

export function playbackArgs(bin: string, file: string): string[] {
  const name = (bin.split(/[/\\]/).pop() ?? bin).toLowerCase()
  if (name === 'aplay') return ['-q', file]
  return [file]
}

export function playbackWavDir(userData?: string): string {
  const root = userData && userData.length > 0 ? userData : tmpdir()
  return join(root, 'tts-playback')
}

function defaultProbe(bin: string): boolean {
  try {
    if (bin.includes('/') && !existsSync(bin)) return false
    if (bin.includes('/')) return true
    const which = spawnSync('which', [bin], { encoding: 'utf8', timeout: 3000 })
    return which.status === 0 && Boolean(which.stdout?.trim())
  } catch (error) {
    console.error('Ordis playback probe failed', error)
    return false
  }
}

export function resolvePlaybackBin(
  platform = process.platform,
  probe: (bin: string) => boolean = defaultProbe
): string | null {
  for (const bin of osPlaybackCandidates(platform)) {
    if (probe(bin)) return bin
  }
  return null
}

let chain: Promise<void> = Promise.resolve()

function runPlayer(bin: string, file: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let child
    try {
      child = spawn(bin, playbackArgs(bin, file), { stdio: ['ignore', 'ignore', 'pipe'] })
    } catch (error) {
      reject(error)
      return
    }
    let settled = false
    const finish = (error?: Error): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error) reject(error)
      else resolve()
    }
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        // hang kill is best-effort
      }
      finish(new Error(`Ordis playback ${bin} timed out`))
    }, SPAWN_TIMEOUT_MS)
    child.stderr?.resume()
    child.on('error', (error) => finish(error instanceof Error ? error : new Error(String(error))))
    child.on('close', (code) => {
      if (code !== 0) {
        finish(new Error(`Ordis playback ${bin} exited ${code}`))
        return
      }
      finish()
    })
  })
}

/**
 * Queue OS-level playback that does not depend on renderer Autoplay.
 * Returns true if a player was found and a wav was queued.
 */
export function startOsPlayback(pcm: Int16Array, sampleRate: number, userData?: string): boolean {
  const bin = resolvePlaybackBin()
  if (!bin) {
    console.error('Ordis playback: no afplay/paplay/aplay found; main-process speakers silent')
    return false
  }
  if (pcm.length === 0 || sampleRate < 1) {
    console.error('Ordis playback: empty PCM, skipping')
    return false
  }
  const dir = playbackWavDir(userData)
  try {
    mkdirSync(dir, { recursive: true })
  } catch (error) {
    console.error('Ordis playback: could not create wav dir', error)
    return false
  }
  const file = join(dir, `ordis-${Date.now()}-${Math.random().toString(16).slice(2, 10)}.wav`)
  try {
    writeFileSync(file, writePcm16Wav(pcm, sampleRate))
  } catch (error) {
    console.error('Ordis playback: could not write wav', error)
    return false
  }
  chain = chain
    .then(() => runPlayer(bin, file))
    .catch((error) => {
      console.error('Ordis playback failed', error)
    })
    .finally(() => {
      try {
        unlinkSync(file)
      } catch {
        // leftover wav is non-fatal
      }
    })
  return true
}
