<script setup>
const props = defineProps({
  error: { type: Object, default: () => ({}) }
})

const statusCode = computed(() => Number(props.error?.statusCode || 500))
const errorCopy = computed(() => {
  const map = {
    400: {
      title: 'Некорректный запрос',
      description: 'Проверьте введённые данные и попробуйте выполнить действие ещё раз.'
    },
    403: {
      title: 'Доступ запрещён',
      description: 'Для этой страницы или действия недостаточно прав.'
    },
    404: {
      title: 'Страница не найдена',
      description: 'Такого раздела нет или ссылка была изменена.'
    },
    500: {
      title: 'Ошибка сервера',
      description: 'На сервере произошла ошибка. Попробуйте повторить действие немного позже.'
    }
  }
  return map[statusCode.value] || {
    title: 'Что-то пошло не так',
    description: 'Попробуйте вернуться назад или открыть главную страницу.'
  }
})
const title = computed(() => errorCopy.value.title)
const description = computed(() => errorCopy.value.description)

const goBack = () => {
  clearError()
  if (window.history.length > 1) {
    window.history.back()
    return
  }
  navigateTo('/')
}

const goHome = () => clearError({ redirect: '/' })
</script>

<template>
  <main class="error-page">
    <section class="error-card">
      <div class="error-card__code">{{ statusCode }}</div>
      <h1>{{ title }}</h1>
      <p>{{ description }}</p>
      <div class="toolbar error-card__actions">
        <button class="btn btn--primary" type="button" @click="goBack">Назад</button>
        <button class="btn btn--ghost" type="button" @click="goHome">На главную</button>
      </div>
    </section>
  </main>
</template>

<style scoped>
.error-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 32px;
  background:
    radial-gradient(circle at 18% 16%, rgba(32,197,181,0.16), transparent 32%),
    linear-gradient(135deg, #f8fafc, #edf3fb);
}

.error-card {
  width: min(560px, 100%);
  padding: 34px;
  border: 1px solid rgba(214,224,240,0.9);
  border-radius: 30px;
  background: rgba(255,255,255,0.92);
  box-shadow: 0 24px 70px rgba(25,42,70,0.13);
}

.error-card__code {
  display: inline-flex;
  align-items: center;
  min-height: 38px;
  padding: 0 14px;
  border-radius: 999px;
  background: #e7f8f5;
  color: #0b8f83;
  font-weight: 900;
}

.error-card h1 {
  margin: 18px 0 8px;
  color: #16213a;
  font-size: clamp(30px, 6vw, 50px);
  line-height: 1;
  white-space: nowrap;
}

.error-card p {
  margin: 0;
  color: #64748b;
  font-size: 17px;
}

.error-card__actions {
  margin-top: 24px;
}
</style>
