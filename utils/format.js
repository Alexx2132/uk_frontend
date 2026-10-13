export function parseApiDate(value) {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value

  const text = String(value).trim()
  if (!text) return null

  const normalized = /(?:Z|[+-]\d{2}:\d{2})$/i.test(text)
    ? text
    : text.replace(' ', 'T').replace(/(\.\d+)?$/, '') + 'Z'

  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}

export function formatDate(value, options = {}) {
  if (!value) return '—'
  const date = parseApiDate(value)
  if (!date) return String(value).replace('T', ' ')

  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    dateStyle: options.dateStyle || 'medium',
    timeStyle: options.timeStyle === false ? undefined : (options.timeStyle || 'short')
  }).format(date)
}

export function formatDateInputValue(value) {
  if (!value) return ''
  const date = parseApiDate(value)
  if (!date) return ''

  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date)

  const get = (type) => parts.find((item) => item.type === type)?.value || ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function formatDateTimeInputValue(value) {
  if (!value) return ''
  const date = parseApiDate(value)
  if (!date) return ''

  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date)

  const get = (type) => parts.find((item) => item.type === type)?.value || ''
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}

export function formatAddress(house) {
  if (!house) return '—'
  return [house.city || '', house.address || ''].filter(Boolean).join(', ') || '—'
}

export function formatRole(role) {
  const labels = {
    admin: 'Администратор',
    admin_assistant: 'Помощник администратора',
    dispatcher: 'Диспетчер',
    executor: 'Исполнитель',
    auditor: 'Аудитор',
    resident: 'Житель'
  }
  return labels[String(role || '').toLowerCase()] || role || '—'
}

export function formatSpecialty(value) {
  const labels = {
    plumber: 'Сантехник',
    electrician: 'Электрик',
    universal: 'Разнорабочий'
  }
  return labels[String(value || '').toLowerCase()] || value || '—'
}

export function formatTicketStatus(value) {
  const labels = {
    created: 'Создана',
    assigned: 'Назначена',
    in_progress: 'В работе',
    done: 'Выполнена',
    closed: 'Принята жителем',
    canceled: 'Отменена'
  }
  return labels[String(value || '').toLowerCase()] || value || '—'
}

export function formatTicketPriority(value) {
  const labels = {
    low: 'Низкий',
    normal: 'Обычный',
    high: 'Высокий',
    emergency: 'Аварийный'
  }
  return labels[String(value || '').toLowerCase()] || 'Обычный'
}

export function extractResidentReview(resultComment) {
  const text = String(resultComment || '').trim()
  if (!text) return ''
  const markers = ['Отзыв жителя:', 'Отзыв жильца:']
  for (const marker of markers) {
    const markerIndex = text.indexOf(marker)
    if (markerIndex >= 0) {
      return text.slice(markerIndex + marker.length).trim()
    }
  }
  return ''
}

export function extractExecutorComment(resultComment) {
  const text = String(resultComment || '').trim()
  if (!text) return ''
  const reviewMarkers = ['Отзыв жителя:', 'Отзыв жильца:']
  const commentMarkers = ['Комментарий исполнителя:', 'Комментарий мастера:']

  let value = text
  for (const reviewMarker of reviewMarkers) {
    const reviewIndex = value.indexOf(reviewMarker)
    if (reviewIndex >= 0) {
      value = value.slice(0, reviewIndex).trim()
      break
    }
  }

  for (const commentMarker of commentMarkers) {
    if (value.startsWith(commentMarker)) {
      value = value.slice(commentMarker.length).trim()
      break
    }
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === 'взято в работу' || normalized === 'принято в работу') {
    return ''
  }

  return value
}

export function isComplaintCanceledByResident(complaint) {
  return String(complaint?.status || '').toUpperCase() === 'DISMISSED'
    && String(complaint?.resolution_comment || '').toLowerCase().includes('отозвана жителем')
}

function pluralize(value, one, few, many) {
  const abs = Math.abs(Number(value)) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return many
  if (last > 1 && last < 5) return few
  if (last === 1) return one
  return many
}

export function formatDurationMinutesRu(totalMinutes) {
  const minutes = Math.max(0, Number(totalMinutes) || 0)
  const hours = Math.floor(minutes / 60)
  const restMinutes = minutes % 60
  const parts = []

  if (hours) {
    parts.push(`${hours} ${pluralize(hours, 'час', 'часа', 'часов')}`)
  }
  if (restMinutes) {
    parts.push(`${restMinutes} ${pluralize(restMinutes, 'минуту', 'минуты', 'минут')}`)
  }

  return parts.join(' ') || '0 минут'
}

export function priorityAccent(value) {
  const key = String(value || '').toLowerCase()
  if (key === 'emergency') return 'danger'
  if (key === 'high') return 'warning'
  if (key === 'normal') return 'primary'
  if (key === 'low') return 'neutral'
  return 'neutral'
}
