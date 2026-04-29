import * as Notifications from 'expo-notifications'
import * as BackgroundFetch from 'expo-background-fetch'
import * as TaskManager from 'expo-task-manager'
import { db } from '@backend/db/client'
import { timeSlots, medications } from '@backend/db/schema'
import { eq } from 'drizzle-orm'
import { isTodayDue } from '@shared/utils/cycleUtils'
import { getLocalDateKey } from '@shared/utils/dateUtils'
import { safeParseJson } from '@shared/utils/safeJson'
import { MAX_TIMESLOTS, ALARM_SCHEDULE_DAYS, ALARM_REFRESH_TASK_NAME } from '@shared/constants/alarmConfig'

type SlotRow = typeof timeSlots.$inferSelect

// Cancel all existing notifications for a slot and schedule fresh 5-day window
export async function scheduleAlarmsForSlot(slot: SlotRow, medicationName: string): Promise<void> {
  if (slot.alarmEnabled === 0) {
    // Cancel any existing alarms and clear IDs
    await cancelAlarmsForSlot(slot)
    return
  }

  // Cancel existing
  await cancelAlarmsForSlot(slot)

  const today = new Date()
  const newIds: string[] = []

  for (let dayOffset = 0; dayOffset < ALARM_SCHEDULE_DAYS; dayOffset++) {
    const checkDate = new Date(today)
    checkDate.setDate(today.getDate() + dayOffset)

    if (!isTodayDue(slot, checkDate)) continue

    const trigger = new Date(
      checkDate.getFullYear(),
      checkDate.getMonth(),
      checkDate.getDate(),
      slot.hour,
      slot.minute,
      0,
    )
    if (trigger.getTime() <= Date.now()) continue

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: '약 복용 시간',
        body: `${medicationName} 복용 시간입니다`,
        sound: slot.alarmSound ?? 'default',
        vibrate: slot.vibrationEnabled ? [0, 250, 250, 250] : [],
        data: {
          type: 'regular_alarm',
          timeSlotId: slot.id,
          medicationName,
        },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: trigger },
    })
    newIds.push(id)
  }

  // Save notification IDs
  await db.update(timeSlots)
    .set({ notificationIds: JSON.stringify(newIds) })
    .where(eq(timeSlots.id, slot.id))
}

export async function cancelAlarmsForSlot(slot: SlotRow): Promise<void> {
  const ids = safeParseJson<string[]>(slot.notificationIds)
  if (!ids || ids.length === 0) return
  await Promise.all(ids.map(id => Notifications.cancelScheduledNotificationAsync(id)))
  await db.update(timeSlots)
    .set({ notificationIds: null })
    .where(eq(timeSlots.id, slot.id))
}

// Re-schedule all active slots — called by background refresh task
export async function scheduleAlarmsForAllSlots(): Promise<void> {
  const allSlots = await db.select().from(timeSlots)
  for (const slot of allSlots) {
    const med = await db.select().from(medications)
      .where(eq(medications.id, slot.medicationId))
      .get()
    if (med) {
      await scheduleAlarmsForSlot(slot, med.name)
    }
  }
}

// Register 6-hour background refresh task
export function registerAlarmRefreshTask(): void {
  TaskManager.defineTask(ALARM_REFRESH_TASK_NAME, async () => {
    try {
      await scheduleAlarmsForAllSlots()
      return BackgroundFetch.BackgroundFetchResult.NewData
    } catch {
      return BackgroundFetch.BackgroundFetchResult.Failed
    }
  })
}

export async function startAlarmRefreshTask(): Promise<void> {
  await BackgroundFetch.registerTaskAsync(ALARM_REFRESH_TASK_NAME, {
    minimumInterval: 6 * 60 * 60,   // 6 hours
    stopOnTerminate: false,
    startOnBoot: true,
  })
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

// Request notification permissions
export async function requestNotificationPermissions(): Promise<boolean> {
  const { status } = await Notifications.requestPermissionsAsync()
  return status === 'granted'
}

// Return slot count that is within MAX_TIMESLOTS
export function isUnderSlotLimit(currentCount: number): boolean {
  return currentCount < MAX_TIMESLOTS
}
