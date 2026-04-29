import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as Notifications from 'expo-notifications'
import { getTimeslotById } from '@backend/timeslot/repository'
import { getMedicationById } from '@backend/medication/repository'
import { getDoseRecordsByDate } from '@backend/doseRecord/repository'
import { insertEscapeRecord } from '@backend/escapeRecord/repository'
import { getLocalDateKey } from '@shared/utils/dateUtils'
import { forceAlarmBus } from '@shared/utils/forceAlarmBus'
import { fmtTime } from '@shared/utils/timeUtils'

type SlotInfo = {
  slotId: string
  medName: string
  hour: number
  minute: number
  doseCount: number
  snoozeCount: number
  snoozeIntervalMin: number
  snoozeUsed: number
}

export default function ForceAlarmScreen() {
  const { slotId } = useLocalSearchParams<{ slotId?: string }>()
  const router = useRouter()

  const [slots, setSlots] = useState<SlotInfo[]>([])

  const loadSlot = useCallback(async (id: string) => {
    const slot = await getTimeslotById(id)
    if (!slot) return
    const med = await getMedicationById(slot.medicationId)
    const info: SlotInfo = {
      slotId: id,
      medName: med?.name ?? '',
      hour: slot.hour,
      minute: slot.minute,
      doseCount: slot.doseCountPerIntake,
      snoozeCount: slot.snoozeCount,
      snoozeIntervalMin: slot.snoozeIntervalMin,
      snoozeUsed: 0,
    }
    setSlots(prev => {
      if (prev.some(s => s.slotId === id)) return prev
      return [...prev, info]
    })
  }, [])

  useEffect(() => {
    forceAlarmBus.setActive(true)
    const unsub = forceAlarmBus.subscribe(loadSlot)
    return () => {
      forceAlarmBus.setActive(false)
      unsub()
    }
  }, [loadSlot])

  useEffect(() => {
    if (!slotId) return
    void loadSlot(slotId)
  }, [slotId, loadSlot])

  const dismiss = useCallback(async () => {
    await Notifications.dismissAllNotificationsAsync()
    router.replace('/(tabs)/')
  }, [router])

  const handleVerify = useCallback(async (slot: SlotInfo) => {
    await Notifications.dismissAllNotificationsAsync()
    router.navigate(`/scan?slotId=${slot.slotId}`)
  }, [router])

  const handleSnooze = useCallback(async (slot: SlotInfo) => {
    if (slot.snoozeUsed >= slot.snoozeCount) return

    const snoozeTime = new Date(Date.now() + slot.snoozeIntervalMin * 60 * 1000)
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '[강제알람] 약 복용 시간 (스누즈)',
        body: `${slot.medName} 복용 시간입니다`,
        data: { type: 'force_alarm', timeSlotId: slot.slotId, medicationName: slot.medName },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: snoozeTime,
      },
    })
    setSlots(prev =>
      prev.map(s => s.slotId === slot.slotId ? { ...s, snoozeUsed: s.snoozeUsed + 1 } : s),
    )
    if (slots.length === 1) await dismiss()
  }, [slots.length, dismiss])

  const handleEscape = useCallback(async (slot: SlotInfo) => {
    Alert.alert(
      '긴급 탈출',
      '강제알람을 무시하고 종료합니다. 이 행동은 기록됩니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '종료',
          style: 'destructive',
          onPress: async () => {
            const today = getLocalDateKey()
            const todayRecords = await getDoseRecordsByDate(today)
            const doseRecord = todayRecords.find(r => r.timeSlotId === slot.slotId)

            await insertEscapeRecord({
              timeSlotId: slot.slotId,
              doseRecordId: doseRecord?.id ?? null,
              reason: 'force_alarm_dismissed',
              isUserFault: 1,
            })

            setSlots(prev => {
              const remaining = prev.filter(s => s.slotId !== slot.slotId)
              if (remaining.length === 0) void dismiss()
              return remaining
            })
          },
        },
      ],
    )
  }, [dismiss])

  if (slots.length === 0) {
    return (
      <View style={s.root}>
        <Text style={s.empty}>로딩 중...</Text>
      </View>
    )
  }

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {slots.map(slot => {
          const canSnooze = slot.snoozeCount > 0 && slot.snoozeUsed < slot.snoozeCount
          return (
            <View key={slot.slotId} style={s.card}>
              <Text style={s.time}>{fmtTime(slot.hour, slot.minute)}</Text>
              <Text style={s.medName}>{slot.medName}</Text>
              <Text style={s.dose}>{slot.doseCount}정</Text>

              <View style={s.actions}>
                <TouchableOpacity style={s.verifyBtn} onPress={() => handleVerify(slot)}>
                  <Text style={s.verifyTxt}>인증하기</Text>
                </TouchableOpacity>

                {canSnooze && (
                  <TouchableOpacity style={s.snoozeBtn} onPress={() => handleSnooze(slot)}>
                    <Text style={s.snoozeTxt}>
                      스누즈 ({slot.snoozeIntervalMin}분, {slot.snoozeCount - slot.snoozeUsed}회 남음)
                    </Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={s.escapeBtn} onPress={() => handleEscape(slot)}>
                  <Text style={s.escapeTxt}>긴급 탈출</Text>
                </TouchableOpacity>
              </View>
            </View>
          )
        })}
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0a0a0a',
  },
  scroll: {
    padding: 24,
    paddingTop: 60,
    gap: 20,
  },
  empty: { color: '#fff', textAlign: 'center', marginTop: 100, fontSize: 16 },
  card: {
    backgroundColor: '#1a1a1a',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  time: { fontSize: 48, fontWeight: '800', color: '#fff' },
  medName: { fontSize: 22, fontWeight: '600', color: '#fff' },
  dose: { fontSize: 16, color: 'rgba(255,255,255,0.5)' },
  actions: { width: '100%', gap: 10, marginTop: 16 },
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
  escapeBtn: {
    height: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(239,68,68,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  escapeTxt: { fontSize: 15, color: '#ef4444', fontWeight: '600' },
})
