<script setup lang="ts">
const route = useRoute()
const { state } = useWorkspace()
const project = computed(() => state.projects.find(p => p.id === route.params.project))

watchEffect(() => {
  if (!project.value) navigateTo('/', { replace: true })
})
</script>

<template>
  <ThreadsView v-if="project" :key="project.id" :project="project" />
</template>
