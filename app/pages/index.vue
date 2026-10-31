<script setup lang="ts">
import type { Project } from '~/composables/useWorkspace'

const { state } = useWorkspace()
const projectForm = useState<Project | 'new' | null>('project-form')

watchEffect(() => {
  const first = state.projects[0]
  if (first) navigateTo(`/p/${first.id}`, { replace: true })
})
</script>

<template>
  <EmptyState icon="hash">
    프로젝트가 없어요.
    <template #action>
      <button class="btn" @click="projectForm = 'new'">첫 프로젝트 만들기</button>
    </template>
  </EmptyState>
</template>
