export function useApiBase() {
  const config = useRuntimeConfig()
  return import.meta.server && config.apiInternalBase
    ? config.apiInternalBase
    : config.public.apiBase
}
