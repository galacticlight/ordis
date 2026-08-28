import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { habitatConnectSrc, isHabitatRequestAllowed, overlayContentSecurityPolicy } from '@shared/security/habitatRequest'

const openai = { vocalizerOrigin: 'https://api.openai.com', devOrigin: null }
const vite = { vocalizerOrigin: null, devOrigin: 'http://localhost:5173' }

describe('isHabitatRequestAllowed', () => {
  it('allows the vocalizer path when hostname and https match', () => {
    expect(
      isHabitatRequestAllowed('https://api.openai.com/v1/chat/completions', openai)
    ).toBe(true)
  })

  it('denies prefix-lookalike hosts and query-string origin smuggling', () => {
    expect(isHabitatRequestAllowed('https://api.openai.com.evil.example/v1', openai)).toBe(false)
    expect(isHabitatRequestAllowed('https://evil.example/?u=https://api.openai.com', openai)).toBe(false)
  })

  it('allows matching wss for an https vocalizer host', () => {
    expect(isHabitatRequestAllowed('wss://api.openai.com/v1/realtime', openai)).toBe(true)
    expect(isHabitatRequestAllowed('ws://api.openai.com/v1/realtime', openai)).toBe(false)
  })

  it('allows the exact Vite dev origin and denies a prefix-lookalike', () => {
    expect(isHabitatRequestAllowed('http://localhost:5173/', vite)).toBe(true)
    expect(isHabitatRequestAllowed('ws://localhost:5173/', vite)).toBe(true)
    expect(isHabitatRequestAllowed('http://localhost:5173.evil.example', vite)).toBe(false)
    expect(isHabitatRequestAllowed('http://localhost:5173.evil.example/app', vite)).toBe(false)
  })

  it('keeps file, devtools, blob, and data as scheme allows', () => {
    const none = { vocalizerOrigin: null, devOrigin: null }
    expect(isHabitatRequestAllowed('file:///tmp/overlay.html', none)).toBe(true)
    expect(isHabitatRequestAllowed('devtools://devtools/bundled/index.html', none)).toBe(true)
    expect(isHabitatRequestAllowed('blob:https://evil.example/uuid', none)).toBe(true)
    expect(isHabitatRequestAllowed('data:text/plain,ok', none)).toBe(true)
    expect(isHabitatRequestAllowed('https://evil.example/', none)).toBe(false)
  })
})

describe('overlay CSP', () => {
  it('does not wildcard connect-src to https:', () => {
    const html = readFileSync(join(process.cwd(), 'src/renderer/index.html'), 'utf8')
    const csp = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1]
    expect(csp).toBeTruthy()
    expect(csp).not.toMatch(/connect-src[^;]*https:/)
    expect(csp).toContain("connect-src 'self'")
  })
})

describe('habitatConnectSrc', () => {
  it('empty endpoint adds no extra connect-src', () => {
    expect(habitatConnectSrc({ devOrigin: null, vocalizerOrigin: null })).toEqual([])
    const csp = overlayContentSecurityPolicy({ devOrigin: null, vocalizerOrigin: null })
    expect(csp).toContain("connect-src 'self'")
    expect(csp).not.toMatch(/connect-src[^;]*https:/)
    expect(csp).not.toContain('http://localhost:*')
  })

  it('includes the exact vite-dev origin when set', () => {
    const extra = habitatConnectSrc({ devOrigin: 'http://localhost:5173', vocalizerOrigin: null })
    expect(extra).toContain('http://localhost:5173')
    expect(extra).toContain('ws://localhost:5173')
    expect(extra.some((v) => v.includes('*'))).toBe(false)
  })
})
