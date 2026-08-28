export interface ChatTurn {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface StreamChatOptions {
  apiBaseUrl: string
  apiKey: string
  model: string
  temperature?: number
  messages: ChatTurn[]
  fetchImpl?: typeof fetch
  signal?: AbortSignal
}

export class LlmError extends Error {
  readonly status: number | undefined

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'LlmError'
    this.status = status
  }
}

function normalizeBase(url: string): string {
  return url.replace(/\/+$/, '')
}

/**
 * Stream an OpenAI-compatible chat.completions request.
 * Yields text tokens only. UI must not block on this.
 */
export async function* streamChatCompletion(
  options: StreamChatOptions
): AsyncGenerator<string, void, unknown> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') {
    throw new LlmError('No fetch implementation available')
  }

  const endpoint = `${normalizeBase(options.apiBaseUrl)}/chat/completions`
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: options.model,
      temperature: options.temperature ?? 0.85,
      stream: true,
      messages: options.messages
    }),
    signal: options.signal
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new LlmError(
      `Vocalizer link failed (${response.status}): ${body.slice(0, 240)}`,
      response.status
    )
  }

  if (!response.body) {
    throw new LlmError('Vocalizer returned an empty body')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let carry = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    carry += decoder.decode(value, { stream: true })
    const lines = carry.split('\n')
    carry = lines.pop() ?? ''
    for (const line of lines) {
      const token = parseSseLine(line)
      if (token === null) {
        continue
      }
      if (token === '[DONE]') {
        return
      }
      yield token
    }
  }
}

export function parseSseLine(line: string): string | null {
  const trimmed = line.trim()
  if (trimmed.length === 0 || trimmed.startsWith(':')) {
    return null
  }
  if (!trimmed.startsWith('data:')) {
    return null
  }
  const data = trimmed.slice(5).trim()
  if (data === '[DONE]') {
    return '[DONE]'
  }
  try {
    const json = JSON.parse(data) as {
      choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[]
    }
    const content = json.choices?.[0]?.delta?.content
    if (typeof content === 'string' && content.length > 0) {
      return content
    }
    return null
  } catch {
    return null
  }
}
