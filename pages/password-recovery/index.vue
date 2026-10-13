<script setup>
import { formatDate, formatRole } from '~/utils/format'

definePageMeta({ middleware: 'auth' })

const auth = useAuth()
const api = useApi()
const { showToast } = useToast()
const { applySettings } = useAppSettings()

const loading = ref(true)
const savingSettings = ref(false)
const processing = ref(false)
const requests = ref([])
const statusFilter = ref('open')
const cooldownMinutes = ref(5)
const selectedRequest = ref(null)
const resetForm = reactive({
  temporary_password: '',
  admin_comment: ''
})
const rejectForm = reactive({
  admin_comment: ''
})
const resetResult = ref(null)
const DEFAULT_TEMPORARY_PASSWORD = 'pass123'

const canManage = computed(() => {
  if (auth.hasRole('admin')) return true
  return auth.hasRole('admin_assistant') && Boolean(auth.user.value?.can_manage_password_recovery)
})

const statusOptions = [
  { value: '', label: 'Все запросы' },
  { value: 'open', label: 'Ожидают решения' },
  { value: 'reset', label: 'Пароль сброшен' },
  { value: 'rejected', label: 'Отклонены' }
]

const statusLabel = (status) => ({
  open: 'Ожидает решения',
  reset: 'Пароль сброшен',
  rejected: 'Отклонён'
}[String(status || '').toLowerCase()] || status || 'Неизвестно')

const statusClass = (status) => ({
  open: 'access-status--open',
  reset: 'access-status--reset',
  rejected: 'access-status--rejected'
}[String(status || '').toLowerCase()] || 'access-status--open')

const userLabel = (request) => {
  const user = request?.matched_user
  if (!user) return 'Пользователь не найден'
  return [user.full_name, formatRole(user.role)].filter(Boolean).join(' · ')
}

const userAddress = (request) => {
  const user = request?.matched_user
  if (!user) return ''
  const parts = []
  if (user.house_address) parts.push(user.house_address)
  if (user.apartment_number) parts.push(`кв. ${user.apartment_number}`)
  return parts.join(', ')
}

const verificationClass = (request) => ({
  phone_match: 'access-request-card__verification--ok',
  address_match: 'access-request-card__verification--ok',
  phone_mismatch_address_match: 'access-request-card__verification--warning',
  manual_check: 'access-request-card__verification--warning',
  phone_mismatch: 'access-request-card__verification--danger',
  address_mismatch: 'access-request-card__verification--danger',
  not_found: 'access-request-card__verification--danger'
}[request?.verification_status] || 'access-request-card__verification--warning')

const canResetRequest = (request) => {
  return Boolean(request?.matched_user_id && ['phone_match', 'address_match', 'phone_mismatch_address_match'].includes(request?.verification_status))
}

const loadSettings = async () => {
  const payload = await api.request('/settings/app')
  cooldownMinutes.value = Number(payload?.password_recovery_cooldown_minutes || 5)
  applySettings(payload)
}

const loadRequests = async () => {
  requests.value = await api.request('/password-recovery/requests', {
    query: {
      status: statusFilter.value || undefined,
      skip: 0,
      limit: 200
    }
  })
}

const reload = async () => {
  loading.value = true
  try {
    await Promise.all([loadSettings(), loadRequests()])
  } catch (error) {
    showToast(error?.data?.detail || error?.message || 'Не удалось загрузить запросы на восстановление доступа', { type: 'error' })
  } finally {
    loading.value = false
  }
}

const saveCooldown = async () => {
  const minutes = Number(cooldownMinutes.value)
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 1440) {
    showToast('Укажите порог от 1 минуты до 24 часов', { type: 'error' })
    return
  }

  savingSettings.value = true
  try {
    const payload = await api.request('/settings/app', {
      method: 'PATCH',
      body: { password_recovery_cooldown_minutes: Math.round(minutes) }
    })
    cooldownMinutes.value = Number(payload?.password_recovery_cooldown_minutes || minutes)
    applySettings(payload)
    showToast('Настройки восстановления доступа сохранены')
  } catch (error) {
    showToast(error?.data?.detail || error?.message || 'Не удалось сохранить настройки', { type: 'error' })
  } finally {
    savingSettings.value = false
  }
}

const openReset = (request) => {
  selectedRequest.value = request
  resetForm.temporary_password = ''
  resetForm.admin_comment = ''
  rejectForm.admin_comment = ''
  resetResult.value = null
}

const openReject = (request) => {
  selectedRequest.value = { ...request, mode: 'reject' }
  resetForm.temporary_password = ''
  resetForm.admin_comment = ''
  rejectForm.admin_comment = ''
  resetResult.value = null
}

const closeModal = () => {
  selectedRequest.value = null
  resetResult.value = null
}

const submitReset = async () => {
  if (!selectedRequest.value?.id) return
  const temporaryPassword = resetForm.temporary_password.trim() || DEFAULT_TEMPORARY_PASSWORD
  if (temporaryPassword.length < 3) {
    showToast('Пароль должен содержать не менее 3 символов', { type: 'error' })
    return
  }
  processing.value = true
  try {
    const payload = await api.request(`/password-recovery/requests/${selectedRequest.value.id}/reset`, {
      method: 'POST',
      body: {
        temporary_password: temporaryPassword,
        admin_comment: resetForm.admin_comment.trim() || null
      }
    })
    resetResult.value = payload
    showToast('Временный пароль установлен')
    await loadRequests()
  } catch (error) {
    showToast(error?.data?.detail || error?.message || 'Не удалось сбросить пароль', { type: 'error' })
  } finally {
    processing.value = false
  }
}

const submitReject = async () => {
  if (!selectedRequest.value?.id) return
  processing.value = true
  try {
    await api.request(`/password-recovery/requests/${selectedRequest.value.id}/reject`, {
      method: 'POST',
      body: { admin_comment: rejectForm.admin_comment.trim() || null }
    })
    showToast('Запрос отклонён')
    closeModal()
    await loadRequests()
  } catch (error) {
    showToast(error?.data?.detail || error?.message || 'Не удалось отклонить запрос', { type: 'error' })
  } finally {
    processing.value = false
  }
}

const copyTemporaryPassword = async () => {
  const value = resetResult.value?.temporary_password
  if (!value || !navigator?.clipboard) return
  await navigator.clipboard.writeText(value)
  showToast('Временный пароль скопирован')
}

watch(statusFilter, () => {
  loadRequests().catch((error) => {
    showToast(error?.data?.detail || error?.message || 'Не удалось обновить список запросов', { type: 'error' })
  })
})

onMounted(async () => {
  if (!canManage.value) {
    await navigateTo('/dashboard')
    return
  }
  await reload()
})
</script>

<template>
  <AppPage
    title="Восстановление доступа"
    subtitle="Запросы пользователей, которые забыли пароль и обратились за сбросом через администратора."
  >
    <div v-if="!canManage" class="alert alert--error">Недостаточно прав для просмотра раздела.</div>
    <template v-else>
      <section class="panel access-settings-card">
        <div>
          <div class="eyebrow">Настройки</div>
          <h2>Порог повторного запроса</h2>
          <p class="muted">
            Пользователь сможет повторно отправить запрос на восстановление только после указанного времени.
          </p>
        </div>
        <label class="field access-settings-card__field">
          <span>Минуты</span>
          <input v-model.number="cooldownMinutes" type="number" min="1" max="1440" />
        </label>
        <button class="btn btn--primary" type="button" :disabled="savingSettings" @click="saveCooldown">
          {{ savingSettings ? 'Сохраняем...' : 'Сохранить изменения' }}
        </button>
      </section>

      <section class="panel access-toolbar">
        <div>
          <div class="eyebrow">Запросы</div>
          <h2>Лента восстановления доступа</h2>
        </div>
        <label class="field access-toolbar__filter">
          <span>Статус</span>
          <select v-model="statusFilter">
            <option v-for="item in statusOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
          </select>
        </label>
        <button class="btn btn--ghost" type="button" :disabled="loading" @click="reload">Обновить</button>
      </section>

      <div v-if="loading" class="empty-box">Загружаем запросы...</div>
      <div v-else-if="!requests.length" class="empty-box">Запросов пока нет.</div>
      <div v-else class="access-request-list">
        <article v-for="request in requests" :key="request.id" class="panel access-request-card">
          <div class="access-request-card__top">
            <div>
              <div class="access-request-card__title">
                {{ request.requester_name || request.requester_login }}
              </div>
              <div class="muted">
                Логин: {{ request.requester_login }} · телефон: {{ request.contact_phone }}
              </div>
            </div>
            <span class="access-status" :class="statusClass(request.status)">{{ statusLabel(request.status) }}</span>
          </div>

          <div class="access-request-card__grid">
            <div>
              <span>Заявленные данные</span>
              <strong>{{ [request.house_address, request.apartment ? `кв. ${request.apartment}` : ''].filter(Boolean).join(', ') || 'Не указаны' }}</strong>
            </div>
            <div>
              <span>Пользователь в базе</span>
              <strong>{{ userLabel(request) }}</strong>
              <small v-if="userAddress(request)">{{ userAddress(request) }}</small>
            </div>
            <div>
              <span>Создан</span>
              <strong>{{ formatDate(request.created_at) }}</strong>
            </div>
          </div>

          <div
            class="access-request-card__verification"
            :class="verificationClass(request)"
          >
            <strong>Проверка данных</strong>
            <span>{{ request.verification_note || 'Нужна ручная проверка администратором.' }}</span>
          </div>

          <p v-if="request.message" class="access-request-card__message">{{ request.message }}</p>
          <div v-if="request.processed_at" class="access-request-card__processed">
            Решение: {{ request.processed_by_name || 'сотрудник' }} · {{ formatDate(request.processed_at) }}
          </div>
          <div v-if="request.admin_comment" class="access-request-card__comment">
            {{ request.admin_comment }}
          </div>

          <div v-if="request.status === 'open'" class="toolbar access-request-card__actions">
            <button class="btn btn--primary" type="button" :disabled="!canResetRequest(request)" @click="openReset(request)">
              Сбросить пароль
            </button>
            <button class="btn btn--ghost" type="button" @click="openReject(request)">Отклонить</button>
          </div>
          <div v-if="request.status === 'open' && !request.matched_user_id" class="alert alert--error">
            Пользователь с таким логином не найден. Проверьте данные запроса перед решением.
          </div>
          <div v-else-if="request.status === 'open' && !canResetRequest(request)" class="alert alert--error">
            Сброс пароля недоступен, пока данные запроса не совпали с телефоном или адресом пользователя.
          </div>
        </article>
      </div>
    </template>
  </AppPage>

  <div v-if="selectedRequest" class="modal-backdrop" @click.self="closeModal">
    <div class="modal access-recovery-modal">
      <div class="modal__head">
        <div>
          <div class="eyebrow">{{ selectedRequest.mode === 'reject' ? 'Отклонение запроса' : 'Сброс пароля' }}</div>
          <h3>{{ selectedRequest.requester_name || selectedRequest.requester_login }}</h3>
        </div>
        <button class="icon-btn ticket-detail-close" type="button" aria-label="Закрыть" @click="closeModal">×</button>
      </div>

      <template v-if="resetResult">
        <div class="access-temp-password">
          <span>Временный пароль</span>
          <strong>{{ resetResult.temporary_password }}</strong>
          <p>Передайте этот пароль пользователю. После входа ему нужно будет заменить пароль на новый.</p>
        </div>
        <div class="toolbar confirm-modal__actions">
          <button class="btn btn--ghost" type="button" @click="copyTemporaryPassword">Скопировать пароль</button>
          <button class="btn btn--primary" type="button" @click="closeModal">Готово</button>
        </div>
      </template>

      <template v-else-if="selectedRequest.mode === 'reject'">
        <label class="field">
          <span>Комментарий</span>
          <textarea v-model="rejectForm.admin_comment" rows="4" placeholder="Например, данные не совпали с учетной записью" />
        </label>
        <div class="toolbar confirm-modal__actions">
          <button class="btn btn--ghost" type="button" @click="closeModal">Отмена</button>
          <button class="btn btn--danger" type="button" :disabled="processing" @click="submitReject">
            {{ processing ? 'Отклоняем...' : 'Отклонить запрос' }}
          </button>
        </div>
      </template>

      <template v-else>
        <div class="muted-box">
          Если оставить поле временного пароля пустым, будет установлен пароль pass123.
        </div>
        <label class="field">
          <span>Временный пароль</span>
          <input v-model="resetForm.temporary_password" type="text" placeholder="pass123" />
        </label>
        <label class="field">
          <span>Комментарий администратора</span>
          <textarea v-model="resetForm.admin_comment" rows="4" placeholder="Например, личность пользователя подтверждена" />
        </label>
        <div class="toolbar confirm-modal__actions">
          <button class="btn btn--ghost" type="button" @click="closeModal">Отмена</button>
          <button class="btn btn--primary" type="button" :disabled="processing" @click="submitReset">
            {{ processing ? 'Сбрасываем...' : 'Сбросить пароль' }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.access-settings-card,
.access-toolbar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 220px auto;
  gap: 18px;
  align-items: end;
}

.access-settings-card h2,
.access-toolbar h2 {
  margin: 4px 0 8px;
}

.access-toolbar__filter,
.access-settings-card__field {
  margin: 0;
}

.access-request-list {
  display: grid;
  gap: 16px;
}

.access-request-card {
  display: grid;
  gap: 16px;
}

.access-request-card__top {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.access-request-card__title {
  color: var(--ink);
  font-size: 22px;
  font-weight: 700;
}

.access-status {
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}

.access-status--open {
  background: #fff7df;
  color: #946200;
}

.access-status--reset {
  background: #e8f8f2;
  color: #0d7b55;
}

.access-status--rejected {
  background: #ffecec;
  color: #b4233a;
}

.access-request-card__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.access-request-card__grid > div,
.access-request-card__verification,
.access-request-card__message,
.access-request-card__comment,
.access-request-card__processed {
  border: 1px solid rgba(118, 148, 186, 0.2);
  border-radius: 20px;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.7);
}

.access-request-card__grid span,
.access-temp-password span {
  display: block;
  color: var(--muted);
  font-size: 13px;
  margin-bottom: 6px;
}

.access-request-card__grid strong,
.access-request-card__grid small {
  display: block;
}

.access-request-card__verification {
  display: grid;
  gap: 6px;
}

.access-request-card__verification strong {
  color: var(--ink);
}

.access-request-card__verification span {
  color: var(--muted);
}

.access-request-card__verification--ok {
  border-color: rgba(47, 100, 235, 0.22);
  background: rgba(47, 100, 235, 0.06);
}

.access-request-card__verification--warning {
  border-color: rgba(214, 151, 32, 0.28);
  background: rgba(255, 247, 223, 0.74);
}

.access-request-card__verification--danger {
  border-color: rgba(180, 35, 58, 0.22);
  background: rgba(255, 236, 236, 0.72);
}

.access-request-card__message,
.access-request-card__comment {
  margin: 0;
}

.access-request-card__processed {
  color: var(--muted);
}

.access-request-card__actions {
  justify-content: flex-end;
}

.access-recovery-modal {
  max-width: 680px;
}

.access-recovery-modal textarea {
  resize: none;
}

.access-temp-password {
  border: 1px solid rgba(47, 100, 235, 0.18);
  border-radius: 24px;
  padding: 20px;
  background: linear-gradient(135deg, rgba(47, 100, 235, 0.08), rgba(255, 255, 255, 0.9));
}

.access-temp-password strong {
  display: inline-flex;
  align-items: center;
  min-height: 48px;
  border-radius: 16px;
  padding: 0 18px;
  background: #fff;
  color: var(--ink);
  font-size: 24px;
  letter-spacing: 0.08em;
}

.access-temp-password p {
  margin: 12px 0 0;
  color: var(--muted);
}

@media (max-width: 900px) {
  .access-settings-card,
  .access-toolbar,
  .access-request-card__grid {
    grid-template-columns: 1fr;
  }

  .access-request-card__top {
    flex-direction: column;
  }
}
</style>
