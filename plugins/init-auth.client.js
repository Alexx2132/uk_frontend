export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('app:mounted', async () => {
    const auth = useAuth()
    await auth.restore()
  })
})
