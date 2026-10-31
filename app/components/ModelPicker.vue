<script setup lang="ts">
const model = defineModel<string>({ required: true })

const { models, error, recent, bookmarks, sort, grouped, load, nameOf, isBookmarked } = useModels()
const open = ref(false)
const q = ref('')
const search = ref<HTMLInputElement | null>(null)
// Companies whose list is unfolded while browsing; a search shows every match regardless
const expanded = ref(new Set<string>())

onMounted(load)

watch(open, async (isOpen) => {
  if (!isOpen) return
  q.value = ''
  expanded.value = new Set([companyOf(model.value)])
  load()
  await nextTick()
  search.value?.focus()
})

const query = computed(() => q.value.trim().toLowerCase())
const matches = computed(() => {
  const list = models.value ?? []
  const found = query.value
    ? list.filter(m => m.id.toLowerCase().includes(query.value) || m.name.toLowerCase().includes(query.value))
    : list
  return sortModels(found, sort.value)
})
const groups = computed(() => groupByCompany(matches.value))

function isExpanded(company: string) {
  return !!query.value || expanded.value.has(company)
}

function toggle(company: string) {
  const next = new Set(expanded.value)
  if (!next.delete(company)) next.add(company)
  expanded.value = next
}

const known = (ids: string[]) => ids.flatMap(id => models.value?.find(m => m.id === id) ?? [])
const bookmarkModels = computed(() => (query.value ? [] : known(bookmarks.value)))
const recentModels = computed(() => (query.value ? [] : known(recent.value.filter(id => !isBookmarked(id)))))
// Lets a model through before the list has it, or when the list failed to load
const customId = computed(() => {
  const id = q.value.trim()
  return id.includes('/') && !models.value?.some(m => m.id === id) ? id : null
})

function pick(id: string) {
  model.value = id
  open.value = false
}

function onEnter() {
  // The first row on screen: grouping can put a different model above the sort's first
  const id = (grouped.value ? groups.value[0]?.models[0] : matches.value[0])?.id ?? customId.value
  if (id) pick(id)
}
</script>

<template>
  <slot :open="() => { open = true }">
    <button type="button" class="chip" title="모델 선택" @click="open = true">
      <Icon name="spark" :size="14" />
      <span class="chip-name">{{ nameOf(model) }}</span>
      <Icon name="chevron" :size="12" />
    </button>
  </slot>

  <BaseModal v-if="open" title="모델 선택" subtitle="가격은 입력 / 출력 100만 토큰당 기준이에요" :width="560" @close="open = false">
    <input
      ref="search"
      v-model="q"
      class="field"
      type="search"
      placeholder="이름이나 ID로 검색"
      aria-label="모델 검색"
      @keydown.enter.prevent="onEnter"
    >
    <div class="controls">
      <select v-model="sort" class="sort" aria-label="정렬">
        <option value="name">이름순</option>
        <option value="price-asc">가격 낮은순</option>
        <option value="price-desc">가격 높은순</option>
      </select>
      <label class="group-toggle"><input v-model="grouped" type="checkbox"> 기업별로 묶기</label>
    </div>
    <p v-if="error" class="err">{{ error }} <button type="button" @click="load">다시 시도</button></p>
    <p v-else-if="!models" class="muted">불러오는 중…</p>

    <div class="list">
      <button v-if="customId" type="button" class="custom" @click="pick(customId!)">
        <span class="custom-name">직접 입력한 ID 사용</span>
        <span class="custom-id">{{ customId }}</span>
      </button>
      <template v-if="bookmarkModels.length">
        <h3>북마크</h3>
        <ModelRow v-for="m in bookmarkModels" :key="m.id" :model="m" :selected="m.id === model" @pick="pick(m.id)" />
      </template>
      <template v-if="recentModels.length">
        <h3>최근 사용</h3>
        <ModelRow v-for="m in recentModels" :key="m.id" :model="m" :selected="m.id === model" @pick="pick(m.id)" />
      </template>
      <h3 v-if="bookmarkModels.length || recentModels.length">모든 모델</h3>
      <template v-if="grouped">
        <section v-for="g in groups" :key="g.company">
          <button type="button" class="company" :aria-expanded="isExpanded(g.company)" @click="toggle(g.company)">
            <Icon name="chevron" :size="14" :class="{ rot: !isExpanded(g.company) }" />
            <span class="company-name">{{ g.company }}</span>
            <span class="company-count">{{ g.models.length }}</span>
          </button>
          <template v-if="isExpanded(g.company)">
            <ModelRow v-for="m in g.models" :key="m.id" :model="m" :selected="m.id === model" @pick="pick(m.id)" />
          </template>
        </section>
      </template>
      <template v-else>
        <ModelRow v-for="m in matches" :key="m.id" :model="m" :selected="m.id === model" @pick="pick(m.id)" />
      </template>
      <p v-if="models && !matches.length && !customId" class="muted">맞는 모델이 없어요.</p>
    </div>
  </BaseModal>
</template>

<style scoped>
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  max-width: 220px;
  height: 28px;
  padding: 0 8px;
  border-radius: 14px;
  background: var(--bg-input);
  color: var(--fg);
  font-size: 13px;
  font-weight: 600;
}
.chip:hover {
  background: var(--accent-soft);
}
.chip .icon:first-child {
  color: var(--accent);
}
.chip-name {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.controls {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
}
.sort {
  height: 30px;
  padding: 0 6px;
  border: none;
  border-radius: 4px;
  background: var(--bg-input);
  outline: none;
  font-size: 13px;
}
.group-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--fg-muted);
  cursor: pointer;
}
.list {
  height: min(420px, 50dvh);
  margin-top: 8px;
  overflow-y: auto;
}
.company {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 4px;
  height: 34px;
  padding: 0 8px 0 4px;
  border-radius: 4px;
  color: var(--fg);
  text-align: left;
}
.company:hover {
  background: var(--bg-hover);
}
.company .icon {
  color: var(--fg-muted);
  transition: transform 0.15s;
}
.company .rot {
  transform: rotate(-90deg);
}
.company-name {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 700;
}
.company-count {
  font-size: 12px;
  color: var(--fg-faint);
}
h3 {
  margin: 10px 8px 4px;
  font-size: 12px;
  font-weight: 700;
  color: var(--fg-muted);
}
.custom {
  width: 100%;
  display: flex;
  flex-direction: column;
  padding: 7px 8px;
  border-radius: 4px;
  text-align: left;
}
.custom:hover {
  background: var(--bg-hover);
}
.custom-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--fg-strong);
}
.custom-id {
  font-size: 12px;
  color: var(--fg-faint);
  overflow-wrap: anywhere;
}
.muted {
  font-size: 14px;
  color: var(--fg-muted);
}
.err {
  font-size: 14px;
  color: var(--danger);
}
.err button {
  text-decoration: underline;
}
</style>
