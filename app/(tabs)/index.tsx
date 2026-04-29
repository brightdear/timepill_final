import React, { useCallback, useRef, useState, useEffect, useMemo } from 'react'
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useAppInit } from '@frontend/hooks/useAppInit'
import { useTodayTimeslots } from '@frontend/hooks/useTodayTimeslots'
import { getSettings } from '@backend/settings/repository'
import { TimeslotRow } from '@frontend/components/TimeslotRow'
import { displayMedicationName } from '@shared/utils/displayName'
import { useFocusEffect } from '@react-navigation/native'
import type { TimeslotWithDose } from '@frontend/hooks/useTodayTimeslots'

export default function HomeScreen() {
  const router = useRouter()
  const { isReady, isBackfilling } = useAppInit()
  const { data, loading, refresh, totalSlotCount, dateStreak } = useTodayTimeslots()
  const [privateMode, setPrivateMode] = useState(false)
  const listRef = useRef<FlatList<TimeslotWithDose>>(null)
  const [showScrollUp, setShowScrollUp] = useState(false)
  const [, setClockTick] = useState(0)

  useFocusEffect(
    useCallback(() => {
      getSettings().then(s => setPrivateMode(s.privateMode === 1))
    }, []),
  )

  const prevIsReady = useRef(false)
  useEffect(() => {
    if (isReady && !prevIsReady.current) refresh()
    prevIsReady.current = isReady
  }, [isReady, refresh])

  useEffect(() => {
    if (!isReady) return
    const id = setInterval(() => setClockTick(t => t + 1), 30 * 1000)
    return () => clearInterval(id)
  }, [isReady])

  const sortedMedicationIds = useMemo(() => {
    const seen = new Map<string, string>()
    data.forEach(r => {
      if (r.medication && !seen.has(r.medication.id)) {
        seen.set(r.medication.id, r.medication.createdAt)
      }
    })
    return [...seen.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id]) => id)
  }, [data])

  const getPrivateIndex = useCallback(
    (medicationId: string | undefined, fallback: number) => {
      const idx = sortedMedicationIds.indexOf(medicationId ?? '')
      return idx >= 0 ? idx : fallback
    },
    [sortedMedicationIds],
  )

  const handleVerify = useCallback((item: TimeslotWithDose) => {
    router.navigate(`/scan?slotId=${item.slot.id}`)
  }, [router])

  const handleEdit = useCallback(
    (slotId: string) => {
      const editLoadKey = Date.now().toString()
      router.navigate(`/(tabs)/register?slotId=${encodeURIComponent(slotId)}&editLoadKey=${editLoadKey}`)
    },
    [router],
  )

  if (!isReady || loading) {
    return (
      <View style={s.root}>
        <View style={s.center}>
          {isBackfilling ? (
            <>
              <ActivityIndicator size="large" color="#111" />
              <Text style={s.backfillTxt}>지난 날들의 내역을 불러오는 중입니다</Text>
            </>
          ) : (
            <ActivityIndicator size="large" color="#111" />
          )}
        </View>
      </View>
    )
  }

  return (
    <View style={s.root}>
      <FlatList
        ref={listRef}
        data={data}
        keyExtractor={item => item.slot.id}
        contentContainerStyle={s.list}
        onScroll={e => setShowScrollUp(e.nativeEvent.contentOffset.y > 60)}
        scrollEventThrottle={100}
        ListHeaderComponent={
          <View>
            <Text style={s.appName}>Timepill</Text>
            {dateStreak.current > 0 && (
              <View style={s.streakChip}>
                <Text style={s.streakChipTxt}>🔥 {dateStreak.current}일 연속</Text>
                {dateStreak.longest > 0 && (
                  <Text style={s.streakChipBest}>최고 {dateStreak.longest}일</Text>
                )}
              </View>
            )}
            <Text style={s.sectionTitle}>오늘 알람</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyTxt}>
              {totalSlotCount === 0 ? '등록된 슬롯이 없습니다' : '오늘 복용할 약이 없습니다'}
            </Text>
            {totalSlotCount === 0 && (
              <TouchableOpacity
                style={s.addBtn}
                onPress={() => router.navigate('/(tabs)/register')}
              >
                <Text style={s.addBtnTxt}>약 등록하기</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        renderItem={({ item, index }) => (
          <TimeslotRow
            item={item}
            index={index}
            onRefresh={refresh}
            onEdit={handleEdit}
            onVerify={handleVerify}
            privateMode={privateMode}
            privateIndex={getPrivateIndex(item.medication?.id, index)}
          />
        )}
      />
      {showScrollUp && (
        <TouchableOpacity
          style={s.scrollUpBtn}
          onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
        >
          <Text style={s.scrollUpTxt}>↑</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f9f9f9' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  backfillTxt: { fontSize: 14, color: '#888', textAlign: 'center', marginTop: 8 },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111',
    paddingTop: 64,
    paddingBottom: 16,
  },
  streakChip: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'flex-start',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  streakChipTxt: { fontSize: 15, color: '#f59e0b', fontWeight: '700' },
  streakChipBest: { fontSize: 12, color: '#aaa' },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#aaa',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  empty: { alignItems: 'center', paddingTop: 60, gap: 16 },
  emptyTxt: { fontSize: 16, color: '#aaa' },
  addBtn: {
    backgroundColor: '#111',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  addBtnTxt: { fontSize: 15, fontWeight: '600', color: '#fff' },
  scrollUpBtn: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    backgroundColor: '#111',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  scrollUpTxt: { color: '#fff', fontSize: 18, fontWeight: '700' },
})
