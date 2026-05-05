import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { and, eq } from 'drizzle-orm'
import { db } from '@/db/client'
import { doseRecords, medications, timeSlots } from '@/db/schema'
import { completeVerification } from '@/hooks/useStreakUpdate'
import { isVerifiable } from '@/hooks/useTodayTimeslots'
import { RealtimePillScanner } from '@/components/scan/RealtimePillScanner'
import { getLocalDateKey } from '@/utils/dateUtils'

interface VerifiableItem {
  slotId: string
  doseRecordId: string
  medName: string
  doseCount: number
  color: string
}

export default function ScanScreen() {
  const { slotId: requestedSlotId, test } = useLocalSearchParams<{ slotId?: string; test?: string }>()
  const router = useRouter()
  const verifyingRef = useRef(false)
  const isTestMode = test === '1' || test === 'true'

  const [loading, setLoading] = useState(true)
  const [verifying, setVerifying] = useState(false)
  const [currentItem, setCurrentItem] = useState<VerifiableItem | null>(null)

  const loadVerifiableItems = useCallback(async (): Promise<VerifiableItem[]> => {
    const todayKey = getLocalDateKey()
    const allSlots = await db.select().from(timeSlots)
    const results: VerifiableItem[] = []

    for (const slot of allSlots) {
      if (requestedSlotId && slot.id !== requestedSlotId) continue
      if (slot.isActive === 0) continue

      const record = await db.select().from(doseRecords)
        .where(and(eq(doseRecords.timeSlotId, slot.id), eq(doseRecords.dayKey, todayKey)))
        .get()
      if (!isVerifiable(slot, record ?? null) || !record) continue

      const medication = await db.select().from(medications)
        .where(eq(medications.id, slot.medicationId))
        .get()

      results.push({
        slotId: slot.id,
        doseRecordId: record.id,
        medName: medication?.name ?? '알약',
        doseCount: slot.doseCountPerIntake,
        color: medication?.color ?? '#888',
      })
    }

    return results
  }, [requestedSlotId])

  const openFirstVerifiableItem = useCallback(async () => {
    setLoading(true)
    try {
      const items = await loadVerifiableItems()
      const firstItem = items[0] ?? null
      setCurrentItem(firstItem)

      if (!firstItem) {
        Alert.alert('인증 가능한 약이 없습니다', '현재 복용 인증 가능한 시간이 아닙니다', [
          { text: '확인', onPress: () => router.back() },
        ])
      }
    } catch (error) {
      Alert.alert('오류', error instanceof Error ? error.message : '인증 정보를 불러오지 못했습니다', [
        { text: '확인', onPress: () => router.back() },
      ])
    } finally {
      setLoading(false)
    }
  }, [loadVerifiableItems, router])

  useEffect(() => {
    if (isTestMode) {
      setLoading(false)
      setCurrentItem(null)
      return
    }
    openFirstVerifiableItem()
  }, [isTestMode, openFirstVerifiableItem])

  const handleVerified = useCallback(async (confidence: number) => {
    if (!currentItem || verifyingRef.current) return

    verifyingRef.current = true
    setVerifying(true)

    const verifiedItem = currentItem
    setCurrentItem(null)

    try {
      const { freezeAcquired } = await completeVerification(
        verifiedItem.doseRecordId,
        verifiedItem.slotId,
        'scan',
      )
      const remainingItems = await loadVerifiableItems()

      if (remainingItems.length === 0) {
        Alert.alert(
          '복용 인증 완료',
          freezeAcquired ? '프리즈를 획득했어요' : '오늘 가능한 인증을 완료했어요',
          [{ text: '확인', onPress: () => router.navigate('/(tabs)/') }],
        )
        return
      }

      Alert.alert(
        `${verifiedItem.medName} 인증 완료`,
        `감지 신뢰도 ${(confidence * 100).toFixed(0)}%. 다음 인증할 약이 있습니다.`,
        [
          { text: '계속', onPress: () => setCurrentItem(remainingItems[0]) },
          { text: '닫기', onPress: () => router.navigate('/(tabs)/') },
        ],
      )
    } catch (error) {
      Alert.alert('오류', error instanceof Error ? error.message : '인증 처리 중 오류가 발생했습니다')
      setCurrentItem(verifiedItem)
    } finally {
      verifyingRef.current = false
      setVerifying(false)
    }
  }, [currentItem, loadVerifiableItems, router])

  const handleTestVerified = useCallback((confidence: number) => {
    Alert.alert(
      '스캔 테스트 완료',
      `감지 신뢰도 ${(confidence * 100).toFixed(0)}%`,
      [{ text: '확인' }],
    )
  }, [])

  if (isTestMode) {
    return (
      <RealtimePillScanner
        medicationName="스캔 테스트"
        onClose={() => router.back()}
        onVerified={handleTestVerified}
      />
    )
  }

  if (loading || verifying || !currentItem) {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#fff" />
        <Text style={s.statusText}>
          {verifying ? '인증 처리 중입니다' : '스캔 화면을 준비하고 있습니다'}
        </Text>
        {!loading && !verifying ? (
          <TouchableOpacity style={s.closeButton} onPress={() => router.back()}>
            <Text style={s.closeButtonText}>닫기</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    )
  }

  return (
    <RealtimePillScanner
      medicationName={currentItem.medName}
      onClose={() => router.back()}
      onVerified={handleVerified}
    />
  )
}

const s = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
    padding: 24,
    gap: 14,
  },
  statusText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  closeButton: {
    minWidth: 96,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: '#fff',
    marginTop: 8,
  },
  closeButtonText: {
    color: '#111',
    fontSize: 15,
    fontWeight: '800',
  },
})
