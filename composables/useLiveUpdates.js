const listeners = new Set()
let socket = null
let reconnectTimer = null
let reconnectAttempt = 0
let tokenWatcherStop = null
let heartbeatTimer = null

const notifyListeners = (payload) => {
  for (const listener of listeners) {
    try {
      listener(payload)
    } catch {}
  }
}

const clearReconnect = () => {
  if (!process.client || !reconnectTimer) return
  window.clearTimeout(reconnectTimer)
  reconnectTimer = null
}

const clearHeartbeat = () => {
  if (!process.client || !heartbeatTimer) return
  window.clearInterval(heartbeatTimer)
  heartbeatTimer = null
}

const startHeartbeat = () => {
  if (!process.client || heartbeatTimer || !socket) return
  heartbeatTimer = window.setInterval(() => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    try {
      socket.send('ping')
    } catch {}
  }, 15000)
}

const closeSocket = () => {
  clearHeartbeat()
  if (socket) {
    try { socket.close() } catch {}
    socket = null
  }
}

const scheduleReconnect = (connect) => {
  if (!process.client || reconnectTimer || !listeners.size) return
  const delay = Math.min(15000, 1500 * Math.max(1, reconnectAttempt + 1))
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = null
    connect()
  }, delay)
}

export function useLiveUpdates() {
  const auth = useAuth()
  const config = useRuntimeConfig()

  const buildUrl = () => {
    if (!process.client || !auth.token.value) return ''
    const apiBase = String(config.public.apiBase || '').replace(/\/$/, '')
    if (!apiBase) return ''
    const base = apiBase
      .replace(/^http:\/\//i, 'ws://')
      .replace(/^https:\/\//i, 'wss://')
      .replace(/\/api\/v1$/i, '')
    return `${base}/api/v1/ws/updates`
  }

  const connect = () => {
    if (!process.client || socket || !listeners.size || !auth.token.value) return

    const url = buildUrl()
    if (!url) return

    clearReconnect()
    socket = new WebSocket(url)

    socket.onopen = () => {
      reconnectAttempt = 0
      startHeartbeat()
    }

    socket.onmessage = (event) => {
      try {
        notifyListeners(JSON.parse(event.data))
      } catch {}
    }

    socket.onclose = () => {
      clearHeartbeat()
      socket = null
      reconnectAttempt += 1
      scheduleReconnect(connect)
    }

    socket.onerror = () => {
      clearHeartbeat()
      try { socket?.close() } catch {}
    }
  }

  const subscribe = (handler) => {
    if (typeof handler !== 'function') return () => {}

    listeners.add(handler)
    if (process.client && !tokenWatcherStop) {
      tokenWatcherStop = watch(() => auth.token.value, (token) => {
        if (token) {
          connect()
        } else {
          clearReconnect()
          closeSocket()
        }
      }, { immediate: true })
    }
    connect()

    return () => {
      listeners.delete(handler)
      if (!listeners.size) {
        clearReconnect()
        closeSocket()
        clearHeartbeat()
        if (typeof tokenWatcherStop === 'function') {
          tokenWatcherStop()
          tokenWatcherStop = null
        }
      }
    }
  }

  return { subscribe }
}
