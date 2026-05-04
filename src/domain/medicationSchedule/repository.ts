import { and, asc, eq } from 'drizzle-orm'
import { randomUUID } from 'expo-crypto'
import { db } from '@/db/client'
import { doseRecords, medications, timeSlots } from '@/db/schema'
import { scheduleAlarmsForAllSlots } from '@/domain/alarm/alarmScheduler'
import { insertDoseRecord } from '@/domain/doseRecord/repository'
import { insertMedication, updateMedication } from '@/domain/medication/repository'
import { deleteTimeslot, getTimeslotById, insertTimeslot, toggleReminderTimeEnabled as toggleTimeslotEnabled, updateTimeslot } from '@/domain/timeslot/repository'
import { upsertStreak } from '@/domain/streak/repository'
import type { CycleConfig, LockScreenVisibility, ReminderIntensity, ReminderPrivacyLevel, WidgetVisibility } from '@/db/schema'
import { isTodayDue } from '@/utils/cycleUtils'
import { getLocalDateKey, toLocalISOString } from '@/utils/dateUtils'

export type ReminderTimeInput = {
  id?: string
  hour: number
  minute: number
  isEnabled: boolean
  orderIndex?: number
}

export type MedicationWithTimesInput = {
  aliasName: string
  actualName?: string | null
  totalQuantity?: number | null
  remainingQuantity?: number | null
  dosePerIntake: number
  color?: string
  cycleConfig: CycleConfig
  privacyLevel: ReminderPrivacyLevel
  notificationTitle: string | null
  notificationBody: string | null
  reminderIntensity: Exclude<ReminderIntensity, 'custom'>
  widgetVisibility: WidgetVisibility
  lockScreenVisibility: LockScreenVisibility
  badgeEnabled: boolean
  isActive: boolean
  times: ReminderTimeInput[]
}

export type MedicationGroupReminder = typeof timeSlots.$inferSelect & {
  doseRecord: typeof doseRecords.$inferSelect | null
}

export type MedicationGroup = {
  medication: typeof medications.$inferSelect
  reminders: MedicationGroupReminder[]
  completedCount: number
  pendingCount: number
  totalCount: number
}

function normalizeTimes(times: ReminderTimeInput[]) {
  return [...times]
    .sort((left, right) => (left.hour * 60 + left.minute) - (right.hour * 60 + right.minute))
    .map((time, index) => ({ ...time, orderIndex: index }))
}

function buildReminderPayload(input: MedicationWithTimesInput, time: ReminderTimeInput) {
  const enabled = time.isEnabled ? 1 : 0
  return {
    displayAlias: input.aliasName.trim(),
    hour: time.hour,
    minute: time.minute,
    isEnabled: enabled,
    orderIndex: time.orderIndex ?? 0,
    doseCountPerIntake: input.dosePerIntake,
    cycleConfig: JSON.stringify(input.cycleConfig),
    cycleStartDate: null,
    verificationWindowMin: 60,
    alarmEnabled: enabled,
    privacyLevel: input.privacyLevel,
    notificationTitle: input.notificationTitle,
    notificationBody: input.notificationBody,
    preReminderEnabled: input.reminderIntensity === 'light' ? 0 : 1,
    preReminderMinutes: 15,
    preReminderBody: '곧 체크할 시간이야',
    overdueReminderBody: '오늘 확인이 지연되고 있어요',
    reminderIntensity: input.reminderIntensity,
    repeatRemindersEnabled: 1,
    repeatSchedule: null,
    maxRepeatDurationMinutes: 180,
    snoozeMinutes: 10,
    forceAlarm: 0,
    popupEnabled: 1,
    snoozeCount: 0,
    snoozeIntervalMin: 10,
    alarmSound: 'default',
    vibrationEnabled: 1,
    widgetVisibility: input.widgetVisibility,
    lockScreenVisibility: input.lockScreenVisibility,
    badgeEnabled: input.badgeEnabled ? 1 : 0,
    isActive: input.isActive ? 1 : 0,
  } as const
}

async function ensureTodayRecordForReminder(args: {
  medicationId: string
  medicationLabel: string
  reminder: typeof timeSlots.$inferSelect
}) {
  const { medicationId, medicationLabel, reminder } = args
  if (!isTodayDue(reminder)) return

  const todayKey = getLocalDateKey()
  const existing = await db.select().from(doseRecords)
    .where(and(eq(doseRecords.timeSlotId, reminder.id), eq(doseRecords.dayKey, todayKey)))
    .get()
  if (existing) return

  const now = new Date()
  const scheduledTime = toLocalISOString(new Date(now.getFullYear(), now.getMonth(), now.getDate(), reminder.hour, reminder.minute))
  await insertDoseRecord({
    medicationId,
    medicationName: medicationLabel,
    timeSlotId: reminder.id,
    reminderTimeId: reminder.id,
    dayKey: todayKey,
    scheduledTime,
    targetDoseCount: reminder.doseCountPerIntake,
  })
}

export async function createMedicationWithTimes(input: MedicationWithTimesInput) {
  const normalizedTimes = normalizeTimes(input.times)
  if (normalizedTimes.length === 0) throw new Error('시간을 하나 이상 추가해 주세요')

  const aliasName = input.aliasName.trim()
  const actualName = input.actualName?.trim() || null
  const medicationId = await insertMedication({
    name: actualName ?? aliasName,
    aliasName,
    actualName,
    totalQuantity: input.totalQuantity ?? null,
    currentQuantity: input.remainingQuantity ?? input.totalQuantity ?? null,
    remainingQuantity: input.remainingQuantity ?? input.totalQuantity ?? null,
    dosePerIntake: input.dosePerIntake,
  })

  for (const time of normalizedTimes) {
    const reminderId = await insertTimeslot({
      medicationId,
      ...buildReminderPayload(input, time),
      skipUntil: null,
      notificationIds: null,
      forceNotificationIds: null,
    })
    await upsertStreak(reminderId, {})
    const reminder = await getTimeslotById(reminderId)
    if (reminder) {
      await ensureTodayRecordForReminder({ medicationId, medicationLabel: aliasName, reminder })
    }
  }

  await scheduleAlarmsForAllSlots()
  return medicationId
}

export async function updateMedicationWithTimes(medicationId: string, input: MedicationWithTimesInput) {
  const normalizedTimes = normalizeTimes(input.times)
  if (normalizedTimes.length === 0) throw new Error('시간을 하나 이상 추가해 주세요')

  const aliasName = input.aliasName.trim()
  const actualName = input.actualName?.trim() || null
  await updateMedication(medicationId, {
    name: actualName ?? aliasName,
    aliasName,
    actualName,
    totalQuantity: input.totalQuantity ?? null,
    currentQuantity: input.remainingQuantity ?? null,
    remainingQuantity: input.remainingQuantity ?? null,
    dosePerIntake: input.dosePerIntake,
    isActive: input.isActive ? 1 : 0,
    isArchived: input.isActive ? 0 : 1,
  })

  const existing = await db.select().from(timeSlots).where(eq(timeSlots.medicationId, medicationId))
  const keepIds = new Set(normalizedTimes.map(time => time.id).filter((id): id is string => Boolean(id)))

  for (const oldTime of existing) {
    if (!keepIds.has(oldTime.id)) {
      await deleteTimeslot(oldTime.id)
    }
  }

  for (const time of normalizedTimes) {
    if (time.id) {
      await updateTimeslot(time.id, buildReminderPayload(input, time))
      const reminder = await getTimeslotById(time.id)
      if (reminder) {
        await ensureTodayRecordForReminder({ medicationId, medicationLabel: aliasName, reminder })
      }
    } else {
      const reminderId = await insertTimeslot({
        medicationId,
        ...buildReminderPayload(input, time),
        skipUntil: null,
        notificationIds: null,
        forceNotificationIds: null,
      })
      await upsertStreak(reminderId, {})
      const reminder = await getTimeslotById(reminderId)
      if (reminder) {
        await ensureTodayRecordForReminder({ medicationId, medicationLabel: aliasName, reminder })
      }
    }
  }

  await scheduleAlarmsForAllSlots()
}

export async function addReminderTime(medicationId: string, time: ReminderTimeInput, template?: Partial<MedicationWithTimesInput>) {
  const medication = await db.select().from(medications).where(eq(medications.id, medicationId)).get()
  if (!medication) throw new Error('항목을 찾을 수 없습니다')

  const fallback: MedicationWithTimesInput = {
    aliasName: medication.aliasName || medication.name,
    actualName: medication.actualName,
    totalQuantity: medication.totalQuantity,
    remainingQuantity: medication.remainingQuantity ?? medication.currentQuantity,
    dosePerIntake: medication.dosePerIntake ?? 1,
    cycleConfig: { type: 'daily' },
    privacyLevel: 'hideMedicationName',
    notificationTitle: null,
    notificationBody: null,
    reminderIntensity: 'standard',
    widgetVisibility: 'aliasOnly',
    lockScreenVisibility: 'neutral',
    badgeEnabled: true,
    isActive: medication.isActive === 1,
    times: [time],
    ...template,
  }

  const id = await insertTimeslot({
    medicationId,
    ...buildReminderPayload(fallback, time),
    skipUntil: null,
    notificationIds: null,
    forceNotificationIds: null,
  })
  await upsertStreak(id, {})
  await scheduleAlarmsForAllSlots()
  return id
}

export async function updateReminderTime(id: string, patch: Partial<ReminderTimeInput>) {
  await updateTimeslot(id, {
    ...(patch.hour == null ? {} : { hour: patch.hour }),
    ...(patch.minute == null ? {} : { minute: patch.minute }),
    ...(patch.orderIndex == null ? {} : { orderIndex: patch.orderIndex }),
    ...(patch.isEnabled == null ? {} : { isEnabled: patch.isEnabled ? 1 : 0, alarmEnabled: patch.isEnabled ? 1 : 0 }),
  })
  await scheduleAlarmsForAllSlots()
}

export async function deleteReminderTime(id: string) {
  await deleteTimeslot(id)
  await scheduleAlarmsForAllSlots()
}

export async function toggleReminderTimeEnabled(id: string, enabled: boolean) {
  await toggleTimeslotEnabled(id, enabled)
  await scheduleAlarmsForAllSlots()
}

export async function getMedicationWithTimes(medicationId: string) {
  const medication = await db.select().from(medications).where(eq(medications.id, medicationId)).get()
  if (!medication) return null
  const reminders = await db.select().from(timeSlots)
    .where(eq(timeSlots.medicationId, medicationId))
    .orderBy(asc(timeSlots.orderIndex), asc(timeSlots.hour), asc(timeSlots.minute))
  return { medication, reminders }
}

export async function getMedicationWithTimesByReminder(reminderTimeId: string) {
  const reminder = await getTimeslotById(reminderTimeId)
  if (!reminder) return null
  return getMedicationWithTimes(reminder.medicationId)
}

export async function getTodayMedicationGroups(): Promise<MedicationGroup[]> {
  const todayKey = getLocalDateKey()
  const [allMedications, allReminders, todayRecords] = await Promise.all([
    db.select().from(medications),
    db.select().from(timeSlots),
    db.select().from(doseRecords).where(eq(doseRecords.dayKey, todayKey)),
  ])

  const recordMap = new Map(todayRecords.map(record => [record.reminderTimeId ?? record.timeSlotId ?? '', record]))
  const medicationMap = new Map(allMedications.map(medication => [medication.id, medication]))
  const grouped = new Map<string, MedicationGroupReminder[]>()

  for (const reminder of allReminders) {
    const medication = medicationMap.get(reminder.medicationId)
    if (!medication || medication.isArchived === 1) continue
    if (!isTodayDue(reminder)) continue
    const rows = grouped.get(reminder.medicationId) ?? []
    rows.push({ ...reminder, doseRecord: recordMap.get(reminder.id) ?? null })
    grouped.set(reminder.medicationId, rows)
  }

  return [...grouped.entries()].map(([medicationId, reminders]) => {
    const medication = medicationMap.get(medicationId)!
    const sortedReminders = reminders.sort((left, right) => {
      const byOrder = left.orderIndex - right.orderIndex
      if (byOrder !== 0) return byOrder
      return (left.hour * 60 + left.minute) - (right.hour * 60 + right.minute)
    })
    const completedCount = sortedReminders.filter(row => row.doseRecord?.status === 'completed' || row.doseRecord?.status === 'frozen').length
    const pendingCount = sortedReminders.filter(row => !row.doseRecord || row.doseRecord.status === 'pending').length
    return {
      medication,
      reminders: sortedReminders,
      completedCount,
      pendingCount,
      totalCount: sortedReminders.length,
    }
  })
}

export function createLocalReminderId() {
  return randomUUID()
}
