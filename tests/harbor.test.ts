import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SETTINGS,
  HARBOR_API_BASE_URL,
  HARBOR_MODEL,
  OVERLAY_REASONING_EFFORT
} from '@shared/types'
import { chatCompletionsBody, chatCompletionsUrl, streamChatCompletion } from '@shared/llm/openaiCompatible'
import { offlineReply, shouldUseOffline } from '@shared/personality/engine'
import { overlayContentSecurityPolicy } from '@shared/security/habitatRequest'
import { KOKORO_DEVICE, KOKORO_DTYPE } from '../src/main/kokoro'
import { espeakLookupCandidates } from '../src/main/tts'

const root = process.cwd()

describe('Harbor defaults', () => {
  it('uses xAI base and grok-4.6', () => {
    expect(HARBOR_API_BASE_URL).toBe('https://api.x.ai/v1')
    expect(HARBOR_MODEL).toBe('grok-4.6')
    expect(DEFAULT_SETTINGS.apiBaseUrl).toBe(HARBOR_API_BASE_URL)
    expect(DEFAULT_SETTINGS.model).toBe(HARBOR_MODEL)
    expect(DEFAULT_SETTINGS.apiKey).toBe('')
    expect(OVERLAY_REASONING_EFFORT).toBe('low')
  })
})

describe('unharbored empty key', () => {
  it('still produces a local precept reply rather than configure-key-only', () => {
    expect(shouldUseOffline({ apiKey: '', apiBaseUrl: HARBOR_API_BASE_URL })).toBe(true)
    const hello = offlineReply('hello', { apiKey: '', apiBaseUrl: '', random: () => 0 })
    expect(hello).toMatch(/Operator/)
    expect(hello.toLowerCase()).not.toMatch(/configure an api key/)
    const generic = offlineReply('what is on the foundry', {
      apiKey: '',
      apiBaseUrl: '',
      random: () => 0
    })
    expect(generic).toMatch(/Operator|Ordis/)
    expect(generic.toLowerCase()).not.toMatch(/configure an api key/)
    const main = readFileSync(join(root, 'src/main/index.ts'), 'utf8')
    expect(main).toContain('offlineReply')
    expect(main).toContain('canonicalReply')
    expect(main).toMatch(/!settings\.apiKey\.trim\(\)/)
  })
})

describe('Harbor chat completions body', () => {
  it('never sends store on chat/completions and overlay sets reasoning_effort low', () => {
    const body = chatCompletionsBody({
      apiBaseUrl: HARBOR_API_BASE_URL,
      apiKey: 'test',
      model: HARBOR_MODEL,
      reasoningEffort: OVERLAY_REASONING_EFFORT,
      messages: [{ role: 'user', content: 'status' }]
    })
    expect(chatCompletionsUrl(HARBOR_API_BASE_URL)).toBe('https://api.x.ai/v1/chat/completions')
    expect(body.reasoning_effort).toBe('low')
    expect('store' in body).toBe(false)
    expect('previous_response_id' in body).toBe(false)
    expect('presence_penalty' in body).toBe(false)
    expect('frequency_penalty' in body).toBe(false)
    expect('stop' in body).toBe(false)
    const encoded = JSON.stringify(body)
    expect(encoded).not.toContain('"store"')
    expect(encoded).not.toContain('previous_response_id')
    const main = readFileSync(join(root, 'src/main/index.ts'), 'utf8')
    expect(main).toContain('reasoningEffort: OVERLAY_REASONING_EFFORT')
    expect(main).not.toContain('/responses')
    expect(main).not.toContain('previous_response_id')
  })

  it('streams overlay tokens from chat/completions without store', async () => {
    let url = ''
    let parsed: Record<string, unknown> = {}
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      url = String(input)
      parsed = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      const sse = 'data: {"choices":[{"delta":{"content":"Operator"}}]}\n\ndata: [DONE]\n\n'
      return new Response(sse, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
    }) as typeof fetch
    const tokens: string[] = []
    for await (const token of streamChatCompletion({
      apiBaseUrl: HARBOR_API_BASE_URL,
      apiKey: 'test',
      model: HARBOR_MODEL,
      reasoningEffort: 'low',
      messages: [{ role: 'user', content: 'hi' }],
      fetchImpl
    })) {
      tokens.push(token)
    }
    expect(url).toBe('https://api.x.ai/v1/chat/completions')
    expect(parsed.reasoning_effort).toBe('low')
    expect('store' in parsed).toBe(false)
    expect(tokens.join('')).toBe('Operator')
  })
})

describe('session pin stays off api.x.ai', () => {
  it('overlay CSP and main pin have no connect-src https: wildcard and no api.x.ai', () => {
    const main = readFileSync(join(root, 'src/main/index.ts'), 'utf8')
    expect(main).not.toContain('api.x.ai')
    expect(main).toMatch(/vocalizerOrigin:\s*null/)
    const csp = overlayContentSecurityPolicy({ devOrigin: null, vocalizerOrigin: null })
    expect(csp).not.toContain('api.x.ai')
    expect(csp).not.toMatch(/connect-src[^;]*https:/)
    for (const page of ['index.html', 'settings.html']) {
      const html = readFileSync(join(root, 'src/renderer', page), 'utf8')
      const cspAttr = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/)?.[1] ?? ''
      expect(cspAttr).not.toContain('api.x.ai')
      const listed = cspAttr.match(/connect-src ([^;]+)/)?.[1] ?? ''
      expect(listed.split(/\s+/)).not.toContain('https:')
      expect(listed).not.toContain('api.x.ai')
    }
  })
})

describe('packaged voice extras', () => {
  it('kokoro uses device cpu and dtype q8, logs misses, and extraResources include onnx plus espeak-ng', () => {
    expect(KOKORO_DEVICE).toBe('cpu')
    expect(KOKORO_DTYPE).toBe('q8')
    const kokoro = readFileSync(join(root, 'src/main/kokoro.ts'), 'utf8')
    expect(kokoro).toMatch(/device:\s*KOKORO_DEVICE/)
    expect(kokoro).toMatch(/dtype:\s*KOKORO_DTYPE/)
    expect(kokoro).not.toMatch(/device:\s*['"]wasm['"]/)
    expect(kokoro).toContain('console.error')
    const builder = readFileSync(join(root, 'electron-builder.yml'), 'utf8')
    expect(builder).toMatch(/onnx/i)
    expect(builder).toContain('espeak-ng')
    expect(builder).toContain('vendor/voice/kokoro')
    expect(builder).toMatch(/identity:\s*null/)
    const tts = readFileSync(join(root, 'src/main/tts.ts'), 'utf8')
    expect(tts).toContain('process.resourcesPath')
    expect(tts).toContain('ESPEAK_ARGS')
    expect(tts).toMatch(/spawn\(bin,\s*\[\.\.\.ESPEAK_ARGS/)
    const candidates = espeakLookupCandidates()
    expect(candidates[0]).toContain('espeak-ng')
    const homebrew = candidates.indexOf('/opt/homebrew/bin/espeak-ng')
    const packaged = candidates.findIndex((c) => c.includes('vendor/voice') || c.includes(`${join('espeak-ng', 'bin', 'espeak-ng')}`))
    expect(packaged).toBeGreaterThanOrEqual(0)
    expect(packaged).toBeLessThan(homebrew)
    const ci = readFileSync(join(root, '.github/workflows/ci.yml'), 'utf8')
    expect(ci).toContain('vendorVoiceExtras.cjs')
    const vendor = readFileSync(join(root, 'scripts/vendorVoiceExtras.cjs'), 'utf8')
    expect(vendor).toContain('new URL(res.headers.location, current)')
    const vendorIdx = ci.indexOf('vendorVoiceExtras.cjs')
    const packIdx = ci.indexOf('npx electron-builder --mac dir --arm64')
    expect(vendorIdx).toBeGreaterThan(0)
    expect(vendorIdx).toBeLessThan(packIdx)
  })
})
