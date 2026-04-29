import { getStreakByTimeslot } from '@/domain/streak/repository'
import { getSettings } from '@/domain/settings/repository'
import { getMedicationById } from '@/domain/medication/repository'
import { getLocalDateKey } from '@/utils/dateUtils'
import type { doseRecords } from '@/db/schema'

export type FreezeEligibleSlot = {
  slotId: string
  doseRecordId: string
  medName: string
  dayKey: string
}

// useAppInit step 3: streak 리셋 전에 반드시 호출.
// D+2 이상 missed → 팝업 제외. streak > 0 조건 필수 (리셋 후엔 항상 0).
export async function checkFreezeEligibility(
  missedRecords: (typeof doseRecords.$inferSelect)[],
): Promise<FreezeEligibleSlot[]> {
  const s = await getSettings()
  if (s.freezesRemaining <= 0) return []
  if (missedRecords.length === 0) return []

  const today = getLocalDateKey()
  const d = new Date(`${today}T12:00:00`)
  d.setDate(d.getDate() - 1)
  const pad = (n: number) => String(n).padStart(2, '0')
  const yesterday = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

  const eligible: FreezeEligibleSlot[] = []

  for (const record of missedRecords) {
    if (!record.timeSlotId) continue
    // Only yesterday's misses qualify (D+2 or older → skip)
    if (record.dayKey !== yesterday) continue

    const streak = await getStreakByTimeslot(record.timeSlotId)
    if ((streak?.currentStreak ?? 0) <= 0) continue

    const med = await getMedicationById(record.medicationId ?? '')
    eligible.push({
      slotId: record.timeSlotId,
      doseRecordId: record.id,
      medName: med?.name ?? '알 수 없는 약',
      dayKey: record.dayKey,
    })
  }

  return eligible
}
