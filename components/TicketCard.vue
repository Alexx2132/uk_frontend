<script setup>
import { formatAddress, formatDate, formatTicketPriority, formatTicketStatus, priorityAccent } from '~/utils/format'

const props = defineProps({
  ticket: { type: Object, required: true },
  linkTo: { type: String, default: '' },
  hasComplaint: { type: Boolean, default: false },
  unread: { type: Boolean, default: false },
  showAssignButton: { type: Boolean, default: false }
})

const emit = defineEmits(['assign'])

const openTicketPage = async () => {
  if (!props.linkTo) return
  await navigateTo(props.linkTo)
}

const ticketPriorityClass = computed(() => `ticket-card--priority-${priorityAccent(props.ticket?.priority)}`)
</script>

<template>
  <div
    class="ticket-card"
    :class="[ticketPriorityClass, { 'ticket-card--interactive': Boolean(linkTo), 'ticket-card--has-complaint': hasComplaint, 'ticket-card--unread': unread }]"
    :role="linkTo ? 'button' : undefined"
    :tabindex="linkTo ? 0 : undefined"
    @click="openTicketPage"
    @keydown.enter.prevent="openTicketPage"
    @keydown.space.prevent="openTicketPage"
  >
    <div class="ticket-card__head">
      <div>
        <h3>{{ ticket.title }}</h3>
        <div class="ticket-card__status">{{ ticket.status_label || formatTicketStatus(ticket.status) }}</div>
      </div>
      <div class="ticket-card__top-meta">
        <span v-if="hasComplaint" class="ticket-card__flag-wrap">
          <span class="ticket-card__flag" aria-label="По заявке есть открытая жалоба">!</span>
          <span class="ticket-card__flag-tooltip">
            По заявке есть открытая жалоба. Откройте карточку, чтобы посмотреть детали обращения.
          </span>
        </span>
        <span v-if="unread" class="ticket-card__unread">Новая</span>
        <div class="ticket-card__date">{{ formatDate(ticket.created_at) }}</div>
      </div>
    </div>

    <p class="ticket-card__desc">{{ ticket.description || 'Без описания' }}</p>

    <div class="ticket-card__meta">
      <span>Дом: {{ formatAddress(ticket.house) }}</span>
      <span>Кв.: {{ ticket.apartment || ticket.apartment_id || '—' }}</span>
      <span>Приоритет: {{ formatTicketPriority(ticket.priority) }}</span>
      <span>Исполнитель: {{ ticket.executor?.full_name || 'не назначен' }}</span>
    </div>

    <div v-if="showAssignButton" class="ticket-card__actions ticket-card__actions--inline">
      <button class="btn btn--ghost" type="button" @click.stop="emit('assign', ticket)">Назначить исполнителя</button>
    </div>
  </div>
</template>
