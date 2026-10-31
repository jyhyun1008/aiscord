<script setup lang="ts">
import type { Message } from '~/composables/useChat'

const props = defineProps<{ threadId: string, message: Message, grouped: boolean, isLast: boolean }>()

const ui = useUi()
const chat = useChat()
const models = useModels()
const workspace = useWorkspace()
const toast = useToast()

const m = computed(() => props.message)
const isAi = computed(() => m.value.role === 'assistant')
const busy = computed(() => chat.isRunning(props.threadId))

const modelName = computed(() => (m.value.model ? models.nameOf(m.value.model) : 'AI'))
const authorName = computed(() => {
  if (!isAi.value) return ui.me.name
  return ui.ai.name || modelName.value
})
const nameStyle = computed(() => {
  if (!isAi.value || ui.ai.name) return undefined
  return { color: `hsl(${hueOf(authorName.value)} 65% var(--name-l))` }
})
const html = computed(() => (isAi.value ? renderMarkdown(m.value.content, m.value.id) : ''))

const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | undefined

/** The raw markdown exactly as the model wrote it, not the rendered text. */
async function copyRaw() {
  try {
    await navigator.clipboard.writeText(m.value.content)
    copied.value = true
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => {
      copied.value = false
    }, 1500)
    toast.show('원문을 복사했어요')
  }
  catch (e) {
    toast.error(e)
  }
}

async function onBodyClick(e: MouseEvent) {
  const button = (e.target as HTMLElement).closest<HTMLElement>('[data-copy-code]')
  if (!button) return
  const code = button.closest('.code-block')?.querySelector('code')?.textContent ?? ''
  try {
    await navigator.clipboard.writeText(code)
    toast.show('코드를 복사했어요')
  }
  catch (err) {
    toast.error(err)
  }
}

const editing = ref(false)
const draft = ref('')
const editor = ref<HTMLTextAreaElement | null>(null)

async function startEdit() {
  draft.value = m.value.content
  editing.value = true
  await nextTick()
  editor.value?.focus()
}

function saveEdit() {
  const text = draft.value.trim()
  if (!text) return
  editing.value = false
  if (text !== m.value.content || !props.isLast) chat.editAndResend(props.threadId, m.value.id, text)
}

function onEditKey(e: KeyboardEvent) {
  if (e.key === 'Escape') editing.value = false
  if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.keyCode === 229) return
  e.preventDefault()
  saveEdit()
}

const root = ref<HTMLElement | null>(null)
const memoing = ref(false)
const memoDraft = ref('')
const memoEditor = ref<HTMLTextAreaElement | null>(null)

/** Starts from the selected text, since a whole answer is rarely worth keeping. */
async function startMemo() {
  const selection = getSelection()
  const inside = selection?.anchorNode && root.value?.contains(selection.anchorNode)
  memoDraft.value = (inside && selection!.toString().trim()) || m.value.content
  memoing.value = true
  await nextTick()
  memoEditor.value?.focus()
}

function saveMemo() {
  const text = memoDraft.value.trim()
  const thread = workspace.state.threads.find(t => t.id === props.threadId)
  if (!text || !thread) return
  workspace.addMemo(thread.projectId, text)
  memoing.value = false
  toast.show('프로젝트 메모에 저장했어요')
}

function onMemoKey(e: KeyboardEvent) {
  if (e.key === 'Escape') memoing.value = false
  if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.keyCode === 229) return
  e.preventDefault()
  saveMemo()
}

function remove() {
  if (confirm('이 메시지를 삭제할까요?')) chat.removeMessage(props.threadId, m.value.id)
}
</script>

<template>
  <article ref="root" class="msg" :class="{ grouped: props.grouped }">
    <div class="row">
      <div class="gutter">
        <template v-if="!props.grouped">
          <AiAvatar v-if="isAi" class="avatar" :model="m.model" :name="authorName" />
          <Avatar v-else class="avatar" :name="authorName" :src="ui.me.avatar" />
        </template>
        <time v-else class="hover-time" :title="formatFull(m.createdAt)">{{ formatTime(m.createdAt) }}</time>
      </div>

      <div class="content">
        <header v-if="!props.grouped" class="head">
          <span class="name" :style="nameStyle">{{ authorName }}</span>
          <span v-if="isAi" class="tag">AI</span>
          <span v-if="isAi && ui.ai.name" class="acct">{{ modelName }}</span>
          <time class="stamp" :title="formatFull(m.createdAt)">{{ formatStamp(m.createdAt) }}</time>
        </header>

        <details v-if="m.reasoning" class="reasoning">
          <summary>{{ m.pending && !m.content ? '생각하는 중…' : '생각 과정' }}</summary>
          <p>{{ m.reasoning }}</p>
        </details>

        <div v-if="editing" class="edit">
          <textarea ref="editor" v-model="draft" rows="3" aria-label="메시지 수정" @keydown="onEditKey" />
          <div class="edit-actions">
            <span>Esc로 취소 · 이 질문 뒤의 메시지는 지워지고 답변을 다시 받아요</span>
            <button class="btn small" :disabled="!draft.trim()" @click="saveEdit">저장하고 다시 생성</button>
          </div>
        </div>
        <!-- eslint-disable-next-line vue/no-v-html -- markdown-it runs with html:false -->
        <div v-else-if="isAi && m.content" class="markdown" :class="{ streaming: m.pending }" @click="onBodyClick" v-html="html" />
        <p v-else-if="!isAi" class="plain">{{ m.content }}</p>

        <p v-if="m.pending && chat.isSummarizing(props.threadId)" class="summarizing">이전 대화를 요약하는 중…</p>
        <p v-else-if="m.pending && !m.content && !m.reasoning" class="typing" aria-label="답변 작성 중">
          <span /><span /><span />
        </p>

        <div v-if="m.error" class="error">
          <Icon name="warn" :size="16" />
          <span>{{ m.error }}</span>
          <button v-if="props.isLast && !busy" @click="chat.regenerate(props.threadId, m.id)">다시 시도</button>
        </div>

        <div v-if="memoing" class="edit memo">
          <textarea ref="memoEditor" v-model="memoDraft" rows="3" aria-label="프로젝트 메모" @keydown="onMemoKey" />
          <div class="edit-actions">
            <span>Esc로 취소 · 이 프로젝트의 모든 스레드에 함께 전달돼요</span>
            <button class="btn small" :disabled="!memoDraft.trim()" @click="saveMemo">메모에 저장</button>
          </div>
        </div>

        <p v-if="m.truncated && m.content" class="truncated">프로젝트의 최대 답변 길이에서 끊겼어요</p>

        <p v-if="m.usage" class="usage">
          {{ formatTokens(m.usage.promptTokens) }} → {{ formatTokens(m.usage.completionTokens) }} 토큰
          <template v-if="m.usage.cachedTokens"> · 캐시 {{ formatTokens(m.usage.cachedTokens) }}</template>
          <template v-if="m.usage.cost !== null"> · {{ formatCost(m.usage.cost) }}</template>
        </p>
      </div>
    </div>

    <div v-if="!editing && !memoing && !m.pending" class="toolbar">
      <button
        v-if="m.content"
        class="copy"
        :class="{ on: copied }"
        title="원문(raw) 복사"
        aria-label="원문 복사"
        @click="copyRaw"
      >
        <Icon :name="copied ? 'check' : 'copy'" :size="16" />
        <span>복사</span>
      </button>
      <button
        v-if="m.content"
        title="메모에 저장"
        aria-label="메모에 저장"
        @mousedown.prevent
        @click="startMemo"
      >
        <Icon name="pin" :size="16" />
      </button>
      <button v-if="isAi && props.isLast && !busy" title="다시 생성" aria-label="다시 생성" @click="chat.regenerate(props.threadId, m.id)">
        <Icon name="renote" :size="16" />
      </button>
      <button v-if="!isAi && !busy" title="수정" aria-label="수정" @click="startEdit">
        <Icon name="edit" :size="16" />
      </button>
      <button v-if="!busy" class="danger" title="삭제" aria-label="삭제" @click="remove">
        <Icon name="trash" :size="16" />
      </button>
    </div>
  </article>
</template>

<style scoped>
.msg {
  position: relative;
  padding: 2px 48px 2px 16px;
  margin-top: 16px;
}
.msg.grouped {
  margin-top: 0;
}
.msg:hover {
  background: var(--bg-hover);
}
.row {
  display: flex;
  gap: 16px;
}
.gutter {
  width: 40px;
  flex-shrink: 0;
  display: flex;
  justify-content: center;
}
.avatar {
  width: 40px;
  height: 40px;
  margin-top: 2px;
}
.hover-time {
  visibility: hidden;
  font-size: 11px;
  line-height: 22px;
  color: var(--fg-faint);
  white-space: nowrap;
}
.msg:hover .hover-time {
  visibility: visible;
}
.content {
  flex: 1;
  min-width: 0;
}
.head {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
  line-height: 22px;
}
.name {
  font-weight: 600;
  color: var(--fg-strong);
  white-space: nowrap;
  max-width: 50%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tag {
  padding: 0 4px;
  border-radius: 3px;
  background: var(--accent);
  color: var(--accent-fg);
  font-size: 10px;
  font-weight: 700;
  line-height: 15px;
  align-self: center;
}
.acct {
  font-size: 12px;
  color: var(--fg-faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.stamp {
  font-size: 12px;
  color: var(--fg-faint);
  white-space: nowrap;
}
.plain {
  margin: 0;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.streaming > :last-child::after {
  content: '▍';
  margin-left: 2px;
  color: var(--accent);
  animation: blink 1s steps(2) infinite;
}
@keyframes blink {
  50% {
    opacity: 0;
  }
}
.typing {
  display: flex;
  gap: 4px;
  height: 22px;
  margin: 0;
  align-items: center;
}
.typing span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--fg-muted);
  animation: bounce 1.2s infinite ease-in-out;
}
.typing span:nth-child(2) {
  animation-delay: 0.15s;
}
.typing span:nth-child(3) {
  animation-delay: 0.3s;
}
@keyframes bounce {
  0%, 60%, 100% {
    opacity: 0.4;
    transform: none;
  }
  30% {
    opacity: 1;
    transform: translateY(-3px);
  }
}
.reasoning {
  margin: 2px 0 6px;
  padding: 6px 10px;
  border-left: 3px solid var(--fg-faint);
  border-radius: 3px;
  background: var(--bg-embed);
  font-size: 13px;
  color: var(--fg-muted);
}
.reasoning summary {
  cursor: pointer;
  font-weight: 600;
}
.reasoning p {
  margin: 6px 0 0;
  max-height: 240px;
  overflow-y: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.error {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  font-size: 14px;
  color: var(--danger);
}
.error button {
  flex-shrink: 0;
  text-decoration: underline;
}
.truncated {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--fg-muted);
}
.usage {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--fg-faint);
}
.edit.memo {
  margin-top: 6px;
}
.summarizing {
  margin: 0;
  font-size: 14px;
  color: var(--fg-muted);
}
.edit textarea {
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: 6px;
  background: var(--bg-input);
  outline: none;
  resize: vertical;
}
.edit-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 4px;
  font-size: 12px;
  color: var(--fg-muted);
}

.toolbar {
  position: absolute;
  right: 16px;
  top: -14px;
  display: none;
  align-items: center;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg-main);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
  z-index: 2;
}
.msg:hover .toolbar,
.toolbar:focus-within {
  display: flex;
}
.toolbar button {
  height: 30px;
  min-width: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: var(--fg-muted);
}
.toolbar button.copy {
  padding: 0 8px;
  font-size: 13px;
  font-weight: 600;
}
.toolbar button:hover {
  color: var(--fg);
  background: var(--bg-hover);
}
.toolbar button.on {
  color: var(--accent);
}
.toolbar button.danger:hover {
  color: var(--danger);
}

/* No hover on touch screens: keep the actions in the flow under the message */
@media (hover: none) {
  .toolbar {
    position: static;
    display: flex;
    width: fit-content;
    margin: 4px 0 0 56px;
    box-shadow: none;
  }
}

@media (max-width: 768px) {
  .msg {
    padding-right: 12px;
  }
}
</style>
