type Listener = (slotId: string) => void

let _listeners: Listener[] = []
let _active = false

export const forceAlarmBus = {
  emit(slotId: string) {
    _listeners.forEach(fn => fn(slotId))
  },
  subscribe(fn: Listener): () => void {
    _listeners.push(fn)
    return () => {
      _listeners = _listeners.filter(l => l !== fn)
    }
  },
  setActive(v: boolean) {
    _active = v
  },
  isActive(): boolean {
    return _active
  },
}
