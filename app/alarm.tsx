import React, { useState, useEffect, useCallback } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as Notifications from 'expo-notifications'
import { getTimeslotById } from '@/domain/timeslot/repository'
import { getMedicationById } from '@/domain/medication/repository'
import { fmtTime } from '@/utils/timeUtils'

export default function AlarmScreen() {
  const { slotId, snoozeUsed: initialSnoozeUsed } = useLocalSearchParams<{ slotId?: string; snoozeUsed?: string }>()
  const router = useRouter()

  const [medName, setMedName] = useState('')
  const [hour, setHour] = useState(0)
  const [minute, setMinute] = useState(0)
  const [doseCount, setDoseCount] = useState(1)
  const [snoozeCount, setSnoozeCount] = useState(0)
  const [snoozeIntervalMin, setSnoozeIntervalMin] = useState(5)
  const [snoozeUsed, setSnoozeUsed] = useState(() => parseInt(initialSnoozeUsed ?? '0', 10))

  useEffect(() => {
    setSnoozeUsed(parseInt(initialSnoozeUsed ?? '0', 10))
  }, [initialSnoozeUsed])

  useEffect(() => {
    if (!slotId) return
    getTimeslotById(slotId).then(async slot => {
      if (!slot) return
      const med = await getMedicationById(slot.medicationId)
      setMedName(med?.name ?? '')
      setHour(slot.hour)
      setMinute(slot.minute)
      setDoseCount(slot.doseCountPerIntake)
      setSnoozeCount(slot.snoozeCount)
      setSnoozeIntervalMin(slot.snoozeIntervalMin)
    })
  }, [slotId])

  const dismiss = useCallback(async () => {
    await Notifications.dismissAllNotificationsAsync()
    router.back()
  }, [router])

  const handleVerify = useCallback(async () => {
    await dismiss()
    router.navigate(`/scan?slotId=${slotId}`)
  }, [dismiss, router, slotId])

  const handleSnooze = useCallback(async () => {
    if (!slotId || snoozeUsed >= snoozeCount) return
    const slot = await getTimeslotById(slotId)
    if (!slot) return
    const med = await getMedicationById(slot.medicationId)

    const nextSnoozeUsed = snoozeUsed + 1
    const snoozeTime = new Date(Date.now() + snoozeIntervalMin * 60 * 1000)
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '약 복용 시간 (스누즈)',
        body: `${med?.name ?? ''} 복용 시간입니다`,
        data: { type: 'regular_alarm', timeSlotId: slotId, medicationName: med?.name, snoozeUsed: nextSnoozeUsed },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: snoozeTime,
      },
    })
    setSnoozeUsed(nextSnoozeUsed)
    await dismiss()
  }, [slotId, snoozeUsed, snoozeCount, snoozeIntervalMin, dismiss])

  const canSnooze = snoozeCount > 0 && snoozeUsed < snoozeCount

  return (
    <View style={s.root}>
      <View style={s.card}>
        <Text style={s.time}>{fmtTime(hour, minute)}</Text>
        <Text style={s.medName}>{medName}</Text>
        <Text style={s.dose}>{doseCount}정</Text>
      </View>

      <View style={s.actions}>
        <TouchableOpacity style={s.verifyBtn} onPress={handleVerify}>
          <Text style={s.verifyTxt}>인증하기</Text>
        </TouchableOpacity>

        {canSnooze && (
          <TouchableOpacity style={s.snoozeBtn} onPress={handleSnooze}>
            <Text style={s.snoozeTxt}>
              스누즈 ({snoozeIntervalMin}분, {snoozeCount - snoozeUsed}회 남음)
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={s.closeBtn} onPress={dismiss}>
          <Text style={s.closeTxt}>알람 끄기</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 32,
  },
  card: { alignItems: 'center', gap: 8 },
  time: { fontSize: 52, fontWeight: '800', color: '#fff' },
  medName: { fontSize: 24, fontWeight: '600', color: '#fff' },
  dose: { fontSize: 18, color: 'rgba(255,255,255,0.6)' },
  actions: { width: '100%', gap: 12 },
  verifyBtn: {
    height: 56,
    borderRadius: 16,
    backgroundColor: '#22c55e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyTxt: { fontSize: 18, fontWeight: '700', color: '#fff' },
  snoozeBtn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  snoozeTxt: { fontSize: 15, fontWeight: '600', color: '#fff' },
  closeBtn: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeTxt: { fontSize: 15, color: 'rgba(255,255,255,0.4)' },
})
