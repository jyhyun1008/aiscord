<script setup lang="ts">
import type { Message } from '~/composables/useChat'
import type { Project, Thread } from '~/composables/useWorkspace'

const props = defineProps<{ project: Project, thread: Thread }>()

const GROUP_WINDOW = 5 * 60 * 1000
// Within this distance of the bottom, new text keeps the view pinned there
const STICK_DISTANCE = 80

const chat = useChat()
const { updateThread } = useWorkspace()
const toast = useToast()

const messages = computed(() => chat.histories.get(props.thread.id) ?? null)
const busy = computed(() => chat.isRunning(props.thread.id))
const summaryIndex = computed(() => messages.value?.findIndex(m => m.id === props.thread.summarizedUntil) ?? -1)
const projectPath = computed(() => `/p/${props.project.id}`)

const model = computed({
  get: () => props.thread.model,
  set: id => updateThread(props.thread.id, { model: id }),
})

const scroller = ref<HTMLElement | null>(null)
let stuck = true

function onScroll() {
  const el = scroller.value!
  stuck = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_DISTANCE
}

function toBottom() {
  if (stuck && scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight
}

watch(
  () => {
    const last = messages.value?.at(-1)
    return [messages.value?.length, last?.content.length, last?.reasoning?.length, last?.error]
  },
  toBottom,
  { flush: 'post' },
)

onMounted(async () => {
  try {
    await chat.loadThread(props.thread.id)
  }
  catch (e) {
    toast.error(e)
  }
})

function grouped(list: Message[], i: number) {
  const prev = list[i - 1]
  const m = list[i]!
  return !!prev
    && prev.role === m.role
    && prev.model === m.model
    && !prev.error
    && m.createdAt - prev.createdAt < GROUP_WINDOW
    && isSameDay(prev.createdAt, m.createdAt)
}

function newDay(list: Message[], i: number) {
  const prev = list[i - 1]
  return !prev || !isSameDay(prev.createdAt, list[i]!.createdAt)
}

function send(text: string) {
  stuck = true
  chat.send(props.thread.id, text)
}

function rename() {
  const title = prompt('스레드 이름', props.thread.title)?.trim()
  if (title) updateThread(props.thread.id, { title })
}

function remove() {
  if (!confirm(`"${props.thread.title}" 스레드를 삭제할까요?\n대화 내용도 함께 사라져요.`)) return
  chat.removeThread(props.thread.id)
  navigateTo(projectPath.value)
}
</script>

<template>
  <div class="chat">
    <ViewHeader icon="thread" :title="props.thread.title" :topic="`# ${props.project.name}`" :back="projectPath" panel>
      <template #actions>
        <ModelPicker v-model="model" />
        <button class="icon-btn" title="이름 변경" @click="rename"><Icon name="edit" :size="18" /></button>
        <button class="icon-btn" title="스레드 삭제" @click="remove"><Icon name="trash" :size="18" /></button>
      </template>
    </ViewHeader>

    <div ref="scroller" class="scroller" @scroll.passive="onScroll">
      <div class="welcome">
        <span class="welcome-icon"><Icon name="thread" :size="32" /></span>
        <h2>{{ props.thread.title }}</h2>
        <p># {{ props.project.name }} 프로젝트의 스레드예요. {{ formatFull(props.thread.createdAt) }}에 시작했어요.</p>
      </div>
      <template v-for="(m, i) in messages ?? []" :key="m.id">
        <div v-if="newDay(messages!, i)" class="day"><span>{{ formatDay(m.createdAt) }}</span></div>
        <ChatMessage
          :thread-id="props.thread.id"
          :message="m"
          :grouped="grouped(messages!, i)"
          :is-last="i === messages!.length - 1"
        />
        <details v-if="i === summaryIndex" class="summary">
          <summary>여기까지는 요약해서 AI에게 전달해요</summary>
          <p>{{ props.thread.summary }}</p>
        </details>
      </template>
      <div class="end" />
    </div>

    <Composer
      :placeholder="`${props.thread.title}에 메시지 보내기`"
      :draft-key="props.thread.id"
      :busy="busy"
      @send="send"
      @stop="chat.stop(props.thread.id)"
    />
  </div>
</template>

<style scoped>
.chat {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.scroller {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
/* Short conversations sit at the bottom next to the composer, like a Discord channel */
.welcome {
  margin-top: auto;
  padding: 32px 16px 8px;
}
.welcome-icon {
  display: grid;
  place-items: center;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: var(--bg-input);
  color: var(--fg-strong);
}
.welcome h2 {
  margin: 8px 0 4px;
  font-size: 26px;
  color: var(--fg-strong);
  overflow-wrap: anywhere;
}
.welcome p {
  margin: 0;
  color: var(--fg-muted);
}
.day {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 16px 16px 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--fg-faint);
}
.day::before,
.day::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border);
}
.summary {
  margin: 16px 16px 0;
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--bg-embed);
  font-size: 13px;
  color: var(--fg-muted);
}
.summary > summary {
  cursor: pointer;
  font-weight: 600;
}
.summary p {
  margin: 8px 0 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.end {
  flex-shrink: 0;
  height: 24px;
}

/* Phone header: the title needs the room more than the model's name does */
@media (max-width: 768px) {
  .chat :deep(.head .chip-name),
  .chat :deep(.head .ch-icon) {
    display: none;
  }
}
</style>
