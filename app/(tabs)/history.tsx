import React, { useState, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { CalendarView } from '@frontend/components/CalendarView'
import { useMonthlyRecords } from '@frontend/hooks/useMonthlyRecords'
import { deleteDoseRecord } from '@backend/doseRecord/repository'
import { getSettings } from '@backend/settings/repository'
import { displayMedicationName } from '@shared/utils/displayName'

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function doseLabel(status: string, targetDoseCount: number): string {
  switch (status) {
    case 'completed': return `${targetDoseCount}/${targetDoseCount} 복용`
    case 'missed':    return `0/${targetDoseCount} 복용`
    case 'pending':   return '대기 중'
    case 'skipped':   return '⏭️ 건너뜀'
    default:          return status
  }
}

function statusColor(status: string) {
  switch (status) {
    case 'completed': return '#22c55e'
    case 'missed':    return '#ef4444'
    case 'pending':   return '#f59e0b'
    default:          return '#999'
  }
}

export default function HistoryScreen() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [privateMode, setPrivateMode] = useState(false)

  useFocusEffect(
    useCallback(() => {
      getSettings().then(s => setPrivateMode(s.privateMode === 1))
    }, []),
  )

  const { records, medications, loading, reload } =
    useMonthlyRecords(year, month)

  const colorMap = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    for (const med of medications) {
      map[med.id] = med.color
    }
    for (const r of records) {
      if (!r.medicationId) {
        const key = `name:${r.medicationName}`
        if (!map[key]) map[key] = '#999'
      }
    }
    return map
  }, [medications, records])

  const prevMonth = useCallback(() => {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
    setSelectedDay(null)
  }, [month])

  const nextMonth = useCallback(() => {
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
    setSelectedDay(null)
  }, [month])

  const selectedRecords = useMemo(() => {
    if (!selectedDay) return []
    return records
      .filter(r => r.dayKey === selectedDay)
      .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime))
  }, [selectedDay, records])

  const handleDelete = useCallback(async (recordId: string, _timeSlotId: string | null) => {
    Alert.alert('기록 삭제', '이 기록을 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          await deleteDoseRecord(recordId)
          await reload()
        },
      },
    ])
  }, [reload])

  // Build a stable sorted medication list for consistent Private Mode indices
  const sortedMedications = useMemo(
    () => [...medications].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [medications],
  )

  const { overallRate, byMedRate } = useMemo(() => {
    const finished = records.filter(r => r.status !== 'pending')
    const total = finished.length
    const done = finished.filter(r => r.status === 'completed').length
    const overallRate = total > 0 ? Math.round((done / total) * 100) : null

    const medMap = new Map<string, { name: string; medId: string | null; done: number; total: number }>()
    for (const r of finished) {
      const key = r.medicationId ?? `name:${r.medicationName}`
      if (!medMap.has(key)) medMap.set(key, { name: r.medicationName, medId: r.medicationId, done: 0, total: 0 })
      const entry = medMap.get(key)!
      entry.total++
      if (r.status === 'completed') entry.done++
    }
    const byMedRate = Array.from(medMap.entries())
      .map(([key, e]) => {
        const medIndex = e.medId ? sortedMedications.findIndex(m => m.id === e.medId) : -1
        return {
          key,
          name: displayMedicationName(e.name, medIndex >= 0 ? medIndex : 0, privateMode),
          rate: Math.round((e.done / e.total) * 100),
        }
      })
      .sort((a, b) => b.rate - a.rate)

    return { overallRate, byMedRate }
  }, [records, sortedMedications, privateMode])

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.title}>기록</Text>

        <View style={s.monthNav}>
          <TouchableOpacity style={s.navBtn} onPress={prevMonth}>
            <Text style={s.navArrow}>{'<'}</Text>
          </TouchableOpacity>
          <Text style={s.monthLabel}>{year}.{pad(month)}</Text>
          <TouchableOpacity style={s.navBtn} onPress={nextMonth}>
            <Text style={s.navArrow}>{'>'}</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={s.loadingBox}>
            <ActivityIndicator color="#999" />
          </View>
        ) : (
          <CalendarView
            year={year}
            month={month}
            records={records}
            colorMap={colorMap}
            onDayPress={setSelectedDay}
            selectedDay={selectedDay}
          />
        )}

        <View style={s.divider} />

        <View style={s.section}>
          <Text style={s.sectionLabel}>이번 달 복용률</Text>
          {overallRate !== null ? (
            <Text style={s.bigRate}>{overallRate}%</Text>
          ) : (
            <Text style={s.emptyTxt}>기록 없음</Text>
          )}
        </View>

        {byMedRate.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionLabel}>약별 복용률</Text>
            {byMedRate.map(({ key, name, rate }) => (
              <View key={key} style={s.statRow}>
                <Text style={s.statName} numberOfLines={1}>{name}</Text>
                <View style={s.rateBar}>
                  <View style={[s.rateBarFill, { width: `${rate}%` }]} />
                </View>
                <Text style={s.statRate}>{rate}%</Text>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal
        visible={selectedDay !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedDay(null)}
      >
        <TouchableOpacity
          style={s.modalBackdrop}
          activeOpacity={1}
          onPress={() => setSelectedDay(null)}
        />
        <View style={s.modalSheet}>
          <View style={s.modalHandle} />
          <Text style={s.modalTitle}>{selectedDay}</Text>

          {selectedRecords.length === 0 ? (
            <Text style={s.emptyTxt}>이 날의 기록이 없습니다</Text>
          ) : (
            selectedRecords.map(r => {
              const medIndex = r.medicationId
                ? sortedMedications.findIndex(m => m.id === r.medicationId)
                : -1
              const displayName = displayMedicationName(
                r.medicationName,
                medIndex >= 0 ? medIndex : 0,
                privateMode,
              )
              return (
                <View key={r.id} style={s.recordRow}>
                  <View style={[s.statusDot, { backgroundColor: statusColor(r.status) }]} />
                  <View style={s.recordInfo}>
                    <Text style={s.recordName}>{displayName}</Text>
                    <Text style={s.recordDetail}>
                      {doseLabel(r.status, r.targetDoseCount)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={s.deleteBtn}
                    onPress={() => handleDelete(r.id, r.timeSlotId)}
                  >
                    <Text style={s.deleteTxt}>삭제</Text>
                  </TouchableOpacity>
                </View>
              )
            })
          )}

          <TouchableOpacity
            style={s.closeBtn}
            onPress={() => setSelectedDay(null)}
          >
            <Text style={s.closeTxt}>닫기</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  scroll: { paddingHorizontal: 20, paddingTop: 60 },
  title: { fontSize: 26, fontWeight: '700', color: '#111', marginBottom: 20 },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    gap: 24,
  },
  navBtn: { padding: 8 },
  navArrow: { fontSize: 20, color: '#555', fontWeight: '600' },
  monthLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111',
    minWidth: 80,
    textAlign: 'center',
  },
  loadingBox: { height: 300, justifyContent: 'center', alignItems: 'center' },
  divider: { height: 1, backgroundColor: '#f0f0f0', marginVertical: 20 },
  section: { marginBottom: 24 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  bigRate: { fontSize: 36, fontWeight: '800', color: '#111' },
  emptyTxt: { fontSize: 14, color: '#bbb', textAlign: 'center', paddingVertical: 12 },
  statRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
  statName: { fontSize: 14, color: '#333', width: 80 },
  rateBar: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#f0f0f0',
    overflow: 'hidden',
  },
  rateBarFill: { height: '100%', backgroundColor: '#22c55e', borderRadius: 4 },
  statRate: { fontSize: 13, color: '#555', fontWeight: '600', width: 36, textAlign: 'right' },
  streakRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  streakInfo: { gap: 2 },
  streakMed: { fontSize: 15, fontWeight: '600', color: '#222' },
  streakTime: { fontSize: 12, color: '#999' },
  streakNums: { alignItems: 'flex-end', gap: 2 },
  streakCurrent: { fontSize: 18, fontWeight: '700', color: '#111' },
  streakLongest: { fontSize: 12, color: '#999' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
    minHeight: 200,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ddd',
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111', marginBottom: 16 },
  recordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
    gap: 12,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  recordInfo: { flex: 1 },
  recordName: { fontSize: 15, fontWeight: '600', color: '#222' },
  recordDetail: { fontSize: 13, color: '#888', marginTop: 2 },
  deleteBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#fee2e2',
  },
  deleteTxt: { fontSize: 13, color: '#ef4444', fontWeight: '600' },
  closeBtn: {
    marginTop: 16,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeTxt: { fontSize: 15, fontWeight: '600', color: '#555' },
})
