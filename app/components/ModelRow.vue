<script setup lang="ts">
import type { Model } from '~/utils/openrouter'

const props = defineProps<{ model: Model, selected: boolean }>()
const emit = defineEmits<{ pick: [] }>()

const { isBookmarked, toggleBookmark } = useModels()

const bookmarked = computed(() => isBookmarked(props.model.id))

const price = computed(() => {
  const { promptPrice, completionPrice } = props.model
  if (promptPrice === null || completionPrice === null) return '가격 변동'
  if (promptPrice === 0 && completionPrice === 0) return '무료'
  const perMillion = (usd: number) => `$${(usd * 1e6).toFixed(2)}`
  return `${perMillion(promptPrice)} / ${perMillion(completionPrice)}`
})
</script>

<template>
  <div class="row" :class="{ on: props.selected }">
    <button type="button" class="pick" @click="emit('pick')">
      <span class="row-name">{{ props.model.name }}</span>
      <span class="row-id">{{ props.model.id }}</span>
      <span class="row-price">{{ price }}</span>
    </button>
    <button
      type="button"
      class="star"
      :class="{ on: bookmarked }"
      :title="bookmarked ? '북마크 해제' : '북마크'"
      :aria-label="`${props.model.name} 북마크`"
      :aria-pressed="bookmarked"
      @click="toggleBookmark(props.model.id)"
    >
      <Icon name="star" :size="16" />
    </button>
  </div>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  border-radius: 4px;
}
.row:hover {
  background: var(--bg-hover);
}
.row.on {
  background: var(--accent-soft);
}
.pick {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  column-gap: 12px;
  padding: 7px 4px 7px 8px;
  text-align: left;
}
.row-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--fg-strong);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.row-id {
  grid-row: 2;
  font-size: 12px;
  color: var(--fg-faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.row-price {
  grid-row: 1 / span 2;
  grid-column: 2;
  align-self: center;
  font-size: 12px;
  color: var(--fg-muted);
}
.star {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  margin-right: 4px;
  display: grid;
  place-items: center;
  border-radius: 4px;
  color: var(--fg-faint);
}
.star:hover {
  color: var(--fg);
}
.star.on {
  color: #f1c40f;
}
.star.on .icon {
  fill: currentColor;
}
</style>
