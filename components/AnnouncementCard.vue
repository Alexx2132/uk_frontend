<script setup>
import { formatDate } from '~/utils/format'

defineProps({
  item: { type: Object, required: true },
  canArchive: { type: Boolean, default: false },
  showHistory: { type: Boolean, default: false },
  busy: { type: Boolean, default: false }
})
const emit = defineEmits(['toggle-active'])

const actionLabel = (action) => ({
  created: 'Создано',
  archived: 'Архивировано',
  restored: 'Восстановлено'
}[action] || action)
</script>

<template>
  <div class="notice-card" :class="{ 'notice-card--archived': item.is_active === false }">
    <div class="notice-card__head">
      <h3>{{ item.title }}</h3>
      <div class="notice-card__badges">
        <span v-if="item.is_important" class="pill pill--danger">Важное</span>
        <span v-if="item.is_active === false" class="notice-card__archive-badge">В архиве</span>
      </div>
    </div>
    <div class="muted">{{ formatDate(item.created_at) }}</div>
    <p>{{ item.content || item.description }}</p>
    <div class="notice-card__meta">
      <span>Дом: {{ item.targetHouseLabel || 'Для всех домов' }}</span>
      <span v-if="item.targetEntranceLabel">Подъезд: {{ item.targetEntranceLabel }}</span>
    </div>
    <div v-if="showHistory && item.history?.length" class="notice-card__history">
      <div class="notice-card__history-title">История объявления</div>
      <div v-for="entry in item.history" :key="entry.id" class="notice-card__history-row">
        <span>{{ actionLabel(entry.action) }}</span>
        <strong>{{ entry.actor_name || 'Система' }}</strong>
        <small>{{ formatDate(entry.created_at) }}</small>
      </div>
    </div>
    <div v-if="canArchive" class="notice-card__actions">
      <button class="btn btn--ghost btn--sm" type="button" :disabled="busy" @click="emit('toggle-active', item)">
        {{ item.is_active === false ? 'Восстановить' : 'В архив' }}
      </button>
    </div>
  </div>
</template>
