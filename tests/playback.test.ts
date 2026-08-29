import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { osPlaybackCandidates, playbackArgs, resolvePlaybackBin } from '../src/main/playback'

const root = process.cwd()
const CUBE_SEAL = {
  avatar: '8fad917c87f41e31f5db2cc25941470652922900cd06ac4377efb5df07d9978a',
  overlayCss: 'e9ba70053a3c61f7613db58202c783b2d0d133642e5d43ce830886ab61da00c3'
}

function sha256(rel: string): string {
  return createHash('sha256').update(readFileSync(join(root, rel))).digest('hex')
}

describe('main-process audible playback', () => {
  it('uses afplay on darwin and paplay/aplay on linux', () => {
    expect(osPlaybackCandidates('darwin')[0]).toContain('afplay')
    expect(osPlaybackCandidates('linux')).toContain('paplay')
    expect(osPlaybackCandidates('linux')).toContain('aplay')
    expect(resolvePlaybackBin('darwin', (bin) => bin.includes('afplay'))).toContain('afplay')
    expect(resolvePlaybackBin('linux', (bin) => bin === 'paplay')).toBe('paplay')
    expect(resolvePlaybackBin('linux', (bin) => bin === 'aplay')).toBe('aplay')
    expect(playbackArgs('aplay', '/tmp/x.wav')).toEqual(['-q', '/tmp/x.wav'])
    expect(playbackArgs('afplay', '/tmp/x.wav')).toEqual(['/tmp/x.wav'])
    const playback = readFileSync(join(root, 'src/main/playback.ts'), 'utf8')
    expect(playback).toContain('afplay')
    expect(playback).toContain('paplay')
    expect(playback).toContain('aplay')
    expect(playback).toContain('console.error')
    expect(playback.toLowerCase()).not.toMatch(/warframe|digital extremes/)
    const main = readFileSync(join(root, 'src/main/index.ts'), 'utf8')
    expect(main).toContain('startOsPlayback')
    expect(main).toContain('speakers')
  })

  it('keeps overlay AudioContext resume on wake/hover/click/keydown', () => {
    const overlay = readFileSync(join(root, 'src/renderer/src/overlay.ts'), 'utf8')
    expect(overlay).toContain('resumePlayback')
    expect(overlay).toContain("addEventListener('keydown'")
    expect(overlay).toContain("addEventListener('pointerdown'")
    expect(overlay).toContain("hit.addEventListener('mouseenter'")
    expect(overlay).toContain("hit.addEventListener('click'")
    expect(overlay).toContain('ac.resume()')
    expect(overlay).toContain('console.error')
    expect(overlay).toContain('setVoiceAmp')
    expect(overlay).toContain('payload.speakers')
    const tts = readFileSync(join(root, 'src/main/tts.ts'), 'utf8')
    expect(tts).toContain('synthesizeKokoro')
    expect(tts).toContain('kokoroReady')
    expect(tts).toMatch(/spawn\(bin,\s*\[\.\.\.ESPEAK_ARGS/)
  })

  it('does not change cube-seal files', () => {
    expect(sha256('src/renderer/src/avatar/OrdisAvatar.ts')).toBe(CUBE_SEAL.avatar)
    expect(sha256('src/renderer/src/overlay.css')).toBe(CUBE_SEAL.overlayCss)
  })
})
