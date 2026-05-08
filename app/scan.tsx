import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert,
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { db } from '@/db/client'
import { doseRecords, timeSlots, medications } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { completeVerification } from '@/hooks/useStreakUpdate'
import { getSettings } from '@/domain/settings/repository'
import { FreezeAcquiredPopup } from '@/components/FreezeAcquiredPopup'
import { getLocalDateKey } from '@/utils/dateUtils'
import { SCAN_CONFIG } from '@/constants/scanConfig'
import { isVerifiable } from '@/hooks/useTodayTimeslots'
import { RealtimePillScanner } from '@/components/scan/RealtimePillScanner'
import { designHarness } from '@/design/designHarness'

const { height: SCREEN_H } = Dimensions.get('window')

interface VerifiableItem {
  slotId: string
  medicationId: string
  doseRecordId: string
  medName: string
  doseCount: number
  color: string
  reminderMode: 'off' | 'notify' | 'scan'
}

export default function ScanScreen() {
  const { slotId: forcedSlotId, test } = useLocalSearchParams<{ slotId?: string; test?: string }>()
  const router = useRouter()
  const verifyingRef = useRef(false)
  const [items, setItems] = useState<VerifiableItem[]>([])
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null)
  const [freezePopup, setFreezePopup] = useState<{ visible: boolean; streak: number }>({
    visible: false,
    streak: 0,
  })
  const [devMode, setDevMode] = useState(false)
  const [highDoseWarning, setHighDoseWarning] = useState(false)
  const requestedScanTest = test === '1' || test === 'true'

  const loadVerifiableItems = useCallback(async (): Promise<VerifiableItem[]> => {
    const todayKey = getLocalDateKey()
    const [allSlots, todayRecords, allMedications] = await Promise.all([
      db.select().from(timeSlots),
      db.select().from(doseRecords).where(eq(doseRecords.dayKey, todayKey)),
      db.select().from(medications),
    ])
    const todayRecordMap = new Map(
      todayRecords.map(record => [record.reminderTimeId ?? record.timeSlotId ?? '', record]),
    )
    const medicationMap = new Map(allMedications.map(m => [m.id, m]))
    const results: VerifiableItem[] = []
    let hasHighDoseWarning = false

    for (const slot of allSlots) {
      if (forcedSlotId && slot.id !== forcedSlotId) continue
      if (slot.isActive === 0) continue

      const dr = todayRecordMap.get(slot.id) ?? null
      if (!isVerifiable(slot, dr ?? null)) continue

      const med = medicationMap.get(slot.medicationId)

      results.push({
        slotId: slot.id,
        medicationId: med?.id ?? '',
        doseRecordId: dr!.id,
        medName: med?.name ?? '?',
        doseCount: slot.doseCountPerIntake,
        color: med?.color ?? '#888',
        reminderMode: slot.reminderMode === 'off' || slot.reminderMode === 'scan' ? slot.reminderMode : 'notify',
      })

      if (slot.doseCountPerIntake >= SCAN_CONFIG.HIGH_DOSE_WARNING_COUNT) {
        hasHighDoseWarning = true
      }
    }

    setItems(results)
    setHighDoseWarning(hasHighDoseWarning)
    setSelectedSlotId(prev => {
      if (results.length === 0) return null
      return prev && results.some(item => item.slotId === prev) ? prev : results[0].slotId
    })
    return results
  }, [forcedSlotId])

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
          await completeVerification(
            item.doseRecordId,
            item.slotId,
            'manual',
            item.reminderMode === 'scan' ? 'devManual' : undefined,
          )
          router.navigate('/(tabs)/')
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
      const { freezeAcquired, currentStreak } = await completeVerification(
        item.doseRecordId,
        item.slotId,
        'scan',
      )
      if (freezeAcquired) {
        setFreezePopup({ visible: true, streak: currentStreak })
      }

      const freshItems = await loadVerifiableItems()
      const remaining = freshItems.filter(i => i.slotId !== item.slotId)
      if (remaining.length === 0) {
        Alert.alert('현재 모든 알약을 인증하셨습니다!', '', [
          { text: '확인', onPress: () => router.navigate('/(tabs)/') },
        ])
      } else {
        Alert.alert(
          `${item.medName} 인증 완료! (${(confidence * 100).toFixed(0)}%)`,
          '더 인증할 약이 있습니다. 계속하시겠어요?',
          [
            { text: '예', onPress: () => { verifyingRef.current = false } },
            { text: '아니요', onPress: () => router.navigate('/(tabs)/') },
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
      <RealtimePillScanner
        medicationName="스캔 테스트"
        onClose={() => router.back()}
        onVerified={(confidence) =>
          Alert.alert('스캔 테스트 완료', `감지 신뢰도 ${(confidence * 100).toFixed(0)}%`, [
            { text: '확인' },
          ])
        }
      />
    )
  }

  return (
    <View style={s.root}>
      <RealtimePillScanner
        key={selectedSlotId ?? 'no-item'}
        medicationName={currentItem?.medName ?? '알약'}
        onClose={() => router.back()}
        onVerified={handleVerified}
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
})
