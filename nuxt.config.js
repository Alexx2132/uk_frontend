export default defineNuxtConfig({
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      title: 'UK WEB',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'theme-color', content: '#3b82f6' }
      ]
    }
  },
  runtimeConfig: {
    apiInternalBase: '',
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || 'http://127.0.0.1:8000/api/v1',
      appName: process.env.NUXT_PUBLIC_APP_NAME || 'UK WEB'
    }
  },
  compatibilityDate: '2025-12-01'
})
