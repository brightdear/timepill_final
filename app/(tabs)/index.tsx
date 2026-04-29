import React, { useCallback, useRef, useState, useEffect, useMemo } from 'react'
import {
  View,
  Text,
  FlatList,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useFocusEffect } from '@react-navigation/native'
import { useAppInit } from '@/hooks/useAppInit'
import { useTodayTimeslots } from '@/hooks/useTodayTimeslots'
import { getSettings } from '@/domain/settings/repository'
import { TimeslotRow } from '@/components/TimeslotRow'
import { displayMedicationName } from '@/utils/displayName'
import { FreezePopup } from '@/components/FreezePopup'
import type { TimeslotWithDose } from '@/hooks/useTodayTimeslots'

export default function HomeScreen() {
  const router = useRouter()
  const { isReady, isBackfilling, freezeEligibleSlots, confirmFreeze } = useAppInit()
  const { data, loading, refresh, totalSlotCount } = useTodayTimeslots()
  const [privateMode, setPrivateMode] = useState(false)
  const [freezesRemaining, setFreezesRemaining] = useState(0)
  const listRef = useRef<FlatList<TimeslotWithDose>>(null)
  const [showScrollUp, setShowScrollUp] = useState(false)
  const [, setClockTick] = useState(0)

  // Reload settings on every focus (catches privateMode changes made in the settings tab)
  useFocusEffect(
    useCallback(() => {
      getSettings().then(s => {
        setPrivateMode(s.privateMode === 1)
        setFreezesRemaining(s.freezesRemaining)
      })
    }, []),
  )

  // Also reload when freeze eligibility changes while on this screen
  useEffect(() => {
    if (freezeEligibleSlots.length === 0) return
    getSettings().then(s => setFreezesRemaining(s.freezesRemaining))
  }, [freezeEligibleSlots])

  // Sorted medication list for stable private-mode indices (알약1, 알약2...)
  const sortedMedicationIds = useMemo(() => {
    const seen = new Map<string, string>() // id → createdAt
    data.forEach(r => {
      if (r.medication && !seen.has(r.medication.id)) {
        seen.set(r.medication.id, r.medication.createdAt)
      }
    })
    return [...seen.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id]) => id)
  }, [data])

  const prevIsReady = useRef(false)
  useEffect(() => {
    if (isReady && !prevIsReady.current) refresh()
    prevIsReady.current = isReady
  }, [isReady, refresh])

  useEffect(() => {
    if (!isReady) return
    // Re-render periodically so the verify button updates as the time window opens/closes.
    const id = setInterval(() => setClockTick(t => t + 1), 30 * 1000)
    return () => clearInterval(id)
  }, [isReady])

  // Private labels must be stable per medication, not per visible row order.
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

  const freezePopup = (
    <FreezePopup
      visible={freezeEligibleSlots.length > 0}
      slots={freezeEligibleSlots}
      freezesRemaining={freezesRemaining}
      onConfirm={confirmFreeze}
      onDismiss={() => confirmFreeze([])}
    />
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
        {/* Keep the popup mounted while init is paused waiting for a freeze decision. */}
        {freezePopup}
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
            {/* Streak summary chips */}
            {data.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={s.streakBar}
                contentContainerStyle={{ gap: 8, paddingRight: 8 }}
              >
                {data
                  .filter(r => r.streak && r.streak.currentStreak > 0)
                  .map(r => (
                    <View key={r.slot.id} style={s.streakChip}>
                      <View style={s.streakChipNums}>
                        <Text style={s.streakChipTxt}>
                          🔥 {r.streak?.currentStreak}일
                        </Text>
                        {(r.streak?.longestStreak ?? 0) > 0 && (
                          <Text style={s.streakChipBest}>
                            최고 {r.streak?.longestStreak}일
                          </Text>
                        )}
                        {r.completionRate !== null && (
                          <Text style={s.streakChipRate}>
                            {Math.round(r.completionRate * 100)}%
                          </Text>
                        )}
                      </View>
                      <Text style={s.streakChipName} numberOfLines={1}>
                        {displayMedicationName(r.medication?.name ?? '', getPrivateIndex(r.medication?.id, 0), privateMode)}
                      </Text>
                    </View>
                  ))}
              </ScrollView>
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

      {freezePopup}
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
  streakBar: { marginBottom: 16 },
  streakChip: {
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  streakChipNums: { alignItems: 'flex-start' },
  streakChipTxt: { fontSize: 14, color: '#f59e0b', fontWeight: '700' },
  streakChipBest: { fontSize: 11, color: '#aaa', marginTop: 1 },
  streakChipRate: { fontSize: 11, color: '#60a5fa', marginTop: 1 },
  streakChipName: { fontSize: 13, color: '#444', maxWidth: 80 },
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
