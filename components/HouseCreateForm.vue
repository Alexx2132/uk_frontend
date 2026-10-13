<script setup>
const emit = defineEmits(['submit'])
const form = reactive({
  city: '',
  address: '',
  structureMode: 'standard',
  entrancesCount: 2,
  floorsPerEntrance: 5,
  apartmentsPerFloor: 4,
  firstApartmentNumber: 1,
  floorLayouts: []
})

const layoutScale = ref(100)
const entrancesCount = computed(() => Math.max(1, Number(form.entrancesCount) || 1))
const floorsPerEntrance = computed(() => Math.min(20, Math.max(1, Number(form.floorsPerEntrance) || 1)))
const apartmentsPerFloor = computed(() => Math.min(6, Math.max(1, Number(form.apartmentsPerFloor) || 1)))
const ensureFloorLayouts = () => {
  const next = []
  for (let entrance = 0; entrance < entrancesCount.value; entrance++) {
    const existing = form.floorLayouts[entrance]?.floors || []
    const floors = []
    for (let floor = 0; floor < floorsPerEntrance.value; floor++) {
      floors.push(Math.max(0, Number(existing[floor] ?? form.apartmentsPerFloor) || 0))
    }
    next.push({ number: entrance + 1, floors })
  }
  form.floorLayouts = next
}
const totalApartments = computed(() => {
  if (form.structureMode !== 'custom') {
    return entrancesCount.value * floorsPerEntrance.value * apartmentsPerFloor.value
  }
  return (form.floorLayouts || []).reduce((sum, entrance) => {
    return sum + (entrance.floors || []).reduce((floorSum, count) => floorSum + Math.max(0, Number(count) || 0), 0)
  }, 0)
})
const autoScale = computed(() => {
  const entrances = entrancesCount.value
  if (entrances <= 3) return 1
  if (entrances <= 5) return 0.92
  if (entrances <= 7) return 0.82
  if (entrances <= 9) return 0.72
  return 0.62
})
const previewScale = computed(() => Math.max(50, Math.round(layoutScale.value * autoScale.value)))
const clampNumber = (value, min, max) => Math.min(max, Math.max(min, Number(value) || min))
watch(() => form.floorsPerEntrance, (value) => {
  const nextValue = clampNumber(value, 1, 20)
  if (value !== nextValue) form.floorsPerEntrance = nextValue
})
watch(() => form.apartmentsPerFloor, (value) => {
  const nextValue = clampNumber(value, 1, 6)
  if (value !== nextValue) form.apartmentsPerFloor = nextValue
})
watch([entrancesCount, floorsPerEntrance, () => form.structureMode], ensureFloorLayouts, { immediate: true })
const customPreviewEntrances = computed(() => {
  if (form.structureMode !== 'custom') return []

  const entrances = []
  let currentApartment = Math.max(1, Number(form.firstApartmentNumber) || 1)

  for (let entranceIndex = 0; entranceIndex < entrancesCount.value; entranceIndex++) {
    const floors = []
    const counts = form.floorLayouts[entranceIndex]?.floors || []
    for (let floorIndex = floorsPerEntrance.value - 1; floorIndex >= 0; floorIndex--) {
      const floor = floorIndex + 1
      const apartments = []
      const count = Math.max(0, Number(counts[floorIndex]) || 0)
      for (let index = 0; index < count; index++) {
        apartments.push({
          entrance: entranceIndex + 1,
          floor,
          apartmentNumber: currentApartment++,
          unresolvedTicketsCount: 0,
          highestUnresolvedPriority: null
        })
      }
      floors.push({ floor, apartments })
    }
    entrances.push({ entrance: entranceIndex + 1, floors })
  }

  return entrances
})
const submitForm = () => {
  if (form.structureMode === 'custom' && totalApartments.value <= 0) {
    return
  }
  emit('submit', {
    ...form,
    entrancesCount: entrancesCount.value,
    floorsPerEntrance: floorsPerEntrance.value,
    apartmentsPerFloor: apartmentsPerFloor.value,
    firstApartmentNumber: Math.max(1, Number(form.firstApartmentNumber) || 1),
    floorLayouts: form.floorLayouts.map((entrance) => ({
      number: entrance.number,
      floors: entrance.floors.map((count) => Math.max(0, Number(count) || 0))
    }))
  })
}
</script>

<template>
  <div class="house-create">
    <section class="panel house-create__panel house-create__panel--form">
      <div class="create-panel-head">
        <div>
          <div class="section-kicker">Новый объект</div>
          <div class="section-title">Параметры дома</div>
        </div>
      </div>

      <div class="address-card">
        <label class="field field--span-2"><span>Город</span><input v-model="form.city" type="text" /></label>
        <label class="field field--span-2"><span>Адрес</span><input v-model="form.address" type="text" placeholder="Введите улицу и номер дома в формате ул. Ленина, 1" /></label>
      </div>

      <div class="structure-mode-switch">
        <button
          type="button"
          class="structure-mode-option"
          :class="{ 'structure-mode-option--active': form.structureMode === 'standard' }"
          @click="form.structureMode = 'standard'"
        >
          <strong>Стандартная структура</strong>
          <span>Одинаковое количество квартир на каждом этаже.</span>
        </button>
        <button
          type="button"
          class="structure-mode-option"
          :class="{ 'structure-mode-option--active': form.structureMode === 'custom' }"
          @click="form.structureMode = 'custom'"
        >
          <strong>Нестандартная структура</strong>
          <span>Можно указать разное количество квартир на этажах.</span>
        </button>
      </div>

      <div class="structure-grid">
        <label class="field metric-field"><span>Подъезды</span><input v-model.number="form.entrancesCount" min="1" type="number" /></label>
        <label class="field metric-field"><span>Этажей в подъезде</span><input v-model.number="form.floorsPerEntrance" min="1" max="20" type="number" /></label>
        <label v-if="form.structureMode === 'standard'" class="field metric-field"><span>Квартир на этаже</span><input v-model.number="form.apartmentsPerFloor" min="1" max="6" type="number" /></label>
        <label class="field metric-field"><span>Первая квартира</span><input v-model.number="form.firstApartmentNumber" min="1" type="number" /></label>
      </div>

      <div v-if="form.structureMode === 'custom'" class="custom-floor-layout">
        <div class="muted-box">Укажите количество квартир на каждом этаже. Если этаж нежилой, поставьте 0.</div>
        <div v-for="entrance in form.floorLayouts" :key="entrance.number" class="custom-floor-layout__entrance">
          <div class="custom-floor-layout__title">Подъезд {{ entrance.number }}</div>
          <div class="custom-floor-layout__grid">
            <label v-for="(_, index) in entrance.floors" :key="`${entrance.number}-${index}`" class="field metric-field">
              <span>{{ index + 1 }} этаж</span>
              <input v-model.number="entrance.floors[index]" min="0" max="12" type="number" />
            </label>
          </div>
        </div>
      </div>

      <div class="scale-control">
        <div class="scale-control__top">
          <div>
            <span class="scale-control__label">Масштаб макета</span>
            <strong>{{ previewScale }}%</strong>
          </div>
        </div>
        <input v-model.number="layoutScale" type="range" min="50" max="125" step="5" />
      </div>

      <div class="create-metrics">
        <div>
          <span>Подъездов</span>
          <strong>{{ entrancesCount }}</strong>
        </div>
        <div>
          <span>Этажей в подъезде</span>
          <strong>{{ floorsPerEntrance }}</strong>
        </div>
        <div>
          <span>Квартир</span>
          <strong>{{ totalApartments }}</strong>
        </div>
      </div>

      <button class="btn btn--primary btn--full create-submit" :disabled="form.structureMode === 'custom' && totalApartments <= 0" @click="submitForm">Добавить дом</button>
    </section>

    <section class="panel house-create__panel house-create__panel--preview">
      <div class="preview-head">
        <div>
          <div class="section-title">Предпросмотр структуры</div>
        </div>
        <div class="preview-scale-badge">{{ previewScale }}%</div>
      </div>
      <div class="building-stage">
        <HousePreview
          :entrances-count="form.entrancesCount"
          :floors-per-entrance="floorsPerEntrance"
          :apartments-per-floor="apartmentsPerFloor"
          :first-apartment-number="form.firstApartmentNumber"
          :entrances="customPreviewEntrances"
          :scale="previewScale"
        />
      </div>
    </section>
  </div>
</template>
