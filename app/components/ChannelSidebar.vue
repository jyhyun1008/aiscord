<script setup lang="ts">
import type { Project } from '~/composables/useWorkspace'

const props = defineProps<{ projectId?: string, threadId?: string }>()

// Discord lists only a channel's active threads under it; the gallery has the rest
const NESTED_THREADS = 6

const ui = useUi()
const route = useRoute()
const { state, threadsOf, moveProject } = useWorkspace()
const projectForm = useState<Project | 'new' | null>('project-form')

const nested = computed(() => {
  if (!props.projectId) return []
  const list = threadsOf(props.projectId)
  const shown = list.slice(0, NESTED_THREADS)
  // An older thread the user opened from the gallery still needs its row
  const open = list.find(t => t.id === props.threadId)
  if (open && !shown.includes(open)) shown.push(open)
  return shown
})

function go(path: string) {
  ui.navOpen = false
  return navigateTo(path)
}
</script>

<template>
  <div class="sidebar">
    <header class="head">
      <span class="name">Aiscord</span>
      <span class="host">openrouter.ai</span>
    </header>

    <div class="scroll">
      <!-- Above the categories, like Discord's Browse Channels -->
      <section class="top">
        <button class="ch" :class="{ active: route.path === '/explore' }" @click="go('/explore')">
          <Icon name="compass" :size="18" />
          <span class="label">프로젝트 훑어보기</span>
        </button>
      </section>

      <section>
        <div class="cat-row">
          <span class="cat">프로젝트</span>
          <button class="add" title="프로젝트 추가" @click="projectForm = 'new'">
            <Icon name="plus" :size="16" />
          </button>
        </div>
        <template v-for="(p, i) in state.projects" :key="p.id">
          <div
            class="ch"
            :class="{ active: p.id === props.projectId && !props.threadId }"
            role="button"
            tabindex="0"
            @click="go(`/p/${p.id}`)"
            @keydown.enter="go(`/p/${p.id}`)"
          >
            <Icon name="hash" :size="18" />
            <span class="label">{{ p.name }}</span>
            <span class="tools" @click.stop>
              <button title="위로" @click="moveProject(i, i - 1)"><Icon name="up" :size="14" /></button>
              <button title="아래로" @click="moveProject(i, i + 1)"><Icon name="down" :size="14" /></button>
              <button title="프로젝트 편집" @click="projectForm = p"><Icon name="settings" :size="14" /></button>
            </span>
          </div>
          <div v-if="p.id === props.projectId" class="threads">
            <button
              v-for="t in nested"
              :key="t.id"
              class="ch thread"
              :class="{ active: t.id === props.threadId }"
              :title="t.title"
              @click="go(`/p/${p.id}/${t.id}`)"
            >
              <span class="spine" />
              <span class="label">{{ t.title }}</span>
            </button>
          </div>
        </template>
      </section>
    </div>

    <footer class="me">
      <button class="my-profile" title="프로필 설정" @click="ui.settingsOpen = true">
        <Avatar class="me-avatar" :name="ui.me.name" :src="ui.me.avatar" />
        <span class="who">
          <span class="dn">{{ ui.me.name }}</span>
          <span class="un">{{ ui.apiKey ? '연결됨' : 'API 키 없음' }}</span>
        </span>
      </button>
      <button class="icon-btn" title="설정" @click="ui.settingsOpen = true">
        <Icon name="settings" :size="18" />
      </button>
    </footer>
  </div>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  width: 100%;
}
.head {
  height: var(--header-h);
  flex-shrink: 0;
  padding: 0 16px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  border-bottom: 1px solid var(--border);
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.1);
}
.name {
  font-weight: 700;
  color: var(--fg-strong);
}
.host {
  font-size: 11px;
  color: var(--fg-faint);
}
.scroll {
  flex: 1;
  overflow-y: auto;
  padding: 8px 8px 16px;
}
section + section {
  margin-top: 12px;
}
section.top {
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}
.cat-row {
  display: flex;
  align-items: center;
}
.cat {
  flex: 1;
  padding: 6px 0 4px 2px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--fg-muted);
}
.add {
  color: var(--fg-muted);
  padding: 2px 4px;
}
.add:hover {
  color: var(--fg);
}
.ch {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  margin: 1px 0;
  padding: 0 8px;
  border-radius: 4px;
  color: var(--fg-muted);
  cursor: pointer;
  text-align: left;
}
.ch:hover {
  background: var(--bg-hover);
  color: var(--fg);
}
.ch.active {
  background: var(--bg-active);
  color: var(--fg-strong);
}
.ch.active .icon {
  color: var(--accent);
}
.label {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
}
.tools {
  display: none;
  gap: 2px;
}
.tools button {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  color: var(--fg-muted);
  border-radius: 3px;
}
.tools button:hover {
  color: var(--fg-strong);
  background: var(--bg-active);
}
.ch:hover .tools,
.ch:focus-within .tools {
  display: flex;
}
.threads {
  margin-left: 16px;
}
.thread {
  position: relative;
  height: 30px;
  padding-left: 22px;
  font-size: 14px;
}
.spine {
  position: absolute;
  left: 4px;
  top: -2px;
  width: 12px;
  height: 18px;
  border-left: 2px solid var(--fg-faint);
  border-bottom: 2px solid var(--fg-faint);
  border-bottom-left-radius: 6px;
  opacity: 0.5;
}
.me {
  flex-shrink: 0;
  height: var(--footer-h);
  padding: 0 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-panel);
}
.me-avatar {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
}
.my-profile {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px;
  border-radius: 4px;
  text-align: left;
}
.my-profile:hover,
.my-profile:focus-visible {
  background: var(--bg-hover);
}
.who {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}
.dn {
  font-size: 14px;
  font-weight: 600;
  color: var(--fg-strong);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.un {
  font-size: 12px;
  color: var(--fg-muted);
}
</style>
