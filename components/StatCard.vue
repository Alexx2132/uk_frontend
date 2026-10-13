<script setup>
defineProps({ label: String, value: [String, Number], note: String })
</script>

<template>
  <div class="stat-card">
    <div class="stat-card__label">{{ label }}</div>
    <div class="stat-card__value">{{ value }}</div>
    <div v-if="note" class="stat-card__note">{{ note }}</div>
  </div>
</template>
