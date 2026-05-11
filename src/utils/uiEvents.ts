import type { MascotStatusKey } from '@/constants/mascotStatus'

export type ToastPayload = {
  message: string
  caption?: string
  jellyDelta?: number
  mascotKey?: MascotStatusKey
  streakCount?: number
}

export type ToastInput = string | ToastPayload

type ToastListener = (message: ToastPayload) => void

const toastListeners = new Set<ToastListener>()

function parseStringToast(message: string): ToastPayload {
  const jellyMatch = message.match(/(?:🍬\s*)?\+(\d+)\s*(?:젤리|jelly)?/i)
  const jellyDelta = jellyMatch ? Number(jellyMatch[1]) : undefined

  if (!jellyMatch) {
    return { message: message.trim() }
  }

  const cleaned = message
    .replace(jellyMatch[0], '')
    .replace(/\s*[·•]\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim()

  return {
    message: cleaned || 'Jelly earned',
    jellyDelta,
  }
}

export function normalizeToastPayload(input: ToastInput): ToastPayload {
  if (typeof input === 'string') return parseStringToast(input)

  const parsed = parseStringToast(input.message)
  return {
    ...parsed,
    ...input,
    jellyDelta: input.jellyDelta ?? parsed.jellyDelta,
    message: input.message ? parseStringToast(input.message).message : parsed.message,
  }
}

export function publishToast(message: ToastInput) {
  const payload = normalizeToastPayload(message)
  toastListeners.forEach(listener => listener(payload))
}

export function subscribeToast(listener: ToastListener) {
  toastListeners.add(listener)
  return () => {
    toastListeners.delete(listener)
  }
}