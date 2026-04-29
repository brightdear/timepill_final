import { updateDoseRecordStatus } from '@/domain/doseRecord/repository'
import { incrementStreak } from '@/domain/streak/repository'
import { toLocalISOString } from '@/utils/dateUtils'

export async function completeVerification(
  doseRecordId: string,
  timeSlotId: string,
): Promise<{ freezeAcquired: boolean; currentStreak: number }> {
  const completedAt = toLocalISOString(new Date())
  await updateDoseRecordStatus(doseRecordId, 'completed', completedAt)
  return incrementStreak(timeSlotId)
}
