// Module-level dirty flag so (tabs)/_layout.tsx can intercept tab presses
let dirty = false
let pendingReset = false

export function setRegisterDirty(v: boolean) { dirty = v }
export function isRegisterDirty() { return dirty }

// Called in the guard "나가기" handler so cleanup-triggered blur doesn't wipe the form
export function scheduleRegisterReset() { pendingReset = true }
export function consumeRegisterReset(): boolean {
  const v = pendingReset
  pendingReset = false
  return v
}
