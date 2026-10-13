<script setup>
definePageMeta({ middleware: 'auth' })

import { formatAddress, formatDate, formatDateInputValue, formatRole, formatSpecialty } from '~/utils/format'
import { CONTACT_PHONE_MAX_LENGTH, formatContactPhoneInput, validateContactPhone } from '~/utils/phone'
import { containsProfanity, PROFANITY_ERROR } from '~/utils/profanity'

const auth = useAuth()
const api = useApi()
const config = useRuntimeConfig()
const { loadSettings, applySettings } = useAppSettings()
const { showToast } = useToast()
const { profileMeta } = useRoleContent()

const form = reactive({
  full_name: '',
  login: '',
  contact_phone: '+7'
})

const passwordForm = reactive({
  old_password: '',
  new_password: '',
  confirm_password: ''
})

const settingsForm = reactive({
  escalation_hours: 6,
  escalation_minutes: 0,
  overdue_hours: 6,
  overdue_minutes: 0,
  complaint_primary_limit: 2,
  app_brand: 'UK WEB',
  login_title: 'Вход в веб-версию',
  mobile_login_brand: 'Управляющая компания',
  mobile_login_title: 'Вход в систему',
  mobile_login_subtitle: 'Жители отслеживают заявки, сотрудники контролируют их исполнение.',
  login_background_image: null,
  service_rules_text: 'Пользуйтесь сервисом добросовестно: не дублируйте заявки, указывайте достоверную информацию и соблюдайте уважительный тон в общении.'
})

const adminCategories = ref([])
const newCategoryName = ref('')
const newCategoryType = ref('problem')
const categorySaving = ref(false)
const categoryDeletingId = ref(null)
const houseInfoTypes = ref([])
const newHouseInfoTypeName = ref('')
const newHouseInfoTypeGroup = ref('schedule')
const houseInfoTypeSaving = ref(false)
const houseInfoTypeDeletingId = ref(null)
const executorSpecialties = ref([])
const newSpecialtyName = ref('')
const specialtySaving = ref(false)
const specialtyDeletingId = ref(null)
const pendingSpecialtyDelete = ref(null)
const residentApartmentResidents = ref([])
const residentResidentsLoading = ref(false)
const residentRestrictionDraft = ref(false)
const residentRestrictionConfirmOpen = ref(false)
const residentRestrictionSaving = ref(false)

const executorEditor = reactive({
  phone: '',
  notes: '',
  schedules: [],
  dayOffDate: '',
  dayOffReason: ''
})

const entrances = ref([])
const executorProfile = ref(null)
const message = ref('')
const error = ref('')
const passwordMessage = ref('')
const passwordError = ref('')
const settingsMessage = ref('')
const settingsError = ref('')
const settingsLoading = ref(false)
const settingsSaving = ref(false)
const webSettingsSaving = ref(false)
const mobileSettingsSaving = ref(false)
const rulesSettingsSaving = ref(false)
const escalationSettingsSaving = ref(false)
const loginBackgroundFile = ref(null)
const loginBackgroundInput = ref(null)
const loginBackgroundSaving = ref(false)
const mobileSubtitleTextarea = ref(null)
const serviceRulesTextarea = ref(null)
const executorLoading = ref(false)
const executorSaving = ref(false)
const executorDayOffSaving = ref(false)
const executorError = ref('')
const executorMessage = ref('')
const settingsSnapshots = reactive({
  escalation: '',
  web: '',
  mobile: '',
  rules: ''
})
const pendingProfileNavigation = ref('')
const unsavedProfileDialogOpen = ref(false)
const allowProfileNavigation = ref(false)

const isResident = computed(() => auth.hasRole('resident'))
const isExecutor = computed(() => auth.hasRole('executor'))
const canManageAdminSettings = computed(() => auth.hasRole('admin') || (auth.hasRole('admin_assistant') && Boolean(auth.user.value?.can_manage_service_settings)))
const canManageExecutorSpecialties = computed(() => auth.hasRole('admin') || (auth.hasRole('admin_assistant') && Boolean(auth.user.value?.can_manage_executor_schedules)))
const canManageAuditorSettings = computed(() => auth.hasRole('auditor'))
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

const entranceNumber = computed(() => {
  const entranceId = auth.user.value?.apartment_ref?.entrance_id
  if (!entranceId) return null
  return entrances.value.find((item) => item.id === entranceId)?.number || null
})

const primarySpecialty = computed(() => {
  const primary = executorProfile.value?.specialties?.find((item) => item.is_primary)
  const raw = primary?.specialty?.name || primary?.specialty?.code || executorProfile.value?.specialties?.[0]?.specialty?.name || executorProfile.value?.specialties?.[0]?.specialty?.code
  return raw ? formatSpecialty(raw) : '—'
})

const allSpecialties = computed(() => {
  return (executorProfile.value?.specialties || [])
    .map((item) => formatSpecialty(item.specialty?.name || item.specialty?.code))
    .filter(Boolean)
    .join(', ')
})

const activeScheduleItems = computed(() => {
  return executorEditor.schedules
    .filter((item) => item.is_active)
    .map((item) => ({
      weekday: weekdayOptions.find((option) => option.value === item.weekday)?.label || item.weekday,
      start: String(item.work_start || '').slice(0, 5),
      end: String(item.work_end || '').slice(0, 5)
    }))
})

const inactiveScheduleCount = computed(() => executorEditor.schedules.filter((item) => !item.is_active).length)

const activeDaysOff = computed(() => {
  return [...(executorProfile.value?.days_off || [])]
    .filter((item) => item.is_active)
    .sort((a, b) => String(a.off_date).localeCompare(String(b.off_date)))
})

const adminProblemCategories = computed(() => adminCategories.value.filter((item) => (item.category_type || 'problem') === 'problem'))
const adminLocationCategories = computed(() => adminCategories.value.filter((item) => item.category_type === 'location'))
const sortHouseInfoTypes = (items) => [...items].sort((a, b) => {
  if (Boolean(a.is_active) !== Boolean(b.is_active)) return a.is_active ? -1 : 1
  return String(a.name || '').localeCompare(String(b.name || ''), 'ru')
})
const adminEventTypes = computed(() => sortHouseInfoTypes(houseInfoTypes.value.filter((item) => item.type_group === 'event')))
const adminScheduleTypes = computed(() => sortHouseInfoTypes(houseInfoTypes.value.filter((item) => item.type_group === 'schedule')))
const staticBaseUrl = computed(() => String(config.public.apiBase || '').replace(/\/api\/v1\/?$/, ''))
const loginBackgroundPreviewUrl = computed(() => {
  const value = settingsForm.login_background_image
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value
  return `${staticBaseUrl.value}${value}`
})
const loginBackgroundFileName = computed(() => loginBackgroundFile.value?.name || '')

const settingsBlockSnapshot = (block) => {
  if (block === 'escalation') {
    return JSON.stringify({
      escalation_hours: Number(settingsForm.escalation_hours),
      escalation_minutes: Number(settingsForm.escalation_minutes)
    })
  }
  if (block === 'web') {
    return JSON.stringify({
      app_brand: String(settingsForm.app_brand || '').trim(),
      login_title: String(settingsForm.login_title || '').trim(),
      login_background_image: settingsForm.login_background_image || null
    })
  }
  if (block === 'mobile') {
    return JSON.stringify({
      mobile_login_brand: String(settingsForm.mobile_login_brand || '').trim(),
      mobile_login_title: String(settingsForm.mobile_login_title || '').trim(),
      mobile_login_subtitle: String(settingsForm.mobile_login_subtitle || '').trim()
    })
  }
  if (block === 'rules') {
    return JSON.stringify({
      service_rules_text: String(settingsForm.service_rules_text || '').trim()
    })
  }
  return ''
}

const markSettingsBlockSaved = (block) => {
  settingsSnapshots[block] = settingsBlockSnapshot(block)
}

const markAllSettingsSaved = () => {
  markSettingsBlockSaved('escalation')
  markSettingsBlockSaved('web')
  markSettingsBlockSaved('mobile')
  markSettingsBlockSaved('rules')
}

const settingsDirty = computed(() => {
  return ['escalation', 'web', 'mobile', 'rules'].some((block) => settingsSnapshots[block] && settingsSnapshots[block] !== settingsBlockSnapshot(block))
})

const webTextSettingsDirty = () => {
  if (!settingsSnapshots.web) return false
  try {
    const saved = JSON.parse(settingsSnapshots.web)
    return saved.app_brand !== String(settingsForm.app_brand || '').trim() ||
      saved.login_title !== String(settingsForm.login_title || '').trim()
  } catch {
    return false
  }
}

const profileHasUnsavedChanges = computed(() => {
  if (!canManageAdminSettings.value) return false
  return settingsDirty.value ||
    Boolean(loginBackgroundFile.value) ||
    Boolean(newCategoryName.value.trim()) ||
    Boolean(newHouseInfoTypeName.value.trim()) ||
    Boolean(newSpecialtyName.value.trim())
})

const resizeSettingsTextarea = (element, minHeight = 120) => {
  if (!element) return
  element.style.height = 'auto'
  element.style.height = `${Math.max(element.scrollHeight, minHeight)}px`
}

const resizeSettingsTextareas = () => {
  nextTick(() => {
    resizeSettingsTextarea(mobileSubtitleTextarea.value, 96)
    resizeSettingsTextarea(serviceRulesTextarea.value, 178)
  })
}

const autoResizeSettingsTextarea = (event, minHeight = 120) => {
  resizeSettingsTextarea(event?.target, minHeight)
}

watchEffect(() => {
  form.full_name = auth.user.value?.full_name || ''
  form.login = auth.user.value?.login || auth.user.value?.username || ''
  form.contact_phone = auth.user.value?.contact_phone || '+7'
  residentRestrictionDraft.value = Boolean(auth.user.value?.blocks_apartment_resident_additions)
})

const defaultSchedules = () => weekdayOptions.map((option) => ({
  weekday: option.value,
  work_start: '09:00:00',
  work_end: '18:00:00',
  is_active: option.value < 5
}))

const syncExecutorEditor = (profile) => {
  executorEditor.phone = profile?.user?.contact_phone || profile?.phone || auth.user.value?.contact_phone || ''
  executorEditor.notes = profile?.notes || ''

  const source = profile?.work_schedules?.length
    ? profile.work_schedules
    : defaultSchedules()

  executorEditor.schedules = weekdayOptions.map((option) => {
    const current = source.find((item) => Number(item.weekday) === option.value)
    return {
      weekday: option.value,
      work_start: current?.work_start || '09:00:00',
      work_end: current?.work_end || '18:00:00',
      is_active: current?.is_active ?? false
    }
  })
}

const loadEntrances = async () => {
  if (!auth.user.value?.house_id) {
    entrances.value = []
    return
  }

  try {
    entrances.value = await api.request(`/houses/${auth.user.value.house_id}/entrances`)
  } catch {
    entrances.value = []
  }
}

const loadApartmentResidents = async () => {
  if (!isResident.value) {
    residentApartmentResidents.value = []
    return
  }
  residentResidentsLoading.value = true
  try {
    residentApartmentResidents.value = await api.request('/users/me/apartment-residents')
  } catch {
    residentApartmentResidents.value = []
  } finally {
    residentResidentsLoading.value = false
  }
}

const saveResidentRestriction = async (enabled) => {
  residentRestrictionSaving.value = true
  try {
    await api.request('/users/me', {
      method: 'PATCH',
      body: {
        blocks_apartment_resident_additions: enabled
      }
    })
    await auth.fetchMe()
    await loadApartmentResidents()
    residentRestrictionDraft.value = enabled
    showToast(enabled ? 'Добавление жителей в квартиру запрещено' : 'Запрет добавления жителей снят')
  } catch (e) {
    residentRestrictionDraft.value = Boolean(auth.user.value?.blocks_apartment_resident_additions)
    showToast(e?.data?.detail || e?.message || 'Не удалось обновить настройку квартиры', { type: 'error' })
  } finally {
    residentRestrictionSaving.value = false
  }
}

const onResidentRestrictionChange = (event) => {
  const enabled = Boolean(event?.target?.checked)
  if (enabled && !auth.user.value?.blocks_apartment_resident_additions) {
    residentRestrictionDraft.value = false
    residentRestrictionConfirmOpen.value = true
    return
  }
  saveResidentRestriction(enabled)
}

const confirmResidentRestriction = async () => {
  residentRestrictionConfirmOpen.value = false
  await saveResidentRestriction(true)
}

const cancelResidentRestriction = () => {
  residentRestrictionConfirmOpen.value = false
  residentRestrictionDraft.value = Boolean(auth.user.value?.blocks_apartment_resident_additions)
}

const loadExecutorProfile = async () => {
  if (!isExecutor.value) {
    executorProfile.value = null
    return
  }

  executorLoading.value = true
  executorError.value = ''
  try {
    executorProfile.value = await api.request('/executors/me/profile')
    syncExecutorEditor(executorProfile.value)
  } catch (e) {
    executorProfile.value = null
    executorError.value = e?.data?.detail || e?.message || 'Не удалось загрузить профиль исполнителя'
  } finally {
    executorLoading.value = false
  }
}

const loadManagedSettings = async () => {
  if (!canManageAdminSettings.value && !canManageAuditorSettings.value) return
  settingsLoading.value = true
  settingsError.value = ''
  try {
    const payload = await api.request('/settings/app')
    applySettings(payload)
    const escalationTotalMinutes = Math.min(360, Math.max(1, Number(payload?.complaint_escalate_after_minutes || 360)))
    settingsForm.escalation_hours = Math.floor(escalationTotalMinutes / 60)
    settingsForm.escalation_minutes = escalationTotalMinutes % 60
    const overdueTotalMinutes = Math.min(360, Math.max(1, Number(payload?.complaint_overdue_after_minutes || 360)))
    settingsForm.overdue_hours = Math.floor(overdueTotalMinutes / 60)
    settingsForm.overdue_minutes = overdueTotalMinutes % 60
    settingsForm.complaint_primary_limit = Math.min(10, Math.max(1, Number(payload?.complaint_primary_limit || 2)))
    settingsForm.app_brand = payload?.app_brand || 'UK WEB'
    settingsForm.login_title = payload?.login_title || 'Вход в веб-версию'
    settingsForm.mobile_login_brand = payload?.mobile_login_brand || 'Управляющая компания'
    settingsForm.mobile_login_title = payload?.mobile_login_title || 'Вход в систему'
    settingsForm.mobile_login_subtitle = payload?.mobile_login_subtitle || 'Жители отслеживают заявки, сотрудники контролируют их исполнение.'
    settingsForm.login_background_image = payload?.login_background_image || null
    settingsForm.service_rules_text = payload?.service_rules_text || 'Пользуйтесь сервисом добросовестно: не дублируйте заявки, указывайте достоверную информацию и соблюдайте уважительный тон в общении.'
    markAllSettingsSaved()
    resizeSettingsTextareas()
  } catch (e) {
    settingsError.value = e?.data?.detail || e?.message || 'Не удалось загрузить настройки'
  } finally {
    settingsLoading.value = false
  }
}

const loadAdminCategories = async () => {
  if (!canManageAdminSettings.value) return
  try {
    adminCategories.value = await api.request('/categories/', { query: { category_type: 'all' } })
  } catch {
    adminCategories.value = []
  }
}

const loadHouseInfoTypes = async () => {
  if (!canManageAdminSettings.value) return
  try {
    houseInfoTypes.value = await api.request('/house-info/types', { query: { active_only: false } })
  } catch {
    houseInfoTypes.value = []
  }
}

const loadExecutorSpecialties = async () => {
  if (!canManageExecutorSpecialties.value) return
  try {
    executorSpecialties.value = await api.request('/executors/specialties')
  } catch {
    executorSpecialties.value = []
  }
}

const save = async () => {
  message.value = ''
  error.value = ''
  if (hasWhitespace(form.login)) {
    error.value = 'Логин не должен содержать пробелы'
    showToast(error.value, { type: 'error' })
    return
  }
  if (hasCyrillic(form.login)) {
    error.value = 'Логин должен быть указан латинскими символами, цифрами или знаками'
    showToast(error.value, { type: 'error' })
    return
  }
  const phoneValidation = validateContactPhone(form.contact_phone)
  if (!phoneValidation.ok) {
    error.value = phoneValidation.error
    showToast(error.value, { type: 'error' })
    return
  }
  try {
    await api.request('/users/me', {
      method: 'PATCH',
      body: {
        full_name: form.full_name,
        login: form.login,
        contact_phone: phoneValidation.value
      }
    })
    await auth.fetchMe()
    await Promise.all([loadEntrances(), loadExecutorProfile(), loadApartmentResidents()])
    showToast('Профиль сохранён')
  } catch (e) {
    error.value = e?.data?.detail || e?.message || 'Не удалось сохранить профиль'
    showToast(error.value, { type: 'error' })
  }
}

const onContactPhoneInput = () => {
  form.contact_phone = formatContactPhoneInput(form.contact_phone)
}

const saveExecutorProfile = async () => {
  executorMessage.value = ''
  executorError.value = ''
  if (containsProfanity(executorEditor.notes)) {
    executorError.value = PROFANITY_ERROR
    showToast(PROFANITY_ERROR, { type: 'error' })
    return
  }
  executorSaving.value = true
  try {
    await api.request('/executors/me/profile', {
      method: 'PATCH',
      body: {
        phone: executorEditor.phone || null,
        notes: executorEditor.notes || null
      }
    })
    await loadExecutorProfile()
    showToast('Рабочие данные исполнителя обновлены')
  } catch (e) {
    executorError.value = e?.data?.detail || e?.message || 'Не удалось сохранить рабочие данные исполнителя'
  } finally {
    executorSaving.value = false
  }
}

const addDayOff = async () => {
  if (!executorEditor.dayOffDate) {
    executorError.value = 'Укажите дату выходного'
    return
  }
  if (containsProfanity(executorEditor.dayOffReason)) {
    executorError.value = PROFANITY_ERROR
    showToast(PROFANITY_ERROR, { type: 'error' })
    return
  }

  executorMessage.value = ''
  executorError.value = ''
  executorDayOffSaving.value = true
  try {
    await api.request('/executors/me/days-off', {
      method: 'POST',
      body: {
        off_date: executorEditor.dayOffDate,
        reason: executorEditor.dayOffReason || null,
        is_active: true
      }
    })
    executorEditor.dayOffDate = ''
    executorEditor.dayOffReason = ''
    await loadExecutorProfile()
    showToast('Выходной добавлен')
  } catch (e) {
    executorError.value = e?.data?.detail || e?.message || 'Не удалось добавить выходной'
  } finally {
    executorDayOffSaving.value = false
  }
}

const removeDayOff = async (dayOffId) => {
  executorMessage.value = ''
  executorError.value = ''
  try {
    await api.request(`/executors/me/days-off/${dayOffId}`, { method: 'DELETE' })
    await loadExecutorProfile()
    showToast('Выходной удалён')
  } catch (e) {
    executorError.value = e?.data?.detail || e?.message || 'Не удалось удалить выходной'
  }
}

const patchSettingsBlock = async (body, savingRef, successMessage, savedBlock) => {
  settingsMessage.value = ''
  settingsError.value = ''
  savingRef.value = true
  settingsSaving.value = true
  try {
    const payload = await api.request('/settings/app', {
      method: 'PATCH',
      body
    })
    applySettings(payload)
    if (savedBlock) markSettingsBlockSaved(savedBlock)
    showToast(successMessage)
  } catch (e) {
    settingsError.value = e?.data?.detail || e?.message || 'Не удалось сохранить настройки'
    showToast(settingsError.value, { type: 'error' })
  } finally {
    savingRef.value = false
    settingsSaving.value = false
  }
}

const validateEscalationBlock = () => {
  const hours = Number(settingsForm.escalation_hours)
  const minutes = Number(settingsForm.escalation_minutes)
  const totalMinutes = hours * 60 + minutes
  if (Number.isNaN(hours) || Number.isNaN(minutes) || hours < 0 || hours > 6 || minutes < 0 || minutes > 59 || totalMinutes < 1 || totalMinutes > 360) {
    settingsError.value = 'Укажите порог от 1 минуты до 6 часов'
    showToast(settingsError.value, { type: 'error' })
    return null
  }
  return totalMinutes
}

const saveEscalationSettings = async () => {
  const totalMinutes = validateEscalationBlock()
  if (!totalMinutes) return
  await patchSettingsBlock(
    { complaint_escalate_after_minutes: totalMinutes },
    escalationSettingsSaving,
    'Порог обращения в контролирующий орган сохранён',
    'escalation'
  )
}

const saveWebBrandingSettings = async () => {
  settingsMessage.value = ''
  settingsError.value = ''
  if (!settingsForm.app_brand.trim()) {
    settingsError.value = 'Укажите текст бренда'
    showToast(settingsError.value, { type: 'error' })
    return
  }
  if (!settingsForm.login_title.trim()) {
    settingsError.value = 'Укажите заголовок страницы входа'
    showToast(settingsError.value, { type: 'error' })
    return
  }
  if (containsProfanity(settingsForm.app_brand, settingsForm.login_title)) {
    settingsError.value = PROFANITY_ERROR
    showToast(PROFANITY_ERROR, { type: 'error' })
    return
  }
  await patchSettingsBlock(
    {
      app_brand: settingsForm.app_brand.trim(),
      login_title: settingsForm.login_title.trim()
    },
    webSettingsSaving,
    'Заголовки веб-версии сохранены',
    'web'
  )
}

const saveMobileLoginSettings = async () => {
  settingsMessage.value = ''
  settingsError.value = ''
  if (!settingsForm.mobile_login_brand.trim() || !settingsForm.mobile_login_title.trim() || !settingsForm.mobile_login_subtitle.trim()) {
    settingsError.value = 'Заполните тексты мобильного экрана входа'
    showToast(settingsError.value, { type: 'error' })
    return
  }
  if (containsProfanity(
    settingsForm.mobile_login_brand,
    settingsForm.mobile_login_title,
    settingsForm.mobile_login_subtitle
  )) {
    settingsError.value = PROFANITY_ERROR
    showToast(PROFANITY_ERROR, { type: 'error' })
    return
  }
  await patchSettingsBlock(
    {
      mobile_login_brand: settingsForm.mobile_login_brand.trim(),
      mobile_login_title: settingsForm.mobile_login_title.trim(),
      mobile_login_subtitle: settingsForm.mobile_login_subtitle.trim()
    },
    mobileSettingsSaving,
    'Заголовки мобильного приложения сохранены',
    'mobile'
  )
}

const saveServiceRulesSettings = async () => {
  settingsMessage.value = ''
  settingsError.value = ''
  if (!settingsForm.service_rules_text.trim()) {
    settingsError.value = 'Заполните правила пользования сервисом'
    showToast(settingsError.value, { type: 'error' })
    return
  }
  if (containsProfanity(settingsForm.service_rules_text)) {
    settingsError.value = PROFANITY_ERROR
    showToast(PROFANITY_ERROR, { type: 'error' })
    return
  }
  await patchSettingsBlock(
    { service_rules_text: settingsForm.service_rules_text.trim() },
    rulesSettingsSaving,
    'Правила пользования сервисом сохранены',
    'rules'
  )
}

const onLoginBackgroundSelected = (event) => {
  loginBackgroundFile.value = event?.target?.files?.[0] || null
}

const uploadLoginBackground = async () => {
  if (!loginBackgroundFile.value) {
    showToast('Выберите изображение для фона входа', { type: 'error' })
    return
  }

  loginBackgroundSaving.value = true
  const keepWebTextDirty = webTextSettingsDirty()
  try {
    const body = new FormData()
    body.append('file', loginBackgroundFile.value)
    const payload = await api.request('/settings/app/login-background', {
      method: 'POST',
      body
    })
    applySettings(payload)
    settingsForm.login_background_image = payload?.login_background_image || null
    loginBackgroundFile.value = null
    if (loginBackgroundInput.value) loginBackgroundInput.value.value = ''
    if (!keepWebTextDirty) markSettingsBlockSaved('web')
    showToast('Фон страницы входа обновлён')
  } catch (e) {
    showToast(e?.data?.detail || e?.message || 'Не удалось загрузить фон входа', { type: 'error' })
  } finally {
    loginBackgroundSaving.value = false
  }
}

const clearLoginBackground = async () => {
  loginBackgroundSaving.value = true
  const keepWebTextDirty = webTextSettingsDirty()
  try {
    const payload = await api.request('/settings/app/login-background', { method: 'DELETE' })
    applySettings(payload)
    settingsForm.login_background_image = null
    loginBackgroundFile.value = null
    if (loginBackgroundInput.value) loginBackgroundInput.value.value = ''
    if (!keepWebTextDirty) markSettingsBlockSaved('web')
    showToast('Стандартный фон входа восстановлен')
  } catch (e) {
    showToast(e?.data?.detail || e?.message || 'Не удалось сбросить фон входа', { type: 'error' })
  } finally {
    loginBackgroundSaving.value = false
  }
}

const saveAuditorComplaintSettings = async () => {
  settingsMessage.value = ''
  settingsError.value = ''

  const escalationTotalMinutes = validateEscalationBlock()
  if (!escalationTotalMinutes) return

  const hours = Number(settingsForm.overdue_hours)
  const minutes = Number(settingsForm.overdue_minutes)
  const totalMinutes = hours * 60 + minutes

  if (Number.isNaN(hours) || Number.isNaN(minutes) || hours < 0 || hours > 6 || minutes < 0 || minutes > 59 || totalMinutes < 1 || totalMinutes > 360) {
    settingsError.value = 'Укажите порог от 1 минуты до 6 часов'
    return
  }
  const complaintLimit = Number(settingsForm.complaint_primary_limit)
  if (Number.isNaN(complaintLimit) || complaintLimit < 1 || complaintLimit > 10) {
    settingsError.value = 'Укажите лимит обычных жалоб от 1 до 10'
    return
  }

  settingsSaving.value = true
  try {
    const payload = await api.request('/settings/app', {
      method: 'PATCH',
      body: {
        complaint_escalate_after_minutes: escalationTotalMinutes,
        complaint_overdue_after_minutes: totalMinutes,
        complaint_primary_limit: complaintLimit
      }
    })
    applySettings(payload)
    showToast('Порог жалобы сохранён')
  } catch (e) {
    settingsError.value = e?.data?.detail || e?.message || 'Не удалось сохранить порог жалобы'
  } finally {
    settingsSaving.value = false
  }
}

const createCategory = async () => {
  const name = newCategoryName.value.trim()
  if (!name) {
    settingsError.value = 'Укажите название новой категории'
    return
  }
  if (containsProfanity(name)) {
    settingsError.value = PROFANITY_ERROR
    showToast(PROFANITY_ERROR, { type: 'error' })
    return
  }

  settingsError.value = ''
  categorySaving.value = true
  try {
    await api.request('/categories/', {
      method: 'POST',
      body: {
        name,
        category_type: newCategoryType.value
      }
    })
    newCategoryName.value = ''
    showToast('Категория добавлена')
    await loadAdminCategories()
  } catch (e) {
    settingsError.value = e?.data?.detail || e?.message || 'Не удалось добавить категорию'
  } finally {
    categorySaving.value = false
  }
}

const removeCategory = async (categoryId) => {
  categoryDeletingId.value = categoryId
  settingsError.value = ''
  try {
    await api.request(`/categories/${categoryId}`, { method: 'DELETE' })
    showToast('Категория удалена')
    await loadAdminCategories()
  } catch (e) {
    settingsError.value = e?.data?.detail || e?.message || 'Не удалось удалить категорию'
  } finally {
    categoryDeletingId.value = null
  }
}

const createHouseInfoType = async () => {
  const name = newHouseInfoTypeName.value.trim()
  if (!name) {
    settingsError.value = 'Укажите название нового типа'
    return
  }
  if (containsProfanity(name)) {
    settingsError.value = PROFANITY_ERROR
    showToast(PROFANITY_ERROR, { type: 'error' })
    return
  }

  settingsError.value = ''
  houseInfoTypeSaving.value = true
  try {
    await api.request('/house-info/types', {
      method: 'POST',
      body: {
        type_group: newHouseInfoTypeGroup.value,
        name
      }
    })
    newHouseInfoTypeName.value = ''
    showToast('Тип добавлен')
    await loadHouseInfoTypes()
  } catch (e) {
    settingsError.value = e?.data?.detail || e?.message || 'Не удалось добавить тип'
  } finally {
    houseInfoTypeSaving.value = false
  }
}

const removeHouseInfoType = async (typeId) => {
  houseInfoTypeDeletingId.value = typeId
  settingsError.value = ''
  try {
    await api.request(`/house-info/types/${typeId}`, { method: 'DELETE' })
    showToast('Тип скрыт из списка')
    await loadHouseInfoTypes()
  } catch (e) {
    settingsError.value = e?.data?.detail || e?.message || 'Не удалось скрыть тип'
  } finally {
    houseInfoTypeDeletingId.value = null
  }
}

const restoreHouseInfoType = async (item) => {
  houseInfoTypeDeletingId.value = item.id
  settingsError.value = ''
  try {
    await api.request('/house-info/types', {
      method: 'POST',
      body: {
        type_group: item.type_group,
        code: item.code,
        name: item.name,
        is_active: true
      }
    })
    showToast('Тип возвращён в список')
    await loadHouseInfoTypes()
  } catch (e) {
    settingsError.value = e?.data?.detail || e?.message || 'Не удалось вернуть тип'
  } finally {
    houseInfoTypeDeletingId.value = null
  }
}

const makeSpecialtyCode = (name) => {
  const known = {
    сантехник: 'plumber',
    электрик: 'electrician',
    разнорабочий: 'universal'
  }
  const normalized = name.trim().toLowerCase()
  return known[normalized] || `custom_${Date.now()}`
}

const createSpecialty = async () => {
  const name = newSpecialtyName.value.trim()
  if (!name) {
    settingsError.value = 'Укажите название специальности'
    return
  }
  if (containsProfanity(name)) {
    settingsError.value = PROFANITY_ERROR
    showToast(PROFANITY_ERROR, { type: 'error' })
    return
  }

  settingsError.value = ''
  specialtySaving.value = true
  try {
    await api.request('/executors/specialties', {
      method: 'POST',
      body: {
        code: makeSpecialtyCode(name),
        name
      }
    })
    newSpecialtyName.value = ''
    showToast('Специальность добавлена')
    await loadExecutorSpecialties()
  } catch (e) {
    settingsError.value = e?.data?.detail || e?.message || 'Не удалось добавить специальность'
  } finally {
    specialtySaving.value = false
  }
}

const requestDeleteSpecialty = (specialty) => {
  if (!specialty?.id) return
  if (!specialty.can_delete) {
    showToast('Эта специальность уже назначена исполнителю и не может быть удалена', { type: 'error' })
    return
  }
  pendingSpecialtyDelete.value = specialty
}

const closeSpecialtyDelete = () => {
  if (specialtyDeletingId.value) return
  pendingSpecialtyDelete.value = null
}

const confirmDeleteSpecialty = async () => {
  const specialty = pendingSpecialtyDelete.value
  if (!specialty?.id) return

  settingsError.value = ''
  specialtyDeletingId.value = specialty.id
  try {
    await api.request(`/executors/specialties/${specialty.id}`, { method: 'DELETE' })
    showToast('Специальность удалена')
    pendingSpecialtyDelete.value = null
    await loadExecutorSpecialties()
  } catch (e) {
    settingsError.value = e?.data?.detail || e?.message || 'Не удалось удалить специальность'
    showToast(settingsError.value, { type: 'error' })
  } finally {
    specialtyDeletingId.value = null
  }
}

const changePassword = async () => {
  passwordMessage.value = ''
  passwordError.value = ''
  if (passwordForm.new_password !== passwordForm.confirm_password) {
    passwordError.value = 'Новый пароль и повтор не совпадают'
    return
  }
  if (passwordForm.new_password.length < 3) {
    passwordError.value = 'Пароль должен содержать не менее 3 символов'
    showToast(passwordError.value, { type: 'error' })
    return
  }
  if (hasCyrillic(passwordForm.new_password)) {
    passwordError.value = 'Пароль не должен содержать русские буквы'
    showToast(passwordError.value, { type: 'error' })
    return
  }
  try {
    await api.request('/users/me/password', {
      method: 'POST',
      body: {
        old_password: passwordForm.old_password,
        new_password: passwordForm.new_password
      }
    })
    passwordForm.old_password = ''
    passwordForm.new_password = ''
    passwordForm.confirm_password = ''
    await auth.fetchMe()
    showToast('Пароль изменён')
  } catch (e) {
    passwordError.value = e?.data?.detail || e?.message || 'Не удалось изменить пароль'
  }
}

const beforeProfileUnload = (event) => {
  if (!profileHasUnsavedChanges.value) return
  event.preventDefault()
  event.returnValue = ''
}

onBeforeRouteLeave((to) => {
  if (!profileHasUnsavedChanges.value || allowProfileNavigation.value) return true
  pendingProfileNavigation.value = to.fullPath
  unsavedProfileDialogOpen.value = true
  return false
})

const confirmProfileNavigation = async () => {
  const target = pendingProfileNavigation.value || '/dashboard'
  allowProfileNavigation.value = true
  unsavedProfileDialogOpen.value = false
  pendingProfileNavigation.value = ''
  await navigateTo(target)
  setTimeout(() => {
    allowProfileNavigation.value = false
  }, 0)
}

const cancelProfileNavigation = () => {
  unsavedProfileDialogOpen.value = false
  pendingProfileNavigation.value = ''
}

onMounted(async () => {
  if (import.meta.client) window.addEventListener('beforeunload', beforeProfileUnload)
  await loadSettings()
  await Promise.all([
    loadEntrances(),
    loadApartmentResidents(),
    loadExecutorProfile(),
    loadManagedSettings(),
    loadAdminCategories(),
    loadHouseInfoTypes(),
    loadExecutorSpecialties()
  ])
  resizeSettingsTextareas()
})

onBeforeUnmount(() => {
  if (import.meta.client) window.removeEventListener('beforeunload', beforeProfileUnload)
})
</script>

<template>
  <AppPage :title="profileMeta.title" :subtitle="profileMeta.subtitle">
    <div class="panel narrow">
      <div class="profile-grid">
        <div>
          <div class="profile-name">{{ auth.user.value?.full_name || '—' }}</div>
          <div class="muted">Логин: {{ auth.user.value?.login || auth.user.value?.username || '—' }}</div>
          <div class="muted">Роль: {{ formatRole(auth.role.value) }}</div>
        </div>
        <RoleBadge :role="auth.role.value" />
      </div>

      <div class="form-grid">
        <label class="field field--span-2">
          <span>Имя</span>
          <input v-model="form.full_name" type="text" />
        </label>
        <label class="field">
          <span>Логин</span>
          <input v-model="form.login" type="text" />
        </label>
        <label class="field">
          <span>Контактный телефон</span>
          <input v-model="form.contact_phone" type="text" :maxlength="CONTACT_PHONE_MAX_LENGTH" @input="onContactPhoneInput" />
        </label>
      </div>

      <div v-if="error" class="alert alert--error">{{ error }}</div>

      <button class="btn btn--primary" type="button" @click="save">Сохранить профиль</button>
    </div>

    <div v-if="isResident" class="panel narrow">
      <div class="section-title">Адрес жильца</div>
      <div class="profile-details">
        <div class="list-row"><span>Дом</span><strong>{{ formatAddress(auth.user.value?.house) }}</strong></div>
        <div class="list-row"><span>Подъезд</span><strong>{{ entranceNumber ? `Подъезд ${entranceNumber}` : '—' }}</strong></div>
        <div class="list-row"><span>Квартира</span><strong>{{ auth.user.value?.apartment || auth.user.value?.apartment_ref?.apartment_number || '—' }}</strong></div>
      </div>
      <div class="resident-apartment-box">
        <div class="resident-apartment-box__head">
          <div>
            <div class="section-title section-title--compact">Зарегистрированы в квартире</div>
            <p>Пользователи сервиса, привязанные к этой квартире.</p>
          </div>
          <label class="resident-lock-toggle">
            <input
              v-model="residentRestrictionDraft"
              type="checkbox"
              :disabled="residentRestrictionSaving"
              @change="onResidentRestrictionChange"
            />
            <span>Запрет добавления жителей</span>
          </label>
        </div>
        <div v-if="residentResidentsLoading" class="muted">Загружаем список жителей...</div>
        <div v-else-if="residentApartmentResidents.length" class="resident-neighbor-list">
          <div v-for="resident in residentApartmentResidents" :key="resident.id" class="resident-neighbor-row">
            <div>
              <strong>{{ resident.full_name }}</strong>
              <span>{{ resident.is_current_user ? 'Это Вы' : 'Житель квартиры' }}</span>
            </div>
            <small v-if="resident.contact_phone">{{ resident.contact_phone }}</small>
            <small v-else>Телефон не указан</small>
          </div>
        </div>
        <div v-else class="empty-box">В квартире пока нет других зарегистрированных жителей.</div>
      </div>
      <div class="stack">
        <NuxtLink class="list-row list-row--link" to="/announcements"><span>Объявления</span><strong>Открыть</strong></NuxtLink>
        <NuxtLink class="list-row list-row--link" to="/house-info"><span>Информация по дому</span><strong>Открыть</strong></NuxtLink>
        <NuxtLink class="list-row list-row--link" to="/tickets"><span>Мои заявки</span><strong>Открыть</strong></NuxtLink>
      </div>
    </div>

    <div v-if="isExecutor" class="panel narrow executor-profile-panel">
      <div class="executor-profile-hero">
        <div class="executor-profile-hero__icon">И</div>
        <div>
          <div class="eyebrow">Рабочий профиль</div>
          <h2>Профиль исполнителя</h2>
          <p>Здесь отображаются специализации, назначенный администратором график и информация, которую видит диспетчер при назначении заявки.</p>
        </div>
      </div>
      <div v-if="executorLoading" class="muted">Загрузка профиля исполнителя...</div>
      <div v-else-if="executorError && !executorProfile" class="alert alert--error">{{ executorError }}</div>
      <template v-else-if="executorProfile">
        <div class="executor-profile-overview">
          <div class="executor-profile-card executor-profile-card--accent">
            <span>Основная специализация</span>
            <strong>{{ primarySpecialty }}</strong>
          </div>
          <div class="executor-profile-card">
            <span>Все специализации</span>
            <strong>{{ allSpecialties || '—' }}</strong>
          </div>
          <div class="executor-profile-card">
            <span>Закреплённый дом</span>
            <strong>{{ executorProfile.house_id ? formatAddress(executorProfile.house || auth.user.value?.house) : 'Не закреплён' }}</strong>
          </div>
        </div>

        <div class="executor-profile-section">
          <div class="executor-profile-section__head">
            <div>
              <span>Рабочий график</span>
              <h3>{{ activeScheduleItems.length ? `${activeScheduleItems.length} рабочих дн.` : 'Не настроен' }}</h3>
            </div>
            <div v-if="inactiveScheduleCount" class="executor-schedule-summary__note">
              Нерабочих дней: {{ inactiveScheduleCount }}
            </div>
          </div>
          <div v-if="activeScheduleItems.length" class="executor-schedule-summary__days">
            <div v-for="item in activeScheduleItems" :key="item.weekday" class="executor-schedule-summary__day">
              <span>{{ item.weekday }}</span>
              <strong>{{ item.start }}–{{ item.end }}</strong>
            </div>
          </div>
          <div v-else class="empty-box">Рабочие дни пока не выбраны.</div>
          <div class="muted-box muted-box--compact">
            График назначает администратор. Если расписание нужно изменить, обратитесь к администратору или диспетчеру.
          </div>
        </div>

        <div class="executor-profile-section">
          <div class="executor-profile-section__head">
            <div>
              <span>Информация для диспетчера</span>
              <h3>Рабочие данные</h3>
            </div>
            <NuxtLink class="executor-review-link" to="/reviews">
              <span>Отзывы</span>
              <strong>Оценки жителей</strong>
            </NuxtLink>
          </div>
          <div class="form-grid">
            <label class="field">
              <span>Рабочий телефон</span>
              <input v-model="executorEditor.phone" type="text" />
            </label>
            <label class="field field--span-2">
              <span>О себе</span>
              <textarea v-model="executorEditor.notes" placeholder="Расскажите о своей специализации, опыте, инструментах и особенностях работы. Эту информацию увидит диспетчер при назначении на заявку." />
            </label>
          </div>
          <button class="btn btn--primary" type="button" :disabled="executorSaving" @click="saveExecutorProfile">
            {{ executorSaving ? 'Сохраняем...' : 'Сохранить изменения' }}
          </button>
        </div>

        <div class="executor-profile-section executor-profile-section--soft">
          <div class="executor-profile-section__head">
            <div>
              <span>Недоступность</span>
              <h3>Выходные</h3>
            </div>
          </div>
          <div class="muted-box muted-box--compact">
            Своё отсутствие Вам необходимо будет подтвердить документально в соответствии с действующим законодательством. Добавленный выходной можно удалить, если он был указан ошибочно.
          </div>
          <div class="form-grid">
            <label class="field">
              <span>Дата</span>
              <input v-model="executorEditor.dayOffDate" type="date" />
            </label>
            <label class="field">
              <span>Причина</span>
              <input v-model="executorEditor.dayOffReason" type="text" placeholder="Отпуск, больничный, личные дела" />
            </label>
          </div>

          <div class="toolbar">
            <button class="btn btn--primary" type="button" :disabled="executorDayOffSaving" @click="addDayOff">
              {{ executorDayOffSaving ? 'Добавляем...' : 'Добавить выходной' }}
            </button>
          </div>

          <div v-if="activeDaysOff.length" class="executor-days-off-list">
            <div v-for="dayOff in activeDaysOff" :key="dayOff.id" class="executor-day-off-card">
              <div>
                <span>{{ formatDate(dayOff.off_date, { timeStyle: false }) }}</span>
                <strong>{{ dayOff.reason || 'Причина не указана' }}</strong>
              </div>
              <button class="btn btn--ghost btn--sm" type="button" @click="removeDayOff(dayOff.id)">Удалить</button>
            </div>
          </div>
          <div v-else class="empty-box">Активных выходных пока нет.</div>
        </div>

        <div v-if="executorError" class="alert alert--error">{{ executorError }}</div>
      </template>
    </div>

    <div v-if="canManageAdminSettings" class="panel narrow">
      <div class="section-title">Настройки веб-версии</div>
      <div class="muted-box">
        Здесь настраиваются заголовки, оформление страницы входа, тексты мобильного приложения и правила пользования сервисом.
      </div>

      <div v-if="settingsLoading" class="muted">Загрузка настроек...</div>
      <div v-else class="settings-admin-grid">
        <section class="settings-card">
          <div class="settings-card__head">
            <div>
              <div class="settings-card__eyebrow">Web</div>
              <h3>Заголовки веб-версии</h3>
            </div>
            <span v-if="settingsSnapshots.web && settingsSnapshots.web !== settingsBlockSnapshot('web')" class="settings-card__dirty">Не сохранено</span>
          </div>
          <p>Тексты отображаются на странице входа, в меню и в разделах web-приложения.</p>
          <div class="form-grid form-grid--compact">
            <label class="field field--span-2">
              <span>Текст бренда</span>
              <input v-model="settingsForm.app_brand" type="text" />
            </label>
            <label class="field field--span-2">
              <span>Заголовок страницы входа</span>
              <input v-model="settingsForm.login_title" type="text" />
            </label>
          </div>
          <div class="login-background-admin__box">
            <div
              class="login-background-admin__preview"
              :class="{ 'login-background-admin__preview--empty': !loginBackgroundPreviewUrl }"
              :style="loginBackgroundPreviewUrl ? { backgroundImage: `url(${loginBackgroundPreviewUrl})` } : {}"
            >
              <span v-if="!loginBackgroundPreviewUrl">Стандартный фон</span>
            </div>
            <div class="login-background-admin__content">
              <strong>Фон страницы авторизации</strong>
              <p>Если изображение не загружено, будет использоваться стандартный спокойный фон.</p>
              <input ref="loginBackgroundInput" type="file" accept="image/*" @change="onLoginBackgroundSelected" />
              <small v-if="loginBackgroundFileName">Выбрано: {{ loginBackgroundFileName }}</small>
              <div class="toolbar">
                <button class="btn btn--ghost btn--sm" type="button" :disabled="loginBackgroundSaving || !loginBackgroundFile" @click="uploadLoginBackground">
                  {{ loginBackgroundSaving ? 'Загружаем...' : 'Загрузить фон' }}
                </button>
                <button v-if="settingsForm.login_background_image" class="btn btn--ghost btn--sm" type="button" :disabled="loginBackgroundSaving" @click="clearLoginBackground">
                  Вернуть стандартный
                </button>
              </div>
            </div>
          </div>
          <button class="btn btn--primary" type="button" :disabled="webSettingsSaving" @click="saveWebBrandingSettings">
            {{ webSettingsSaving ? 'Сохраняем...' : 'Сохранить изменения' }}
          </button>
        </section>

        <section class="settings-card">
          <div class="settings-card__head">
            <div>
              <div class="settings-card__eyebrow">Mobile</div>
              <h3>Заголовки мобильного приложения</h3>
            </div>
            <span v-if="settingsSnapshots.mobile && settingsSnapshots.mobile !== settingsBlockSnapshot('mobile')" class="settings-card__dirty">Не сохранено</span>
          </div>
          <p>Эти тексты отображаются на экране авторизации в мобильном приложении.</p>
          <div class="form-grid form-grid--compact">
            <label class="field field--span-2">
              <span>Надпись сверху</span>
              <input v-model="settingsForm.mobile_login_brand" type="text" />
            </label>
            <label class="field field--span-2">
              <span>Заголовок</span>
              <input v-model="settingsForm.mobile_login_title" type="text" />
            </label>
            <label class="field field--span-2">
              <span>Описание</span>
              <textarea
                ref="mobileSubtitleTextarea"
                v-model="settingsForm.mobile_login_subtitle"
                class="textarea-autogrow"
                rows="2"
                @input="autoResizeSettingsTextarea($event, 96)"
              />
            </label>
          </div>
          <button class="btn btn--primary" type="button" :disabled="mobileSettingsSaving" @click="saveMobileLoginSettings">
            {{ mobileSettingsSaving ? 'Сохраняем...' : 'Сохранить изменения' }}
          </button>
        </section>

        <section class="settings-card settings-card--wide">
          <div class="settings-card__head">
            <div>
              <div class="settings-card__eyebrow">Правила</div>
              <h3>Правила пользования сервисом</h3>
            </div>
            <span v-if="settingsSnapshots.rules && settingsSnapshots.rules !== settingsBlockSnapshot('rules')" class="settings-card__dirty">Не сохранено</span>
          </div>
          <p>Текст увидит житель на экране блокировки в мобильном приложении.</p>
          <label class="field">
            <span>Текст правил</span>
            <textarea
              ref="serviceRulesTextarea"
              v-model="settingsForm.service_rules_text"
              class="textarea-autogrow"
              rows="7"
              placeholder="Текст, который увидит житель на экране блокировки в мобильном приложении"
              @input="autoResizeSettingsTextarea($event, 178)"
            />
          </label>
          <button class="btn btn--primary" type="button" :disabled="rulesSettingsSaving" @click="saveServiceRulesSettings">
            {{ rulesSettingsSaving ? 'Сохраняем...' : 'Сохранить изменения' }}
          </button>
        </section>
      </div>

      <div class="section-title section-title--spaced">Категории заявок</div>
      <div class="form-grid">
        <label class="field">
          <span>Тип категории</span>
          <select v-model="newCategoryType">
            <option value="problem">Вид проблемы</option>
            <option value="location">Где возникла проблема</option>
          </select>
        </label>
        <label class="field field--span-2">
          <span>Новая категория</span>
          <input
            v-model="newCategoryName"
            type="text"
            :placeholder="newCategoryType === 'location' ? 'Например: Парковка или Детская площадка' : 'Например: Отопление или Лифт'"
          />
        </label>
      </div>
      <div class="toolbar">
        <button class="btn btn--ghost" type="button" :disabled="categorySaving" @click="createCategory">
          {{ categorySaving ? 'Добавляем...' : 'Добавить категорию' }}
        </button>
      </div>
      <div v-if="adminCategories.length" class="category-admin-groups">
        <div class="category-admin-group">
          <div class="complaint-subtitle">Виды проблем</div>
          <div v-if="adminProblemCategories.length" class="stack">
            <div v-for="category in adminProblemCategories" :key="category.id" class="list-row list-row--wrap">
              <span>{{ category.name }}</span>
              <button
                class="btn btn--ghost btn--sm"
                type="button"
                :disabled="categoryDeletingId === category.id"
                @click="removeCategory(category.id)"
              >
                {{ categoryDeletingId === category.id ? 'Удаляем...' : 'Удалить' }}
              </button>
            </div>
          </div>
          <div v-else class="empty-box">Категорий проблем пока нет.</div>
        </div>

        <div class="category-admin-group">
          <div class="complaint-subtitle">Где возникла проблема</div>
          <div v-if="adminLocationCategories.length" class="stack">
            <div v-for="category in adminLocationCategories" :key="category.id" class="list-row list-row--wrap">
              <span>{{ category.name }}</span>
              <button
                class="btn btn--ghost btn--sm"
                type="button"
                :disabled="categoryDeletingId === category.id"
                @click="removeCategory(category.id)"
              >
                {{ categoryDeletingId === category.id ? 'Удаляем...' : 'Удалить' }}
              </button>
            </div>
          </div>
          <div v-else class="empty-box">Категорий мест пока нет.</div>
        </div>
      </div>
      <div v-else class="empty-box">Категории пока не добавлены.</div>

      <div class="section-title section-title--spaced">Типы домовой информации</div>
      <div class="muted-box">
        Эти значения используются в разделах «Плановые работы и отключения» и «Графики уборки и планового обслуживания».
      </div>
      <div class="form-grid">
        <label class="field">
          <span>Группа</span>
          <select v-model="newHouseInfoTypeGroup">
            <option value="schedule">Графики уборки и обслуживания</option>
            <option value="event">Плановые работы и отключения</option>
          </select>
        </label>
        <label class="field field--span-2">
          <span>Новый тип</span>
          <input
            v-model="newHouseInfoTypeName"
            type="text"
          />
        </label>
      </div>
      <div class="toolbar">
        <button class="btn btn--ghost" type="button" :disabled="houseInfoTypeSaving" @click="createHouseInfoType">
          {{ houseInfoTypeSaving ? 'Добавляем...' : 'Добавить тип' }}
        </button>
      </div>
      <div v-if="houseInfoTypes.length" class="category-admin-groups">
        <div class="category-admin-group">
          <div class="complaint-subtitle">Плановые работы и отключения</div>
          <div v-if="adminEventTypes.length" class="stack">
            <div v-for="item in adminEventTypes" :key="item.id" class="list-row list-row--wrap house-info-type-row" :class="{ 'house-info-type-row--hidden': !item.is_active }">
              <span>
                {{ item.name }}
                <small v-if="!item.is_active" class="house-info-type-row__status">Скрыт</small>
              </span>
              <button
                class="btn btn--ghost btn--sm btn--compact"
                type="button"
                :disabled="houseInfoTypeDeletingId === item.id"
                :title="item.is_active ? 'Тип останется в базе данных, но исчезнет из форм выбора.' : 'Вернуть тип в формы выбора.'"
                @click="item.is_active ? removeHouseInfoType(item.id) : restoreHouseInfoType(item)"
              >
                {{ houseInfoTypeDeletingId === item.id ? (item.is_active ? 'Скрываем...' : 'Возвращаем...') : (item.is_active ? 'Скрыть' : 'Вернуть') }}
              </button>
            </div>
          </div>
          <div v-else class="empty-box">Типов пока нет.</div>
        </div>
        <div class="category-admin-group">
          <div class="complaint-subtitle">Графики уборки и обслуживания</div>
          <div v-if="adminScheduleTypes.length" class="stack">
            <div v-for="item in adminScheduleTypes" :key="item.id" class="list-row list-row--wrap house-info-type-row" :class="{ 'house-info-type-row--hidden': !item.is_active }">
              <span>
                {{ item.name }}
                <small v-if="!item.is_active" class="house-info-type-row__status">Скрыт</small>
              </span>
              <button
                class="btn btn--ghost btn--sm btn--compact"
                type="button"
                :disabled="houseInfoTypeDeletingId === item.id"
                :title="item.is_active ? 'Тип останется в базе данных, но исчезнет из форм выбора.' : 'Вернуть тип в формы выбора.'"
                @click="item.is_active ? removeHouseInfoType(item.id) : restoreHouseInfoType(item)"
              >
                {{ houseInfoTypeDeletingId === item.id ? (item.is_active ? 'Скрываем...' : 'Возвращаем...') : (item.is_active ? 'Скрыть' : 'Вернуть') }}
              </button>
            </div>
          </div>
          <div v-else class="empty-box">Типов пока нет.</div>
        </div>
      </div>

      <div v-if="canManageExecutorSpecialties">
        <div class="specialty-admin-panel">
          <div class="specialty-admin-panel__head">
            <div>
              <div class="section-title section-title--spaced">Специальности исполнителей</div>
              <p>Добавляйте только те специальности, которые реально используются при назначении исполнителей.</p>
            </div>
            <span class="specialty-admin-panel__count">{{ executorSpecialties.length }}</span>
          </div>
          <div class="specialty-admin-panel__form">
            <label class="field">
              <span>Новая специальность</span>
              <input v-model="newSpecialtyName" type="text" />
            </label>
            <button class="btn btn--primary" type="button" :disabled="specialtySaving" @click="createSpecialty">
              {{ specialtySaving ? 'Добавляем...' : 'Добавить' }}
            </button>
          </div>
        </div>
        <div v-if="executorSpecialties.length" class="specialty-admin-list">
          <div v-for="specialty in executorSpecialties" :key="specialty.id" class="specialty-admin-item">
            <div>
              <span>{{ formatSpecialty(specialty.name || specialty.code) }}</span>
              <small>{{ specialty.executor_count ? `Исполнителей: ${specialty.executor_count}` : 'Не используется' }}</small>
            </div>
            <button
              class="btn btn--ghost btn--sm btn--compact specialty-admin-item__delete"
              type="button"
              :disabled="specialtyDeletingId === specialty.id || !specialty.can_delete"
              :title="specialty.can_delete ? 'Удалить специальность из базы' : 'Нельзя удалить: специальность назначена исполнителю'"
              @click="requestDeleteSpecialty(specialty)"
            >
              {{ specialtyDeletingId === specialty.id ? 'Удаляем...' : 'Удалить' }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="settingsError" class="alert alert--error">{{ settingsError }}</div>
    </div>

    <div v-if="canManageAuditorSettings" class="panel narrow">
      <div class="section-title">Пороги рассмотрения жалоб</div>
      <div class="muted-box">
        Здесь аудитор задаёт время ожидания для жалобы на отсутствие реакции и обращения в контролирующий орган. Допустимый диапазон: от 1 минуты до 6 часов.
      </div>

      <div v-if="settingsLoading" class="muted">Загрузка настроек...</div>
      <div v-else class="form-grid">
        <label class="field">
          <span>Часы до обращения в контролирующий орган</span>
          <input v-model.number="settingsForm.escalation_hours" type="number" min="0" max="6" />
        </label>
        <label class="field">
          <span>Минуты до обращения в контролирующий орган</span>
          <input v-model.number="settingsForm.escalation_minutes" type="number" min="0" max="59" />
        </label>
        <label class="field">
          <span>Часы до жалобы на отсутствие реакции</span>
          <input v-model.number="settingsForm.overdue_hours" type="number" min="0" max="6" />
        </label>
        <label class="field">
          <span>Минуты до жалобы на отсутствие реакции</span>
          <input v-model.number="settingsForm.overdue_minutes" type="number" min="0" max="59" />
        </label>
        <label class="field field--span-2">
          <span>Лимит обычных жалоб по одной заявке</span>
          <input v-model.number="settingsForm.complaint_primary_limit" type="number" min="1" max="10" />
        </label>
      </div>
      <div class="muted-box">
        В этот лимит входят жалобы на качество и жалобы типа «Просрочено / нет реакции».
      </div>

      <div v-if="settingsError" class="alert alert--error">{{ settingsError }}</div>

      <button class="btn btn--primary" type="button" :disabled="settingsSaving" @click="saveAuditorComplaintSettings">
        {{ settingsSaving ? 'Сохраняем...' : 'Сохранить изменения' }}
      </button>
    </div>

    <div class="panel narrow">
      <div class="section-title">Сменить пароль</div>
      <div v-if="auth.user.value?.must_change_password" class="alert alert--warning">
        Вы вошли с временным паролем. Для продолжения работы замените его на новый.
      </div>
      <div class="form-grid">
        <label class="field field--span-2">
          <span>Текущий пароль</span>
          <input v-model="passwordForm.old_password" type="password" />
        </label>
        <label class="field">
          <span>Новый пароль</span>
          <input v-model="passwordForm.new_password" type="password" />
        </label>
        <label class="field">
          <span>Повторите пароль</span>
          <input v-model="passwordForm.confirm_password" type="password" />
        </label>
      </div>

      <div v-if="passwordError" class="alert alert--error">{{ passwordError }}</div>

      <button class="btn btn--primary" type="button" @click="changePassword">Изменить пароль</button>
    </div>

    <ConfirmDialog
      :open="Boolean(pendingSpecialtyDelete)"
      title="Удалить специальность"
      :message="`Удалить специальность «${formatSpecialty(pendingSpecialtyDelete?.name || pendingSpecialtyDelete?.code)}»? Она исчезнет из списка выбора для новых исполнителей.`"
      confirm-label="Да, удалить"
      tone="danger"
      :busy="Boolean(specialtyDeletingId)"
      @confirm="confirmDeleteSpecialty"
      @close="closeSpecialtyDelete"
    />

    <ConfirmDialog
      :open="residentRestrictionConfirmOpen"
      title="Запретить добавление жителей"
      message="После включения запрета администратор, помощник администратора и другие сотрудники не смогут добавить нового жителя в эту квартиру, пока запрет не будет снят."
      confirm-label="Да, запретить"
      cancel-label="Отмена"
      :busy="residentRestrictionSaving"
      @confirm="confirmResidentRestriction"
      @close="cancelResidentRestriction"
    />

    <ConfirmDialog
      :open="unsavedProfileDialogOpen"
      title="Есть несохранённые изменения"
      message="На странице профиля остались несохранённые изменения. Перейти в другой раздел без сохранения?"
      confirm-label="Перейти без сохранения"
      cancel-label="Остаться"
      tone="danger"
      :show-close="false"
      @confirm="confirmProfileNavigation"
      @close="cancelProfileNavigation"
    />
  </AppPage>
</template>

<style scoped>
.resident-apartment-box {
  margin-top: 18px;
  border: 1px solid rgba(91, 141, 239, 0.18);
  border-radius: 24px;
  padding: 18px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.74);
}

.resident-apartment-box__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.resident-apartment-box__head p {
  margin: 4px 0 0;
  color: var(--text-soft);
}

.section-title--compact {
  margin-bottom: 0;
}

.resident-lock-toggle {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: max-content;
  border: 1px solid rgba(59, 102, 232, 0.18);
  border-radius: 999px;
  padding: 10px 14px;
  background: rgba(238, 244, 255, 0.84);
  color: var(--text);
  font-weight: 700;
  cursor: pointer;
}

.resident-lock-toggle input {
  width: 18px;
  height: 18px;
  accent-color: #3867e8;
}

.resident-neighbor-list {
  display: grid;
  gap: 10px;
}

.resident-neighbor-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  border: 1px solid rgba(91, 141, 239, 0.16);
  border-radius: 18px;
  padding: 13px 15px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(245, 249, 255, 0.86));
}

.resident-neighbor-row div {
  display: grid;
  gap: 3px;
}

.resident-neighbor-row span,
.resident-neighbor-row small {
  color: var(--text-soft);
}

@media (max-width: 720px) {
  .resident-apartment-box__head,
  .resident-neighbor-row {
    flex-direction: column;
    align-items: stretch;
  }

  .resident-lock-toggle {
    justify-content: center;
    min-width: 0;
  }
}
</style>
