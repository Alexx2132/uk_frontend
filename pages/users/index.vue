<script setup>
definePageMeta({ middleware: 'auth' })

import { formatAddress, formatDateTimeInputValue, formatRole, formatSpecialty, formatTicketPriority, parseApiDate } from '~/utils/format'
import { validateContactPhone } from '~/utils/phone'

const auth = useAuth()
const api = useApi()
const { showToast } = useToast()

const users = ref([])
const houses = ref([])
const specialties = ref([])
const executorProfiles = ref([])
const loading = ref(true)
const role = ref('')
const userSearch = ref('')
const userStrictSearch = ref(false)
const residentHouseFilter = ref('')
const message = ref('')
const error = ref('')
const createFormOpen = ref(false)
const createFormRef = ref(null)
const activeBanEditorId = ref(null)
const activeDispatcherPermissionsUserId = ref(null)
const activeAssistantPermissionsUserId = ref(null)
const activeExecutorSettingsUserId = ref(null)
const activeHistoryUserId = ref(null)
const userHistory = ref([])
const userHistoryLoading = ref(false)
const executorSchedulesOpen = ref(false)
const executorScheduleSearch = ref('')
const executorScheduleStrictSearch = ref(false)
const registrationRequestsOpen = ref(false)
const registrationRequests = ref([])
const registrationRequestsLoading = ref(false)
const registrationStatusFilter = ref('open')
const registrationUnreadCount = ref(0)
const registrationDecisionTarget = ref(null)
const registrationDecisionMode = ref('')
const registrationDecisionComment = ref('')
const registrationTemporaryPassword = ref('')
const registrationApproveResult = ref(null)
const registrationProcessing = ref(false)
const pendingUserSettingsSave = ref(null)
const pendingUnbanUser = ref(null)
const banDrafts = reactive({})
const dispatcherDrafts = reactive({})
const dispatcherPanels = reactive({})
const assistantDrafts = reactive({})
const assistantPanels = reactive({})
const executorDrafts = reactive({})
const executorProfileDrafts = reactive({})
const executorPanels = reactive({})
const executorSavingId = ref(null)
const executorProfileSavingId = ref(null)
const DEFAULT_BAN_REASON = 'Создание заявок с Вашего аккаунта временно ограничено. Вы можете просматривать информацию в сервисе, но отправка новых заявок недоступна до окончания блокировки.'
const DISPATCHER_PRIORITY_VALUES = ['low', 'normal', 'high', 'emergency']
const dispatcherPriorityOptions = DISPATCHER_PRIORITY_VALUES.map((value) => ({
  value,
  label: formatTicketPriority(value)
}))
const strictSearchHint = 'При включении строгого поиска будут показаны только точные совпадения с введённым значением.'
const MIN_BAN_MINUTES = 2
const DEFAULT_TEMPORARY_PASSWORD = 'pass123'
const hasCyrillic = (value) => /[А-Яа-яЁё]/.test(String(value || ''))
const hasWhitespace = (value) => /\s/.test(String(value || ''))

const weekdayOptions = [
  { value: 0, label: 'Понедельник' },
  { value: 1, label: 'Вторник' },
  { value: 2, label: 'Среда' },
  { value: 3, label: 'Четверг' },
  { value: 4, label: 'Пятница' },
  { value: 5, label: 'Суббота' },
  { value: 6, label: 'Воскресенье' }
]

const pageTitle = computed(() => auth.hasRole('admin') ? 'Пользователи' : 'Жители и диспетчеры')
const pageSubtitle = computed(() => auth.hasRole('admin')
  ? 'Управление ролями, скрытыми полномочиями диспетчеров, графиками мастеров и блокировкой жильцов.'
  : 'Просмотр жильцов и диспетчеров, а также блокировка жильцов в рамках ваших полномочий.')
const displayedPageSubtitle = computed(() => pageSubtitle.value.replace('скрытыми ', ''))

const roleOptions = computed(() => {
  const base = [{ value: '', label: 'Все роли' }]
  const allowed = auth.hasRole('admin')
    ? ['admin_assistant', 'dispatcher', 'executor', 'auditor', 'resident']
    : auth.hasRole('admin_assistant')
      ? ['dispatcher', 'executor', 'auditor', 'resident']
    : ['dispatcher', 'resident']

  return base.concat(allowed.map((value) => ({
    value,
    label: formatRole(value)
  })))
})

const filteredUsers = computed(() => {
  const query = normalizeSearch(userSearch.value)
  return users.value.filter((user) => {
    if (role.value && user.role !== role.value) return false
    if (role.value === 'resident' && residentHouseFilter.value && Number(user.house_id) !== Number(residentHouseFilter.value)) return false
    if (!query) return true

    const fields = [
      user.full_name,
      userLogin(user),
      user.phone,
      user.contact_phone
    ].map(normalizeSearch).filter(Boolean)

    return userStrictSearch.value
      ? fields.some((field) => field === query)
      : fields.some((field) => field.includes(query))
  })
})

const pendingUnbanUserName = computed(() => pendingUnbanUser.value ? (pendingUnbanUser.value.full_name || userLogin(pendingUnbanUser.value)) : '')
const historyFieldLabel = (fieldName) => ({
  login: 'Логин',
  full_name: 'Имя',
  contact_phone: 'Телефон'
}[fieldName] || fieldName)

const executorProfileMap = computed(() => {
  return executorProfiles.value.reduce((acc, item) => {
    acc[item.user_id] = item
    return acc
  }, {})
})

const activeDispatcherPermissionsUser = computed(() => users.value.find((user) => Number(user.id) === Number(activeDispatcherPermissionsUserId.value)) || null)
const activeAssistantPermissionsUser = computed(() => users.value.find((user) => Number(user.id) === Number(activeAssistantPermissionsUserId.value)) || null)
const activeExecutorSettingsUser = computed(() => users.value.find((user) => Number(user.id) === Number(activeExecutorSettingsUserId.value)) || null)
const activeBanUser = computed(() => users.value.find((user) => Number(user.id) === Number(activeBanEditorId.value)) || null)
const activeHistoryUser = computed(() => users.value.find((user) => Number(user.id) === Number(activeHistoryUserId.value)) || null)
const executorUsers = computed(() => users.value.filter((user) => user.role === 'executor'))
const filteredExecutorScheduleUsers = computed(() => {
  const query = normalizeSearch(executorScheduleSearch.value)
  if (!query) return executorUsers.value

  return executorUsers.value.filter((user) => {
    const profile = executorProfileForUser(user)
    const fields = [
      user.full_name,
      userLogin(user),
      userContactPhone(user),
      executorSpecialtySummary(profile, user),
      executorHouseSummary(profile),
      scheduleSummary(executorDrafts[user.id])
    ].map(normalizeSearch).filter(Boolean)

    return executorScheduleStrictSearch.value
      ? fields.some((field) => field === query)
      : fields.some((field) => field.includes(query))
  })
})
const userSettingsSaveQuestion = computed(() => {
  const pending = pendingUserSettingsSave.value
  if (!pending?.user) return ''
  if (pending.type === 'dispatcher') return `Сохранить изменения полномочий диспетчера «${pending.user.full_name}»?`
  if (pending.type === 'assistant') return `Сохранить изменения полномочий помощника администратора «${pending.user.full_name}»?`
  if (pending.type === 'executor-profile') return `Сохранить специализации и привязку к дому для исполнителя «${pending.user.full_name}»?`
  if (pending.type === 'executor-schedule') return `Сохранить рабочий график исполнителя «${pending.user.full_name}»?`
  return 'Сохранить изменения?'
})

const canCreateUsers = computed(() => auth.hasRole('admin') || (auth.hasRole('admin_assistant') && Boolean(auth.user.value?.can_create_users)))
const canEditDispatcherPermissions = computed(() => auth.hasRole('admin'))
const canEditAssistantPermissions = computed(() => auth.hasRole('admin'))
const canEditExecutorProfiles = computed(() => auth.hasRole('admin') || (auth.hasRole('admin_assistant') && Boolean(auth.user.value?.can_manage_executor_schedules)))
const canEditExecutorSchedules = computed(() => auth.hasRole('admin') || (auth.hasRole('admin_assistant') && Boolean(auth.user.value?.can_manage_executor_schedules)))
const canBanResidents = computed(() => auth.hasRole('admin') || ((auth.hasRole('dispatcher') || auth.hasRole('admin_assistant')) && Boolean(auth.user.value?.can_ban_residents)))
const canApproveRegistrations = computed(() => auth.hasRole('admin') || (auth.hasRole('admin_assistant') && Boolean(auth.user.value?.can_approve_registrations)))

const canManageBan = (user) => user.role === 'resident' && canBanResidents.value
const isBanned = (user) => Boolean(user.banned_until)
const normalizeSearch = (value) => String(value || '').trim().toLowerCase()
const parseAllowedPriorities = (value) => {
  const items = String(value || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => DISPATCHER_PRIORITY_VALUES.includes(item))
  return items.length ? [...new Set(items)] : [...DISPATCHER_PRIORITY_VALUES]
}
const serializeAllowedPriorities = (values) => {
  const selected = (Array.isArray(values) ? values : [])
    .map((item) => String(item).trim().toLowerCase())
    .filter((item) => DISPATCHER_PRIORITY_VALUES.includes(item))
  const unique = [...new Set(selected)]
  return unique.length === DISPATCHER_PRIORITY_VALUES.length ? null : unique.join(',')
}
const userLogin = (user) => user.login || user.phone || user.username || '—'
const userContactPhone = (user) => user.contact_phone || '—'
const houseLabel = (houseId) => formatAddress(houses.value.find((house) => Number(house.id) === Number(houseId)))
const specialtyLabelById = (specialtyId) => {
  const item = specialties.value.find((specialty) => Number(specialty.id) === Number(specialtyId))
  return item ? formatSpecialty(item.name || item.code) : 'Специализация'
}
const specialtyIdByCode = (code) => specialties.value.find((specialty) => String(specialty.code || '').toLowerCase() === String(code || '').toLowerCase())?.id || null

const executorPrimarySpecialty = (profile, user) => {
  const primary = profile?.specialties?.find((item) => item.is_primary)
  const raw = primary?.specialty?.name || primary?.specialty?.code || profile?.specialties?.[0]?.specialty?.name || profile?.specialties?.[0]?.specialty?.code || user?.specialty
  return formatSpecialty(raw)
}

const executorSpecialtySummary = (profile, user) => {
  const items = (profile?.specialties || [])
    .map((item) => item?.specialty?.name || item?.specialty?.code)
    .filter(Boolean)
  if (!items.length && user?.specialty) return formatSpecialty(user.specialty)
  if (!items.length) return 'Не настроены'
  return items.map((item) => formatSpecialty(item)).join(', ')
}

const executorHouseSummary = (profile) => {
  if (!profile?.house_id) return 'Без привязки, может работать по любому дому'
  return profile.house ? formatAddress(profile.house) : houseLabel(profile.house_id)
}

const defaultSchedules = () => weekdayOptions.map((option) => ({
  weekday: option.value,
  work_start: '09:00',
  work_end: '18:00',
  is_active: option.value < 5
}))

const scheduleSummary = (schedules = []) => {
  const active = (schedules || []).filter((item) => item.is_active)
  if (!active.length) return 'Не назначен'
  return active
    .map((item) => `${weekdayOptions.find((option) => option.value === Number(item.weekday))?.label || item.weekday}: ${String(item.work_start || '').slice(0, 5)} - ${String(item.work_end || '').slice(0, 5)}`)
    .join(', ')
}

const makeExecutorDraft = (profile) => {
  const source = profile?.work_schedules?.length ? profile.work_schedules : defaultSchedules()
  return weekdayOptions.map((option) => {
    const current = source.find((item) => Number(item.weekday) === option.value)
    return {
      weekday: option.value,
      work_start: String(current?.work_start || '09:00').slice(0, 5),
      work_end: String(current?.work_end || '18:00').slice(0, 5),
      is_active: current?.is_active ?? false
    }
  })
}

const makeExecutorProfileDraft = (profile, user) => {
  const ids = (profile?.specialties || [])
    .map((item) => Number(item.specialty_id))
    .filter(Boolean)
  const fallbackSpecialtyId = !ids.length ? specialtyIdByCode(user?.specialty) : null
  const specialtyIds = fallbackSpecialtyId ? [fallbackSpecialtyId] : ids
  const primary = profile?.specialties?.find((item) => item.is_primary)?.specialty_id || specialtyIds[0] || ''

  return {
    house_id: profile?.house_id ? String(profile.house_id) : '',
    specialty_ids: specialtyIds.map((id) => String(id)),
    primary_specialty_id: primary ? String(primary) : ''
  }
}

const selectedExecutorSpecialties = (user) => {
  return executorProfileDrafts[user.id]?.specialty_ids || []
}

const toggleExecutorSpecialty = (user, specialtyId) => {
  const draft = executorProfileDrafts[user.id]
  if (!draft) return

  const id = String(specialtyId)
  const current = new Set(draft.specialty_ids || [])
  if (current.has(id)) current.delete(id)
  else current.add(id)

  draft.specialty_ids = Array.from(current)
  if (!draft.specialty_ids.includes(String(draft.primary_specialty_id))) {
    draft.primary_specialty_id = draft.specialty_ids[0] || ''
  }
}

const createDefaultBanUntil = () => {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  date.setSeconds(0, 0)
  return formatDateTimeInputValue(date)
}

const formatBanUntil = (value) => {
  if (!value) return ''
  const date = parseApiDate(value)
  if (!date || Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(date)
}

const syncDrafts = (items) => {
  const actualIds = new Set(items.map((user) => String(user.id)))

  for (const key of Object.keys(banDrafts)) {
    if (!actualIds.has(key)) delete banDrafts[key]
  }
  for (const key of Object.keys(dispatcherDrafts)) {
    if (!actualIds.has(key)) delete dispatcherDrafts[key]
  }
  for (const key of Object.keys(dispatcherPanels)) {
    if (!actualIds.has(key)) delete dispatcherPanels[key]
  }
  for (const key of Object.keys(assistantDrafts)) {
    if (!actualIds.has(key)) delete assistantDrafts[key]
  }
  for (const key of Object.keys(assistantPanels)) {
    if (!actualIds.has(key)) delete assistantPanels[key]
  }
  for (const key of Object.keys(executorDrafts)) {
    if (!actualIds.has(key)) delete executorDrafts[key]
  }
  for (const key of Object.keys(executorProfileDrafts)) {
    if (!actualIds.has(key)) delete executorProfileDrafts[key]
  }
  for (const key of Object.keys(executorPanels)) {
    if (!actualIds.has(key)) delete executorPanels[key]
  }

  for (const user of items) {
    if (user.role === 'resident') {
      banDrafts[user.id] = {
        untilLocal: user.banned_until ? formatDateTimeInputValue(user.banned_until) : createDefaultBanUntil(),
        reason: user.ban_reason || DEFAULT_BAN_REASON
      }
    }

    if (user.role === 'dispatcher') {
      dispatcherDrafts[user.id] = {
        can_manage_houses: Boolean(user.can_manage_houses),
        can_ban_residents: Boolean(user.can_ban_residents),
        allowed_ticket_priorities: parseAllowedPriorities(user.allowed_ticket_priorities)
      }
      if (!(user.id in dispatcherPanels)) {
        dispatcherPanels[user.id] = false
      }
    }

    if (user.role === 'admin_assistant') {
      assistantDrafts[user.id] = {
        can_manage_houses: Boolean(user.can_manage_houses),
        can_ban_residents: Boolean(user.can_ban_residents),
        can_create_users: Boolean(user.can_create_users),
        can_manage_executor_schedules: Boolean(user.can_manage_executor_schedules),
        can_manage_service_settings: Boolean(user.can_manage_service_settings),
        can_manage_remarks: Boolean(user.can_manage_remarks),
        can_manage_house_info: Boolean(user.can_manage_house_info),
        can_manage_announcements: Boolean(user.can_manage_announcements),
        can_manage_password_recovery: Boolean(user.can_manage_password_recovery),
        can_approve_registrations: Boolean(user.can_approve_registrations)
      }
      if (!(user.id in assistantPanels)) {
        assistantPanels[user.id] = false
      }
    }

    if (user.role === 'executor') {
      const profile = executorProfileMap.value[user.id]
      executorDrafts[user.id] = makeExecutorDraft(profile)
      executorProfileDrafts[user.id] = makeExecutorProfileDraft(profile, user)
      if (!(user.id in executorPanels)) {
        executorPanels[user.id] = false
      }
    }
  }
}

const toggleDispatcherPanel = (userId) => {
  dispatcherPanels[userId] = !dispatcherPanels[userId]
}

const toggleAssistantPanel = (userId) => {
  assistantPanels[userId] = !assistantPanels[userId]
}

const toggleExecutorPanel = (userId) => {
  executorPanels[userId] = !executorPanels[userId]
}

const openDispatcherPermissions = (user) => {
  activeDispatcherPermissionsUserId.value = user.id
}

const openAssistantPermissions = (user) => {
  activeAssistantPermissionsUserId.value = user.id
}

const openExecutorSettings = (user) => {
  activeExecutorSettingsUserId.value = user.id
}

const closeUserModals = () => {
  activeDispatcherPermissionsUserId.value = null
  activeAssistantPermissionsUserId.value = null
  activeExecutorSettingsUserId.value = null
  activeHistoryUserId.value = null
}

const openUserHistory = async (user) => {
  if (!auth.hasRole('admin') || !user?.id) return
  activeHistoryUserId.value = user.id
  userHistory.value = []
  userHistoryLoading.value = true
  try {
    userHistory.value = await api.request(`/users/${user.id}/history`)
  } catch (e) {
    showToast(e?.data?.detail || e?.message || 'Не удалось загрузить историю изменений пользователя', { type: 'error' })
    activeHistoryUserId.value = null
  } finally {
    userHistoryLoading.value = false
  }
}

const closeUserHistory = () => {
  activeHistoryUserId.value = null
  userHistory.value = []
}

const requestUserSettingsSave = (type, user) => {
  if (type === 'dispatcher' && !dispatcherDrafts[user.id]?.allowed_ticket_priorities?.length) {
    error.value = 'Выберите хотя бы один приоритет заявок для диспетчера'
    showToast(error.value, { type: 'error' })
    return
  }
  pendingUserSettingsSave.value = { type, user }
}

const closeUserSettingsSave = () => {
  if (executorSavingId.value || executorProfileSavingId.value) return
  pendingUserSettingsSave.value = null
}

const confirmUserSettingsSave = async () => {
  const pending = pendingUserSettingsSave.value
  if (!pending?.user) return
  pendingUserSettingsSave.value = null
  if (pending.type === 'dispatcher') {
    await saveDispatcherPermissions(pending.user)
    activeDispatcherPermissionsUserId.value = null
    return
  }
  if (pending.type === 'assistant') {
    await saveAssistantPermissions(pending.user)
    activeAssistantPermissionsUserId.value = null
    return
  }
  if (pending.type === 'executor-profile') {
    await saveExecutorProfileSettings(pending.user)
    activeExecutorSettingsUserId.value = null
    return
  }
  if (pending.type === 'executor-schedule') {
    await saveExecutorSchedule(pending.user)
  }
}

const openBanEditor = (user) => {
  banDrafts[user.id] = {
    untilLocal: user.banned_until ? formatDateTimeInputValue(user.banned_until) : createDefaultBanUntil(),
    reason: user.ban_reason || DEFAULT_BAN_REASON
  }
  activeBanEditorId.value = user.id
}

const closeBanEditor = () => {
  activeBanEditorId.value = null
}

const isBanEditorOpen = (user) => activeBanEditorId.value === user.id
const executorProfileForUser = (user) => executorProfileMap.value[user.id] || null

const fetchUsers = async () => {
  loading.value = true
  error.value = ''
  try {
    users.value = await api.request('/users/', { query: { skip: 0, limit: 500 } })
    syncDrafts(users.value)
  } catch (e) {
    users.value = []
    syncDrafts([])
    error.value = e?.data?.detail || e?.message || 'Не удалось загрузить пользователей'
  } finally {
    loading.value = false
  }
}

const fetchHouses = async () => {
  try {
    houses.value = await api.request('/houses/')
  } catch {
    houses.value = []
  }
}

const fetchSpecialties = async () => {
  if (!canEditExecutorProfiles.value) {
    specialties.value = []
    return
  }

  try {
    specialties.value = await api.request('/executors/specialties')
  } catch {
    specialties.value = []
  } finally {
    syncDrafts(users.value)
  }
}

const fetchExecutors = async () => {
  if (!canEditExecutorProfiles.value) {
    executorProfiles.value = []
    return
  }

  try {
    executorProfiles.value = await api.request('/executors/', { query: { active_only: false } })
  } catch {
    executorProfiles.value = []
  } finally {
    syncDrafts(users.value)
  }
}

const reloadAll = async () => {
  await Promise.all([fetchUsers(), fetchHouses(), fetchSpecialties(), fetchExecutors(), fetchRegistrationUnreadCount()])
}

const fetchRegistrationUnreadCount = async () => {
  if (!canApproveRegistrations.value) {
    registrationUnreadCount.value = 0
    return
  }
  try {
    const notifications = await api.request('/notifications/', {
      query: { unread_only: true, skip: 0, limit: 200 }
    })
    registrationUnreadCount.value = Array.isArray(notifications)
      ? notifications.filter((item) => String(item?.notif_type || '') === 'registration_request').length
      : 0
  } catch {
    registrationUnreadCount.value = 0
  }
}

const markRegistrationNotificationsRead = async () => {
  try {
    const notifications = await api.request('/notifications/', {
      query: { unread_only: true, skip: 0, limit: 200 }
    })
    const targets = Array.isArray(notifications)
      ? notifications.filter((item) => String(item?.notif_type || '') === 'registration_request')
      : []
    await Promise.allSettled(targets.map((notification) => api.request(`/notifications/${notification.id}/read`, { method: 'PATCH' })))
    registrationUnreadCount.value = 0
    window.dispatchEvent(new CustomEvent('uk-notifications-updated'))
  } catch {}
}

const loadRegistrationRequests = async () => {
  if (!canApproveRegistrations.value) return
  registrationRequestsLoading.value = true
  try {
    registrationRequests.value = await api.request('/registration/requests', {
      query: {
        status: registrationStatusFilter.value || undefined,
        skip: 0,
        limit: 200
      }
    })
  } catch (e) {
    showToast(e?.data?.detail || e?.message || 'Не удалось загрузить заявки на регистрацию', { type: 'error' })
  } finally {
    registrationRequestsLoading.value = false
  }
}

const openRegistrationRequests = async () => {
  registrationRequestsOpen.value = true
  await Promise.all([loadRegistrationRequests(), markRegistrationNotificationsRead()])
}

const closeRegistrationRequests = () => {
  registrationRequestsOpen.value = false
  registrationDecisionTarget.value = null
  registrationDecisionMode.value = ''
  registrationDecisionComment.value = ''
  registrationTemporaryPassword.value = ''
  registrationApproveResult.value = null
}

const registrationStatusLabel = (status) => ({
  open: 'Ожидает решения',
  approved: 'Одобрена',
  rejected: 'Отклонена'
}[String(status || '').toLowerCase()] || status || 'Неизвестно')

const registrationStatusClass = (status) => ({
  open: 'access-status--open',
  approved: 'access-status--reset',
  rejected: 'access-status--rejected'
}[String(status || '').toLowerCase()] || 'access-status--open')

const registrationAddress = (request) => {
  return [request?.house_address, request?.apartment ? `кв. ${request.apartment}` : ''].filter(Boolean).join(', ') || 'Адрес не указан'
}

const openRegistrationDecision = (request, mode) => {
  registrationDecisionTarget.value = request
  registrationDecisionMode.value = mode
  registrationDecisionComment.value = ''
  registrationTemporaryPassword.value = ''
  registrationApproveResult.value = null
}

const closeRegistrationDecision = () => {
  registrationDecisionTarget.value = null
  registrationDecisionMode.value = ''
  registrationDecisionComment.value = ''
  registrationTemporaryPassword.value = ''
  registrationApproveResult.value = null
}

const approveRegistrationRequest = async () => {
  if (!registrationDecisionTarget.value?.id) return
  const temporaryPassword = registrationTemporaryPassword.value.trim() || DEFAULT_TEMPORARY_PASSWORD
  if (temporaryPassword.length < 3) {
    showToast('Пароль должен содержать не менее 3 символов', { type: 'error' })
    return
  }
  registrationProcessing.value = true
  try {
    const payload = await api.request(`/registration/requests/${registrationDecisionTarget.value.id}/approve`, {
      method: 'POST',
      body: {
        temporary_password: temporaryPassword,
        admin_comment: registrationDecisionComment.value.trim() || null
      }
    })
    registrationApproveResult.value = payload
    showToast('Житель зарегистрирован')
    await Promise.all([loadRegistrationRequests(), fetchUsers()])
  } catch (e) {
    showToast(e?.data?.detail || e?.message || 'Не удалось одобрить регистрацию', { type: 'error' })
  } finally {
    registrationProcessing.value = false
  }
}

const rejectRegistrationRequest = async () => {
  if (!registrationDecisionTarget.value?.id) return
  registrationProcessing.value = true
  try {
    await api.request(`/registration/requests/${registrationDecisionTarget.value.id}/reject`, {
      method: 'POST',
      body: { admin_comment: registrationDecisionComment.value.trim() || null }
    })
    showToast('Заявка на регистрацию отклонена')
    closeRegistrationDecision()
    await loadRegistrationRequests()
  } catch (e) {
    showToast(e?.data?.detail || e?.message || 'Не удалось отклонить регистрацию', { type: 'error' })
  } finally {
    registrationProcessing.value = false
  }
}

watch(registrationStatusFilter, () => {
  if (registrationRequestsOpen.value) {
    loadRegistrationRequests()
  }
})

const splitExecutorName = (fullName) => {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) {
    return { first_name: 'Исполнитель', last_name: '', middle_name: null }
  }
  if (parts.length === 1) {
    return { first_name: parts[0], last_name: '', middle_name: null }
  }
  return {
    last_name: parts[0],
    first_name: parts[1],
    middle_name: parts.slice(2).join(' ') || null
  }
}

const createUser = async (payload) => {
  if (!canCreateUsers.value) return

  message.value = ''
  error.value = ''
  try {
    const fullName = String(payload.full_name || '').trim()
    const login = String(payload.phone || '').trim()
    const password = String(payload.password || '').trim()
    const contactPhoneValidation = validateContactPhone(payload.contact_phone, { required: payload.role === 'resident' })
    if (!contactPhoneValidation.ok) throw new Error(contactPhoneValidation.error)
    const contactPhone = contactPhoneValidation.value

    if (!fullName) throw new Error('Введите имя пользователя')
    if (!login) throw new Error('Введите логин')
    if (hasWhitespace(login)) throw new Error('Логин не должен содержать пробелы')
    if (hasCyrillic(login)) throw new Error('Логин должен быть указан латинскими символами, цифрами или знаками')
    if (!password) throw new Error('Введите пароль')
    if (password.length < 3) throw new Error('Пароль должен содержать не менее 3 символов')
    if (hasCyrillic(password)) throw new Error('Пароль не должен содержать русские буквы')
    if (payload.role === 'resident' && !payload.house_id) throw new Error('Выберите дом жителя')
    if (payload.role === 'resident' && !String(payload.apartment || '').trim()) throw new Error('Укажите квартиру жителя')

    if (payload.role === 'executor') {
      const specialtyIds = (payload.specialty_ids || []).map((id) => Number(id)).filter(Boolean)
      if (!specialtyIds.length) throw new Error('Выберите хотя бы одну специализацию исполнителя')
      const primaryId = specialtyIds.includes(Number(payload.primary_specialty_id))
        ? Number(payload.primary_specialty_id)
        : (specialtyIds[0] || null)
      await api.request('/executors/', {
        method: 'POST',
        body: {
          ...splitExecutorName(fullName),
          login,
          password,
          phone: contactPhone || null,
          notes: null,
          house_id: payload.house_id ? Number(payload.house_id) : null,
          is_active: true,
          specialty_ids: specialtyIds,
          primary_specialty_id: primaryId
        }
      })
    } else {
      await api.request('/users/', {
        method: 'POST',
        body: {
          full_name: fullName,
          login,
          password,
          role: payload.role,
          phone: login,
          contact_phone: contactPhone || null,
          can_manage_houses: ['dispatcher', 'admin_assistant'].includes(payload.role) ? Boolean(payload.can_manage_houses) : false,
          can_ban_residents: ['dispatcher', 'admin_assistant'].includes(payload.role) ? Boolean(payload.can_ban_residents) : false,
          allowed_ticket_priorities: payload.role === 'dispatcher' ? serializeAllowedPriorities(payload.allowed_ticket_priorities) : null,
          can_create_users: payload.role === 'admin_assistant' ? Boolean(payload.can_create_users) : false,
          can_manage_executor_schedules: payload.role === 'admin_assistant' ? Boolean(payload.can_manage_executor_schedules) : false,
          can_manage_service_settings: payload.role === 'admin_assistant' ? Boolean(payload.can_manage_service_settings) : false,
          can_manage_remarks: payload.role === 'admin_assistant' ? Boolean(payload.can_manage_remarks) : false,
          can_manage_house_info: payload.role === 'admin_assistant' ? Boolean(payload.can_manage_house_info) : false,
          can_manage_announcements: payload.role === 'admin_assistant' ? Boolean(payload.can_manage_announcements) : false,
          can_manage_password_recovery: payload.role === 'admin_assistant' ? Boolean(payload.can_manage_password_recovery) : false,
          can_approve_registrations: payload.role === 'admin_assistant' ? Boolean(payload.can_approve_registrations) : false,
          ...(payload.role === 'resident' && payload.house_id ? { house_id: Number(payload.house_id) } : {}),
          ...(payload.role === 'resident' && payload.apartment ? { apartment: payload.apartment } : {})
        }
      })
    }
    createFormRef.value?.reset()
    createFormOpen.value = false
    showToast('Пользователь создан')
    await reloadAll()
  } catch (e) {
    error.value = e?.data?.detail || e?.message || 'Не удалось создать пользователя'
    showToast(error.value, { type: 'error' })
  }
}

const saveBan = async (user) => {
  if (!canManageBan(user)) return
  const untilLocal = banDrafts[user.id]?.untilLocal
  if (!untilLocal) {
    error.value = 'Укажите дату и время блокировки'
    showToast(error.value, { type: 'error' })
    return
  }
  const untilDate = new Date(untilLocal)
  const minUntil = new Date(Date.now() + MIN_BAN_MINUTES * 60 * 1000)
  if (Number.isNaN(untilDate.getTime()) || untilDate < minUntil) {
    error.value = `Время блокировки должно быть не меньше ${MIN_BAN_MINUTES} минут от текущего момента`
    showToast(error.value, { type: 'error' })
    return
  }
  const reason = String(banDrafts[user.id]?.reason || '').trim() || DEFAULT_BAN_REASON
  message.value = ''
  error.value = ''
  try {
    await api.request(`/users/${user.id}/ban`, {
      method: 'POST',
      body: {
        banned_until: new Date(untilLocal).toISOString(),
        ban_reason: reason
      }
    })
    showToast(isBanned(user) ? 'Срок блокировки обновлён' : 'Житель заблокирован')
    closeBanEditor()
    await fetchUsers()
  } catch (e) {
    error.value = e?.data?.detail || e?.message || 'Не удалось сохранить блокировку'
    showToast(error.value, { type: 'error' })
  }
}

const clearBan = async (user) => {
  if (!canManageBan(user) || !isBanned(user)) return
  message.value = ''
  error.value = ''
  try {
    await api.request(`/users/${user.id}/ban`, {
      method: 'POST',
      body: { banned_until: null }
    })
    showToast('Блокировка снята')
    closeBanEditor()
    await fetchUsers()
  } catch (e) {
    error.value = e?.data?.detail || e?.message || 'Не удалось снять блокировку'
    showToast(error.value, { type: 'error' })
  }
}

const requestClearBan = (user) => {
  if (!canManageBan(user) || !isBanned(user)) return
  pendingUnbanUser.value = user
}

const closeClearBanConfirmation = () => {
  pendingUnbanUser.value = null
}

const confirmClearBan = async () => {
  const user = pendingUnbanUser.value
  if (!user) return
  await clearBan(user)
  pendingUnbanUser.value = null
}

const saveDispatcherPermissions = async (user) => {
  if (!canEditDispatcherPermissions.value || user.role !== 'dispatcher') return
  if (!dispatcherDrafts[user.id]?.allowed_ticket_priorities?.length) {
    error.value = 'Выберите хотя бы один приоритет заявок для диспетчера'
    showToast(error.value, { type: 'error' })
    return
  }

  message.value = ''
  error.value = ''
  try {
    await api.request(`/users/${user.id}`, {
      method: 'PATCH',
      body: {
        can_manage_houses: Boolean(dispatcherDrafts[user.id]?.can_manage_houses),
        can_ban_residents: Boolean(dispatcherDrafts[user.id]?.can_ban_residents),
        allowed_ticket_priorities: serializeAllowedPriorities(dispatcherDrafts[user.id]?.allowed_ticket_priorities)
      }
    })
    showToast(`Полномочия диспетчера «${user.full_name}» обновлены`)
    await fetchUsers()
  } catch (e) {
    error.value = e?.data?.detail || e?.message || 'Не удалось обновить полномочия диспетчера'
  }
}

const saveAssistantPermissions = async (user) => {
  if (!canEditAssistantPermissions.value || user.role !== 'admin_assistant') return

  message.value = ''
  error.value = ''
  try {
    await api.request(`/users/${user.id}`, {
      method: 'PATCH',
      body: {
        can_manage_houses: Boolean(assistantDrafts[user.id]?.can_manage_houses),
        can_ban_residents: Boolean(assistantDrafts[user.id]?.can_ban_residents),
        can_create_users: Boolean(assistantDrafts[user.id]?.can_create_users),
        can_manage_executor_schedules: Boolean(assistantDrafts[user.id]?.can_manage_executor_schedules),
        can_manage_service_settings: Boolean(assistantDrafts[user.id]?.can_manage_service_settings),
        can_manage_remarks: Boolean(assistantDrafts[user.id]?.can_manage_remarks),
        can_manage_house_info: Boolean(assistantDrafts[user.id]?.can_manage_house_info),
        can_manage_announcements: Boolean(assistantDrafts[user.id]?.can_manage_announcements),
        can_manage_password_recovery: Boolean(assistantDrafts[user.id]?.can_manage_password_recovery),
        can_approve_registrations: Boolean(assistantDrafts[user.id]?.can_approve_registrations)
      }
    })
    showToast(`Полномочия помощника «${user.full_name}» обновлены`)
    await fetchUsers()
  } catch (e) {
    error.value = e?.data?.detail || e?.message || 'Не удалось обновить полномочия помощника администратора'
  }
}

const saveExecutorProfileSettings = async (user) => {
  if (!canEditExecutorProfiles.value || user.role !== 'executor') return
  const profile = executorProfileForUser(user)
  if (!profile?.id) {
    error.value = 'Профиль исполнителя не найден'
    return
  }

  const draft = executorProfileDrafts[user.id]
  const specialtyIds = (draft?.specialty_ids || []).map((id) => Number(id)).filter(Boolean)
  const primaryId = specialtyIds.includes(Number(draft?.primary_specialty_id))
    ? Number(draft.primary_specialty_id)
    : (specialtyIds[0] || null)

  message.value = ''
  error.value = ''
  executorProfileSavingId.value = user.id
  try {
    await api.request(`/executors/${profile.id}`, {
      method: 'PATCH',
      body: {
        house_id: draft?.house_id ? Number(draft.house_id) : null,
        specialty_ids: specialtyIds,
        primary_specialty_id: primaryId
      }
    })
    showToast(`Настройки исполнителя «${user.full_name}» обновлены`)
    await Promise.all([fetchUsers(), fetchExecutors()])
  } catch (e) {
    error.value = e?.data?.detail || e?.message || 'Не удалось сохранить настройки исполнителя'
  } finally {
    executorProfileSavingId.value = null
  }
}

const saveExecutorSchedule = async (user) => {
  if (!canEditExecutorSchedules.value || user.role !== 'executor') return
  const profile = executorProfileForUser(user)
  if (!profile?.id) {
    error.value = 'Профиль исполнителя не найден'
    return
  }

  message.value = ''
  error.value = ''
  executorSavingId.value = user.id
  try {
    await api.request(`/executors/${profile.id}/schedules`, {
      method: 'PUT',
      body: (executorDrafts[user.id] || []).map((item) => ({
        weekday: Number(item.weekday),
        work_start: item.work_start?.length === 5 ? `${item.work_start}:00` : item.work_start,
        work_end: item.work_end?.length === 5 ? `${item.work_end}:00` : item.work_end,
        is_active: Boolean(item.is_active)
      }))
    })
    showToast(`График исполнителя «${user.full_name}» обновлён`)
    await fetchExecutors()
  } catch (e) {
    error.value = e?.data?.detail || e?.message || 'Не удалось сохранить график исполнителя'
  } finally {
    executorSavingId.value = null
  }
}

onMounted(reloadAll)
</script>

<template>
  <AppPage :title="pageTitle" :subtitle="displayedPageSubtitle">
    <div class="panel users-actions-panel users-actions-panel--compact">
      <div class="toolbar users-actions-panel__toolbar">
        <button v-if="canEditExecutorSchedules" class="btn btn--ghost btn--sm users-action-main" type="button" @click="executorSchedulesOpen = true">
          График исполнителей
        </button>
        <button v-if="canApproveRegistrations" class="btn btn--ghost btn--sm users-registration-button users-action-main" type="button" @click="openRegistrationRequests">
          Заявки на регистрацию
          <span v-if="registrationUnreadCount" class="users-registration-button__badge">{{ registrationUnreadCount > 99 ? '99+' : registrationUnreadCount }}</span>
        </button>
        <button v-if="canCreateUsers" class="btn btn--primary btn--sm users-action-main" type="button" @click="createFormOpen = true">
          Добавить пользователя
        </button>
      </div>
    </div>

    <div class="panel">
      <div class="toolbar">
        <label class="field">
          <span>Фильтр по роли</span>
          <select v-model="role">
            <option v-for="item in roleOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
          </select>
        </label>
        <label v-if="role === 'resident'" class="field">
          <span>Дом жителя</span>
          <select v-model="residentHouseFilter">
            <option value="">Все дома</option>
            <option v-for="house in houses" :key="house.id" :value="String(house.id)">{{ formatAddress(house) }}</option>
          </select>
        </label>
        <label class="field">
          <span>Поиск</span>
          <input v-model.trim="userSearch" type="search" placeholder="Имя, логин или телефон" />
        </label>
        <label class="checkbox" :title="strictSearchHint">
          <input v-model="userStrictSearch" type="checkbox" />
          <span>Строгий поиск</span>
        </label>
      </div>
    </div>

    <div v-if="loading" class="panel">Загрузка...</div>
    <div v-else-if="error" class="panel">
      <div v-if="error" class="alert alert--error">{{ error }}</div>
    </div>

    <div class="panel">
      <div v-if="!filteredUsers.length" class="empty-box">Подходящих пользователей пока нет.</div>
      <div v-else class="user-list">
        <div v-for="user in filteredUsers" :key="user.id" class="user-card">
          <div class="user-card__body">
            <div>
              <div class="user-card__name">
                {{ user.full_name || user.login || user.username || 'Без имени' }}
                <span v-if="isBanned(user)" class="pill pill--danger">Заблокирован</span>
              </div>
              <div class="user-card__meta">
                <span>Логин: {{ userLogin(user) }}</span>
                <span>Телефон: {{ userContactPhone(user) }}</span>
                <span v-if="user.role === 'resident' && user.banned_until">Блокировка до: {{ formatBanUntil(user.banned_until) }}</span>
                <span v-if="user.role === 'executor'">Основная специализация: {{ executorPrimarySpecialty(executorProfileForUser(user), user) }}</span>
                <span v-if="user.role === 'executor'">Все специализации: {{ executorSpecialtySummary(executorProfileForUser(user), user) }}</span>
                <span v-if="user.role === 'executor'">Закрепление: {{ executorHouseSummary(executorProfileForUser(user)) }}</span>
                <span v-else-if="user.specialty">Специализация: {{ formatSpecialty(user.specialty) }}</span>
                <span v-if="user.role !== 'executor' && user.house">Дом: {{ formatAddress(user.house) }}</span>
                <span v-if="user.apartment">Кв.: {{ user.apartment }}</span>
              </div>
            </div>

            <div v-if="false && user.role === 'dispatcher' && canEditDispatcherPermissions" class="collapsible-shell">
              <button class="collapsible-toggle" type="button" @click="toggleDispatcherPanel(user.id)">
                <span>Полномочия диспетчера</span>
                <span class="collapsible-toggle__icon" :class="{ 'collapsible-toggle__icon--open': dispatcherPanels[user.id] }" aria-hidden="true"></span>
              </button>
              <div v-if="dispatcherPanels[user.id]" class="dispatcher-permissions">
                <label class="checkbox">
                  <input v-model="dispatcherDrafts[user.id].can_manage_houses" type="checkbox" />
                  <span>Может создавать и редактировать дома, а также записи по домам</span>
                </label>
                <label class="checkbox">
                  <input v-model="dispatcherDrafts[user.id].can_ban_residents" type="checkbox" />
                  <span>Может блокировать жильцов</span>
                </label>
                <button class="btn btn--ghost btn--sm" type="button" @click="saveDispatcherPermissions(user)">Сохранить полномочия</button>
              </div>
            </div>

            <div v-if="false && user.role === 'admin_assistant' && canEditAssistantPermissions" class="collapsible-shell">
              <button class="collapsible-toggle" type="button" @click="toggleAssistantPanel(user.id)">
                <span>Полномочия помощника администратора</span>
                <span class="collapsible-toggle__icon" :class="{ 'collapsible-toggle__icon--open': assistantPanels[user.id] }" aria-hidden="true"></span>
              </button>
              <div v-if="assistantPanels[user.id]" class="dispatcher-permissions assistant-permissions">
                <label class="checkbox">
                  <input v-model="assistantDrafts[user.id].can_manage_houses" type="checkbox" />
                  <span>Добавление и редактирование домов</span>
                </label>
                <label class="checkbox">
                  <input v-model="assistantDrafts[user.id].can_create_users" type="checkbox" />
                  <span>Добавление пользователей</span>
                </label>
                <label class="checkbox">
                  <input v-model="assistantDrafts[user.id].can_manage_executor_schedules" type="checkbox" />
                  <span>Графики, специализации и привязки исполнителей</span>
                </label>
                <label class="checkbox">
                  <input v-model="assistantDrafts[user.id].can_ban_residents" type="checkbox" />
                  <span>Блокировка и разблокировка жителей</span>
                </label>
                <label class="checkbox">
                  <input v-model="assistantDrafts[user.id].can_manage_service_settings" type="checkbox" />
                  <span>Данные сервиса, заголовки и категории</span>
                </label>
                <label class="checkbox">
                  <input v-model="assistantDrafts[user.id].can_manage_remarks" type="checkbox" />
                  <span>Вынесение и отмена замечаний</span>
                </label>
                <label class="checkbox">
                  <input v-model="assistantDrafts[user.id].can_manage_house_info" type="checkbox" />
                  <span>Информация по дому, контакты, работы и графики</span>
                </label>
                <label class="checkbox">
                  <input v-model="assistantDrafts[user.id].can_manage_announcements" type="checkbox" />
                  <span>Создание и архивирование своих объявлений</span>
                </label>
                <label class="checkbox">
                  <input v-model="assistantDrafts[user.id].can_manage_password_recovery" type="checkbox" />
                  <span>Восстановление доступа</span>
                </label>
                <button class="btn btn--ghost btn--sm" type="button" @click="saveAssistantPermissions(user)">Сохранить полномочия</button>
              </div>
            </div>

            <div v-if="false && user.role === 'executor' && canEditExecutorSchedules" class="collapsible-shell">
              <button class="collapsible-toggle" type="button" @click="toggleExecutorPanel(user.id)">
                <span>Настройки исполнителя</span>
                <span class="collapsible-toggle__icon" :class="{ 'collapsible-toggle__icon--open': executorPanels[user.id] }" aria-hidden="true"></span>
              </button>
              <div v-if="executorPanels[user.id]" class="dispatcher-permissions executor-admin-settings">
                <div v-if="!executorProfileForUser(user)" class="alert alert--error">Профиль исполнителя не найден. Создайте профиль исполнителя через раздел исполнителей или пересоздайте пользователя как исполнителя.</div>
                <template v-else>
                  <section class="executor-admin-settings__section">
                    <div class="executor-admin-settings__head">
                      <div>
                        <div class="section-title">Специализации и привязка к дому</div>
                        <div class="muted">Эти настройки влияют на рекомендации при назначении мастера на заявку.</div>
                      </div>
                    </div>

                    <div class="executor-binding-grid">
                      <label class="field">
                        <span>Закреплённый дом</span>
                        <select v-model="executorProfileDrafts[user.id].house_id">
                          <option value="">Без привязки, любой дом</option>
                          <option v-for="house in houses" :key="house.id" :value="String(house.id)">{{ formatAddress(house) }}</option>
                        </select>
                      </label>

                      <label v-if="selectedExecutorSpecialties(user).length" class="field">
                        <span>Основная специализация</span>
                        <select v-model="executorProfileDrafts[user.id].primary_specialty_id">
                          <option v-for="specialtyId in selectedExecutorSpecialties(user)" :key="specialtyId" :value="specialtyId">{{ specialtyLabelById(specialtyId) }}</option>
                        </select>
                      </label>
                    </div>

                    <div class="field">
                      <span>Все специализации</span>
                      <div v-if="specialties.length" class="executor-specialty-grid">
                        <label
                          v-for="specialty in specialties"
                          :key="specialty.id"
                          class="executor-specialty-option"
                          :class="{ 'executor-specialty-option--active': selectedExecutorSpecialties(user).includes(String(specialty.id)) }"
                        >
                          <input
                            :checked="selectedExecutorSpecialties(user).includes(String(specialty.id))"
                            type="checkbox"
                            @change="toggleExecutorSpecialty(user, specialty.id)"
                          />
                          <span>{{ formatSpecialty(specialty.name || specialty.code) }}</span>
                        </label>
                      </div>
                      <div v-else class="empty-box">Справочник специализаций пока пуст. Добавьте специализации в backend, чтобы назначать их мастерам.</div>
                    </div>

                    <button class="btn btn--ghost btn--sm" type="button" :disabled="executorProfileSavingId === user.id" @click="saveExecutorProfileSettings(user)">
                      {{ executorProfileSavingId === user.id ? 'Сохраняем настройки...' : 'Сохранить специализации и дом' }}
                    </button>
                  </section>

                  <section class="executor-admin-settings__section">
                    <div class="muted-box">
                      Администратор назначает базовый рабочий график. Выходные и временную недоступность исполнитель отмечает в своём профиле.
                    </div>
                    <div class="muted">Текущий график: {{ scheduleSummary(executorDrafts[user.id]) }}</div>
                    <div class="executor-schedule-grid">
                      <div v-for="item in executorDrafts[user.id]" :key="item.weekday" class="schedule-day-card">
                        <label class="checkbox">
                          <input v-model="item.is_active" type="checkbox" />
                          <span>{{ weekdayOptions.find((option) => option.value === item.weekday)?.label }}</span>
                        </label>
                        <div class="schedule-day-card__times">
                          <input v-model="item.work_start" type="time" step="60" />
                          <input v-model="item.work_end" type="time" step="60" />
                        </div>
                      </div>
                    </div>
                    <button class="btn btn--ghost btn--sm" type="button" :disabled="executorSavingId === user.id" @click="saveExecutorSchedule(user)">
                      {{ executorSavingId === user.id ? 'Сохраняем график...' : 'Сохранить график' }}
                    </button>
                  </section>
                </template>
              </div>
            </div>
          </div>

          <div class="user-card__actions">
            <RoleBadge :role="user.role" />
            <button
              v-if="auth.hasRole('admin')"
              class="btn btn--ghost btn--sm user-action-btn user-action-btn--history"
              type="button"
              title="История изменения логина, имени и контактного телефона пользователя."
              @click="openUserHistory(user)"
            >
              История
            </button>
            <button
              v-if="user.role === 'dispatcher' && canEditDispatcherPermissions"
              class="btn btn--ghost btn--sm user-action-btn"
              type="button"
              @click="openDispatcherPermissions(user)"
            >
              Полномочия
            </button>
            <button
              v-if="user.role === 'admin_assistant' && canEditAssistantPermissions"
              class="btn btn--ghost btn--sm user-action-btn"
              type="button"
              @click="openAssistantPermissions(user)"
            >
              Полномочия
            </button>
            <button
              v-if="user.role === 'executor' && canEditExecutorProfiles"
              class="btn btn--ghost btn--sm user-action-btn"
              type="button"
              @click="openExecutorSettings(user)"
            >
              Специализации и дом
            </button>
            <button
              v-if="canManageBan(user) && !isBanned(user)"
              class="btn btn--danger btn--sm user-action-btn user-action-btn--danger"
              type="button"
              @click="openBanEditor(user)"
            >
              Заблокировать
            </button>
            <button
              v-if="canManageBan(user) && isBanned(user)"
              class="btn btn--sm user-action-btn user-action-btn--success"
              type="button"
              @click="requestClearBan(user)"
            >
              Разблокировать
            </button>
          </div>
        </div>
      </div>
    </div>
  </AppPage>

  <div v-if="activeBanUser" class="modal-backdrop" @click.self="closeBanEditor">
    <div class="modal users-settings-modal ban-modal">
      <div class="modal__head">
        <div>
          <div class="eyebrow">Ограничение жителя</div>
          <h3>Заблокировать создание заявок</h3>
          <p class="modal-subtitle">Житель сможет просматривать сервис, но не сможет отправлять новые заявки до указанного времени.</p>
        </div>
        <button class="icon-btn ticket-detail-close" type="button" aria-label="Закрыть" @click="closeBanEditor">×</button>
      </div>

      <div class="ban-modal__resident">
        <div>
          <div class="section-title">{{ activeBanUser.full_name || userLogin(activeBanUser) }}</div>
          <div class="muted">Логин: {{ userLogin(activeBanUser) }} · телефон: {{ userContactPhone(activeBanUser) }}</div>
        </div>
      </div>

      <div class="form-grid">
        <label class="field field--span-2">
          <span>Текст блокировки</span>
          <textarea v-model="banDrafts[activeBanUser.id].reason" rows="5" />
        </label>
        <label class="field field--span-2">
          <span>Блокировка действует до</span>
          <input v-model="banDrafts[activeBanUser.id].untilLocal" type="datetime-local" />
        </label>
      </div>

      <div class="toolbar confirm-modal__actions">
        <button class="btn btn--ghost" type="button" @click="closeBanEditor">Отмена</button>
        <button class="btn btn--danger" type="button" @click="saveBan(activeBanUser)">Заблокировать</button>
      </div>
    </div>
  </div>

  <div v-if="createFormOpen" class="modal-backdrop" @click.self="createFormOpen = false">
    <div class="modal users-settings-modal">
      <div class="modal__head">
        <div>
          <div class="eyebrow">Добавить пользователя</div>
        </div>
        <button class="icon-btn ticket-detail-close" type="button" aria-label="Закрыть" @click="createFormOpen = false">×</button>
      </div>
      <UserCreateForm
        ref="createFormRef"
        :houses="houses"
        :specialties="specialties"
        :message="message"
        :error="error"
        @submit="createUser"
        @cancel="createFormOpen = false"
      />
    </div>
  </div>

  <div v-if="registrationRequestsOpen" class="modal-backdrop" @click.self="closeRegistrationRequests">
    <div class="modal users-settings-modal users-settings-modal--wide">
      <div class="modal__head">
        <div>
          <div class="eyebrow">Регистрация жителей</div>
          <h3>Заявки на регистрацию</h3>
          <p class="modal-subtitle">Проверьте данные квартиры и подтвердите создание учетной записи жителя.</p>
        </div>
        <button class="icon-btn ticket-detail-close" type="button" aria-label="Закрыть" @click="closeRegistrationRequests">×</button>
      </div>

      <div class="toolbar registration-requests-toolbar">
        <label class="field">
          <span>Статус</span>
          <select v-model="registrationStatusFilter">
            <option value="">Все заявки</option>
            <option value="open">Ожидают решения</option>
            <option value="approved">Одобрены</option>
            <option value="rejected">Отклонены</option>
          </select>
        </label>
        <button class="btn btn--ghost" type="button" :disabled="registrationRequestsLoading" @click="loadRegistrationRequests">
          Обновить
        </button>
      </div>

      <div v-if="registrationRequestsLoading" class="empty-box">Загружаем заявки...</div>
      <div v-else-if="!registrationRequests.length" class="empty-box">Заявок на регистрацию пока нет.</div>
      <div v-else class="registration-request-list">
        <article v-for="request in registrationRequests" :key="request.id" class="registration-request-card">
          <div class="registration-request-card__top">
            <div>
              <div class="section-title">{{ request.full_name }}</div>
              <div class="muted">Логин: {{ request.login }} · телефон: {{ request.contact_phone }}</div>
            </div>
            <span class="access-status" :class="registrationStatusClass(request.status)">{{ registrationStatusLabel(request.status) }}</span>
          </div>
          <div class="registration-request-card__meta">
            <span>{{ registrationAddress(request) }}</span>
            <span>Создана: {{ formatBanUntil(request.created_at) }}</span>
            <span v-if="request.processed_at">Решение: {{ request.processed_by_name || 'сотрудник' }} · {{ formatBanUntil(request.processed_at) }}</span>
          </div>
          <p v-if="request.message" class="registration-request-card__message">{{ request.message }}</p>
          <p v-if="request.admin_comment" class="registration-request-card__message registration-request-card__message--admin">{{ request.admin_comment }}</p>
          <div v-if="request.status === 'open'" class="toolbar registration-request-card__actions">
            <button class="btn btn--primary btn--sm" type="button" @click="openRegistrationDecision(request, 'approve')">Одобрить</button>
            <button class="btn btn--ghost btn--sm" type="button" @click="openRegistrationDecision(request, 'reject')">Отклонить</button>
          </div>
        </article>
      </div>
    </div>
  </div>

  <div v-if="registrationDecisionTarget" class="modal-backdrop" @click.self="closeRegistrationDecision">
    <div class="modal users-settings-modal">
      <div class="modal__head">
        <div>
          <div class="eyebrow">{{ registrationDecisionMode === 'approve' ? 'Одобрение регистрации' : 'Отклонение регистрации' }}</div>
          <h3>{{ registrationDecisionTarget.full_name }}</h3>
          <p class="modal-subtitle">{{ registrationAddress(registrationDecisionTarget) }}</p>
        </div>
        <button class="icon-btn ticket-detail-close" type="button" aria-label="Закрыть" @click="closeRegistrationDecision">×</button>
      </div>

      <template v-if="registrationApproveResult">
        <div class="access-temp-password">
          <span>Временный пароль</span>
          <strong>{{ registrationApproveResult.temporary_password }}</strong>
          <p>Передайте пароль жителю. После первого входа он должен заменить его на новый.</p>
        </div>
        <div class="toolbar confirm-modal__actions">
          <button class="btn btn--primary" type="button" @click="closeRegistrationDecision">Готово</button>
        </div>
      </template>

      <template v-else>
        <div v-if="registrationDecisionMode === 'approve'" class="muted-box">
          Если оставить поле временного пароля пустым, будет установлен пароль pass123.
        </div>
        <label v-if="registrationDecisionMode === 'approve'" class="field">
          <span>Временный пароль</span>
          <input v-model="registrationTemporaryPassword" type="text" placeholder="pass123" />
        </label>
        <label class="field">
          <span>Комментарий</span>
          <textarea v-model="registrationDecisionComment" rows="4" />
        </label>
        <div class="toolbar confirm-modal__actions">
          <button class="btn btn--ghost" type="button" @click="closeRegistrationDecision">Отмена</button>
          <button
            v-if="registrationDecisionMode === 'approve'"
            class="btn btn--primary"
            type="button"
            :disabled="registrationProcessing"
            @click="approveRegistrationRequest"
          >
            {{ registrationProcessing ? 'Создаём...' : 'Создать жителя' }}
          </button>
          <button
            v-else
            class="btn btn--danger"
            type="button"
            :disabled="registrationProcessing"
            @click="rejectRegistrationRequest"
          >
            {{ registrationProcessing ? 'Отклоняем...' : 'Отклонить заявку' }}
          </button>
        </div>
      </template>
    </div>
  </div>

  <div v-if="activeDispatcherPermissionsUser" class="modal-backdrop" @click.self="closeUserModals">
    <div class="modal users-settings-modal">
      <div class="modal__head">
        <div>
          <div class="eyebrow">Полномочия диспетчера</div>
          <h3>{{ activeDispatcherPermissionsUser.full_name }}</h3>
        </div>
        <button class="icon-btn ticket-detail-close" type="button" aria-label="Закрыть" @click="closeUserModals">×</button>
      </div>
      <div class="dispatcher-permissions">
        <label class="checkbox">
          <input v-model="dispatcherDrafts[activeDispatcherPermissionsUser.id].can_manage_houses" type="checkbox" />
          <span>Может создавать и редактировать дома, а также записи по домам</span>
        </label>
        <label class="checkbox">
          <input v-model="dispatcherDrafts[activeDispatcherPermissionsUser.id].can_ban_residents" type="checkbox" />
          <span>Может блокировать жителей</span>
        </label>
        <div class="dispatcher-priority-permissions">
          <div>
            <strong>Какие заявки показывать диспетчеру</strong>
            <p>Если отмечены все приоритеты, диспетчер видит полный поток заявок.</p>
          </div>
          <label
            v-for="item in dispatcherPriorityOptions"
            :key="item.value"
            class="checkbox dispatcher-priority-permissions__item"
          >
            <input
              v-model="dispatcherDrafts[activeDispatcherPermissionsUser.id].allowed_ticket_priorities"
              type="checkbox"
              :value="item.value"
            />
            <span>{{ item.label }}</span>
          </label>
        </div>
      </div>
      <div class="toolbar">
        <button class="btn btn--primary" type="button" @click="requestUserSettingsSave('dispatcher', activeDispatcherPermissionsUser)">Сохранить</button>
      </div>
    </div>
  </div>

  <div v-if="activeAssistantPermissionsUser" class="modal-backdrop" @click.self="closeUserModals">
    <div class="modal users-settings-modal">
      <div class="modal__head">
        <div>
          <div class="eyebrow">Полномочия помощника администратора</div>
          <h3>{{ activeAssistantPermissionsUser.full_name }}</h3>
        </div>
        <button class="icon-btn ticket-detail-close" type="button" aria-label="Закрыть" @click="closeUserModals">×</button>
      </div>
      <div class="dispatcher-permissions assistant-permissions">
        <label class="checkbox"><input v-model="assistantDrafts[activeAssistantPermissionsUser.id].can_manage_houses" type="checkbox" /><span>Добавление и редактирование домов</span></label>
        <label class="checkbox"><input v-model="assistantDrafts[activeAssistantPermissionsUser.id].can_create_users" type="checkbox" /><span>Добавление пользователей</span></label>
        <label class="checkbox"><input v-model="assistantDrafts[activeAssistantPermissionsUser.id].can_manage_executor_schedules" type="checkbox" /><span>Графики, специализации и привязки исполнителей</span></label>
        <label class="checkbox"><input v-model="assistantDrafts[activeAssistantPermissionsUser.id].can_ban_residents" type="checkbox" /><span>Блокировка и разблокировка жителей</span></label>
        <label class="checkbox"><input v-model="assistantDrafts[activeAssistantPermissionsUser.id].can_manage_service_settings" type="checkbox" /><span>Данные сервиса, заголовки и категории</span></label>
        <label class="checkbox"><input v-model="assistantDrafts[activeAssistantPermissionsUser.id].can_manage_remarks" type="checkbox" /><span>Вынесение и отмена замечаний</span></label>
        <label class="checkbox"><input v-model="assistantDrafts[activeAssistantPermissionsUser.id].can_manage_house_info" type="checkbox" /><span>Информация по дому, контакты, работы и графики</span></label>
        <label class="checkbox"><input v-model="assistantDrafts[activeAssistantPermissionsUser.id].can_manage_announcements" type="checkbox" /><span>Создание и архивирование своих объявлений</span></label>
        <label class="checkbox"><input v-model="assistantDrafts[activeAssistantPermissionsUser.id].can_manage_password_recovery" type="checkbox" /><span>Восстановление доступа</span></label>
        <label class="checkbox"><input v-model="assistantDrafts[activeAssistantPermissionsUser.id].can_approve_registrations" type="checkbox" /><span>Подтверждение заявок на регистрацию жителей</span></label>
      </div>
      <div class="toolbar">
        <button class="btn btn--primary" type="button" @click="requestUserSettingsSave('assistant', activeAssistantPermissionsUser)">Сохранить</button>
      </div>
    </div>
  </div>

  <div v-if="activeExecutorSettingsUser" class="modal-backdrop" @click.self="closeUserModals">
    <div class="modal users-settings-modal users-settings-modal--wide">
      <div class="modal__head">
        <div>
          <div class="eyebrow">Настройки исполнителя</div>
          <h3>{{ activeExecutorSettingsUser.full_name }}</h3>
        </div>
        <button class="icon-btn ticket-detail-close" type="button" aria-label="Закрыть" @click="closeUserModals">×</button>
      </div>
      <div v-if="!executorProfileForUser(activeExecutorSettingsUser)" class="alert alert--error">Профиль исполнителя не найден.</div>
      <template v-else>
        <div class="executor-binding-grid">
          <label class="field">
            <span>Закреплённый дом</span>
            <select v-model="executorProfileDrafts[activeExecutorSettingsUser.id].house_id">
              <option value="">Без привязки, любой дом</option>
              <option v-for="house in houses" :key="house.id" :value="String(house.id)">{{ formatAddress(house) }}</option>
            </select>
          </label>
          <label v-if="selectedExecutorSpecialties(activeExecutorSettingsUser).length" class="field">
            <span>Основная специализация</span>
            <select v-model="executorProfileDrafts[activeExecutorSettingsUser.id].primary_specialty_id">
              <option v-for="specialtyId in selectedExecutorSpecialties(activeExecutorSettingsUser)" :key="specialtyId" :value="specialtyId">{{ specialtyLabelById(specialtyId) }}</option>
            </select>
          </label>
        </div>
        <div class="field">
          <span>Все специализации</span>
          <div v-if="specialties.length" class="executor-specialty-grid">
            <label
              v-for="specialty in specialties"
              :key="specialty.id"
              class="executor-specialty-option"
              :class="{ 'executor-specialty-option--active': selectedExecutorSpecialties(activeExecutorSettingsUser).includes(String(specialty.id)) }"
            >
              <input
                :checked="selectedExecutorSpecialties(activeExecutorSettingsUser).includes(String(specialty.id))"
                type="checkbox"
                @change="toggleExecutorSpecialty(activeExecutorSettingsUser, specialty.id)"
              />
              <span>{{ formatSpecialty(specialty.name || specialty.code) }}</span>
            </label>
          </div>
          <div v-else class="empty-box">Справочник специализаций пока пуст.</div>
        </div>
        <div class="toolbar executor-settings-actions">
          <button class="btn btn--primary" type="button" :disabled="executorProfileSavingId === activeExecutorSettingsUser.id" @click="requestUserSettingsSave('executor-profile', activeExecutorSettingsUser)">
            {{ executorProfileSavingId === activeExecutorSettingsUser.id ? 'Сохраняем...' : 'Сохранить настройки' }}
          </button>
        </div>
      </template>
    </div>
  </div>

  <div v-if="executorSchedulesOpen" class="modal-backdrop" @click.self="executorSchedulesOpen = false">
    <div class="modal users-settings-modal users-settings-modal--wide">
      <div class="modal__head">
        <div>
          <div class="eyebrow">График исполнителей</div>
          <h3>Рабочие графики мастеров</h3>
        </div>
        <button class="icon-btn ticket-detail-close" type="button" aria-label="Закрыть" @click="executorSchedulesOpen = false">×</button>
      </div>
      <div class="muted-box">Администратор назначает базовый рабочий график. Выходные и временную недоступность исполнитель отмечает в своём профиле.</div>
      <label class="field schedule-search-field">
        <span>Поиск исполнителя</span>
        <input v-model="executorScheduleSearch" type="search" placeholder="Имя, логин, специализация или дом" />
      </label>
      <label class="checkbox schedule-strict-search" :title="strictSearchHint">
        <input v-model="executorScheduleStrictSearch" type="checkbox" />
        <span>Строгий поиск</span>
      </label>
      <div v-if="!executorUsers.length" class="empty-box">Исполнителей пока нет.</div>
      <div v-else-if="!filteredExecutorScheduleUsers.length" class="empty-box">По этому запросу исполнители не найдены.</div>
      <div v-else class="executor-schedule-modal-list">
        <div v-for="user in filteredExecutorScheduleUsers" :key="`schedule-${user.id}`" class="executor-schedule-modal-card">
          <div class="executor-admin-settings__head">
            <div>
              <div class="section-title">{{ user.full_name }}</div>
              <div class="muted">{{ executorSpecialtySummary(executorProfileForUser(user), user) }} · {{ scheduleSummary(executorDrafts[user.id]) }}</div>
            </div>
          </div>
          <div class="executor-schedule-grid">
            <div v-for="item in executorDrafts[user.id]" :key="`${user.id}-${item.weekday}`" class="schedule-day-card">
              <label class="checkbox">
                <input v-model="item.is_active" type="checkbox" />
                <span>{{ weekdayOptions.find((option) => option.value === item.weekday)?.label }}</span>
              </label>
              <div class="schedule-day-card__times">
                <input v-model="item.work_start" type="time" step="60" />
                <input v-model="item.work_end" type="time" step="60" />
              </div>
            </div>
          </div>
          <button class="btn btn--ghost btn--sm" type="button" :disabled="executorSavingId === user.id" @click="requestUserSettingsSave('executor-schedule', user)">
            {{ executorSavingId === user.id ? 'Сохраняем...' : 'Сохранить график' }}
          </button>
        </div>
      </div>
    </div>
  </div>

  <div v-if="activeHistoryUser" class="modal-backdrop" @click.self="closeUserHistory">
    <div class="modal users-settings-modal">
      <div class="modal__head">
        <div>
          <div class="eyebrow">История профиля</div>
          <h3>{{ activeHistoryUser.full_name || userLogin(activeHistoryUser) }}</h3>
          <p class="modal-subtitle">Изменения логина, имени и контактного телефона пользователя.</p>
        </div>
        <button class="icon-btn ticket-detail-close" type="button" aria-label="Закрыть" @click="closeUserHistory">×</button>
      </div>

      <div v-if="userHistoryLoading" class="empty-box">Загружаем историю...</div>
      <div v-else-if="!userHistory.length" class="empty-box">Изменений пока нет.</div>
      <div v-else class="user-history-list">
        <div v-for="entry in userHistory" :key="entry.id" class="user-history-row">
          <div class="user-history-row__head">
            <strong>{{ historyFieldLabel(entry.field_name) }}</strong>
            <span>{{ formatBanUntil(entry.created_at) }}</span>
          </div>
          <div class="user-history-row__change">
            <span>{{ entry.old_value || '—' }}</span>
            <span aria-hidden="true">→</span>
            <span>{{ entry.new_value || '—' }}</span>
          </div>
          <div class="user-history-row__actor">Изменил: {{ entry.actor_name || 'Система' }}</div>
        </div>
      </div>
    </div>
  </div>

  <ConfirmDialog
    :open="Boolean(pendingUnbanUser)"
    title="Снять ограничение"
    :message="`Разблокировать жителя «${pendingUnbanUserName}»? После подтверждения он сможет снова отправлять заявки.`"
    confirm-label="Да"
    cancel-label="Отмена"
    :show-close="false"
    @close="closeClearBanConfirmation"
    @confirm="confirmClearBan"
  />

  <ConfirmDialog
    :open="Boolean(pendingUserSettingsSave)"
    title="Сохранить изменения"
    :message="userSettingsSaveQuestion"
    confirm-label="Да, сохранить"
    :show-close="false"
    :busy="Boolean(executorSavingId || executorProfileSavingId)"
    @close="closeUserSettingsSave"
    @confirm="confirmUserSettingsSave"
  />
</template>
