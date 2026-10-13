<script setup>
definePageMeta({ middleware: 'auth' })

import { formatDate, formatRole, formatSpecialty } from '~/utils/format'
import { containsProfanity, PROFANITY_ERROR } from '~/utils/profanity'

const auth = useAuth()
const api = useApi()
const { showToast } = useToast()

const loading = ref(true)
const actionLoading = ref(false)
const error = ref('')
const message = ref('')
const sentRemarks = ref([])
const myRemarks = ref([])
const allRemarks = ref([])
const recipients = ref([])
const executorProfiles = ref([])
const selectedRemark = ref(null)
const pendingCancelRemark = ref(null)

const canIssueRemarks = computed(() => auth.hasRole('dispatcher', 'auditor'))
const canReceiveRemarks = computed(() => auth.hasRole('executor', 'dispatcher'))
const canViewAllRemarks = computed(() => auth.hasRole('admin', 'auditor'))

const pageSubtitle = computed(() => {
  if (auth.hasRole('executor')) {
    return 'Просмотр замечаний, вынесенных вам диспетчером или аудитором.'
  }
  if (auth.hasRole('dispatcher')) {
    return 'Замечания исполнителям и диспетчерам, а также журнал вынесенных замечаний.'
  }
  if (auth.hasRole('auditor')) {
    return 'Контроль замечаний исполнителям и диспетчерам с возможностью их отмены.'
  }
  return 'Общий журнал замечаний по исполнителям и диспетчерам.'
})

const createForm = reactive({
  executor_id: '',
  recipient_search: '',
  comment: ''
})

const executorProfileByUserId = computed(() => {
  return executorProfiles.value.reduce((acc, profile) => {
    if (profile?.user_id) acc[Number(profile.user_id)] = profile
    return acc
  }, {})
})

const executorSpecialtyText = (user) => {
  if (!user) return ''
  const profile = executorProfileByUserId.value[Number(user.id)]
  if (!profile && user.role !== 'executor') return ''
  const specialties = (profile?.specialties || [])
    .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
    .map((item) => formatSpecialty(item?.specialty?.name || item?.specialty?.code))
    .filter(Boolean)
  if (specialties.length) return specialties.join(', ')
  return user.specialty ? formatSpecialty(user.specialty) : ''
}

const recipientRoleText = (user) => {
  const specialty = executorSpecialtyText(user)
  return specialty || formatRole(user?.role)
}

const recipientOptions = computed(() => {
  return recipients.value.map((user) => {
    const roleText = recipientRoleText(user)
    return {
      id: user.id,
      label: [user.full_name, roleText ? `(${roleText})` : ''].filter(Boolean).join(' ')
    }
  })
})

const filteredRecipientOptions = computed(() => {
  const needle = createForm.recipient_search.trim().toLowerCase()
  if (!needle) return recipientOptions.value
  return recipientOptions.value.filter((item) => item.label.toLowerCase().includes(needle))
})

const remarkStatusLabel = (value) => {
  const normalized = String(value || '').toUpperCase()
  const labels = {
    ACTIVE: 'Активно',
    CANCELED: 'Отменено'
  }
  return labels[normalized] || value || '—'
}

const canCancelRemark = (remark) => {
  return String(remark?.status || '').toUpperCase() === 'ACTIVE'
    && canIssueRemarks.value
    && Number(remark?.issuer_id) === Number(auth.user.value?.id)
}

const isRemarkCanceled = (remark) => String(remark?.status || '').toUpperCase() === 'CANCELED'

const openRemarkDetails = (remark) => {
  selectedRemark.value = remark
}

const closeRemarkDetails = () => {
  selectedRemark.value = null
}

const requestCancelRemark = (remark) => {
  pendingCancelRemark.value = remark
}

const closeCancelRemarkConfirmation = () => {
  if (actionLoading.value) return
  pendingCancelRemark.value = null
}

const cancelRemarkQuestion = computed(() => {
  const remark = pendingCancelRemark.value
  if (!remark) return ''
  const recipient = remark.executor?.full_name || 'получателя'
  return `Вы действительно хотите отменить замечание для ${recipient}? Оно будет архивировано и останется в истории.`
})

const loadRecipients = async () => {
  if (!canIssueRemarks.value) {
    recipients.value = []
    executorProfiles.value = []
    return
  }

  const executorQuery = {
    active_only: true,
    ...(auth.hasRole('dispatcher') && auth.user.value?.house_id ? { house_id: auth.user.value.house_id } : {})
  }
  executorProfiles.value = await api.request('/executors/', { query: executorQuery })

  if (auth.hasRole('auditor')) {
    const users = await api.request('/users/', { query: { skip: 0, limit: 500 } })
    recipients.value = users.filter((user) => ['executor', 'dispatcher'].includes(user.role))
  } else {
    recipients.value = executorProfiles.value.map((profile) => profile.user).filter(Boolean)
  }

  if (!createForm.executor_id && recipients.value.length) {
    createForm.executor_id = String(recipients.value[0].id)
  }
}

const fetchRemarks = async () => {
  loading.value = true
  error.value = ''
  try {
    await loadRecipients()

    const tasks = []

    if (canIssueRemarks.value) {
      tasks.push(api.request('/remarks/sent', { query: { skip: 0, limit: 200 } }).then((data) => { sentRemarks.value = data }))
    } else {
      sentRemarks.value = []
    }

    if (canReceiveRemarks.value) {
      tasks.push(api.request('/remarks/my', { query: { skip: 0, limit: 200 } }).then((data) => { myRemarks.value = data }))
    } else {
      myRemarks.value = []
    }

    if (canViewAllRemarks.value) {
      tasks.push(api.request('/remarks/all', { query: { skip: 0, limit: 200 } }).then((data) => { allRemarks.value = data }))
    } else {
      allRemarks.value = []
    }

    await Promise.all(tasks)
  } catch (e) {
    error.value = e?.data?.detail || e?.message || 'Не удалось загрузить замечания'
  } finally {
    loading.value = false
  }
}

const createRemark = async () => {
  if (!createForm.executor_id || !createForm.comment.trim()) {
    error.value = 'Выберите получателя и заполните текст замечания'
    return
  }
  if (containsProfanity(createForm.comment)) {
    error.value = PROFANITY_ERROR
    showToast(PROFANITY_ERROR, { type: 'error' })
    return
  }

  actionLoading.value = true
  error.value = ''
  message.value = ''
  try {
    await api.request('/remarks/', {
      method: 'POST',
      body: {
        executor_id: Number(createForm.executor_id),
        comment: createForm.comment.trim()
      }
    })
    createForm.comment = ''
    showToast('Замечание отправлено')
    await fetchRemarks()
  } catch (e) {
    error.value = e?.data?.detail || e?.message || 'Не удалось отправить замечание'
  } finally {
    actionLoading.value = false
  }
}

const cancelRemark = async (remarkId) => {
  actionLoading.value = true
  error.value = ''
  message.value = ''
  try {
    await api.request(`/remarks/${remarkId}/cancel`, { method: 'POST' })
    showToast('Замечание отменено')
    await fetchRemarks()
    return true
  } catch (e) {
    error.value = e?.data?.detail || e?.message || 'Не удалось отменить замечание'
    return false
  } finally {
    actionLoading.value = false
  }
}

const confirmCancelRemark = async () => {
  const remark = pendingCancelRemark.value
  if (!remark) return
  const canceled = await cancelRemark(remark.id)
  if (!canceled) return
  if (selectedRemark.value?.id === remark.id) {
    closeRemarkDetails()
  }
  pendingCancelRemark.value = null
}

onMounted(fetchRemarks)
</script>

<template>
  <AppPage title="Замечания" :subtitle="pageSubtitle">
    <div v-if="error" class="alert alert--error">{{ error }}</div>
    <div v-if="canIssueRemarks" class="panel">
      <div class="section-title">Новое замечание</div>
      <div class="form-grid">
        <label class="field">
          <span>{{ auth.hasRole('auditor') ? 'Исполнитель или диспетчер' : 'Исполнитель' }}</span>
          <input v-model="createForm.recipient_search" type="text" placeholder="Начните вводить имя или специализацию" />
          <select v-model="createForm.executor_id">
            <option value="">Выберите получателя</option>
            <option v-for="item in filteredRecipientOptions" :key="item.id" :value="String(item.id)">{{ item.label }}</option>
          </select>
        </label>
        <label class="field field--span-2">
          <span>Комментарий</span>
          <textarea v-model="createForm.comment" placeholder="Опишите суть замечания" />
        </label>
      </div>
      <button class="btn btn--primary" type="button" :disabled="actionLoading" @click="createRemark">
        {{ actionLoading ? 'Отправляем...' : 'Отправить замечание' }}
      </button>
    </div>

    <div v-if="loading" class="panel">Загрузка...</div>

    <template v-else>
      <div v-if="canReceiveRemarks" class="panel">
        <div class="section-title">Полученные замечания</div>
        <div v-if="!myRemarks.length" class="empty-box">Полученных замечаний пока нет.</div>
        <div v-else class="stack">
          <div v-for="remark in myRemarks" :key="`my-${remark.id}`" class="remark-card remark-card--clickable" role="button" tabindex="0" @click="openRemarkDetails(remark)" @keydown.enter="openRemarkDetails(remark)" @keydown.space.prevent="openRemarkDetails(remark)">
            <div class="remark-card__head">
              <div>
                <strong>{{ remark.issuer?.full_name || '—' }}</strong>
                <div class="muted">{{ formatRole(remark.issuer?.role) }}</div>
              </div>
              <span class="pill" :class="{ 'pill--danger': isRemarkCanceled(remark) }">{{ remarkStatusLabel(remark.status) }}</span>
            </div>
            <div>{{ remark.comment }}</div>
            <div class="remark-card__meta">{{ formatDate(remark.created_at) }}</div>
          </div>
        </div>
      </div>

      <div v-if="canIssueRemarks" class="panel">
        <div class="section-title">Выданные замечания</div>
        <div v-if="!sentRemarks.length" class="empty-box">Вы ещё не выносили замечаний.</div>
        <div v-else class="stack">
          <div v-for="remark in sentRemarks" :key="`sent-${remark.id}`" class="remark-card remark-card--clickable" role="button" tabindex="0" @click="openRemarkDetails(remark)" @keydown.enter="openRemarkDetails(remark)" @keydown.space.prevent="openRemarkDetails(remark)">
            <div class="remark-card__head">
              <div>
                <strong>{{ remark.executor?.full_name || '—' }}</strong>
                <div class="muted">{{ recipientRoleText(remark.executor) }}</div>
              </div>
              <span class="pill" :class="{ 'pill--danger': isRemarkCanceled(remark) }">{{ remarkStatusLabel(remark.status) }}</span>
            </div>
            <div>{{ remark.comment }}</div>
            <div class="remark-card__meta">
              <span>{{ formatDate(remark.created_at) }}</span>
              <button
                v-if="canCancelRemark(remark)"
                class="btn btn--ghost btn--sm"
                type="button"
                @click.stop="requestCancelRemark(remark)"
              >
                Отменить
              </button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="canViewAllRemarks" class="panel">
        <div class="section-title">Все замечания</div>
        <div v-if="!allRemarks.length" class="empty-box">Замечаний пока нет.</div>
        <div v-else class="stack">
          <div v-for="remark in allRemarks" :key="`all-${remark.id}`" class="remark-card remark-card--clickable" role="button" tabindex="0" @click="openRemarkDetails(remark)" @keydown.enter="openRemarkDetails(remark)" @keydown.space.prevent="openRemarkDetails(remark)">
            <div class="remark-card__head">
              <div>
                <strong>{{ remark.executor?.full_name || '—' }}</strong>
                <div class="muted">{{ recipientRoleText(remark.executor) }} · От {{ remark.issuer?.full_name || '—' }} · {{ formatRole(remark.issuer?.role) }}</div>
              </div>
              <span class="pill" :class="{ 'pill--danger': isRemarkCanceled(remark) }">{{ remarkStatusLabel(remark.status) }}</span>
            </div>
            <div>{{ remark.comment }}</div>
            <div class="remark-card__meta">{{ formatDate(remark.created_at) }}</div>
          </div>
        </div>
      </div>
    </template>
  </AppPage>

  <div v-if="selectedRemark" class="modal-backdrop" @click.self="closeRemarkDetails">
    <div class="modal remark-detail-modal">
      <div class="modal__head">
        <div>
          <div class="eyebrow">Замечание #{{ selectedRemark.id }}</div>
          <h3>Подробности замечания</h3>
        </div>
        <button class="icon-btn ticket-detail-close" type="button" aria-label="Закрыть" @click="closeRemarkDetails">×</button>
      </div>

      <div class="ticket-detail-info-grid">
        <div class="ticket-detail-info-item">
          <span>Статус</span>
          <strong>{{ remarkStatusLabel(selectedRemark.status) }}</strong>
        </div>
        <div class="ticket-detail-info-item">
          <span>Кому</span>
          <strong>{{ selectedRemark.executor?.full_name || '—' }}</strong>
          <small v-if="recipientRoleText(selectedRemark.executor)">{{ recipientRoleText(selectedRemark.executor) }}</small>
        </div>
        <div class="ticket-detail-info-item">
          <span>Кто вынес</span>
          <strong>{{ selectedRemark.issuer?.full_name || '—' }}</strong>
        </div>
        <div class="ticket-detail-info-item">
          <span>Дата</span>
          <strong>{{ formatDate(selectedRemark.created_at) }}</strong>
        </div>
      </div>

      <div class="modal__section">
        <div class="section-title">Текст замечания</div>
        <div class="ticket-detail-text">{{ selectedRemark.comment }}</div>
      </div>

      <div v-if="selectedRemark.canceled_at" class="muted-box">
        Архивировано: {{ formatDate(selectedRemark.canceled_at) }}
        <span v-if="selectedRemark.canceled_by?.full_name"> · {{ selectedRemark.canceled_by.full_name }}</span>
      </div>

      <div class="toolbar">
        <button
          v-if="canCancelRemark(selectedRemark)"
          class="btn btn--danger"
          type="button"
          :disabled="actionLoading"
          @click="requestCancelRemark(selectedRemark)"
        >
          {{ actionLoading ? 'Архивируем...' : 'Отменить замечание' }}
        </button>
      </div>
    </div>
  </div>

  <ConfirmDialog
    :open="Boolean(pendingCancelRemark)"
    title="Отменить замечание"
    :message="cancelRemarkQuestion"
    confirm-label="Да, отменить"
    tone="danger"
    :busy="actionLoading"
    @close="closeCancelRemarkConfirmation"
    @confirm="confirmCancelRemark"
  />
</template>
