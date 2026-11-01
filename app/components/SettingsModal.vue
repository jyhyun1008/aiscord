<script setup lang="ts">
const emit = defineEmits<{ close: [] }>()

const ui = useUi()
const showKey = ref(false)

const themes = [
  { value: 'system', label: '시스템' },
  { value: 'dark', label: '다크' },
  { value: 'light', label: '라이트' },
] as const

const aiPreviewName = computed(() => ui.ai.name || 'AI')

const sync = useSync()
const importInput = ref<HTMLInputElement | null>(null)

async function onImport() {
  const file = importInput.value?.files?.[0]
  if (file && confirm('백업을 지금 데이터와 합칠까요?\n같은 스레드는 더 최근에 바뀐 쪽만 남아요.')) await sync.importFile(file)
  importInput.value!.value = ''
}
</script>

<template>
  <BaseModal title="설정" subtitle="동기화를 켜지 않으면 모두 이 브라우저에만 저장돼요" :width="520" @close="emit('close')">
    <section>
      <h3>OpenRouter API 키</h3>
      <div class="key">
        <input
          v-model.trim="ui.apiKey"
          class="field"
          :type="showKey ? 'text' : 'password'"
          placeholder="sk-or-…"
          autocomplete="off"
          spellcheck="false"
          aria-label="OpenRouter API 키"
        >
        <button class="icon-btn" :title="showKey ? '가리기' : '보기'" @click="showKey = !showKey"><Icon name="eye" :size="18" /></button>
      </div>
      <p class="hint">
        <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer">openrouter.ai/keys</a>에서 만들 수 있어요.
        키는 암호화 없이 저장되니 공용 컴퓨터에서는 쓰지 마세요.
      </p>
    </section>

    <section>
      <h3>내 프로필</h3>
      <ProfileFields :profile="ui.me" name-placeholder="닉네임" :preview-name="ui.me.name || '나'" />
    </section>

    <section>
      <h3>AI 프로필</h3>
      <ProfileFields :profile="ui.ai" name-placeholder="비우면 모델 이름을 보여줘요" :preview-name="aiPreviewName" />
    </section>

    <section>
      <h3>요약 모델</h3>
      <ModelPicker v-model="ui.summaryModel" />
      <p class="hint">
        긴 대화의 앞부분을 줄일 때 써요. 무료 모델은 하루 요청 수가 제한되고, 제공사가 내용을 저장하거나 학습에 쓸 수 있어요.
        실패하면 스레드의 모델로 다시 요약해요.
      </p>
    </section>

    <section>
      <h3>백업과 동기화</h3>
      <div class="sync">
        <button class="btn small" @click="sync.exportFile"><Icon name="download" :size="14" /> 내보내기</button>
        <input ref="importInput" class="sr-only" type="file" accept="application/json,.json" tabindex="-1" aria-hidden="true" @change="onImport">
        <button class="btn small" @click="importInput?.click()"><Icon name="upload" :size="14" /> 가져오기</button>
        <button v-if="sync.enabled" class="btn small" :disabled="sync.status.syncing" @click="sync.syncNow">
          <Icon name="cloud" :size="14" /> {{ sync.status.connected ? '지금 동기화' : '구글로 로그인하고 동기화' }}
        </button>
        <button v-if="sync.persistent && sync.status.connected" class="btn small" :disabled="sync.status.syncing" @click="sync.disconnect">구글 연결 해제</button>
      </div>
      <p class="hint">
        프로젝트, 메모, 대화 내용과 프로필, 북마크, 테마가 포함돼요. API 키는 포함되지 않으니 기기마다 입력해 주세요.
        <template v-if="sync.enabled">
          <template v-if="sync.persistent">구글 연결을 유지하며 답변이 끝나면 자동으로 동기화해요.</template>
          <template v-else>드라이브 연결은 약 1시간 유지되고, 그동안 답변이 끝나면 자동으로 동기화해요.</template>
          <strong v-if="sync.needsReconnect.value" class="unsynced">올라가지 않은 변경이 있어요. 다시 연결해 주세요.</strong>
          <template v-if="sync.status.lastSyncedAt">마지막 동기화: {{ formatStamp(sync.status.lastSyncedAt) }}</template>
        </template>
      </p>
    </section>

    <section>
      <h3>테마</h3>
      <div class="themes">
        <button v-for="t in themes" :key="t.value" class="btn small" :class="{ ghost: ui.theme !== t.value }" @click="ui.theme = t.value">
          {{ t.label }}
        </button>
      </div>
      <div class="accents">
        <button
          v-for="color in ACCENT_PRESETS"
          :key="color"
          class="swatch"
          :class="{ on: ui.accent === color }"
          :style="{ background: color }"
          :title="color"
          :aria-label="`테마 색 ${color}`"
          @click="ui.accent = color"
        />
      </div>
    </section>
  </BaseModal>
</template>

<style scoped>
section + section {
  margin-top: 20px;
}
h3 {
  margin: 0 0 8px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--fg-muted);
}
.key {
  display: flex;
  align-items: center;
  gap: 4px;
}
.hint {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--fg-muted);
}
.unsynced {
  color: var(--danger);
}
.sync {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.themes {
  display: flex;
  gap: 6px;
}
.accents {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.swatch {
  width: 28px;
  height: 28px;
  border-radius: 50%;
}
.swatch.on {
  box-shadow: 0 0 0 2px var(--bg-main), 0 0 0 4px var(--fg-strong);
}
</style>
