<script setup lang="ts">
/** The picture set in settings wins; otherwise the company's logo, or initials for an unknown one. */
const props = defineProps<{ model?: string, name: string }>()

const ui = useUi()
const logo = computed(() => (props.model ? companyLogo(props.model) : null))
</script>

<template>
  <span v-if="logo && !ui.ai.avatar" class="logo" :style="{ background: logo.color }" aria-hidden="true">
    <i :style="{ maskImage: `url(/icons/ai/${logo.slug}.svg)` }" />
  </span>
  <Avatar v-else :name="props.name" :src="ui.ai.avatar" />
</template>

<style scoped>
.logo {
  display: grid;
  place-items: center;
  border-radius: 50%;
}
i {
  width: 62%;
  height: 62%;
  background: #fff;
  mask-position: center;
  mask-repeat: no-repeat;
  mask-size: contain;
}
</style>
