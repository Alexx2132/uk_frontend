<script setup>
import { getApiErrorMessage } from '~/composables/useApi'
import {
  extractExecutorComment,
  extractResidentReview,
  formatAddress,
  formatDate,
  formatDurationMinutesRu,
  parseApiDate,
  formatTicketPriority,
  formatTicketStatus,
  isComplaintCanceledByResident,
  priorityAccent
} from '~/utils/format'
import { containsProfanity, PROFANITY_ERROR } from '~/utils/profanity'
import { CONTACT_PHONE_MAX_LENGTH, formatContactPhoneInput, validateContactPhone } from '~/utils/phone'

const props = defineProps({
  title: { type: String, default: 'Заявки' },
  subtitle: { type: String, default: 'Общий список заявок.' },
  emptyText: { type: String, default: 'Заявок пока нет.' }
})

const api = useApi()
const auth = useAuth()
const liveUpdates = useLiveUpdates()
const { showToast } = useToast()
const fileInputRef = ref(null)
const filePreviews = ref([])
const createPanelOpen = ref(false)

const tickets = ref([])
const complaints = ref([])
const unreadTicketIds = ref(new Set())
const categories = ref([])
const placeCategories = ref([])
const houses = ref([])
const assignModalTicketId = ref(null)
const loading = ref(true)
const status = ref('')
const priority = ref('')
const createSubmitting = ref(false)
const complaintSubmitting = ref(false)
const acceptSubmitting = ref(false)
const createMessage = ref('')
const createError = ref('')
const complaintMessage = ref('')
const complaintError = ref('')
const acceptMessage = ref('')
const acceptError = ref('')
const pendingAcceptanceTicketId = ref(null)
const settings = ref({
  complaint_escalate_after_minutes: 360,
  complaint_overdue_after_minutes: 360,
  complaint_primary_limit: 2
})
let refreshInFlight = false
let refreshQueued = false
let refreshTimer = null

const createForm = reactive({
  title: '',
  description: '',
  category_id: '',
  place_category_id: '',
  priority: 'normal',
  show_contact_phone: false,
  files: []
})

const staffCreateForm = reactive({
  house_id: '',
  apartment: '',
  external_contact_phone: '+7',
  title: '',
  description: '',
  category_id: '',
  place_category_id: '',
  priority: 'normal'
})

const onStaffContactPhoneInput = () => {
  staffCreateForm.external_contact_phone = formatContactPhoneInput(staffCreateForm.external_contact_phone)
}

const autoGrowTextarea = (event) => {
  const target = event?.target
  if (!target) return
  target.style.height = 'auto'
  target.style.height = `${target.scrollHeight}px`
}

const priorityOptions = [
  { value: 'emergency', label: 'Аварийный', hint: 'Опасная ситуация, протечка, замыкание, угроза имуществу.', accent: 'danger' },
  { value: 'high', label: 'Высокий', hint: 'Проблема мешает пользоваться помещением или инженерией.', accent: 'warning' },
  { value: 'normal', label: 'Обычный', hint: 'Стандартная бытовая заявка без срочной угрозы.', accent: 'primary' },
  { value: 'low', label: 'Низкий', hint: 'Можно выполнить в плановом порядке.', accent: 'neutral' }
]

const banInfo = reactive({
  active: false,
  until: ''
})

const complaintDrafts = reactive({})
const acceptanceDrafts = reactive({})

const isResident = computed(() => auth.hasRole('resident'))
const isStaff = computed(() => auth.hasRole('admin', 'admin_assistant', 'dispatcher', 'auditor'))
const canViewComplaints = computed(() => auth.hasRole('admin', 'dispatcher', 'auditor'))
const canCreateExternalTicket = computed(() => auth.hasRole('admin', 'dispatcher'))
const canManageAssignments = computed(() => auth.hasRole('admin', 'dispatcher'))
const profileReady = computed(() => {
  const user = auth.user.value
  return Boolean(user?.house_id && (user?.apartment_id || user?.apartment || user?.apartment_ref?.id))
})

const categoryMap = computed(() => {
  return categories.value.reduce((acc, item) => {
    acc[item.id] = item.name
    return acc
  }, {})
})

const placeCategoryMap = computed(() => {
  return placeCategories.value.reduce((acc, item) => {
    acc[item.id] = item.name
    return acc
  }, {})
})

const selectedPriorityMeta = computed(() => priorityOptions.find((item) => item.value === createForm.priority) || priorityOptions[2])

const complaintsByTicket = computed(() => {
  return complaints.value.reduce((acc, complaint) => {
    const key = complaint.ticket_id
    if (!acc[key]) acc[key] = []
    acc[key].push(complaint)
    return acc
  }, {})
})

const complaintTypeLabel = (value) => {
  const labels = {
    QUALITY: 'Качество работы',
    OVERDUE: 'Просрочено / нет реакции',
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

const categoryLabel = (ticket) => categoryMap.value[ticket.category_id] || 'Без категории'
const placeCategoryLabel = (ticket) => ticket?.place_category?.name || placeCategoryMap.value[ticket?.place_category_id] || 'Не указано'

const pickDefaultCategoryId = () => {
  if (!categories.value.length) return ''
  const misc = categories.value.find((item) => String(item.name || '').toLowerCase().includes('разн'))
  return String(misc?.id || categories.value[0].id)
}

const pickDefaultPlaceCategoryId = () => {
  if (!placeCategories.value.length) return ''
  const apartment = placeCategories.value.find((item) => String(item.name || '').toLowerCase().includes('кварт'))
  return String(apartment?.id || placeCategories.value[0].id)
}

const parseBanDetail = (detail) => {
  const text = typeof detail === 'string' ? detail : detail?.detail || ''
  const normalized = String(text || '')
  const match = normalized.match(/до\s+(.+)$/i)
  banInfo.until = match?.[1] ? formatDate(match[1]) : formatDate(auth.user.value?.banned_until)
  banInfo.active = true
}

const syncBanState = () => {
  const bannedUntil = auth.user.value?.banned_until
  if (!bannedUntil) {
    banInfo.active = false
    banInfo.until = ''
    return
  }

  const date = parseApiDate(bannedUntil)
  if (date && !Number.isNaN(date.getTime()) && date.getTime() > Date.now()) {
    banInfo.active = true
    banInfo.until = formatDate(bannedUntil)
    return
  }

  banInfo.active = false
  banInfo.until = ''
}

const openAdminConversation = async () => {
  try {
    const conversation = await api.request('/messages/admin', { method: 'POST' })
    await navigateTo(`/messages?conversation=${conversation.id}`)
  } catch (requestError) {
    showToast(getApiErrorMessage(requestError, 'Не удалось открыть переписку с администратором'), { type: 'error' })
  }
}

const getTicketComplaints = (ticketId) => complaintsByTicket.value[ticketId] || []
const getPrimaryComplaints = (ticketId) => getTicketComplaints(ticketId).filter((item) => ['QUALITY', 'OVERDUE'].includes(String(item.complaint_type || '').toUpperCase()))
const getOpenBaseComplaint = (ticketId) => getPrimaryComplaints(ticketId).find((item) => item.status === 'OPEN')
const getOpenQualityComplaint = (ticketId) => getPrimaryComplaints(ticketId).find((item) => item.complaint_type === 'QUALITY' && item.status === 'OPEN')
const getOpenEscalationComplaint = (ticketId) => getTicketComplaints(ticketId).find((item) => item.complaint_type === 'DISPATCHER_INACTION' && item.status === 'OPEN')
const getLatestComplaint = (ticketId) => getTicketComplaints(ticketId)[0] || null
const hasOpenComplaint = (ticketId) => getTicketComplaints(ticketId).some((item) => item.status === 'OPEN')
const isTicketUnread = (ticketId) => unreadTicketIds.value.has(Number(ticketId))
const escalationThresholdText = computed(() => formatDurationMinutesRu(Number(settings.value?.complaint_escalate_after_minutes || 360)))
const overdueThresholdText = computed(() => formatDurationMinutesRu(Number(settings.value?.complaint_overdue_after_minutes || 360)))

const thresholdReached = (complaint) => {
  if (!complaint?.created_at) return false
  const createdAt = parseApiDate(complaint.created_at)
  if (!createdAt || Number.isNaN(createdAt.getTime())) return false
  const elapsedMinutes = Math.floor((Date.now() - createdAt.getTime()) / 60000)
  return elapsedMinutes >= Number(settings.value?.complaint_escalate_after_minutes || 360)
}

const complaintResolutionLine = (complaint) => {
  if (!complaint || complaint.status === 'OPEN') return ''

  const parts = [`Решение: ${complaintStatusLabel(complaint.status, complaint)}`]

  if (complaint.resolver_name) {
    const role = complaint.resolver_role === 'dispatcher'
      ? 'диспетчер'
      : complaint.resolver_role === 'auditor'
        ? 'аудитор'
        : complaint.resolver_role === 'admin'
          ? 'администратор'
          : ''
    parts.push(`Кто рассмотрел: ${complaint.resolver_name}${role ? ` (${role})` : ''}`)
  }

  if (complaint.resolution_comment?.trim()) {
    parts.push(`Причина / комментарий: ${complaint.resolution_comment.trim()}`)
  }

  return parts.join('\n')
}

const openComplaintHint = (ticketId) => {
  if (!getOpenBaseComplaint(ticketId)) return ''
  return `Ожидайте рассмотрение жалобы. В случае, если проблема не будет решена в течение ${escalationThresholdText.value}, Вы сможете пожаловаться в контролирующий орган.`
}

const isOverdueComplaintAvailable = (ticket) => {
  const createdAt = parseApiDate(ticket?.created_at)
  if (!createdAt || Number.isNaN(createdAt.getTime())) return false
  const overdueMinutes = Number(settings.value?.complaint_overdue_after_minutes || 360)
  return Math.floor((Date.now() - createdAt.getTime()) / 60000) >= overdueMinutes
}

const canCreateQualityComplaint = (ticket) => {
  return isResident.value && String(ticket.status || '').toLowerCase() === 'done' && !hasOpenComplaint(ticket.id)
}

const canCreateOverdueComplaint = (ticket) => {
  const statusKey = String(ticket?.status || '').toLowerCase()
  if (!isResident.value || ['done', 'closed', 'canceled'].includes(statusKey)) return false
  if (!isOverdueComplaintAvailable(ticket)) return false
  return !hasOpenComplaint(ticket.id)
}

const getEscalationSourceComplaint = (ticketId) => {
  const primaryComplaints = getPrimaryComplaints(ticketId)
  const openComplaint = primaryComplaints.find((item) => item.status === 'OPEN')
  if (openComplaint && thresholdReached(openComplaint)) return openComplaint
  return primaryComplaints.find((item) => ['DISMISSED', 'RESOLVED'].includes(String(item.status || '').toUpperCase())) || null
}

const canEscalateComplaint = (ticket) => {
  return isResident.value && Boolean(getEscalationSourceComplaint(ticket.id)) && !getOpenEscalationComplaint(ticket.id)
}

const canAcceptWork = (ticket) => isResident.value && !ticket?.is_external_request && String(ticket.status || '').toLowerCase() === 'done' && !getOpenQualityComplaint(ticket.id)

const currentComplaintDraft = (ticketId) => complaintDrafts[ticketId] || null
const currentAcceptanceDraft = (ticketId) => acceptanceDrafts[ticketId] || null

const openComplaintComposer = (ticketId, type) => {
  const escalationSource = getEscalationSourceComplaint(ticketId)
  complaintDrafts[ticketId] = {
    type,
    description: '',
    parent_complaint_id: type === 'DISPATCHER_INACTION' ? escalationSource?.id || null : null
  }
}

const closeComplaintComposer = (ticketId) => {
  delete complaintDrafts[ticketId]
}

const openAcceptanceComposer = (ticketId) => {
  acceptanceDrafts[ticketId] = {
    review: '',
    rating: 5
  }
}

const closeAcceptanceComposer = (ticketId) => {
  delete acceptanceDrafts[ticketId]
}

const requestAcceptanceConfirmation = (ticketId) => {
  const draft = currentAcceptanceDraft(ticketId)
  if (!draft) return
  pendingAcceptanceTicketId.value = ticketId
}

const closeAcceptanceConfirmation = () => {
  if (acceptSubmitting.value) return
  pendingAcceptanceTicketId.value = null
}

const openTicketPage = async (ticketId) => {
  const normalizedId = Number(ticketId)
  if (!Number.isInteger(normalizedId) || normalizedId <= 0) return
  await navigateTo(`/tickets/${normalizedId}`)
}

const canOpenAssignModal = (ticket) => {
  const statusKey = String(ticket?.status || '').toLowerCase()
  return canManageAssignments.value && !ticket?.executor_id && !['done', 'closed', 'canceled'].includes(statusKey)
}

const openAssignModal = (ticketId) => {
  const normalizedId = Number(ticketId)
  if (!Number.isInteger(normalizedId) || normalizedId <= 0) return
  assignModalTicketId.value = normalizedId
}

const ticketCardClass = (ticket) => [
  `ticket-card--priority-${priorityAccent(ticket?.priority)}`,
  {
    'ticket-card--has-complaint': hasOpenComplaint(ticket?.id),
    'ticket-card--unread': isTicketUnread(ticket?.id)
  }
]

const closeAssignModal = () => {
  assignModalTicketId.value = null
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

  const complaintId = Number(payload?.complaint_id)
  const hasComplaint = complaints.value.some((item) => Number(item.id) === complaintId)
  if (!hasComplaint && complaintId > 0 && String(payload.status || '').toUpperCase() === 'OPEN') {
    complaints.value = [
      {
        id: complaintId,
        ticket_id: ticketId,
        complaint_type: payload.complaint_type,
        status: payload.status,
        created_at: new Date().toISOString()
      },
      ...complaints.value
    ]
  }
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

const fetchCategories = async () => {
  try {
    const [problemItems, locationItems] = await Promise.all([
      api.request('/categories/', { query: { category_type: 'problem' } }),
      api.request('/categories/', { query: { category_type: 'location' } })
    ])
    categories.value = problemItems
    placeCategories.value = locationItems
    if (!createForm.category_id) {
      createForm.category_id = pickDefaultCategoryId()
    }
    if (!createForm.place_category_id) {
      createForm.place_category_id = pickDefaultPlaceCategoryId()
    }
    if (!staffCreateForm.category_id) {
      staffCreateForm.category_id = pickDefaultCategoryId()
    }
    if (!staffCreateForm.place_category_id) {
      staffCreateForm.place_category_id = pickDefaultPlaceCategoryId()
    }
  } catch {
    categories.value = []
    placeCategories.value = []
  }
}

const fetchHouses = async () => {
  if (!canCreateExternalTicket.value) {
    houses.value = []
    return
  }
  try {
    houses.value = await api.request('/houses/')
    if (!staffCreateForm.house_id && houses.value.length) {
      staffCreateForm.house_id = String(houses.value[0].id)
    }
  } catch {
    houses.value = []
  }
}

const fetchComplaints = async () => {
  if (!(isResident.value || canViewComplaints.value)) {
    complaints.value = []
    return
  }
  complaints.value = await api.request('/ticket-complaints/', {
    query: {
      status: isResident.value ? undefined : 'OPEN',
      skip: 0,
      limit: 200
    }
  })
}

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

const fetchTickets = async ({ silent = false } = {}) => {
  if (refreshInFlight) {
    refreshQueued = true
    return
  }
  refreshInFlight = true
  if (!silent) {
    loading.value = true
  }
  createError.value = ''
  complaintError.value = ''
  acceptError.value = ''
  try {
    tickets.value = await api.request('/tickets/', {
      query: {
        status: status.value || undefined,
        priority: priority.value || undefined
      }
    })
    await Promise.all([fetchCategories(), fetchComplaints(), fetchSettings(), fetchHouses(), loadUnreadTicketNotifications()])
  } catch (e) {
    createError.value = e?.data?.detail || e?.message || 'Не удалось загрузить заявки'
  } finally {
    if (!silent) {
      loading.value = false
    }
    refreshInFlight = false
    if (refreshQueued) {
      refreshQueued = false
      fetchTickets({ silent: true })
    }
  }
}

const submitExternalTicket = async () => {
  createMessage.value = ''
  createError.value = ''

  if (!staffCreateForm.house_id) {
    createError.value = 'Выберите дом'
    showToast(createError.value, { type: 'error' })
    return
  }
  if (!staffCreateForm.apartment.trim()) {
    createError.value = 'Укажите квартиру'
    showToast(createError.value, { type: 'error' })
    return
  }
  if (!staffCreateForm.external_contact_phone.trim()) {
    createError.value = 'Укажите телефон жителя'
    showToast(createError.value, { type: 'error' })
    return
  }
  const phoneValidation = validateContactPhone(staffCreateForm.external_contact_phone, { required: true })
  if (!phoneValidation.ok) {
    createError.value = phoneValidation.error
    showToast(createError.value, { type: 'error' })
    return
  }
  if (!staffCreateForm.title.trim() || !staffCreateForm.description.trim()) {
    createError.value = 'Заполните проблему и описание'
    showToast(createError.value, { type: 'error' })
    return
  }
  if (containsProfanity(staffCreateForm.title, staffCreateForm.description, staffCreateForm.external_contact_phone)) {
    createError.value = PROFANITY_ERROR
    showToast(PROFANITY_ERROR, { type: 'error' })
    return
  }

  createSubmitting.value = true
  try {
    await api.request('/tickets/', {
      method: 'POST',
      body: {
        title: staffCreateForm.title.trim(),
        description: staffCreateForm.description.trim(),
        house_id: Number(staffCreateForm.house_id),
        apartment: staffCreateForm.apartment.trim(),
        external_contact_phone: phoneValidation.value,
        category_id: staffCreateForm.category_id ? Number(staffCreateForm.category_id) : null,
        place_category_id: staffCreateForm.place_category_id ? Number(staffCreateForm.place_category_id) : null,
        priority: staffCreateForm.priority,
        show_contact_phone: true
      }
    })

    staffCreateForm.apartment = ''
    staffCreateForm.external_contact_phone = '+7'
    staffCreateForm.title = ''
    staffCreateForm.description = ''
    staffCreateForm.priority = 'normal'
    staffCreateForm.category_id = pickDefaultCategoryId()
    staffCreateForm.place_category_id = pickDefaultPlaceCategoryId()
    createPanelOpen.value = false
    showToast('Заявка создана')
    await fetchTickets()
  } catch (e) {
    createError.value = e?.data?.detail || e?.message || 'Не удалось создать заявку'
    showToast(createError.value, { type: 'error' })
  } finally {
    createSubmitting.value = false
  }
}

const onFileChange = (event) => {
  createForm.files = Array.from(event.target.files || []).slice(0, 10)
  rebuildFilePreviews()
}

const removeSelectedFile = (index) => {
  createForm.files = createForm.files.filter((_, currentIndex) => currentIndex !== index)
  rebuildFilePreviews()
  if (!createForm.files.length && fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

const formatFileSize = (size) => {
  if (!Number.isFinite(size) || size <= 0) return ''
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} МБ`
  return `${Math.max(1, Math.round(size / 1024))} КБ`
}

const clearFilePreviews = () => {
  for (const item of filePreviews.value) {
    if (item.url) URL.revokeObjectURL(item.url)
  }
  filePreviews.value = []
}

const rebuildFilePreviews = () => {
  clearFilePreviews()
  filePreviews.value = createForm.files.map((file, index) => ({
    id: `${file.name}-${file.size}-${index}`,
    name: file.name,
    sizeText: formatFileSize(file.size),
    url: typeof URL !== 'undefined' ? URL.createObjectURL(file) : ''
  }))
}

const uploadTicketFiles = async (ticketId) => {
  for (const file of createForm.files) {
    const formData = new FormData()
    formData.append('file', file)
    await api.request(`/tickets/${ticketId}/photos`, {
      method: 'POST',
      query: { kind: 'before' },
      body: formData
    })
  }
}

const submitTicket = async () => {
  createMessage.value = ''
  createError.value = ''

  if (!createForm.title.trim() || !createForm.description.trim()) {
    createError.value = 'Заполните заголовок и описание заявки'
    return
  }
  if (containsProfanity(createForm.title, createForm.description)) {
    createError.value = PROFANITY_ERROR
    showToast(PROFANITY_ERROR, { type: 'error' })
    return
  }

  createSubmitting.value = true
  try {
    const ticket = await api.request('/tickets/', {
      method: 'POST',
      body: {
        title: createForm.title.trim(),
        description: createForm.description.trim(),
        category_id: createForm.category_id ? Number(createForm.category_id) : null,
        place_category_id: createForm.place_category_id ? Number(createForm.place_category_id) : null,
        priority: createForm.priority,
        show_contact_phone: Boolean(createForm.show_contact_phone)
      }
    })

    if (createForm.files.length) {
      await uploadTicketFiles(ticket.id)
    }

    createForm.title = ''
    createForm.description = ''
    createForm.priority = 'normal'
    createForm.show_contact_phone = false
    createForm.files = []
    clearFilePreviews()
    if (fileInputRef.value) {
      fileInputRef.value.value = ''
    }
    createForm.category_id = pickDefaultCategoryId()
    createForm.place_category_id = pickDefaultPlaceCategoryId()
    createMessage.value = ''
    createPanelOpen.value = false
    showToast('Заявка отправлена')
    await fetchTickets()
  } catch (e) {
    const detail = e?.data?.detail || e?.message || 'Не удалось создать заявку'
    createError.value = detail
    if (e?.status === 403 || e?.data?.status_code === 403) {
      parseBanDetail(detail)
    }
  } finally {
    createSubmitting.value = false
  }
}

const submitComplaint = async (ticketId) => {
  const draft = currentComplaintDraft(ticketId)
  if (!draft?.description?.trim()) {
    complaintError.value = 'Опишите причину жалобы'
    showToast(complaintError.value, { type: 'error' })
    return
  }
  if (containsProfanity(draft.description)) {
    complaintError.value = PROFANITY_ERROR
    showToast(PROFANITY_ERROR, { type: 'error' })
    return
  }

  complaintSubmitting.value = true
  complaintError.value = ''
  complaintMessage.value = ''
  try {
    await api.request('/ticket-complaints/', {
      method: 'POST',
      body: {
        ticket_id: ticketId,
        complaint_type: draft.type,
        description: draft.description.trim(),
        parent_complaint_id: draft.parent_complaint_id || undefined
      }
    })

    closeComplaintComposer(ticketId)
    complaintMessage.value = ''
    showToast(draft.type === 'DISPATCHER_INACTION' ? 'Жалоба в контролирующий орган отправлена' : 'Жалоба отправлена')
    await fetchTickets()
  } catch (e) {
    complaintError.value = e?.data?.detail || e?.message || 'Не удалось отправить жалобу'
    showToast(complaintError.value, { type: 'error' })
  } finally {
    complaintSubmitting.value = false
  }
}

const submitAcceptance = async (ticketId) => {
  const draft = currentAcceptanceDraft(ticketId)
  if (!draft) return
  if (containsProfanity(draft.review)) {
    acceptError.value = PROFANITY_ERROR
    showToast(PROFANITY_ERROR, { type: 'error' })
    return
  }

  acceptSubmitting.value = true
  acceptError.value = ''
  acceptMessage.value = ''
  try {
    await api.request(`/tickets/${ticketId}/status`, {
      method: 'PATCH',
      body: {
        status: 'closed',
        comment: draft.review.trim() || 'Работа принята. Претензий нет.',
        resident_rating: Number(draft.rating || 5)
      }
    })
    closeAcceptanceComposer(ticketId)
    pendingAcceptanceTicketId.value = null
    acceptMessage.value = ''
    showToast('Работа принята, отзыв сохранён')
    await fetchTickets()
  } catch (e) {
    acceptError.value = e?.data?.detail || e?.message || 'Не удалось принять работу'
  } finally {
    acceptSubmitting.value = false
  }
}

const confirmAcceptance = () => {
  if (!pendingAcceptanceTicketId.value) return
  submitAcceptance(pendingAcceptanceTicketId.value)
}

let unsubscribeLiveUpdates = null

onMounted(async () => {
  syncBanState()
  await fetchTickets()
  unsubscribeLiveUpdates = liveUpdates.subscribe((payload) => {
    if (!payload || !['ticket', 'complaint', 'notification'].includes(payload.entity)) return
    if (payload.entity === 'ticket') applyTicketPayload(payload)
    if (payload.entity === 'complaint') applyComplaintPayload(payload)
    fetchTickets({ silent: true })
  })
  if (process.client) {
    refreshTimer = window.setInterval(() => {
      fetchTickets({ silent: true })
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
  clearFilePreviews()
})

watch([status, priority], fetchTickets)
watch(() => auth.user.value?.banned_until, syncBanState, { immediate: true })
</script>

<template>
  <AppPage :title="props.title" :subtitle="props.subtitle">
    <div v-if="canCreateExternalTicket" class="panel ticket-create-panel">
      <div class="ticket-create-panel__head">
        <div>
          <div class="section-title">Заявка от диспетчера</div>
          <div class="muted">Для случаев, когда житель обратился по телефону и не пользуется веб-версией или мобильным приложением.</div>
        </div>
        <button class="btn btn--primary" type="button" @click="createPanelOpen = !createPanelOpen">
          {{ createPanelOpen ? 'Скрыть форму' : 'Создать заявку' }}
        </button>
      </div>

      <div v-if="createPanelOpen" class="stack ticket-create-panel__body">
        <div class="muted-box">
          Фотографии и отзыв жителя для такой заявки не требуются.
        </div>
        <div class="muted-box">
          Уточните у обратившегося к Вам жителя детали возникшей проблемы: где возникла проблема, когда она была обнаружена, есть ли срочность. Обязательно узнайте номер квартиры жителя и его номер телефона.
        </div>

        <div class="form-grid">
          <label class="field">
            <span>Дом</span>
            <select v-model="staffCreateForm.house_id">
              <option value="">Выберите дом</option>
              <option v-for="house in houses" :key="house.id" :value="String(house.id)">{{ formatAddress(house) }}</option>
            </select>
          </label>
          <label class="field">
            <span>Квартира</span>
            <input v-model="staffCreateForm.apartment" type="text" placeholder="Например: 42" />
          </label>
          <label class="field">
            <span>Телефон жителя</span>
            <input v-model="staffCreateForm.external_contact_phone" type="text" :maxlength="CONTACT_PHONE_MAX_LENGTH" placeholder="+7..." @input="onStaffContactPhoneInput" />
          </label>
          <label class="field">
            <span>Вид проблемы</span>
            <select v-model="staffCreateForm.category_id">
              <option value="">Без категории</option>
              <option v-for="category in categories" :key="category.id" :value="String(category.id)">{{ category.name }}</option>
            </select>
          </label>
          <label class="field">
            <span>Где возникла проблема</span>
            <select v-model="staffCreateForm.place_category_id">
              <option value="">Не указано</option>
              <option v-for="category in placeCategories" :key="category.id" :value="String(category.id)">{{ category.name }}</option>
            </select>
          </label>
          <label class="field">
            <span>Приоритет</span>
            <select v-model="staffCreateForm.priority">
              <option v-for="item in priorityOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
            </select>
          </label>
          <label class="field field--span-2">
            <span>Проблема</span>
            <input v-model="staffCreateForm.title" type="text" placeholder="Кратко со слов жителя" />
          </label>
          <label class="field field--span-2">
            <span>Описание</span>
            <textarea
              v-model="staffCreateForm.description"
              class="textarea-autogrow"
              rows="3"
              placeholder="Что сообщил житель, где нужна помощь, дополнительные ориентиры"
              @input="autoGrowTextarea"
            />
          </label>
        </div>

        <div v-if="createError" class="alert alert--error">{{ createError }}</div>
        <button class="btn btn--primary" :disabled="createSubmitting" @click="submitExternalTicket">
          {{ createSubmitting ? 'Создаём...' : 'Создать заявку' }}
        </button>
      </div>
    </div>

    <div v-if="isResident" class="panel ticket-create-panel">
      <div class="ticket-create-panel__head">
        <div>
          <div class="section-title">Новая заявка</div>
        </div>
        <button class="btn btn--primary" type="button" @click="createPanelOpen = !createPanelOpen">
          {{ createPanelOpen ? 'Скрыть форму' : 'Создать новую заявку' }}
        </button>
      </div>

      <div v-if="createPanelOpen && banInfo.active" class="ban-state">
        <div class="ban-state__title">Создание заявки временно недоступно</div>
        <div v-if="banInfo.until" class="muted">Блокировка действует до {{ banInfo.until }}</div>
        <button class="btn btn--ghost btn--sm" type="button" @click="openAdminConversation">
          Связь с администратором
        </button>
      </div>

      <div v-else-if="createPanelOpen && !profileReady" class="muted-box">
        Для создания заявки в профиле жильца должны быть указаны дом и квартира.
      </div>

      <div v-else-if="createPanelOpen" class="stack ticket-create-panel__body">
        <div class="ticket-create-intro">
          <div class="ticket-create-intro__main">
            <strong>Опишите проблему как можно точнее</strong>
            <span>Чем понятнее заголовок, описание и фото, тем быстрее заявка попадёт в работу.</span>
          </div>
          <div class="ticket-create-intro__chips">
            <span class="pill">До 10 фото</span>
            <span class="pill">Дом и квартира уже привязаны</span>
            <span class="pill">Приоритет: {{ selectedPriorityMeta.label }}</span>
          </div>
        </div>

        <div class="muted-box">
          Обратите внимание, что вызов специалиста по проблеме, возникшей в Вашей квартире, может быть платным.
        </div>

        <div class="form-grid">
          <label class="field">
            <span>Категория</span>
            <select v-model="createForm.category_id">
              <option value="">Без категории</option>
              <option v-for="category in categories" :key="category.id" :value="String(category.id)">
                {{ category.name }}
              </option>
            </select>
          </label>

          <label class="field">
            <span>Где возникла проблема</span>
            <select v-model="createForm.place_category_id">
              <option value="">Не указано</option>
              <option v-for="category in placeCategories" :key="category.id" :value="String(category.id)">
                {{ category.name }}
              </option>
            </select>
          </label>

          <div class="field">
            <span>Приоритет</span>
            <div class="ticket-priority-current">
              <strong>{{ selectedPriorityMeta.label }}</strong>
              <span>{{ selectedPriorityMeta.hint }}</span>
            </div>
          </div>

          <div class="field field--span-2">
            <span>Выбор приоритета</span>
            <div class="ticket-priority-grid">
              <button
                v-for="item in priorityOptions"
                :key="item.value"
                type="button"
                class="ticket-priority-card"
                :class="[
                  `ticket-priority-card--${item.accent}`,
                  { 'ticket-priority-card--active': createForm.priority === item.value }
                ]"
                @click="createForm.priority = item.value"
              >
                <strong>{{ item.label }}</strong>
                <span>{{ item.hint }}</span>
              </button>
            </div>
          </div>

          <label class="field field--span-2">
            <span>Заголовок</span>
            <input v-model="createForm.title" type="text" placeholder="Кратко опишите проблему" />
          </label>

          <label class="field field--span-2">
            <span>Описание</span>
            <textarea v-model="createForm.description" placeholder="Что произошло и где именно нужна помощь" />
          </label>

          <label class="checkbox field--span-2 ticket-phone-visibility">
            <input v-model="createForm.show_contact_phone" type="checkbox" />
            <span>Отображать мой номер телефона в заявке</span>
          </label>

          <label class="field field--span-2">
            <span>Фотографии</span>
            <div class="ticket-upload-box">
              <div class="ticket-upload-box__hint">
                <strong>Добавьте фото проблемы</strong>
                <span>Можно прикрепить до 10 изображений. Нажмите на крестик в правом верхнем углу превью, чтобы убрать лишнее.</span>
              </div>
              <input ref="fileInputRef" type="file" accept="image/*" capture="environment" multiple @change="onFileChange" />
            </div>
          </label>
        </div>

        <div v-if="filePreviews.length" class="ticket-files-preview-grid">
          <div
            v-for="(file, index) in filePreviews"
            :key="file.id"
            class="ticket-file-preview"
          >
            <img v-if="file.url" :src="file.url" :alt="file.name" class="ticket-file-preview__image" />
            <button
              type="button"
              class="ticket-file-preview__remove"
              @click="removeSelectedFile(index)"
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

        <div v-if="createError" class="alert alert--error">{{ createError }}</div>
        <button class="btn btn--primary" :disabled="createSubmitting" @click="submitTicket">
          {{ createSubmitting ? 'Отправляем...' : 'Создать заявку' }}
        </button>
      </div>
    </div>

    <div class="panel">
      <div class="toolbar">
        <label class="field">
          <span>Статус</span>
          <select v-model="status">
            <option value="">Все статусы</option>
            <option value="created">Создана</option>
            <option value="assigned">Назначена</option>
            <option value="in_progress">В работе</option>
            <option value="done">Выполнена</option>
            <option value="closed">Принята жителем</option>
            <option value="canceled">Отменена</option>
          </select>
        </label>
        <label class="field">
          <span>Приоритет</span>
          <select v-model="priority">
            <option value="">Все приоритеты</option>
            <option v-for="item in priorityOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
          </select>
        </label>
        <button class="btn btn--ghost" type="button" @click="fetchTickets">Обновить</button>
      </div>
    </div>

    <div v-if="complaintError" class="alert alert--error">{{ complaintError }}</div>
    <div v-if="acceptError" class="alert alert--error">{{ acceptError }}</div>

    <div class="panel">
      <div v-if="loading">Загрузка...</div>
      <div v-else-if="!tickets.length" class="empty-box">{{ props.emptyText }}</div>
      <div v-else class="stack">
        <div v-for="ticket in tickets" :key="ticket.id" class="ticket-with-actions">
          <div
            class="ticket-card ticket-card--interactive"
            :class="ticketCardClass(ticket)"
            role="button"
            tabindex="0"
            @click="openTicketPage(ticket.id)"
            @keydown.enter.prevent="openTicketPage(ticket.id)"
            @keydown.space.prevent="openTicketPage(ticket.id)"
          >
            <div class="ticket-card__head">
              <div>
                <h3>{{ ticket.title }}</h3>
                <div class="ticket-card__status">{{ ticket.status_label || formatTicketStatus(ticket.status) }}</div>
              </div>
              <div class="ticket-card__top-meta">
                <span v-if="hasOpenComplaint(ticket.id)" class="ticket-card__flag-wrap">
                  <span class="ticket-card__flag" aria-label="По заявке есть открытая жалоба">!</span>
                  <span class="ticket-card__flag-tooltip">
                    По заявке есть открытая жалоба. Откройте карточку, чтобы посмотреть детали обращения.
                  </span>
                </span>
                <span v-if="isTicketUnread(ticket.id)" class="ticket-card__unread">Новая</span>
                <div class="ticket-card__date">{{ formatDate(ticket.created_at) }}</div>
              </div>
            </div>

            <p class="ticket-card__desc">{{ ticket.description || 'Без описания' }}</p>

            <div class="ticket-card__meta">
              <span>Категория: {{ categoryLabel(ticket) }}</span>
              <span>Где: {{ placeCategoryLabel(ticket) }}</span>
              <span>Приоритет: {{ formatTicketPriority(ticket.priority) }}</span>
              <span>Дом: {{ formatAddress(ticket.house) }}</span>
              <span v-if="ticket.apartment_ref?.entrance_number">Подъезд: {{ ticket.apartment_ref.entrance_number }}</span>
              <span>Кв.: {{ ticket.apartment || ticket.apartment_id || '—' }}</span>
              <span v-if="ticket.is_external_request">По звонку: {{ ticket.external_contact_phone || 'телефон не указан' }}</span>
              <span>Исполнитель: {{ ticket.executor?.full_name || 'не назначен' }}</span>
            </div>

            <div v-if="extractExecutorComment(ticket.result_comment)" class="muted-box">
              <strong>Комментарий исполнителя:</strong> {{ extractExecutorComment(ticket.result_comment) }}
            </div>

            <div v-if="extractResidentReview(ticket.result_comment)" class="muted-box">
              <strong>Отзыв жителя:</strong> {{ extractResidentReview(ticket.result_comment) }}
              <span v-if="ticket.resident_rating" class="executor-rating-pill">Оценка: {{ ticket.resident_rating }} / 5</span>
            </div>
            <div class="ticket-card__footer">
              <span class="ticket-card__open-hint">Открыть детали, фото и историю</span>
            </div>
            <div class="ticket-card__actions ticket-card__actions--inline">
              <button
                v-if="canOpenAssignModal(ticket)"
                class="btn btn--ghost"
                type="button"
                @click.stop="openAssignModal(ticket.id)"
              >
                Назначить исполнителя
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </AppPage>
  <AssignExecutorModal
    :open="Boolean(assignModalTicketId)"
    :ticket-id="assignModalTicketId"
    @close="closeAssignModal"
    @assigned="fetchTickets"
  />
</template>
