const SETTINGS_UNAVAILABLE_MESSAGE = 'Не удалось загрузить настройки оформления. Проверьте, что backend запущен и доступен.'
const API_TIMEOUT_MS = 10000

export function useAppSettings() {
  const config = useRuntimeConfig()
  const settings = useState('uk_app_settings', () => ({
    complaint_escalate_after_minutes: 360,
    complaint_overdue_after_minutes: 360,
    complaint_primary_limit: 2,
    password_recovery_cooldown_minutes: 5,
    app_brand: config.public.appName || 'UK WEB',
    login_title: 'Вход в веб-версию',
    mobile_login_brand: 'Управляющая компания',
    mobile_login_title: 'Вход в систему',
    mobile_login_subtitle: 'Жители отслеживают заявки, сотрудники контролируют их исполнение.',
    login_background_image: null,
    service_rules_text: 'Пользуйтесь сервисом добросовестно: не дублируйте заявки, указывайте достоверную информацию и соблюдайте уважительный тон в общении.'
  }))
  const loaded = useState('uk_app_settings_loaded', () => false)
  const loading = useState('uk_app_settings_loading', () => false)
  const error = useState('uk_app_settings_error', () => '')

  const applySettings = (payload = {}) => {
    settings.value = {
      ...settings.value,
      ...payload,
      app_brand: payload.app_brand || settings.value.app_brand || config.public.appName || 'UK WEB',
      login_title: payload.login_title || settings.value.login_title || 'Вход в веб-версию',
      mobile_login_brand: payload.mobile_login_brand || settings.value.mobile_login_brand || 'Управляющая компания',
      mobile_login_title: payload.mobile_login_title || settings.value.mobile_login_title || 'Вход в систему',
      mobile_login_subtitle: payload.mobile_login_subtitle || settings.value.mobile_login_subtitle || 'Жители отслеживают заявки, сотрудники контролируют их исполнение.',
      login_background_image: payload.login_background_image ?? settings.value.login_background_image ?? null,
      service_rules_text: payload.service_rules_text || settings.value.service_rules_text || 'Пользуйтесь сервисом добросовестно: не дублируйте заявки, указывайте достоверную информацию и соблюдайте уважительный тон в общении.',
      password_recovery_cooldown_minutes: Number(payload.password_recovery_cooldown_minutes || settings.value.password_recovery_cooldown_minutes || 5)
    }
    loaded.value = true
    error.value = ''
    return settings.value
  }

  const loadSettings = async ({ force = false } = {}) => {
    if (process.server) return settings.value
    if (loading.value) return settings.value
    if (loaded.value && !force) return settings.value

    loading.value = true
    try {
      const payload = await $fetch('/settings/app', {
        baseURL: config.public.apiBase,
        timeout: API_TIMEOUT_MS
      })
      return applySettings(payload)
    } catch {
      error.value = SETTINGS_UNAVAILABLE_MESSAGE
      return settings.value
    } finally {
      loading.value = false
    }
  }

  return { settings, loaded, loading, error, loadSettings, applySettings }
}
