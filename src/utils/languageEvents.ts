import type { Lang } from '@/constants/translations'

const listeners = new Set<(lang: Lang) => void>()

export function publishLanguageChange(lang: Lang) {
  listeners.forEach(listener => listener(lang))
}

export function subscribeLanguageChange(listener: (lang: Lang) => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}