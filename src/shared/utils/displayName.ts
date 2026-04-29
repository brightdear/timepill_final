// DB는 실제 이름 유지, 표시 레이어에서만 변환
export function displayMedicationName(
  name: string,
  index: number,
  privateMode: boolean
): string {
  if (!privateMode) return name
  return `알약${index + 1}`
}
