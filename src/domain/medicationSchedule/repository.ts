import { and, asc, eq } from 'drizzle-orm'
import { randomUUID } from 'expo-crypto'
import { db } from '@/db/client'
import { doseRecords, medications, timeSlots } from '@/db/schema'
import { scheduleAlarmsForAllSlots } from '@/domain/alarm/alarmScheduler'
import { insertDoseRecord } from '@/domain/doseRecord/repository'
import { deleteMedication, insertMedication, updateMedication } from '@/domain/medication/repository'
import { deleteTimeslot, getTimeslotById, insertTimeslot, toggleReminderTimeEnabled as toggleTimeslotEnabled, updateTimeslot, type ReminderMode } from '@/domain/timeslot/repository'
import { upsertStreak } from '@/domain/streak/repository'
import type { CycleConfig, LockScreenVisibility, ReminderIntensity, ReminderPrivacyLevel, WidgetDisplayMode } from '@/db/schema'
import { isTodayDue } from '@/utils/cycleUtils'
import { getLocalDateKey, toLocalISOString } from '@/utils/dateUtils'

export type ReminderTimeInput = {
  id?: string
  hour: number
  minute: number
  isEnabled: boolean
  reminderMode?: ReminderMode
  orderIndex?: number
}

export type MedicationWithTimesInput = {
  aliasName: string
  actualName?: string | null
  quantityTrackingEnabled: boolean
  remainingQuantity?: number | null
  dosePerIntake: number
  color?: string
  cycleConfig: CycleConfig
  privacyLevel: ReminderPrivacyLevel
  notificationTitle: string | null
  notificationBody: string | null
  reminderIntensity: ReminderIntensity
  widgetDisplayMode: WidgetDisplayMode
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

function reminderModeOf(reminder: MedicationGroupReminder | typeof timeSlots.$inferSelect) {
  return reminder.reminderMode === 'off' || reminder.reminderMode === 'scan' || reminder.reminderMode === 'notify'
    ? reminder.reminderMode
    : reminder.isEnabled === 0
      ? 'off'
      : 'notify'
}

function reminderSortRank(reminder: MedicationGroupReminder) {
  const status = reminder.doseRecord?.status
  const reminderMode = reminderModeOf(reminder)

  if (status === 'completed' || status === 'frozen') return 5
  if (reminderMode === 'off') return 4
  if (status === 'missed') return 0

  if (!reminder.doseRecord || status === 'pending') {
    const scheduled = reminder.doseRecord ? new Date(reminder.doseRecord.scheduledTime).getTime() : null
    const halfWindow = (reminder.verificationWindowMin / 2) * 60 * 1000
    if (scheduled != null && Date.now() > scheduled + halfWindow) return 0
    if (scheduled != null && Date.now() >= scheduled - halfWindow) return 1
    return 2
  }

  return 3
}

function normalizeTimes(times: ReminderTimeInput[]) {
  const sorted = [...times]
    .sort((left, right) => (left.hour * 60 + left.minute) - (right.hour * 60 + right.minute))

  const seen = new Set<string>()
  for (const time of sorted) {
    const key = `${time.hour}:${time.minute}`
    if (seen.has(key)) {
      throw new Error('이미 추가된 시간이에요')
    }
    seen.add(key)
  }

  return sorted.map((time, index) => ({ ...time, orderIndex: index }))
}

function buildReminderPayload(input: MedicationWithTimesInput, time: ReminderTimeInput) {
  const reminderMode = time.reminderMode ?? (time.isEnabled ? 'notify' : 'off')
  const enabled = reminderMode === 'off' ? 0 : 1
  return {
    displayAlias: input.aliasName.trim(),
    hour: time.hour,
    minute: time.minute,
    isEnabled: enabled,
    reminderMode,
    orderIndex: time.orderIndex ?? 0,
    doseCountPerIntake: input.dosePerIntake,
    cycleConfig: JSON.stringify(input.cycleConfig),
    cycleStartDate: null,
    verificationWindowMin: 60,
    alarmEnabled: enabled,
    privacyLevel: input.privacyLevel,
    notificationTitle: input.notificationTitle,
    notificationBody: input.notificationBody,
    preReminderEnabled: 0,
    preReminderMinutes: 0,
    preReminderBody: '곧 체크할 시간이야',
    overdueReminderBody: '오늘 확인이 지연되고 있어요',
    reminderIntensity: input.reminderIntensity,
    repeatRemindersEnabled: 1,
    repeatSchedule: null,
    maxRepeatDurationMinutes: input.reminderIntensity === 'strong' ? 60 : input.reminderIntensity === 'normal' ? 30 : 0,
    snoozeMinutes: 10,
    forceAlarm: 0,
    popupEnabled: 1,
    snoozeCount: 0,
    snoozeIntervalMin: 10,
    alarmSound: 'default',
    vibrationEnabled: 1,
    widgetVisibility: input.widgetDisplayMode,
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
    totalQuantity: 0,
    currentQuantity: input.quantityTrackingEnabled ? input.remainingQuantity ?? 0 : 0,
    remainingQuantity: input.quantityTrackingEnabled ? input.remainingQuantity ?? 0 : 0,
    quantityTrackingEnabled: input.quantityTrackingEnabled ? 1 : 0,
    dosePerIntake: input.dosePerIntake,
    privacyLevel: input.privacyLevel,
    widgetDisplayMode: input.widgetDisplayMode,
    reminderIntensity: input.reminderIntensity,
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
    totalQuantity: 0,
    currentQuantity: input.quantityTrackingEnabled ? input.remainingQuantity ?? 0 : 0,
    remainingQuantity: input.quantityTrackingEnabled ? input.remainingQuantity ?? 0 : 0,
    quantityTrackingEnabled: input.quantityTrackingEnabled ? 1 : 0,
    dosePerIntake: input.dosePerIntake,
    privacyLevel: input.privacyLevel,
    widgetDisplayMode: input.widgetDisplayMode,
    reminderIntensity: input.reminderIntensity,
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
    quantityTrackingEnabled: medication.quantityTrackingEnabled === 1,
    remainingQuantity: medication.remainingQuantity ?? medication.currentQuantity,
    dosePerIntake: medication.dosePerIntake ?? 1,
    cycleConfig: { type: 'daily' },
    privacyLevel: (medication.privacyLevel as ReminderPrivacyLevel) ?? 'hideMedicationName',
    notificationTitle: null,
    notificationBody: null,
    reminderIntensity: (medication.reminderIntensity as ReminderIntensity) ?? 'normal',
    widgetDisplayMode: (medication.widgetDisplayMode as WidgetDisplayMode) ?? 'aliasOnly',
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
  const reminderMode = patch.reminderMode ?? (patch.isEnabled == null ? undefined : (patch.isEnabled ? 'notify' : 'off'))
  await updateTimeslot(id, {
    ...(patch.hour == null ? {} : { hour: patch.hour }),
    ...(patch.minute == null ? {} : { minute: patch.minute }),
    ...(patch.orderIndex == null ? {} : { orderIndex: patch.orderIndex }),
    ...(reminderMode == null ? {} : { reminderMode }),
  })
  await scheduleAlarmsForAllSlots()
}

export async function updateReminderTimeMode(id: string, reminderMode: ReminderMode) {
  await updateTimeslot(id, { reminderMode })
  await scheduleAlarmsForAllSlots()
}

export async function disableMedicationReminders(medicationId: string) {
  const reminders = await db.select().from(timeSlots).where(eq(timeSlots.medicationId, medicationId))
  for (const reminder of reminders) {
    await updateTimeslot(reminder.id, { reminderMode: 'off' })
  }
  await scheduleAlarmsForAllSlots()
}

export async function deleteMedicationWithTimes(medicationId: string) {
  await deleteMedication(medicationId)
  await scheduleAlarmsForAllSlots()
}

export async function pauseReminderTimeForToday(id: string) {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)
  await updateTimeslot(id, { isActive: 0, skipUntil: toLocalISOString(tomorrow) })
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
  const medicationMap = new Map(
    allMedications
      .filter(medication => medication.isArchived !== 1)
      .map(medication => [medication.id, medication]),
  )
  const groupMap = new Map<string, MedicationGroup>()

  for (const reminder of allReminders) {
    const medication = medicationMap.get(reminder.medicationId)
    if (!medication) continue
    if (!isTodayDue(reminder)) continue

    let group = groupMap.get(reminder.medicationId)
    if (!group) {
      group = {
        medication,
        reminders: [],
        completedCount: 0,
        pendingCount: 0,
        totalCount: 0,
      }
      groupMap.set(reminder.medicationId, group)
    }

    const doseRecord = recordMap.get(reminder.id) ?? null
    group.reminders.push({ ...reminder, doseRecord })
    group.totalCount += 1

    if (doseRecord?.status === 'completed' || doseRecord?.status === 'frozen') {
      group.completedCount += 1
    }
    if (!doseRecord || doseRecord.status === 'pending') {
      group.pendingCount += 1
    }
  }

  const groups = [...groupMap.values()]
  for (const group of groups) {
    group.reminders.sort((left, right) => {
      const byRank = reminderSortRank(left) - reminderSortRank(right)
      if (byRank !== 0) return byRank
      const byOrder = left.orderIndex - right.orderIndex
      if (byOrder !== 0) return byOrder
      return (left.hour * 60 + left.minute) - (right.hour * 60 + right.minute)
    })
  }

  return groups.sort((left, right) => {
    const leftReminder = left.reminders[0]
    const rightReminder = right.reminders[0]
    if (!leftReminder || !rightReminder) return leftReminder ? -1 : rightReminder ? 1 : 0
    const byRank = reminderSortRank(leftReminder) - reminderSortRank(rightReminder)
    if (byRank !== 0) return byRank
    return (leftReminder.hour * 60 + leftReminder.minute) - (rightReminder.hour * 60 + rightReminder.minute)
  })
}

export function createLocalReminderId() {
  return randomUUID()
}
