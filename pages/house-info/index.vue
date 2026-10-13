<script setup>
definePageMeta({ middleware: 'auth' })

import { formatAddress, formatDate, formatDateInputValue, formatDateTimeInputValue } from '~/utils/format'

const auth = useAuth()
const api = useApi()
const { showToast } = useToast()

const houses = ref([])
const selectedHouseId = ref('')
const events = ref([])
const contacts = ref([])
const schedules = ref([])
const loading = ref(true)
const error = ref('')
const message = ref('')
const pendingDelete = ref(null)
const deleteBusy = ref(false)

const sections = reactive({
  events: false,
  contacts: false,
  schedules: false
})

const canManage = computed(() => auth.hasRole('admin') || (auth.hasRole('dispatcher') && Boolean(auth.user.value?.can_manage_houses)) || (auth.hasRole('admin_assistant') && Boolean(auth.user.value?.can_manage_house_info)))
const pageSubtitle = computed(() => canManage.value
  ? 'Плановые работы, графики и контакты по домам с возможностью создавать и редактировать записи.'
  : 'Информация по вашему дому: плановые работы, графики и полезные контакты.')

const defaultEventTypeOptions = [
  { value: 'planned_outage', label: 'Плановое отключение' },
  { value: 'planned_work', label: 'Плановые работы' }
]

const defaultScheduleTypeOptions = [
  { value: 'cleaning', label: 'Уборка' },
  { value: 'inspection', label: 'Проверка' },
  { value: 'maintenance', label: 'Обслуживание' }
]

const eventTypeOptions = ref([...defaultEventTypeOptions])
const scheduleTypeOptions = ref([...defaultScheduleTypeOptions])

const eventForm = reactive({
  id: null,
  house_id: '',
  title: '',
  description: '',
  event_type: 'planned_work',
  starts_at: '',
  ends_at: '',
  is_active: true
})

const contactForm = reactive({
  id: null,
  house_id: '',
  title: '',
  phone: '',
  description: '',
  is_24_7: false,
  sort_order: 0,
  is_active: true
})

const scheduleForm = reactive({
  id: null,
  house_id: '',
  title: '',
  description: '',
  schedule_type: 'cleaning',
  no_date_range: false,
  starts_at: '',
  ends_at: '',
  start_time: '',
  end_time: '',
  frequency_text: '',
  is_active: true
})

const typeLabel = (list, value) => {
  const items = Array.isArray(list) ? list : list.value
  return items.find((item) => item.value === value)?.label || value || '—'
}
const preferredOption = (options, preferredValue) => options.value.find((item) => item.value === preferredValue)?.value || options.value[0]?.value || preferredValue
const houseLabel = (houseId) => formatAddress(houses.value.find((item) => item.id === houseId))

const toggleSection = (key) => {
  sections[key] = !sections[key]
}

const resetEventForm = () => {
  eventForm.id = null
  eventForm.house_id = selectedHouseId.value
  eventForm.title = ''
  eventForm.description = ''
  eventForm.event_type = preferredOption(eventTypeOptions, 'planned_work')
  eventForm.starts_at = ''
  eventForm.ends_at = ''
  eventForm.is_active = true
}

const resetContactForm = () => {
  contactForm.id = null
  contactForm.house_id = selectedHouseId.value
  contactForm.title = ''
  contactForm.phone = ''
  contactForm.description = ''
  contactForm.is_24_7 = false
  contactForm.sort_order = 0
  contactForm.is_active = true
}

const resetScheduleForm = () => {
  scheduleForm.id = null
  scheduleForm.house_id = selectedHouseId.value
  scheduleForm.title = ''
  scheduleForm.description = ''
  scheduleForm.schedule_type = preferredOption(scheduleTypeOptions, 'cleaning')
  scheduleForm.no_date_range = false
  scheduleForm.starts_at = ''
  scheduleForm.ends_at = ''
  scheduleForm.start_time = ''
  scheduleForm.end_time = ''
  scheduleForm.frequency_text = ''
  scheduleForm.is_active = true
}

const loadHouses = async () => {
  if (!canManage.value) {
    houses.value = auth.user.value?.house ? [auth.user.value.house] : []
    if (auth.user.value?.house_id) {
      selectedHouseId.value = String(auth.user.value.house_id)
    }
    resetEventForm()
    resetContactForm()
    resetScheduleForm()
    return
  }

  try {
    houses.value = await api.request('/houses/')
    if (!selectedHouseId.value && houses.value.length) {
      selectedHouseId.value = String(houses.value[0].id)
    }
  } catch {
    houses.value = []
  }

  resetEventForm()
  resetContactForm()
  resetScheduleForm()
}

const loadData = async () => {
  loading.value = true
  error.value = ''
  message.value = ''
  try {
    const houseId = selectedHouseId.value ? Number(selectedHouseId.value) : undefined
    const query = {
      house_id: canManage.value ? houseId : undefined,
      active_only: !canManage.value
    }

    const [eventsData, contactsData, schedulesData] = await Promise.all([
      api.request('/house-info/events', { query }),
      api.request('/house-info/contacts', { query }),
      api.request('/house-info/schedules', { query })
    ])

    events.value = eventsData
    contacts.value = contactsData
    schedules.value = schedulesData
  } catch (e) {
    error.value = e?.data?.detail || e?.message || 'Не удалось загрузить информацию по дому'
  } finally {
    loading.value = false
  }
}

const buildHouseId = (value) => {
  if (!value) return null
  return Number(value)
}

const buildDateValue = (value) => value ? new Date(`${value}T00:00:00`).toISOString() : null

const mapTypeOptions = (items, fallback) => {
  if (!Array.isArray(items) || !items.length) return [...fallback]
  return items.map((item) => ({
    value: item.code,
    label: item.name
  }))
}

const loadTypeOptions = async () => {
  try {
    const [eventTypes, scheduleTypes] = await Promise.all([
      api.request('/house-info/types', { query: { type_group: 'event', active_only: true } }),
      api.request('/house-info/types', { query: { type_group: 'schedule', active_only: true } })
    ])
    eventTypeOptions.value = mapTypeOptions(eventTypes, defaultEventTypeOptions)
    scheduleTypeOptions.value = mapTypeOptions(scheduleTypes, defaultScheduleTypeOptions)
  } catch {
    eventTypeOptions.value = [...defaultEventTypeOptions]
    scheduleTypeOptions.value = [...defaultScheduleTypeOptions]
  }

  if (!eventTypeOptions.value.some((item) => item.value === eventForm.event_type)) {
    eventForm.event_type = preferredOption(eventTypeOptions, 'planned_work')
  }
  if (!scheduleTypeOptions.value.some((item) => item.value === scheduleForm.schedule_type)) {
    scheduleForm.schedule_type = preferredOption(scheduleTypeOptions, 'cleaning')
  }
}

const saveEvent = async () => {
  error.value = ''
  message.value = ''
  try {
    const payload = {
      house_id: buildHouseId(eventForm.house_id),
      title: eventForm.title,
      description: eventForm.description || null,
      event_type: eventForm.event_type,
      starts_at: new Date(eventForm.starts_at).toISOString(),
      ends_at: eventForm.ends_at ? new Date(eventForm.ends_at).toISOString() : null,
      is_active: Boolean(eventForm.is_active)
    }

    if (eventForm.id) {
      await api.request(`/house-info/events/${eventForm.id}`, { method: 'PATCH', body: payload })
      showToast('Событие обновлено')
    } else {
      await api.request('/house-info/events', { method: 'POST', body: payload })
      showToast('Событие сохранено')
    }

    resetEventForm()
    await loadData()
  } catch (e) {
    error.value = e?.data?.detail || e?.message || 'Не удалось сохранить событие'
  }
}

const saveContact = async () => {
  error.value = ''
  message.value = ''
  try {
    const payload = {
      house_id: buildHouseId(contactForm.house_id),
      title: contactForm.title,
      phone: contactForm.phone,
      description: contactForm.description || null,
      is_24_7: Boolean(contactForm.is_24_7),
      sort_order: 0,
      is_active: Boolean(contactForm.is_active)
    }

    if (contactForm.id) {
      await api.request(`/house-info/contacts/${contactForm.id}`, { method: 'PATCH', body: payload })
      showToast('Контакт обновлён')
    } else {
      await api.request('/house-info/contacts', { method: 'POST', body: payload })
      showToast('Контакт сохранён')
    }

    resetContactForm()
    await loadData()
  } catch (e) {
    error.value = e?.data?.detail || e?.message || 'Не удалось сохранить контакт'
  }
}

const saveSchedule = async () => {
  error.value = ''
  message.value = ''
  try {
    const payload = {
      house_id: buildHouseId(scheduleForm.house_id),
      title: scheduleForm.title,
      description: scheduleForm.description || null,
      schedule_type: scheduleForm.schedule_type,
      starts_at: scheduleForm.no_date_range ? null : buildDateValue(scheduleForm.starts_at),
      ends_at: scheduleForm.no_date_range ? null : buildDateValue(scheduleForm.ends_at),
      start_time: scheduleForm.start_time || null,
      end_time: scheduleForm.end_time || null,
      frequency_text: scheduleForm.frequency_text || null,
      is_active: Boolean(scheduleForm.is_active)
    }

    if (scheduleForm.id) {
      await api.request(`/house-info/schedules/${scheduleForm.id}`, { method: 'PATCH', body: payload })
      showToast('График обновлён')
    } else {
      await api.request('/house-info/schedules', { method: 'POST', body: payload })
      showToast('График сохранён')
    }

    resetScheduleForm()
    await loadData()
  } catch (e) {
    error.value = e?.data?.detail || e?.message || 'Не удалось сохранить график'
  }
}

const editEvent = (item) => {
  eventForm.id = item.id
  eventForm.house_id = item.house_id ? String(item.house_id) : ''
  eventForm.title = item.title
  eventForm.description = item.description || ''
  eventForm.event_type = item.event_type
  eventForm.starts_at = formatDateTimeInputValue(item.starts_at)
  eventForm.ends_at = formatDateTimeInputValue(item.ends_at)
  eventForm.is_active = Boolean(item.is_active)
  sections.events = true
}

const editContact = (item) => {
  contactForm.id = item.id
  contactForm.house_id = item.house_id ? String(item.house_id) : ''
  contactForm.title = item.title
  contactForm.phone = item.phone
  contactForm.description = item.description || ''
  contactForm.is_24_7 = Boolean(item.is_24_7)
  contactForm.sort_order = Number(item.sort_order || 0)
  contactForm.is_active = Boolean(item.is_active)
  sections.contacts = true
}

const editSchedule = (item) => {
  scheduleForm.id = item.id
  scheduleForm.house_id = item.house_id ? String(item.house_id) : ''
  scheduleForm.title = item.title
  scheduleForm.description = item.description || ''
  scheduleForm.schedule_type = item.schedule_type
  scheduleForm.no_date_range = !item.starts_at && !item.ends_at
  scheduleForm.starts_at = formatDateInputValue(item.starts_at)
  scheduleForm.ends_at = formatDateInputValue(item.ends_at)
  scheduleForm.start_time = item.start_time ? String(item.start_time).slice(0, 5) : ''
  scheduleForm.end_time = item.end_time ? String(item.end_time).slice(0, 5) : ''
  scheduleForm.frequency_text = item.frequency_text || ''
  scheduleForm.is_active = Boolean(item.is_active)
  sections.schedules = true
}

const removeRecord = async (path, successMessage) => {
  error.value = ''
  message.value = ''
  try {
    await api.request(path, { method: 'DELETE' })
    showToast(successMessage)
    await loadData()
  } catch (e) {
    error.value = e?.data?.detail || e?.message || 'Не удалось удалить запись'
  }
}

const requestRemoveRecord = (path, successMessage, title, confirmMessage) => {
  pendingDelete.value = { path, successMessage, title, confirmMessage }
}

const closeDeleteConfirm = () => {
  if (deleteBusy.value) return
  pendingDelete.value = null
}

const confirmRemoveRecord = async () => {
  if (!pendingDelete.value) return
  deleteBusy.value = true
  try {
    await removeRecord(pendingDelete.value.path, pendingDelete.value.successMessage)
    pendingDelete.value = null
  } finally {
    deleteBusy.value = false
  }
}

watch(selectedHouseId, async () => {
  resetEventForm()
  resetContactForm()
  resetScheduleForm()
  await loadData()
})

onMounted(async () => {
  await loadTypeOptions()
  await loadHouses()
  await loadData()
})
</script>

<template>
  <AppPage title="Информация по дому" :subtitle="pageSubtitle">
    <div class="panel">
      <div class="toolbar">
        <label v-if="canManage" class="field">
          <span>Дом</span>
          <select v-model="selectedHouseId">
            <option :value="''">Все дома</option>
            <option v-for="house in houses" :key="house.id" :value="String(house.id)">{{ house.city }}, {{ house.address }}</option>
          </select>
        </label>
        <div v-else class="muted">Дом: {{ formatAddress(auth.user.value?.house) }}</div>
        <button class="btn btn--ghost" type="button" @click="loadData">Обновить</button>
      </div>
    </div>

    <div v-if="error" class="panel"><div class="alert alert--error">{{ error }}</div></div>
    <div v-if="loading" class="panel">Загрузка...</div>

    <template v-else>
      <div class="panel info-section">
        <button class="collapsible-toggle" type="button" :aria-expanded="sections.events" @click="toggleSection('events')">
          <span>Плановые работы и отключения</span>
          <span class="collapsible-toggle__icon" :class="{ 'collapsible-toggle__icon--open': sections.events }" aria-hidden="true"></span>
        </button>

        <div v-if="sections.events" class="stack">
          <div v-if="canManage" class="panel">
            <div class="section-title">{{ eventForm.id ? 'Изменить событие' : 'Новое событие' }}</div>
            <div class="form-grid">
              <label v-if="canManage" class="field">
                <span>Дом</span>
                <select v-model="eventForm.house_id">
                  <option :value="''">Все дома</option>
                  <option v-for="house in houses" :key="house.id" :value="String(house.id)">{{ house.city }}, {{ house.address }}</option>
                </select>
              </label>
              <label class="field">
                <span>Заголовок</span>
                <input v-model="eventForm.title" type="text" />
              </label>
              <label class="field">
                <span>Тип</span>
                <select v-model="eventForm.event_type">
                  <option v-for="item in eventTypeOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
                </select>
              </label>
              <label class="field">
                <span>Начало</span>
                <input v-model="eventForm.starts_at" type="datetime-local" />
              </label>
              <label class="field">
                <span>Окончание</span>
                <input v-model="eventForm.ends_at" type="datetime-local" />
              </label>
              <label class="field field--span-2">
                <span>Описание</span>
                <textarea v-model="eventForm.description" />
              </label>
            </div>
            <div class="toolbar">
              <button class="btn btn--primary" type="button" @click="saveEvent">Сохранить</button>
              <button class="btn btn--ghost" type="button" @click="resetEventForm">Очистить</button>
            </div>
          </div>

          <div v-if="!events.length" class="empty-box">Активных событий пока нет.</div>
          <div v-else class="stack">
            <div v-for="item in events" :key="item.id" class="notice-card">
              <div class="notice-card__head">
                <div>
                  <h3>{{ item.title }}</h3>
                  <div class="notice-card__meta">
                    <span>{{ typeLabel(eventTypeOptions, item.event_type) }}</span>
                    <span>{{ houseLabel(item.house_id) }}</span>
                  </div>
                </div>
                <div class="toolbar" v-if="canManage">
                  <button class="btn btn--ghost btn--sm" type="button" @click="editEvent(item)">Изменить</button>
                  <button class="btn btn--ghost btn--sm" type="button" @click="requestRemoveRecord(`/house-info/events/${item.id}`, 'Событие удалено', 'Удалить запись?', 'Плановая работа или отключение будет удалено из информации по дому.')">Удалить</button>
                </div>
              </div>
              <div class="muted">{{ item.description || 'Без описания' }}</div>
              <div class="notice-card__meta">
                <span>Начало: {{ formatDate(item.starts_at) }}</span>
                <span v-if="item.ends_at">Окончание: {{ formatDate(item.ends_at) }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="panel info-section">
        <button class="collapsible-toggle" type="button" :aria-expanded="sections.contacts" @click="toggleSection('contacts')">
          <span>Контакты и полезные номера</span>
          <span class="collapsible-toggle__icon" :class="{ 'collapsible-toggle__icon--open': sections.contacts }" aria-hidden="true"></span>
        </button>

        <div v-if="sections.contacts" class="stack">
          <div v-if="canManage" class="panel">
            <div class="section-title">{{ contactForm.id ? 'Изменить контакт' : 'Новый контакт' }}</div>
            <div class="muted-box" style="margin-bottom: 14px;">
              Здесь можно хранить аварийные, информационные и служебные номера.
            </div>
            <div class="form-grid">
              <label v-if="canManage" class="field">
                <span>Дом</span>
                <select v-model="contactForm.house_id">
                  <option :value="''">Все дома</option>
                  <option v-for="house in houses" :key="house.id" :value="String(house.id)">{{ house.city }}, {{ house.address }}</option>
                </select>
              </label>
              <label class="field">
                <span>Название</span>
                <input v-model="contactForm.title" type="text" />
              </label>
              <label class="field">
                <span>Телефон</span>
                <input v-model="contactForm.phone" type="text" />
              </label>
              <label class="field field--span-2">
                <span>Описание</span>
                <textarea v-model="contactForm.description" placeholder="Например: аварийная служба, управляющая компания, справочная информация" />
              </label>
            </div>
            <div class="toolbar">
              <label class="checkbox">
                <input v-model="contactForm.is_24_7" type="checkbox" />
                <span>Принимает звонки круглосуточно</span>
              </label>
              <button class="btn btn--primary" type="button" @click="saveContact">Сохранить</button>
              <button class="btn btn--ghost" type="button" @click="resetContactForm">Очистить</button>
            </div>
          </div>

          <div v-if="!contacts.length" class="empty-box">Контактов пока нет.</div>
          <div v-else class="stack">
            <div v-for="item in contacts" :key="item.id" class="notice-card">
              <div class="notice-card__head">
                <div>
                  <h3>{{ item.title }}</h3>
                  <div class="notice-card__meta">
                    <span>{{ item.phone }}</span>
                    <span>{{ houseLabel(item.house_id) }}</span>
                    <span v-if="item.is_24_7">Круглосуточно</span>
                  </div>
                </div>
                <div class="toolbar" v-if="canManage">
                  <button class="btn btn--ghost btn--sm" type="button" @click="editContact(item)">Изменить</button>
                  <button class="btn btn--ghost btn--sm" type="button" @click="requestRemoveRecord(`/house-info/contacts/${item.id}`, 'Контакт удалён', 'Удалить контакт?', 'Контакт или полезный номер будет удалён из информации по дому.')">Удалить</button>
                </div>
              </div>
              <div class="muted">{{ item.description || 'Без описания' }}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="panel info-section">
        <button class="collapsible-toggle" type="button" :aria-expanded="sections.schedules" @click="toggleSection('schedules')">
          <span>Графики уборки и планового обслуживания</span>
          <span class="collapsible-toggle__icon" :class="{ 'collapsible-toggle__icon--open': sections.schedules }" aria-hidden="true"></span>
        </button>

        <div v-if="sections.schedules" class="stack">
          <div v-if="canManage" class="panel">
            <div class="section-title">{{ scheduleForm.id ? 'Изменить график' : 'Новый график' }}</div>
            <div class="form-grid">
              <label v-if="canManage" class="field">
                <span>Дом</span>
                <select v-model="scheduleForm.house_id">
                  <option :value="''">Все дома</option>
                  <option v-for="house in houses" :key="house.id" :value="String(house.id)">{{ house.city }}, {{ house.address }}</option>
                </select>
              </label>
              <label class="field">
                <span>Тип</span>
                <select v-model="scheduleForm.schedule_type">
                  <option v-for="item in scheduleTypeOptions" :key="item.value" :value="item.value">{{ item.label }}</option>
                </select>
              </label>
              <label class="field">
                <span>Название</span>
                <input v-model="scheduleForm.title" type="text" />
              </label>
              <label class="checkbox field--span-2">
                <input v-model="scheduleForm.no_date_range" type="checkbox" />
                <span>Не устанавливать дату начала и окончания</span>
              </label>
              <label v-if="!scheduleForm.no_date_range" class="field">
                <span>Дата начала</span>
                <input v-model="scheduleForm.starts_at" type="date" />
              </label>
              <label v-if="!scheduleForm.no_date_range" class="field">
                <span>Дата окончания</span>
                <input v-model="scheduleForm.ends_at" type="date" />
              </label>
              <label class="field">
                <span>С какого времени</span>
                <input v-model="scheduleForm.start_time" type="time" />
              </label>
              <label class="field">
                <span>До какого времени</span>
                <input v-model="scheduleForm.end_time" type="time" />
              </label>
              <label class="field field--span-2">
                <span>Периодичность</span>
                <input v-model="scheduleForm.frequency_text" type="text" placeholder="Например: каждый вторник или каждую неделю" />
              </label>
              <label class="field field--span-2">
                <span>Описание</span>
                <textarea v-model="scheduleForm.description" />
              </label>
            </div>
            <div class="toolbar">
              <button class="btn btn--primary" type="button" @click="saveSchedule">Сохранить</button>
              <button class="btn btn--ghost" type="button" @click="resetScheduleForm">Очистить</button>
            </div>
          </div>

          <div v-if="!schedules.length" class="empty-box">Графиков пока нет.</div>
          <div v-else class="stack">
            <div v-for="item in schedules" :key="item.id" class="notice-card">
              <div class="notice-card__head">
                <div>
                  <h3>{{ item.title }}</h3>
                  <div class="notice-card__meta">
                    <span>{{ typeLabel(scheduleTypeOptions, item.schedule_type) }}</span>
                    <span>{{ houseLabel(item.house_id) }}</span>
                  </div>
                </div>
                <div class="toolbar" v-if="canManage">
                  <button class="btn btn--ghost btn--sm" type="button" @click="editSchedule(item)">Изменить</button>
                  <button class="btn btn--ghost btn--sm" type="button" @click="requestRemoveRecord(`/house-info/schedules/${item.id}`, 'График удалён', 'Удалить график?', 'График уборки или обслуживания будет удалён из информации по дому.')">Удалить</button>
                </div>
              </div>
              <div class="muted">{{ item.description || 'Без описания' }}</div>
              <div class="notice-card__meta">
                <span v-if="item.frequency_text">Периодичность: {{ item.frequency_text }}</span>
                <span v-if="item.starts_at">Начало: {{ formatDate(item.starts_at) }}</span>
                <span v-if="item.ends_at">Окончание: {{ formatDate(item.ends_at) }}</span>
                <span v-if="item.start_time || item.end_time">Время: {{ item.start_time ? String(item.start_time).slice(0, 5) : '—' }} - {{ item.end_time ? String(item.end_time).slice(0, 5) : '—' }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <ConfirmDialog
      :open="Boolean(pendingDelete)"
      :title="pendingDelete?.title || 'Удалить запись?'"
      :message="pendingDelete?.confirmMessage || 'Подтвердите удаление записи.'"
      confirm-label="Удалить"
      tone="danger"
      :busy="deleteBusy"
      @confirm="confirmRemoveRecord"
      @close="closeDeleteConfirm"
    />
  </AppPage>
</template>
