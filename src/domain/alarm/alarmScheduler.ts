import * as Notifications from 'expo-notifications'
import * as BackgroundFetch from 'expo-background-fetch'
import * as TaskManager from 'expo-task-manager'
import { isRunningInExpoGo } from 'expo'
import { db } from '@/db/client'
import { doseRecords, medications, timeSlots } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { isTodayDue } from '@/utils/cycleUtils'
import { getLocalDateKey, toLocalISOString } from '@/utils/dateUtils'
import { safeParseJson } from '@/utils/safeJson'
import { getPendingBadgeCount, getTodayDoseRecordBySlotId, updateDoseRecordLastNotification, updateDoseRecordSnooze } from '@/domain/doseRecord/repository'
import { getSettings } from '@/domain/settings/repository'
import {
  classifyReminderPhase,
  resolveNotificationCopy,
  resolveReminderOffsets,
  type ReminderPhase,
} from '@/domain/alarm/privacy'
import { ALARM_REFRESH_TASK_NAME, MAX_TIMESLOTS } from '@/constants/alarmConfig'

type SlotRow = typeof timeSlots.$inferSelect
type MedicationRow = typeof medications.$inferSelect
type SettingsRow = Awaited<ReturnType<typeof getSettings>>
type DoseRecordRow = typeof doseRecords.$inferSelect

type RoutineNotificationData = {
  type: 'check_alarm'
  timeSlotId: string
  phase: ReminderPhase
  offsetMinutes: number
  scheduledFor: string
}

type NotificationCandidate = {
  slotId: string
  trigger: Date
  content: Notifications.NotificationContentInput
}

let syncScheduledAlarmsPromise: Promise<void> | null = null

const CHECK_CATEGORY_ID = 'daily-check-category'
export const NOTIFICATION_ACTION_CHECK = 'OPEN_CHECK'
export const NOTIFICATION_ACTION_SCAN = 'OPEN_SCAN'
export const NOTIFICATION_ACTION_SNOOZE = 'SNOOZE_10'
export const NOTIFICATION_ACTION_LATER = 'LATER'

const NOTIFICATION_WINDOW_HOURS = 30
const MAX_SCHEDULED_NOTIFICATIONS = 58

function buildNotificationTrigger(date: Date): Notifications.DateTriggerInput {
  return { type: Notifications.SchedulableTriggerInputTypes.DATE, date }
}

async function canUseBackgroundAlarmRefresh(): Promise<boolean> {
  if (isRunningInExpoGo()) {
    return false
  }

  try {
    return await TaskManager.isAvailableAsync()
  } catch {
    return false
  }
}

function uniqueIds(slots: SlotRow[]): string[] {
  return [...new Set(slots.flatMap(slot => safeParseJson<string[]>(slot.notificationIds) ?? []))]
}

async function clearNotificationIds(slotIds: string[]): Promise<void> {
  if (slotIds.length === 0) return
  for (const slotId of slotIds) {
    await db.update(timeSlots).set({ notificationIds: null }).where(eq(timeSlots.id, slotId))
  }
}

async function cancelScheduledSlotNotifications(slots: SlotRow[]): Promise<void> {
  const ids = uniqueIds(slots)
  await Promise.all(ids.map(id => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})))
  await clearNotificationIds(slots.map(slot => slot.id))
}

function resolvePriority(slot: SlotRow): Notifications.AndroidNotificationPriority {
  if (slot.reminderIntensity === 'strict' || slot.forceAlarm === 1) {
    return Notifications.AndroidNotificationPriority.HIGH
  }
  return Notifications.AndroidNotificationPriority.DEFAULT
}

function resolveBaseDate(slot: SlotRow, todayRecord: DoseRecordRow | undefined, candidateDay: Date): Date {
  if (
    todayRecord &&
    candidateDay.toDateString() === new Date().toDateString() &&
    todayRecord.snoozedUntil
  ) {
    return new Date(todayRecord.snoozedUntil)
  }

  return new Date(
    candidateDay.getFullYear(),
    candidateDay.getMonth(),
    candidateDay.getDate(),
    slot.hour,
    slot.minute,
    0,
    0,
  )
}

function buildCandidatesForSlot(args: {
  slot: SlotRow
  medication: MedicationRow | undefined
  settings: SettingsRow
  todayRecord: DoseRecordRow | undefined
  now: Date
  horizonEnd: Date
}): NotificationCandidate[] {
  const { slot, medication, settings, todayRecord, now, horizonEnd } = args
  const offsets = resolveReminderOffsets(slot)
  const candidates: NotificationCandidate[] = []

  for (let dayOffset = 0; dayOffset <= 2; dayOffset++) {
    const candidateDay = new Date(now)
    candidateDay.setHours(12, 0, 0, 0)
    candidateDay.setDate(candidateDay.getDate() + dayOffset)

    if (!isTodayDue(slot, candidateDay)) continue
    if (dayOffset === 0 && todayRecord && todayRecord.status !== 'pending') continue

    const baseDate = resolveBaseDate(slot, todayRecord, candidateDay)
    const isSnoozedToday = dayOffset === 0 && !!todayRecord?.snoozedUntil
    const effectiveOffsets = isSnoozedToday ? offsets.filter(offset => offset >= 0) : offsets

    for (const offsetMinutes of effectiveOffsets) {
      const trigger = new Date(baseDate.getTime() + offsetMinutes * 60 * 1000)
      if (trigger.getTime() <= now.getTime()) continue
      if (trigger.getTime() > horizonEnd.getTime()) continue

      const phase = isSnoozedToday && offsetMinutes === 0
        ? 'snooze'
        : classifyReminderPhase(offsetMinutes)

      const copy = resolveNotificationCopy({
        slot,
        medicationName: medication?.aliasName || medication?.name || '',
        settings,
        phase,
      })

      const data: RoutineNotificationData = {
        type: 'check_alarm',
        timeSlotId: slot.id,
        phase,
        offsetMinutes,
        scheduledFor: toLocalISOString(trigger),
      }

      candidates.push({
        slotId: slot.id,
        trigger,
        content: {
          title: copy.title,
          body: copy.body,
          sound: slot.alarmSound === 'default' ? 'default' : undefined,
          vibrate: slot.vibrationEnabled ? [0, 180, 120, 180] : [],
          priority: resolvePriority(slot),
          categoryIdentifier: CHECK_CATEGORY_ID,
          data,
        },
      })
    }
  }

  return candidates
}

async function performSyncScheduledAlarms(): Promise<void> {
  const slots = await db.select().from(timeSlots)
  const meds = await db.select().from(medications)
  const todayRecords = await db.select().from(doseRecords).where(eq(doseRecords.dayKey, getLocalDateKey()))
  const settingsRow = await getSettings()

  await cancelScheduledSlotNotifications(slots)

  const permissions = await Notifications.getPermissionsAsync()
  const canSchedule = permissions.granted || permissions.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  if (!canSchedule) {
    await syncAppBadgeCount()
    return
  }

  const medMap = new Map(meds.map(med => [med.id, med]))
  const recordMap = new Map(todayRecords.map(record => [record.timeSlotId ?? '', record]))
  const now = new Date()
  const horizonEnd = new Date(now.getTime() + NOTIFICATION_WINDOW_HOURS * 60 * 60 * 1000)

  const allCandidates = slots
    .filter(slot => slot.isActive === 1 && slot.isEnabled !== 0 && slot.alarmEnabled !== 0)
    .flatMap(slot =>
      buildCandidatesForSlot({
        slot,
        medication: medMap.get(slot.medicationId),
        settings: settingsRow,
        todayRecord: recordMap.get(slot.id),
        now,
        horizonEnd,
      }),
    )
    .sort((a, b) => a.trigger.getTime() - b.trigger.getTime())
    .slice(0, MAX_SCHEDULED_NOTIFICATIONS)

  const groupedIds = new Map<string, string[]>()
  for (const candidate of allCandidates) {
    const id = await Notifications.scheduleNotificationAsync({
      content: candidate.content,
      trigger: buildNotificationTrigger(candidate.trigger),
    })
    const slotIds = groupedIds.get(candidate.slotId) ?? []
    slotIds.push(id)
    groupedIds.set(candidate.slotId, slotIds)
  }

  for (const slot of slots) {
    await db.update(timeSlots)
      .set({ notificationIds: JSON.stringify(groupedIds.get(slot.id) ?? []) })
      .where(eq(timeSlots.id, slot.id))
  }

  await syncAppBadgeCount()
}

async function syncScheduledAlarms(): Promise<void> {
  if (syncScheduledAlarmsPromise) {
    return syncScheduledAlarmsPromise
  }

  syncScheduledAlarmsPromise = (async () => {
    try {
      await performSyncScheduledAlarms()
    } finally {
      syncScheduledAlarmsPromise = null
    }
  })()

  return syncScheduledAlarmsPromise
}

export async function scheduleAlarmsForSlot(_slot: SlotRow, _medicationName?: string): Promise<void> {
  await syncScheduledAlarms()
}

export async function cancelAlarmsForSlot(slot: SlotRow): Promise<void> {
  const ids = safeParseJson<string[]>(slot.notificationIds)
  if (!ids || ids.length === 0) return
  await Promise.all(ids.map(id => Notifications.cancelScheduledNotificationAsync(id)))
  await db.update(timeSlots)
    .set({ notificationIds: null })
    .where(eq(timeSlots.id, slot.id))
}

export async function scheduleAlarmsForAllSlots(): Promise<void> {
  await syncScheduledAlarms()
}

export async function syncAppBadgeCount(): Promise<void> {
  const settingsRow = await getSettings()
  const badgeCount = settingsRow.badgeEnabled === 0 ? 0 : await getPendingBadgeCount()
  try {
    await Notifications.setBadgeCountAsync(badgeCount)
  } catch {
    // Badge updates are best-effort only.
  }
}

export async function clearAppBadgeCount(): Promise<void> {
  try {
    await Notifications.setBadgeCountAsync(0)
  } catch {
    // Ignore badge reset failures.
  }
}

export async function registerNotificationCategories(): Promise<void> {
  await Notifications.setNotificationCategoryAsync(
    CHECK_CATEGORY_ID,
    [
      {
        identifier: NOTIFICATION_ACTION_SCAN,
        buttonTitle: '카메라 인증',
        options: { opensAppToForeground: true },
      },
      {
        identifier: NOTIFICATION_ACTION_SNOOZE,
        buttonTitle: '10분 뒤',
        options: { opensAppToForeground: true },
      },
      {
        identifier: NOTIFICATION_ACTION_LATER,
        buttonTitle: '나중에',
        options: { opensAppToForeground: false },
      },
    ],
  )
}

export async function requestNotificationPermissions(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync()
  if (existing.granted || existing.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return true
  }

  const requested = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  })

  return requested.granted || requested.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
}

export async function ensureInitialNotificationAccess(): Promise<'granted' | 'denied' | 'undetermined'> {
  const current = await Notifications.getPermissionsAsync()
  if (current.granted || current.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
    return 'granted'
  }
  if (current.canAskAgain === false) {
    return 'denied'
  }
  return 'undetermined'
}

export async function scheduleSnoozeReminder(timeSlotId: string, minutes?: number): Promise<void> {
  const slot = await db.select().from(timeSlots).where(eq(timeSlots.id, timeSlotId)).get()
  if (!slot) return
  const snoozeMinutes = minutes ?? slot.snoozeMinutes ?? 10
  const snoozedUntil = toLocalISOString(new Date(Date.now() + snoozeMinutes * 60 * 1000))
  await updateDoseRecordSnooze(timeSlotId, snoozedUntil)
  await syncScheduledAlarms()
}

export async function clearSnoozeReminder(timeSlotId: string): Promise<void> {
  await updateDoseRecordSnooze(timeSlotId, null)
}

export async function noteNotificationDelivered(timeSlotId: string): Promise<void> {
  await updateDoseRecordLastNotification(timeSlotId, toLocalISOString(new Date()))
}

export async function resyncAlarmState(): Promise<void> {
  if (isRunningInExpoGo()) {
    return
  }

  await syncScheduledAlarms()
}

export async function maybeScheduleCompletionNotification(timeSlotId: string): Promise<void> {
  const slot = await db.select().from(timeSlots).where(eq(timeSlots.id, timeSlotId)).get()
  const settingsRow = await getSettings()

  if (!slot || settingsRow.completeNotificationEnabled !== 1) {
    return
  }

  const medication = await db.select().from(medications).where(eq(medications.id, slot.medicationId)).get()
  const copy = resolveNotificationCopy({
    slot,
    medicationName: medication?.aliasName || medication?.name || '',
    settings: settingsRow,
    phase: 'completed',
  })

  await Notifications.scheduleNotificationAsync({
    content: {
      title: copy.title,
      body: copy.body,
      sound: false,
      data: {
        type: 'check_alarm',
        timeSlotId,
        phase: 'completed',
        offsetMinutes: 0,
        scheduledFor: toLocalISOString(new Date()),
      } satisfies RoutineNotificationData,
    },
    trigger: buildNotificationTrigger(new Date(Date.now() + 1000)),
  })
}

export function registerAlarmRefreshTask(): void {
  if (isRunningInExpoGo() || TaskManager.isTaskDefined(ALARM_REFRESH_TASK_NAME)) {
    return
  }

  TaskManager.defineTask(ALARM_REFRESH_TASK_NAME, async () => {
    try {
      await syncScheduledAlarms()
      return BackgroundFetch.BackgroundFetchResult.NewData
    } catch {
      return BackgroundFetch.BackgroundFetchResult.Failed
    }
  })
}

export async function startAlarmRefreshTask(): Promise<void> {
  if (!(await canUseBackgroundAlarmRefresh())) {
    return
  }

  try {
    const isAlreadyRegistered = await TaskManager.isTaskRegisteredAsync(ALARM_REFRESH_TASK_NAME)
    if (isAlreadyRegistered) {
      return
    }
  } catch {
    // Ignore task lookup failures and attempt registration once.
  }

  try {
    await BackgroundFetch.registerTaskAsync(ALARM_REFRESH_TASK_NAME, {
      minimumInterval: 2 * 60 * 60,
      stopOnTerminate: false,
      startOnBoot: true,
    })
  } catch (error) {
    if (__DEV__) {
      console.warn('[alarmScheduler] background refresh registration skipped:', error)
    }
  }
}

export function setupNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  })
}

export function isUnderSlotLimit(currentCount: number): boolean {
  return currentCount < MAX_TIMESLOTS
}

export async function getSlotForNotification(timeSlotId: string) {
  return db.select().from(timeSlots).where(eq(timeSlots.id, timeSlotId)).get()
}

export function parseRoutineNotificationData(data: unknown): RoutineNotificationData | null {
  if (!data || typeof data !== 'object') return null
  const payload = data as Partial<RoutineNotificationData>
  if (payload.type !== 'check_alarm' || !payload.timeSlotId) return null
  return {
    type: 'check_alarm',
    timeSlotId: payload.timeSlotId,
    phase: payload.phase ?? 'due',
    offsetMinutes: payload.offsetMinutes ?? 0,
    scheduledFor: payload.scheduledFor ?? '',
  }
}
