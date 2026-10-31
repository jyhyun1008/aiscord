<script setup lang="ts">
import type { Profile } from '~/composables/useUi'

const props = defineProps<{ profile: Profile, namePlaceholder: string, previewName: string }>()

const toast = useToast()
const file = ref<HTMLInputElement | null>(null)

async function onFile() {
  const picked = file.value?.files?.[0]
  if (!picked) return
  try {
    props.profile.avatar = await imageToAvatar(picked)
  }
  catch {
    toast.error('이미지를 읽지 못했어요')
  }
  file.value!.value = ''
}
</script>

<template>
  <div class="profile">
    <Avatar class="avatar" :name="props.previewName" :src="props.profile.avatar" />
    <div class="fields">
      <input v-model="props.profile.name" class="field" maxlength="40" :placeholder="props.namePlaceholder" aria-label="닉네임">
      <div class="buttons">
        <input ref="file" class="sr-only" type="file" accept="image/*" tabindex="-1" aria-hidden="true" @change="onFile">
        <button type="button" class="btn small" @click="file?.click()">프사 올리기</button>
        <button v-if="props.profile.avatar" type="button" class="btn ghost small" @click="props.profile.avatar = ''">지우기</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.profile {
  display: flex;
  align-items: center;
  gap: 12px;
}
.avatar {
  flex-shrink: 0;
  width: 72px;
  height: 72px;
  font-size: 22px;
}
.fields {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.buttons {
  display: flex;
  gap: 6px;
}
</style>
