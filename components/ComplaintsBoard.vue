<script setup>
import { formatDate, formatRole, isComplaintCanceledByResident } from '~/utils/format'
import { containsProfanity, PROFANITY_ERROR } from '~/utils/profanity'

const props = defineProps({
  title: { type: String, default: 'Жалобы' },
  subtitle: { type: String, default: 'Работа с жалобами жильцов.' }
})

const api = useApi()
const auth = useAuth()
const config = useRuntimeConfig()
const liveUpdates = useLiveUpdates()
const route = useRoute()
const { showToast } = useToast()
const canSeeEscalations = computed(() => auth.hasRole('admin', 'auditor'))
const canUseStaffOnlyMessages = computed(() => auth.hasRole('admin', 'dispatcher', 'auditor'))

const complaints = ref([])
const selectedId = ref(null)
const selectedComplaint = ref(null)
const loading = ref(true)
const detailLoading = ref(false)
const actionLoading = ref(false)

const status = ref('')
const type = ref('')
const resolveComment = ref('')
const staffResolutionComment = ref('')
const commentDraft = ref('')
const commentVisibility = ref('public')
const error = ref('')
const message = ref('')
const selectedPreviewUrl = ref('')
const confirmDismissOpen = ref(false)
const confirmResolveOpen = ref(false)
const pendingResolveStatus = ref('')
const unreadNotifications = ref([])
const unreadComplaintNotifications = ref([])
let listRequestId = 0
let detailRequestId = 0
const initialComplaintId = computed(() => {
  const value = Number(route.query.complaint)
  return Number.isInteger(value) && value > 0 ? value : null
})

const staticBase = computed(() => String(config.public.apiBase || '').replace(/\/api\/v1\/?$/, ''))
const complaintStats = computed(() => {
  return complaints.value.reduce((acc, item) => {
    acc.total += 1
    if (item.status === 'OPEN') acc.open += 1
    if (item.status === 'RESOLVED') acc.resolved += 1
    if (item.status === 'DISMISSED') acc.dismissed += 1
    return acc
  }, { total: 0, open: 0, resolved: 0, dismissed: 0 })
})
const unreadComplaintCount = computed(() => unreadComplaintNotifications.value.length)

const typeLabel = (value) => {
  const labels = {
    QUALITY: 'Жалоба на качество',
    OVERDUE: 'Жалоба на отсутствие реакции',
    DISPATCHER_INACTION: 'Жалоба в контролирующий орган'
  }
  return labels[value] || value || '—'
}

const statusLabel = (value, complaint = null) => {
  if (isComplaintCanceledByResident(complaint)) return 'Отменена'
  const labels = {
    OPEN: 'Открыта',
    RESOLVED: 'Принята',
    DISMISSED: 'Отклонена'
  }
  return labels[value] || value || '—'
}

const complaintTypeClass = (value) => {
  if (value === 'DISPATCHER_INACTION') return 'pill pill--danger'
  return 'pill'
}

const statusClass = (value) => {
  if (value === 'OPEN') return 'pill pill--danger'
  if (value === 'RESOLVED') return 'pill complaint-pill--success'
  if (value === 'DISMISSED') return 'pill complaint-pill--muted'
  return 'pill'
}

const canResolve = computed(() => {
  if (!selectedComplaint.value || selectedComplaint.value.status !== 'OPEN') return false
  return auth.hasRole('admin', 'dispatcher', 'auditor')
})

const canCommentOnSelected = computed(() => {
  if (!selectedComplaint.value || selectedComplaint.value.status !== 'OPEN') return false
  if (auth.hasRole('admin', 'dispatcher', 'auditor')) return true
  return auth.hasRole('resident') && selectedComplaint.value.author_id === auth.user.value?.id
})

const resolveConfirmationMessage = computed(() => {
  if (isEscalatedComplaint.value) {
    return 'После принятия обращения предыдущая жалоба, на основании которой житель обратился в контролирующий орган, будет возвращена на повторное рассмотрение.'
  }
  if (selectedComplaint.value?.complaint_type === 'OVERDUE') {
    return 'После принятия жалобы заявка будет возвращена диспетчеру для реакции. Если исполнитель уже был назначен, назначение будет снято.'
  }
  return 'После принятия жалобы заявка будет отправлена на повторную обработку.'
})

const fileUrl = (path) => {
  if (!path) return '#'
  if (/^https?:\/\//i.test(path)) return path
  return `${staticBase.value}${path}`
}

const openPreview = (path) => {
  selectedPreviewUrl.value = fileUrl(path)
}

const closePreview = () => {
  selectedPreviewUrl.value = ''
}

const complaintPreview = (item) => {
  const text = String(item?.description || '').trim()
  if (!text) return 'Без описания'
  return text.length > 96 ? `${text.slice(0, 96)}...` : text
}

const loadUnreadComplaintNotifications = async () => {
  try {
    const notifications = await api.request('/notifications/', {
      query: { unread_only: true, skip: 0, limit: 200 }
    })
    unreadNotifications.value = Array.isArray(notifications) ? notifications : []
    unreadComplaintNotifications.value = unreadNotifications.value
      .filter((item) => Number(item?.complaint_id) > 0)
  } catch {
    unreadNotifications.value = []
    unreadComplaintNotifications.value = []
  }
}

const isComplaintUnread = (complaintId) => {
  const normalizedId = Number(complaintId)
  return unreadComplaintNotifications.value.some((item) => Number(item?.complaint_id) === normalizedId)
}

const markComplaintNotificationsRead = async (complaintId) => {
  const normalizedId = Number(complaintId)
  const targets = unreadComplaintNotifications.value.filter((item) => Number(item?.complaint_id) === normalizedId)
  if (!targets.length) return
  await Promise.allSettled(targets.map((item) => api.request(`/notifications/${item.id}/read`, { method: 'PATCH' })))
  await loadUnreadComplaintNotifications()
  if (process.client) {
    window.dispatchEvent(new CustomEvent('uk-notifications-updated'))
  }
}

const complaintMessagePrefix = 'Сообщение по обращению в контролирующий орган:'
const residentMessagePrefix = 'Сообщение жителю:'
const complaintAcceptedPrefix = 'Контролирующий орган принял обращение.'
const complaintDecisionPrefix = 'Контролирующий орган принял решение'
const complaintInstructionPrefix = 'Предписание контролирующего органа:'

const setCommentVisibility = (value) => {
  commentVisibility.value = value === 'staff' ? 'staff' : 'public'
}

const getCommentMessageMeta = (message) => {
  const text = String(message || '').trim()
  if (text.startsWith(complaintInstructionPrefix)) {
    return {
      label: 'Предписание контролирующего органа',
      tone: 'teal'
    }
  }
  if (text.startsWith(residentMessagePrefix)) {
    return {
      label: 'Сообщение жителю',
      tone: 'resident'
    }
  }
  if (text.startsWith(complaintAcceptedPrefix) || text.startsWith(complaintDecisionPrefix)) {
    return {
      label: 'Контролирующий орган принял обращение',
      tone: 'indigo'
    }
  }
  if (text.startsWith(complaintMessagePrefix)) {
    return {
      label: 'Сообщение по обращению в контролирующий орган',
      tone: 'muted'
    }
  }
  return { label: '', tone: '' }
}

const getCommentMessageBody = (message) => {
  const text = String(message || '').trim()
  let body = text
  if (text.startsWith(complaintInstructionPrefix)) body = text.slice(complaintInstructionPrefix.length).trim()
  else if (text.startsWith(residentMessagePrefix)) body = text.slice(residentMessagePrefix.length).trim()
  else if (text.startsWith(complaintAcceptedPrefix)) body = text.slice(complaintAcceptedPrefix.length).trim()
  else if (text.startsWith(complaintDecisionPrefix)) body = text.slice(complaintDecisionPrefix.length).trim()
  else if (text.startsWith(complaintMessagePrefix)) body = text.slice(complaintMessagePrefix.length).trim()

  const inlineResidentIndex = body.indexOf(residentMessagePrefix)
  if (inlineResidentIndex >= 0) {
    return body.slice(0, inlineResidentIndex).trim()
  }
  return body
}

const getInlineResidentMessage = (message) => {
  const text = String(message || '').trim()
  const inlineResidentIndex = text.indexOf(residentMessagePrefix)
  if (inlineResidentIndex <= 0) return ''
  return text.slice(inlineResidentIndex + residentMessagePrefix.length).trim()
}

const canViewInlineResidentMessage = computed(() => auth.hasRole('resident', 'admin', 'auditor'))

const commentCardClasses = (comment) => ({
  'comment-card--staff': comment.author_role && comment.author_role !== 'resident',
  'comment-card--dispatcher': comment.author_role === 'dispatcher' || comment.author_role === 'admin',
  'comment-card--auditor': comment.author_role === 'auditor'
})

const resolutionSummary = computed(() => {
  if (!selectedComplaint.value?.resolution_comment && !selectedComplaint.value?.resolver_name) return ''
  const who = selectedComplaint.value?.resolver_name || 'Сотрудник не указан'
  const role = selectedComplaint.value?.resolver_role ? ` · ${formatRole(selectedComplaint.value.resolver_role)}` : ''
  const when = selectedComplaint.value?.resolved_at ? ` · ${formatDate(selectedComplaint.value.resolved_at)}` : ''
  return `${who}${role}${when}`
})

const isEscalatedComplaint = computed(() => selectedComplaint.value?.complaint_type === 'DISPATCHER_INACTION')

const fetchComplaints = async ({ silent = false, syncSelection = true, resetDrafts = true } = {}) => {
  const requestId = ++listRequestId
  const shouldShowLoader = !silent && !complaints.value.length
  if (shouldShowLoader) {
    loading.value = true
  }
  if (!silent) {
    error.value = ''
  }
  try {
    const payload = await api.request('/ticket-complaints/', {
      query: {
        status: status.value || undefined,
        complaint_type: type.value || undefined,
        skip: 0,
        limit: 200
      }
    })
    if (requestId !== listRequestId) return
    complaints.value = Array.isArray(payload) ? payload : []

    if (!complaints.value.length) {
      selectedId.value = null
      selectedComplaint.value = null
      return
    }

    if (syncSelection) {
      const preferredId = complaints.value.some((item) => item.id === selectedId.value)
        ? selectedId.value
        : initialComplaintId.value
      const nextId = complaints.value.some((item) => item.id === preferredId) ? preferredId : complaints.value[0].id
      const isSameSelection = Number(selectedId.value) === Number(nextId)
      await selectComplaint(nextId, {
        silent,
        resetDrafts: isSameSelection ? resetDrafts : true
      })
    }
  } catch (e) {
    error.value = e?.data?.detail || e?.message || 'Не удалось загрузить обращения'
  } finally {
    if (requestId === listRequestId && shouldShowLoader) {
      loading.value = false
    }
  }
}

const refreshBoard = () => fetchComplaints({ syncSelection: true, resetDrafts: false })
const silentRefreshBoard = () => fetchComplaints({ silent: true, syncSelection: true, resetDrafts: false })

const selectComplaint = async (complaintId, { silent = false, resetDrafts = true, markRead = false } = {}) => {
  const normalizedId = Number(complaintId)
  if (!Number.isInteger(normalizedId) || normalizedId <= 0) return

  const requestId = ++detailRequestId
  const shouldShowLoader = !silent && (!selectedComplaint.value || Number(selectedComplaint.value.id) !== normalizedId)

  selectedId.value = normalizedId
  if (shouldShowLoader) {
    detailLoading.value = true
  }
  if (!silent) {
    error.value = ''
  }
  try {
    const complaint = await api.request(`/ticket-complaints/${normalizedId}`)
    if (requestId !== detailRequestId) return
    selectedComplaint.value = complaint
    if (markRead) {
      await markComplaintNotificationsRead(normalizedId)
    }
    if (resetDrafts) {
      resolveComment.value = selectedComplaint.value?.status === 'DISMISSED'
        ? (selectedComplaint.value?.resolution_comment || '')
        : ''
      staffResolutionComment.value = ''
      commentDraft.value = ''
      commentVisibility.value = 'public'
    }
  } catch (e) {
    error.value = e?.data?.detail || e?.message || 'Не удалось открыть обращение'
  } finally {
    if (requestId === detailRequestId && shouldShowLoader) {
      detailLoading.value = false
    }
  }
}

const resolveComplaint = async (nextStatus) => {
  if (!selectedComplaint.value) return
  if (nextStatus === 'DISMISSED' && !resolveComment.value.trim()) {
    error.value = ''
    showToast('Укажите причину отклонения жалобы', { type: 'error' })
    return
  }
  if (containsProfanity(resolveComment.value, staffResolutionComment.value)) {
    error.value = PROFANITY_ERROR
    showToast(PROFANITY_ERROR, { type: 'error' })
    return
  }
  if (nextStatus === 'DISMISSED') {
    confirmDismissOpen.value = false
  }
  if (nextStatus === 'RESOLVED') {
    confirmResolveOpen.value = false
  }

  actionLoading.value = true
  error.value = ''
  message.value = ''
  try {
    await api.request(`/ticket-complaints/${selectedComplaint.value.id}/resolve`, {
      method: 'PATCH',
      body: {
        status: nextStatus,
        resident_resolution_comment: resolveComment.value.trim() || null,
        resolution_comment: resolveComment.value.trim() || null,
        staff_comment: staffResolutionComment.value.trim() || null
      }
    })
    message.value = ''
    showToast('Решение по обращению сохранено')
    await fetchComplaints({ silent: true, syncSelection: true, resetDrafts: false })
  } catch (e) {
    error.value = e?.data?.detail || e?.message || 'Не удалось изменить статус обращения'
  } finally {
    actionLoading.value = false
  }
}

const requestResolveComplaint = () => {
  if (!selectedComplaint.value) return
  pendingResolveStatus.value = 'RESOLVED'
  confirmResolveOpen.value = true
}

const closeResolveConfirmation = () => {
  confirmResolveOpen.value = false
  pendingResolveStatus.value = ''
}

const confirmResolveComplaint = () => {
  resolveComplaint(pendingResolveStatus.value || 'RESOLVED')
}

const requestDismissComplaint = () => {
  if (!selectedComplaint.value) return
  if (!resolveComment.value.trim()) {
    error.value = ''
    showToast('Укажите причину отклонения жалобы', { type: 'error' })
    return
  }
  confirmDismissOpen.value = true
}

const closeDismissConfirmation = () => {
  confirmDismissOpen.value = false
}

const sendComment = async () => {
  if (!selectedComplaint.value || !commentDraft.value.trim()) return
  if (!canCommentOnSelected.value) return
  if (containsProfanity(commentDraft.value)) {
    error.value = PROFANITY_ERROR
    showToast(PROFANITY_ERROR, { type: 'error' })
    return
  }
  actionLoading.value = true
  error.value = ''
  message.value = ''
  try {
    await api.request(`/ticket-complaints/${selectedComplaint.value.id}/comments`, {
      method: 'POST',
      body: {
        message: commentDraft.value.trim(),
        visibility: canUseStaffOnlyMessages.value ? commentVisibility.value : 'public'
      }
    })
    commentDraft.value = ''
    message.value = ''
    showToast('Сообщение отправлено')
    await selectComplaint(selectedComplaint.value.id, { silent: true, resetDrafts: false })
  } catch (e) {
    error.value = e?.data?.detail || e?.message || 'Не удалось отправить сообщение'
  } finally {
    actionLoading.value = false
  }
}

let unsubscribeLiveUpdates = null
let refreshTimer = null

onMounted(() => {
  fetchComplaints()
  loadUnreadComplaintNotifications()
  unsubscribeLiveUpdates = liveUpdates.subscribe((payload) => {
    if (!payload || payload.entity !== 'complaint') return
    loadUnreadComplaintNotifications()
    silentRefreshBoard()
  })
  if (process.client) {
    refreshTimer = window.setInterval(() => {
      loadUnreadComplaintNotifications()
      silentRefreshBoard()
    }, 3000)
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

watch([status, type], () => {
  fetchComplaints({ syncSelection: true, resetDrafts: true })
})
watch(initialComplaintId, (value) => {
  if (value && complaints.value.some((item) => item.id === value)) {
    selectComplaint(value, { silent: true, resetDrafts: true })
  }
})
</script>

<template>
  <AppPage :title="title" :subtitle="subtitle">
    <div v-if="error" class="alert alert--error">{{ error }}</div>

    <div class="panel complaint-toolbar-panel">
      <div class="toolbar">
        <label class="field">
          <span>Статус</span>
          <select v-model="status">
            <option value="">Все</option>
            <option value="OPEN">Открыта</option>
            <option value="RESOLVED">Принята</option>
            <option value="DISMISSED">Отклонена / отменена</option>
          </select>
        </label>
        <label class="field">
          <span>Тип</span>
          <select v-model="type">
            <option value="">Все</option>
            <option value="QUALITY">Качество</option>
            <option value="OVERDUE">Просрочено / нет реакции</option>
            <option v-if="canSeeEscalations" value="DISPATCHER_INACTION">Контролирующий орган</option>
          </select>
        </label>
        <button class="btn btn--ghost" @click="fetchComplaints">Обновить</button>
      </div>
      <div class="complaint-stats">
        <div class="complaint-stat-chip">
          <span>Всего</span>
          <strong>{{ complaintStats.total }}</strong>
        </div>
        <div class="complaint-stat-chip complaint-stat-chip--open">
          <span>Открытых</span>
          <strong>{{ complaintStats.open }}</strong>
        </div>
        <div class="complaint-stat-chip complaint-stat-chip--resolved">
          <span>Принятых</span>
          <strong>{{ complaintStats.resolved }}</strong>
        </div>
        <div class="complaint-stat-chip complaint-stat-chip--muted">
          <span>Отклонённых</span>
          <strong>{{ complaintStats.dismissed }}</strong>
        </div>
      </div>
    </div>

    <div class="complaints-board">
      <div class="panel complaints-board__list">
        <div class="complaints-board__section-head">
          <div>
            <div class="section-title">Лента обращений</div>
            <div class="muted">Список последних жалоб и обращений по заявкам.</div>
          </div>
        </div>
        <div v-if="loading">Загрузка...</div>
        <div v-else-if="!complaints.length" class="empty-box">Обращений пока нет.</div>
        <div v-else class="stack">
          <button
            v-for="item in complaints"
            :key="item.id"
            type="button"
            class="complaint-list-item"
            :class="{ 'complaint-list-item--active': item.id === selectedId, 'complaint-list-item--unread': isComplaintUnread(item.id) }"
            @click="selectComplaint(item.id, { markRead: true })"
          >
            <div class="complaint-list-item__head">
              <strong>
                #{{ item.id }}
                <span v-if="isComplaintUnread(item.id)" class="complaint-unread-dot" aria-label="Непрочитанное обращение" />
              </strong>
              <span :class="complaintTypeClass(item.complaint_type)">{{ typeLabel(item.complaint_type) }}</span>
            </div>
            <div v-if="isComplaintUnread(item.id)" class="complaint-unread-chip">Непрочитанное</div>
            <div class="complaint-list-item__meta">
              <span>Заявка #{{ item.ticket_id }}</span>
              <span :class="statusClass(item.status)">{{ statusLabel(item.status, item) }}</span>
            </div>
            <div class="complaint-list-item__preview">{{ complaintPreview(item) }}</div>
            <div class="muted">{{ formatDate(item.created_at) }}</div>
          </button>
        </div>
      </div>

      <div class="panel complaints-board__detail">
        <div v-if="detailLoading">Загрузка деталей...</div>
        <div v-else-if="!selectedComplaint" class="empty-box">Выберите обращение из списка.</div>
        <div v-else class="complaint-detail">
          <div class="complaint-detail__head">
            <div>
              <h3>Обращение #{{ selectedComplaint.id }}</h3>
              <div class="muted">
                Заявка #{{ selectedComplaint.ticket_id }} · {{ formatDate(selectedComplaint.created_at) }}
              </div>
            </div>
            <div class="complaint-detail__badges">
              <span :class="complaintTypeClass(selectedComplaint.complaint_type)">
                {{ typeLabel(selectedComplaint.complaint_type) }}
              </span>
              <span :class="statusClass(selectedComplaint.status)">{{ statusLabel(selectedComplaint.status, selectedComplaint) }}</span>
            </div>
          </div>

          <div class="complaint-info-grid">
            <div class="muted-box complaint-info-card">
              <div class="complaint-info-card__label">Жалобу подал</div>
              <div class="complaint-info-card__value">{{ selectedComplaint.author_name || `Житель #${selectedComplaint.author_id}` }}</div>
            </div>
            <div class="muted-box complaint-info-card">
              <div class="complaint-info-card__label">Основание</div>
              <div class="complaint-info-card__value">
                {{ selectedComplaint.parent_complaint_id ? `Жалоба #${selectedComplaint.parent_complaint_id}` : 'Первичное обращение' }}
              </div>
            </div>
          </div>

          <div class="muted-box complaint-detail__description">
            <div class="complaint-info-card__label">Описание обращения</div>
            <div>{{ selectedComplaint.description || 'Без описания' }}</div>
            <div v-if="selectedComplaint.parent_complaint_id" class="complaint-detail__meta-line">
              Это продолжение обращения после отсутствия реакции или неудовлетворительного решения.
            </div>
          </div>

          <div v-if="selectedComplaint.files?.length" class="complaint-files complaint-files--grid">
            <div class="complaint-subtitle">Вложения</div>
            <button
              v-for="file in selectedComplaint.files"
              :key="file.id"
              type="button"
              class="complaint-file-tile"
              @click="openPreview(file.file_path)"
            >
              <img :src="fileUrl(file.file_path)" :alt="`Вложение ${file.id}`" />
              <span>Открыть</span>
            </button>
          </div>

          <div v-if="selectedComplaint.resolution_comment || selectedComplaint.resolver_name" class="muted-box">
            <div class="complaint-subtitle">Решение по обращению</div>
            <div><strong>Комментарий:</strong> {{ selectedComplaint.resolution_comment || 'Без комментария' }}</div>
            <div class="muted complaint-resolution-line">
              {{ resolutionSummary }}
            </div>
          </div>

          <div class="complaint-comments">
            <div class="complaints-board__section-head">
              <div>
                <div class="section-title">Обсуждение</div>
                <div class="muted">Внутренняя переписка по разбору обращения.</div>
              </div>
            </div>
            <div v-if="selectedComplaint.comments?.length" class="stack">
              <div
                v-for="comment in selectedComplaint.comments"
                :key="comment.id"
                class="comment-card"
                :class="commentCardClasses(comment)"
              >
                <div class="comment-card__head">
                  <strong>{{ comment.author_name || `Пользователь #${comment.author_id}` }}</strong>
                  <span class="muted">
                    <template v-if="comment.author_role">{{ formatRole(comment.author_role) }} · </template>{{ formatDate(comment.created_at) }}
                  </span>
                </div>
                <div v-if="comment.visibility === 'staff'" class="comment-card__badge">Только сотрудникам</div>
                <div
                  v-if="getCommentMessageMeta(comment.message).label"
                  class="comment-card__note"
                  :class="`comment-card__note--${getCommentMessageMeta(comment.message).tone}`"
                >
                  {{ getCommentMessageMeta(comment.message).label }}
                </div>
                <div v-if="getCommentMessageBody(comment.message)" class="comment-card__body">{{ getCommentMessageBody(comment.message) }}</div>
                <div
                  v-if="canViewInlineResidentMessage && getInlineResidentMessage(comment.message)"
                  class="comment-card__resident-message"
                >
                  <div class="comment-card__note comment-card__note--resident">Сообщение жителю</div>
                  <div class="comment-card__resident-body">{{ getInlineResidentMessage(comment.message) }}</div>
                </div>
              </div>
            </div>
            <div v-else class="empty-box">Сообщений пока нет.</div>

            <div class="complaint-comment-form">
              <label v-if="canUseStaffOnlyMessages" class="field">
                <span>Кому видно сообщение</span>
                <select v-if="false" v-model="commentVisibility">
                  <option value="public">Жителю и сотрудникам</option>
                  <option value="staff">Только сотрудникам</option>
                </select>
                <div class="complaint-visibility-box">
                  <label class="complaint-visibility-option">
                    <input
                      type="radio"
                      name="complaint-comment-visibility"
                      :checked="commentVisibility === 'public'"
                      @change="setCommentVisibility('public')"
                    />
                    <span>Жителю и сотрудникам</span>
                  </label>
                  <label class="complaint-visibility-option">
                    <input
                      type="radio"
                      name="complaint-comment-visibility"
                      :checked="commentVisibility === 'staff'"
                      @change="setCommentVisibility('staff')"
                    />
                    <span>Только сотрудникам</span>
                  </label>
                </div>
              </label>
              <label class="field field--span-2">
                <span>Новое сообщение</span>
                <textarea
                  v-model="commentDraft"
                  :disabled="actionLoading || !canCommentOnSelected"
                  :placeholder="canCommentOnSelected ? 'Опишите решение, вопрос или уточнение' : 'Обращение закрыто, переписка недоступна'"
                />
              </label>
              <button class="btn btn--primary" :disabled="actionLoading || !commentDraft.trim() || !canCommentOnSelected" @click="sendComment">
                Отправить сообщение
              </button>
            </div>
          </div>

          <div v-if="canResolve" class="complaint-actions">
            <div class="muted-box complaint-actions__hint">
              Укажите комментарий к решению: он будет виден жителю в истории обращения.
            </div>
            <label class="field field--span-2">
              <span>Комментарий к решению</span>
              <textarea
                v-model="resolveComment"
                :placeholder="selectedComplaint.complaint_type === 'DISPATCHER_INACTION'
                  ? 'Что решено по обращению в контролирующий орган'
                  : 'Что решено по жалобе'"
              />
            </label>
            <label v-if="isEscalatedComplaint" class="field field--span-2">
              <span>Служебное сообщение диспетчеру</span>
              <textarea
                v-model="staffResolutionComment"
                placeholder="Например: требуется повторно рассмотреть жалобу, назначить нового исполнителя, устранить нарушение в срок"
              />
            </label>
            <div class="toolbar complaint-actions__buttons">
              <button class="btn btn--primary" :disabled="actionLoading" @click="requestResolveComplaint">
                Принять
              </button>
              <button class="btn btn--danger" :disabled="actionLoading" @click="requestDismissComplaint">
                Отклонить
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </AppPage>
  <ConfirmDialog
    :open="confirmResolveOpen"
    title="Принять жалобу"
    :message="resolveConfirmationMessage"
    confirm-label="Продолжить"
    :busy="actionLoading"
    @close="closeResolveConfirmation"
    @confirm="confirmResolveComplaint"
  />

  <ConfirmDialog
    :open="confirmDismissOpen"
    title="Отклонить жалобу"
    message="Вы действительно хотите отклонить жалобу?"
    confirm-label="Да, отклонить"
    tone="danger"
    :busy="actionLoading"
    @close="closeDismissConfirmation"
    @confirm="resolveComplaint('DISMISSED')"
  />

  <div v-if="selectedPreviewUrl" class="modal-backdrop modal-backdrop--stacked" @click.self="closePreview">
    <div class="modal photo-preview-modal">
      <button class="photo-preview-modal__close" type="button" aria-label="Закрыть просмотр" @click="closePreview">×</button>
      <div class="photo-preview-modal__head">
        <div>
          <div class="eyebrow">Просмотр вложения</div>
          <h3>Фотография обращения</h3>
        </div>
      </div>
      <div class="photo-preview-modal__frame">
        <img class="photo-preview-modal__image" :src="selectedPreviewUrl" alt="Вложение обращения" />
        <a
          class="photo-preview-modal__download"
          :href="selectedPreviewUrl"
          download
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Скачать фотографию"
        >
          ↓
          <span class="photo-preview-modal__tooltip">Скачать фотографию</span>
        </a>
      </div>
    </div>
  </div>
</template>
