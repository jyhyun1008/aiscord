<script setup lang="ts">
import type { Project } from '~/composables/useWorkspace'
import type { PresetId } from '~/utils/context'

const props = defineProps<{ project: Project | null }>()
const emit = defineEmits<{ close: [] }>()

const chat = useChat()
const { createProject, updateProject, removeProject } = useWorkspace()

const name = ref(props.project?.name ?? '')
const instructions = ref(props.project?.instructions ?? '')
const memo = ref(props.project?.memo ?? '')
const model = ref(props.project?.model ?? DEFAULT_MODEL)
const preset = ref<PresetId>(props.project?.preset ?? 'default')

function save() {
  const fields = { name: name.value.trim(), instructions: instructions.value, memo: memo.value, model: model.value, preset: preset.value }
  if (!fields.name) return
  if (props.project) {
    updateProject(props.project.id, fields)
  }
  else {
    navigateTo(`/p/${createProject(fields).id}`)
  }
  emit('close')
}

function remove() {
  const project = props.project!
  if (!confirm(`#${project.name} 프로젝트를 삭제할까요?\n안의 스레드와 대화 내용도 모두 사라져요.`)) return
  for (const id of removeProject(project.id)) chat.dropHistory(id)
  emit('close')
}
</script>

<template>
  <BaseModal :title="props.project ? '프로젝트 편집' : '프로젝트 만들기'" subtitle="프로젝트는 채널처럼 스레드를 모아 둬요" @close="emit('close')">
    <form id="project-form" class="form" @submit.prevent="save">
      <label>
        <span>이름</span>
        <input v-model="name" class="field" maxlength="60" placeholder="새 프로젝트" autofocus>
      </label>
      <label>
        <span>지침 (시스템 프롬프트)</span>
        <textarea v-model="instructions" class="field area" rows="5" placeholder="이 프로젝트의 모든 스레드에 적용돼요" />
      </label>
      <label>
        <span>메모</span>
        <textarea v-model="memo" class="field area" rows="4" placeholder="대화에서 저장한 내용이 여기 쌓여요" />
        <small>메시지마다 함께 전달돼요 · 약 {{ estimateTokens(memo) }} 토큰</small>
      </label>
      <div class="model">
        <span>새 스레드의 기본 모델</span>
        <ModelPicker v-model="model" />
      </div>
      <label>
        <span>토큰 사용량</span>
        <select v-model="preset" class="field">
          <option v-for="(p, id) in CONTEXT_PRESETS" :key="id" :value="id">{{ p.label }}</option>
        </select>
        <small>{{ CONTEXT_PRESETS[preset].description }}</small>
      </label>
    </form>
    <template #footer>
      <button v-if="props.project" type="button" class="btn danger delete" @click="remove">삭제</button>
      <button type="button" class="btn ghost" @click="emit('close')">취소</button>
      <button type="submit" form="project-form" class="btn" :disabled="!name.trim()">저장</button>
    </template>
  </BaseModal>
</template>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
label,
.model {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--fg-muted);
}
.model {
  align-items: flex-start;
}
small {
  font-weight: 400;
  color: var(--fg-faint);
}
.field {
  font-weight: 400;
  color: var(--fg);
}
.area {
  height: auto;
  padding: 8px 10px;
  resize: vertical;
}
.delete {
  margin-right: auto;
}
</style>
