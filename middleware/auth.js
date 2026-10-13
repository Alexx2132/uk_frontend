export default defineNuxtRouteMiddleware((to) => {
  if (to.path === '/') return
  const token = useCookie('uk_token').value
  if (!token) return navigateTo('/')
})
