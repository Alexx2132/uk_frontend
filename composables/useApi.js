const SERVER_UNAVAILABLE_MESSAGE = 'Сервер временно недоступен. Проверьте, что backend запущен и адрес API указан верно.'
const INVALID_CREDENTIALS_MESSAGE = 'Сессия истекла или недействительна. Войдите снова.'
const API_TIMEOUT_MS = 10000

function extractDetail(detail) {
  if (Array.isArray(detail)) return detail.map((item) => extractDetail(item)).filter(Boolean).join('; ')
  if (detail && typeof detail === 'object') return detail.msg || detail.detail || detail.message || ''
  return typeof detail === 'string' ? detail : ''
}

function validationFieldLabel(field) {
  const labels = {
    full_name: 'имя',
    first_name: 'имя',
    last_name: 'фамилию',
    login: 'логин',
    username: 'логин',
    phone: 'логин',
    password: 'пароль',
    role: 'роль',
    specialty_ids: 'специализацию',
    primary_specialty_id: 'основную специализацию',
    house_id: 'дом',
    apartment: 'квартиру',
    contact_phone: 'контактный телефон',
    comment: 'комментарий',
    title: 'название',
    description: 'описание'
  }
  return labels[field] || field
}

function extractValidationMessages(detail) {
  if (!Array.isArray(detail)) return ''

  const messages = detail.map((item) => {
    const loc = Array.isArray(item?.loc) ? item.loc : []
    const field = loc[loc.length - 1]
    const label = validationFieldLabel(field)
    const type = String(item?.type || '')

    if (type.includes('missing') || type.includes('string_type') || item?.input === null) {
      return `Заполните поле: ${label}`
    }
    if (type.includes('int_parsing') || type.includes('int_type')) {
      return `Проверьте значение поля: ${label}`
    }
    if (type.includes('list_type')) {
      return `Выберите значение: ${label}`
    }
    return item?.msg ? `${label}: ${item.msg}` : ''
  }).filter(Boolean)

  return [...new Set(messages)].join('. ')
}

export function getApiErrorMessage(error, fallback = 'Не удалось выполнить запрос') {
  const rawDetail = error?.data?.detail || error?.response?._data?.detail
  const validationMessage = extractValidationMessages(rawDetail)
  if (validationMessage) return validationMessage

  const detail = extractDetail(rawDetail)
  if (detail === 'Could not validate credentials' || detail === 'Not authenticated') return INVALID_CREDENTIALS_MESSAGE
  if (detail) return detail

  const rawMessage = String(error?.message || '')
  if (!error?.response || /NetworkError|Failed to fetch|fetch resource/i.test(rawMessage)) {
    return SERVER_UNAVAILABLE_MESSAGE
  }

  return error?.message || fallback
}

export function useApi() {
  const apiBase = useApiBase()
  const auth = useAuth()

  const request = async (path, options = {}) => {
    const headers = { ...(options.headers || {}) }
    if (auth.token.value) headers.Authorization = `Bearer ${auth.token.value}`
    const { timeout = API_TIMEOUT_MS, ...fetchOptions } = options

    try {
      return await $fetch(path, {
        baseURL: apiBase,
        timeout,
        ...fetchOptions,
        headers
      })
    } catch (error) {
      const message = getApiErrorMessage(error)
      error.message = message
      if (error?.data?.detail && message !== extractDetail(error.data.detail)) {
        error.data.detail = message
      }
      throw error
    }
  }

  return { request }
}
