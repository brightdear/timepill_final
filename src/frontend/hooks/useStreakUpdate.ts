import { updateDoseRecordStatus } from '@backend/doseRecord/repository'
import { incrementStreak } from '@backend/streak/repository'
import { toLocalISOString } from '@shared/utils/dateUtils'

export async function completeVerification(
  doseRecordId: string,
  timeSlotId: string,
): Promise<{ freezeAcquired: boolean; currentStreak: number }> {
  const completedAt = toLocalISOString(new Date())
  await updateDoseRecordStatus(doseRecordId, 'completed', completedAt)
  return incrementStreak(timeSlotId)
}
