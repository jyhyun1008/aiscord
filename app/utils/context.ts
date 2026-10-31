interface ContextMessage {
  role: 'user' | 'assistant'
  content: string
  error?: string
  pending?: boolean
}

interface SystemParts {
  instructions: string
  memo?: string
  summary?: string
}

const MAX_CONTEXT_TOKENS = 80000
const DEFAULT_CONTEXT_LENGTH = 32000
// Leaves room for the answer, and for the estimate running low
const CONTEXT_RATIO = 0.75
// Share of the budget kept word for word when older messages get summarized
const KEEP_RATIO = 0.25

/** Rough count without a tokenizer: Latin text runs about 4 chars a token, Korean closer to 1.5. */
export function estimateTokens(text: string) {
  let ascii = 0
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) < 128) ascii++
  }
  return Math.ceil(ascii / 4 + (text.length - ascii) / 1.5)
}

/**
 * Tokens of history to send. Capped even for huge models, since the whole history is
 * billed again on every question.
 */
export function contextBudget(contextLength: number | null | undefined) {
  return Math.min(MAX_CONTEXT_TOKENS, Math.floor((contextLength ?? DEFAULT_CONTEXT_LENGTH) * CONTEXT_RATIO))
}

/** Failed and unfinished turns are dropped so they can't confuse the model. */
export function usableMessages<T extends ContextMessage>(messages: T[]) {
  return messages.filter(m => !m.pending && !(m.error && !m.content))
}

const totalTokens = (messages: ContextMessage[]) =>
  messages.reduce((sum, m) => sum + estimateTokens(m.content), 0)

/** Providers want a conversation to open with the user, so a cut moves on to the next question. */
function nextUserTurn(messages: ContextMessage[], index: number) {
  let i = index
  while (i < messages.length - 1 && messages[i]!.role !== 'user') i++
  return i
}

/** Where to split off messages worth summarizing, or null while everything still fits. */
export function splitForSummary(messages: ContextMessage[], budget: number) {
  if (totalTokens(messages) <= budget) return null
  const keep = budget * KEEP_RATIO
  let kept = 0
  let i = messages.length
  while (i > 1 && kept + estimateTokens(messages[i - 1]!.content) <= keep) {
    kept += estimateTokens(messages[--i]!.content)
  }
  // The newest turn always stays, however long it is
  const split = nextUserTurn(messages, Math.min(i, messages.length - 1))
  return split > 0 ? split : null
}

/** Last resort when summarizing fails: forget the oldest messages until the rest fit. */
export function trimToBudget<T extends ContextMessage>(messages: T[], budget: number) {
  let total = totalTokens(messages)
  let start = 0
  while (start < messages.length - 1 && total > budget) {
    total -= estimateTokens(messages[start]!.content)
    start++
  }
  return messages.slice(nextUserTurn(messages, start))
}

export function buildSystemPrompt({ instructions, memo, summary }: SystemParts) {
  const parts = [instructions.trim()]
  if (memo?.trim()) parts.push(`## 프로젝트 메모\n${memo.trim()}`)
  if (summary) parts.push(`## 이전 대화 요약\n${summary}`)
  return parts.filter(Boolean).join('\n\n')
}

export function summaryRequest(messages: ContextMessage[], previous?: string) {
  const transcript = messages
    .map(m => `${m.role === 'user' ? '사용자' : 'AI'}: ${m.content}`)
    .join('\n\n')
  return [
    {
      role: 'system' as const,
      content: '아래 대화를 나중에 이어갈 수 있도록 요약해. 결정한 내용, 사실, 이름, 수치, 코드에서 중요한 식별자, '
        + '남은 할 일을 빠짐없이 남기고 인사말과 군더더기는 버려. 대화에 쓰인 언어로 요약문만 출력해.',
    },
    {
      role: 'user' as const,
      content: previous ? `기존 요약:\n${previous}\n\n이어진 대화:\n${transcript}` : transcript,
    },
  ]
}
