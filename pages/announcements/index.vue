<script setup>
definePageMeta({ middleware: 'auth' })

const api = useApi()
const auth = useAuth()
const { showToast } = useToast()

const items = ref([])
const houses = ref([])
const entrancesByHouse = reactive({})
const loading = ref(true)
const saving = ref(false)
const archiveBusyId = ref(null)
const formOpen = ref(false)
const error = ref('')
const message = ref('')
const houseSearch = ref('')
const targetModalOpen = ref(false)
const dateFrom = ref('')
const dateTo = ref('')

const canManage = computed(() => auth.hasRole('admin', 'dispatcher') || (auth.hasRole('admin_assistant') && Boolean(auth.user.value?.can_manage_announcements)))
const canViewHistory = computed(() => auth.hasRole('admin'))

const filteredHouses = computed(() => {
  const needle = houseSearch.value.trim().toLowerCase()
  if (!needle) return houses.value
  return houses.value.filter((house) => [house.city, house.address].filter(Boolean).join(' ').toLowerCase().includes(needle))
})

const houseLabelMap = computed(() => {
  return houses.value.reduce((acc, house) => {
    acc[house.id] = [house.city, house.address].filter(Boolean).join(', ')
    return acc
  }, {})
})

const entranceLabelMap = computed(() => {
  return Object.values(entrancesByHouse).flat().reduce((acc, entrance) => {
    acc[entrance.id] = `Подъезд ${entrance.number}`
    return acc
  }, {})
})

const form = reactive({
  title: '',
  content: '',
  targets: [],
  is_important: false
})

const targetKey = (target) => `${target.house_id || 'all'}:${target.entrance_id || 'all'}`

const targetLabel = (target) => {
  if (!target?.house_id) return 'Для всех домов'
  const house = houseLabelMap.value[target.house_id] || `Дом ID: ${target.house_id}`
  const entrance = target.entrance_id ? entranceLabelMap.value[target.entrance_id] || `Подъезд ID: ${target.entrance_id}` : 'все подъезды'
  return `${house} · ${entrance}`
}

const selectedTargetKeys = computed(() => new Set(form.targets.map((target) => targetKey(target))))

const isTargetSelected = (target) => selectedTargetKeys.value.has(targetKey(target))

const selectedTargetsSummary = computed(() => {
  if (!form.targets.length) return 'Для всех домов'
  const count = form.targets.length
  return `${count} ${count === 1 ? 'адресат' : count > 1 && count < 5 ? 'адресата' : 'адресатов'}`
})

const filteredItems = computed(() => {
  const fromTime = dateFrom.value ? new Date(`${dateFrom.value}T00:00:00`).getTime() : Number.NEGATIVE_INFINITY
  const toTime = dateTo.value ? new Date(`${dateTo.value}T23:59:59`).getTime() : Number.POSITIVE_INFINITY

  return items.value.filter((item) => {
    const createdAt = new Date(item.created_at).getTime()
    if (!Number.isFinite(createdAt)) return true
    return createdAt >= fromTime && createdAt <= toTime
  })
})

const openTargetModal = () => {
  targetModalOpen.value = true
}

const selectAllHousesTarget = () => {
  form.targets = []
}

const removeHouseTargets = (houseId) => {
  form.targets = form.targets.filter((target) => Number(target.house_id) !== Number(houseId))
}

const toggleHouseTarget = (house, checked) => {
  const houseId = Number(house.id)
  removeHouseTargets(houseId)
  if (checked) {
    form.targets.push({ house_id: houseId, entrance_id: null })
  }
}

const toggleEntranceTarget = (house, entrance, checked) => {
  const houseId = Number(house.id)
  const entranceId = Number(entrance.id)
  form.targets = form.targets.filter((target) => {
    if (Number(target.house_id) !== houseId) return true
    return target.entrance_id && Number(target.entrance_id) !== entranceId
  })
  if (checked) {
    form.targets.push({ house_id: houseId, entrance_id: entranceId })
  }
}

const normalizeAnnouncement = (item) => ({
  ...item,
  targetHouseLabel: item.target_house_id ? houseLabelMap.value[item.target_house_id] || `Дом ID: ${item.target_house_id}` : 'Для всех домов',
  targetEntranceLabel: item.target_entrance_id ? entranceLabelMap.value[item.target_entrance_id] || `Подъезд ID: ${item.target_entrance_id}` : ''
})

const fetchEntrances = async (houseId) => {
  if (!houseId || entrancesByHouse[houseId]) return entrancesByHouse[houseId] || []
  try {
    const entries = await api.request(`/houses/${houseId}/entrances`)
    entrancesByHouse[houseId] = entries
  } catch {
    entrancesByHouse[houseId] = []
  }
  return entrancesByHouse[houseId]
}

const fetchHouses = async () => {
  try {
    houses.value = await api.request('/houses/')
    await Promise.all(houses.value.map((house) => fetchEntrances(house.id)))
  } catch {
    houses.value = []
  }
}

const fetchItems = async () => {
  loading.value = true
  error.value = ''
  try {
    const rawItems = await api.request('/announcements/')
    items.value = rawItems.map(normalizeAnnouncement)
  } catch (e) {
    items.value = []
    error.value = e?.data?.detail || e?.message || 'Не удалось загрузить объявления'
  } finally {
    loading.value = false
  }
}

const resetForm = () => {
  form.title = ''
  form.content = ''
  form.targets = []
  houseSearch.value = ''
  targetModalOpen.value = false
  form.is_important = false
}

const removeAnnouncementTarget = (target) => {
  form.targets = form.targets.filter((item) => targetKey(item) !== targetKey(target))
}

const createItem = async () => {
  error.value = ''
  message.value = ''
  if (!form.title.trim() || !form.content.trim()) {
    error.value = 'Заполните заголовок и текст объявления'
    return
  }

  saving.value = true
  try {
    const targets = form.targets.length ? form.targets : [{ house_id: null, entrance_id: null }]
    for (const target of targets) {
      await api.request('/announcements/', {
        method: 'POST',
        body: {
        title: form.title.trim(),
        content: form.content.trim(),
        is_important: form.is_important,
        ...(target.house_id ? { target_house_id: Number(target.house_id) } : {}),
        ...(target.entrance_id ? { target_entrance_id: Number(target.entrance_id) } : {})
        }
      })
    }
    resetForm()
    formOpen.value = false
    showToast('Объявление опубликовано')
    await fetchItems()
  } catch (e) {
    error.value = e?.data?.detail || e?.message || 'Не удалось создать объявление'
  } finally {
    saving.value = false
  }
}

const canArchiveItem = (item) => canManage.value && Number(item.author_id) === Number(auth.user.value?.id)

const toggleItemActive = async (item) => {
  if (!canArchiveItem(item)) return
  archiveBusyId.value = item.id
  error.value = ''
  try {
    await api.request(`/announcements/${item.id}`, {
      method: 'PATCH',
      query: { is_active: item.is_active === false }
    })
    showToast(item.is_active === false ? 'Объявление восстановлено' : 'Объявление перенесено в архив')
    await fetchItems()
  } catch (e) {
    error.value = e?.data?.detail || e?.message || 'Не удалось изменить статус объявления'
  } finally {
    archiveBusyId.value = null
  }
}

onMounted(async () => {
  await fetchHouses()
  await fetchItems()
})
</script>

<template>
  <AppPage title="Объявления" subtitle="Объявления для жителей.">
    <div v-if="canManage" class="panel">
      <button class="collapsible-toggle" type="button" :aria-expanded="formOpen" @click="formOpen = !formOpen">
        <span>{{ formOpen ? 'Скрыть форму объявления' : 'Создать объявление' }}</span>
        <span class="collapsible-toggle__icon" :class="{ 'collapsible-toggle__icon--open': formOpen }" aria-hidden="true"></span>
      </button>
      <div v-if="formOpen" class="stack announcement-create-body">
        <div class="form-grid">
          <label class="field field--span-2">
            <span>Заголовок</span>
            <input v-model="form.title" type="text" />
          </label>
          <div class="field field--span-2">
            <span>Адресаты</span>
            <div class="announcement-target-picker">
              <div>
                <strong>{{ selectedTargetsSummary }}</strong>
                <p>Выберите один или несколько домов, а при необходимости отдельные подъезды.</p>
              </div>
              <button class="btn btn--ghost" type="button" @click="openTargetModal">Выбрать адресатов</button>
            </div>
            <div v-if="!form.targets.length" class="muted-box">Если список пуст, объявление будет опубликовано для всех домов.</div>
            <div v-else class="announcement-target-list">
              <span v-for="target in form.targets" :key="targetKey(target)" class="announcement-target-chip">
                {{ targetLabel(target) }}
                <button type="button" aria-label="Убрать адресата" @click="removeAnnouncementTarget(target)">×</button>
              </span>
            </div>
          </div>
          <label class="field field--span-2">
            <span>Текст</span>
            <textarea v-model="form.content" rows="4" />
          </label>
          <label class="checkbox">
            <input v-model="form.is_important" type="checkbox" />
            <span>Важное объявление</span>
          </label>
        </div>
        <div v-if="error" class="alert alert--error">{{ error }}</div>
        <button class="btn btn--primary" type="button" :disabled="saving" @click="createItem">
          {{ saving ? 'Публикуем...' : 'Опубликовать' }}
        </button>
      </div>
    </div>

    <div class="panel">
      <div class="toolbar announcement-filter-toolbar">
        <label class="field">
          <span>Дата с</span>
          <input v-model="dateFrom" type="date" />
        </label>
        <label class="field">
          <span>Дата по</span>
          <input v-model="dateTo" type="date" />
        </label>
        <button v-if="dateFrom || dateTo" class="btn btn--ghost" type="button" @click="dateFrom = ''; dateTo = ''">Сбросить даты</button>
      </div>
      <div v-if="loading">Загрузка...</div>
      <div v-else-if="!filteredItems.length" class="empty-box">Объявлений по выбранным условиям пока нет.</div>
      <div v-else class="stack">
        <AnnouncementCard
          v-for="item in filteredItems"
          :key="item.id"
          :item="item"
          :can-archive="canArchiveItem(item)"
          :show-history="canViewHistory"
          :busy="archiveBusyId === item.id"
          @toggle-active="toggleItemActive"
        />
      </div>
    </div>

    <div v-if="targetModalOpen" class="modal-backdrop" @click.self="targetModalOpen = false">
      <div class="modal announcement-target-modal">
        <div class="modal__head">
          <div>
            <h3>Адресаты объявления</h3>
            <p class="muted">Отметьте несколько домов или конкретные подъезды. Если ничего не выбрано, объявление увидят все жители.</p>
          </div>
          <button class="icon-btn" type="button" aria-label="Закрыть" @click="targetModalOpen = false">×</button>
        </div>

        <label class="field">
          <span>Поиск дома</span>
          <input v-model="houseSearch" type="text" placeholder="Введите улицу или часть адреса" />
        </label>

        <div class="announcement-target-modal__toolbar">
          <button class="btn btn--ghost" type="button" @click="selectAllHousesTarget">Для всех домов</button>
          <span class="muted">{{ selectedTargetsSummary }}</span>
        </div>

        <div class="announcement-target-modal__list">
          <div v-if="!filteredHouses.length" class="empty-box">Домов по такому запросу не найдено.</div>
          <template v-else>
            <article v-for="house in filteredHouses" :key="house.id" class="announcement-house-target">
              <label class="announcement-target-option">
                <input
                  type="checkbox"
                  :checked="isTargetSelected({ house_id: house.id, entrance_id: null })"
                  @change="toggleHouseTarget(house, $event.target.checked)"
                />
                <span>
                  <strong>{{ houseLabelMap[house.id] }}</strong>
                  <small>Все подъезды дома</small>
                </span>
              </label>

              <div v-if="(entrancesByHouse[house.id] || []).length" class="announcement-entrance-grid">
                <label
                  v-for="entrance in entrancesByHouse[house.id]"
                  :key="entrance.id"
                  class="announcement-entrance-option"
                  :class="{ 'announcement-entrance-option--disabled': isTargetSelected({ house_id: house.id, entrance_id: null }) }"
                >
                  <input
                    type="checkbox"
                    :checked="isTargetSelected({ house_id: house.id, entrance_id: entrance.id })"
                    :disabled="isTargetSelected({ house_id: house.id, entrance_id: null })"
                    @change="toggleEntranceTarget(house, entrance, $event.target.checked)"
                  />
                  <span>Подъезд {{ entrance.number }}</span>
                </label>
              </div>
            </article>
          </template>
        </div>

        <div class="toolbar confirm-modal__actions">
          <button class="btn btn--primary" type="button" @click="targetModalOpen = false">Готово</button>
        </div>
      </div>
    </div>
  </AppPage>
</template>
