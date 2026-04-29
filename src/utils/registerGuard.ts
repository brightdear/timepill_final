// Module-level dirty flag so (tabs)/_layout.tsx can intercept tab presses
let dirty = false

export function setRegisterDirty(v: boolean) { dirty = v }
export function isRegisterDirty() { return dirty }
