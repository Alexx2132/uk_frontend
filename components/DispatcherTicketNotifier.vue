<script setup>
import { formatTicketPriority } from '~/utils/format'

const api = useApi()
const auth = useAuth()
const liveUpdates = useLiveUpdates()
const { showToast } = useToast()

const TICKET_SOUND = '/sounds/ticket-new.mp3'
const EMERGENCY_SOUND = '/sounds/ticket-emergency.mp3'
const AUDITOR_COMPLAINT_SOUND = '/sounds/complaint-auditor.mp3'
const DISPATCHER_COMPLAINT_SOUND = '/sounds/complaint-dispatcher.mp3'
const COMPLAINT_MESSAGE_SOUND = '/sounds/complaint-message.mp3'
const RESIDENT_UPDATE_SOUND = '/sounds/resident-update.mp3'
const BAN_MESSAGE_SOUND = '/sounds/ban-message.mp3'

const canNotifyTickets = computed(() => auth.hasRole('admin', 'dispatcher'))
const canNotifyComplaints = computed(() => auth.hasRole('admin', 'dispatcher', 'auditor'))
const canNotifyResident = computed(() => auth.hasRole('resident'))
const canNotifyBanAppeals = computed(() => false)
const canNotifyMessages = computed(() => auth.isLoggedIn.value)
const canNotifyRegistrations = computed(() => auth.hasRole('admin') || (auth.hasRole('admin_assistant') && Boolean(auth.user.value?.can_approve_registrations)))
const canNotifyPasswordRecovery = computed(() => auth.hasRole('admin') || (auth.hasRole('admin_assistant') && Boolean(auth.user.value?.can_manage_password_recovery)))
const canNotifyAnything = computed(() => canNotifyTickets.value || canNotifyComplaints.value || canNotifyResident.value || canNotifyBanAppeals.value || canNotifyMessages.value || canNotifyRegistrations.value || canNotifyPasswordRecovery.value)

const knownTicketIds = new Set()
const notifiedTicketIds = new Set()
const knownComplaintIds = new Set()
const notifiedComplaintEventKeys = new Set()
const knownNotificationIds = new Set()
const recentComplaintMessageAt = new Map()
let unsubscribeLiveUpdates = null
let pollTimer = null
let started = false

const normalizePriority = (value) => String(value || '').trim().toLowerCase()
const normalizeComplaintType = (value) => String(value || '').trim().toUpperCase()
const isEmergencyTicket = (ticket) => normalizePriority(ticket?.priority) === 'emergency'
const isRegulatoryComplaint = (value) => normalizeComplaintType(value) === 'DISPATCHER_INACTION'
const isResidentNotificationType = (value) => {
  const type = String(value || '')
  return type.startsWith('ticket_') || ['complaint_comment', 'complaint_resolved'].includes(type)
}

const formatComplaintType = (value) => {
  const labels = {
    QUALITY: 'качество выполнения',
    OVERDUE: 'нет реакции / просрочка',
    DISPATCHER_INACTION: 'обращение в контролирующий орган'
  }
  return labels[normalizeComplaintType(value)] || 'обращение'
}

const canSeeComplaintType = (type) => {
  if (!canNotifyComplaints.value) return false
  if (auth.hasRole('admin', 'auditor')) return true
  return auth.hasRole('dispatcher') && !isRegulatoryComplaint(type)
}

const playFallbackTone = (variant = 'normal') => {
  if (!process.client) return
  const AudioContext = window.AudioContext || window.webkitAudioContext
  if (!AudioContext) return

  const tones = {
    emergency: { frequency: 880, volume: 0.18, duration: 0.45, type: 'sawtooth' },
    complaint: { frequency: 680, volume: 0.15, duration: 0.34, type: 'triangle' },
    message: { frequency: 430, volume: 0.12, duration: 0.24, type: 'sine' },
    normal: { frequency: 520, volume: 0.11, duration: 0.28, type: 'sine' }
  }
  const tone = tones[variant] || tones.normal

  try {
    const ctx = new AudioContext()
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.type = tone.type
    oscillator.frequency.value = tone.frequency
    gain.gain.value = 0.0001
    oscillator.connect(gain)
    gain.connect(ctx.destination)
    const now = ctx.currentTime
    gain.gain.exponentialRampToValueAtTime(tone.volume, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.duration)
    oscillator.start(now)
    oscillator.stop(now + tone.duration + 0.03)
    window.setTimeout(() => ctx.close().catch(() => {}), 700)
  } catch {}
}

const playSound = async (src, variant = 'normal', volume = 0.7) => {
  if (!process.client) return
  try {
    const audio = new Audio(src)
    audio.volume = volume
    await audio.play()
  } catch {
    playFallbackTone(variant)
  }
}

const notifyTicket = async (ticket) => {
  const ticketId = Number(ticket?.id)
  if (!Number.isInteger(ticketId) || ticketId <= 0 || notifiedTicketIds.has(ticketId)) return

  knownTicketIds.add(ticketId)
  notifiedTicketIds.add(ticketId)

  const emergency = isEmergencyTicket(ticket)
  const title = emergency ? 'Новая аварийная заявка' : 'Новая заявка'
  const priority = formatTicketPriority(ticket?.priority)
  const address = ticket?.house ? ` · ${ticket.house.street || ''}${ticket.house.number ? `, ${ticket.house.number}` : ''}` : ''
  const message = `${title} #${ticketId}: ${ticket?.title || 'без названия'} · ${priority}${address}`

  showToast(message, {
    type: emergency ? 'error' : 'success',
    persistent: true,
    actionTo: `/tickets/${ticketId}`,
    actionLabel: 'Открыть заявку'
  })
  await playSound(emergency ? EMERGENCY_SOUND : TICKET_SOUND, emergency ? 'emergency' : 'normal', emergency ? 0.9 : 0.65)
}

const notifyComplaintCreated = async (complaint) => {
  const complaintId = Number(complaint?.complaint_id || complaint?.id)
  const ticketId = Number(complaint?.ticket_id)
  const type = complaint?.complaint_type
  if (!Number.isInteger(complaintId) || complaintId <= 0) return
  knownComplaintIds.add(complaintId)
  if (!canSeeComplaintType(type)) return

  const key = `created:${complaintId}`
  if (notifiedComplaintEventKeys.has(key)) return
  notifiedComplaintEventKeys.add(key)
  recentComplaintMessageAt.set(complaintId, Date.now())

  const regulatory = isRegulatoryComplaint(type)
  const title = regulatory ? 'Новое обращение в контролирующий орган' : 'Новая жалоба'
  const ticketPart = Number.isInteger(ticketId) && ticketId > 0 ? ` по заявке #${ticketId}` : ''
  const message = `${title} #${complaintId}${ticketPart}: ${formatComplaintType(type)}`
  const sound = auth.hasRole('dispatcher') && !auth.hasRole('admin', 'auditor')
    ? DISPATCHER_COMPLAINT_SOUND
    : AUDITOR_COMPLAINT_SOUND

  showToast(message, {
    type: regulatory ? 'warning' : 'info',
    persistent: true,
    actionTo: `/audit?complaint=${complaintId}`,
    actionLabel: 'Открыть жалобу'
  })
  await playSound(sound, 'complaint', regulatory ? 0.82 : 0.74)
}

const notifyComplaintMessage = async (payload) => {
  const complaintId = Number(payload?.complaint_id)
  const ticketId = Number(payload?.ticket_id)
  const commentId = Number(payload?.comment_id)
  const authorId = Number(payload?.author_id)
  if (!Number.isInteger(complaintId) || complaintId <= 0 || !canSeeComplaintType(payload?.complaint_type)) return
  if (Number.isInteger(authorId) && Number(auth.user.value?.id) === authorId) return

  const key = Number.isInteger(commentId) && commentId > 0
    ? `comment:${commentId}`
    : `comment:${complaintId}:${Date.now()}`
  if (notifiedComplaintEventKeys.has(key)) return
  notifiedComplaintEventKeys.add(key)

  const ticketPart = Number.isInteger(ticketId) && ticketId > 0 ? ` по заявке #${ticketId}` : ''
  showToast(`Новое сообщение по жалобе #${complaintId}${ticketPart}`, {
    type: 'info',
    persistent: true,
    actionTo: `/audit?complaint=${complaintId}`,
    actionLabel: 'Открыть переписку'
  })
  await playSound(COMPLAINT_MESSAGE_SOUND, 'message', 0.7)
}

const notifyBanAppealMessage = async (payload = {}) => {
  if (!canNotifyBanAppeals.value) return
  const senderId = Number(payload?.sender_id)
  if (Number.isInteger(senderId) && Number(auth.user.value?.id) === senderId) return
  showToast('Новое сообщение жителя по блокировке', {
    type: 'warning',
    persistent: true,
    actionTo: '/audit',
    actionLabel: 'Открыть обращения'
  })
  await playSound(BAN_MESSAGE_SOUND, 'message', 0.74)
}

const notifyMessageFromStoredNotification = async (notification) => {
  const conversationId = Number(notification?.message_conversation_id)
  const notificationId = Number(notification?.id)
  if (!Number.isInteger(conversationId) || conversationId <= 0 || !Number.isInteger(notificationId) || notificationId <= 0) return

  const silent = String(notification?.notif_type || '') === 'message_new_silent'
  showToast(notification?.message || 'Новое сообщение', {
    type: 'info',
    persistent: true,
    actionTo: `/messages?conversation=${conversationId}`,
    actionLabel: 'Открыть переписку'
  })
  if (!silent) {
    await playSound(BAN_MESSAGE_SOUND, 'message', 0.7)
  }
}

const notifyResidentFromStoredNotification = async (notification) => {
  const notificationId = Number(notification?.id)
  if (!Number.isInteger(notificationId) || notificationId <= 0) return

  const ticketId = Number(notification?.ticket_id)
  const complaintId = Number(notification?.complaint_id)
  const hasComplaint = Number.isInteger(complaintId) && complaintId > 0
  const hasTicket = Number.isInteger(ticketId) && ticketId > 0
  const actionTo = hasComplaint ? `/audit?complaint=${complaintId}` : (hasTicket ? `/tickets/${ticketId}` : undefined)
  const actionLabel = hasComplaint ? 'Открыть обращение' : (hasTicket ? 'Открыть заявку' : undefined)
  const title = notification?.title || (hasComplaint ? 'Обновление по жалобе' : 'Обновление по заявке')
  const message = notification?.message ? `${title}: ${notification.message}` : title
  const type = String(notification?.notif_type || '')

  showToast(message, {
    type: type === 'complaint_resolved' ? 'success' : 'info',
    duration: 10000,
    actionTo,
    actionLabel
  })
  await playSound(RESIDENT_UPDATE_SOUND, 'message', 0.72)
}

const notifyFromStoredNotification = async (notification) => {
  const notificationId = Number(notification?.id)
  if (!Number.isInteger(notificationId) || notificationId <= 0 || knownNotificationIds.has(notificationId)) return
  knownNotificationIds.add(notificationId)

  const type = String(notification?.notif_type || '')
  if (type.startsWith('message_')) {
    await notifyMessageFromStoredNotification(notification)
    return
  }

  if (type === 'registration_request' && canNotifyRegistrations.value) {
    showToast(notification?.message || 'Новая заявка на регистрацию жителя', {
      type: 'info',
      persistent: true,
      actionTo: '/users',
      actionLabel: 'Открыть пользователей'
    })
    await playSound(BAN_MESSAGE_SOUND, 'message', 0.7)
    return
  }

  if (type === 'password_recovery_request' && canNotifyPasswordRecovery.value) {
    showToast(notification?.message || 'Новый запрос на восстановление доступа', {
      type: 'info',
      persistent: true,
      actionTo: '/password-recovery',
      actionLabel: 'Открыть запросы'
    })
    await playSound(BAN_MESSAGE_SOUND, 'message', 0.7)
    return
  }

  if (canNotifyResident.value && isResidentNotificationType(type)) {
    await notifyResidentFromStoredNotification(notification)
    return
  }

  if (canNotifyBanAppeals.value && type === 'ban_message_admin') {
    showToast(notification?.message || 'Новое сообщение по блокировке', {
      type: 'warning',
      persistent: true,
      actionTo: '/audit',
      actionLabel: 'Открыть обращения'
    })
    await playSound(BAN_MESSAGE_SOUND, 'message', 0.74)
    return
  }

  const complaintId = Number(notification?.complaint_id)
  if (!Number.isInteger(complaintId) || complaintId <= 0) return

  if (type === 'complaint_comment') {
    const recentAt = recentComplaintMessageAt.get(complaintId) || 0
    if (Date.now() - recentAt < 15000) {
      await markNotificationRead(notificationId)
      return
    }
    recentComplaintMessageAt.set(complaintId, Date.now())
    const ticketId = Number(notification?.ticket_id)
    const ticketPart = Number.isInteger(ticketId) && ticketId > 0 ? ` по заявке #${ticketId}` : ''
    showToast(`Новое сообщение по жалобе #${complaintId}${ticketPart}`, {
      type: 'info',
      persistent: true,
      actionTo: `/audit?complaint=${complaintId}`,
      actionLabel: 'Открыть переписку'
    })
    await playSound(COMPLAINT_MESSAGE_SOUND, 'message', 0.7)
    return
  }

  if (type === 'complaint_created') {
    await notifyComplaintCreated({
      id: complaintId,
      ticket_id: notification.ticket_id,
      complaint_type: notification.message?.includes('контролирующий') ? 'DISPATCHER_INACTION' : undefined
    })
  }
}

const markNotificationRead = async (notificationId) => {
  try {
    await api.request(`/notifications/${notificationId}/read`, { method: 'PATCH' })
  } catch {}
}

const fetchTicketById = async (ticketId) => {
  try {
    return await api.request(`/tickets/${ticketId}`)
  } catch {
    return null
  }
}

const handleTicketPayload = async (payload) => {
  if (!canNotifyTickets.value || payload?.entity !== 'ticket' || payload?.action !== 'created') return
  const ticketId = Number(payload.ticket_id)
  if (!Number.isInteger(ticketId) || ticketId <= 0 || notifiedTicketIds.has(ticketId)) return

  const ticket = await fetchTicketById(ticketId)
  if (ticket) {
    await notifyTicket(ticket)
  }
}

const handleComplaintPayload = async (payload) => {
  if (!canNotifyComplaints.value || payload?.entity !== 'complaint') return

  if (payload.action === 'created') {
    await notifyComplaintCreated(payload)
    return
  }

  if (payload.action === 'comment_created') {
    await notifyComplaintMessage(payload)
  }
}

const handleLivePayload = async (payload) => {
  await handleTicketPayload(payload)
  await handleComplaintPayload(payload)
  if (payload?.entity === 'ban_appeal' && payload?.action === 'message_created') {
    await notifyBanAppealMessage(payload)
  }
  if (payload?.entity === 'message' && payload?.action === 'created') {
    const senderId = Number(payload?.sender_id)
    if (!Number.isInteger(senderId) || Number(auth.user.value?.id) !== senderId) {
      await checkUnreadMessageNotifications()
    }
  }
}

const seedKnownTickets = async () => {
  try {
    const tickets = await api.request('/tickets/')
    for (const ticket of Array.isArray(tickets) ? tickets : []) {
      if (ticket?.id) knownTicketIds.add(Number(ticket.id))
    }
  } catch {}
}

const seedKnownComplaints = async () => {
  if (!canNotifyComplaints.value) return
  try {
    const complaints = await api.request('/ticket-complaints/?skip=0&limit=200')
    for (const complaint of Array.isArray(complaints) ? complaints : []) {
      if (complaint?.id) knownComplaintIds.add(Number(complaint.id))
    }
  } catch {}
}

const seedKnownNotifications = async () => {
  if (!canNotifyComplaints.value && !canNotifyResident.value && !canNotifyBanAppeals.value && !canNotifyMessages.value && !canNotifyRegistrations.value && !canNotifyPasswordRecovery.value) return
  try {
    const notifications = await api.request('/notifications/', {
      query: { unread_only: false, skip: 0, limit: 50 }
    })
    for (const notification of Array.isArray(notifications) ? notifications : []) {
      if (notification?.id) knownNotificationIds.add(Number(notification.id))
    }
  } catch {}
}

const checkNewTickets = async () => {
  if (!canNotifyTickets.value) return
  try {
    const tickets = await api.request('/tickets/')
    for (const ticket of Array.isArray(tickets) ? tickets : []) {
      const ticketId = Number(ticket?.id)
      if (!Number.isInteger(ticketId) || ticketId <= 0 || knownTicketIds.has(ticketId)) continue
      await notifyTicket(ticket)
    }
  } catch {}
}

const checkNewComplaints = async () => {
  if (!canNotifyComplaints.value) return
  try {
    const complaints = await api.request('/ticket-complaints/?skip=0&limit=200')
    for (const complaint of Array.isArray(complaints) ? complaints : []) {
      const complaintId = Number(complaint?.id)
      if (!Number.isInteger(complaintId) || complaintId <= 0 || knownComplaintIds.has(complaintId)) continue
      await notifyComplaintCreated(complaint)
    }
  } catch {}
}

const checkUnreadComplaintNotifications = async () => {
  if (!canNotifyComplaints.value && !canNotifyResident.value && !canNotifyBanAppeals.value && !canNotifyMessages.value && !canNotifyRegistrations.value && !canNotifyPasswordRecovery.value) return
  try {
    const notifications = await api.request('/notifications/', {
      query: { unread_only: true, skip: 0, limit: 50 }
    })
    for (const notification of Array.isArray(notifications) ? notifications : []) {
      const type = String(notification?.notif_type || '')
      if (
        (canNotifyResident.value && isResidentNotificationType(type))
        || (canNotifyComplaints.value && ['complaint_comment', 'complaint_created'].includes(type))
        || (canNotifyBanAppeals.value && type === 'ban_message_admin')
        || (canNotifyMessages.value && type.startsWith('message_'))
        || (canNotifyRegistrations.value && type === 'registration_request')
        || (canNotifyPasswordRecovery.value && type === 'password_recovery_request')
      ) {
        await notifyFromStoredNotification(notification)
      }
    }
  } catch {}
}

const checkUnreadMessageNotifications = async () => {
  if (!canNotifyMessages.value) return
  try {
    const notifications = await api.request('/notifications/', {
      query: { unread_only: true, skip: 0, limit: 50 }
    })
    for (const notification of Array.isArray(notifications) ? notifications : []) {
      if (String(notification?.notif_type || '').startsWith('message_')) {
        await notifyFromStoredNotification(notification)
      }
    }
  } catch {}
}

const startNotifier = async () => {
  if (!process.client || started || !canNotifyAnything.value) return
  started = true
  await Promise.all([seedKnownTickets(), seedKnownComplaints(), seedKnownNotifications()])
  unsubscribeLiveUpdates = liveUpdates.subscribe(handleLivePayload)
  pollTimer = window.setInterval(() => {
    checkNewTickets()
    checkNewComplaints()
    checkUnreadComplaintNotifications()
  }, 7000)
}

const stopNotifier = () => {
  started = false
  if (typeof unsubscribeLiveUpdates === 'function') {
    unsubscribeLiveUpdates()
    unsubscribeLiveUpdates = null
  }
  if (pollTimer && process.client) {
    window.clearInterval(pollTimer)
    pollTimer = null
  }
}

watch(canNotifyAnything, (enabled) => {
  if (enabled) {
    startNotifier()
  } else {
    stopNotifier()
  }
}, { immediate: true })

onBeforeUnmount(stopNotifier)
</script>

<template>
  <span class="dispatcher-ticket-notifier" aria-hidden="true" />
</template>
