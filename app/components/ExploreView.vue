<script setup lang="ts">
import type { Project } from '~/composables/useWorkspace'
import type { KeyUsage } from '~/utils/openrouter'

const ui = useUi()
const chat = useChat()
const models = useModels()
const toast = useToast()
const { state, threadsOf } = useWorkspace()
const projectForm = useState<Project | 'new' | null>('project-form')

const keyUsage = ref<KeyUsage | null>(null)
const keyError = ref('')

async function loadKeyUsage() {
  if (!ui.apiKey) return
  try {
    keyUsage.value = await fetchKeyUsage(ui.apiKey)
    keyError.value = ''
  }
  catch (e) {
    keyError.value = e instanceof Error ? e.message : String(e)
  }
}

onMounted(() => {
  models.load()
  loadKeyUsage()
  chat.backfillUsage().catch(toast.error)
})

const keyStats = computed(() => {
  const usage = keyUsage.value
  if (!usage) return []
  const items = [
    { label: '오늘 (UTC)', value: usage.daily },
    { label: '이번 주', value: usage.weekly },
    { label: '이번 달', value: usage.monthly },
    { label: '전체', value: usage.total },
  ]
  if (usage.remaining !== null) items.push({ label: '남은 한도', value: usage.remaining })
  return items
})

const cards = computed(() => state.projects.map((project) => {
  const threads = threadsOf(project.id)
  return {
    project,
    threads: threads.length,
    tokens: threads.reduce((sum, t) => sum + (t.tokens ?? 0), 0),
    cost: threads.reduce((sum, t) => sum + (t.cost ?? 0), 0),
  }
}))

const stats = computed(() => [
  { label: '프로젝트', value: String(cards.value.length) },
  { label: '스레드', value: String(state.threads.length) },
  { label: '토큰', value: formatTokens(cards.value.reduce((sum, c) => sum + c.tokens, 0)) },
  { label: '대화 비용', value: formatCost(cards.value.reduce((sum, c) => sum + c.cost, 0)) },
])

function open(project: Project) {
  ui.navOpen = false
  return navigateTo(`/p/${project.id}`)
}
</script>

<template>
  <div class="explore">
    <ViewHeader icon="compass" title="프로젝트 훑어보기" topic="사용량과 프로젝트 지침" />

    <div class="scroll">
      <section class="hero">
        <div class="banner" />
        <div class="hero-body">
          <img class="server-icon" src="/icons/aiscord.svg" alt="">
          <div class="hero-text">
            <h2 class="server-name">Aiscord</h2>
            <p class="server-host">openrouter.ai</p>
          </div>
        </div>
        <div class="stats">
          <div v-for="s in stats" :key="s.label" class="stat">
            <strong>{{ s.value }}</strong>
            <span>{{ s.label }}</span>
          </div>
        </div>
      </section>
      <p class="hint">토큰과 대화 비용은 남아 있는 대화만 합산해서, 다시 생성하거나 지운 답변은 빠져요.</p>

      <section v-if="keyStats.length" class="billed">
        <h3>이 API 키의 실제 사용액</h3>
        <div class="stats key-stats" :style="{ '--cols': keyStats.length }">
          <div v-for="s in keyStats" :key="s.label" class="stat">
            <strong>{{ formatCost(s.value) }}</strong>
            <span>{{ s.label }}</span>
          </div>
        </div>
      </section>
      <p v-else-if="keyError" class="hint error">사용액을 불러오지 못했어요: {{ keyError }}</p>

      <EmptyState v-if="!cards.length" icon="hash">
        프로젝트가 없어요.
        <template #action>
          <button class="btn" @click="projectForm = 'new'">첫 프로젝트 만들기</button>
        </template>
      </EmptyState>

      <div v-else class="grid">
        <article
          v-for="c in cards"
          :key="c.project.id"
          class="card"
          role="button"
          tabindex="0"
          @click="open(c.project)"
          @keydown.enter="open(c.project)"
        >
          <header class="card-head">
            <Icon name="hash" :size="18" class="card-icon" />
            <h3 class="name">{{ c.project.name }}</h3>
            <button class="icon-btn edit" title="프로젝트 편집" @click.stop="projectForm = c.project" @keydown.enter.stop>
              <Icon name="settings" :size="16" />
            </button>
          </header>
          <p class="model"><Icon name="spark" :size="14" /> {{ models.nameOf(c.project.model) }}</p>
          <p class="instructions" :class="{ empty: !c.project.instructions }">{{ c.project.instructions || '지침이 없어요.' }}</p>
          <p v-if="c.project.memo" class="project-memo"><Icon name="pin" :size="12" /> {{ c.project.memo }}</p>
          <footer class="meta">
            <span><Icon name="thread" :size="12" /> 스레드 {{ c.threads }}개</span>
            <span>{{ formatTokens(c.tokens) }} 토큰</span>
            <span>{{ formatCost(c.cost) }}</span>
          </footer>
        </article>
      </div>
    </div>
  </div>
</template>

<style scoped>
.explore {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.scroll {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}
.hero {
  max-width: 1100px;
  margin: 0 auto;
  border-radius: var(--radius);
  background: var(--bg-sidebar);
  border: 1px solid var(--border);
  overflow: hidden;
}
.banner {
  height: 120px;
  background: linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent), black 45%));
}
/* Only the icon overlaps the banner; the name sits fully below it */
.hero-body {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 0 20px;
}
.server-icon {
  flex-shrink: 0;
  width: 72px;
  height: 72px;
  margin-top: -36px;
  border-radius: 20px;
  border: 4px solid var(--bg-sidebar);
  background: var(--bg-sidebar);
}
.hero-text {
  min-width: 0;
  padding-top: 8px;
}
.server-name {
  margin: 0;
  font-size: 20px;
  color: var(--fg-strong);
}
.server-host {
  margin: 0;
  font-size: 13px;
  color: var(--fg-muted);
}
.stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  margin-top: 16px;
  border-top: 1px solid var(--border);
  background: var(--border);
}
.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 12px 8px;
  background: var(--bg-sidebar);
}
.stat strong {
  font-size: 18px;
  color: var(--fg-strong);
}
.stat span {
  font-size: 12px;
  color: var(--fg-muted);
}
.hint {
  max-width: 1100px;
  margin: 8px auto 16px;
  font-size: 12px;
  color: var(--fg-faint);
}
.hint.error {
  color: var(--danger);
}
.billed {
  max-width: 1100px;
  margin: 0 auto 16px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--bg-sidebar);
  overflow: hidden;
}
.billed h3 {
  margin: 0;
  padding: 10px 16px;
  font-size: 12px;
  font-weight: 700;
  color: var(--fg-muted);
}
.key-stats {
  grid-template-columns: repeat(var(--cols), 1fr);
  margin-top: 0;
}
.grid {
  max-width: 1100px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
  gap: 12px;
}
.card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 16px 14px;
  border-radius: var(--radius);
  background: var(--bg-sidebar);
  border: 1px solid var(--border);
  cursor: pointer;
  min-width: 0;
  transition: background 0.15s, border-color 0.15s;
}
.card:hover {
  background: var(--bg-embed);
  border-color: var(--bg-active);
}
.card-head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.card-icon {
  color: var(--fg-faint);
}
.name {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: var(--fg-strong);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.edit {
  margin-right: -8px;
}
.model {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--fg-muted);
}
.model .icon {
  color: var(--accent);
}
.instructions {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  margin: 0;
  overflow: hidden;
  font-size: 14px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.project-memo {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--fg-muted);
}
.instructions.empty {
  color: var(--fg-faint);
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: auto;
  padding-top: 4px;
  font-size: 12px;
  color: var(--fg-faint);
}
.meta span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

@media (max-width: 768px) {
  .stats,
  .key-stats {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
