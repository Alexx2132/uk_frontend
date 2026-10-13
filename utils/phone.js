export const CONTACT_PHONE_REQUIRED_ERROR = 'Введите контактный телефон'
export const CONTACT_PHONE_FORMAT_ERROR = 'Укажите контактный телефон в формате +79001234567'
export const CONTACT_PHONE_MAX_LENGTH = 12

export const formatContactPhoneInput = (value) => {
  const digits = String(value || '').replace(/\D/g, '')
  let localDigits = digits

  if (localDigits.startsWith('7') || localDigits.startsWith('8')) {
    localDigits = localDigits.slice(1)
  }

  return `+7${localDigits.slice(0, 10)}`
}

export const normalizeContactPhone = (value) => {
  const raw = String(value || '').trim()
  if (!raw || raw === '+7') return null

  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `+7${digits}`
  if (digits.length === 11 && digits.startsWith('8')) return `+7${digits.slice(1)}`
  if (digits.length === 11 && digits.startsWith('7')) return `+${digits}`
  return null
}

export const validateContactPhone = (value, { required = false } = {}) => {
  const raw = String(value || '').trim()
  if (!raw || raw === '+7') {
    return required
      ? { ok: false, value: null, error: CONTACT_PHONE_REQUIRED_ERROR }
      : { ok: true, value: null, error: '' }
  }

  const normalized = normalizeContactPhone(raw)
  if (!normalized || !/^\+7\d{10}$/.test(normalized)) {
    return { ok: false, value: null, error: CONTACT_PHONE_FORMAT_ERROR }
  }

  return { ok: true, value: normalized, error: '' }
}
