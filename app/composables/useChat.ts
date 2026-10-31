import type { Project, Thread } from '~/composables/useWorkspace'
import type { ApiMessage, Usage } from '~/utils/openrouter'

export interface Message {
  id: string
  role: 'user' | 'assistant'
  /** Raw text as written; this is what "copy" returns */
  content: string
  createdAt: number
  /** Assistant only */
  model?: string
  reasoning?: string
  usage?: Usage
  error?: string
  pending?: boolean
  /** Stopped at the project preset's answer limit */
  truncated?: boolean
}

const SAVE_INTERVAL = 1000
const PREVIEW_LENGTH = 160

// Module-level so a stream keeps running while the user browses other threads
const histories = reactive(new Map<string, Message[]>())
const running = reactive(new Map<string, AbortController>())
const summarizing = reactive(new Set<string>())
const loads = new Map<string, Promise<Message[]>>()

function usageOf(messages: Message[]) {
  const total = { tokens: 0, cost: 0 }
  for (const m of messages) {
    if (!m.usage) continue
    total.tokens += m.usage.promptTokens + m.usage.completionTokens
    total.cost += m.usage.cost ?? 0
  }
  return total
}

const anyRunning = computed(() => running.size > 0)

export function useChat() {
  const ui = useUi()
  const workspace = useWorkspace()
  const models = useModels()
  const toast = useToast()

  function loadThread(threadId: string) {
    const cached = histories.get(threadId)
    if (cached) return Promise.resolve(cached)
    let load = loads.get(threadId)
    if (!load) {
      load = idbGet<Message[]>(threadId).then((stored) => {
        const list = stored ?? []
        // A reload during a stream leaves a half-written answer behind
        for (const m of list) {
          if (!m.pending) continue
          m.pending = false
          m.error = '답변을 받는 중에 페이지를 닫았어요'
        }
        histories.set(threadId, list)
        loads.delete(threadId)
        return histories.get(threadId)!
      })
      loads.set(threadId, load)
    }
    return load
  }

  function persist(threadId: string) {
    const list = histories.get(threadId)
    if (!list) return
    idbSet(threadId, JSON.parse(JSON.stringify(list))).catch(toast.error)
    const last = list.at(-1)
    workspace.updateThread(threadId, {
      updatedAt: Date.now(),
      messageCount: list.length,
      preview: last?.content.replace(/\s+/g, ' ').slice(0, PREVIEW_LENGTH) ?? '',
      previewRole: last?.role ?? null,
      ...usageOf(list),
    })
  }

  /** Threads saved before the meta held usage have to read their history once. */
  async function backfillUsage() {
    for (const t of workspace.state.threads) {
      if (t.tokens === undefined) workspace.updateThread(t.id, usageOf(await loadThread(t.id)))
    }
  }

  /** Tries the summary model first; free ones hit limits often, so the thread's model is the backup. */
  async function summarize(thread: Thread, older: Message[], previous: string | undefined, signal: AbortSignal) {
    const messages = summaryRequest(older, previous)
    const candidates = [...new Set([ui.summaryModel || thread.model, thread.model])]
    for (const [i, model] of candidates.entries()) {
      try {
        return await completeChat({ apiKey: ui.apiKey, model, messages, signal })
      }
      catch (e) {
        if (signal.aborted || i === candidates.length - 1) throw e
      }
    }
    throw new Error('요약할 모델이 없어요')
  }

  /** The prompt for the next answer, summarizing old messages first when they no longer fit. */
  async function buildRequest(thread: Thread, project: Project, list: Message[], signal: AbortSignal) {
    const preset = contextPreset(project.preset)
    await models.load()
    const contextLength = models.models.value?.find(m => m.id === thread.model)?.contextLength
    const cut = list.findIndex(m => m.id === thread.summarizedUntil)
    let recent = usableMessages(list.slice(cut + 1))
    let summary = cut >= 0 ? thread.summary : undefined

    const system = () => buildSystemPrompt({ instructions: project.instructions, memo: project.memo, summary, concise: preset.concise })
    const room = () => contextBudget(contextLength, preset.contextTokens) - estimateTokens(system())

    const split = splitForSummary(recent, room())
    if (split) {
      const older = recent.slice(0, split)
      summarizing.add(thread.id)
      try {
        summary = await summarize(thread, older, summary, signal)
        workspace.updateThread(thread.id, { summary, summarizedUntil: older.at(-1)!.id })
        recent = recent.slice(split)
      }
      catch (e) {
        if (signal.aborted) throw e
        toast.error(`대화를 요약하지 못해서 오래된 메시지를 빼고 보내요 — ${e instanceof Error ? e.message : e}`)
      }
      finally {
        summarizing.delete(thread.id)
      }
    }

    const messages = trimToBudget(recent, room()).map(m => ({ role: m.role, content: m.content }))
    const prompt = system()
    const request = prompt ? [{ role: 'system' as const, content: prompt }, ...messages] : messages
    return withCacheBreakpoints(request, thread.model) as ApiMessage[]
  }

  /** A summary built from a message that just changed would keep telling the model the old version. */
  function dropStaleSummary(threadId: string, list: Message[], index: number) {
    const thread = workspace.state.threads.find(t => t.id === threadId)
    const cut = list.findIndex(m => m.id === thread?.summarizedUntil)
    if (cut >= 0 && index <= cut) workspace.updateThread(threadId, { summary: undefined, summarizedUntil: undefined })
  }

  async function generate(threadId: string) {
    const thread = workspace.state.threads.find(t => t.id === threadId)
    const project = workspace.state.projects.find(p => p.id === thread?.projectId)
    const list = histories.get(threadId)
    if (!thread || !project || !list || running.has(threadId)) return

    list.push({
      id: newId(),
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      model: thread.model,
      pending: true,
    })
    // Mutate through the reactive proxy so the view follows the stream
    const reply = list.at(-1)!
    const controller = new AbortController()
    running.set(threadId, controller)
    models.touch(thread.model)
    persist(threadId)

    const preset = contextPreset(project.preset)
    let lastSave = Date.now()
    try {
      const messages = await buildRequest(thread, project, list, controller.signal)
      await streamChat(
        { apiKey: ui.apiKey, model: thread.model, messages, signal: controller.signal, maxTokens: preset.maxTokens, effort: preset.effort },
        (delta) => {
          if (delta.content) reply.content += delta.content
          if (delta.reasoning) reply.reasoning = (reply.reasoning ?? '') + delta.reasoning
          if (delta.model) reply.model = delta.model
          if (delta.usage) reply.usage = delta.usage
          if (delta.finishReason === 'length') reply.truncated = true
          if (Date.now() - lastSave > SAVE_INTERVAL) {
            lastSave = Date.now()
            persist(threadId)
          }
        },
      )
      if (!reply.content) reply.error = reply.truncated ? '추론에 최대 답변 길이를 다 써서 내용이 없어요' : '모델이 빈 답변을 보냈어요'
    }
    catch (e) {
      if (!controller.signal.aborted) reply.error = e instanceof Error ? e.message : String(e)
      else if (!reply.content) reply.error = '답변을 중단했어요'
    }
    finally {
      reply.pending = false
      running.delete(threadId)
      persist(threadId)
    }
  }

  async function send(threadId: string, text: string) {
    const list = await loadThread(threadId)
    list.push({ id: newId(), role: 'user', content: text, createdAt: Date.now() })
    persist(threadId)
    await generate(threadId)
  }

  function stop(threadId: string) {
    running.get(threadId)?.abort()
  }

  function isRunning(threadId: string) {
    return running.has(threadId)
  }

  function isSummarizing(threadId: string) {
    return summarizing.has(threadId)
  }

  /** Answer again: drop this assistant message and let the model retry from what preceded it. */
  async function regenerate(threadId: string, messageId: string) {
    const list = histories.get(threadId)
    const index = list?.findIndex(m => m.id === messageId) ?? -1
    if (!list || index < 0 || running.has(threadId)) return
    dropStaleSummary(threadId, list, index)
    list.splice(index)
    await generate(threadId)
  }

  /** Rewrite a question; everything after it answered the old wording, so it goes too. */
  async function editAndResend(threadId: string, messageId: string, text: string) {
    const list = histories.get(threadId)
    const index = list?.findIndex(m => m.id === messageId) ?? -1
    if (!list || index < 0 || running.has(threadId)) return
    dropStaleSummary(threadId, list, index)
    list[index]!.content = text
    list.splice(index + 1)
    await generate(threadId)
  }

  function removeMessage(threadId: string, messageId: string) {
    const list = histories.get(threadId)
    const index = list?.findIndex(m => m.id === messageId) ?? -1
    if (!list || index < 0) return
    dropStaleSummary(threadId, list, index)
    list.splice(index, 1)
    persist(threadId)
  }

  /** Swap in a history that came from another device. */
  async function replaceHistory(threadId: string, list: Message[]) {
    await idbSet(threadId, list)
    if (histories.has(threadId)) histories.set(threadId, list)
  }

  function dropHistory(threadId: string) {
    running.get(threadId)?.abort()
    histories.delete(threadId)
    idbDelete(threadId).catch(toast.error)
  }

  function removeThread(threadId: string) {
    dropHistory(threadId)
    workspace.removeThreadMeta(threadId)
  }

  return {
    histories,
    anyRunning,
    replaceHistory,
    loadThread,
    backfillUsage,
    send,
    stop,
    isRunning,
    isSummarizing,
    regenerate,
    editAndResend,
    removeMessage,
    removeThread,
    dropHistory,
  }
}
