<script setup>
import { getApiErrorMessage } from '~/composables/useApi'
import { formatAddress, formatSpecialty } from '~/utils/format'

const props = defineProps({
  open: { type: Boolean, default: false },
  ticketId: { type: Number, default: null },
  title: { type: String, default: 'Назначить исполнителя' }
})

const emit = defineEmits(['close', 'assigned'])

const api = useApi()
const { showToast } = useToast()

const loading = ref(false)
const submitting = ref(false)
const error = ref('')
const recommendations = ref([])
const onlyAvailable = ref(true)
const pendingAssignment = ref(null)
const expandedExecutorId = ref(null)
const detailsLoadingId = ref(null)
const executorDetails = reactive({})

const weekdayLabels = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

const visibleRecommendations = computed(() => {
  if (!onlyAvailable.value) return recommendations.value
  return recommendations.value.filter((item) => item.can_assign)
})

const visibleReasons = (item) => (item?.reasons || [])
  .filter((reason) => String(reason || '').trim().toLowerCase() !== 'подходит по категории заявки')

const assignConfirmationMessage = computed(() => {
  if (!pendingAssignment.value) return ''
  return `Вы действительно хотите назначить исполнителя ${pendingAssignment.value.full_name} (${formatSpecialty(pendingAssignment.value.primary_specialty)}) на заявку?`
})

const loadRecommendations = async () => {
  if (!props.open || !props.ticketId) return
  loading.value = true
  error.value = ''
  pendingAssignment.value = null
  try {
    recommendations.value = await api.request('/executor-recommendations/by-ticket', {
      query: { ticket_id: props.ticketId, top: 50 }
    })
  } catch (requestError) {
    error.value = getApiErrorMessage(requestError, 'Не удалось загрузить список исполнителей')
    recommendations.value = []
  } finally {
    loading.value = false
  }
}

const requestAssignExecutor = (item) => {
  pendingAssignment.value = item
}

const closeConfirmation = () => {
  pendingAssignment.value = null
}

const executorDetailFor = (executorId) => executorDetails[executorId] || null

const recommendationHouseLabel = (item) => item?.house_id ? 'Закреплён за домом' : 'Любой дом'

const executorHouseLabel = (profile) => {
  if (!profile?.house_id) return 'Без привязки, может работать по любому дому'
  return profile.house ? formatAddress(profile.house) : `Дом #${profile.house_id}`
}

const formatScheduleSummary = (profile) => {
  const active = (profile?.work_schedules || []).filter((item) => item.is_active)
  if (!active.length) return ['График пока не настроен']
  return active.map((item) => `${weekdayLabels[item.weekday] || 'День'} · ${String(item.work_start || '').slice(0, 5)}–${String(item.work_end || '').slice(0, 5)}`)
}

const formatSpecialtiesSummary = (profile) => {
  const items = (profile?.specialties || [])
    .map((item) => item?.specialty?.code || item?.specialty?.name)
    .filter(Boolean)
  if (!items.length) return 'Специализации не указаны'
  return items.map((item) => formatSpecialty(item)).join(', ')
}

const showExecutorInfo = async (item) => {
  const executorId = Number(item?.executor_id)
  if (!Number.isInteger(executorId) || executorId <= 0) return

  expandedExecutorId.value = executorId
  if (executorDetails[executorId]) return

  detailsLoadingId.value = executorId
  try {
    executorDetails[executorId] = await api.request(`/executors/${executorId}`)
  } catch (requestError) {
    showToast(getApiErrorMessage(requestError, 'Не удалось загрузить информацию о мастере'), { type: 'error' })
    expandedExecutorId.value = null
  } finally {
    detailsLoadingId.value = null
  }
}

const hideExecutorInfo = () => {
  expandedExecutorId.value = null
}

const toggleExecutorInfo = async (item) => {
  if (expandedExecutorId.value === Number(item?.executor_id)) {
    hideExecutorInfo()
    return
  }
  await showExecutorInfo(item)
}

const confirmAssignExecutor = async () => {
  const item = pendingAssignment.value
  if (!props.ticketId || !item) return

  submitting.value = true
  error.value = ''
  try {
    await api.request(`/tickets/${props.ticketId}/assign`, {
      method: 'PATCH',
      body: {
        executor_id: item.user_id,
        executor_profile_id: item.executor_id
      }
    })
    showToast(`Исполнитель «${item.full_name}» назначен`)
    emit('assigned')
    emit('close')
  } catch (requestError) {
    error.value = getApiErrorMessage(requestError, 'Не удалось назначить исполнителя')
  } finally {
    submitting.value = false
    pendingAssignment.value = null
  }
}

watch(() => [props.open, props.ticketId], loadRecommendations, { immediate: true })
</script>

<template>
  <div v-if="open" class="modal-backdrop" @click.self="emit('close')">
    <div class="modal assign-modal">
      <div class="modal__head">
        <div>
          <div class="eyebrow">Заявка #{{ ticketId }}</div>
          <h3>{{ title }}</h3>
        </div>
        <button class="icon-btn ticket-detail-close" type="button" aria-label="Закрыть" @click="emit('close')">×</button>
      </div>

      <label class="assign-filter">
        <input v-model="onlyAvailable" type="checkbox" />
        <span>Отображать только доступных исполнителей</span>
      </label>

      <div v-if="error" class="alert alert--error">{{ error }}</div>
      <div v-if="loading" class="panel narrow">Загрузка...</div>
      <div v-else-if="!visibleRecommendations.length" class="empty-box">Подходящие исполнители не найдены.</div>
      <div v-else class="ticket-recommendations">
        <div
          v-for="item in visibleRecommendations"
          :key="`${item.executor_id}-${item.user_id}`"
          class="ticket-recommendation-card"
          :class="{ 'ticket-recommendation-card--disabled': !item.can_assign }"
          @mouseleave="hideExecutorInfo"
        >
          <div class="ticket-recommendation-card__head">
            <div class="ticket-recommendation-card__identity">
              <strong>{{ item.full_name }}</strong>
              <div class="muted">{{ formatSpecialty(item.primary_specialty) }}</div>
              <div v-if="item.rating !== null && item.rating !== undefined" class="executor-rating-line">
                <span class="executor-rating-star">★</span>
                <span>{{ Number(item.rating).toFixed(1) }} / 5</span>
                <span class="muted">оценок: {{ item.rating_count || 0 }}</span>
              </div>
              <div v-if="item.contact_phone" class="muted">{{ item.contact_phone }}</div>
              <div class="ticket-recommendation-card__tags">
                <span class="pill pill--soft">{{ recommendationHouseLabel(item) }}</span>
              </div>
            </div>
            <div class="ticket-recommendation-card__meta">
              <span class="pill pill--soft">
                {{ item.can_assign ? 'Доступен сейчас' : 'Недоступен сейчас' }}
              </span>
              <button
                class="ticket-recommendation-info-btn"
                type="button"
                title="О мастере"
                aria-label="Показать информацию о мастере"
                @mouseenter="showExecutorInfo(item)"
                @focus="showExecutorInfo(item)"
                @blur="hideExecutorInfo"
                @click.stop="toggleExecutorInfo(item)"
              >
                i
              </button>
            </div>
          </div>

          <div class="ticket-recommendation-stats ticket-recommendation-stats--grid">
            <div class="ticket-recommendation-stat">
              <span>Активных</span>
              <strong>{{ item.active_total_count }}</strong>
            </div>
            <div class="ticket-recommendation-stat">
              <span>В работе</span>
              <strong>{{ item.in_progress_count }}</strong>
            </div>
            <div class="ticket-recommendation-stat">
              <span>Назначено</span>
              <strong>{{ item.assigned_count }}</strong>
            </div>
          </div>

          <div v-if="visibleReasons(item).length" class="ticket-recommendation-reasons">
            <span v-for="reason in visibleReasons(item)" :key="reason" class="pill pill--soft">{{ reason }}</span>
          </div>

          <div
            v-if="expandedExecutorId === item.executor_id"
            class="ticket-recommendation-detail ticket-recommendation-popover"
          >
            <div v-if="detailsLoadingId === item.executor_id" class="muted">Загружаем информацию о мастере...</div>
            <template v-else-if="executorDetailFor(item.executor_id)">
              <div class="ticket-recommendation-detail__section">
                <div class="ticket-recommendation-detail__label">Информация о мастере</div>
                <div>{{ executorDetailFor(item.executor_id).notes || 'Мастер пока не добавил информацию о себе.' }}</div>
              </div>
              <div class="ticket-recommendation-detail__section">
                <div class="ticket-recommendation-detail__label">Специализации</div>
                <div>{{ formatSpecialtiesSummary(executorDetailFor(item.executor_id)) }}</div>
              </div>
              <div class="ticket-recommendation-detail__section">
                <div class="ticket-recommendation-detail__label">Привязка к дому</div>
                <div>{{ executorHouseLabel(executorDetailFor(item.executor_id)) }}</div>
              </div>
              <div class="ticket-recommendation-detail__section">
                <div class="ticket-recommendation-detail__label">Рабочий график</div>
                <div class="ticket-recommendation-detail__chips">
                  <span v-for="line in formatScheduleSummary(executorDetailFor(item.executor_id))" :key="line" class="pill pill--soft">{{ line }}</span>
                </div>
              </div>
            </template>
          </div>

          <button
            class="btn btn--primary"
            type="button"
            :disabled="submitting || !item.can_assign"
            @click="requestAssignExecutor(item)"
          >
            {{ item.can_assign ? 'Назначить' : 'Недоступен сейчас' }}
          </button>
        </div>
      </div>
    </div>
  </div>

  <ConfirmDialog
    :open="Boolean(pendingAssignment)"
    title="Назначить исполнителя"
    :message="assignConfirmationMessage"
    confirm-label="Да, назначить"
    :show-close="false"
    :busy="submitting"
    @close="closeConfirmation"
    @confirm="confirmAssignExecutor"
  />
</template>
