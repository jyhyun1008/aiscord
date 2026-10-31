<script setup lang="ts">
/** A picture, or colored initials when there is none (or it fails to load). */
const props = defineProps<{ name: string, src?: string }>()

const broken = ref(false)
watch(() => props.src, () => {
  broken.value = false
})
const fallback = computed(() => ({ background: `hsl(${hueOf(props.name)} 55% 45%)` }))
</script>

<template>
  <img v-if="props.src && !broken" class="avatar" :src="props.src" alt="" @error="broken = true">
  <span v-else class="avatar initials" :style="fallback" aria-hidden="true">{{ initials(props.name) }}</span>
</template>

<style scoped>
.avatar {
  display: block;
  border-radius: 50%;
  object-fit: cover;
}
.initials {
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 0.8em;
  font-weight: 700;
  overflow: hidden;
}
</style>
