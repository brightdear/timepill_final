import { updateDoseRecordStatus } from '@backend/doseRecord/repository'
import { toLocalISOString } from '@shared/utils/dateUtils'

export async function completeVerification(doseRecordId: string): Promise<void> {
  const completedAt = toLocalISOString(new Date())
  await updateDoseRecordStatus(doseRecordId, 'completed', completedAt)
}
