import { updateDoseRecordStatus } from '@backend/doseRecord/repository'
import { getDateStreak } from '@backend/streak/repository'
import { awardJelly } from '@backend/daycare/repository'
import { toLocalISOString } from '@shared/utils/dateUtils'
import { JELLY_PER_DOSE, JELLY_PER_MILESTONE, JELLY_MILESTONE_INTERVAL } from '@shared/constants/daycareConfig'

export async function completeVerification(doseRecordId: string): Promise<void> {
  const completedAt = toLocalISOString(new Date())
  await updateDoseRecordStatus(doseRecordId, 'completed', completedAt)
  await awardJelly(JELLY_PER_DOSE)
  const streak = await getDateStreak()
  if (streak.current > 0 && streak.current % JELLY_MILESTONE_INTERVAL === 0) {
    await awardJelly(JELLY_PER_MILESTONE)
  }
}
