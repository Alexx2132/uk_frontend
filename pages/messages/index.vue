<script setup>
import { containsProfanity, PROFANITY_ERROR } from '~/utils/profanity'
import { formatDate, formatRole } from '~/utils/format'

definePageMeta({ middleware: 'auth' })

const api = useApi()
const auth = useAuth()
const route = useRoute()
const router = useRouter()
const liveUpdates = useLiveUpdates()
const { showToast } = useToast()

const conversations = ref([])
const contacts = ref([])
const selectedConversation = ref(null)
const selectedId = ref(null)
const loading = ref(false)
const contactsLoading = ref(false)
const sending = ref(false)
const error = ref('')
const draft = ref('')
const contactQuery = ref('')
const contactRole = ref('')
const contactStrictSearch = ref(false)
const muteMinutes = ref('')
const muteMenuOpen = ref(false)
const hiddenConversationIds = ref(new Set())
const conversationContextMenu = reactive({
  open: false,
  conversation: null,
  x: 0,
  y: 0
})
let unsubscribeLiveUpdates = null
let refreshTimer = null
let selectedRefreshTimer = null

const staffRoles = ['admin', 'admin_assistant', 'dispatcher', 'auditor']
const strictSearchHint = 'При включении строгого поиска будут показаны только точные совпадения с введённым значением.'
const roleOptions = [
  { value: '', label: 'Все роли' },
  { value: 'admin', label: 'Администраторы' },
  { value: 'admin_assistant', label: 'Помощники администратора' },
  { value: 'dispatcher', label: 'Диспетчеры' },
  { value: 'auditor', label: 'Аудиторы' },
  { value: 'executor', label: 'Исполнители' },
  { value: 'resident', label: 'Жители' }
]
const muteOptions = [
  { value: '', label: 'Со звуком' },
  { value: '30', label: 'Без звука на 30 минут' },
  { value: '120', label: 'Без звука на 2 часа' },
  { value: '1440', label: 'Без звука на сутки' },
  { value: '0', label: 'Снять заглушение' }
]

const isStaff = computed(() => staffRoles.includes(String(auth.role.value || '')))
const selectedMessages = computed(() => selectedConversation.value?.messages || [])
const selectedMutedUntil = computed(() => selectedConversation.value?.muted_until || null)
const selectedParticipants = computed(() => selectedConversation.value?.participants || [])
const isConversationHidden = (conversationId) => hiddenConversationIds.value.has(Number(conversationId))
const visibleConversations = computed(() => conversations.value.filter((conversation) => !isConversationHidden(conversation.id)))
const filteredContacts = computed(() => {
  const query = normalizeSearch(contactQuery.value)
  if (!query) return contacts.value

  return contacts.value.filter((contact) => {
    const fields = [
      contact.full_name,
      contact.login,
      contact.phone,
      contact.contact_phone
    ].map(normalizeSearch).filter(Boolean)

    return contactStrictSearch.value
      ? fields.some((field) => field === query)
      : fields.some((field) => field.includes(query))
  })
})

const parseServerDate = (value) => {
  if (!value) return Number.NaN
  const raw = String(value).trim()
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : `${raw}Z`
  return new Date(normalized).getTime()
}

const isSelectedMuted = computed(() => {
  const value = selectedMutedUntil.value
  if (!value) return false
  const time = parseServerDate(value)
  return Number.isFinite(time) && time > Date.now()
})
const visibleMuteOptions = computed(() => muteOptions.filter((item) => item.value && item.value !== '0'))
const canHideConversation = (conversation) => Array.isArray(conversation?.messages) && conversation.messages.length === 0

const conversationSignature = (conversation) => {
  if (!conversation) return ''
  const messages = Array.isArray(conversation.messages) ? conversation.messages : []
  return [
    conversation.id,
    conversation.updated_at || '',
    conversation.unread_count || 0,
    conversation.muted_until || '',
    messages.map((item) => `${item.id}:${item.created_at || ''}`).join('|')
  ].join('::')
}

const loadConversations = async (preferredId = null, options = {}) => {
  const silent = options?.silent === true
  if (!silent) loading.value = true
  error.value = ''
  try {
    const items = await api.request('/messages/conversations')
    conversations.value = Array.isArray(items) ? items : []
    const routeId = Number(preferredId || route.query.conversation || selectedId.value)
    const visibleItems = conversations.value.filter((item) => !isConversationHidden(item.id))
    const next = visibleItems.find((item) => Number(item.id) === routeId) || visibleItems[0] || null
    if (next && options?.select !== false) {
      await selectConversation(next.id, true)
    } else if (!next) {
      selectedId.value = null
      selectedConversation.value = null
    }
  } catch (e) {
    error.value = e?.data?.detail || e?.message || 'Не удалось загрузить переписки'
  } finally {
    if (!silent) loading.value = false
  }
}

const loadContacts = async () => {
  contactsLoading.value = true
  try {
    contacts.value = await api.request('/messages/contacts', {
      query: {
        role: contactRole.value || undefined
      }
    })
  } catch {
    contacts.value = []
  } finally {
    contactsLoading.value = false
  }
}

const replaceConversation = (conversation) => {
  const index = conversations.value.findIndex((item) => Number(item.id) === Number(conversation.id))
  if (index >= 0) conversations.value.splice(index, 1, conversation)
  else conversations.value.unshift(conversation)
}

const selectConversation = async (conversationId, silent = false) => {
  const normalizedId = Number(conversationId)
  if (!Number.isInteger(normalizedId) || normalizedId <= 0) return
  selectedId.value = normalizedId
  muteMenuOpen.value = false
  if (!silent) {
    router.replace({ query: { ...route.query, conversation: String(normalizedId) } })
  }
  try {
    const conversation = await api.request(`/messages/conversations/${normalizedId}`)
    selectedConversation.value = conversation
    replaceConversation(conversation)
    window.dispatchEvent(new CustomEvent('uk-notifications-updated'))
  } catch (e) {
    showToast(e?.data?.detail || e?.message || 'Не удалось открыть переписку', { type: 'error' })
  }
}

const refreshSelectedConversation = async () => {
  const normalizedId = Number(selectedId.value)
  if (!Number.isInteger(normalizedId) || normalizedId <= 0) return
  try {
    const previousSignature = conversationSignature(selectedConversation.value)
    const conversation = await api.request(`/messages/conversations/${normalizedId}`)
    selectedConversation.value = conversation
    replaceConversation(conversation)
    if (conversationSignature(conversation) !== previousSignature) {
      window.dispatchEvent(new CustomEvent('uk-notifications-updated'))
    }
  } catch {

  }
}

const startConversation = async (contact) => {
  if (!contact?.id) return
  try {
    const conversation = await api.request('/messages/conversations', {
      method: 'POST',
      body: {
        participant_id: contact.id,
        ticket_id: contact.ticket_id || null
      }
    })
    if (isConversationHidden(conversation.id)) {
      hiddenConversationIds.value.delete(Number(conversation.id))
      persistHiddenConversations()
    }
    replaceConversation(conversation)
    selectedConversation.value = conversation
    selectedId.value = conversation.id
    router.replace({ query: { ...route.query, conversation: String(conversation.id) } })
  } catch (e) {
    showToast(e?.data?.detail || e?.message || 'Не удалось создать переписку', { type: 'error' })
  }
}

const sendMessage = async () => {
  const text = draft.value.trim()
  if (!selectedId.value || !text || sending.value) return
  if (containsProfanity(text)) {
    showToast(PROFANITY_ERROR, { type: 'error' })
    return
  }
  sending.value = true
  try {
    const conversation = await api.request(`/messages/conversations/${selectedId.value}/messages`, {
      method: 'POST',
      body: { body: text }
    })
    draft.value = ''
    selectedConversation.value = conversation
    replaceConversation(conversation)
  } catch (e) {
    showToast(e?.data?.detail || e?.message || 'Не удалось отправить сообщение', { type: 'error' })
  } finally {
    sending.value = false
  }
}

const changeMute = async (value = muteMinutes.value) => {
  if (!selectedId.value) return
  try {
    const minutes = value === '' ? null : Number(value)
    const conversation = await api.request(`/messages/conversations/${selectedId.value}/mute`, {
      method: 'PATCH',
      body: { minutes }
    })
    selectedConversation.value = conversation
    replaceConversation(conversation)
    muteMenuOpen.value = false
    muteMinutes.value = ''
    showToast(minutes && minutes > 0 ? 'Чат временно заглушён' : 'Звук уведомлений по чату включён', { type: 'success' })
  } catch (e) {
    showToast(e?.data?.detail || e?.message || 'Не удалось изменить уведомления чата', { type: 'error' })
  }
}

const handleMuteButton = () => {
  if (isSelectedMuted.value) {
    changeMute('0')
    return
  }
  muteMenuOpen.value = !muteMenuOpen.value
}

const messageClass = (message) => ({
  'messages-thread__bubble--mine': Number(message.sender_id) === Number(auth.user.value?.id),
  'messages-thread__bubble--other': Number(message.sender_id) !== Number(auth.user.value?.id)
})
const normalizeSearch = (value) => String(value || '').trim().toLowerCase()

const messageSenderName = (message) => {
  if (Number(message?.sender_id) === Number(auth.user.value?.id)) return 'Вы'
  return message?.sender?.full_name || 'Пользователь'
}

const conversationSubtitle = (conversation) => {
  const other = (conversation?.participants || []).find((item) => Number(item.user_id) !== Number(auth.user.value?.id))?.user
  const role = other?.role ? formatRole(other.role) : ''
  const ticket = conversation?.ticket_id ? `Заявка #${conversation.ticket_id}` : 'Личная переписка'
  const address = residentAddressText(other)
  return [role, ticket, address].filter(Boolean).join(' · ')
}

const contactSubtitle = (contact) => {
  const parts = [formatRole(contact.role)]
  if (contact.reason && contact.reason !== 'Доступен для служебной переписки') parts.push(contact.reason)
  const address = residentAddressText(contact)
  if (address) parts.push(address)
  return parts.filter(Boolean).join(' · ')
}

const residentAddressText = (user) => {
  if (!user || String(user.role || '').toLowerCase() !== 'resident') return ''
  const parts = []
  if (user.house_address) parts.push(user.house_address)
  if (user.entrance_number) parts.push(`подъезд ${user.entrance_number}`)
  if (user.apartment_number) parts.push(`кв. ${user.apartment_number}`)
  return parts.join(', ')
}

const participantText = (user) => {
  const parts = [formatRole(user?.role)]
  const address = residentAddressText(user)
  if (address) parts.push(address)
  return parts.filter(Boolean).join(' · ')
}

const mutedUntilText = (value) => value ? `Без звука до ${formatDate(value)}` : 'Уведомления со звуком'

const persistHiddenConversations = () => {
  if (!import.meta.client) return
  window.localStorage.setItem('uk_hidden_empty_conversations', JSON.stringify([...hiddenConversationIds.value]))
}

const loadHiddenConversations = () => {
  if (!import.meta.client) return
  try {
    const raw = window.localStorage.getItem('uk_hidden_empty_conversations')
    const ids = JSON.parse(raw || '[]')
    hiddenConversationIds.value = new Set((Array.isArray(ids) ? ids : []).map(Number).filter(Number.isFinite))
  } catch {
    hiddenConversationIds.value = new Set()
  }
}

const closeConversationContextMenu = () => {
  conversationContextMenu.open = false
  conversationContextMenu.conversation = null
}

const openConversationContextMenu = (event, conversation) => {
  if (!canHideConversation(conversation)) return
  conversationContextMenu.open = true
  conversationContextMenu.conversation = conversation
  conversationContextMenu.x = event.clientX
  conversationContextMenu.y = event.clientY
}

const hideEmptyConversation = async () => {
  const conversation = conversationContextMenu.conversation
  if (!canHideConversation(conversation)) {
    closeConversationContextMenu()
    return
  }
  hiddenConversationIds.value.add(Number(conversation.id))
  persistHiddenConversations()
  closeConversationContextMenu()
  if (Number(selectedId.value) === Number(conversation.id)) {
    const next = visibleConversations.value.find((item) => Number(item.id) !== Number(conversation.id)) || null
    if (next) await selectConversation(next.id)
    else {
      selectedId.value = null
      selectedConversation.value = null
      router.replace({ query: { ...route.query, conversation: undefined } })
    }
  }
  showToast('Пустой диалог скрыт')
}

watch(contactRole, () => {
  loadContacts()
})

onMounted(async () => {
  loadHiddenConversations()
  await Promise.all([loadContacts(), loadConversations()])
  window.addEventListener('click', closeConversationContextMenu)
  window.addEventListener('scroll', closeConversationContextMenu, true)
  unsubscribeLiveUpdates = liveUpdates.subscribe(async (payload) => {
    if (payload?.entity !== 'message') return
    if (Number(payload?.conversation_id) === Number(selectedId.value)) {
      await refreshSelectedConversation()
    } else {
      await loadConversations(selectedId.value, { silent: true, select: false })
    }
  })
  selectedRefreshTimer = window.setInterval(refreshSelectedConversation, 3000)
  refreshTimer = window.setInterval(() => loadConversations(selectedId.value, { silent: true, select: false }), 12000)
})

onBeforeUnmount(() => {
  window.removeEventListener('click', closeConversationContextMenu)
  window.removeEventListener('scroll', closeConversationContextMenu, true)
  if (typeof unsubscribeLiveUpdates === 'function') unsubscribeLiveUpdates()
  if (refreshTimer) window.clearInterval(refreshTimer)
  if (selectedRefreshTimer) window.clearInterval(selectedRefreshTimer)
})
</script>

<template>
  <AppPage title="Сообщения" subtitle="Переписка между жителями, исполнителями и сотрудниками сервиса.">
    <div v-if="error" class="alert alert--error">{{ error }}</div>

    <div class="messages-layout">
      <aside class="panel messages-sidebar">
        <div class="messages-sidebar__head">
          <div>
            <div class="section-title">Диалоги</div>
          </div>
        </div>
        <div v-if="loading && !visibleConversations.length" class="empty-box">Загружаем переписки...</div>
        <div v-else-if="!visibleConversations.length" class="empty-box">Переписок пока нет.</div>
        <div v-else class="messages-conversation-list">
          <button
            v-for="conversation in visibleConversations"
            :key="conversation.id"
            type="button"
            class="messages-conversation"
            :class="{ 'messages-conversation--active': Number(conversation.id) === Number(selectedId), 'messages-conversation--unread': conversation.unread_count }"
            @click="selectConversation(conversation.id)"
            @contextmenu.prevent.stop="openConversationContextMenu($event, conversation)"
          >
            <span>
              <strong>{{ conversation.title }}</strong>
              <small>{{ conversationSubtitle(conversation) }}</small>
            </span>
            <span v-if="conversation.unread_count" class="messages-unread">{{ conversation.unread_count }}</span>
          </button>
        </div>
      </aside>

      <section class="panel messages-thread">
        <template v-if="selectedConversation">
          <div class="messages-thread__head">
            <div>
              <div class="eyebrow">Текущая переписка</div>
              <h3>{{ selectedConversation.title }}</h3>
              <p>{{ conversationSubtitle(selectedConversation) }}</p>
            </div>
            <div class="messages-mute">
              <div class="messages-mute__status">{{ mutedUntilText(selectedMutedUntil) }}</div>
              <button
                class="messages-mute__button"
                :class="{ 'messages-mute__button--muted': isSelectedMuted }"
                type="button"
                :aria-label="isSelectedMuted ? 'Включить звук сообщений' : 'Отключить звук сообщений'"
                :title="isSelectedMuted ? 'Включить звук' : 'Отключить звук'"
                @click="handleMuteButton"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 22a2.4 2.4 0 0 0 2.35-2h-4.7A2.4 2.4 0 0 0 12 22Zm7-6v-5.2c0-3.1-1.64-5.68-4.5-6.36V3.7a2.5 2.5 0 0 0-5 0v.74C6.64 5.12 5 7.7 5 10.8V16l-2 2v1h18v-1l-2-2Z" />
                </svg>
              </button>
              <div v-if="muteMenuOpen" class="messages-mute__menu">
                <button v-if="isSelectedMuted" type="button" @click="changeMute('0')">Включить звук</button>
                <template v-else>
                  <button
                    v-for="option in visibleMuteOptions"
                    :key="option.value"
                    type="button"
                    @click="changeMute(option.value)"
                  >
                    {{ option.label }}
                  </button>
                </template>
              </div>
            </div>
          </div>

          <div class="messages-thread__body">
            <div v-if="!selectedMessages.length" class="empty-box">Сообщений пока нет. Напишите первым.</div>
            <div
              v-for="message in selectedMessages"
              v-else
              :key="message.id"
              class="messages-thread__bubble"
              :class="messageClass(message)"
            >
              <div class="messages-thread__meta">
                <strong>{{ messageSenderName(message) }}</strong>
                <span>{{ formatDate(message.created_at) }}</span>
              </div>
              <div class="messages-thread__text">{{ message.body }}</div>
            </div>
          </div>

          <div class="messages-composer">
            <textarea v-model="draft" rows="3" @keydown.ctrl.enter.prevent="sendMessage" />
            <button
              class="messages-send-button"
              type="button"
              :disabled="sending || !draft.trim()"
              :aria-label="sending ? 'Отправляем сообщение' : 'Отправить сообщение'"
              :title="sending ? 'Отправляем...' : 'Отправить'"
              @click="sendMessage"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3.6 20.4 21 12 3.6 3.6 3 10.2l10.6 1.8L3 13.8l.6 6.6Z" />
              </svg>
            </button>
          </div>
        </template>
        <div v-else class="empty-box">Выберите диалог или начните новую переписку справа.</div>
      </section>

      <aside class="panel messages-contacts">
        <div class="section-title">Новая переписка</div>
        <div class="messages-contact-filters">
          <label v-if="isStaff" class="field">
            <span>Роль</span>
            <select v-model="contactRole">
              <option v-for="option in roleOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
          <label class="field">
            <span>Поиск</span>
            <input v-model.trim="contactQuery" type="search" placeholder="Имя, логин или телефон" />
          </label>
          <label class="checkbox" :title="strictSearchHint">
            <input v-model="contactStrictSearch" type="checkbox" />
            <span>Строгий поиск</span>
          </label>
        </div>
        <div v-if="contactsLoading" class="empty-box">Ищем доступных собеседников...</div>
        <div v-else-if="!filteredContacts.length" class="empty-box">Доступных собеседников пока нет.</div>
        <div v-else class="messages-contact-list">
          <button v-for="contact in filteredContacts" :key="`${contact.id}-${contact.ticket_id || 'direct'}`" class="messages-contact" type="button" @click="startConversation(contact)">
            <span>
              <strong>{{ contact.full_name }}</strong>
              <small>{{ contactSubtitle(contact) }}</small>
            </span>
            <span class="messages-contact__plus">+</span>
          </button>
        </div>
      </aside>
    </div>
    <div
      v-if="conversationContextMenu.open"
      class="messages-context-menu"
      :style="{ left: `${conversationContextMenu.x}px`, top: `${conversationContextMenu.y}px` }"
      @click.stop
    >
      <button type="button" @click="hideEmptyConversation">Скрыть пустой диалог</button>
    </div>
  </AppPage>
</template>
