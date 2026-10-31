<script setup lang="ts">
/** The right column, where Discord lists members: the AIs the user keeps at hand. */
const props = defineProps<{ projectId: string, threadId?: string }>()

const ui = useUi()
const models = useModels()
const { state, updateProject, updateThread } = useWorkspace()

const project = computed(() => state.projects.find(p => p.id === props.projectId))
const thread = computed(() => state.threads.find(t => t.id === props.threadId))

// In a thread a bookmark answers next; on a project page it's what new threads start with
const current = computed({
  get: () => thread.value?.model ?? project.value?.model ?? DEFAULT_MODEL,
  set: (id) => {
    if (props.threadId) updateThread(props.threadId, { model: id })
    else updateProject(props.projectId, { model: id })
  },
})

function pick(id: string) {
  current.value = id
  if (matchMedia('(max-width: 768px)').matches) ui.panelOpen = false
}
</script>

<template>
  <div class="panel">
    <header class="head">
      <h3>북마크 AI — {{ models.bookmarks.value.length }}</h3>
      <ModelPicker v-slot="{ open }" v-model="current">
        <button class="add" title="AI 찾기" aria-label="AI 찾기" @click="open">
          <Icon name="plus" :size="16" />
        </button>
      </ModelPicker>
    </header>

    <div
      v-for="id in models.bookmarks.value"
      :key="id"
      class="member"
      :class="{ on: id === current }"
      :title="id"
      role="button"
      tabindex="0"
      @click="pick(id)"
      @keydown.enter="pick(id)"
    >
      <AiAvatar class="avatar" :model="id" :name="models.nameOf(id)" />
      <span class="who">
        <span class="member-name">{{ models.nameOf(id) }}</span>
        <span v-if="id === current" class="status">{{ props.threadId ? '이 스레드에서 사용 중' : '새 스레드 기본 모델' }}</span>
      </span>
      <button class="remove" title="북마크 해제" :aria-label="`${models.nameOf(id)} 북마크 해제`" @click.stop="models.toggleBookmark(id)">
        <Icon name="x" :size="14" />
      </button>
    </div>

    <p v-if="!models.bookmarks.value.length" class="empty">
      <Icon name="star" :size="24" />
      자주 쓰는 AI를 모델 선택 창에서 별표로 북마크하면 여기서 바로 바꿀 수 있어요.
    </p>
  </div>
</template>

<style scoped>
.panel {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px;
}
.head {
  display: flex;
  align-items: center;
  margin: 8px 0 4px;
  padding: 0 4px 0 8px;
}
h3 {
  flex: 1;
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--fg-muted);
}
.add {
  padding: 2px 4px;
  color: var(--fg-muted);
}
.add:hover {
  color: var(--fg);
}
.member {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 46px;
  padding: 0 8px;
  border-radius: 4px;
  min-width: 0;
  cursor: pointer;
}
.member:hover {
  background: var(--bg-hover);
}
.member.on {
  background: var(--bg-active);
}
.avatar {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
}
.who {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}
.member-name {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.status {
  font-size: 12px;
  color: var(--accent);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.remove {
  display: none;
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  place-items: center;
  border-radius: 3px;
  color: var(--fg-muted);
}
.remove:hover {
  background: var(--bg-active);
  color: var(--fg-strong);
}
.member:hover .remove,
.member:focus-within .remove {
  display: grid;
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin: 16px 8px;
  font-size: 13px;
  color: var(--fg-muted);
  text-align: center;
}
.empty .icon {
  color: var(--fg-faint);
}

@media (hover: none) {
  .remove {
    display: grid;
  }
}
</style>
