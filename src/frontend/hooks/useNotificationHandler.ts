import { useEffect, useRef } from 'react'
import * as Notifications from 'expo-notifications'
import { useRouter } from 'expo-router'
import { getTimeslotById } from '@/domain/timeslot/repository'
import { forceAlarmBus } from '@/utils/forceAlarmBus'

type NotificationData = {
  type: 'regular_alarm' | 'force_alarm'
  timeSlotId?: string
  medicationName?: string
  snoozeUsed?: number
}

export function useNotificationHandler() {
  const router = useRouter()
  const lastNotif = useRef<Notifications.Notification | null>(null)

  useEffect(() => {
    // Foreground notification received
    const sub1 = Notifications.addNotificationReceivedListener(notif => {
      lastNotif.current = notif
    })

    // User tapped notification
    const sub2 = Notifications.addNotificationResponseReceivedListener(async response => {
      const data = response.notification.request.content.data as NotificationData

      if (data.type === 'regular_alarm' && data.timeSlotId) {
        // Collision policy: skip regular alarm navigation when force alarm screen is active
        if (forceAlarmBus.isActive()) return
        const slot = await getTimeslotById(data.timeSlotId)
        if (slot?.popupEnabled !== 0) {
          const snoozeUsed = data.snoozeUsed ?? 0
          router.navigate(`/alarm?slotId=${data.timeSlotId}&snoozeUsed=${snoozeUsed}`)
        }
      }

      if (data.type === 'force_alarm' && data.timeSlotId) {
        if (forceAlarmBus.isActive()) {
          // Merge into existing force alarm screen instead of navigating
          forceAlarmBus.emit(data.timeSlotId)
        } else {
          router.navigate(`/force-alarm?slotId=${data.timeSlotId}`)
        }
      }
    })

    return () => {
      sub1.remove()
      sub2.remove()
    }
  }, [router])
}
