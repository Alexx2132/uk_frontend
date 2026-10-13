<script setup>
import { getApiErrorMessage } from '~/composables/useApi'
import {
  extractExecutorComment,
  extractResidentReview,
  formatAddress,
  formatDate,
  formatDurationMinutesRu,
  formatRole,
  formatSpecialty,
  formatTicketPriority,
  formatTicketStatus,
  isComplaintCanceledByResident,
  parseApiDate
} from '~/utils/format'
import { containsProfanity, PROFANITY_ERROR } from '~/utils/profanity'

const props = defineProps({
  open: { type: Boolean, default: false },
  ticketId: { type: Number, default: null },
  categoryMap: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['close', 'updated'])

const api = useApi()
const auth = useAuth()
const config = useRuntimeConfig()
const liveUpdates = useLiveUpdates()
const { showToast } = useToast()
const complaintFileInputRef = ref(null)
const COMPLAINT_MAX_FILES = 4

const loading = ref(false)
const refreshingDetails = ref(false)
const assigning = ref(false)
const canceling = ref(false)
const actionSubmitting = ref(false)
const complaintSubmitting = ref(false)
const acceptSubmitting = ref(false)
const error = ref('')
const ticket = ref(null)
const historyItems = ref([])
const recommendations = ref([])
const ticketComplaints = ref([])
const executorReviewItems = ref([])
const onlyAvailable = ref(true)
const executorActionMode = ref('')
const executorActionComment = ref('')
const completionComment = ref('')
const pendingAssignment = ref(null)
const confirmUnassignOpen = ref(false)
const confirmCancelOpen = ref(false)
const rejectReasonOpen = ref(false)
const confirmCompleteOpen = ref(false)
const confirmAcceptOpen = ref(false)
const pendingCancelComplaint = ref(null)
const cancelReason = ref('too_long')
const staffRejectReason = ref('')
const complaintCanceling = ref(false)
const complaintFilePreviews = ref([])
const expandedExecutorId = ref(null)
const detailsLoadingId = ref(null)
const executorDetails = reactive({})
const settings = ref({
  complaint_escalate_after_minutes: 360,
  complaint_overdue_after_minutes: 360,
  complaint_primary_limit: 2
})
const residentAcceptanceDraft = reactive({ active: false, review: '', rating: 5 })
const executorReviewDrafts = reactive({})
const residentComplaintDraft = reactive({
  active: false,
  type: '',
  description: '',
  parent_complaint_id: null,
  files: []
})

const residentCancelReasons = [
  { value: 'too_long', label: 'Слишком долго ждать' },
  { value: 'price', label: 'Не устроила цена' },
  { value: 'not_needed', label: 'Больше нет необходимости в помощи специалиста' },
  { value: 'wrong_info', label: 'В заявке была ошибка или неполная информация' }
]

const weekdayLabels = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

const staticBase = computed(() => String(config.public.apiBase || '').replace(/\/api\/v1\/?$/, ''))
const isResident = computed(() => auth.hasRole('resident'))
const isExecutor = computed(() => auth.hasRole('executor'))
const canManageAssignments = computed(() => auth.hasRole('admin', 'dispatcher'))
const canViewTicketComplaints = computed(() => !isExecutor.value)
const normalizedStatus = computed(() => String(ticket.value?.status || '').toLowerCase())
const isRejectedTicket = computed(() => normalizedStatus.value === 'canceled' && historyItems.value.some((item) => isRejectedHistoryItem(item)))
const currentTicketStatusLabel = computed(() => ticket.value?.status_label || (isRejectedTicket.value ? 'Отклонена' : formatTicketStatus(ticket.value?.status)))
const isFinalStatus = computed(() => ['done', 'closed', 'canceled'].includes(normalizedStatus.value))
const categoryName = computed(() => props.categoryMap?.[ticket.value?.category_id] || 'Без категории')
const placeCategoryName = computed(() => ticket.value?.place_category?.name || 'Не указано')
const sortedTicketComplaints = computed(() => [...ticketComplaints.value].sort((a, b) => {
  const bTime = parseApiDate(b?.created_at)?.getTime() || 0
  const aTime = parseApiDate(a?.created_at)?.getTime() || 0
  return bTime - aTime
}))
const latestComplaint = computed(() => sortedTicketComplaints.value[0] || null)
const showAssignmentPicker = computed(() => canManageAssignments.value && !isFinalStatus.value && !ticket.value?.executor_id)
const currentAfterPhotos = computed(() => fileGroups.value.after.filter((file) => isCurrentCompletionPhoto(file)))
const hasAfterPhotos = computed(() => currentAfterPhotos.value.length > 0)
const visibleRecommendations = computed(() => {
  if (!onlyAvailable.value) return recommendations.value
  return recommendations.value.filter((item) => item.can_assign)
})

const visibleReasons = (item) => (item?.reasons || [])
  .filter((reason) => String(reason || '').trim().toLowerCase() !== 'подходит по категории заявки')

const canCancel = computed(() => {
  if (!ticket.value) return false
  if (isResident.value) {
    return ticket.value.author_id === auth.user.value?.id && normalizedStatus.value === 'created'
  }
  return auth.hasRole('admin', 'dispatcher') && normalizedStatus.value === 'created' && !ticket.value?.executor_id
})

const canAssign = computed(() => canManageAssignments.value && !isFinalStatus.value && !ticket.value?.executor_id)
const canUnassign = computed(() => canManageAssignments.value && ticket.value?.executor_id && normalizedStatus.value === 'assigned')
const canExecutorStart = computed(() => isExecutor.value && normalizedStatus.value === 'assigned' && ticket.value?.executor_id === auth.user.value?.id)
const canExecutorReject = computed(() => {
  if (!isExecutor.value || ticket.value?.executor_id !== auth.user.value?.id) return false
  return ['assigned', 'in_progress'].includes(normalizedStatus.value)
})
const canExecutorComplete = computed(() => isExecutor.value && normalizedStatus.value === 'in_progress' && ticket.value?.executor_id === auth.user.value?.id)
const primaryComplaints = computed(() => ticketComplaints.value.filter((item) => ['QUALITY', 'OVERDUE'].includes(String(item.complaint_type || '').toUpperCase())))
const openComplaint = computed(() => ticketComplaints.value.find((item) => String(item.status || '').toUpperCase() === 'OPEN') || null)
const escalationThresholdText = computed(() => formatDurationMinutesRu(Number(settings.value?.complaint_escalate_after_minutes || 360)))
const overdueThresholdText = computed(() => formatDurationMinutesRu(Number(settings.value?.complaint_overdue_after_minutes || 360)))
const canAcceptWork = computed(() => isResident.value && !ticket.value?.is_external_request && normalizedStatus.value === 'done' && !openComplaint.value)
const canCreateQualityComplaint = computed(() => isResident.value && !ticket.value?.is_external_request && normalizedStatus.value === 'done' && !openComplaint.value)
const canOpenResidentConversation = computed(() => {
  if (!ticket.value?.author_id || ticket.value?.is_external_request) return false
  if (auth.hasRole('admin', 'dispatcher')) return true
  return isExecutor.value && Number(ticket.value.executor_id) === Number(auth.user.value?.id)
})
const canCreateOverdueComplaint = computed(() => {
  if (!isResident.value || !ticket.value || ticket.value?.is_external_request || ['done', 'closed', 'canceled'].includes(normalizedStatus.value) || openComplaint.value) return false
  const createdAt = parseApiDate(ticket.value.created_at)
  if (!createdAt || Number.isNaN(createdAt.getTime())) return false
  const overdueMinutes = Number(settings.value?.complaint_overdue_after_minutes || 360)
  return Math.floor((Date.now() - createdAt.getTime()) / 60000) >= overdueMinutes
})
const escalationSourceComplaint = computed(() => {
  const openPrimary = primaryComplaints.value.find((item) => String(item.status || '').toUpperCase() === 'OPEN')
  if (openPrimary && complaintThresholdReached(openPrimary)) return openPrimary
  return primaryComplaints.value.find((item) => ['DISMISSED', 'RESOLVED'].includes(String(item.status || '').toUpperCase())) || null
})
const canEscalateComplaint = computed(() => {
  if (!isResident.value || ticket.value?.is_external_request || !escalationSourceComplaint.value) return false
  return !ticketComplaints.value.some((item) => String(item.complaint_type || '').toUpperCase() === 'DISPATCHER_INACTION' && String(item.status || '').toUpperCase() === 'OPEN')
})
const hasResidentActions = computed(() => canAcceptWork.value || canCreateQualityComplaint.value || canCreateOverdueComplaint.value || canEscalateComplaint.value || residentAcceptanceDraft.active || residentComplaintDraft.active)
const cancelActionText = computed(() => auth.hasRole('admin', 'dispatcher') ? 'Отклонить заявку' : 'Отменить заявку')
const cancelConfirmationMessage = computed(() => auth.hasRole('admin', 'dispatcher')
  ? 'Вы действительно хотите отклонить заявку?'
  : 'Вы действительно хотите отменить эту заявку?')
const assignConfirmationMessage = computed(() => {
  if (!pendingAssignment.value) return ''
  return `Вы действительно хотите назначить исполнителя ${pendingAssignment.value.full_name} (${formatSpecialty(pendingAssignment.value.primary_specialty)}) на заявку?`
})

const infoRows = computed(() => {
  if (!ticket.value) return []
  const rows = [
    { label: 'Статус', value: currentTicketStatusLabel.value },
    { label: 'Приоритет', value: formatTicketPriority(ticket.value.priority) },
    { label: 'Категория', value: categoryName.value },
    { label: 'Где возникла проблема', value: placeCategoryName.value },
    { label: 'Дом', value: formatAddress(ticket.value.house) },
    { label: 'Квартира', value: ticket.value.apartment || ticket.value.apartment_ref?.apartment_number || ticket.value.apartment_id || '—' },
    { label: 'Исполнитель', value: ticket.value.executor?.full_name || 'Не назначен' }
  ]
  if (auth.hasRole('admin', 'dispatcher', 'auditor', 'executor') && ticket.value.is_external_request) {
    rows.splice(5, 0, { label: 'Телефон жителя', value: ticket.value.external_contact_phone || 'Не указан' })
    rows.splice(6, 0, { label: 'Источник', value: 'Заявка оформлена сотрудником по звонку' })
  } else if (auth.hasRole('admin', 'dispatcher', 'auditor', 'executor') && ticket.value.show_contact_phone && ticket.value.author?.contact_phone) {
    rows.splice(5, 0, { label: 'Телефон жителя', value: ticket.value.author.contact_phone })
  }
  return rows
})

const fileGroups = computed(() => {
  const result = { before: [], after: [], other: [] }
  for (const item of ticket.value?.files || []) {
    const kind = String(item.kind || '').toLowerCase()
    const path = String(item.file_path || '').toLowerCase()
    if (kind.includes('before') || path.includes('/before/')) result.before.push(item)
    else if (kind.includes('after') || path.includes('/after/')) result.after.push(item)
    else result.other.push(item)
  }
  return result
})

const fileUrl = (path) => {
  if (!path) return '#'
  if (/^https?:\/\//i.test(path)) return path
  return `${staticBase.value}${String(path).startsWith('/') ? '' : '/'}${path}`
}

const selectedTicketPhotoUrl = ref('')
const selectedTicketPhotoTitle = ref('')

const openTicketPhotoPreview = (file, title = 'Фотография заявки') => {
  const url = fileUrl(file?.file_path)
  if (!url || url === '#') return
  selectedTicketPhotoUrl.value = url
  selectedTicketPhotoTitle.value = title
}

const closeTicketPhotoPreview = () => {
  selectedTicketPhotoUrl.value = ''
  selectedTicketPhotoTitle.value = ''
}

const photoCarouselRefs = reactive({})

const setPhotoCarouselRef = (key, element) => {
  if (element) photoCarouselRefs[key] = element
  else delete photoCarouselRefs[key]
}

const scrollPhotoCarousel = (key, direction) => {
  const element = photoCarouselRefs[key]
  if (!element) return
  const firstItem = element.querySelector('.ticket-detail-photo')
  const step = firstItem ? firstItem.getBoundingClientRect().width + 14 : 220
  element.scrollBy({
    left: direction * step * 2,
    behavior: 'smooth'
  })
}

const isCurrentCompletionPhoto = (file) => {
  if (!file) return false
  if (normalizedStatus.value !== 'in_progress') return fileGroups.value.after.length > 0
  const startedAt = parseApiDate(ticket.value?.started_at)
  const createdAt = parseApiDate(file.created_at)
  if (!startedAt || Number.isNaN(startedAt.getTime())) return true
  if (!createdAt || Number.isNaN(createdAt.getTime())) return false
  return createdAt.getTime() >= startedAt.getTime()
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

const cancelReasonLabel = (value) => {
  const raw = String(value || '').trim().replace(/[.]+$/, '')
  return residentCancelReasons.find((item) => item.value === raw)?.label || raw
}

const complaintThresholdReached = (complaint) => {
  if (!complaint?.created_at) return false
  const createdAt = parseApiDate(complaint.created_at)
  if (!createdAt || Number.isNaN(createdAt.getTime())) return false
  const elapsedMinutes = Math.floor((Date.now() - createdAt.getTime()) / 60000)
  return elapsedMinutes >= Number(settings.value?.complaint_escalate_after_minutes || 360)
}

const fetchSettings = async () => {
  if (!isResident.value) return
  try {
    settings.value = await api.request('/settings/app')
  } catch {
    settings.value = {
      complaint_escalate_after_minutes: 360,
      complaint_overdue_after_minutes: 360,
      complaint_primary_limit: 2
    }
  }
}

const openAcceptanceComposer = () => {
  residentComplaintDraft.active = false
  residentAcceptanceDraft.active = true
  residentAcceptanceDraft.review = ''
  residentAcceptanceDraft.rating = 5
}

const closeAcceptanceComposer = () => {
  residentAcceptanceDraft.active = false
  residentAcceptanceDraft.review = ''
  residentAcceptanceDraft.rating = 5
}

const reviewDraftFor = (executorId) => {
  if (!executorReviewDrafts[executorId]) {
    executorReviewDrafts[executorId] = { active: false, review: '', rating: 5, submitting: false }
  }
  return executorReviewDrafts[executorId]
}

const openExecutorReviewDraft = (item) => {
  const executorId = Number(item?.executor?.id)
  if (!executorId) return
  const draft = reviewDraftFor(executorId)
  draft.active = true
  draft.review = item?.review?.review_text || ''
  draft.rating = Number(item?.review?.rating || 5)
}

const closeExecutorReviewDraft = (executorId) => {
  const draft = reviewDraftFor(executorId)
  if (draft.submitting) return
  draft.active = false
  draft.review = ''
  draft.rating = 5
}

const submitExecutorReview = async (item) => {
  const executorId = Number(item?.executor?.id)
  if (!props.ticketId || !executorId) return
  const draft = reviewDraftFor(executorId)
  if (containsProfanity(draft.review)) {
    error.value = PROFANITY_ERROR
    showToast(PROFANITY_ERROR, { type: 'error' })
    return
  }
  draft.submitting = true
  error.value = ''
  try {
    await api.request(`/tickets/${props.ticketId}/executor-reviews`, {
      method: 'POST',
      body: {
        executor_id: executorId,
        rating: Number(draft.rating || 5),
        review_text: draft.review.trim() || 'Работа принята. Претензий нет.'
      }
    })
    draft.submitting = false
    closeExecutorReviewDraft(executorId)
    await loadTicketDetails({ silent: true })
    showToast('Отзыв исполнителю сохранён')
    emit('updated')
  } catch (requestError) {
    error.value = getApiErrorMessage(requestError, 'Не удалось сохранить отзыв')
  } finally {
    draft.submitting = false
  }
}

const requestAcceptanceConfirmation = () => {
  if (!residentAcceptanceDraft.active) return
  confirmAcceptOpen.value = true
}

const closeAcceptanceConfirmation = () => {
  if (acceptSubmitting.value) return
  confirmAcceptOpen.value = false
}

const submitAcceptance = async () => {
  if (!props.ticketId) return
  if (containsProfanity(residentAcceptanceDraft.review)) {
    error.value = PROFANITY_ERROR
    showToast(PROFANITY_ERROR, { type: 'error' })
    return
  }
  acceptSubmitting.value = true
  error.value = ''
  try {
    await api.request(`/tickets/${props.ticketId}/status`, {
      method: 'PATCH',
      body: {
        status: 'closed',
        comment: residentAcceptanceDraft.review.trim() || 'Работа принята. Претензий нет.',
        resident_rating: Number(residentAcceptanceDraft.rating)
      }
    })
    closeAcceptanceComposer()
    confirmAcceptOpen.value = false
    await loadTicketDetails({ silent: true })
    showToast('Работа принята, отзыв сохранён')
    emit('updated')
  } catch (requestError) {
    error.value = getApiErrorMessage(requestError, 'Не удалось принять работу')
  } finally {
    acceptSubmitting.value = false
  }
}

const openComplaintComposer = (type) => {
  residentAcceptanceDraft.active = false
  residentComplaintDraft.active = true
  residentComplaintDraft.type = type
  residentComplaintDraft.description = ''
  residentComplaintDraft.parent_complaint_id = type === 'DISPATCHER_INACTION' ? escalationSourceComplaint.value?.id || null : null
}

const closeComplaintComposer = () => {
  residentComplaintDraft.active = false
  residentComplaintDraft.type = ''
  residentComplaintDraft.description = ''
  residentComplaintDraft.parent_complaint_id = null
  residentComplaintDraft.files = []
  clearComplaintFilePreviews()
  if (complaintFileInputRef.value) complaintFileInputRef.value.value = ''
}

const formatComplaintFileSize = (size) => {
  if (!Number.isFinite(size) || size <= 0) return ''
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} МБ`
  return `${Math.max(1, Math.round(size / 1024))} КБ`
}

const clearComplaintFilePreviews = () => {
  for (const item of complaintFilePreviews.value) {
    if (item.url) URL.revokeObjectURL(item.url)
  }
  complaintFilePreviews.value = []
}

const rebuildComplaintFilePreviews = () => {
  clearComplaintFilePreviews()
  residentComplaintDraft.files = residentComplaintDraft.files.slice(0, COMPLAINT_MAX_FILES)
  complaintFilePreviews.value = residentComplaintDraft.files.map((file, index) => ({
    id: `${file.name}-${file.size}-${index}`,
    name: file.name,
    sizeText: formatComplaintFileSize(file.size),
    url: typeof URL !== 'undefined' ? URL.createObjectURL(file) : ''
  }))
}

const onComplaintFilesChange = (event) => {
  const selectedFiles = Array.from(event.target.files || [])
  if (selectedFiles.length > COMPLAINT_MAX_FILES) {
    showToast(`Можно прикрепить не более ${COMPLAINT_MAX_FILES} фото`, { type: 'warning' })
  }
  residentComplaintDraft.files = selectedFiles.slice(0, COMPLAINT_MAX_FILES)
  rebuildComplaintFilePreviews()
}

const removeComplaintFile = (index) => {
  residentComplaintDraft.files = residentComplaintDraft.files.filter((_, currentIndex) => currentIndex !== index)
  rebuildComplaintFilePreviews()
  if (!residentComplaintDraft.files.length && complaintFileInputRef.value) {
    complaintFileInputRef.value.value = ''
  }
}

const uploadComplaintFiles = async (complaintId) => {
  for (const file of residentComplaintDraft.files) {
    const formData = new FormData()
    formData.append('file', file)
    await api.request(`/ticket-complaints/${complaintId}/photos`, {
      method: 'POST',
      body: formData
    })
  }
}

const submitComplaint = async () => {
  if (!props.ticketId || !residentComplaintDraft.active) return
  if (!residentComplaintDraft.description.trim()) {
    showToast('Опишите причину жалобы', { type: 'error' })
    return
  }
  if (containsProfanity(residentComplaintDraft.description)) {
    error.value = PROFANITY_ERROR
    showToast(PROFANITY_ERROR, { type: 'error' })
    return
  }

  complaintSubmitting.value = true
  error.value = ''
  try {
    const complaint = await api.request('/ticket-complaints/', {
      method: 'POST',
      body: {
        ticket_id: props.ticketId,
        complaint_type: residentComplaintDraft.type,
        description: residentComplaintDraft.description.trim(),
        parent_complaint_id: residentComplaintDraft.parent_complaint_id || undefined
      }
    })
    if (residentComplaintDraft.files.length && complaint?.id) {
      await uploadComplaintFiles(complaint.id)
    }
    const sentType = residentComplaintDraft.type
    closeComplaintComposer()
    await loadTicketDetails({ silent: true })
    showToast(sentType === 'DISPATCHER_INACTION' ? 'Жалоба в контролирующий орган отправлена' : 'Жалоба отправлена')
    emit('updated')
  } catch (requestError) {
    error.value = getApiErrorMessage(requestError, 'Не удалось отправить жалобу')
    showToast(error.value, { type: 'error' })
  } finally {
    complaintSubmitting.value = false
  }
}

const canCancelComplaint = (complaint) => {
  return isResident.value
    && Number(complaint?.author_id) === Number(auth.user.value?.id)
    && String(complaint?.status || '').toUpperCase() === 'OPEN'
}

const requestCancelComplaint = (complaint) => {
  if (!canCancelComplaint(complaint)) return
  pendingCancelComplaint.value = complaint
}

const closeCancelComplaintConfirmation = () => {
  if (complaintCanceling.value) return
  pendingCancelComplaint.value = null
}

const cancelComplaint = async () => {
  const complaintId = Number(pendingCancelComplaint.value?.id)
  if (!Number.isInteger(complaintId) || complaintId <= 0) return
  complaintCanceling.value = true
  error.value = ''
  try {
    await api.request(`/ticket-complaints/${complaintId}/cancel`, { method: 'POST' })
    pendingCancelComplaint.value = null
    await loadTicketDetails({ silent: true })
    showToast('Жалоба отменена')
    emit('updated')
  } catch (requestError) {
    error.value = getApiErrorMessage(requestError, 'Не удалось отменить жалобу')
    showToast(error.value, { type: 'error' })
  } finally {
    complaintCanceling.value = false
  }
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

const complaintTypeLabel = (value) => {
  const labels = {
    QUALITY: 'Жалоба на качество',
    OVERDUE: 'Жалоба на отсутствие реакции',
    DISPATCHER_INACTION: 'Жалоба в контролирующий орган'
  }
  return labels[value] || value || '—'
}

const complaintStatusLabel = (value, complaint = null) => {
  if (isComplaintCanceledByResident(complaint)) return 'Отменена'
  const labels = {
    OPEN: 'Открыта',
    RESOLVED: 'Принята',
    DISMISSED: 'Отклонена'
  }
  return labels[value] || value || '—'
}

const isRejectedHistoryItem = (item) => {
  const status = String(item?.new_status || '').toLowerCase()
  const comment = String(item?.comment || '').trim().toLowerCase()
  return status === 'canceled' && comment.startsWith('заявка отклонена.')
}

const historyStatusLabel = (status, item = null) => {
  if (isRejectedHistoryItem({ ...item, new_status: status })) return 'Отклонена'
  return formatTicketStatus(status)
}

const formatHistoryTransition = (item) => {
  if (isComplaintHistoryItem(item)) return 'Жалоба'
  if (!item?.new_status) return 'Изменение заявки'
  const next = historyStatusLabel(item.new_status, item)
  if (item.old_status) {
    const oldStatus = String(item.old_status || '').toLowerCase()
    const newStatus = String(item.new_status || '').toLowerCase()
    if (oldStatus === newStatus) return next
    return `${historyStatusLabel(item.old_status)} → ${next}`
  }
  return next
}

const historyActorName = (item) => {
  if (item?.user_name) return item.user_name
  if (item?.user_id && item.user_id === ticket.value?.author_id) {
    return ticket.value?.author?.full_name || ticket.value?.author?.login || `житель #${item.user_id}`
  }
  if (item?.user_id && item.user_id === ticket.value?.executor_id) {
    return ticket.value?.executor?.full_name || `исполнитель #${item.user_id}`
  }
  return item?.user_id ? `пользователь #${item.user_id}` : ''
}

const normalizedHistoryComment = (item) => {
  const comment = String(item?.comment || '').trim()
  if (!comment) return ''

  const commentLower = comment.toLowerCase()
  const reasonMatch = comment.match(/Причина:\s*(.*?)(?:\.?\s*Действие выполнил:|$)/i)
  if (commentLower.startsWith('заявка отменена.') && reasonMatch?.[1]?.trim()) {
    return `Причина отмены: ${cancelReasonLabel(reasonMatch[1])}`
  }
  if (commentLower.startsWith('заявка отклонена.') && reasonMatch?.[1]?.trim()) {
    return `Причина отклонения: ${cancelReasonLabel(reasonMatch[1])}`
  }

  const genericPrefixes = [
    'заявка создана.',
    'заявка отменена.',
    'заявка отклонена.',
    'исполнитель снят.',
    'назначен исполнитель:',
    'статус заявки обновлён.',
    'ticket created',
    'ticket canceled',
    'ticket cancelled',
    'ticket updated',
    'action by user',
    'действие пользователя'
  ]

  if (genericPrefixes.some((prefix) => commentLower.startsWith(prefix))) {
    return ''
  }

  return comment
}

const isComplaintHistoryItem = (item) => {
  const comment = String(item?.comment || '').trim().toLowerCase()
  if (!comment.includes('жалоб') && !comment.includes('обращени')) return false
  return comment.startsWith('житель подал')
    || comment.startsWith('житель направил')
    || comment.startsWith('житель отменил')
    || comment.startsWith('жалоба ')
    || comment.startsWith('контролирующий орган')
    || comment.includes(' жалоба #')
    || comment.includes('обращение #')
}

const historyCommentBlocks = (item) => {
  const comment = normalizedHistoryComment(item)
  if (!comment) return []

  const blocks = []
  const push = (label, body, tone = 'neutral') => {
    const text = String(body || '').trim()
    if (text) blocks.push({ label, body: text, tone })
  }
  const splitByMarker = (patterns) => {
    for (const pattern of patterns) {
      const match = comment.match(pattern)
      if (!match) continue
      const index = match.index || 0
      return {
        before: comment.slice(0, index).trim(),
        after: comment.slice(index + match[0].length).trim()
      }
    }
    return null
  }

  if (isComplaintHistoryItem(item)) {
    const complaintNumber = comment.match(/(?:Жалоба|Обращение)\s*#\d+/i)?.[0] || ''
    if (/житель подал жалобу/i.test(comment)) {
      push('Житель подал жалобу', comment.replace(/Житель подал жалобу:?\s*/i, '').trim(), 'warning')
    } else if (/житель направил обращение/i.test(comment)) {
      push('Обращение в контролирующий орган', comment.replace(/Житель направил обращение в контролирующий орган\.?/i, '').trim(), 'teal')
    } else if (/житель отменил жалобу/i.test(comment)) {
      push('Житель отменил жалобу', comment.replace(/Житель отменил жалобу:?\s*/i, '').trim(), 'muted')
    } else if (/жалоба .*принята/i.test(comment)) {
      push('Жалоба принята', comment, 'success')
    } else if (/жалоба .*отклонена/i.test(comment)) {
      push('Жалоба отклонена', comment, 'danger')
    } else if (/контролирующий орган/i.test(comment)) {
      push('Контролирующий орган', comment, 'teal')
    } else {
      push('Жалоба', comment, 'warning')
    }
    if (complaintNumber && !blocks.some((block) => block.body.includes(complaintNumber))) {
      push('Номер обращения', complaintNumber, 'muted')
    }
    return blocks
  }

  const reviewSplit = splitByMarker([/Отзыв жителя:/i, /Отзыв жильца:/i, /Отзыв:/i])
  if (reviewSplit) {
    push('Статус', reviewSplit.before, 'muted')
    push('Отзыв жителя', reviewSplit.after, 'muted')
    return blocks
  }

  const executorCommentSplit = splitByMarker([
    /Комментарий исполнителя:/i,
    /Комментарий мастера:/i,
    /Комментарий:/i
  ])
  if (executorCommentSplit) {
    push('Статус', executorCommentSplit.before, 'muted')
    push('Комментарий исполнителя', executorCommentSplit.after, 'primary')
    return blocks
  }

  const newStatus = String(item?.new_status || '').toLowerCase()
  const actorRole = String(item?.user_role || '').toLowerCase()
  if (newStatus === 'closed' && actorRole === 'resident') {
    push('Отзыв жителя', comment, 'muted')
    return blocks
  }

  if (/причина отмены:/i.test(comment)) {
    push('Причина отмены', comment.replace(/Причина отмены:/i, '').trim(), 'danger')
    return blocks
  }

  if (/причина отклонения:/i.test(comment)) {
    push('Причина отклонения', comment.replace(/Причина отклонения:/i, '').trim(), 'danger')
    return blocks
  }

  push('', comment)
  return blocks
}

const historyActorLine = (item) => {
  const actorName = historyActorName(item)
  if (!actorName) return ''
  const actorRole = item?.user_role || (item?.user_id === ticket.value?.author_id ? 'resident' : '')
  if (!item?.old_status && String(item?.new_status || '').toLowerCase() === 'created') {
    return `Кем создано: ${actorName}${actorRole ? ` (${formatRole(actorRole)})` : ''}`
  }
  const role = actorRole ? ` (${formatRole(actorRole)})` : ''
  return `Действие выполнил: ${actorName}${role}`
}

const loadTicketDetails = async ({ silent = false } = {}) => {
  if (!props.open || !props.ticketId) return
  if (refreshingDetails.value) return
  refreshingDetails.value = true
  const shouldShowLoader = !silent && (!ticket.value || Number(ticket.value?.id) !== Number(props.ticketId))
  if (shouldShowLoader) {
    loading.value = true
  }
  error.value = ''
  try {
    const requests = [
      api.request(`/tickets/${props.ticketId}`),
      api.request(`/tickets/${props.ticketId}/history`),
      canViewTicketComplaints.value
        ? api.request('/ticket-complaints/', {
            query: { ticket_id: props.ticketId, skip: 0, limit: 50 }
          })
        : Promise.resolve([])
    ]
    requests.push(api.request(`/tickets/${props.ticketId}/executor-reviews`).catch(() => []))

    if (canManageAssignments.value) {
      requests.push(api.request('/executor-recommendations/by-ticket', {
        query: { ticket_id: props.ticketId, top: 10 }
      }))
    } else {
      requests.push(Promise.resolve([]))
    }
    requests.push(fetchSettings())

    const [ticketPayload, historyPayload, complaintsPayload, executorReviewsPayload, recommendationPayload] = await Promise.all(requests)
    ticket.value = ticketPayload
    historyItems.value = Array.isArray(historyPayload) ? historyPayload : []
    ticketComplaints.value = Array.isArray(complaintsPayload) ? complaintsPayload : []
    executorReviewItems.value = Array.isArray(executorReviewsPayload) ? executorReviewsPayload : []
    recommendations.value = Array.isArray(recommendationPayload) ? recommendationPayload : []
    completionComment.value = extractExecutorComment(ticketPayload?.result_comment || '')
    if (process.client) {
      window.dispatchEvent(new CustomEvent('uk-notifications-updated'))
    }
  } catch (requestError) {
    error.value = getApiErrorMessage(requestError, 'Не удалось загрузить данные по заявке')
  } finally {
    refreshingDetails.value = false
    if (shouldShowLoader) {
      loading.value = false
    }
  }
}

const closeModal = () => {
  executorActionMode.value = ''
  executorActionComment.value = ''
  pendingAssignment.value = null
  expandedExecutorId.value = null
  confirmUnassignOpen.value = false
  confirmCancelOpen.value = false
  rejectReasonOpen.value = false
  confirmCompleteOpen.value = false
  confirmAcceptOpen.value = false
  closeAcceptanceComposer()
  Object.keys(executorReviewDrafts).forEach((key) => {
    executorReviewDrafts[key].active = false
  })
  closeComplaintComposer()
  pendingCancelComplaint.value = null
  emit('close')
}

const openComplaintDetails = async (complaintId) => {
  const normalizedId = Number(complaintId)
  if (!Number.isInteger(normalizedId) || normalizedId <= 0) return
  await navigateTo(`/audit?complaint=${normalizedId}`)
}

const openResidentConversation = async () => {
  if (!ticket.value?.author_id) return
  try {
    const conversation = await api.request('/messages/conversations', {
      method: 'POST',
      body: {
        participant_id: ticket.value.author_id,
        ticket_id: ticket.value.id
      }
    })
    await navigateTo(`/messages?conversation=${conversation.id}`)
  } catch (requestError) {
    showToast(getApiErrorMessage(requestError, 'Не удалось открыть переписку с жителем'), { type: 'error' })
  }
}

const requestAssignExecutor = (item) => {
  pendingAssignment.value = item
}

const closeAssignConfirmation = () => {
  pendingAssignment.value = null
}

const assignExecutor = async () => {
  if (!props.ticketId || !pendingAssignment.value) return
  const item = pendingAssignment.value
  assigning.value = true
  error.value = ''
  try {
    await api.request(`/tickets/${props.ticketId}/assign`, {
      method: 'PATCH',
      body: {
        executor_id: item.user_id,
        executor_profile_id: item.executor_id
      }
    })
    await loadTicketDetails({ silent: true })
    showToast(`Исполнитель «${item.full_name}» назначен`)
    emit('updated')
  } catch (requestError) {
    error.value = getApiErrorMessage(requestError, 'Не удалось назначить исполнителя')
  } finally {
    assigning.value = false
    pendingAssignment.value = null
  }
}

const requestUnassignExecutor = () => {
  confirmUnassignOpen.value = true
}

const closeUnassignConfirmation = () => {
  confirmUnassignOpen.value = false
}

const unassignExecutor = async () => {
  if (!props.ticketId) return
  assigning.value = true
  error.value = ''
  try {
    await api.request(`/tickets/${props.ticketId}/assign`, {
      method: 'PATCH',
      body: { executor_profile_id: 0 }
    })
    await loadTicketDetails({ silent: true })
    showToast('Исполнитель снят с заявки')
    emit('updated')
  } catch (requestError) {
    error.value = getApiErrorMessage(requestError, 'Не удалось снять исполнителя')
  } finally {
    assigning.value = false
    confirmUnassignOpen.value = false
  }
}

const requestCancelTicket = () => {
  cancelReason.value = residentCancelReasons[0].value
  staffRejectReason.value = ''
  confirmCancelOpen.value = true
}

const closeCancelConfirmation = () => {
  confirmCancelOpen.value = false
}

const confirmCancelIntent = () => {
  if (isResident.value) {
    cancelTicket()
    return
  }
  confirmCancelOpen.value = false
  staffRejectReason.value = ''
  rejectReasonOpen.value = true
}

const closeRejectReason = () => {
  if (canceling.value) return
  rejectReasonOpen.value = false
  staffRejectReason.value = ''
}

const cancelTicket = async () => {
  if (!props.ticketId) return
  if (!isResident.value && !staffRejectReason.value.trim()) {
    showToast('Укажите причину отклонения заявки', { type: 'error' })
    return
  }
  canceling.value = true
  error.value = ''
  try {
    await api.request(`/tickets/${props.ticketId}/cancel`, {
      method: 'POST',
      body: isResident.value ? { reason: cancelReason.value } : { reason: staffRejectReason.value.trim() }
    })
    await loadTicketDetails({ silent: true })
    showToast(auth.hasRole('admin', 'dispatcher') ? 'Заявка отклонена' : 'Заявка отменена')
    emit('updated')
  } catch (requestError) {
    error.value = getApiErrorMessage(
      requestError,
      auth.hasRole('admin', 'dispatcher') ? 'Не удалось отклонить заявку' : 'Не удалось отменить заявку'
    )
  } finally {
    canceling.value = false
    confirmCancelOpen.value = false
    rejectReasonOpen.value = false
    staffRejectReason.value = ''
  }
}

const openExecutorAction = (mode) => {
  executorActionMode.value = mode
  executorActionComment.value = ''
}

const closeExecutorAction = () => {
  executorActionMode.value = ''
  executorActionComment.value = ''
}

const submitExecutorAction = async () => {
  if (!props.ticketId || !executorActionMode.value) return

  const mode = executorActionMode.value
  const comment = executorActionComment.value.trim()
  if (!comment) {
    error.value = mode === 'start'
      ? 'Укажите комментарий: когда планируете прийти и возможна ли платная работа.'
      : 'Укажите причину отказа от заявки.'
    return
  }
  if (containsProfanity(comment)) {
    error.value = PROFANITY_ERROR
    showToast(PROFANITY_ERROR, { type: 'error' })
    return
  }

  actionSubmitting.value = true
  error.value = ''
  try {
    await api.request(`/tickets/${props.ticketId}/status`, {
      method: 'PATCH',
      body: {
        status: mode === 'start' ? 'in_progress' : 'created',
        comment
      }
    })
    closeExecutorAction()
    await loadTicketDetails({ silent: true })
    showToast(mode === 'start' ? 'Заявка принята в работу' : 'Отказ от заявки сохранён')
    emit('updated')
  } catch (requestError) {
    error.value = getApiErrorMessage(
      requestError,
      mode === 'start'
        ? 'Не удалось принять заявку в работу'
        : 'Не удалось отказаться от заявки'
    )
  } finally {
    actionSubmitting.value = false
  }
}

const submitCompletion = async () => {
  if (!props.ticketId) return
  if (!hasAfterPhotos.value) {
    error.value = 'Сначала прикрепите фото выполненной работы, затем отметьте заявку как выполненную.'
    confirmCompleteOpen.value = false
    return
  }
  if (containsProfanity(completionComment.value)) {
    error.value = PROFANITY_ERROR
    showToast(PROFANITY_ERROR, { type: 'error' })
    confirmCompleteOpen.value = false
    return
  }
  actionSubmitting.value = true
  error.value = ''
  try {
    await api.request(`/tickets/${props.ticketId}/status`, {
      method: 'PATCH',
      body: {
        status: 'done',
        comment: completionComment.value.trim() || 'Работа выполнена.'
      }
    })
    await loadTicketDetails({ silent: true })
    showToast('Заявка отмечена выполненной')
    emit('updated')
  } catch (requestError) {
    error.value = getApiErrorMessage(requestError, 'Не удалось отметить заявку выполненной')
  } finally {
    actionSubmitting.value = false
    confirmCompleteOpen.value = false
  }
}

const requestCompletion = () => {
  if (!hasAfterPhotos.value) {
    error.value = 'Сначала прикрепите фото выполненной работы, затем отметьте заявку как выполненную.'
    return
  }
  confirmCompleteOpen.value = true
}

const closeCompletionConfirmation = () => {
  confirmCompleteOpen.value = false
}

const applyLiveTicketPayload = (payload) => {
  if (!ticket.value) return
  if (Number(payload?.ticket_id) !== Number(ticket.value.id)) return

  ticket.value = {
    ...ticket.value,
    ...(payload.status ? { status: payload.status } : {}),
    ...(Object.prototype.hasOwnProperty.call(payload, 'executor_id') ? { executor_id: payload.executor_id } : {})
  }
}

let unsubscribeLiveUpdates = null
let refreshTimer = null

onMounted(() => {
  unsubscribeLiveUpdates = liveUpdates.subscribe((payload) => {
    if (!props.open || !props.ticketId || !payload) return
    if (!['ticket', 'complaint'].includes(payload.entity)) return
    if (Number(payload.ticket_id) !== Number(props.ticketId)) return
    if (payload.entity === 'ticket') {
      applyLiveTicketPayload(payload)
    }
    loadTicketDetails({ silent: true })
  })
  if (process.client) {
    refreshTimer = window.setInterval(() => {
      if (props.open && props.ticketId) {
        loadTicketDetails({ silent: true })
      }
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
  clearComplaintFilePreviews()
})

watch(() => [props.open, props.ticketId, canManageAssignments.value, canViewTicketComplaints.value], loadTicketDetails, { immediate: true })
</script>

<template>
  <div v-if="open" class="modal-backdrop" @click.self="closeModal">
    <div class="modal ticket-detail-modal">
      <div class="modal__head ticket-detail-modal__head">
        <div>
          <div class="eyebrow">Заявка #{{ ticketId }}</div>
          <h3>{{ ticket?.title || 'Детали заявки' }}</h3>
          <p class="muted">
            {{ ticket?.created_at ? `Создана ${formatDate(ticket.created_at)}` : 'Загружаем данные...' }}
          </p>
        </div>
        <button class="icon-btn ticket-detail-close" type="button" aria-label="Закрыть" @click="closeModal">×</button>
      </div>

      <div v-if="error" class="alert alert--error">{{ error }}</div>
      <div v-if="loading" class="panel narrow">Загрузка...</div>

      <div v-else-if="ticket" class="ticket-detail-layout">
        <section class="modal__section ticket-detail-summary">
          <div class="ticket-detail-badges">
            <span class="pill pill--soft">{{ currentTicketStatusLabel }}</span>
            <span class="pill pill--soft">Приоритет: {{ formatTicketPriority(ticket.priority) }}</span>
            <span class="pill pill--soft">Категория: {{ categoryName }}</span>
          </div>

          <div class="ticket-detail-info-grid">
            <div v-for="row in infoRows" :key="row.label" class="ticket-detail-info-item">
              <span>{{ row.label }}</span>
              <strong>{{ row.value }}</strong>
            </div>
          </div>

          <div v-if="canOpenResidentConversation" class="ticket-detail-chat-action">
            <button class="btn btn--ghost" type="button" @click="openResidentConversation">
              Перейти к переписке
            </button>
          </div>
        </section>

        <section class="modal__section">
          <div class="section-title">Описание</div>
          <div class="ticket-detail-text">{{ ticket.description || 'Описание не указано.' }}</div>
        </section>

        <section v-if="extractExecutorComment(ticket.result_comment) || extractResidentReview(ticket.result_comment)" class="modal__section">
          <div class="section-title">Комментарии по заявке</div>
          <div class="stack">
            <div v-if="extractExecutorComment(ticket.result_comment)" class="muted-box">
              <strong>Комментарий исполнителя:</strong> {{ extractExecutorComment(ticket.result_comment) }}
            </div>
            <div v-if="extractResidentReview(ticket.result_comment)" class="muted-box">
              <strong>Отзыв жителя:</strong> {{ extractResidentReview(ticket.result_comment) }}
              <span v-if="ticket.resident_rating" class="executor-rating-pill">Оценка: {{ ticket.resident_rating }} / 5</span>
            </div>
          </div>
        </section>

        <section v-if="executorReviewItems.length" class="modal__section">
          <div class="ticket-detail-section-head">
            <div>
              <div class="section-title">Исполнители по заявке</div>
              <div class="muted">Здесь можно посмотреть исполнителей, которые работали по заявке, и оставить оценку после принятия работы.</div>
            </div>
          </div>

          <div class="executor-review-list">
            <article v-for="item in executorReviewItems" :key="item.executor.id" class="executor-review-card">
              <div class="executor-review-card__head">
                <div>
                  <strong>{{ item.executor.full_name }}</strong>
                  <span>{{ formatRole(item.executor.role) }}<template v-if="item.executor.specialty"> · {{ formatSpecialty(item.executor.specialty) }}</template></span>
                </div>
                <span v-if="item.review?.rating" class="executor-rating-pill">{{ item.review.rating }} / 5</span>
              </div>

              <div v-if="item.review?.review_text" class="muted-box">
                <strong>Отзыв жителя:</strong> {{ item.review.review_text }}
                <span v-if="item.review.legacy" class="pill pill--soft">старый отзыв</span>
              </div>
              <div v-else class="muted">Отзыв этому исполнителю пока не оставлен.</div>

              <button
                v-if="item.can_review"
                class="btn btn--ghost btn--sm"
                type="button"
                @click="openExecutorReviewDraft(item)"
              >
                Оценить исполнителя
              </button>

              <div v-if="reviewDraftFor(item.executor.id).active" class="executor-review-form">
                <label class="field">
                  <span>Отзыв</span>
                  <textarea v-model="reviewDraftFor(item.executor.id).review" placeholder="Опишите качество работы исполнителя" />
                </label>

                <div class="rating-control">
                  <div class="rating-control__head">
                    <span>Оцените работу исполнителя</span>
                    <strong>{{ reviewDraftFor(item.executor.id).rating }} / 5</strong>
                  </div>
                  <input v-model.number="reviewDraftFor(item.executor.id).rating" type="range" min="1" max="5" step="1">
                  <div class="rating-control__scale">
                    <span>1</span>
                    <span>2</span>
                    <span>3</span>
                    <span>4</span>
                    <span>5</span>
                  </div>
                </div>

                <div class="toolbar">
                  <button class="btn btn--primary btn--sm" type="button" :disabled="reviewDraftFor(item.executor.id).submitting" @click="submitExecutorReview(item)">
                    {{ reviewDraftFor(item.executor.id).submitting ? 'Сохраняем...' : 'Сохранить отзыв' }}
                  </button>
                  <button class="btn btn--ghost btn--sm" type="button" @click="closeExecutorReviewDraft(item.executor.id)">Отмена</button>
                </div>
              </div>
            </article>
          </div>
        </section>

        <section v-if="isResident" class="modal__section resident-ticket-actions">
          <div class="ticket-detail-section-head">
            <div>
              <div class="section-title">Действия по заявке</div>
            </div>
          </div>

          <div v-if="sortedTicketComplaints.length" class="ticket-complaints-strip">
            <div class="ticket-complaints-strip__head">
              <strong>Жалобы по этой заявке</strong>
              <span class="muted">{{ sortedTicketComplaints.length }}</span>
            </div>
            <div class="ticket-complaints-strip__grid">
              <div
                v-for="complaint in sortedTicketComplaints"
                :key="complaint.id"
                class="ticket-complaint-mini"
              >
                <div class="ticket-complaint-mini__top">
                  <span>{{ complaintTypeLabel(complaint.complaint_type) }}</span>
                  <span class="pill pill--soft">{{ complaintStatusLabel(complaint.status, complaint) }}</span>
                </div>
                <div class="muted">#{{ complaint.id }} · {{ formatDate(complaint.created_at) }}</div>
                <div class="ticket-complaint-mini__desc">{{ complaint.description || 'Без описания' }}</div>
                <div class="toolbar">
                  <button class="btn btn--ghost btn--sm" type="button" @click="openComplaintDetails(complaint.id)">
                    Открыть
                  </button>
                  <button
                    v-if="canCancelComplaint(complaint)"
                    class="btn btn--danger btn--sm"
                    type="button"
                    @click="requestCancelComplaint(complaint)"
                  >
                    Отменить жалобу
                  </button>
                </div>
              </div>
            </div>
            <div v-if="openComplaint" class="muted-box">
              Ожидайте рассмотрения жалобы. Если проблема не будет решена в течение {{ escalationThresholdText }}, Вы сможете пожаловаться в контролирующий орган.
            </div>
          </div>

          <div v-if="hasResidentActions" class="resident-ticket-actions__buttons">
            <button
              v-if="canAcceptWork"
              class="btn btn--primary"
              type="button"
              @click="openAcceptanceComposer"
            >
              Принять работу и оставить отзыв
            </button>

            <button
              v-if="canCreateOverdueComplaint"
              class="btn btn--ghost"
              type="button"
              @click="openComplaintComposer('OVERDUE')"
            >
              Пожаловаться на отсутствие реакции
            </button>

            <button
              v-if="canCreateQualityComplaint"
              class="btn btn--ghost"
              type="button"
              @click="openComplaintComposer('QUALITY')"
            >
              Пожаловаться на качество
            </button>

            <button
              v-if="canEscalateComplaint"
              class="btn btn--ghost"
              type="button"
              @click="openComplaintComposer('DISPATCHER_INACTION')"
            >
              Пожаловаться в контролирующий орган
            </button>
          </div>

          <div v-else class="empty-box">
            Сейчас по этой заявке нет доступных действий.
          </div>

          <div v-if="residentAcceptanceDraft.active" class="acceptance-draft resident-action-card">
            <div class="muted">
              После принятия работы жалобу по качеству этой заявки подать уже нельзя.
            </div>

            <label class="field field--span-2">
              <span>Отзыв</span>
              <textarea
                v-model="residentAcceptanceDraft.review"
                placeholder="Опишите впечатление о работе исполнителя"
              />
            </label>

            <div class="rating-control field--span-2">
              <div class="rating-control__head">
                <span>Оцените работу исполнителя, где 5 - очень хорошо, 1 - ужасно.</span>
                <strong>{{ residentAcceptanceDraft.rating }} / 5</strong>
              </div>
              <input
                v-model.number="residentAcceptanceDraft.rating"
                type="range"
                min="1"
                max="5"
                step="1"
              >
              <div class="rating-control__scale">
                <span>1</span>
                <span>2</span>
                <span>3</span>
                <span>4</span>
                <span>5</span>
              </div>
            </div>

            <div class="toolbar">
              <button class="btn btn--primary" type="button" :disabled="acceptSubmitting" @click="requestAcceptanceConfirmation">
                {{ acceptSubmitting ? 'Сохраняем...' : 'Принять работу' }}
              </button>
              <button class="btn btn--ghost" type="button" @click="closeAcceptanceComposer">Отмена</button>
            </div>
          </div>

          <div v-if="residentComplaintDraft.active" class="complaint-draft resident-action-card">
            <div class="muted">
              {{ residentComplaintDraft.type === 'DISPATCHER_INACTION'
                ? 'Жалоба в контролирующий орган из-за отсутствия реакции или необоснованного отклонения.'
                : residentComplaintDraft.type === 'OVERDUE'
                  ? `Жалобу на отсутствие реакции следует подавать, если с момента создания заявки прошло не менее ${overdueThresholdText}. Необоснованная жалоба может повлечь ограничения для Вашего аккаунта.`
                  : 'Жалоба на качество выполнения заявки.' }}
            </div>

            <label class="field field--span-2">
              <span>Описание</span>
              <textarea
                v-model="residentComplaintDraft.description"
                :placeholder="residentComplaintDraft.type === 'OVERDUE'
                  ? 'Опишите, почему считаете, что на заявку долго не реагируют, и что уже предпринимали'
                  : 'Что именно Вас не устроило'"
              />
            </label>

            <label class="field field--span-2">
              <span>Фотографии к жалобе</span>
              <div class="ticket-upload-box">
                <div class="ticket-upload-box__hint">
                  <strong>Добавьте подтверждающие фото</strong>
                  <span>Можно прикрепить до 4 изображений. Лишние фото можно убрать крестиком на превью.</span>
                </div>
                <input ref="complaintFileInputRef" type="file" accept="image/*" multiple @change="onComplaintFilesChange" />
              </div>
            </label>

            <div v-if="complaintFilePreviews.length" class="ticket-files-preview-grid">
              <div
                v-for="(file, index) in complaintFilePreviews"
                :key="file.id"
                class="ticket-file-preview"
              >
                <img v-if="file.url" :src="file.url" :alt="file.name" class="ticket-file-preview__image" />
                <button
                  type="button"
                  class="ticket-file-preview__remove"
                  @click="removeComplaintFile(index)"
                  aria-label="Удалить фото"
                >
                  ×
                </button>
                <div class="ticket-file-preview__meta">
                  <strong>{{ index + 1 }}</strong>
                  <span>{{ file.sizeText }}</span>
                </div>
              </div>
            </div>

            <div class="toolbar">
              <button class="btn btn--primary" type="button" :disabled="complaintSubmitting" @click="submitComplaint">
                {{ complaintSubmitting ? 'Отправляем...' : 'Отправить жалобу' }}
              </button>
              <button class="btn btn--ghost" type="button" @click="closeComplaintComposer">Отмена</button>
            </div>
          </div>
        </section>

        <section class="modal__section">
          <div class="section-title">Фотографии</div>
          <div class="stack">
            <div v-if="fileGroups.before.length">
              <div class="muted ticket-detail-files__label">Фото до устранения проблемы</div>
              <div class="ticket-detail-files__carousel-head">
                <div class="ticket-detail-files__count">{{ fileGroups.before.length }} фото</div>
                <div class="ticket-detail-files__nav">
                  <button class="icon-btn ticket-detail-files__arrow" type="button" aria-label="Предыдущие фото" @click="scrollPhotoCarousel('before', -1)">‹</button>
                  <button class="icon-btn ticket-detail-files__arrow" type="button" aria-label="Следующие фото" @click="scrollPhotoCarousel('before', 1)">›</button>
                </div>
              </div>
              <div :ref="(el) => setPhotoCarouselRef('before', el)" class="ticket-detail-files-grid ticket-detail-files-track">
                <a
                  v-for="file in fileGroups.before"
                  :key="file.id"
                  class="ticket-detail-photo"
                  :href="fileUrl(file.file_path)"
                  @click.prevent="openTicketPhotoPreview(file, 'Фото до устранения проблемы')"
                >
                  <img :src="fileUrl(file.file_path)" alt="Фото заявки" />
                  <span v-if="file.created_at" class="ticket-detail-photo__date">Добавлено: {{ formatDate(file.created_at) }}</span>
                </a>
              </div>
            </div>

            <div v-if="fileGroups.after.length">
              <div class="muted ticket-detail-files__label">Фото после устранения проблемы</div>
              <div class="ticket-detail-files__carousel-head">
                <div class="ticket-detail-files__count">{{ fileGroups.after.length }} фото</div>
                <div class="ticket-detail-files__nav">
                  <button class="icon-btn ticket-detail-files__arrow" type="button" aria-label="Предыдущие фото" @click="scrollPhotoCarousel('after', -1)">‹</button>
                  <button class="icon-btn ticket-detail-files__arrow" type="button" aria-label="Следующие фото" @click="scrollPhotoCarousel('after', 1)">›</button>
                </div>
              </div>
              <div :ref="(el) => setPhotoCarouselRef('after', el)" class="ticket-detail-files-grid ticket-detail-files-track">
                <a
                  v-for="file in fileGroups.after"
                  :key="file.id"
                  class="ticket-detail-photo"
                  :href="fileUrl(file.file_path)"
                  @click.prevent="openTicketPhotoPreview(file, 'Фото после устранения проблемы')"
                >
                  <img :src="fileUrl(file.file_path)" alt="Фото заявки" />
                  <span v-if="file.created_at" class="ticket-detail-photo__date">Добавлено: {{ formatDate(file.created_at) }}</span>
                </a>
              </div>
            </div>

            <div v-if="fileGroups.other.length">
              <div class="muted ticket-detail-files__label">Прочие фото</div>
              <div class="ticket-detail-files__carousel-head">
                <div class="ticket-detail-files__count">{{ fileGroups.other.length }} фото</div>
                <div class="ticket-detail-files__nav">
                  <button class="icon-btn ticket-detail-files__arrow" type="button" aria-label="Предыдущие фото" @click="scrollPhotoCarousel('other', -1)">‹</button>
                  <button class="icon-btn ticket-detail-files__arrow" type="button" aria-label="Следующие фото" @click="scrollPhotoCarousel('other', 1)">›</button>
                </div>
              </div>
              <div :ref="(el) => setPhotoCarouselRef('other', el)" class="ticket-detail-files-grid ticket-detail-files-track">
                <a
                  v-for="file in fileGroups.other"
                  :key="file.id"
                  class="ticket-detail-photo"
                  :href="fileUrl(file.file_path)"
                  @click.prevent="openTicketPhotoPreview(file, 'Фотография заявки')"
                >
                  <img :src="fileUrl(file.file_path)" alt="Фото заявки" />
                  <span v-if="file.created_at" class="ticket-detail-photo__date">Добавлено: {{ formatDate(file.created_at) }}</span>
                </a>
              </div>
            </div>

            <div v-if="!(fileGroups.before.length || fileGroups.after.length || fileGroups.other.length)" class="empty-box">
              Фотографии не прикреплены.
            </div>
          </div>
        </section>

        <section v-if="isExecutor" class="modal__section">
          <div class="section-title">Действия исполнителя</div>

          <div v-if="canExecutorStart || canExecutorReject" class="executor-actions">
            <button
              v-if="canExecutorStart"
              class="btn btn--primary"
              type="button"
              :disabled="actionSubmitting"
              @click="openExecutorAction('start')"
            >
              Принять в работу
            </button>
            <button
              v-if="canExecutorReject"
              class="btn btn--ghost"
              type="button"
              :disabled="actionSubmitting"
              @click="openExecutorAction('reject')"
            >
              Отказаться от заявки
            </button>
          </div>

          <div v-if="executorActionMode" class="executor-composer">
            <div class="executor-composer__title">
              {{ executorActionMode === 'start' ? 'Комментарий при принятии заявки' : 'Причина отказа от заявки' }}
            </div>
            <div class="executor-composer__hint">
              {{ executorActionMode === 'start'
                ? (ticket.is_external_request
                  ? 'Комментарий увидит диспетчер. Укажите планируемое время прибытия, стоимость работ, если работа будет платной, и другую информацию, которую нужно сообщить жителю.'
                  : 'Укажите, когда планируете прийти, и предупредите жильца, если работа может быть платной.')
                : 'Кратко объясните причину отказа, чтобы диспетчер мог быстро переназначить заявку.' }}
            </div>
            <div v-if="false" class="muted-box">
              Сначала прикрепите фото выполненной работы, затем отметьте заявку как выполненную.
            </div>
            <label class="field">
              <span>{{ executorActionMode === 'start' ? 'Комментарий исполнителя' : 'Причина отказа' }}</span>
              <textarea
                v-model="executorActionComment"
                :placeholder="executorActionMode === 'start'
                  ? 'Например: Буду сегодня после 18:00. Если потребуется замена детали, работа может быть платной.'
                  : 'Например: Сегодня вне зоны выезда, прошу переназначить другого исполнителя.'"
              />
            </label>
            <div class="executor-actions">
              <button class="btn btn--primary" type="button" :disabled="actionSubmitting" @click="submitExecutorAction">
                {{ actionSubmitting ? 'Сохраняем...' : (executorActionMode === 'start' ? 'Подтвердить принятие' : 'Подтвердить отказ') }}
              </button>
              <button class="btn btn--ghost" type="button" :disabled="actionSubmitting" @click="closeExecutorAction">Отмена</button>
            </div>
          </div>

          <div v-if="canExecutorComplete" class="executor-composer">
            <div class="executor-composer__title">Завершение работы</div>
            <div class="executor-composer__hint">
              {{ ticket.is_external_request
                ? 'Опишите, что было сделано. Этот комментарий увидит диспетчер, чтобы сообщить результат жителю.'
                : 'Опишите, что было сделано. Этот комментарий увидит житель в карточке заявки.' }}
            </div>
            <label class="field">
              <span>Комментарий по выполнению</span>
              <div class="muted-box">
                Сначала прикрепите фото выполненной работы, затем отметьте заявку как выполненную.
              </div>
              <textarea
                v-model="completionComment"
                placeholder="Например: Течь устранена, соединение заменено, система проверена."
              />
            </label>
            <div class="executor-actions">
              <button class="btn btn--primary" type="button" :disabled="actionSubmitting" @click="requestCompletion">
                {{ actionSubmitting ? 'Сохраняем...' : 'Отметить выполненной' }}
              </button>
            </div>
          </div>
        </section>

        <section v-if="canManageAssignments && (showAssignmentPicker || ticket.executor || canUnassign)" class="modal__section">
          <div v-if="showAssignmentPicker || canUnassign" class="ticket-detail-section-head">
            <div v-if="showAssignmentPicker" class="section-title">Назначение исполнителя</div>
            <button
              v-if="canUnassign"
              class="btn btn--ghost"
              type="button"
              :disabled="assigning"
              @click="requestUnassignExecutor"
            >
              Снять исполнителя
            </button>
          </div>

          <label v-if="showAssignmentPicker" class="assign-filter">
            <input v-model="onlyAvailable" type="checkbox" />
            <span>Отображать только доступных исполнителей</span>
          </label>

          <div v-if="ticket.executor" class="muted-box">
            <strong>Сейчас назначен:</strong> {{ ticket.executor.full_name }}
            <span v-if="ticket.executor.contact_phone"> · {{ ticket.executor.contact_phone }}</span>
          </div>

          <div v-if="showAssignmentPicker && visibleRecommendations.length" class="ticket-recommendations">
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
                :disabled="assigning || !item.can_assign"
                @click="requestAssignExecutor(item)"
              >
                {{ item.can_assign ? 'Назначить' : 'Недоступен сейчас' }}
              </button>
            </div>
          </div>

          <div v-else-if="showAssignmentPicker && !ticket.executor_id" class="empty-box">
            Подходящие исполнители по этой заявке не найдены.
          </div>
        </section>

        <section v-if="latestComplaint && !isResident" class="modal__section">
          <div class="section-title">Жалоба по заявке</div>
          <button type="button" class="ticket-complaint-preview" @click="openComplaintDetails(latestComplaint.id)">
            <div class="ticket-complaint-preview__head">
              <strong>{{ complaintTypeLabel(latestComplaint.complaint_type) }}</strong>
                  <span class="pill pill--soft">{{ complaintStatusLabel(latestComplaint.status, latestComplaint) }}</span>
            </div>
            <div class="muted">
              Жалоба #{{ latestComplaint.id }} · {{ formatDate(latestComplaint.created_at) }}
            </div>
            <div class="ticket-complaint-preview__body">
              {{ latestComplaint.description || 'Описание не указано' }}
            </div>
            <div class="ticket-complaint-preview__link">Открыть обращение</div>
          </button>
        </section>

        <section class="modal__section">
          <div class="ticket-detail-section-head">
            <div class="section-title">История статусов</div>
            <button
              v-if="canCancel"
              :class="['btn', auth.hasRole('admin', 'dispatcher') ? 'btn--danger' : 'btn--ghost']"
              type="button"
              :disabled="canceling"
              @click="requestCancelTicket"
            >
              {{ canceling ? 'Сохраняем...' : cancelActionText }}
            </button>
          </div>

          <div v-if="historyItems.length" class="ticket-history-list">
            <div v-for="item in historyItems" :key="item.id" class="ticket-history-item">
              <div class="ticket-history-item__head">
                <strong>{{ formatHistoryTransition(item) }}</strong>
                <span>{{ formatDate(item.created_at) }}</span>
              </div>
              <div v-if="normalizedHistoryComment(item)" class="ticket-history-item__comment">
                <div
                  v-for="(block, blockIndex) in historyCommentBlocks(item)"
                  :key="`${item.id}-${blockIndex}`"
                  class="ticket-history-comment-block"
                  :class="`ticket-history-comment-block--${block.tone || 'neutral'}`"
                >
                  <span v-if="block.label">{{ block.label }}</span>
                  <strong>{{ block.body }}</strong>
                </div>
              </div>
              <div v-if="historyActorLine(item)" class="muted">{{ historyActorLine(item) }}</div>
            </div>
          </div>
          <div v-else class="empty-box">История пока пуста.</div>
        </section>
      </div>
    </div>
  </div>

  <div v-if="selectedTicketPhotoUrl" class="modal-backdrop modal-backdrop--stacked" @click.self="closeTicketPhotoPreview">
    <div class="modal photo-preview-modal">
      <button class="photo-preview-modal__close" type="button" aria-label="Закрыть просмотр" @click="closeTicketPhotoPreview">×</button>
      <div class="photo-preview-modal__head">
        <div>
          <div class="eyebrow">Просмотр фотографии</div>
          <h3>{{ selectedTicketPhotoTitle || 'Фотография заявки' }}</h3>
        </div>
      </div>
      <div class="photo-preview-modal__frame">
        <img class="photo-preview-modal__image" :src="selectedTicketPhotoUrl" :alt="selectedTicketPhotoTitle || 'Фотография заявки'" />
        <a
          class="photo-preview-modal__download"
          :href="selectedTicketPhotoUrl"
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

  <ConfirmDialog
    :open="Boolean(pendingAssignment)"
    title="Назначить исполнителя"
    :message="assignConfirmationMessage"
    confirm-label="Да, назначить"
    :show-close="false"
    :busy="assigning"
    @close="closeAssignConfirmation"
    @confirm="assignExecutor"
  />

  <ConfirmDialog
    :open="confirmUnassignOpen"
    title="Снять исполнителя"
    message="Снять назначенного исполнителя и вернуть заявку в статус «Создана»?"
    confirm-label="Да, снять"
    :busy="assigning"
    @close="closeUnassignConfirmation"
    @confirm="unassignExecutor"
  />

  <ConfirmDialog
    :open="confirmCancelOpen"
    :title="cancelActionText"
    :message="cancelConfirmationMessage"
    :confirm-label="auth.hasRole('admin', 'dispatcher') ? 'Да, отклонить' : 'Да, отменить'"
    tone="danger"
    :show-close="false"
    :busy="canceling"
    @close="closeCancelConfirmation"
    @confirm="confirmCancelIntent"
  >
    <label v-if="isResident" class="field confirm-modal__field">
      <span>Причина отмены</span>
      <select v-model="cancelReason">
        <option v-for="item in residentCancelReasons" :key="item.value" :value="item.value">
          {{ item.label }}
        </option>
      </select>
    </label>
  </ConfirmDialog>
  <ConfirmDialog
    :open="rejectReasonOpen"
    :show-close="false"
    title="Причина отклонения заявки"
    message="Укажите причину отклонения. Она будет сохранена в истории заявки и будет видна жителю."
    confirm-label="Отклонить заявку"
    tone="danger"
    :busy="canceling"
    @close="closeRejectReason"
    @confirm="cancelTicket"
  >
    <label class="field confirm-modal__field">
      <span>Причина отклонения</span>
      <textarea
        class="textarea-fixed"
        v-model="staffRejectReason"
        rows="4"
        placeholder="Например: заявка оформлена не по адресу или требует уточнения данных."
      />
    </label>
  </ConfirmDialog>
  <ConfirmDialog
    :open="confirmCompleteOpen"
    title="Отметить заявку как выполненную"
    message="Убедитесь, что Вы прикрепили фото выполненной работы. После подтверждения житель увидит результат и сможет принять работу или подать жалобу."
    confirm-label="Да, отметить как выполненную"
    :busy="actionSubmitting"
    @close="closeCompletionConfirmation"
    @confirm="submitCompletion"
  />
  <ConfirmDialog
    :open="confirmAcceptOpen"
    title="Принять выполненную работу"
    message="После принятия работы жалобу по качеству по этой заявке подать уже нельзя. Проверьте результат, фотоотчёт и комментарий исполнителя перед подтверждением."
    confirm-label="Принять работу"
    :busy="acceptSubmitting"
    @close="closeAcceptanceConfirmation"
    @confirm="submitAcceptance"
  />
  <ConfirmDialog
    :open="Boolean(pendingCancelComplaint)"
    title="Отменить жалобу"
    message="Вы действительно хотите отменить эту жалобу? Она останется в истории, но будет закрыта как отменённая жителем."
    confirm-label="Да, отменить жалобу"
    tone="danger"
    :busy="complaintCanceling"
    @close="closeCancelComplaintConfirmation"
    @confirm="cancelComplaint"
  />
</template>
