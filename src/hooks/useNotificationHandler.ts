import { useEffect, useRef } from 'react'
import * as Notifications from 'expo-notifications'
import { useRouter } from 'expo-router'
import { getTimeslotById } from '@/domain/timeslot/repository'
import { forceAlarmBus } from '@/utils/forceAlarmBus'
import {
  NOTIFICATION_ACTION_CHECK,
  NOTIFICATION_ACTION_LATER,
  NOTIFICATION_ACTION_SNOOZE,
  noteNotificationDelivered,
  parseRoutineNotificationData,
  scheduleSnoozeReminder,
} from '@/domain/alarm/alarmScheduler'

type NotificationData = {
  type: 'check_alarm' | 'force_alarm'
  timeSlotId?: string
}

export function useNotificationHandler() {
  const router = useRouter()
  const lastNotif = useRef<Notifications.Notification | null>(null)

  useEffect(() => {
    async function handleNotificationResponse(response: Notifications.NotificationResponse) {
      const { actionIdentifier, notification } = response
      const data = notification.request.content.data as NotificationData

      if (data.type === 'force_alarm' && data.timeSlotId) {
        if (forceAlarmBus.isActive()) {
          forceAlarmBus.emit(data.timeSlotId)
        } else {
          router.navigate(`/force-alarm?slotId=${data.timeSlotId}`)
        }
        return
      }

      const routine = parseRoutineNotificationData(notification.request.content.data)
      if (!routine?.timeSlotId) return

      await Notifications.dismissNotificationAsync(notification.request.identifier).catch(() => {})

      if (routine.phase === 'completed') {
        router.replace('/(tabs)/')
        return
      }

      if (actionIdentifier === NOTIFICATION_ACTION_SNOOZE) {
        await scheduleSnoozeReminder(routine.timeSlotId)
        router.replace('/(tabs)/')
        return
      }

      if (actionIdentifier === NOTIFICATION_ACTION_LATER) {
        router.replace('/(tabs)/')
        return
      }

      if (
        actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER ||
        actionIdentifier === NOTIFICATION_ACTION_CHECK
      ) {
        const slot = await getTimeslotById(routine.timeSlotId)
        if (slot?.popupEnabled !== 0) {
          router.navigate(`/alarm?slotId=${routine.timeSlotId}`)
        }
      }
    }

    // Foreground notification received
    const sub1 = Notifications.addNotificationReceivedListener(notif => {
      lastNotif.current = notif
      const routine = parseRoutineNotificationData(notif.request.content.data)
      if (routine?.timeSlotId) {
        void noteNotificationDelivered(routine.timeSlotId)
      }
    })

    // User tapped notification
    const sub2 = Notifications.addNotificationResponseReceivedListener(async response => {
      if (forceAlarmBus.isActive()) return
      await handleNotificationResponse(response)
    })

    void Notifications.getLastNotificationResponseAsync().then(response => {
      if (response) {
        void handleNotificationResponse(response)
      }
    })

    return () => {
      sub1.remove()
      sub2.remove()
    }
  }, [router])
}
