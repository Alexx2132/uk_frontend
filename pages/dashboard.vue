<script setup>
import { formatTicketPriority, formatTicketStatus } from '~/utils/format'

definePageMeta({ middleware: 'auth' })

const auth = useAuth()
const api = useApi()
const liveUpdates = useLiveUpdates()
const { dashboardMeta } = useRoleContent()

const loading = ref(true)
const error = ref('')
const dashboard = ref(null)
const tickets = ref([])
const assignModalTicketId = ref(null)
const complaintTicketIds = ref([])
const unreadTicketIds = ref(new Set())
const openComplaintCount = ref(0)
const dashboardStatusFilter = ref('')
const dashboardPriorityFilter = ref('')

const isStaff = computed(() => auth.hasRole('admin', 'admin_assistant', 'dispatcher', 'auditor'))
const canViewComplaintFlags = computed(() => auth.hasRole('admin', 'dispatcher', 'auditor'))
const isResident = computed(() => auth.hasRole('resident'))
const isExecutor = computed(() => auth.hasRole('executor'))
const canManageAssignments = computed(() => auth.hasRole('admin', 'dispatcher'))
const canUseTicketFilters = computed(() => isStaff.value)

const activeStatuses = ['created', 'assigned', 'in_progress']
const statusFilterOptions = [
  { value: 'created', label: formatTicketStatus('created') },
  { value: 'assigned', label: formatTicketStatus('assigned') },
  { value: 'in_progress', label: formatTicketStatus('in_progress') },
  { value: 'done', label: formatTicketStatus('done') },
  { value: 'closed', label: formatTicketStatus('closed') },
  { value: 'canceled', label: formatTicketStatus('canceled') }
]
const priorityFilterOptions = [
  { value: 'low', label: formatTicketPriority('low') },
  { value: 'normal', label: formatTicketPriority('normal') },
  { value: 'high', label: formatTicketPriority('high') },
  { value: 'emergency', label: formatTicketPriority('emergency') }
]
let refreshTimer = null
let refreshInFlight = false
let refreshQueued = false
let unsubscribeLiveUpdates = null

const visibleTickets = computed(() => {
  if (isResident.value || isExecutor.value) {
    const active = tickets.value.filter((ticket) => activeStatuses.includes(String(ticket.status || '').toLowerCase()))
    return active.length ? active.slice(0, 6) : tickets.value.slice(0, 6)
  }
  return dashboardFiltersActive.value ? filteredDashboardTickets.value : filteredDashboardTickets.value.slice(0, 8)
})

const filteredDashboardTickets = computed(() => {
  if (!canUseTicketFilters.value) return tickets.value

  const selectedStatus = dashboardStatusFilter.value
  const selectedPriority = dashboardPriorityFilter.value

  return tickets.value.filter((ticket) => {
    const statusMatches = !selectedStatus || String(ticket.status || '').toLowerCase() === selectedStatus
    const priorityMatches = !selectedPriority || String(ticket.priority || 'normal').toLowerCase() === selectedPriority
    return statusMatches && priorityMatches
  })
})

const dashboardFiltersActive = computed(() => Boolean(dashboardStatusFilter.value || dashboardPriorityFilter.value))

const resetDashboardFilters = () => {
  dashboardStatusFilter.value = ''
  dashboardPriorityFilter.value = ''
}

const ticketsSectionTitle = computed(() => {
  if (isResident.value) return 'Текущие заявки'
  if (isExecutor.value) return 'Рабочие заявки'
  return 'Последние заявки'
})

const emptyText = computed(() => {
  if (dashboardFiltersActive.value && canUseTicketFilters.value) return 'По выбранным фильтрам заявок нет.'
  if (isResident.value) return 'У вас пока нет заявок.'
  if (isExecutor.value) return 'Назначенных заявок пока нет.'
  return 'Пока нет заявок.'
})

const executorHighlights = computed(() => {
  const assigned = tickets.value.filter((ticket) => String(ticket.status || '').toLowerCase() === 'assigned').length
  const inProgress = tickets.value.filter((ticket) => String(ticket.status || '').toLowerCase() === 'in_progress').length
  const done = tickets.value.filter((ticket) => String(ticket.status || '').toLowerCase() === 'done').length

  return [
    { label: 'Назначены', value: assigned },
    { label: 'В работе', value: inProgress },
    { label: 'Ждут принятия', value: done }
  ]
})

const residentHighlights = computed(() => {
  const open = tickets.value.filter((ticket) => ['created', 'assigned', 'in_progress', 'done'].includes(String(ticket.status || '').toLowerCase())).length
  const closed = tickets.value.filter((ticket) => String(ticket.status || '').toLowerCase() === 'closed').length

  return [
    { label: 'Активные заявки', value: open },
    { label: 'Закрытые заявки', value: closed }
  ]
})

const hasComplaintFlag = (ticketId) => complaintTicketIds.value.includes(Number(ticketId))
const isTicketUnread = (ticketId) => unreadTicketIds.value.has(Number(ticketId))

const loadUnreadTicketNotifications = async () => {
  if (!isStaff.value) {
    unreadTicketIds.value = new Set()
    return
  }
  try {
    const notifications = await api.request('/notifications/', {
      query: { unread_only: true, skip: 0, limit: 200 }
    })
    const ids = (Array.isArray(notifications) ? notifications : [])
      .filter((item) => String(item?.notif_type || '') === 'ticket_created')
      .map((item) => Number(item?.ticket_id))
      .filter((value) => Number.isInteger(value) && value > 0)
    unreadTicketIds.value = new Set(ids)
  } catch {
    unreadTicketIds.value = new Set()
  }
}

const applyTicketPayload = (payload) => {
  const ticketId = Number(payload?.ticket_id)
  if (!Number.isInteger(ticketId) || ticketId <= 0) return

  tickets.value = tickets.value.map((item) => {
    if (Number(item.id) !== ticketId) return item
    return {
      ...item,
      ...(payload.status ? { status: payload.status } : {}),
      ...(Object.prototype.hasOwnProperty.call(payload, 'executor_id') ? { executor_id: payload.executor_id } : {})
    }
  })
}

const applyComplaintPayload = (payload) => {
  const ticketId = Number(payload?.ticket_id)
  if (!Number.isInteger(ticketId) || ticketId <= 0) return

  if (String(payload.status || '').toUpperCase() === 'OPEN') {
    complaintTicketIds.value = [...new Set([...complaintTicketIds.value, ticketId])]
  }
}

const fetchData = async ({ silent = false } = {}) => {
  if (refreshInFlight) {
    refreshQueued = true
    return
  }
  refreshInFlight = true

  if (!silent) {
    loading.value = true
    error.value = ''
  }

  try {
    const requests = []

    if (isStaff.value) {
      requests.push(api.request('/operations/dashboard'))
      requests.push(canViewComplaintFlags.value
        ? api.request('/ticket-complaints/', {
          query: { status: 'OPEN', skip: 0, limit: 200 }
        })
        : Promise.resolve([]))
    } else {
      requests.push(Promise.resolve(null))
      requests.push(Promise.resolve([]))
    }

    requests.push(api.request('/tickets/'))

    const [dashboardPayload, complaintsPayload, ticketsPayload] = await Promise.all(requests)
    dashboard.value = dashboardPayload
    tickets.value = ticketsPayload
    await loadUnreadTicketNotifications()
    complaintTicketIds.value = Array.isArray(complaintsPayload)
      ? [...new Set(complaintsPayload.map((item) => Number(item.ticket_id)).filter((value) => Number.isInteger(value) && value > 0))]
      : []
    openComplaintCount.value = Array.isArray(complaintsPayload) ? complaintsPayload.length : 0
  } catch (e) {
    error.value = e?.data?.detail || e?.message || 'Не удалось загрузить данные'
  } finally {
    if (!silent) loading.value = false
    refreshInFlight = false
    if (refreshQueued) {
      refreshQueued = false
      fetchData({ silent: true })
    }
  }
}

const canShowAssignButton = (ticket) => {
  const statusKey = String(ticket?.status || '').toLowerCase()
  return canManageAssignments.value && !ticket?.executor_id && !['done', 'closed', 'canceled'].includes(statusKey)
}

const openAssignModal = (ticket) => {
  const normalizedId = Number(ticket?.id)
  if (!Number.isInteger(normalizedId) || normalizedId <= 0) return
  assignModalTicketId.value = normalizedId
}

const closeAssignModal = () => {
  assignModalTicketId.value = null
}

onMounted(async () => {
  await fetchData()
  unsubscribeLiveUpdates = liveUpdates.subscribe((payload) => {
    if (!payload || !['ticket', 'complaint', 'notification'].includes(payload.entity)) return
    if (payload.entity === 'ticket') applyTicketPayload(payload)
    if (payload.entity === 'complaint') applyComplaintPayload(payload)
    fetchData({ silent: true })
  })
  if (process.client && isStaff.value) {
    refreshTimer = window.setInterval(() => {
      fetchData({ silent: true })
    }, 1000)
  }
})

onBeforeUnmount(() => {
  if (typeof unsubscribeLiveUpdates === 'function') {
    unsubscribeLiveUpdates()
    unsubscribeLiveUpdates = null
  }
  if (refreshTimer && process.client) {
    window.clearInterval(refreshTimer)
    refreshTimer = null
  }
})
</script>

<template>
  <AppPage :title="dashboardMeta.title" :subtitle="dashboardMeta.subtitle">
    <div v-if="error" class="alert alert--error">{{ error }}</div>

    <template v-if="loading">
      <div class="panel">Загрузка...</div>
    </template>

    <template v-else>
      <div v-if="dashboard" class="stats-grid stats-grid--compact">
        <StatCard label="Всего заявок" :value="dashboard.total_tickets || 0" />
        <StatCard label="Без исполнителя" :value="dashboard.unassigned_tickets || 0" />
        <StatCard label="В работе" :value="dashboard.in_progress_tickets || 0" />
        <StatCard label="Ждут закрытия" :value="dashboard.done_waiting_close_tickets || 0" />
        <StatCard v-if="auth.hasRole('auditor')" label="Открытых жалоб" :value="openComplaintCount" />
      </div>

      <div v-if="isResident" class="two-col">
        <div class="panel">
          <div class="section-title">Кратко по вашим обращениям</div>
          <div class="stack">
            <div v-for="item in residentHighlights" :key="item.label" class="list-row">
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
            </div>
          </div>
        </div>
        <div class="panel">
          <div class="section-title">Быстрые переходы</div>
          <div class="stack">
            <NuxtLink class="list-row list-row--link" to="/tickets"><span>Все мои заявки</span><strong>Открыть</strong></NuxtLink>
            <NuxtLink class="list-row list-row--link" to="/announcements"><span>Объявления дома</span><strong>Открыть</strong></NuxtLink>
            <NuxtLink class="list-row list-row--link" to="/house-info"><span>Информация по дому</span><strong>Открыть</strong></NuxtLink>
          </div>
        </div>
      </div>

      <div v-if="isExecutor" class="two-col">
        <div class="panel">
          <div class="section-title">Текущая загрузка</div>
          <div class="stack">
            <div v-for="item in executorHighlights" :key="item.label" class="list-row">
              <span>{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
            </div>
          </div>
        </div>
        <div class="panel">
          <div class="section-title">Рабочие разделы</div>
          <div class="stack">
            <NuxtLink class="list-row list-row--link" to="/tickets"><span>Все мои заявки</span><strong>Открыть</strong></NuxtLink>
            <NuxtLink class="list-row list-row--link" to="/reviews"><span>Отзывы на мои работы</span><strong>Открыть</strong></NuxtLink>
            <NuxtLink class="list-row list-row--link" to="/remarks"><span>Замечания</span><strong>Открыть</strong></NuxtLink>
            <NuxtLink class="list-row list-row--link" to="/profile"><span>Профиль и график</span><strong>Открыть</strong></NuxtLink>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="dashboard-ticket-head">
          <div class="section-title">{{ ticketsSectionTitle }}</div>
          <div v-if="canUseTicketFilters" class="dashboard-ticket-filters">
            <label class="field">
              <span>Статус</span>
              <select v-model="dashboardStatusFilter">
                <option value="">Все статусы</option>
                <option v-for="item in statusFilterOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
              </select>
            </label>
            <label class="field">
              <span>Приоритет</span>
              <select v-model="dashboardPriorityFilter">
                <option value="">Все приоритеты</option>
                <option v-for="item in priorityFilterOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
              </select>
            </label>
            <button v-if="dashboardFiltersActive" class="btn btn--ghost" type="button" @click="resetDashboardFilters">
              Сбросить
            </button>
          </div>
        </div>
        <div v-if="!visibleTickets.length" class="empty-box">{{ emptyText }}</div>
        <div v-else class="stack">
          <TicketCard
            v-for="ticket in visibleTickets"
            :key="ticket.id"
            :ticket="ticket"
            :link-to="`/tickets/${ticket.id}`"
            :has-complaint="hasComplaintFlag(ticket.id)"
            :unread="isTicketUnread(ticket.id)"
            :show-assign-button="canShowAssignButton(ticket)"
            @assign="openAssignModal"
          />
        </div>
      </div>
    </template>
  </AppPage>
  <AssignExecutorModal
    :open="Boolean(assignModalTicketId)"
    :ticket-id="assignModalTicketId"
    @close="closeAssignModal"
    @assigned="fetchData"
  />
</template>
