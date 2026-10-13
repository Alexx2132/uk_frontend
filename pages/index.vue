<script setup>
const auth = useAuth()
const config = useRuntimeConfig()
const { settings, loadSettings } = useAppSettings()
if (process.client && auth.isLoggedIn.value) await navigateTo('/dashboard')

const staticBase = computed(() => String(config.public.apiBase || '').replace(/\/api\/v1\/?$/, ''))
const loginBackgroundUrl = computed(() => {
  const value = settings.value.login_background_image
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value
  return `${staticBase.value}${value}`
})
const loginPageStyle = computed(() => loginBackgroundUrl.value
  ? { '--login-bg-image': `url("${loginBackgroundUrl.value}")` }
  : {}
)

onMounted(() => {
  loadSettings()
})
</script>

<template>
  <div class="login-page" :class="{ 'login-page--custom-bg': loginBackgroundUrl }" :style="loginPageStyle">
    <LoginCard />
  </div>
</template>
