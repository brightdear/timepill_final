// DB는 실제 이름 유지, 표시 레이어에서만 변환
export function displayMedicationName(
  name: string,
  index: number,
  privateMode: boolean,
  alias?: string | null,
  fallbackPrefix = 'Item',
): string {
  if (!privateMode) return name
  const trimmedAlias = alias?.trim()
  if (trimmedAlias) return trimmedAlias
  return `${fallbackPrefix} ${index + 1}`
}
