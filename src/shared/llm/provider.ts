import { LlmError, streamChatCompletion, type ChatTurn, type StreamChatOptions } from './openaiCompatible'

export interface ProviderHealth {
  ok: boolean
  error?: string
}

export interface ChatProvider {
  streamChat: typeof streamChatCompletion
  listModels: (apiBaseUrl: string, apiKey: string, fetchImpl?: typeof fetch) => Promise<string[]>
  health: (apiBaseUrl: string, apiKey: string, fetchImpl?: typeof fetch) => Promise<ProviderHealth>
}

function normalizeBase(url: string): string {
  return url.replace(/\/+$/, '')
}

export async function listModels(
  apiBaseUrl: string,
  apiKey: string,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<string[]> {
  const response = await fetchImpl(`${normalizeBase(apiBaseUrl)}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` }
  })
  if (!response.ok) {
    throw new LlmError(`Model list failed (${response.status})`, response.status)
  }
  const json = (await response.json()) as { data?: { id?: string }[] }
  return (json.data ?? []).map((row) => row.id).filter((id): id is string => typeof id === 'string')
}

export async function health(
  apiBaseUrl: string,
  apiKey: string,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<ProviderHealth> {
  try {
    const response = await fetchImpl(`${normalizeBase(apiBaseUrl)}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    })
    if (!response.ok) {
      return { ok: false, error: `Vocalizer health ${response.status}` }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Vocalizer unreachable' }
  }
}

export const openAiCompatibleProvider: ChatProvider = {
  streamChat: streamChatCompletion,
  listModels,
  health
}

export type { ChatTurn, StreamChatOptions }
export { streamChatCompletion, LlmError }
