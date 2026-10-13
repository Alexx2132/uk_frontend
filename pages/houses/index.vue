<script setup>
definePageMeta({ middleware: 'auth' })

import { validateContactPhone } from '~/utils/phone'

const auth = useAuth()
const api = useApi()
const { showToast } = useToast()

const houses = ref([])
const selectedHouseId = ref(null)
const structure = ref(null)
const residents = ref([])
const loading = ref(true)
const apartmentModalOpen = ref(false)
const selectedApartment = ref(null)
const houseSearch = ref('')
const previewScale = ref(100)
const residentAutofillOpen = ref(false)
const residentAutofillLoading = ref(false)
const residentAutofillForm = reactive({
  login_prefix: 'flat',
  password: '123',
  name_prefix: 'Житель'
})
const deleteConfirmOpen = ref(false)
const deleteLoading = ref(false)

const canManageHouses = computed(() => auth.hasRole('admin') || (auth.hasRole('dispatcher') && Boolean(auth.user.value?.can_manage_houses)))
const canDeleteHouse = computed(() => auth.hasRole('admin'))
const canAutofillResidents = computed(() => auth.hasRole('admin') || (auth.hasRole('admin_assistant') && Boolean(auth.user.value?.can_create_users)))
const structureEntrances = computed(() => structure.value?.entrances || [])
const hasCyrillic = (value) => /[А-Яа-яЁё]/.test(String(value || ''))

const filteredHouses = computed(() => {
  const needle = houseSearch.value.trim().toLowerCase()
  if (!needle) return houses.value
  return houses.value.filter((house) => {
    const label = `${house.city || ''} ${house.address || ''}`.toLowerCase()
    return label.includes(needle)
  })
})

const previewEntrances = computed(() => {
  return structureEntrances.value.map((entrance, index) => {
    const floorsMap = new Map()
    const apartments = Array.isArray(entrance.apartments) ? entrance.apartments : []

    for (const apartment of apartments) {
      const floorNumber = Number(apartment.floor_number || 1)
      if (!floorsMap.has(floorNumber)) {
        floorsMap.set(floorNumber, [])
      }
      floorsMap.get(floorNumber).push({
        id: apartment.id,
        entrance: Number(entrance.entrance_number || index + 1),
        floor: floorNumber,
        apartmentNumber: apartment.apartment_number,
        unresolvedTicketsCount: Number(apartment.unresolved_tickets_count || 0),
        highestUnresolvedPriority: apartment.highest_unresolved_priority || null
      })
    }

    const floors = [...floorsMap.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([floor, items]) => ({
        floor,
        apartments: items.sort((a, b) => Number(a.apartmentNumber) - Number(b.apartmentNumber))
      }))

    return {
      entrance: Number(entrance.entrance_number || index + 1),
      floors
    }
  })
})

const floorsPerEntrance = computed(() => {
  const counts = previewEntrances.value.map((item) => item.floors.length)
  return Math.max(...(counts.length ? counts : [1]))
})

const apartmentsPerFloor = computed(() => {
  const counts = previewEntrances.value.flatMap((item) => item.floors.map((floor) => floor.apartments.length))
  return Math.max(...(counts.length ? counts : [1]))
})

const selectedHouse = computed(() => houses.value.find((item) => Number(item.id) === Number(selectedHouseId.value)) || null)
const selectedHouseHasResidents = computed(() => residents.value.length > 0)
const selectedHouseHasActiveTickets = computed(() => previewEntrances.value.some((entrance) => {
  return entrance.floors.some((floor) => floor.apartments.some((apartment) => Number(apartment.unresolvedTicketsCount || 0) > 0))
}))
const canShowDeleteHouseButton = computed(() => {
  return canDeleteHouse.value && selectedHouse.value && !selectedHouseHasResidents.value && !selectedHouseHasActiveTickets.value
})

const residentAutofillSample = computed(() => {
  const firstApartment = previewEntrances.value
    .flatMap((entrance) => entrance.floors.flatMap((floor) => floor.apartments.map((apartment) => ({
      entrance: entrance.entrance,
      apartmentNumber: apartment.apartmentNumber
    }))))
    .at(0)

  if (!firstApartment) return ''
  return `${residentAutofillForm.login_prefix || 'prefix'}${firstApartment.entrance}${firstApartment.apartmentNumber}`
})

const fetchResidents = async () => {
  if (!selectedHouseId.value) return
  try {
    residents.value = await api.request('/users/residents', { query: { house_id: selectedHouseId.value, skip: 0, limit: 500 } })
  } catch {
    residents.value = []
  }
}

const fetchStructure = async () => {
  if (!selectedHouseId.value) {
    structure.value = null
    residents.value = []
    return
  }
  structure.value = await api.request(`/houses/${selectedHouseId.value}/structure`)
  await fetchResidents()
}

const fetchHouses = async () => {
  loading.value = true
  try {
    houses.value = await api.request('/houses/')
    if (houses.value.length && !selectedHouseId.value) {
      selectedHouseId.value = houses.value[0].id
      houseSearch.value = `${houses.value[0].city || ''}, ${houses.value[0].address || ''}`.trim()
      await fetchStructure()
    }
  } finally {
    loading.value = false
  }
}

const selectHouse = async (houseId) => {
  selectedHouseId.value = houseId ? Number(houseId) : null
  if (selectedHouse.value) {
    houseSearch.value = `${selectedHouse.value.city || ''}, ${selectedHouse.value.address || ''}`.trim()
  }
  await fetchStructure()
}

const apartmentResidents = computed(() => {
  if (!selectedApartment.value) return []
  const number = String(selectedApartment.value.apartmentNumber)
  return residents.value.filter((item) => String(item.apartment || item.apartment_number || item.apartment_id || '') === number)
})

const createResident = async (payload) => {
  if (!selectedApartment.value || !selectedHouseId.value) return
  const fullName = String(payload.full_name || '').trim()
  const login = String(payload.phone || '').trim()
  const password = String(payload.password || '').trim()
  const phoneValidation = validateContactPhone(payload.contact_phone, { required: true })
  const contactPhone = phoneValidation.value

  if (!fullName) {
    showToast('Введите ФИО жителя', { type: 'error' })
    return
  }
  if (!login) {
    showToast('Введите логин жителя', { type: 'error' })
    return
  }
  if (!password) {
    showToast('Введите пароль жителя', { type: 'error' })
    return
  }
  if (password.length < 3) {
    showToast('Пароль должен содержать не менее 3 символов', { type: 'error' })
    return
  }
  if (!phoneValidation.ok) {
    showToast(phoneValidation.error, { type: 'error' })
    return
  }

  try {
    await api.request('/users/', {
      method: 'POST',
      body: {
        full_name: fullName,
        login,
        password,
        phone: login,
        contact_phone: contactPhone || null,
        role: 'resident',
        house_id: selectedHouseId.value,
        apartment_id: selectedApartment.value.id || null,
        apartment: String(selectedApartment.value.apartmentNumber)
      }
    })
    await fetchResidents()
    apartmentModalOpen.value = false
    showToast('Житель добавлен')
  } catch (requestError) {
    showToast(requestError?.message || 'Не удалось добавить жителя', { type: 'error' })
  }
}

const autofillResidents = async () => {
  if (!selectedHouseId.value || residentAutofillLoading.value) return

  const loginPrefix = residentAutofillForm.login_prefix.trim()
  const password = residentAutofillForm.password.trim()
  const namePrefix = residentAutofillForm.name_prefix.trim() || 'Житель'

  if (!loginPrefix) {
    showToast('Укажите начало логина', { type: 'error' })
    return
  }
  if (hasCyrillic(loginPrefix)) {
    showToast('Префикс логина должен быть указан латинскими символами, цифрами или знаками', { type: 'error' })
    return
  }
  if (!password) {
    showToast('Укажите начальный пароль', { type: 'error' })
    return
  }
  if (password.length < 3) {
    showToast('Пароль должен содержать не менее 3 символов', { type: 'error' })
    return
  }

  residentAutofillLoading.value = true
  try {
    const result = await api.request('/users/residents/autofill-apartments', {
      method: 'POST',
      body: {
        house_id: selectedHouseId.value,
        login_prefix: loginPrefix,
        password,
        name_prefix: namePrefix
      }
    })
    await fetchResidents()
    const skipped = Number(result?.skipped_occupied_count || 0)
    const suffix = skipped ? `. Занятых квартир пропущено: ${skipped}` : ''
    showToast(`Автозаполнение завершено. Создано жителей: ${result?.created_count || 0}${suffix}`)
  } catch (requestError) {
    showToast(requestError?.message || 'Не удалось автозаполнить квартиры', { type: 'error' })
  } finally {
    residentAutofillLoading.value = false
  }
}

const requestDeleteHouse = () => {
  if (!selectedHouse.value) {
    showToast('Выберите дом для удаления', { type: 'error' })
    return
  }
  deleteConfirmOpen.value = true
}

const deleteSelectedHouse = async () => {
  if (!selectedHouse.value || deleteLoading.value) return
  deleteLoading.value = true
  try {
    await api.request(`/houses/${selectedHouse.value.id}`, { method: 'DELETE' })
    showToast('Дом удалён')
    deleteConfirmOpen.value = false
    selectedHouseId.value = null
    structure.value = null
    residents.value = []
    houseSearch.value = ''
    await fetchHouses()
  } catch (requestError) {
    showToast(requestError?.message || 'Не удалось удалить дом', { type: 'error' })
  } finally {
    deleteLoading.value = false
  }
}

onMounted(fetchHouses)
</script>

<template>
  <AppPage title="Дома" subtitle="Просмотр структуры дома и работа с квартирами.">
    <div class="panel houses-toolbar-panel">
      <div class="form-grid">
        <label class="field field--span-2">
          <span>Поиск дома</span>
          <input v-model="houseSearch" type="text" placeholder="Начните вводить улицу или адрес" />
        </label>

        <label class="field">
          <span>Выберите дом</span>
          <select :value="selectedHouseId" @change="selectHouse($event.target.value)">
            <option :value="null">—</option>
            <option v-for="house in filteredHouses" :key="house.id" :value="house.id">{{ house.city }}, {{ house.address }}</option>
          </select>
        </label>

        <label class="field">
          <span>Масштаб {{ previewScale }}%</span>
          <input v-model="previewScale" type="range" min="70" max="120" step="5" />
        </label>
      </div>

      <div class="toolbar houses-toolbar">
        <div class="muted" v-if="selectedHouse">{{ selectedHouse.city }}, {{ selectedHouse.address }}</div>
        <NuxtLink v-if="canManageHouses" class="btn create-house-link" to="/houses/create">Добавить дом</NuxtLink>
        <button
          v-if="canShowDeleteHouseButton"
          class="btn btn--danger"
          type="button"
          :disabled="deleteLoading"
          @click="requestDeleteHouse"
        >
          Удалить дом
        </button>
      </div>
    </div>

    <div v-if="loading" class="panel">Загрузка...</div>

    <template v-else-if="structure">
      <div v-if="canAutofillResidents" class="panel resident-autofill-panel">
        <div class="resident-autofill-panel__head">
          <div>
            <div class="section-title">Автозаполнение квартир жителями</div>
            <div class="muted">
              Создаёт жителей только для пустых квартир выбранного дома. Логин формируется из префикса, номера подъезда и номера квартиры.
            </div>
          </div>
          <button class="btn btn--ghost" type="button" @click="residentAutofillOpen = !residentAutofillOpen">
            {{ residentAutofillOpen ? 'Свернуть' : 'Настроить' }}
          </button>
        </div>

        <transition name="fade">
          <div v-if="residentAutofillOpen" class="resident-autofill-panel__body">
            <div class="form-grid">
              <label class="field">
                <span>Начало логина</span>
                <input v-model="residentAutofillForm.login_prefix" type="text" placeholder="Например, flat" />
              </label>
              <label class="field">
                <span>Начальный пароль</span>
                <input v-model="residentAutofillForm.password" type="text" />
              </label>
              <label class="field">
                <span>Префикс имени</span>
                <input v-model="residentAutofillForm.name_prefix" type="text" placeholder="Житель" />
              </label>
              <div class="autofill-example">
                <span>Пример логина</span>
                <strong>{{ residentAutofillSample || 'Будет показан после выбора дома' }}</strong>
              </div>
            </div>
            <button class="btn btn--primary" type="button" :disabled="residentAutofillLoading" @click="autofillResidents">
              {{ residentAutofillLoading ? 'Создаём жителей...' : 'Автозаполнить пустые квартиры' }}
            </button>
          </div>
        </transition>
      </div>

      <div class="panel">
        <div class="section-title">Структура дома</div>
        <div class="muted" style="margin-bottom: 12px;">
          Квартиры с активными заявками подсвечены по максимальному приоритету. При наведении можно увидеть краткую сводку.
        </div>
        <HousePreview
          :entrances="previewEntrances"
          :entrances-count="previewEntrances.length || 1"
          :floors-per-entrance="floorsPerEntrance"
          :apartments-per-floor="apartmentsPerFloor"
          :scale="previewScale"
          clickable
          @select-apartment="selectedApartment = $event; apartmentModalOpen = true"
        />
      </div>
    </template>

    <ApartmentModal
      :open="apartmentModalOpen"
      :apartment="selectedApartment"
      :residents="apartmentResidents"
      @close="apartmentModalOpen = false"
      @create-resident="createResident"
    />

    <ConfirmDialog
      :open="deleteConfirmOpen"
      title="Удалить дом"
      :message="selectedHouse ? `Удалить дом ${selectedHouse.city}, ${selectedHouse.address}? Это возможно только если в доме нет жителей и активных заявок.` : ''"
      confirm-label="Да, удалить"
      tone="danger"
      :busy="deleteLoading"
      @close="deleteConfirmOpen = false"
      @confirm="deleteSelectedHouse"
    />
  </AppPage>
</template>
