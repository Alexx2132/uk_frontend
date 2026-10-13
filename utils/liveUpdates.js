export function createLiveUpdatesUrl(apiBase, origin) {
  if (!apiBase) return ''
  try {
    const url = new URL(apiBase, origin)
    if (!['http:', 'https:'].includes(url.protocol)) return ''
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/ws/updates`
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return ''
  }
}
