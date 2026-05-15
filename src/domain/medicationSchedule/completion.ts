import type { VerificationType } from '@/db/schema'
import { db } from '@/db/client'
import { doseRecords } from '@/db/schema'
import {
  getDoseRecordById,
  insertDoseRecord,
  updateDoseRecordStatus,
} from '@/domain/doseRecord/repository'
import { clearSnoozeReminder, maybeScheduleCompletionNotification, resyncAlarmState } from '@/domain/alarm/alarmScheduler'
import { consumeMedicationInventory, getMedicationById } from '@/domain/medication/repository'
import {
  awardCheckCompletionReward,
  awardDailyCompletionBonus,
  awardOnTimeBonus,
  awardStreakBonusIfEligible,
  syncStreakState,
  type CompletionSource,
} from '@/domain/reward/repository'
import { incrementStreak } from '@/domain/streak/repository'
import { getTimeslotById } from '@/domain/timeslot/repository'
import { resolveMascotStatus } from '@/constants/mascotStatus'
import { getLocalDateKey, toLocalISOString } from '@/utils/dateUtils'
import { publishToast } from '@/utils/uiEvents'
import { and, eq } from 'drizzle-orm'

export type MedicationCompletionMethod = 'manual' | 'scan'

export type CompleteMedicationScheduleInput = {
  medicationId: string
  scheduleId: string
  scheduledDate?: string
  scheduledTime?: string
  method: MedicationCompletionMethod
  completedAt?: string
}

export type CompleteMedicationScheduleResult = {
  success: boolean
  alreadyCompleted: boolean
  doseRecordId: string | null
  freezeAcquired: boolean
  currentStreak: number
  jellyAwarded: number
  error?: string
}

function emptyFailure(error: string): CompleteMedicationScheduleResult {
  return {
    success: false,
    alreadyCompleted: false,
    doseRecordId: null,
    freezeAcquired: false,
    currentStreak: 0,
    jellyAwarded: 0,
    error,
  }
}

function isCompletedStatus(status: string) {
  return status === 'completed' || status === 'frozen'
}

function resolveDayKey(input: CompleteMedicationScheduleInput) {
  if (input.scheduledDate) return input.scheduledDate.slice(0, 10)
  if (input.scheduledTime?.includes('T')) return input.scheduledTime.slice(0, 10)
  return getLocalDateKey()
}

function resolveScheduledTime(dayKey: string, scheduledTime: string | undefined, hour: number, minute: number) {
  if (scheduledTime?.includes('T')) return scheduledTime

  if (scheduledTime && /^\d{1,2}:\d{2}/.test(scheduledTime)) {
    const [scheduledHour, scheduledMinute] = scheduledTime.split(':').map(Number)
    const date = new Date(`${dayKey}T12:00:00`)
    return toLocalISOString(new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      Number.isFinite(scheduledHour) ? scheduledHour : hour,
      Number.isFinite(scheduledMinute) ? scheduledMinute : minute,
    ))
  }

  const date = new Date(`${dayKey}T12:00:00`)
  return toLocalISOString(new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute))
}

async function getDoseRecordByScheduleDate(scheduleId: string, dayKey: string) {
  return db.select().from(doseRecords)
    .where(and(eq(doseRecords.timeSlotId, scheduleId), eq(doseRecords.dayKey, dayKey)))
    .get()
}

async function ensureDoseRecordForSchedule(input: CompleteMedicationScheduleInput) {
  const dayKey = resolveDayKey(input)
  const slot = await getTimeslotById(input.scheduleId)
  if (!slot) return { error: '일정 정보를 찾을 수 없습니다' }

  if (slot.medicationId !== input.medicationId) {
    return { error: '일정과 약 정보가 일치하지 않습니다' }
  }

  const medication = await getMedicationById(input.medicationId)
  if (!medication) return { error: '약 정보를 찾을 수 없습니다' }

  const existing = await getDoseRecordByScheduleDate(input.scheduleId, dayKey)
  if (existing) {
    return { doseRecord: existing, slot, medication }
  }

  const scheduledTime = resolveScheduledTime(dayKey, input.scheduledTime, slot.hour, slot.minute)
  await insertDoseRecord({
    medicationId: medication.id,
    medicationName: medication.aliasName || medication.name,
    timeSlotId: slot.id,
    reminderTimeId: slot.id,
    dayKey,
    scheduledTime,
    targetDoseCount: slot.doseCountPerIntake,
  })

  const doseRecord = await getDoseRecordByScheduleDate(input.scheduleId, dayKey)
  if (!doseRecord) return { error: '복약 기록을 생성하지 못했습니다' }

  return { doseRecord, slot, medication }
}

export async function completeMedicationSchedule(
  input: CompleteMedicationScheduleInput,
  verificationTypeOverride?: Exclude<VerificationType, 'none'>,
): Promise<CompleteMedicationScheduleResult> {
  if (input.method !== 'manual' && input.method !== 'scan') {
    return emptyFailure('완료 방식이 올바르지 않습니다')
  }

  const context = await ensureDoseRecordForSchedule(input)
  if ('error' in context) return emptyFailure(context.error ?? '복약 완료 처리에 실패했습니다')

  const { doseRecord, slot } = context
  if (isCompletedStatus(doseRecord.status)) {
    const summary = await syncStreakState()
    return {
      success: true,
      alreadyCompleted: true,
      doseRecordId: doseRecord.id,
      freezeAcquired: false,
      currentStreak: summary?.currentStreak ?? 0,
      jellyAwarded: 0,
    }
  }
  if (doseRecord.status !== 'pending') {
    return emptyFailure('완료할 수 없는 복약 기록입니다')
  }

  const completedAt = input.completedAt ?? toLocalISOString(new Date())
  const verificationType = verificationTypeOverride ?? input.method

  await updateDoseRecordStatus(doseRecord.id, 'completed', completedAt, null, verificationType)
  await consumeMedicationInventory(slot.medicationId, doseRecord.targetDoseCount ?? slot.doseCountPerIntake)
  await clearSnoozeReminder(slot.id)

  const streak = await incrementStreak(slot.id)
  const summary = await syncStreakState()
  const checkReward = await awardCheckCompletionReward(doseRecord.id, input.method as CompletionSource)
  const onTimeBonus = await awardOnTimeBonus(doseRecord.id, doseRecord.scheduledTime, completedAt, slot.verificationWindowMin ?? 60)
  const streakBonus = await awardStreakBonusIfEligible(summary?.currentStreak ?? streak.currentStreak)
  const dailyBonus = await awardDailyCompletionBonus(doseRecord.dayKey)

  await resyncAlarmState()
  await maybeScheduleCompletionNotification(slot.id)

  const jellyAwarded = [checkReward, onTimeBonus, streakBonus, dailyBonus]
    .reduce((sum, reward) => sum + (reward.awarded ? reward.transaction?.amount ?? 0 : 0), 0)

  const currentStreak = summary?.currentStreak ?? streak.currentStreak
  const toastParts = ['체크 완료']
  if ('specialTicketGranted' in streakBonus && streakBonus.specialTicketGranted) {
    toastParts.push('스페셜 티켓 1')
  }
  if (streak.freezeAcquired) {
    toastParts.push('프리즈 1')
  }

  const mascotKey = resolveMascotStatus({
    currentStreak,
    surprise: jellyAwarded > 0 || currentStreak === 1,
  })

  publishToast({
    message: 'streak',
    caption: toastParts.join(' · '),
    jellyDelta: jellyAwarded > 0 ? jellyAwarded : undefined,
    mascotKey,
    streakCount: currentStreak,
  })

  return {
    success: true,
    alreadyCompleted: false,
    doseRecordId: doseRecord.id,
    freezeAcquired: streak.freezeAcquired,
    currentStreak,
    jellyAwarded,
  }
}

export async function completeVerification(
  doseRecordId: string,
  timeSlotId: string,
  source: CompletionSource = 'manual',
  verificationTypeOverride?: Exclude<VerificationType, 'none'>,
) {
  const doseRecord = await getDoseRecordById(doseRecordId)
  if (!doseRecord?.medicationId) {
    return { freezeAcquired: false, currentStreak: 0 }
  }

  const result = await completeMedicationSchedule({
    medicationId: doseRecord.medicationId,
    scheduleId: timeSlotId,
    scheduledDate: doseRecord.dayKey,
    scheduledTime: doseRecord.scheduledTime,
    method: source,
  }, verificationTypeOverride)

  return {
    freezeAcquired: result.freezeAcquired,
    currentStreak: result.currentStreak,
  }
}
