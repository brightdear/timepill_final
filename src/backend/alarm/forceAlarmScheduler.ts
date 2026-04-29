import * as Notifications from 'expo-notifications'
import { db } from '@/db/client'
import { timeSlots } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { isTodayDue } from '@/utils/cycleUtils'
import { ALARM_SCHEDULE_DAYS } from '@/constants/alarmConfig'

type SlotRow = typeof timeSlots.$inferSelect

export async function cancelForceAlarmsForSlot(slot: SlotRow): Promise<void> {
  if (!slot.forceNotificationIds) return
  let ids: string[] = []
  try { ids = JSON.parse(slot.forceNotificationIds) as string[] } catch { return }
  await Promise.all(ids.map(id => Notifications.cancelScheduledNotificationAsync(id)))
  await db.update(timeSlots)
    .set({ forceNotificationIds: null })
    .where(eq(timeSlots.id, slot.id))
}

// NOTE: Production implementation requires react-native-alarm-notification
// for wake-lock / lock-screen delivery. This fallback uses expo-notifications.
export async function scheduleForceAlarmsForSlot(
  slot: SlotRow,
  medicationName: string,
): Promise<void> {
  if (slot.forceAlarm === 0 || slot.alarmEnabled === 0) {
    await cancelForceAlarmsForSlot(slot)
    return
  }

  await cancelForceAlarmsForSlot(slot)

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
        title: '[강제알람] 약 복용 시간',
        body: `${medicationName} 복용 시간입니다. 즉시 확인하세요.`,
        sound: slot.alarmSound ?? 'default',
        vibrate: slot.vibrationEnabled ? [0, 500, 200, 500] : [],
        priority: Notifications.AndroidNotificationPriority.MAX,
        data: {
          type: 'force_alarm',
          timeSlotId: slot.id,
          medicationName,
        },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: trigger },
    })
    newIds.push(id)
  }

  await db.update(timeSlots)
    .set({ forceNotificationIds: JSON.stringify(newIds) })
    .where(eq(timeSlots.id, slot.id))
}
