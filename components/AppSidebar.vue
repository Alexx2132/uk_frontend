<script setup>
import { formatRole } from '~/utils/format'

const auth = useAuth()
const api = useApi()
const liveUpdates = useLiveUpdates()
const { items } = useRoleMenu()
const { settings, loadSettings } = useAppSettings()
const open = ref(false)
const logoutConfirmOpen = ref(false)
const unreadSummary = ref({ unread: 0, unread_by_type: {} })
let refreshTimer = null
let unsubscribeLiveUpdates = null

const userLabel = computed(() => auth.user.value?.full_name || auth.user.value?.username || 'Пользователь')
const unreadByType = computed(() => unreadSummary.value?.unread_by_type || {})

const iconPaths = {
  home: 'M3 10.8 12 3l9 7.8v9.7a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H4.5A1.5 1.5 0 0 1 3 20.5v-9.7Z',
  tickets: 'M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm2 5h8V6H8v2Zm0 5h8v-2H8v2Zm0 5h5v-2H8v2Z',
  reviews: 'M12 3.6 14.6 9l6 .9-4.3 4.2 1 5.9-5.3-2.8L6.7 20l1-5.9L3.4 9.9l6-.9L12 3.6Z',
  announcements: 'M5 10v4h3l6 4V6l-6 4H5Zm12-2.6v9.2a4.8 4.8 0 0 0 0-9.2Z',
  messages: 'M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm3 5h10V7H7v2Zm0 4h7v-2H7v2Z',
  info: 'M11 10h2v8h-2v-8Zm0-4h2v2h-2V6Zm1-4a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z',
  profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0v1H5v-1Z',
  complaints: 'M12 3 2.8 20h18.4L12 3Zm-1 6h2v5h-2V9Zm0 7h2v2h-2v-2Z',
  remarks: 'M9.3 16.2 5.7 12.6 4.3 14l5 5 10-10-1.4-1.4-8.6 8.6Z',
  passwordRecovery: 'M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 1 1 6 0v3H9Zm2 4h2v4h-2v-4Z',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm6.5 1a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2 21a7 7 0 0 1 14 0H2Zm13.5 0a8.6 8.6 0 0 0-2.1-5.6A5.5 5.5 0 0 1 22 20.1v.9h-6.5Z',
  houses: 'M4 21V9l8-6 8 6v12h-6v-7h-4v7H4Z',
  addHouse: 'M4 21V9l8-6 8 6v12h-5v-5h-2v5H4Zm9-12v3h-3v2h3v3h2v-3h3v-2h-3V9h-2Z',
  analytics: 'M5 20V9h3v11H5Zm5 0V4h3v16h-3Zm5 0v-7h3v7h-3Z'
}

const refreshUnreadSummary = async () => {
  if (!auth.isLoggedIn.value) {
    unreadSummary.value = { unread: 0, unread_by_type: {} }
    return
  }
  try {
    unreadSummary.value = await api.request('/notifications/summary')
  } catch {
    unreadSummary.value = { unread: 0, unread_by_type: {} }
  }
}

const countByPredicate = (predicate) => Object.entries(unreadByType.value)
  .reduce((total, [type, count]) => total + (predicate(String(type)) ? Number(count || 0) : 0), 0)

const notificationMatchesBadge = (badge, type) => {
  if (badge === 'tickets') return type.startsWith('ticket_')
  if (badge === 'complaints') return type.startsWith('complaint_')
  if (badge === 'announcements') return type === 'announcement'
  if (badge === 'remarks') return type.startsWith('remark_')
  if (badge === 'messages') return type.startsWith('message_')
  if (badge === 'password_recovery') return type.startsWith('password_recovery') || type === 'password_reset'
  if (badge === 'users') return type === 'registration_request'
  return false
}

const menuBadgeCount = (item) => {
  if (!item.badge) return 0
  return countByPredicate((type) => notificationMatchesBadge(item.badge, type))
}

const markMenuNotificationsRead = async (item) => {
  if (!item.badge || item.badge === 'complaints' || item.badge === 'messages' || item.badge === 'users' || !menuBadgeCount(item)) return
  try {
    const notifications = await api.request('/notifications/', {
      query: { unread_only: true, skip: 0, limit: 200 }
    })
    const targets = Array.isArray(notifications)
      ? notifications.filter((notification) => notificationMatchesBadge(item.badge, String(notification?.notif_type || '')))
      : []
    await Promise.allSettled(targets.map((notification) => api.request(`/notifications/${notification.id}/read`, { method: 'PATCH' })))
    await refreshUnreadSummary()
  } catch {}
}

const handleMenuClick = (item) => {
  open.value = false
  markMenuNotificationsRead(item)
}

const requestLogout = () => {
  logoutConfirmOpen.value = true
}

const confirmLogout = () => {
  logoutConfirmOpen.value = false
  open.value = false
  auth.logout()
}

const formatBadge = (count) => count > 99 ? '99+' : String(count)
const handleNotificationsUpdated = () => refreshUnreadSummary()

onMounted(() => {
  loadSettings()
  refreshUnreadSummary()
  unsubscribeLiveUpdates = liveUpdates.subscribe(() => refreshUnreadSummary())
  window.addEventListener('uk-notifications-updated', handleNotificationsUpdated)
  refreshTimer = window.setInterval(refreshUnreadSummary, 12000)
})

onBeforeUnmount(() => {
  if (typeof unsubscribeLiveUpdates === 'function') {
    unsubscribeLiveUpdates()
    unsubscribeLiveUpdates = null
  }
  if (refreshTimer) {
    window.clearInterval(refreshTimer)
    refreshTimer = null
  }
  window.removeEventListener('uk-notifications-updated', handleNotificationsUpdated)
})
</script>

<template>
  <div>
    <button class="sidebar-toggle" type="button" @click="open = !open">☰</button>
    <transition name="fade">
      <div v-if="open" class="sidebar-backdrop" @click="open = false" />
    </transition>
    <aside class="sidebar" :class="{ open }">
      <div class="sidebar__top">
        <div class="eyebrow">{{ settings.app_brand }}</div>
        <div class="sidebar__user">{{ userLabel }}</div>
        <div class="sidebar__role">Роль: {{ formatRole(auth.role.value) }}</div>
      </div>
      <nav class="sidebar__nav">
        <NuxtLink v-for="item in items" :key="item.to" :to="item.to" class="sidebar__link" @click="handleMenuClick(item)">
          <span class="sidebar__link-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path :d="iconPaths[item.icon] || iconPaths.tickets" />
            </svg>
          </span>
          <span class="sidebar__link-label">{{ item.label }}</span>
          <span v-if="menuBadgeCount(item)" class="sidebar__badge">{{ formatBadge(menuBadgeCount(item)) }}</span>
        </NuxtLink>
      </nav>
      <button class="btn btn--ghost btn--full sidebar__logout" type="button" @click="requestLogout">Выйти</button>
    </aside>
    <ConfirmDialog
      :open="logoutConfirmOpen"
      title="Выйти из аккаунта?"
      message="Вы действительно хотите завершить текущий сеанс?"
      confirm-label="Да, выйти"
      cancel-label="Отмена"
      tone="danger"
      :show-close="false"
      @close="logoutConfirmOpen = false"
      @confirm="confirmLogout"
    />
  </div>
</template>
