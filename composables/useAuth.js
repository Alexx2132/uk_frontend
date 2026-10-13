function normalizeRole(value) {
  if (!value) return ''
  return String(value).trim().toLowerCase()
}

const API_TIMEOUT_MS = 10000
const INVALID_CREDENTIALS_MESSAGE = 'Сессия истекла или недействительна. Войдите снова.'

function getFriendlyAuthError(error, fallback = 'Не удалось выполнить запрос') {
  const detail = error?.data?.detail
  if (typeof detail === 'string' && detail.trim()) {
    const normalized = detail.trim()
    if (normalized === 'Could not validate credentials' || normalized === 'Not authenticated') return INVALID_CREDENTIALS_MESSAGE
    return normalized
  }
  if (Array.isArray(detail) && detail.length) {
    const locations = detail
      .map((item) => Array.isArray(item?.loc) ? String(item.loc[item.loc.length - 1] || '').toLowerCase() : '')
      .filter(Boolean)

    const hasUsername = locations.includes('username')
    const hasPassword = locations.includes('password')

    if (hasUsername && hasPassword) return 'Введите логин и пароль'
    if (hasUsername) return 'Введите логин'
    if (hasPassword) return 'Введите пароль'
    return fallback
  }

  const message = String(error?.message || '')
  if (!error?.response || /NetworkError|Failed to fetch|fetch resource/i.test(message)) {
    return 'Сервер временно недоступен. Проверьте, что backend запущен и адрес API указан верно.'
  }

  return message || fallback
}

export function useAuth() {
  const restoring = useState('uk_auth_restoring', () => false)
  const { safeGet, safeSet, safeRemove } = useStorage()
  const config = useRuntimeConfig()

  const parseSavedUser = () => {
    const savedUser = safeGet('uk_user', '')
    if (!savedUser) return null
    try {
      return typeof savedUser === 'string' ? JSON.parse(savedUser) : savedUser
    } catch {
      return null
    }
  }

  const token = useState('uk_token_state', () => safeGet('uk_token', '') || '')
  const user = useState('uk_user_state', () => parseSavedUser())

  const role = computed(() => normalizeRole(user.value?.role))
  const isLoggedIn = computed(() => Boolean(token.value && user.value))

  const fetchMe = async () => {
    if (!token.value) return null
    const me = await $fetch('/users/me', {
      baseURL: config.public.apiBase,
      timeout: API_TIMEOUT_MS,
      headers: { Authorization: `Bearer ${token.value}` }
    })
    user.value = me
    safeSet('uk_user', JSON.stringify(me))
    return me
  }

  const login = async (username, password) => {
    const form = new URLSearchParams()
    form.set('username', username)
    form.set('password', password)
    try {
      const loginResponse = await $fetch('/auth/login', {
        baseURL: config.public.apiBase,
        method: 'POST',
        timeout: API_TIMEOUT_MS,
        body: form,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      })

      token.value = loginResponse.access_token
      safeSet('uk_token', token.value)
      await fetchMe()
      return user.value
    } catch (error) {
      error.message = getFriendlyAuthError(error, 'Не удалось войти')
      throw error
    }
  }

  const restore = async () => {
    if (process.server || restoring.value) return
    restoring.value = true
    try {
      const savedToken = safeGet('uk_token', '')
      const savedUser = safeGet('uk_user', '')
      if (!savedToken) return
      token.value = savedToken
      if (savedUser) {
        try { user.value = typeof savedUser === 'string' ? JSON.parse(savedUser) : savedUser } catch {}
      }
      try {
        await fetchMe()
      } catch {
        await logout()
      }
    } finally {
      restoring.value = false
    }
  }

  const logout = async () => {
    token.value = ''
    user.value = null
    safeRemove('uk_token')
    safeRemove('uk_user')
    if (process.client) await navigateTo('/')
  }

  const hasRole = (...roles) => roles.map(normalizeRole).includes(role.value)

  return { token, user, role, isLoggedIn, login, fetchMe, restore, logout, hasRole }
}
