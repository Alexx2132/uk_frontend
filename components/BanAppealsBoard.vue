<script setup>
import { formatDate, formatRole } from '~/utils/format'
import { containsProfanity, PROFANITY_ERROR } from '~/utils/profanity'

const emit = defineEmits(['unread-updated'])

const api = useApi()
const auth = useAuth()
const liveUpdates = useLiveUpdates()
const { showToast } = useToast()

const isAdmin = computed(() => auth.hasRole('admin'))
const conversations = ref([])
const selectedId = ref(null)
const loading = ref(false)
const replySaving = ref(false)
const error = ref('')
const replyDraft = ref('')
const unreadNotifications = ref([])
const panelOpen = ref(true)
let unsubscribeLiveUpdates = null
let refreshTimer = null

const selectedConversation = computed(() => {
  return conversations.value.find((item) => Number(item.id) === Number(selectedId.value)) || null
})

const selectedResidentBanned = computed(() => {
  const bannedUntil = selectedConversation.value?.resident?.banned_until
  if (!bannedUntil) return false
  const date = new Date(bannedUntil)
  return !Number.isNaN(date.getTime()) && date.getTime() > Date.now()
})

const emitUnreadChanged = () => {
  emit('unread-updated')
  if (process.client) {
    window.dispatchEvent(new CustomEvent('uk-notifications-updated'))
  }
}

const loadUnreadBanNotifications = async () => {
  try {
    const payload = await api.request('/notifications/', {
      query: { unread_only: true, skip: 0, limit: 200 }
    })
    const notifications = Array.isArray(payload) ? payload : []
    const banNotifications = notifications.filter((item) => String(item?.notif_type || '').startsWith('ban_'))
    const legacyNotifications = banNotifications.filter((item) => !Number(item?.ban_conversation_id))
    if (legacyNotifications.length) {
      await Promise.allSettled(legacyNotifications.map((item) => api.request(`/notifications/${item.id}/read`, { method: 'PATCH' })))
      emitUnreadChanged()
    }
    unreadNotifications.value = banNotifications.filter((item) => Number(item?.ban_conversation_id) > 0)
  } catch {
    unreadNotifications.value = []
  }
}

const isConversationUnread = (conversationId) => {
  const normalizedId = Number(conversationId)
  return unreadNotifications.value.some((item) => Number(item?.ban_conversation_id) === normalizedId)
}

const markConversationRead = async (conversationId) => {
  const normalizedId = Number(conversationId)
  if (!Number.isInteger(normalizedId) || normalizedId <= 0) return
  const hadUnread = isConversationUnread(normalizedId)
  try {
    const conversation = await api.request(`/ban-appeals/${normalizedId}`)
    const index = conversations.value.findIndex((item) => Number(item.id) === normalizedId)
    if (index >= 0) {
      conversations.value.splice(index, 1, conversation)
    }
  } catch {}
  if (hadUnread) {
    await loadUnreadBanNotifications()
    emitUnreadChanged()
  }
}

const latestMessage = (conversation) => {
  const messages = conversation?.messages || []
  return messages[messages.length - 1] || null
}

const residentName = (conversation) => {
  return conversation?.resident?.full_name || `Житель #${conversation?.resident_id || '—'}`
}

const residentContact = (conversation) => {
  return conversation?.resident?.contact_phone
    || conversation?.resident?.phone
    || conversation?.resident?.login
    || 'Контакт не указан'
}

const senderName = (message) => {
  return message?.sender?.full_name || `Пользователь #${message?.sender_id || '—'}`
}

const senderRole = (message) => {
  return message?.sender?.role ? formatRole(message.sender.role) : ''
}

const loadConversations = async ({ silent = false } = {}) => {
  if (!isAdmin.value) return
  if (!silent) {
    loading.value = true
    error.value = ''
  }
  try {
    const payload = await api.request('/ban-appeals/')
    conversations.value = Array.isArray(payload) ? payload : []
    if (!conversations.value.length) {
      selectedId.value = null
      return
    }
    if (!selectedConversation.value) {
      selectedId.value = conversations.value[0].id
    }
    await loadUnreadBanNotifications()
    if (selectedId.value && isConversationUnread(selectedId.value)) {
      await markConversationRead(selectedId.value)
    }
  } catch (requestError) {
    if (!silent) {
      error.value = requestError?.data?.detail || requestError?.message || 'Не удалось загрузить переписку по блокировкам'
    }
  } finally {
    if (!silent) loading.value = false
  }
}

const selectConversation = async (conversationId) => {
  selectedId.value = conversationId
  replyDraft.value = ''
  await markConversationRead(conversationId)
}

const sendReply = async () => {
  const conversation = selectedConversation.value
  const text = replyDraft.value.trim()
  if (!conversation) return
  if (!selectedResidentBanned.value) {
    showToast('Житель уже разблокирован, ответ по ограничению недоступен', { type: 'error' })
    return
  }
  if (!text) {
    showToast('Введите ответ жителю', { type: 'error' })
    return
  }
  if (containsProfanity(text)) {
    showToast(PROFANITY_ERROR, { type: 'error' })
    return
  }

  replySaving.value = true
  try {
    await api.request(`/ban-appeals/${conversation.id}/messages`, {
      method: 'POST',
      body: { message: text }
    })
    replyDraft.value = ''
    showToast('Ответ по блокировке отправлен')
    await loadConversations({ silent: true })
    emitUnreadChanged()
  } catch (requestError) {
    showToast(requestError?.data?.detail || requestError?.message || 'Не удалось отправить ответ', { type: 'error' })
  } finally {
    replySaving.value = false
  }
}

onMounted(() => {
  if (!isAdmin.value) return
  loadConversations()
  unsubscribeLiveUpdates = liveUpdates.subscribe((payload) => {
    if (!payload || !['ban_appeal', 'notification'].includes(payload.entity)) return
    loadConversations({ silent: true })
    loadUnreadBanNotifications()
  })
  if (process.client) {
    refreshTimer = window.setInterval(() => {
      loadConversations({ silent: true })
    }, 5000)
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
})
</script>

<template>
  <div v-if="isAdmin" class="panel ban-appeals-panel">
    <div class="ban-appeals-panel__head">
      <div>
        <div class="section-title">Переписка по поводу ограничений</div>
      </div>
      <div class="toolbar">
        <button
          class="icon-btn ban-appeals-panel__toggle"
          type="button"
          :aria-label="panelOpen ? 'Свернуть переписку' : 'Развернуть переписку'"
          @click="panelOpen = !panelOpen"
        >
          <span class="collapsible-toggle__icon" :class="{ 'collapsible-toggle__icon--open': panelOpen }" aria-hidden="true"></span>
        </button>
        <button
          v-if="panelOpen"
          class="icon-btn ban-appeals-panel__refresh"
          :class="{ 'ban-appeals-panel__refresh--loading': loading }"
          type="button"
          :disabled="loading"
          title="Обновить"
          aria-label="Обновить"
          @click="loadConversations"
        >
          <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
            <path d="M17.7 6.3A7.9 7.9 0 0 0 12 4a8 8 0 0 0-7.7 6H2l3.4 3.4L8.8 10H6.4A6 6 0 0 1 12 6c1.7 0 3.2.7 4.3 1.8L14 10h8V2l-4.3 4.3ZM6.3 17.7A7.9 7.9 0 0 0 12 20a8 8 0 0 0 7.7-6H22l-3.4-3.4L15.2 14h2.4A6 6 0 0 1 12 18a6 6 0 0 1-4.3-1.8L10 14H2v8l4.3-4.3Z" />
          </svg>
        </button>
      </div>
    </div>

    <template v-if="panelOpen">
      <div v-if="error" class="alert alert--error">{{ error }}</div>
      <div v-if="loading && !conversations.length" class="muted">Загрузка переписки...</div>
      <div v-else-if="!conversations.length" class="empty-box">Сообщений по ограничениям пока нет.</div>

    <div v-else class="ban-appeals-board">
      <div class="ban-appeals-board__list">
        <button
          v-for="conversation in conversations"
          :key="conversation.id"
          type="button"
          class="ban-appeal-item"
          :class="{
            'ban-appeal-item--active': Number(conversation.id) === Number(selectedId),
            'ban-appeal-item--unread': isConversationUnread(conversation.id)
          }"
          @click="selectConversation(conversation.id)"
        >
          <div class="ban-appeal-item__head">
            <strong>{{ residentName(conversation) }}</strong>
            <span v-if="isConversationUnread(conversation.id)" class="ban-appeal-item__unread">Новое</span>
            <span class="pill">Сообщений: {{ conversation.messages?.length || 0 }}</span>
          </div>
          <div class="muted">{{ residentContact(conversation) }}</div>
          <div v-if="latestMessage(conversation)" class="ban-appeal-item__preview">
            {{ latestMessage(conversation).message }}
          </div>
          <div v-if="latestMessage(conversation)" class="muted">
            {{ formatDate(latestMessage(conversation).created_at) }}
          </div>
        </button>
      </div>

      <div class="ban-appeals-board__detail">
        <div v-if="!selectedConversation" class="empty-box">Выберите переписку из списка.</div>
        <template v-else>
          <div class="ban-appeal-detail__head">
            <div>
              <div class="eyebrow">Блокировка аккаунта</div>
              <h3>{{ residentName(selectedConversation) }}</h3>
              <div class="muted">{{ residentContact(selectedConversation) }}</div>
            </div>
            <span class="pill" :class="selectedResidentBanned ? 'pill--danger' : 'pill--soft'">
              {{ selectedResidentBanned ? 'Ограничение активно' : 'Ограничение снято' }}
            </span>
          </div>

          <div class="ban-appeal-messages">
            <div
              v-for="messageItem in selectedConversation.messages || []"
              :key="messageItem.id"
              class="ban-appeal-message"
              :class="{ 'ban-appeal-message--admin': messageItem.sender?.role === 'admin' }"
            >
              <div class="ban-appeal-message__meta">
                <strong>{{ senderName(messageItem) }}</strong>
                <span>
                  <template v-if="senderRole(messageItem)">{{ senderRole(messageItem) }} · </template>{{ formatDate(messageItem.created_at) }}
                </span>
              </div>
              <div class="ban-appeal-message__body">{{ messageItem.message }}</div>
            </div>
            <div v-if="!selectedConversation.messages?.length" class="empty-box">
              В этой переписке пока нет сообщений.
            </div>
          </div>

          <label class="field">
            <span>Ответ жителю</span>
            <textarea
              v-model="replyDraft"
              rows="3"
              :disabled="!selectedResidentBanned"
              :placeholder="selectedResidentBanned ? 'Напишите ответ по ограничению' : 'Житель разблокирован, переписка закрыта'"
            />
          </label>
          <button class="btn btn--primary" type="button" :disabled="replySaving || !replyDraft.trim() || !selectedResidentBanned" @click="sendReply">
            {{ replySaving ? 'Отправляем...' : 'Отправить ответ' }}
          </button>
        </template>
      </div>
    </div>
    </template>
  </div>
</template>
