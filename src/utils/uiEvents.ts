type ToastListener = (message: string) => void

const toastListeners = new Set<ToastListener>()

export function publishToast(message: string) {
  toastListeners.forEach(listener => listener(message))
}

export function subscribeToast(listener: ToastListener) {
  toastListeners.add(listener)
  return () => {
    toastListeners.delete(listener)
  }
}