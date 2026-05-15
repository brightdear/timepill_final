import React, { useCallback, useEffect, useRef, useState, type ComponentType } from 'react'
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { isRunningInExpoGo } from 'expo'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { db } from '@/db/client'
import { doseRecords, timeSlots, medications } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { completeMedicationSchedule } from '@/domain/medicationSchedule/completion'
import { getScanVerificationWindowState, type ScanVerificationWindowState } from '@/domain/medicationSchedule/scanWindow'
import { getSettings } from '@/domain/settings/repository'
import { FreezeAcquiredPopup } from '@/components/FreezeAcquiredPopup'
import { getLocalDateKey } from '@/utils/dateUtils'
import { SCAN_CONFIG } from '@/constants/scanConfig'
import { isVerifiable } from '@/hooks/useTodayTimeslots'
import { designHarness } from '@/design/designHarness'

const { height: SCREEN_H } = Dimensions.get('window')

interface VerifiableItem {
  slotId: string
  medicationId: string
  doseRecordId: string | null
  medName: string
  doseCount: number
  color: string
  reminderMode: 'off' | 'notify' | 'scan'
  scheduledDate: string
  scheduledTime: string
}

type ScannerProps = {
  medicationName: string
  onClose: () => void
  onVerified: (confidence: number) => void
}

let NativeRealtimePillScanner: ComponentType<ScannerProps> | null | undefined

function getNativeRealtimePillScanner() {
  if (isRunningInExpoGo()) return null
  if (NativeRealtimePillScanner !== undefined) return NativeRealtimePillScanner

  try {
    NativeRealtimePillScanner = require('../src/components/scan/RealtimePillScanner').RealtimePillScanner as ComponentType<ScannerProps>
  } catch {
    NativeRealtimePillScanner = null
  }
  return NativeRealtimePillScanner
}

function ScannerUnavailable({ medicationName, onClose, onVerified, canSimulate }: ScannerProps & { canSimulate: boolean }) {
  return (
    <View style={s.scannerFallback}>
      <Text style={s.scannerFallbackTitle}>{medicationName}</Text>
      <Text style={s.scannerFallbackBody}>개발 빌드에서 스캔을 사용할 수 있습니다</Text>
      {canSimulate && (
        <TouchableOpacity style={s.scannerFallbackPrimary} onPress={() => onVerified(0.99)}>
          <Text style={s.scannerFallbackPrimaryText}>테스트 완료</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity style={s.scannerFallbackSecondary} onPress={onClose}>
        <Text style={s.scannerFallbackSecondaryText}>닫기</Text>
      </TouchableOpacity>
    </View>
  )
}

function PillScanner(props: ScannerProps & { canSimulate?: boolean }) {
  const NativeScanner = getNativeRealtimePillScanner()
  if (NativeScanner) return <NativeScanner {...props} />
  return <ScannerUnavailable {...props} canSimulate={props.canSimulate === true} />
}

function scanUnavailableCopy(state: ScanVerificationWindowState | null) {
  if (state === 'upcoming') {
    return {
      title: '아직 스캔 시간이 아니에요',
      body: '알림 시간부터 1시간 안에만 스캔할 수 있습니다.',
    }
  }
  if (state === 'expired') {
    return {
      title: '스캔 가능 시간이 지났어요',
      body: '알림 시간부터 1시간 안에만 인증할 수 있습니다.',
    }
  }
  return {
    title: '인증 가능한 약이 없어요',
    body: '오늘 스캔 가능한 일정이 있는지 확인해주세요.',
  }
}

export default function ScanScreen() {
  const {
    slotId: forcedSlotId,
    scheduleId: forcedScheduleId,
    medicationId: forcedMedicationId,
    scheduledDate,
    scheduledTime,
    test,
  } = useLocalSearchParams<{
    slotId?: string
    scheduleId?: string
    medicationId?: string
    scheduledDate?: string
    scheduledTime?: string
    test?: string
  }>()
  const router = useRouter()
  const verifyingRef = useRef(false)
  const [items, setItems] = useState<VerifiableItem[]>([])
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null)
  const [loadingItems, setLoadingItems] = useState(true)
  const [scanUnavailableState, setScanUnavailableState] = useState<ScanVerificationWindowState | null>(null)
  const [freezePopup, setFreezePopup] = useState<{ visible: boolean; streak: number }>({
    visible: false,
    streak: 0,
  })
  const [devMode, setDevMode] = useState(false)
  const [highDoseWarning, setHighDoseWarning] = useState(false)
  const requestedScanTest = test === '1' || test === 'true'
  const requestedScheduleId = forcedScheduleId ?? forcedSlotId
  const requestedDate = scheduledDate?.slice(0, 10) ?? getLocalDateKey()
  const [testKey, setTestKey] = useState(0)
  const [testConfidence, setTestConfidence] = useState<number | null>(null)

  const loadVerifiableItems = useCallback(async (): Promise<VerifiableItem[]> => {
    setLoadingItems(true)
    const [allSlots, todayRecords, allMedications] = await Promise.all([
      db.select().from(timeSlots),
      db.select().from(doseRecords).where(eq(doseRecords.dayKey, requestedDate)),
      db.select().from(medications),
    ])
    const todayRecordMap = new Map(
      todayRecords.map(record => [record.reminderTimeId ?? record.timeSlotId ?? '', record]),
    )
    const medicationMap = new Map(allMedications.map(m => [m.id, m]))
    const results: VerifiableItem[] = []
    let hasHighDoseWarning = false
    let blockedScanState: ScanVerificationWindowState | null = null

    for (const slot of allSlots) {
      if (requestedScheduleId && slot.id !== requestedScheduleId) continue
      if (slot.isActive === 0) continue

      const dr = todayRecordMap.get(slot.id) ?? null
      const isForcedSchedule = requestedScheduleId === slot.id
      const isCompleted = dr?.status === 'completed' || dr?.status === 'frozen'
      if (!isForcedSchedule && !isVerifiable(slot, dr ?? null)) continue
      if (isForcedSchedule && isCompleted) continue

      const med = medicationMap.get(slot.medicationId)
      const resolvedScheduledTime = dr?.scheduledTime ?? scheduledTime ?? `${String(slot.hour).padStart(2, '0')}:${String(slot.minute).padStart(2, '0')}`
      const resolvedScheduledDate = dr?.dayKey ?? requestedDate
      const reminderMode = slot.reminderMode === 'off' || slot.reminderMode === 'scan' ? slot.reminderMode : 'notify'

      if (reminderMode === 'scan') {
        const scanWindowState = getScanVerificationWindowState({
          scheduledDate: resolvedScheduledDate,
          scheduledTime: resolvedScheduledTime,
        })
        if (scanWindowState !== 'open') {
          blockedScanState = scanWindowState
          continue
        }
      }

      results.push({
        slotId: slot.id,
        medicationId: forcedMedicationId ?? med?.id ?? slot.medicationId,
        doseRecordId: dr?.id ?? null,
        medName: med?.name ?? '?',
        doseCount: slot.doseCountPerIntake,
        color: med?.color ?? '#888',
        reminderMode,
        scheduledDate: resolvedScheduledDate,
        scheduledTime: resolvedScheduledTime,
      })

      if (slot.doseCountPerIntake >= SCAN_CONFIG.HIGH_DOSE_WARNING_COUNT) {
        hasHighDoseWarning = true
      }
    }

    setItems(results)
    setScanUnavailableState(results.length === 0 ? blockedScanState : null)
    setHighDoseWarning(hasHighDoseWarning)
    setSelectedSlotId(prev => {
      if (results.length === 0) return null
      return prev && results.some(item => item.slotId === prev) ? prev : results[0].slotId
    })
    setLoadingItems(false)
    return results
  }, [forcedMedicationId, requestedDate, requestedScheduleId, scheduledTime])

  useEffect(() => {
    loadVerifiableItems()
    getSettings().then(s => setDevMode(s.devMode === 1))
  }, [loadVerifiableItems])

  const offerFallbackActions = useCallback((item: VerifiableItem) => {
    const canDirectComplete = item.reminderMode !== 'scan' || devMode
    const actions: Parameters<typeof Alert.alert>[2] = [
      { text: '다시 시도' },
      {
        text: '사유 선택',
        onPress: () => router.navigate(`/alarm?slotId=${item.slotId}`),
      },
    ]
    if (canDirectComplete) {
      actions.splice(1, 0, {
        text: item.reminderMode === 'scan' ? '개발자 직접 완료' : '직접 완료',
        onPress: async () => {
          const result = await completeMedicationSchedule(
            {
              medicationId: item.medicationId,
              scheduleId: item.slotId,
              scheduledDate: item.scheduledDate,
              scheduledTime: item.scheduledTime,
              method: 'manual',
            },
            item.reminderMode === 'scan' ? 'devManual' : undefined,
          )
          if (!result.success) {
            Alert.alert('오류', result.error ?? '인증 처리 중 오류가 발생했습니다')
            return
          }
          router.replace('/(tabs)/')
        },
      })
    }
    Alert.alert('인증에 어려움이 있으신가요?', '', actions)
  }, [devMode, router])

  const handleVerified = useCallback(async (confidence: number) => {
    if (verifyingRef.current) return
    const item = items.find(i => i.slotId === selectedSlotId) ?? items[0]
    if (!item) return

    verifyingRef.current = true
    try {
      const result = await completeMedicationSchedule({
        medicationId: item.medicationId,
        scheduleId: item.slotId,
        scheduledDate: item.scheduledDate,
        scheduledTime: item.scheduledTime,
        method: 'scan',
      })
      if (!result.success) {
        throw new Error(result.error ?? '인증 처리 중 오류가 발생했습니다')
      }
      if (result.freezeAcquired) {
        setFreezePopup({ visible: true, streak: result.currentStreak })
      }

      const freshItems = await loadVerifiableItems()
      const remaining = freshItems.filter(i => i.slotId !== item.slotId)
      if (remaining.length === 0) {
        Alert.alert('현재 모든 알약을 인증하셨습니다!', '', [
          { text: '확인', onPress: () => router.replace('/(tabs)/') },
        ])
      } else {
        Alert.alert(
          `${item.medName} 인증 완료! (${(confidence * 100).toFixed(0)}%)`,
          '더 인증할 약이 있습니다. 계속하시겠어요?',
          [
            { text: '예', onPress: () => { verifyingRef.current = false } },
            { text: '아니요', onPress: () => router.replace('/(tabs)/') },
          ],
        )
        return
      }
    } catch (e) {
      Alert.alert('오류', e instanceof Error ? e.message : '인증 처리 중 오류가 발생했습니다')
    }
    verifyingRef.current = false
  }, [items, selectedSlotId, loadVerifiableItems, router])

  const currentItem = items.find(i => i.slotId === selectedSlotId) ?? items[0]

  if (requestedScanTest) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <PillScanner
          key={testKey}
          medicationName="스캔 테스트"
          onClose={() => router.back()}
          onVerified={(confidence) => setTestConfidence(confidence)}
          canSimulate
        />
        {testConfidence !== null && (
          <View style={s.remeasureOverlay}>
            <Text style={s.remeasureResult}>
              감지 신뢰도 {(testConfidence * 100).toFixed(0)}%
            </Text>
            <TouchableOpacity
              style={s.remeasureBtn}
              onPress={() => {
                setTestConfidence(null)
                setTestKey(k => k + 1)
              }}
            >
              <Text style={s.remeasureBtnTxt}>재측정</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    )
  }

  if (loadingItems) {
    return (
      <View style={s.root}>
        <View style={s.unavailableCard}>
          <ActivityIndicator color={designHarness.colors.warningBright} />
          <Text style={s.unavailableTitle}>스캔 준비 중입니다</Text>
        </View>
      </View>
    )
  }

  if (!currentItem) {
    const copy = scanUnavailableCopy(scanUnavailableState)
    return (
      <View style={s.root}>
        <View style={s.unavailableCard}>
          <Text style={s.unavailableTitle}>{copy.title}</Text>
          <Text style={s.unavailableBody}>{copy.body}</Text>
          <TouchableOpacity style={s.unavailablePrimary} onPress={() => router.replace('/(tabs)/')}>
            <Text style={s.unavailablePrimaryText}>홈으로</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.unavailableSecondary} onPress={() => router.back()}>
            <Text style={s.unavailableSecondaryText}>닫기</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <View style={s.root}>
      <PillScanner
        key={selectedSlotId ?? 'no-item'}
        medicationName={currentItem?.medName ?? '알약'}
        onClose={() => router.back()}
        onVerified={handleVerified}
        canSimulate={devMode}
      />

      {items.length > 1 && (
        <View style={s.chipList}>
          <FlatList
            data={items}
            keyExtractor={i => i.slotId}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  s.chip,
                  { borderColor: item.color },
                  item.slotId === selectedSlotId && { backgroundColor: item.color },
                ]}
                onPress={() => setSelectedSlotId(item.slotId)}
              >
                <Text style={[s.chipTxt, item.slotId === selectedSlotId && { color: '#fff' }]}>
                  💊
                </Text>
                <Text
                  style={[s.chipName, item.slotId === selectedSlotId && { color: '#fff' }]}
                  numberOfLines={2}
                >
                  {item.medName}
                </Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {highDoseWarning && (
        <View style={s.warnBanner}>
          <Text style={s.warnTxt}>스캔 정확도가 낮아질 수 있습니다</Text>
        </View>
      )}

      {currentItem && (
        <TouchableOpacity
          style={s.fallbackBtn}
          onPress={() => offerFallbackActions(currentItem)}
        >
          <Text style={s.fallbackBtnTxt}>인증 어려움</Text>
        </TouchableOpacity>
      )}

      <FreezeAcquiredPopup
        visible={freezePopup.visible}
        currentStreak={freezePopup.streak}
        onClose={() => setFreezePopup({ visible: false, streak: 0 })}
      />
    </View>
  )
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: designHarness.colors.black,
  },
  scannerFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 14,
  },
  scannerFallbackTitle: {
    color: designHarness.colors.white,
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  scannerFallbackBody: {
    color: designHarness.colors.borderMuted,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  scannerFallbackPrimary: {
    backgroundColor: designHarness.colors.white,
    borderRadius: 999,
    marginTop: 8,
    paddingHorizontal: 26,
    paddingVertical: 12,
  },
  scannerFallbackPrimaryText: {
    color: designHarness.colors.black,
    fontSize: 15,
    fontWeight: '900',
  },
  scannerFallbackSecondary: {
    borderColor: designHarness.colors.overlaySoft,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 22,
    paddingVertical: 10,
  },
  scannerFallbackSecondaryText: {
    color: designHarness.colors.white,
    fontSize: 14,
    fontWeight: '800',
  },
  unavailableCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 14,
  },
  unavailableTitle: {
    color: designHarness.colors.white,
    fontSize: 22,
    fontWeight: '900',
    textAlign: 'center',
  },
  unavailableBody: {
    color: designHarness.colors.borderMuted,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
    textAlign: 'center',
  },
  unavailablePrimary: {
    backgroundColor: designHarness.colors.white,
    borderRadius: 999,
    marginTop: 8,
    paddingHorizontal: 26,
    paddingVertical: 12,
  },
  unavailablePrimaryText: {
    color: designHarness.colors.black,
    fontSize: 15,
    fontWeight: '900',
  },
  unavailableSecondary: {
    borderColor: designHarness.colors.overlaySoft,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 22,
    paddingVertical: 10,
  },
  unavailableSecondaryText: {
    color: designHarness.colors.white,
    fontSize: 14,
    fontWeight: '800',
  },
  chipList: {
    position: 'absolute',
    right: 12,
    top: SCREEN_H * designHarness.scan.sideRailTopRatio,
    bottom: SCREEN_H * designHarness.scan.sideRailBottomRatio,
    width: 72,
  },
  chip: {
    borderWidth: 2,
    borderRadius: designHarness.radius.chip,
    padding: 8,
    marginBottom: 8,
    alignItems: 'center',
    gap: 4,
  },
  chipTxt: { fontSize: 18, color: designHarness.colors.white },
  chipName: { fontSize: 10, color: designHarness.colors.borderMuted, textAlign: 'center' },
  warnBanner: {
    position: 'absolute',
    top: 56,
    alignSelf: 'center',
    backgroundColor: designHarness.colors.overlaySoft,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  warnTxt: {
    color: designHarness.colors.warningBright,
    fontSize: designHarness.typography.captionSize,
    fontWeight: '600',
  },
  fallbackBtn: {
    position: 'absolute',
    bottom: designHarness.scan.bottomBarOffset + 100,
    alignSelf: 'center',
    backgroundColor: designHarness.colors.overlaySoft,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  fallbackBtnTxt: {
    color: designHarness.colors.white,
    fontSize: 13,
    fontWeight: '700',
  },
  remeasureOverlay: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 16,
  },
  remeasureResult: {
    color: '#4ade80',
    fontSize: 18,
    fontWeight: '800',
  },
  remeasureBtn: {
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 36,
    paddingVertical: 14,
  },
  remeasureBtnTxt: {
    color: '#111',
    fontSize: 16,
    fontWeight: '900',
  },
})
