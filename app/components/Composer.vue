<script setup lang="ts">
const props = defineProps<{
  placeholder: string
  /** Keeps the unsent text when navigating away and back */
  draftKey: string
  busy?: boolean
}>()
const emit = defineEmits<{ send: [text: string], stop: [] }>()

const ui = useUi()
const text = useState<string>(`draft:${props.draftKey}`, () => '')
const box = ref<HTMLTextAreaElement | null>(null)

const canSend = computed(() => !!text.value.trim() && !!ui.apiKey && !props.busy)

function resize() {
  const el = box.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}
watch(text, () => nextTick(resize))
onMounted(() => {
  resize()
  box.value?.focus()
})

function send() {
  if (!canSend.value) return
  emit('send', text.value.trim())
  text.value = ''
}

function onKeydown(e: KeyboardEvent) {
  // Enter confirming a Korean IME composition must not also send the message
  if (e.key !== 'Enter' || e.shiftKey || e.isComposing || e.keyCode === 229) return
  // On-screen keyboards have no Shift+Enter, so Enter stays a newline there
  if (matchMedia('(pointer: coarse)').matches) return
  e.preventDefault()
  send()
}
</script>

<template>
  <div class="composer">
    <button v-if="!ui.apiKey" type="button" class="key-hint" @click="ui.settingsOpen = true">
      <Icon name="warn" :size="16" />
      OpenRouter API 키를 입력해야 질문할 수 있어요 — 설정 열기
    </button>
    <div class="box">
      <div class="row">
        <textarea
          ref="box"
          v-model="text"
          rows="1"
          :placeholder="props.placeholder"
          :aria-label="props.placeholder"
          @keydown="onKeydown"
        />
        <button v-if="props.busy" type="button" class="tool stop" title="답변 중단" @click="emit('stop')">
          <Icon name="stop" />
        </button>
        <button v-else type="button" class="tool send" title="보내기" :disabled="!canSend" @click="send">
          <Icon name="send" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.composer {
  flex-shrink: 0;
  padding: 0 16px 24px;
}
.key-hint {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--accent-soft);
  color: var(--fg);
  font-size: 14px;
  text-align: left;
}
.box {
  border-radius: 8px;
  background: var(--bg-input);
}
.row {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  padding: 0 6px 0 10px;
}
textarea {
  flex: 1;
  min-width: 0;
  min-height: 44px;
  max-height: 40vh;
  padding: 11px 6px;
  border: none;
  background: transparent;
  resize: none;
  outline: none;
  line-height: 22px;
}
textarea::placeholder {
  color: var(--fg-faint);
}
.tool {
  width: 36px;
  height: 44px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  color: var(--fg-muted);
}
.tool:disabled {
  opacity: 0.4;
  cursor: default;
}
.send:not(:disabled),
.stop {
  color: var(--accent);
}

@media (max-width: 768px) {
  .composer {
    padding: 8px 8px calc(8px + env(safe-area-inset-bottom));
  }
}
</style>
