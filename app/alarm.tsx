import React, { useState, useEffect, useCallback } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as Notifications from 'expo-notifications'
import { getTimeslotById } from '@/domain/timeslot/repository'
import { getMedicationById } from '@/domain/medication/repository'
import { getSettings } from '@/domain/settings/repository'
import { getTodayDoseRecordBySlotId, updateDoseRecordStatus } from '@/domain/doseRecord/repository'
import { insertEscapeRecord } from '@/domain/escapeRecord/repository'
import { completeVerification } from '@/hooks/useStreakUpdate'
import { resyncAlarmState, scheduleSnoozeReminder } from '@/domain/alarm/alarmScheduler'
import { resolveExternalAppLabel, resolveSlotAlias } from '@/domain/alarm/privacy'
import { fmtTime } from '@/utils/timeUtils'

type AlarmContext = {
  slotId: string
  appLabel: string
  medName: string
  titleName: string
  hour: number
  minute: number
  doseCount: number
  doseRecordId: string | null
  snoozeMinutes: number
}

const UNABLE_REASONS = [
  { label: '지금 가지고 있지 않아요', value: 'not_available' },
  { label: '지금 확인하기 어려워요', value: 'unable_now' },
  { label: '상태가 좋지 않아요', value: 'not_feeling_well' },
  { label: '기타 사유', value: 'other' },
] as const

export default function AlarmScreen() {
  const { slotId } = useLocalSearchParams<{ slotId?: string }>()
  const router = useRouter()

  const [context, setContext] = useState<AlarmContext | null>(null)

  useEffect(() => {
    if (!slotId) return
    getTimeslotById(slotId).then(async slot => {
      if (!slot) return
      const [med, doseRecord, settings] = await Promise.all([
        getMedicationById(slot.medicationId),
        getTodayDoseRecordBySlotId(slot.id),
        getSettings(),
      ])

      setContext({
        slotId: slot.id,
        appLabel: resolveExternalAppLabel(settings),
        medName: med?.name ?? '',
        titleName: resolveSlotAlias(slot, settings.language),
        hour: slot.hour,
        minute: slot.minute,
        doseCount: slot.doseCountPerIntake,
        doseRecordId: doseRecord?.id ?? null,
        snoozeMinutes: slot.snoozeMinutes ?? 10,
      })
    })
  }, [slotId])

  const dismiss = useCallback(async () => {
    await Notifications.dismissAllNotificationsAsync().catch(() => {})
    router.back()
  }, [router])

  const goHome = useCallback(async () => {
    await Notifications.dismissAllNotificationsAsync().catch(() => {})
    router.replace('/(tabs)/')
  }, [router])

  const handleScan = useCallback(async () => {
    if (!context?.slotId) return
    await Notifications.dismissAllNotificationsAsync().catch(() => {})
    router.navigate(`/scan?slotId=${context.slotId}`)
  }, [context?.slotId, router])

  const handleDirectComplete = useCallback(async () => {
    if (!context?.doseRecordId || !context.slotId) return
    await completeVerification(context.doseRecordId, context.slotId, 'manual')
    await goHome()
  }, [context, goHome])

  const handleSnooze = useCallback(async () => {
    if (!context?.slotId) return
    await scheduleSnoozeReminder(context.slotId, context.snoozeMinutes)
    await goHome()
  }, [context, goHome])

  const markSkipped = useCallback(async (reason: string) => {
    if (!context?.doseRecordId || !context.slotId) return
    await updateDoseRecordStatus(context.doseRecordId, 'skipped', undefined, reason)
    await insertEscapeRecord({
      timeSlotId: context.slotId,
      doseRecordId: context.doseRecordId,
      reason,
      isUserFault: 0,
    })
    await resyncAlarmState()
    await goHome()
  }, [context, goHome])

  const handleSkipToday = useCallback(() => {
    Alert.alert('오늘 건너뛸까요?', '완료 처리되지 않고 오늘 일정만 멈춰요.', [
      { text: '취소', style: 'cancel' },
      { text: '오늘 건너뜀', onPress: () => { void markSkipped('skip_today') } },
    ])
  }, [markSkipped])

  const handleUnableReason = useCallback(() => {
    Alert.alert(
      '사유를 선택해 주세요',
      '선택한 사유는 오늘 기록에만 반영됩니다.',
      [
        { text: UNABLE_REASONS[0].label, onPress: () => { void markSkipped(UNABLE_REASONS[0].value) } },
        { text: UNABLE_REASONS[1].label, onPress: () => { void markSkipped(UNABLE_REASONS[1].value) } },
        { text: UNABLE_REASONS[2].label, onPress: () => { void markSkipped(UNABLE_REASONS[2].value) } },
        { text: UNABLE_REASONS[3].label, onPress: () => { void markSkipped(UNABLE_REASONS[3].value) } },
        { text: '취소', style: 'cancel' },
      ],
    )
  }, [markSkipped])

  if (!context) {
    return (
      <View style={s.root}>
        <Text style={s.empty}>불러오는 중...</Text>
      </View>
    )
  }

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.hero}>
          <Text style={s.eyebrow}>{context.appLabel}</Text>
          <Text style={s.time}>{fmtTime(context.hour, context.minute)}</Text>
          <Text style={s.name}>{context.titleName}</Text>
          <Text style={s.subtle}>{context.doseCount}회 체크 예정</Text>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>확인 방법</Text>
          <TouchableOpacity style={s.primaryBtn} onPress={handleScan}>
            <Text style={s.primaryTxt}>스캔 인증</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.secondaryBtn} onPress={handleDirectComplete}>
            <Text style={s.secondaryTxt}>직접 완료</Text>
          </TouchableOpacity>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>다시 알림</Text>
          <TouchableOpacity style={s.secondaryBtn} onPress={handleSnooze}>
            <Text style={s.secondaryTxt}>{context.snoozeMinutes}분 뒤 다시 알림</Text>
          </TouchableOpacity>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>오늘 일정 조정</Text>
          <TouchableOpacity style={s.neutralBtn} onPress={handleSkipToday}>
            <Text style={s.neutralTxt}>오늘 건너뜀</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.neutralBtn} onPress={handleUnableReason}>
            <Text style={s.neutralTxt}>복용 불가 사유 선택</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <TouchableOpacity style={s.closeBtn} onPress={dismiss}>
        <Text style={s.closeTxt}>닫기</Text>
      </TouchableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f5f4ef',
  },
  scroll: {
    padding: 24,
    paddingTop: 72,
    gap: 16,
  },
  hero: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    padding: 24,
    gap: 6,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    color: '#6b7280',
    textTransform: 'uppercase',
  },
  time: {
    fontSize: 40,
    fontWeight: '800',
    color: '#111827',
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
  },
  subtle: {
    fontSize: 14,
    color: '#6b7280',
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    gap: 10,
  },
  cardTitle: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  primaryBtn: {
    height: 54,
    borderRadius: 18,
    backgroundColor: '#1f2937',
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryTxt: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  secondaryBtn: {
    height: 52,
    borderRadius: 16,
    backgroundColor: '#eef2f7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryTxt: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
  },
  neutralBtn: {
    height: 50,
    borderRadius: 16,
    backgroundColor: '#f5f5f4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  neutralTxt: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  closeBtn: {
    marginHorizontal: 24,
    marginBottom: 28,
    height: 52,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeTxt: {
    fontSize: 15,
    color: '#6b7280',
  },
  empty: {
    marginTop: 120,
    textAlign: 'center',
    color: '#6b7280',
    fontSize: 16,
  },
})
