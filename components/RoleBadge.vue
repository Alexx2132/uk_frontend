<script setup>
const props = defineProps({ role: { type: String, default: '' } })
const roleLabel = computed(() => {
  const value = String(props.role || '').toLowerCase()
  if (value === 'admin') return 'Администратор'
  if (value === 'admin_assistant') return 'Помощник администратора'
  if (value === 'dispatcher') return 'Диспетчер'
  if (value === 'executor') return 'Исполнитель'
  if (value === 'auditor') return 'Аудитор'
  if (value === 'resident') return 'Житель'
  return value || '—'
})
</script>

<template><span class="pill">{{ roleLabel }}</span></template>
