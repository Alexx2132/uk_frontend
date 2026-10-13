<script setup>
definePageMeta({ middleware: 'auth' })

const route = useRoute()
const api = useApi()

const categories = ref([])

const ticketId = computed(() => {
  const value = Number(route.params.id)
  return Number.isInteger(value) && value > 0 ? value : null
})

const categoryMap = computed(() => {
  return categories.value.reduce((acc, item) => {
    acc[item.id] = item.name
    return acc
  }, {})
})

const closeDetails = async () => {
  await navigateTo('/tickets')
}

const loadCategories = async () => {
  try {
    categories.value = await api.request('/categories/', { query: { category_type: 'problem' } })
  } catch {
    categories.value = []
  }
}

onMounted(loadCategories)
</script>

<template>
  <div>
    <TicketDetailsModal
      :open="Boolean(ticketId)"
      :ticket-id="ticketId"
      :category-map="categoryMap"
      @close="closeDetails"
      @updated="loadCategories"
    />
  </div>
</template>
