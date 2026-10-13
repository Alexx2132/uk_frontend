<script setup>
definePageMeta({ middleware: 'auth' })

import { formatDate } from '~/utils/format'

const api = useApi()

const loading = ref(true)
const error = ref('')
const reviews = ref([])

const fetchReviews = async () => {
  loading.value = true
  error.value = ''
  try {
    const data = await api.request('/executors/me/reviews')
    reviews.value = Array.isArray(data) ? data : []
  } catch (e) {
    error.value = e?.data?.detail || e?.message || 'Не удалось загрузить отзывы'
  } finally {
    loading.value = false
  }
}

onMounted(fetchReviews)
</script>

<template>
  <AppPage
    title="Отзывы на мои работы"
    subtitle="Здесь собраны отзывы жителей по заявкам, которые были закрыты после принятия работы."
  >
    <div v-if="error" class="alert alert--error">{{ error }}</div>
    <div class="panel">
      <div class="toolbar">
        <button class="btn btn--ghost" type="button" @click="fetchReviews">Обновить</button>
      </div>
    </div>

    <div class="panel">
      <div v-if="loading">Загрузка...</div>
      <div v-else-if="!reviews.length" class="empty-box">Отзывов пока нет.</div>
      <div v-else class="stack">
        <div v-for="review in reviews" :key="`${review.ticket_id}-${review.executor_id}-${review.id || 'legacy'}`" class="remark-card">
          <div class="remark-card__head">
            <div>
              <strong>Заявка #{{ review.ticket_id }} · {{ review.ticket_title || 'Без названия' }}</strong>
              <div class="muted">Отзыв жителя</div>
            </div>
            <span class="pill">{{ formatDate(review.created_at) }}</span>
          </div>
          <div>{{ review.review_text || 'Работа принята. Претензий нет.' }}</div>
          <span v-if="review.rating" class="executor-rating-pill">Оценка: {{ review.rating }} / 5</span>
        </div>
      </div>
    </div>
  </AppPage>
</template>
