<script setup lang="ts">
import type { Project } from '~/composables/useWorkspace'

const projectForm = useState<Project | 'new' | null>('project-form')
const sync = useSync()

const cloudTitle = computed(() => {
  if (sync.needsReconnect.value) return '올라가지 않은 변경이 있어요 — 눌러서 다시 연결'
  return sync.status.connected ? '구글 드라이브 연결됨 — 지금 동기화' : '구글 드라이브 연결하고 동기화'
})
</script>

<template>
  <nav class="rail">
    <ul>
      <li class="item active">
        <span class="pill" />
        <NuxtLink to="/" class="server home" title="Aiscord">
          <img src="/icons/aiscord.svg" alt="" draggable="false">
        </NuxtLink>
      </li>
      <li class="sep" />
      <li class="item">
        <span class="pill" />
        <button class="server add" title="프로젝트 추가" @click="projectForm = 'new'">
          <Icon name="plus" :size="24" />
        </button>
      </li>
      <li v-if="sync.enabled" class="item">
        <span class="pill" />
        <button
          class="server cloud"
          :class="{ on: sync.status.connected, busy: sync.status.syncing }"
:title="cloudTitle"
          :disabled="sync.status.syncing"
          @click="sync.syncNow"
        >
          <Icon name="cloud" :size="22" />
        </button>
        <span v-if="sync.needsReconnect.value" class="unsynced" />
      </li>
    </ul>
  </nav>
</template>

<style scoped>
.rail {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  scrollbar-width: none;
  padding: 12px 0;
}
ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.item {
  position: relative;
  width: 100%;
  display: flex;
  justify-content: center;
}
.pill {
  position: absolute;
  left: 0;
  top: 50%;
  width: 4px;
  height: 0;
  border-radius: 0 4px 4px 0;
  background: var(--fg-strong);
  transform: translateY(-50%);
  transition: height 0.15s;
}
.item:hover .pill {
  height: 20px;
}
.item.active .pill {
  height: 40px;
}
.server {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--bg-main);
  color: var(--fg);
  overflow: hidden;
  transition: border-radius 0.15s, background 0.15s, color 0.15s;
}
.server img {
  width: 100%;
  height: 100%;
}
.item:hover .server,
.item.active .server {
  border-radius: 16px;
}
.add {
  color: var(--accent);
}
.item:hover .add {
  background: var(--accent);
  color: var(--accent-fg);
}
.cloud {
  color: var(--fg-muted);
}
.cloud.on {
  color: var(--accent);
}
.cloud.busy {
  opacity: 0.5;
}
.unsynced {
  position: absolute;
  top: 0;
  right: 10px;
  width: 14px;
  height: 14px;
  border: 3px solid var(--bg-rail);
  border-radius: 50%;
  background: var(--danger);
  pointer-events: none;
}
.sep {
  width: 32px;
  height: 2px;
  border-radius: 1px;
  background: var(--bg-active);
}
</style>
