<script setup>
import { priorityAccent } from '~/utils/format'

const props = defineProps({
  entrancesCount: { type: Number, default: 1 },
  floorsPerEntrance: { type: Number, default: 1 },
  apartmentsPerFloor: { type: Number, default: 1 },
  firstApartmentNumber: { type: Number, default: 1 },
  entrances: { type: Array, default: () => [] },
  clickable: { type: Boolean, default: false },
  scale: { type: Number, default: 100 }
})

const emit = defineEmits(['select-apartment'])

const safeEntrancesCount = computed(() => Math.max(1, Number(props.entrancesCount) || 1))
const safeFloorsPerEntrance = computed(() => Math.max(1, Number(props.floorsPerEntrance) || 1))
const safeApartmentsPerFloor = computed(() => Math.max(1, Number(props.apartmentsPerFloor) || 1))
const normalizedScale = computed(() => Math.min(125, Math.max(50, Number(props.scale) || 100)) / 100)

const previewStyle = computed(() => {
  const scale = normalizedScale.value
  return {
    '--preview-scale': scale,
    '--preview-gap': `${Math.max(8, Math.round(14 * scale))}px`,
    '--entrance-min': `${Math.max(132, Math.round(220 * scale))}px`,
    '--entrance-padding': `${Math.max(9, Math.round(14 * scale))}px`,
    '--floor-label-width': `${Math.max(38, Math.round(56 * scale))}px`,
    '--tile-min': `${Math.max(30, Math.round(46 * scale))}px`,
    '--tile-height': `${Math.max(34, Math.round(52 * scale))}px`,
    '--tile-gap': `${Math.max(5, Math.round(8 * scale))}px`,
    '--preview-font': `${Math.max(11, Math.round(14 * scale))}px`
  }
})

const fallbackEntrances = computed(() => {
  const list = []
  const firstApartmentNumber = Number(props.firstApartmentNumber) || 1
  const apartmentsInEntrance = safeFloorsPerEntrance.value * safeApartmentsPerFloor.value

  for (let entrance = 1; entrance <= safeEntrancesCount.value; entrance++) {
    const floorsByNumber = []
    const entranceFirstApartment = firstApartmentNumber + ((entrance - 1) * apartmentsInEntrance)

    for (let floor = safeFloorsPerEntrance.value; floor >= 1; floor--) {
      const apartments = []
      const floorFirstApartment = entranceFirstApartment + ((floor - 1) * safeApartmentsPerFloor.value)
      for (let i = 0; i < safeApartmentsPerFloor.value; i++) {
        apartments.push({
          entrance,
          floor,
          apartmentNumber: floorFirstApartment + i,
          unresolvedTicketsCount: 0,
          highestUnresolvedPriority: null
        })
      }
      floorsByNumber.push({ floor, apartments })
    }

    list.push({ entrance, floors: floorsByNumber })
  }

  return list
})

const normalizedEntrances = computed(() => {
  if (props.entrances?.length) {
    return props.entrances
  }
  return fallbackEntrances.value
})
const normalizedFloorCount = computed(() => {
  const counts = normalizedEntrances.value.map((entrance) => entrance.floors?.length || 0)
  return Math.max(...counts, props.entrances?.length ? 0 : safeFloorsPerEntrance.value)
})
const normalizedApartmentsPerFloor = computed(() => {
  const counts = normalizedEntrances.value.flatMap((entrance) => (entrance.floors || []).map((floor) => floor.apartments?.length || 0))
  return Math.max(
    ...counts,
    props.entrances?.length ? 0 : safeApartmentsPerFloor.value
  )
})

const buildApartmentTitle = (apartment) => {
  const count = Number(apartment?.unresolvedTicketsCount || 0)
  if (!count) return `Квартира ${apartment.apartmentNumber}`

  const priority = apartment?.highestUnresolvedPriority
  const priorityText = priority === 'emergency'
    ? 'аварийный'
    : priority === 'high'
      ? 'высокий'
      : priority === 'low'
        ? 'низкий'
        : 'обычный'

  return `Квартира ${apartment.apartmentNumber}: активных заявок ${count}, максимальный приоритет — ${priorityText}`
}

const apartmentClasses = (apartment) => {
  const count = Number(apartment?.unresolvedTicketsCount || 0)
  const accent = priorityAccent(apartment?.highestUnresolvedPriority)
  return {
    clickable: props.clickable,
    'apartment-tile--issues': count > 0,
    [`apartment-tile--${accent}`]: count > 0 && accent
  }
}
</script>

<template>
  <div class="house-preview" :style="previewStyle">
    <div class="house-preview__meta">
      <span>Подъезды: {{ normalizedEntrances.length }}</span>
      <span>Этажи: {{ normalizedFloorCount }}</span>
      <span>Квартир на этаже: {{ normalizedApartmentsPerFloor }}</span>
      <span>Масштаб: {{ Math.round(normalizedScale * 100) }}%</span>
    </div>

    <div class="house-grid" :style="{ gridTemplateColumns: `repeat(${normalizedEntrances.length}, minmax(var(--entrance-min), 1fr))` }">
      <div v-for="entrance in normalizedEntrances" :key="entrance.entrance" class="entrance-card">
        <div class="entrance-card__title">Подъезд {{ entrance.entrance }}</div>

        <div v-for="floor in entrance.floors" :key="`${entrance.entrance}-${floor.floor}`" class="floor-row">
          <div class="floor-row__label">{{ floor.floor }} эт.</div>
          <div class="floor-row__apartments">
            <button
              v-for="apartment in floor.apartments"
              :key="`${entrance.entrance}-${floor.floor}-${apartment.apartmentNumber}`"
              type="button"
              class="apartment-tile"
              :class="apartmentClasses(apartment)"
              :title="buildApartmentTitle(apartment)"
              @click="props.clickable && emit('select-apartment', apartment)"
            >
              <span>{{ apartment.apartmentNumber }}</span>
              <small v-if="apartment.unresolvedTicketsCount" class="apartment-tile__badge">{{ apartment.unresolvedTicketsCount }}</small>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
