<script setup>
definePageMeta({ middleware: 'auth' })

import { formatAddress, formatDate, formatDateInputValue, formatRole, formatSpecialty, formatTicketStatus } from '~/utils/format'

const api = useApi()

const data = ref(null)
const houses = ref([])
const problemCategories = ref([])
const locationCategories = ref([])
const availability = ref([])
const loading = ref(true)
const error = ref('')
const selectedExecutorId = ref(null)
const selectedExecutorDetail = ref(null)
const detailLoading = ref(false)
const detailError = ref('')
const executorLoadOpen = ref(false)

const filters = reactive({
  house_id: '',
  category_id: '',
  place_category_id: '',
  target_date: formatDateInputValue(new Date())
})

const weekdayLabels = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье']

const fetchHouses = async () => {
  try {
    houses.value = await api.request('/houses/')
  } catch {
    houses.value = []
  }
}

const fetchCategories = async () => {
  try {
    const [problems, locations] = await Promise.all([
      api.request('/categories/', { query: { category_type: 'problem' } }),
      api.request('/categories/', { query: { category_type: 'location' } })
    ])
    problemCategories.value = problems
    locationCategories.value = locations
  } catch {
    problemCategories.value = []
    locationCategories.value = []
  }
}

const fetchData = async () => {
  loading.value = true
  error.value = ''
  try {
    const query = {
      house_id: filters.house_id ? Number(filters.house_id) : undefined,
      category_id: filters.category_id ? Number(filters.category_id) : undefined,
      place_category_id: filters.place_category_id ? Number(filters.place_category_id) : undefined,
      target_date: filters.target_date || undefined
    }

    const [overview, availabilityData] = await Promise.all([
      api.request('/analytics/tickets/overview', {
        query: {
          house_id: query.house_id,
          category_id: query.category_id,
          place_category_id: query.place_category_id
        }
      }),
      api.request('/executors/availability', { query })
    ])

    data.value = overview
    availability.value = availabilityData
  } catch (e) {
    error.value = e?.data?.detail || e?.message || 'Не удалось загрузить аналитику'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await Promise.all([fetchHouses(), fetchCategories()])
  await fetchData()
})

const scheduleLines = (profile) => {
  const active = (profile?.work_schedules || []).filter((item) => item.is_active)
  if (!active.length) return ['График пока не настроен']
  return active.map((item) => `${weekdayLabels[item.weekday] || 'День'} · ${String(item.work_start || '').slice(0, 5)}–${String(item.work_end || '').slice(0, 5)}`)
}

const specialtySummary = (profile) => {
  const items = (profile?.specialties || [])
    .map((item) => item?.specialty?.code || item?.specialty?.name)
    .filter(Boolean)
  if (!items.length) return 'Специализации не указаны'
  return items.map((item) => formatSpecialty(item)).join(', ')
}

const toggleExecutorDetails = async (item) => {
  const executorId = Number(item?.executor_id)
  if (!Number.isInteger(executorId) || executorId <= 0) return

  if (selectedExecutorId.value === executorId) {
    selectedExecutorId.value = null
    selectedExecutorDetail.value = null
    detailError.value = ''
    return
  }

  selectedExecutorId.value = executorId
  detailLoading.value = true
  detailError.value = ''
  try {
    selectedExecutorDetail.value = await api.request(`/executors/${executorId}/analytics`)
  } catch (e) {
    detailError.value = e?.data?.detail || e?.message || 'Не удалось загрузить детали по мастеру'
    selectedExecutorDetail.value = null
  } finally {
    detailLoading.value = false
  }
}
</script>

<template>
  <AppPage title="Аналитика" subtitle="Сводка по заявкам и загрузке исполнителей на выбранную дату.">
    <div v-if="error" class="alert alert--error">{{ error }}</div>

    <div class="panel">
      <div class="toolbar">
        <label class="field">
          <span>Дом</span>
          <select v-model="filters.house_id">
            <option value="">Все дома</option>
            <option v-for="house in houses" :key="house.id" :value="String(house.id)">{{ formatAddress(house) }}</option>
          </select>
        </label>
        <label class="field">
          <span>Дата загрузки</span>
          <input v-model="filters.target_date" type="date" />
        </label>
        <label class="field">
          <span>Вид проблемы</span>
          <select v-model="filters.category_id">
            <option value="">Все виды</option>
            <option v-for="category in problemCategories" :key="category.id" :value="String(category.id)">{{ category.name }}</option>
          </select>
        </label>
        <label class="field">
          <span>Где возникла проблема</span>
          <select v-model="filters.place_category_id">
            <option value="">Все места</option>
            <option v-for="category in locationCategories" :key="category.id" :value="String(category.id)">{{ category.name }}</option>
          </select>
        </label>
        <button class="btn btn--primary" type="button" @click="fetchData">Обновить аналитику</button>
      </div>
    </div>

    <div v-if="loading" class="panel">Загрузка...</div>

    <template v-else-if="data">
      <div class="stats-grid">
        <StatCard label="Всего заявок" :value="data.total_tickets || 0" />
        <StatCard label="Статусов" :value="data.status_buckets?.length || 0" />
        <StatCard label="Видов проблем" :value="data.category_buckets?.length || 0" />
        <StatCard label="Исполнителей в выборке" :value="availability.length || 0" />
      </div>

      <div class="two-col">
        <div class="panel">
          <div class="section-title">По статусам</div>
          <div class="stack">
            <div v-for="row in data.status_buckets || []" :key="row.status" class="list-row">
              <span>{{ formatTicketStatus(row.status) }}</span>
              <strong>{{ row.count }}</strong>
            </div>
          </div>
        </div>
        <div class="panel">
          <div class="section-title">По видам проблем</div>
          <div class="stack">
            <div v-for="row in data.category_buckets || []" :key="row.category_name" class="list-row">
              <span>{{ row.category_name }}</span>
              <strong>{{ row.count }}</strong>
            </div>
          </div>
        </div>
      </div>

      <div class="panel">
        <div class="section-title">Где возникла проблема</div>
        <div v-if="!data.location_buckets?.length" class="empty-box">Данных по местам возникновения пока нет.</div>
        <div v-else class="stack">
          <div v-for="row in data.location_buckets" :key="row.category_name" class="list-row">
            <span>{{ row.category_name }}</span>
            <strong>{{ row.count }}</strong>
          </div>
        </div>
      </div>

      <div class="panel">
        <button class="collapsible-toggle analytics-collapse-toggle" type="button" @click="executorLoadOpen = !executorLoadOpen">
          <span>
            <strong>Загрузка исполнителей</strong>
            <small>{{ executorLoadOpen ? 'Скрыть список и детали' : 'Показать список исполнителей' }}</small>
          </span>
          <span class="collapsible-toggle__icon" :class="{ 'collapsible-toggle__icon--open': executorLoadOpen }" aria-hidden="true"></span>
        </button>
        <div v-if="executorLoadOpen && !availability.length" class="empty-box analytics-collapse-body">Данных по загрузке пока нет.</div>
        <div v-else-if="executorLoadOpen" class="stack analytics-collapse-body">
          <div v-for="item in availability" :key="item.executor_id" class="availability-card">
            <div class="availability-card__head">
              <div>
                <strong>{{ item.full_name }}</strong>
                <div class="muted">{{ formatSpecialty(item.primary_specialty) }}</div>
              </div>
              <span class="pill" :class="{ 'pill--danger': item.has_day_off_today }">
                {{ item.has_day_off_today ? 'Выходной' : item.working_today ? 'Работает сейчас' : 'Не работает сейчас' }}
              </span>
            </div>
            <div class="ticket-card__meta">
              <span>Телефон: {{ item.contact_phone || '—' }}</span>
              <span v-if="item.rating !== null && item.rating !== undefined">Рейтинг: {{ Number(item.rating).toFixed(1) }} / 5 ({{ item.rating_count || 0 }})</span>
              <span>Назначено: {{ item.assigned_count }}</span>
              <span>В работе: {{ item.in_progress_count }}</span>
              <span>Активных всего: {{ item.active_total_count }}</span>
            </div>
            <div class="toolbar" style="margin-top: 12px;">
              <button class="btn btn--ghost btn--sm" type="button" @click="toggleExecutorDetails(item)">
                {{ selectedExecutorId === item.executor_id ? 'Скрыть детали' : 'Подробнее' }}
              </button>
            </div>
            <div v-if="selectedExecutorId === item.executor_id" class="availability-detail">
              <div v-if="detailLoading" class="muted">Загрузка деталей по мастеру...</div>
              <div v-else-if="detailError" class="alert alert--error">{{ detailError }}</div>
              <template v-else-if="selectedExecutorDetail">
                <div class="availability-detail__grid">
                  <div class="panel availability-detail__panel">
                    <div class="section-title">О мастере</div>
                    <div class="muted" style="margin-bottom: 10px;">{{ specialtySummary(selectedExecutorDetail.profile) }}</div>
                    <div>{{ selectedExecutorDetail.profile.notes || 'Мастер пока не добавил информацию о себе.' }}</div>
                  </div>
                  <div class="panel availability-detail__panel">
                    <div class="section-title">График</div>
                    <div class="stack">
                      <div v-for="line in scheduleLines(selectedExecutorDetail.profile)" :key="line" class="list-row">
                        <span>{{ line }}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="availability-detail__grid">
                  <div class="panel availability-detail__panel">
                    <div class="section-title">Выполненные заявки</div>
                    <div v-if="!selectedExecutorDetail.completed_tickets?.length" class="empty-box">Выполненных заявок пока нет.</div>
                    <div v-else class="stack">
                      <div v-for="ticket in selectedExecutorDetail.completed_tickets" :key="ticket.id" class="remark-card">
                        <div class="remark-card__head">
                          <div>
                            <strong>{{ ticket.title }}</strong>
                            <div class="muted">{{ formatAddress(ticket.house) }}{{ ticket.apartment ? ` · кв. ${ticket.apartment}` : '' }}</div>
                          </div>
                          <span class="pill">{{ formatTicketStatus(ticket.status) }}</span>
                        </div>
                        <div class="remark-card__meta">{{ formatDate(ticket.done_at || ticket.updated_at || ticket.created_at) }}</div>
                      </div>
                    </div>
                  </div>

                  <div class="panel availability-detail__panel">
                    <div class="section-title">Замечания</div>
                    <div class="stack">
                      <div>
                        <div class="complaint-subtitle">Активные</div>
                        <div v-if="!selectedExecutorDetail.active_remarks?.length" class="empty-box">Активных замечаний нет.</div>
                        <div v-else class="stack">
                          <div v-for="remark in selectedExecutorDetail.active_remarks" :key="`active-${remark.id}`" class="remark-card">
                            <div class="remark-card__head">
                              <div>
                                <strong>{{ remark.issuer?.full_name || '—' }}</strong>
                                <div class="muted">{{ remark.issuer?.role ? formatRole(remark.issuer.role) : '—' }}</div>
                              </div>
                              <span class="pill pill--danger">Активно</span>
                            </div>
                            <div>{{ remark.comment }}</div>
                            <div class="remark-card__meta">{{ formatDate(remark.created_at) }}</div>
                          </div>
                        </div>
                      </div>

                      <div>
                        <div class="complaint-subtitle">Неактивные</div>
                        <div v-if="!selectedExecutorDetail.archived_remarks?.length" class="empty-box">Неактивных замечаний нет.</div>
                        <div v-else class="stack">
                          <div v-for="remark in selectedExecutorDetail.archived_remarks" :key="`archived-${remark.id}`" class="remark-card">
                            <div class="remark-card__head">
                              <div>
                                <strong>{{ remark.issuer?.full_name || '—' }}</strong>
                                <div class="muted">{{ remark.issuer?.role ? formatRole(remark.issuer.role) : '—' }}</div>
                              </div>
                              <span class="pill complaint-pill--muted">Отменено</span>
                            </div>
                            <div>{{ remark.comment }}</div>
                            <div class="remark-card__meta">{{ formatDate(remark.created_at) }}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </template>
  </AppPage>
</template>
