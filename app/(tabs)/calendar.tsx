import React, { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { CalendarView } from '@/components/CalendarView'
import { designHarness } from '@/design/designHarness'
import { useCalendarHub } from '@/hooks/useCalendarHub'
import { useI18n } from '@/hooks/useI18n'
import { fmtTime } from '@/utils/timeUtils'
import { getLocalDateKey } from '@/utils/dateUtils'

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function formatTimeLabel(value: string, amLabel: string, pmLabel: string) {
  const hour = Number(value.slice(11, 13))
  const minute = Number(value.slice(14, 16))
  return fmtTime(hour, minute, { am: amLabel, pm: pmLabel })
}

export default function CalendarScreen() {
  const now = new Date()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { copy } = useI18n()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [selectedDay, setSelectedDay] = useState(getLocalDateKey())
  const { records, stateLogs, rewardTransactions, wallet, streak, loading } = useCalendarHub(year, month)

  const colorMap = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    for (const record of records) {
      map[record.medicationId ?? `name:${record.medicationName}`] = '#F6A122'
    }
    return map
  }, [records])

  const monthLabel = `${year}.${pad(month)}`

  const timelineItems = useMemo(() => {
    const checkEvents = records
      .filter(record => record.dayKey === selectedDay)
      .map(record => ({
        id: record.id,
        time: record.scheduledTime,
        label: record.status === 'completed' || record.status === 'frozen'
          ? '체크 완료'
          : record.status === 'missed'
            ? '체크 놓침'
            : record.status === 'skipped'
              ? '체크 건너뜀'
              : '체크 대기',
        tone: record.status === 'completed' || record.status === 'frozen'
          ? 'complete'
          : record.status === 'missed'
            ? 'missed'
            : 'pending',
      }))

    const stateEvents = stateLogs
      .filter(log => log.dayKey === selectedDay)
      .map(log => ({
        id: log.id,
        time: log.createdAt,
        label: `${log.mood} 컨디션 ${log.condition === 'low' ? '낮음' : log.condition === 'good' ? '좋음' : '보통'}`,
        tone: 'state',
      }))

    const rewardEvents = rewardTransactions
      .filter(transaction => transaction.dayKey === selectedDay && transaction.amount > 0)
      .map(transaction => ({
        id: transaction.id,
        time: transaction.createdAt,
        label: `+${transaction.amount} 젤리 · ${transaction.kind === 'state_log' ? '상태 기록' : transaction.kind === 'streak_bonus' ? '연속 체크' : '체크 완료'}`,
        tone: 'reward',
      }))

    return [...checkEvents, ...stateEvents, ...rewardEvents]
      .sort((left, right) => left.time.localeCompare(right.time))
  }, [records, rewardTransactions, selectedDay, stateLogs])

  const prevMonth = () => {
    if (month === 1) {
      setYear(current => current - 1)
      setMonth(12)
    } else {
      setMonth(current => current - 1)
    }
  }

  const nextMonth = () => {
    if (month === 12) {
      setYear(current => current + 1)
      setMonth(1)
    } else {
      setMonth(current => current + 1)
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={designHarness.colors.warning} />
      </View>
    )
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 40 }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>캘린더</Text>

      <View style={styles.summaryCard}>
        <View style={styles.summaryHeader}>
          <View>
            <Text style={styles.summaryEyebrow}>루틴 요약</Text>
            <Text style={styles.summaryBalance}>젤리 {wallet?.balance ?? 0}개</Text>
            <Text style={styles.summarySub}>오늘 +{wallet?.todayEarned ?? 0}</Text>
            <Text style={styles.summaryStreak}>{streak?.currentStreak ?? 0}일 연속 체크 중</Text>
          </View>
          <TouchableOpacity style={styles.summaryButton} onPress={() => router.push('/rewards')}>
            <Text style={styles.summaryButtonText}>보상 보기</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.calendarCard}>
        <View style={styles.monthNav}>
          <TouchableOpacity style={styles.navButton} onPress={prevMonth}>
            <Text style={styles.navButtonText}>{'<'}</Text>
          </TouchableOpacity>
          <Text style={styles.monthLabel}>{monthLabel}</Text>
          <TouchableOpacity style={styles.navButton} onPress={nextMonth}>
            <Text style={styles.navButtonText}>{'>'}</Text>
          </TouchableOpacity>
        </View>

        <CalendarView
          year={year}
          month={month}
          records={records}
          colorMap={colorMap}
          onDayPress={setSelectedDay}
          selectedDay={selectedDay}
        />
      </View>

      <View style={styles.timelineCard}>
        <View style={styles.timelineHeader}>
          <Text style={styles.sectionTitle}>선택한 날</Text>
          <Text style={styles.timelineDate}>{selectedDay}</Text>
        </View>

        {timelineItems.length === 0 ? (
          <Text style={styles.emptyText}>이 날의 기록이 없어요</Text>
        ) : (
          timelineItems.map(item => (
            <View key={item.id} style={styles.timelineRow}>
              <Text style={styles.timelineTime}>{formatTimeLabel(item.time, copy.amLabel, copy.pmLabel)}</Text>
              <View
                style={[
                  styles.timelineDot,
                  item.tone === 'complete' && styles.timelineDotComplete,
                  item.tone === 'missed' && styles.timelineDotMissed,
                  item.tone === 'reward' && styles.timelineDotReward,
                ]}
              />
              <Text style={styles.timelineLabel}>{item.label}</Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.streakCard}>
        <View style={styles.streakRow}>
          <Text style={styles.streakLabel}>연속 체크 {streak?.currentStreak ?? 0}일</Text>
          <Text style={styles.streakValue}>최고 {streak?.longestStreak ?? 0}일</Text>
        </View>
        <View style={styles.streakRow}>
          <Text style={styles.streakLabel}>Freeze {streak?.freezeCount ?? 0}개</Text>
          <TouchableOpacity style={styles.inlineButton} onPress={() => router.push('/rewards')}>
            <Text style={styles.inlineButtonText}>크레인 하기</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: designHarness.colors.pageBackground,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    paddingHorizontal: 24,
    gap: 16,
  },
  title: {
    fontSize: 40,
    lineHeight: 44,
    fontWeight: '800',
    color: designHarness.colors.textStrong,
    marginBottom: 6,
  },
  summaryCard: {
    borderRadius: 30,
    padding: 22,
    backgroundColor: '#FFF3DF',
    borderWidth: 1,
    borderColor: '#F2D4A8',
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  summaryEyebrow: {
    fontSize: 13,
    fontWeight: '700',
    color: designHarness.colors.textMuted,
  },
  summaryBalance: {
    marginTop: 4,
    fontSize: 30,
    fontWeight: '800',
    color: designHarness.colors.textStrong,
  },
  summarySub: {
    marginTop: 6,
    fontSize: 14,
    color: designHarness.colors.textMuted,
  },
  summaryStreak: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: '700',
    color: designHarness.colors.textStrong,
  },
  summaryButton: {
    alignSelf: 'flex-start',
    minHeight: 42,
    borderRadius: 16,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: designHarness.colors.warning,
  },
  summaryButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: designHarness.colors.white,
  },
  calendarCard: {
    borderRadius: 30,
    backgroundColor: designHarness.colors.surface,
    padding: 20,
    gap: 18,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: designHarness.colors.surfaceSoft,
  },
  navButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: designHarness.colors.textStrong,
  },
  monthLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: designHarness.colors.textStrong,
  },
  timelineCard: {
    borderRadius: 30,
    backgroundColor: designHarness.colors.surface,
    padding: 20,
    gap: 14,
  },
  timelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: designHarness.colors.textStrong,
  },
  timelineDate: {
    fontSize: 14,
    fontWeight: '700',
    color: designHarness.colors.textMuted,
  },
  emptyText: {
    fontSize: 14,
    color: designHarness.colors.textMuted,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  timelineTime: {
    width: 74,
    fontSize: 13,
    fontWeight: '700',
    color: designHarness.colors.textMuted,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#F5A623',
  },
  timelineDotComplete: {
    backgroundColor: '#2DB073',
  },
  timelineDotMissed: {
    backgroundColor: '#E05A47',
  },
  timelineDotReward: {
    backgroundColor: '#F6A122',
  },
  timelineLabel: {
    flex: 1,
    fontSize: 15,
    color: designHarness.colors.textStrong,
  },
  streakCard: {
    borderRadius: 30,
    backgroundColor: designHarness.colors.surface,
    padding: 20,
    gap: 12,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  streakLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: designHarness.colors.textStrong,
  },
  streakValue: {
    fontSize: 14,
    color: designHarness.colors.textMuted,
  },
  inlineButton: {
    minHeight: 38,
    borderRadius: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF2D9',
  },
  inlineButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: designHarness.colors.warning,
  },
})