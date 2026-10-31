const API = 'https://openrouter.ai/api/v1'

export const DEFAULT_MODEL = 'openrouter/auto'

export interface Model {
  id: string
  name: string
  contextLength: number | null
  /** USD per token; null when the price depends on routing */
  promptPrice: number | null
  completionPrice: number | null
}

export interface ApiMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface Usage {
  promptTokens: number
  completionTokens: number
  cost: number | null
}

/** What OpenRouter itself has billed to this key, in USD. */
export interface KeyUsage {
  daily: number
  weekly: number
  monthly: number
  total: number
  /** Null when the key has no spending limit */
  remaining: number | null
}

export interface StreamDelta {
  content?: string
  reasoning?: string
  usage?: Usage
  /** The model that actually answered, which differs from the request for openrouter/auto */
  model?: string
  error?: string
}

/** Feed raw SSE text in, get complete `data:` payloads out; a partial line waits for the next chunk. */
export function createSseParser(onData: (data: string) => void) {
  let buffer = ''
  return (chunk: string) => {
    buffer += chunk
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const raw of lines) {
      const line = raw.replace(/\r$/, '')
      // `: OPENROUTER PROCESSING` keep-alives and blank separators carry nothing
      if (line.startsWith('data:')) onData(line.slice(5).trimStart())
    }
  }
}

/** Reduce one streamed chunk to what the UI needs; null for `[DONE]` and unreadable payloads. */
export function parseChunk(data: string): StreamDelta | null {
  if (data === '[DONE]') return null
  let json: any
  try {
    json = JSON.parse(data)
  }
  catch {
    return null
  }
  const delta = json.choices?.[0]?.delta
  const out: StreamDelta = {}
  if (delta?.content) out.content = delta.content
  if (delta?.reasoning) out.reasoning = delta.reasoning
  if (json.model) out.model = json.model
  if (json.usage) {
    out.usage = {
      promptTokens: json.usage.prompt_tokens ?? 0,
      completionTokens: json.usage.completion_tokens ?? 0,
      cost: json.usage.cost ?? null,
    }
  }
  // Failures after the headers are sent arrive here, with HTTP status still 200
  if (json.error) out.error = json.error.message ?? String(json.error.code ?? '알 수 없는 오류')
  return out
}

function price(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** The model list is public, so this works before an API key is set. */
export async function fetchModels(): Promise<Model[]> {
  const res = await fetch(`${API}/models`)
  if (!res.ok) throw new Error(`모델 목록을 불러오지 못했어요 (${res.status})`)
  const { data } = await res.json() as { data: any[] }
  return data.map(m => ({
    id: m.id,
    name: m.name ?? m.id,
    contextLength: m.context_length ?? null,
    promptPrice: price(m.pricing?.prompt),
    completionPrice: price(m.pricing?.completion),
  }))
}

async function errorMessage(res: Response) {
  const fallback = `요청이 실패했어요 (${res.status})`
  try {
    const json = await res.json()
    const message = json.error?.message ?? fallback
    if (res.status === 401) return `API 키를 확인해 주세요 — ${message}`
    if (res.status === 402) return `크레딧이 부족해요 — ${message}`
    return message
  }
  catch {
    return fallback
  }
}

export async function fetchKeyUsage(apiKey: string): Promise<KeyUsage> {
  const res = await fetch(`${API}/key`, { headers: { Authorization: `Bearer ${apiKey}` } })
  if (!res.ok) throw new Error(await errorMessage(res))
  const { data } = await res.json() as { data: any }
  return {
    daily: data.usage_daily ?? 0,
    weekly: data.usage_weekly ?? 0,
    monthly: data.usage_monthly ?? 0,
    total: data.usage ?? 0,
    remaining: data.limit_remaining ?? null,
  }
}

/** A one-shot completion for background work like summaries; returns the text. */
export async function completeChat(options: { apiKey: string, model: string, messages: ApiMessage[], signal: AbortSignal }) {
  const res = await fetch(`${API}/chat/completions`, {
    method: 'POST',
    signal: options.signal,
    headers: {
      'Authorization': `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
      'X-Title': 'Aiscord',
    },
    body: JSON.stringify({ model: options.model, messages: options.messages }),
  })
  if (!res.ok) throw new Error(await errorMessage(res))
  const json = await res.json()
  if (json.error) throw new Error(json.error.message ?? '요청이 실패했어요')
  const text = json.choices?.[0]?.message?.content
  if (!text) throw new Error('모델이 빈 답변을 보냈어요')
  return text as string
}

/** POST a streaming completion and report each chunk; resolves when the stream ends. Throws on failure. */
export async function streamChat(
  options: { apiKey: string, model: string, messages: ApiMessage[], signal: AbortSignal },
  onDelta: (delta: StreamDelta) => void,
) {
  const res = await fetch(`${API}/chat/completions`, {
    method: 'POST',
    signal: options.signal,
    headers: {
      'Authorization': `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
      'X-Title': 'Aiscord',
    },
    body: JSON.stringify({ model: options.model, messages: options.messages, stream: true }),
  })
  if (!res.ok || !res.body) throw new Error(await errorMessage(res))

  let failure: string | undefined
  const parse = createSseParser((data) => {
    const delta = parseChunk(data)
    if (!delta) return
    if (delta.error) failure = delta.error
    onDelta(delta)
  })
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    parse(value)
    if (failure) break
  }
  if (failure) throw new Error(failure)
}
