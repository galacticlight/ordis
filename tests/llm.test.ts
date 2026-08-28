import { describe, expect, it } from 'vitest'
import { parseSseLine } from '@shared/llm/openaiCompatible'

describe('OpenAI-compatible SSE parser', () => {
  it('extracts delta content and treats [DONE] as a sentinel', () => {
    expect(parseSseLine('')).toBeNull()
    expect(parseSseLine(': keep-alive')).toBeNull()
    expect(parseSseLine('data: [DONE]')).toBe('[DONE]')
    expect(
      parseSseLine('data: {"choices":[{"delta":{"content":"Oper"}}]}')
    ).toBe('Oper')
    expect(parseSseLine('data: {"choices":[{"delta":{}}]}')).toBeNull()
    expect(parseSseLine('data: not-json')).toBeNull()
  })
})
