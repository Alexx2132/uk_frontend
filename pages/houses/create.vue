<script setup>
definePageMeta({ middleware: 'auth' })

const auth = useAuth()
const api = useApi()
const router = useRouter()
const { showToast } = useToast()

const message = ref('')
const error = ref('')
const canManageHouses = computed(() => auth.hasRole('admin') || (auth.hasRole('dispatcher') && Boolean(auth.user.value?.can_manage_houses)))

const submit = async (form) => {
  if (!canManageHouses.value) {
    error.value = 'У вас нет прав на создание домов'
    return
  }

  message.value = ''
  error.value = ''
  try {
    const entrances = []
    let apartmentCursor = Number(form.firstApartmentNumber) || 1

    for (let entrance = 1; entrance <= Number(form.entrancesCount || 1); entrance++) {
      const baseSpec = {
        number: entrance,
        start_floor: 1,
        floors_count: Number(form.floorsPerEntrance || 1),
        apartments_per_floor: Number(form.apartmentsPerFloor || 1),
        start_number: apartmentCursor
      }
      if (form.structureMode === 'custom') {
        const floors = form.floorLayouts?.[entrance - 1]?.floors || []
        const floorLayout = floors.map((count, index) => ({
          floor_number: index + 1,
          apartments_count: Math.max(0, Number(count) || 0)
        }))
        entrances.push({
          ...baseSpec,
          apartments_per_floor: Math.max(1, Math.max(...floorLayout.map((item) => item.apartments_count), 0)),
          floor_layout: floorLayout
        })
        apartmentCursor += floorLayout.reduce((sum, item) => sum + item.apartments_count, 0)
      } else {
        entrances.push(baseSpec)
        apartmentCursor += Number(form.floorsPerEntrance || 1) * Number(form.apartmentsPerFloor || 1)
      }
    }

    await api.request('/houses/with-structure', {
      method: 'POST',
      body: {
        city: form.city,
        address: form.address,
        entrances
      }
    })

    showToast('Дом со структурой создан')
    setTimeout(() => router.push('/houses'), 700)
  } catch (e) {
    error.value = e?.data?.detail || e?.message || 'Не удалось создать дом'
  }
}
</script>

<template>
  <AppPage title="Добавить дом" subtitle="Настройте адрес, подъезды и квартирную сетку перед добавлением дома.">
    <div v-if="!canManageHouses" class="panel narrow">
      <div class="alert alert--error">У вас нет полномочий на создание домов.</div>
    </div>

    <template v-else>
      <div v-if="error" class="alert alert--error">{{ error }}</div>
      <HouseCreateForm @submit="submit" />
    </template>
  </AppPage>
</template>
