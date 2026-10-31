<script setup lang="ts">
const route = useRoute()
const { state } = useWorkspace()
const project = computed(() => state.projects.find(p => p.id === route.params.project))
const thread = computed(() => state.threads.find(t => t.id === route.params.thread && t.projectId === route.params.project))

watchEffect(() => {
  if (!thread.value) navigateTo(`/p/${route.params.project}`, { replace: true })
})
</script>

<template>
  <ChatView v-if="project && thread" :key="thread.id" :project="project" :thread="thread" />
</template>
