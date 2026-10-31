<script setup lang="ts">
import type { Project, Thread } from '~/composables/useWorkspace'

const props = defineProps<{ project: Project }>()

const TITLE_LENGTH = 60

const ui = useUi()
const chat = useChat()
const models = useModels()
const { threadsOf, createThread } = useWorkspace()

const threads = computed(() => threadsOf(props.project.id))
const q = ref('')
const shown = computed(() => {
  const s = q.value.trim().toLowerCase()
  if (!s) return threads.value
  return threads.value.filter(t => [t.title, t.preview].some(v => v.toLowerCase().includes(s)))
})

const creating = ref(!threads.value.length)
const title = ref('')
const model = ref(props.project.model)
watch(() => props.project.model, (id) => {
  model.value = id
})

const topic = computed(() => props.project.instructions.split('\n')[0] || '스레드를 만들어 질문해 보세요')

function start(question: string) {
  const name = title.value.trim() || question.split('\n')[0]!.slice(0, TITLE_LENGTH)
  const thread = createThread(props.project.id, name, model.value)
  // Stream in the background: the thread view picks it up from the shared history
  chat.send(thread.id, question)
  navigateTo(`/p/${props.project.id}/${thread.id}`)
}

function open(t: Thread) {
  return navigateTo(`/p/${props.project.id}/${t.id}`)
}

function previewName(t: Thread) {
  if (t.previewRole === 'user') return ui.me.name
  return ui.ai.name || models.nameOf(t.model)
}

function previewStyle(t: Thread) {
  return { color: `hsl(${hueOf(previewName(t))} 65% var(--name-l))` }
}

</script>

<template>
  <div class="threads">
    <ViewHeader icon="hash" :title="props.project.name" :topic="topic" panel />

    <div class="scroll">
      <div class="toolbar">
        <div class="search">
          <input v-model="q" class="field" type="search" placeholder="스레드 검색" aria-label="스레드 검색">
        </div>
        <button class="btn" @click="creating = !creating">
          <Icon name="plus" :size="16" /> 새 스레드
        </button>
      </div>

      <div v-if="creating" class="card new">
        <div class="new-head">
          <input v-model="title" class="field" placeholder="스레드 이름 (비우면 질문으로 지어요)" maxlength="100" aria-label="스레드 이름">
          <ModelPicker v-model="model" />
        </div>
        <Composer class="new-composer" placeholder="무엇이든 물어보세요" :draft-key="`new:${props.project.id}`" @send="start" />
      </div>

      <EmptyState v-if="!threads.length && !creating" icon="thread">아직 스레드가 없어요.</EmptyState>
      <EmptyState v-else-if="threads.length && !shown.length" icon="thread">"{{ q.trim() }}"에 맞는 스레드가 없어요.</EmptyState>

      <div v-if="shown.length" class="grid">
        <article
          v-for="t in shown"
          :key="t.id"
          class="card"
          role="button"
          tabindex="0"
          @click="open(t)"
          @keydown.enter="open(t)"
        >
          <span class="tag">
            <AiAvatar class="tag-logo" :model="t.model" :name="models.nameOf(t.model)" />
            {{ models.nameOf(t.model) }}
          </span>
          <h2 class="name">{{ t.title }}</h2>
          <div v-if="t.preview" class="preview">
            <span class="pv-name" :style="previewStyle(t)">{{ previewName(t) }}</span>
            <span class="pv-text">{{ t.preview }}</span>
          </div>
          <p v-else class="pv-empty">아직 메시지가 없어요</p>
          <footer class="meta">
            <span :title="`메시지 ${t.messageCount}개`"><Icon name="thread" :size="14" /> {{ t.messageCount }}</span>
            <i class="dot" />
            <time :title="formatFull(t.updatedAt)">{{ formatStamp(t.updatedAt) }}</time>
          </footer>
        </article>
      </div>
    </div>
  </div>
</template>

<style scoped>
.threads {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.scroll {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}
.toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.search {
  flex: 1;
  min-width: 0;
}
.toolbar .btn {
  white-space: nowrap;
}
.grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px 16px;
  border-radius: var(--radius);
  background: var(--bg-sidebar);
  border: 1px solid var(--border);
  cursor: pointer;
  min-width: 0;
  transition: background 0.15s, border-color 0.15s;
}
.card:hover {
  background: var(--bg-embed);
  border-color: var(--bg-active);
}
.card.new {
  gap: 10px;
  margin-bottom: 12px;
  cursor: default;
}
.card.new:hover {
  background: var(--bg-sidebar);
}
.new-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.tag {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  height: 26px;
  padding: 0 10px 0 6px;
  border: 1px solid var(--border);
  border-radius: 13px;
  background: var(--bg-input);
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tag-logo {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  font-size: 8px;
}
.new-head .field {
  flex: 1;
  min-width: 0;
}
.new-composer {
  padding: 0;
}
.name {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--fg-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.preview {
  display: flex;
  gap: 4px;
  min-width: 0;
  font-size: 14px;
}
.pv-name {
  flex-shrink: 0;
  max-width: 40%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}
.pv-name::after {
  content: ':';
  color: var(--fg-muted);
}
.pv-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--fg-muted);
}
.pv-empty {
  margin: 0;
  font-size: 13px;
  color: var(--fg-faint);
}
.meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
  font-size: 13px;
  color: var(--fg-muted);
}
.meta span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--fg-faint);
}
</style>
