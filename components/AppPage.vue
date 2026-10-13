<script setup>
const props = defineProps({
  title: { type: String, required: true },
  subtitle: { type: String, default: '' }
})

const { settings, loadSettings } = useAppSettings()

useHead(() => ({
  title: `${props.title} | ${settings.value.app_brand}`
}))

onMounted(() => {
  loadSettings()
})
</script>

<template>
  <div class="page">
    <AppSidebar />
    <div class="page__content">
      <header class="page-header">
        <div class="eyebrow">{{ settings.app_brand }}</div>
        <h1>{{ title }}</h1>
        <p v-if="subtitle" class="page-header__subtitle">{{ subtitle }}</p>
      </header>
      <slot />
    </div>
  </div>
</template>
