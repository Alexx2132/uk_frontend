export function useToast() {
  const toasts = useState('uk_toasts', () => [])

  const removeToast = (id) => {
    toasts.value = toasts.value.filter((item) => item.id !== id)
  }

  const showToast = (message, options = {}) => {
    const text = String(message || '').trim()
    if (!text) return null

    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const persistent = Boolean(options.persistent)
    const duration = persistent ? 0 : Math.max(1500, Number(options.duration) || 10000)

    toasts.value = [
      ...toasts.value,
      {
        id,
        message: text,
        type: options.type || 'success',
        duration,
        persistent,
        actionTo: options.actionTo || '',
        actionLabel: options.actionLabel || ''
      }
    ]

    if (process.client && !persistent) {
      window.setTimeout(() => removeToast(id), duration)
    }

    return id
  }

  return { toasts, showToast, removeToast }
}
