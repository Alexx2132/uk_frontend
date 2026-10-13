export function useStorage() {
  const cookieOptions = {
    path: '/',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30
  }

  const cookieRefs = new Map()

  const getCookieRef = (key) => {
    if (!cookieRefs.has(key)) {
      cookieRefs.set(key, useCookie(key, cookieOptions))
    }
    return cookieRefs.get(key)
  }

  const safeGet = (key, fallback = null) => {
    const cookie = getCookieRef(key)
    if (cookie.value !== null && cookie.value !== undefined && cookie.value !== '') {
      return cookie.value
    }
    if (process.server) return fallback
    const nuxtApp = useNuxtApp()
    if (nuxtApp?.isHydrating) return fallback

    try {
      const legacyValue = localStorage.getItem(key)
      if (legacyValue !== null && legacyValue !== undefined && legacyValue !== '') {
        cookie.value = legacyValue
        localStorage.removeItem(key)
        return legacyValue
      }
      return fallback
    } catch {
      return fallback
    }
  }

  const safeSet = (key, value) => {
    const cookie = getCookieRef(key)
    cookie.value = value
    if (process.client) {
      try { localStorage.removeItem(key) } catch {}
    }
  }

  const safeRemove = (key) => {
    const cookie = getCookieRef(key)
    cookie.value = null
    if (process.client) {
      try { localStorage.removeItem(key) } catch {}
    }
  }

  return { safeGet, safeSet, safeRemove }
}
