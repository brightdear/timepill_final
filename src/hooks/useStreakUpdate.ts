import type { VerificationType } from '@/db/schema'
import { getDoseRecordById, updateDoseRecordStatus } from '@/domain/doseRecord/repository'
import { consumeMedicationInventory } from '@/domain/medication/repository'
import {
  awardDailyCompletionBonus,
  awardCheckCompletionReward,
  awardOnTimeBonus,
  awardStreakBonusIfEligible,
  type CompletionSource,
  syncStreakState,
} from '@/domain/reward/repository'
import { awardJelly } from '@/domain/daycare/repository'
import { getTimeslotById } from '@/domain/timeslot/repository'
import { incrementStreak } from '@/domain/streak/repository'
import { toLocalISOString } from '@/utils/dateUtils'
import { publishToast } from '@/utils/uiEvents'
import {
  clearSnoozeReminder,
  maybeScheduleCompletionNotification,
  resyncAlarmState,
} from '@/domain/alarm/alarmScheduler'

export async function completeVerification(
  doseRecordId: string,
  timeSlotId: string,
  source: CompletionSource = 'manual',
  verificationTypeOverride?: Exclude<VerificationType, 'none'>,
): Promise<{ freezeAcquired: boolean; currentStreak: number }> {
  const [doseRecord, slot] = await Promise.all([
    getDoseRecordById(doseRecordId),
    getTimeslotById(timeSlotId),
  ])

  if (!doseRecord || !slot || doseRecord.status !== 'pending') {
    return { freezeAcquired: false, currentStreak: 0 }
  }

  const completedAt = toLocalISOString(new Date())
  await updateDoseRecordStatus(doseRecordId, 'completed', completedAt, null, verificationTypeOverride ?? source)
  await consumeMedicationInventory(slot.medicationId, slot.doseCountPerIntake)
  await clearSnoozeReminder(timeSlotId)
  const streak = await incrementStreak(timeSlotId)
  const summary = await syncStreakState()
  const [checkReward, onTimeBonus] = await Promise.all([
    awardCheckCompletionReward(doseRecordId, source),
    awardOnTimeBonus(doseRecordId, doseRecord.scheduledTime, completedAt, slot.verificationWindowMin ?? 60),
  ])
  const [streakBonus, dailyBonus] = await Promise.all([
    awardStreakBonusIfEligible(summary?.currentStreak ?? streak.currentStreak),
    awardDailyCompletionBonus(doseRecord.dayKey),
  ])
  await resyncAlarmState()
  await maybeScheduleCompletionNotification(timeSlotId)

  const awardedJelly = [checkReward, onTimeBonus, streakBonus, dailyBonus]
    .reduce((sum, reward) => sum + (reward.awarded ? reward.transaction?.amount ?? 0 : 0), 0)

  const toastParts = ['체크 완료']
  if (awardedJelly > 0) {
    await awardJelly(awardedJelly)
    toastParts.push(`+${awardedJelly} 젤리`)
  }
  if ('specialTicketGranted' in streakBonus && streakBonus.specialTicketGranted) {
    toastParts.push('스페셜 티켓 1')
  }
  if (streak.freezeAcquired) {
    toastParts.push('프리즈 1')
  }
  publishToast(toastParts.join(' · '))

  return streak
}
