<script setup lang="ts">
import type { Project } from '~/composables/useWorkspace'

const ui = useUi()
const route = useRoute()
// null: closed; 'new': blank form; a project: edit that one
const projectForm = useState<Project | 'new' | null>('project-form', () => null)

const sync = useSync()
const { revision } = useWorkspace()
const { bookmarks } = useModels()

const projectId = computed(() => route.params.project as string | undefined)
const threadId = computed(() => route.params.thread as string | undefined)

onMounted(() => {
  applyTheme(ui.theme)
  applyAccent(ui.accent)
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => applyTheme(ui.theme))
})
watch(() => ui.theme, applyTheme)
watch(() => ui.accent, applyAccent)
watch(() => ui.apiKey, key => saveJson('aiscord:api-key', key))
watch(() => ui.summaryModel, id => saveJson('aiscord:summary-model', id))
watch(revision, sync.schedule)
watch(() => [ui.me, ui.ai, ui.summaryModel, ui.theme, ui.accent, bookmarks.value], sync.markSettingsChanged, { deep: true })
watch(() => ui.me, me => saveJson('aiscord:me', me), { deep: true })
watch(() => ui.ai, ai => saveJson('aiscord:ai', ai), { deep: true })
</script>

<template>
  <AppShell :panel="!!projectId">
    <template #rail>
      <ServerRail />
    </template>
    <template #sidebar>
      <ChannelSidebar :project-id="projectId" :thread-id="threadId" />
    </template>
    <NuxtPage />
    <template #panel>
      <InfoPanel v-if="projectId" :project-id="projectId" :thread-id="threadId" />
    </template>
  </AppShell>
  <ProjectModal
    v-if="projectForm"
    :project="projectForm === 'new' ? null : projectForm"
    @close="projectForm = null"
  />
  <SettingsModal v-if="ui.settingsOpen" @close="ui.settingsOpen = false" />
  <Toasts />
</template>
