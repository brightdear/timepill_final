import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Modal,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@/components/AppIcon'
import { AppToast } from '@/components/AppToast'
import { TAB_BAR_BASE_HEIGHT } from '@/components/layout/FloatingBottom'
import { StatusMascot } from '@/components/mascot/StatusMascot'
import { ScreenTopBar } from '@/components/ScreenTopBar'
import { MASCOT_STATUS_DETAILS, type MascotStatusKey } from '@/constants/mascotStatus'
import {
  CHECK_REWARD_BY_SOURCE,
  DAILY_COMPLETE_BONUS_JELLY,
  STATE_REWARD_DAILY_LIMIT,
  STATE_REWARD_JELLY,
} from '@/constants/rewards'
import { designHarness } from '@/design/designHarness'
import { awardStateLogReward } from '@/domain/reward/repository'
import { insertStateLog, updateStateLogReward } from '@/domain/stateLog/repository'
import { useCalendarHub } from '@/hooks/useCalendarHub'
import { getLocalDateKey } from '@/utils/dateUtils'
import { normalizeToastPayload, type ToastInput, type ToastPayload } from '@/utils/uiEvents'

type DayCompletionTone = 'empty' | 'complete' | 'partial' | 'missed' | 'pending'
type RecordMoodKey =
  | 'day_happy'
  | 'day_normal'
  | 'day_proud_of'
  | 'day_sad'
  | 'day_surprised'
  | 'day_soso'

type StateLevel = 'low' | 'medium' | 'good'

type CalendarDaySummary = {
  completionTone: DayCompletionTone
  medicationBars: Array<{ id: string; color: string; opacity: number }>
  moodKey: RecordMoodKey | null
  takenCount: number
  totalCount: number
}

type MedicationEventItem = {
  id: string
  completionMethod: string
  medicationName: string
  status: string
  time: string
}

type QuickStateDraft = {
  moodKey: RecordMoodKey | null
  condition: StateLevel
  focus: StateLevel
}

const DEFAULT_QUICK_STATE = {
  mood: 'normal',
  condition: 'normal',
  focus: 'normal',
} as const

const DAY_OF_WEEK_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const

const LEVEL_OPTIONS: Array<{ key: StateLevel; label: string }> = [
  { key: 'low', label: '낮음' },
  { key: 'medium', label: '보통' },
  { key: 'good', label: '좋음' },
]

const RECORD_MOOD_ORDER: RecordMoodKey[] = [
  'day_happy',
  'day_normal',
  'day_proud_of',
  'day_sad',
  'day_surprised',
  'day_soso',
]

const RECORD_MOOD_DETAILS: Record<RecordMoodKey, { label: string; mascotKey: MascotStatusKey }> = {
  day_happy: { label: '좋음', mascotKey: 'happy' },
  day_normal: { label: '보통', mascotKey: 'normal' },
  day_proud_of: { label: '뿌듯', mascotKey: 'proud' },
  day_sad: { label: '지침', mascotKey: 'sad' },
  day_surprised: { label: '놀람', mascotKey: 'surprised' },
  day_soso: { label: '소소', mascotKey: 'soso' },
}

const LEGACY_MOOD_MAP: Record<string, RecordMoodKey> = {
  day_happy: 'day_happy',
  day_normal: 'day_normal',
  day_proud_of: 'day_proud_of',
  day_sad: 'day_sad',
  day_surprised: 'day_surprised',
  day_soso: 'day_soso',
  happy: 'day_happy',
  normal: 'day_normal',
  proud: 'day_proud_of',
  sad: 'day_sad',
  surprised: 'day_surprised',
  soso: 'day_soso',
  '😄': 'day_happy',
  '🙂': 'day_normal',
  '😐': 'day_soso',
  '😔': 'day_sad',
  '😫': 'day_surprised',
}

const JELLY_HELP_ITEMS = [
  `복약 완료 시 ${CHECK_REWARD_BY_SOURCE.manual}젤리 획득`,
  `스캔 완료 시 최대 ${CHECK_REWARD_BY_SOURCE.scan}젤리 획득`,
  `하루 전체 복약 완료 시 추가 ${DAILY_COMPLETE_BONUS_JELLY}젤리`,
  `상태 기록은 하루 ${STATE_REWARD_DAILY_LIMIT}회까지 ${STATE_REWARD_JELLY}젤리`,
  '연속 복용과 이벤트 보상으로 추가 획득 가능',
]

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function toDateKey(year: number, month: number, day: number) {
  return `${year}-${pad(month)}-${pad(day)}`
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return { year, month, day }
}

function shiftDay(dateKey: string, amount: number) {
  const date = new Date(`${dateKey}T12:00:00`)
  date.setDate(date.getDate() + amount)
  return getLocalDateKey(date)
}

function monthLabel(year: number, month: number) {
  return `${year}년 ${month}월`
}

function selectedDateLabel(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00`)
  return `${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${DAY_OF_WEEK_LABELS[date.getDay()]}`
}

function timeLabel(value: string | null | undefined) {
  if (!value) return '--:--'
  if (/^\d{2}:\d{2}/.test(value)) return value.slice(0, 5)

  const match = value.match(/(\d{2}:\d{2})/)
  if (match) return match[1]

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function sortKeyForTime(value: string | null | undefined) {
  const label = timeLabel(value)
  return /^\d{2}:\d{2}$/.test(label) ? label : '00:00'
}

function levelLabel(value: StateLevel) {
  if (value === 'low') return '낮음'
  if (value === 'good') return '좋음'
  return '보통'
}

function normalizeLevel(value: string | null | undefined): StateLevel {
  if (value === 'low' || value === 'good') return value
  return 'medium'
}

function isCompletedStatus(status: string) {
  return status === 'completed' || status === 'frozen'
}

function normalizeMoodKey(value: string | null | undefined) {
  if (!value) return null
  return LEGACY_MOOD_MAP[value] ?? null
}

function completionTone(statuses: string[]): DayCompletionTone {
  if (statuses.length === 0) return 'empty'

  const completed = statuses.filter(isCompletedStatus).length
  const missed = statuses.filter(status => status === 'missed' || status === 'skipped').length

  if (completed === statuses.length) return 'complete'
  if (completed > 0) return 'partial'
  if (missed > 0) return 'missed'
  return 'pending'
}

function medicationBarOpacity(statuses: string[]) {
  const completed = statuses.filter(isCompletedStatus).length

  if (completed === statuses.length) return 1
  if (completed > 0) return 0.64
  if (statuses.some(status => status === 'missed' || status === 'skipped')) return 0.34
  return 0.18
}

function resolveSummaryBadge(tone: DayCompletionTone) {
  if (tone === 'missed') {
    return { label: '놓친 기록', surface: '#FBF0EB', text: '#C66843' }
  }

  if (tone === 'partial') {
    return { label: '일부 남음', surface: '#FFF6E7', text: '#C07B1A' }
  }

  if (tone === 'pending') {
    return { label: '남은 복약', surface: '#F1F3F5', text: '#6C7280' }
  }

  return null
}

function resolveMedicationStatusChip(status: string, verificationType: string) {
  if (status === 'completed' || status === 'frozen') {
    if (verificationType === 'scan') {
      return { label: 'SCAN', surface: '#EEF3FA', text: '#597FB1' }
    }

    return { label: 'O', surface: '#EEF8F2', text: '#3E8E6A' }
  }

  if (status === 'missed' || status === 'skipped') {
    return { label: 'X', surface: '#EFF0F2', text: '#6C7280' }
  }

  return { label: '예정', surface: '#F5F3EE', text: '#8A8F98' }
}

function buildQuickDraft(args?: {
  condition?: string | null
  focus?: string | null
  mood?: string | null
}): QuickStateDraft {
  const safeArgs = {
    ...DEFAULT_QUICK_STATE,
    ...(args ?? {}),
  }

  return {
    moodKey: normalizeMoodKey(safeArgs.mood),
    condition: normalizeLevel(safeArgs.condition),
    focus: normalizeLevel(safeArgs.focus),
  }
}

function CalendarGrid({
  year,
  month,
  daySummaries,
  selectedDay,
  onSelectDay,
}: {
  year: number
  month: number
  daySummaries: Map<string, CalendarDaySummary>
  selectedDay: string
  onSelectDay: (dayKey: string) => void
}) {
  const todayKey = getLocalDateKey()
  const daysInMonth = new Date(year, month, 0).getDate()
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay()

  const cells: Array<number | null> = [
    ...Array<null>(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1),
  ]

  while (cells.length % 7 !== 0) cells.push(null)

  const weeks: Array<Array<number | null>> = []
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7))
  }

  return (
    <View style={styles.calendarWrap}>
      <View style={styles.weekHeader}>
        {DAY_OF_WEEK_LABELS.map(label => (
          <Text key={label} style={styles.weekHeaderText}>{label}</Text>
        ))}
      </View>

      {weeks.map((week, weekIndex) => (
        <View key={`${year}-${month}-${weekIndex}`} style={styles.weekRow}>
          {week.map((day, dayIndex) => {
            if (day == null) {
              return <View key={`${weekIndex}-${dayIndex}`} style={styles.dayCell} />
            }

            const key = toDateKey(year, month, day)
            const summary = daySummaries.get(key)
            const selected = selectedDay === key
            const today = todayKey === key

            return (
              <TouchableOpacity
                key={key}
                activeOpacity={0.86}
                style={styles.dayCell}
                onPress={() => onSelectDay(key)}
              >
                <View
                  style={[
                    styles.dayCircle,
                    today && !selected && styles.dayCircleToday,
                    selected && styles.dayCircleSelected,
                  ]}
                >
                  <Text style={[styles.dayText, selected && styles.dayTextSelected]}>{day}</Text>
                </View>

                <View style={styles.dayFooter}>
                  <View style={styles.dayBarsRow}>
                    {summary?.medicationBars.map(bar => (
                      <View
                        key={bar.id}
                        style={[styles.dayBar, { backgroundColor: bar.color, opacity: bar.opacity }]}
                      />
                    ))}
                  </View>

                  {summary?.moodKey ? (
                    <View style={styles.dayMoodMarker}>
                      <StatusMascot
                        size={11}
                        statusKey={RECORD_MOOD_DETAILS[summary.moodKey].mascotKey}
                      />
                    </View>
                  ) : null}
                </View>
              </TouchableOpacity>
            )
          })}
        </View>
      ))}
    </View>
  )
}

function JellyHelpSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets()

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.helpOverlay} activeOpacity={1} onPress={onClose} />
      <View style={[styles.helpSheet, { paddingBottom: insets.bottom + 16 }]}> 
        <View style={styles.helpHandle} />

        <View style={styles.helpHeader}>
          <Text style={styles.helpTitle}>젤리 획득 방법</Text>
          <TouchableOpacity activeOpacity={0.84} style={styles.helpCloseButton} onPress={onClose}>
            <Text style={styles.helpCloseText}>닫기</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.helpList}>
          {JELLY_HELP_ITEMS.map(item => (
            <View key={item} style={styles.helpRow}>
              <View style={styles.helpBullet} />
              <Text style={styles.helpItemText}>{item}</Text>
            </View>
          ))}
        </View>
      </View>
    </Modal>
  )
}

export default function RecordsTabScreen() {
  const insets = useSafeAreaInsets()
  const todayKey = getLocalDateKey()
  const today = parseDateKey(todayKey)
  const [year, setYear] = useState(today.year)
  const [month, setMonth] = useState(today.month)
  const [selectedDay, setSelectedDay] = useState(todayKey)
  const [isJellyHelpVisible, setJellyHelpVisible] = useState(false)
  const [isQuickPanelOpen, setQuickPanelOpen] = useState(false)
  const [quickDraft, setQuickDraft] = useState<QuickStateDraft | null>(null)
  const [savingQuickRecord, setSavingQuickRecord] = useState(false)
  const [toastMessage, setToastMessage] = useState<ToastPayload | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const quickPanelProgress = useRef(new Animated.Value(0)).current
  const { records, medications, stateLogs, rewardTransactions, wallet, loading, reload } = useCalendarHub(year, month)

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  useEffect(() => {
    Animated.spring(quickPanelProgress, {
      toValue: isQuickPanelOpen ? 1 : 0,
      useNativeDriver: true,
      tension: 72,
      friction: 10,
    }).start()
  }, [isQuickPanelOpen, quickPanelProgress])

  const showToast = (payload: ToastInput) => {
    setToastMessage(normalizeToastPayload(payload))
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToastMessage(null), 2000)
  }

  const goToDay = (dayKey: string) => {
    const parsed = parseDateKey(dayKey)
    setYear(parsed.year)
    setMonth(parsed.month)
    setSelectedDay(dayKey)
  }

  const changeMonth = (direction: -1 | 1) => {
    const nextDate = new Date(year, month - 1 + direction, 1)
    const nextYear = nextDate.getFullYear()
    const nextMonth = nextDate.getMonth() + 1

    setYear(nextYear)
    setMonth(nextMonth)
    setSelectedDay(toDateKey(nextYear, nextMonth, 1))
  }

  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gestureState) => (
      Math.abs(gestureState.dx) > 16 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy)
    ),
    onPanResponderRelease: (_, gestureState) => {
      if (gestureState.dx > 48) {
        goToDay(shiftDay(selectedDay, -1))
      } else if (gestureState.dx < -48) {
        goToDay(shiftDay(selectedDay, 1))
      }
    },
  }), [selectedDay])

  const daySummaries = useMemo(() => {
    const medicationColorMap = new Map(medications.map(medication => [medication.id, medication.color]))
    const recordsByDay = new Map<string, Map<string, { color: string; statuses: string[] }>>()
    const latestMoodByDay = new Map<string, RecordMoodKey>()

    for (const record of records) {
      if (!recordsByDay.has(record.dayKey)) {
        recordsByDay.set(record.dayKey, new Map())
      }

      const medicationEntries = recordsByDay.get(record.dayKey)
      if (!medicationEntries) continue

      const medicationKey = record.medicationId ?? `name:${record.medicationName}`
      const color = (record.medicationId ? medicationColorMap.get(record.medicationId) : undefined) ?? '#C5CBD4'

      if (!medicationEntries.has(medicationKey)) {
        medicationEntries.set(medicationKey, { color, statuses: [] })
      }

      medicationEntries.get(medicationKey)?.statuses.push(record.status)
    }

    for (const log of stateLogs) {
      const moodKey = normalizeMoodKey(log.mood)
      if (!moodKey || latestMoodByDay.has(log.dayKey)) continue
      latestMoodByDay.set(log.dayKey, moodKey)
    }

    const summaryMap = new Map<string, CalendarDaySummary>()
    const allDayKeys = new Set<string>([...recordsByDay.keys(), ...latestMoodByDay.keys()])

    for (const dayKey of allDayKeys) {
      const medicationEntries = recordsByDay.get(dayKey)
      const groupedRecords = medicationEntries ? Array.from(medicationEntries.entries()) : []
      const statuses = groupedRecords.flatMap(([, value]) => value.statuses)

      summaryMap.set(dayKey, {
        completionTone: completionTone(statuses),
        medicationBars: groupedRecords.slice(0, 4).map(([id, value]) => ({
          id,
          color: value.color,
          opacity: medicationBarOpacity(value.statuses),
        })),
        moodKey: latestMoodByDay.get(dayKey) ?? null,
        takenCount: statuses.filter(isCompletedStatus).length,
        totalCount: statuses.length,
      })
    }

    return summaryMap
  }, [medications, records, stateLogs])

  const selectedDayRecords = useMemo(
    () => records.filter(record => record.dayKey === selectedDay),
    [records, selectedDay],
  )

  const selectedDayStateLogs = useMemo(
    () => stateLogs.filter(log => log.dayKey === selectedDay),
    [selectedDay, stateLogs],
  )

  const selectedDayRewards = useMemo(
    () => rewardTransactions.filter(transaction => transaction.dayKey === selectedDay && transaction.amount > 0),
    [rewardTransactions, selectedDay],
  )

  const selectedDayMedicationEvents = useMemo(() => {
    const medicationMap = new Map(medications.map(medication => [medication.id, medication]))

    return [...selectedDayRecords]
      .sort((left, right) => sortKeyForTime(left.scheduledAt || left.scheduledTime).localeCompare(sortKeyForTime(right.scheduledAt || right.scheduledTime)))
      .map<MedicationEventItem>(record => {
        const medication = record.medicationId ? medicationMap.get(record.medicationId) : undefined

        return {
          id: record.id,
          completionMethod: record.verificationType,
          medicationName: medication?.aliasName || medication?.name || record.medicationName || '복약',
          status: record.status,
          time: timeLabel(record.scheduledAt || record.scheduledTime),
        }
      })
  }, [medications, selectedDayRecords])

  const selectedLatestStateLog = selectedDayStateLogs[0] ?? null
  const selectedSummary = daySummaries.get(selectedDay)
  const actualMoodKey = normalizeMoodKey(selectedLatestStateLog?.mood)
  const actualCondition = normalizeLevel(selectedLatestStateLog?.condition)
  const actualFocus = normalizeLevel(selectedLatestStateLog?.focus)
  const isFutureSelectedDay = selectedDay > todayKey
  const toastBottom = TAB_BAR_BASE_HEIGHT + insets.bottom + 20

  const previewMoodKey = isQuickPanelOpen && quickDraft?.moodKey ? quickDraft.moodKey : actualMoodKey
  const previewCondition = isQuickPanelOpen && quickDraft?.moodKey ? quickDraft.condition : actualCondition
  const previewFocus = isQuickPanelOpen && quickDraft?.moodKey ? quickDraft.focus : actualFocus
  const representativeMoodDetails = previewMoodKey ? RECORD_MOOD_DETAILS[previewMoodKey] : null

  const previewDaySummaries = useMemo(() => {
    if (!isQuickPanelOpen || !quickDraft?.moodKey) return daySummaries

    const next = new Map(daySummaries)
    const current = next.get(selectedDay)

    next.set(selectedDay, {
      completionTone: current?.completionTone ?? 'empty',
      medicationBars: current?.medicationBars ?? [],
      moodKey: quickDraft.moodKey,
      takenCount: current?.takenCount ?? 0,
      totalCount: current?.totalCount ?? 0,
    })

    return next
  }, [daySummaries, isQuickPanelOpen, quickDraft, selectedDay])

  const summaryBadge = resolveSummaryBadge(selectedSummary?.completionTone ?? 'empty')
  const takenCount = selectedSummary?.takenCount ?? 0
  const totalCount = selectedSummary?.totalCount ?? 0

  const stateRewardRefs = new Set(
    selectedDayRewards
      .filter(transaction => transaction.kind === 'state_log' && transaction.referenceId)
      .map(transaction => transaction.referenceId),
  )

  const inferredStateReward = selectedDayStateLogs.reduce((sum, log) => {
    if (!log.rewardGranted || stateRewardRefs.has(log.id)) return sum
    return sum + STATE_REWARD_JELLY
  }, 0)

  const selectedDayJelly = selectedDayRewards.reduce((sum, transaction) => sum + transaction.amount, 0) + inferredStateReward

  const panelAnimatedStyle = {
    opacity: quickPanelProgress,
    transform: [
      {
        translateX: quickPanelProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [24, 0],
        }),
      },
      {
        translateY: quickPanelProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [18, 0],
        }),
      },
      {
        scale: quickPanelProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [0.94, 1],
        }),
      },
    ],
  }

  const openQuickPanel = () => {
    setQuickDraft(buildQuickDraft(selectedLatestStateLog ?? undefined))
    setQuickPanelOpen(true)
  }

  const closeQuickPanel = () => {
    setQuickPanelOpen(false)
    setQuickDraft(null)
  }

  useEffect(() => {
    if (!isQuickPanelOpen) return
    setQuickDraft(buildQuickDraft(selectedLatestStateLog ?? undefined))
  }, [isQuickPanelOpen, selectedDay, selectedLatestStateLog])

  const handleQuickSave = async () => {
    if (!quickDraft?.moodKey || savingQuickRecord || isFutureSelectedDay) return

    const moodDetails = RECORD_MOOD_DETAILS[quickDraft.moodKey]
    setSavingQuickRecord(true)

    try {
      const stateLogId = await insertStateLog({
        dayKey: selectedDay,
        mood: quickDraft.moodKey,
        condition: quickDraft.condition,
        focus: quickDraft.focus,
        tags: [],
        rewardGranted: false,
      })

      const reward = await awardStateLogReward(stateLogId)
      if (reward.awarded) {
        await updateStateLogReward(stateLogId, true)
      }

      await reload()
      closeQuickPanel()

      showToast({
        caption: selectedDateLabel(selectedDay),
        jellyDelta: reward.transaction?.amount,
        mascotKey: moodDetails.mascotKey,
        message: '상태가 기록됐어요',
      })
    } catch {
      showToast('기록에 실패했어요')
    } finally {
      setSavingQuickRecord(false)
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
    <View style={styles.root} {...panResponder.panHandlers}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 10,
          paddingHorizontal: 16,
          paddingBottom: TAB_BAR_BASE_HEIGHT + insets.bottom + 18,
        }}
      >
        <ScreenTopBar
          title="기록"
          balance={wallet?.balance}
          balanceLoading={loading}
          onBalancePress={() => setJellyHelpVisible(true)}
        />

        <View style={styles.monthRow}>
          <TouchableOpacity activeOpacity={0.84} style={styles.monthButton} onPress={() => changeMonth(-1)}>
            <Ionicons name="chevron-back" size={17} color="#101319" />
          </TouchableOpacity>
          <Text style={styles.monthText}>{monthLabel(year, month)}</Text>
          <TouchableOpacity activeOpacity={0.84} style={styles.monthButton} onPress={() => changeMonth(1)}>
            <Ionicons name="chevron-forward" size={17} color="#101319" />
          </TouchableOpacity>
        </View>

        <View style={styles.calendarCard}>
          <CalendarGrid
            year={year}
            month={month}
            daySummaries={previewDaySummaries}
            selectedDay={selectedDay}
            onSelectDay={goToDay}
          />
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryTopRow}>
            <View style={styles.summaryDateRow}>
              <Text style={styles.summaryDate}>{selectedDateLabel(selectedDay)}</Text>
              {summaryBadge ? (
                <View style={[styles.summaryBadge, { backgroundColor: summaryBadge.surface }]}>
                  <Text style={[styles.summaryBadgeText, { color: summaryBadge.text }]}>{summaryBadge.label}</Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.summaryMetricsBlock}>
            <View style={styles.metricsRow}>
              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>복약</Text>
                <Text style={styles.metricValue}>{totalCount > 0 ? `${takenCount}/${totalCount}` : '-'}</Text>
              </View>

              <View style={styles.metricCard}>
                <Text style={styles.metricLabel}>젤리</Text>
                <Text style={styles.metricValue}>{selectedDayJelly}</Text>
              </View>

              <View
                style={[
                  styles.metricCard,
                  representativeMoodDetails && {
                    backgroundColor: MASCOT_STATUS_DETAILS[representativeMoodDetails.mascotKey].surface,
                    borderColor: MASCOT_STATUS_DETAILS[representativeMoodDetails.mascotKey].border,
                  },
                ]}
              >
                <Text style={styles.metricLabel}>상태</Text>
                <Text style={styles.metricValue}>{representativeMoodDetails?.label ?? '-'}</Text>
              </View>
            </View>

            <TouchableOpacity
              activeOpacity={0.86}
              style={[
                styles.summaryActionTile,
                isQuickPanelOpen && styles.summaryActionTileActive,
                (isFutureSelectedDay || savingQuickRecord) && styles.summaryActionTileDisabled,
              ]}
              onPress={isQuickPanelOpen ? closeQuickPanel : openQuickPanel}
              disabled={isFutureSelectedDay || savingQuickRecord}
            >
              <View style={styles.summaryActionTileBody}>
                <StatusMascot
                  size={52}
                  statusKey={representativeMoodDetails?.mascotKey ?? 'normal'}
                />
                <Text style={styles.summaryActionLabel}>상태 기록</Text>
              </View>
              <View style={styles.summaryActionIcon}>
                <Ionicons
                  name={isQuickPanelOpen ? 'close' : representativeMoodDetails ? 'create-outline' : 'add'}
                  size={13}
                  color="#101319"
                />
              </View>
            </TouchableOpacity>
          </View>

          <Animated.View
            pointerEvents={isQuickPanelOpen ? 'auto' : 'none'}
            style={[styles.quickPanelInline, panelAnimatedStyle, !isQuickPanelOpen && styles.quickPanelHidden]}
          >
            <View style={styles.quickPanelSection}>
              <Text style={styles.quickPanelLabel}>기분</Text>
              <View style={styles.moodGrid}>
                {RECORD_MOOD_ORDER.map(moodKey => {
                  const moodDetails = RECORD_MOOD_DETAILS[moodKey]
                  const mascotTone = MASCOT_STATUS_DETAILS[moodDetails.mascotKey]
                  const selected = quickDraft?.moodKey === moodKey

                  return (
                    <TouchableOpacity
                      key={moodKey}
                      activeOpacity={0.86}
                      style={[
                        styles.moodOption,
                        selected && {
                          backgroundColor: mascotTone.surface,
                          borderColor: mascotTone.border,
                        },
                      ]}
                      onPress={() => setQuickDraft(current => ({
                        moodKey,
                        condition: current?.condition ?? actualCondition,
                        focus: current?.focus ?? actualFocus,
                      }))}
                      disabled={savingQuickRecord || isFutureSelectedDay}
                    >
                      <StatusMascot size={24} statusKey={moodDetails.mascotKey} />
                      <Text style={[styles.moodOptionLabel, selected && { color: mascotTone.accent }]}>{moodDetails.label}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>

            <View style={styles.quickPanelSection}>
              <Text style={styles.quickPanelLabel}>컨디션</Text>
              <View style={styles.segmentRow}>
                {LEVEL_OPTIONS.map(option => {
                  const selected = (quickDraft?.condition ?? actualCondition) === option.key

                  return (
                    <TouchableOpacity
                      key={`condition-${option.key}`}
                      activeOpacity={0.86}
                      style={[styles.segmentButton, selected && styles.segmentButtonSelected]}
                      onPress={() => setQuickDraft(current => ({
                        moodKey: current?.moodKey ?? normalizeMoodKey(DEFAULT_QUICK_STATE.mood),
                        condition: option.key,
                        focus: current?.focus ?? actualFocus,
                      }))}
                      disabled={savingQuickRecord || isFutureSelectedDay}
                    >
                      <Text style={[styles.segmentButtonText, selected && styles.segmentButtonTextSelected]}>{option.label}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>

            <View style={styles.quickPanelSection}>
              <Text style={styles.quickPanelLabel}>집중</Text>
              <View style={styles.segmentRow}>
                {LEVEL_OPTIONS.map(option => {
                  const selected = (quickDraft?.focus ?? actualFocus) === option.key

                  return (
                    <TouchableOpacity
                      key={`focus-${option.key}`}
                      activeOpacity={0.86}
                      style={[styles.segmentButton, selected && styles.segmentButtonSelected]}
                      onPress={() => setQuickDraft(current => ({
                        moodKey: current?.moodKey ?? normalizeMoodKey(DEFAULT_QUICK_STATE.mood),
                        condition: current?.condition ?? actualCondition,
                        focus: option.key,
                      }))}
                      disabled={savingQuickRecord || isFutureSelectedDay}
                    >
                      <Text style={[styles.segmentButtonText, selected && styles.segmentButtonTextSelected]}>{option.label}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </View>

            <View style={styles.quickPanelFooter}>
              <TouchableOpacity
                activeOpacity={0.86}
                style={[
                  styles.quickPanelPrimaryButton,
                  (!quickDraft?.moodKey || savingQuickRecord || isFutureSelectedDay) && styles.quickPanelPrimaryButtonDisabled,
                ]}
                onPress={handleQuickSave}
                disabled={!quickDraft?.moodKey || savingQuickRecord || isFutureSelectedDay}
              >
                <Text style={styles.quickPanelPrimaryButtonText}>{savingQuickRecord ? '저장 중...' : '기록하기'}</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>

          <View style={styles.summarySectionHeader}>
            <Text style={styles.summarySectionTitle}>복약 기록</Text>
            <Text style={styles.summarySectionMeta}>{selectedDayMedicationEvents.length}건</Text>
          </View>

          {selectedDayMedicationEvents.length > 0 ? (
            <View style={styles.medicationLogList}>
              {selectedDayMedicationEvents.map((item, index) => {
                const chip = resolveMedicationStatusChip(item.status, item.completionMethod)

                return (
                  <View
                    key={item.id}
                    style={[styles.medicationLogRow, index > 0 && styles.medicationLogRowSeparated]}
                  >
                    <View style={[styles.medicationStatusChip, { backgroundColor: chip.surface }]}> 
                      <Text style={[styles.medicationStatusChipText, { color: chip.text }]}>{chip.label}</Text>
                    </View>
                    <Text style={styles.medicationLogText}>{item.time} · {item.medicationName}</Text>
                  </View>
                )
              })}
            </View>
          ) : (
            <View style={styles.summaryEmpty}>
              <Text style={styles.summaryEmptyText}>복약 기록이 없어요</Text>
            </View>
          )}
        </View>
      </ScrollView>

      <JellyHelpSheet visible={isJellyHelpVisible} onClose={() => setJellyHelpVisible(false)} />
      <AppToast bottom={toastBottom} payload={toastMessage} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#F7F5EF',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F7F5EF',
  },
  monthRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    marginBottom: 6,
  },
  monthButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E6E1D7',
    borderRadius: 999,
    borderWidth: 1,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  monthText: {
    color: '#101319',
    fontSize: 18,
    fontWeight: '800',
  },
  calendarCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E6E1D7',
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 4,
  },
  calendarWrap: {
    gap: 1,
  },
  weekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 1,
  },
  weekHeaderText: {
    color: '#8A8F98',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    width: 40,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayCell: {
    alignItems: 'center',
    minHeight: 44,
    paddingTop: 1,
    width: 40,
  },
  dayCircle: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: 14,
    borderWidth: 1,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  dayCircleSelected: {
    backgroundColor: '#101319',
    borderColor: '#101319',
  },
  dayCircleToday: {
    borderColor: '#101319',
  },
  dayText: {
    color: '#101319',
    fontSize: 13,
    fontWeight: '700',
  },
  dayTextSelected: {
    color: '#FFFFFF',
  },
  dayFooter: {
    alignItems: 'center',
    gap: 1,
    marginTop: 2,
    minHeight: 12,
  },
  dayBarsRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2,
    justifyContent: 'center',
    minHeight: 4,
  },
  dayBar: {
    borderRadius: 999,
    height: 4,
    width: 7,
  },
  dayMoodMarker: {
    alignItems: 'center',
    height: 11,
    justifyContent: 'center',
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E6E1D7',
    borderRadius: 24,
    borderWidth: 1,
    gap: 12,
    marginTop: 10,
    padding: 14,
  },
  summaryTopRow: {
    gap: 8,
  },
  summaryDateRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  summaryDate: {
    color: '#101319',
    fontSize: 19,
    fontWeight: '800',
  },
  summaryBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  summaryBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  summaryMetricsBlock: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: 8,
  },
  metricsRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
  },
  metricCard: {
    backgroundColor: '#F7F4EE',
    borderColor: '#ECE4D6',
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'space-between',
    minHeight: 86,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  metricLabel: {
    color: '#8A8F98',
    fontSize: 11,
    fontWeight: '700',
  },
  metricValue: {
    color: '#101319',
    fontSize: 17,
    fontWeight: '800',
  },
  summaryActionTile: {
    alignItems: 'center',
    backgroundColor: '#FBF9F4',
    borderColor: '#E6E1D7',
    borderRadius: 16,
    borderWidth: 1,
    height: 86,
    justifyContent: 'center',
    minWidth: 92,
    paddingHorizontal: 10,
    position: 'relative',
  },
  summaryActionTileActive: {
    backgroundColor: '#FFF7EA',
    borderColor: '#E5C79A',
  },
  summaryActionTileDisabled: {
    opacity: 0.56,
  },
  summaryActionTileBody: {
    alignItems: 'center',
    gap: 6,
  },
  summaryActionLabel: {
    color: '#40454D',
    fontSize: 11,
    fontWeight: '800',
  },
  summaryActionIcon: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E6E1D7',
    borderRadius: 999,
    borderWidth: 1,
    bottom: 7,
    height: 22,
    justifyContent: 'center',
    position: 'absolute',
    right: 7,
    width: 22,
  },
  summarySectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summarySectionTitle: {
    color: '#101319',
    fontSize: 15,
    fontWeight: '800',
  },
  summarySectionMeta: {
    color: '#8A8F98',
    fontSize: 12,
    fontWeight: '700',
  },
  medicationLogList: {
    gap: 0,
  },
  medicationLogRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
    paddingVertical: 7,
  },
  medicationLogRowSeparated: {
    borderTopColor: '#F0ECE3',
    borderTopWidth: 1,
  },
  medicationStatusChip: {
    alignItems: 'center',
    borderRadius: 999,
    justifyContent: 'center',
    minWidth: 40,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  medicationStatusChipText: {
    fontSize: 11,
    fontWeight: '800',
  },
  medicationLogText: {
    color: '#101319',
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 17,
  },
  summaryEmpty: {
    alignItems: 'center',
    backgroundColor: '#F7F4EE',
    borderRadius: 16,
    justifyContent: 'center',
    minHeight: 62,
  },
  summaryEmptyText: {
    color: '#8A8F98',
    fontSize: 13,
    fontWeight: '700',
  },
  quickPanelInline: {
    backgroundColor: '#FCFAF5',
    borderColor: '#ECE4D6',
    borderRadius: 18,
    borderWidth: 1,
    gap: 10,
    marginTop: -2,
    padding: 12,
  },
  quickPanelHidden: {
    display: 'none',
  },
  quickPanelSection: {
    gap: 6,
  },
  quickPanelLabel: {
    color: '#101319',
    fontSize: 13,
    fontWeight: '800',
  },
  moodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  moodOption: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E6E1D7',
    borderRadius: 16,
    borderWidth: 1,
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 8,
    width: '31.2%',
  },
  moodOptionLabel: {
    color: '#6C7280',
    fontSize: 11,
    fontWeight: '800',
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
  },
  segmentButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E6E1D7',
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    height: 34,
    justifyContent: 'center',
  },
  segmentButtonSelected: {
    backgroundColor: '#FFF5E8',
    borderColor: '#E5C79A',
  },
  segmentButtonText: {
    color: '#7A808A',
    fontSize: 12,
    fontWeight: '800',
  },
  segmentButtonTextSelected: {
    color: '#101319',
  },
  quickPanelFooter: {
    alignItems: 'flex-end',
  },
  quickPanelPrimaryButton: {
    alignItems: 'center',
    backgroundColor: '#101319',
    borderRadius: 14,
    height: 38,
    justifyContent: 'center',
    minWidth: 112,
    paddingHorizontal: 16,
  },
  quickPanelPrimaryButtonDisabled: {
    backgroundColor: '#C8CDD4',
  },
  quickPanelPrimaryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  helpOverlay: {
    flex: 1,
    backgroundColor: 'rgba(16,19,25,0.22)',
  },
  helpSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    gap: 14,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  helpHandle: {
    alignSelf: 'center',
    backgroundColor: '#D8D8D8',
    borderRadius: 999,
    height: 4,
    width: 40,
  },
  helpHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  helpTitle: {
    color: '#101319',
    fontSize: 20,
    fontWeight: '800',
  },
  helpCloseButton: {
    alignItems: 'center',
    backgroundColor: '#F2F0EB',
    borderRadius: 999,
    height: 32,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  helpCloseText: {
    color: '#101319',
    fontSize: 12,
    fontWeight: '800',
  },
  helpList: {
    gap: 10,
    paddingBottom: 4,
  },
  helpRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
  },
  helpBullet: {
    backgroundColor: '#101319',
    borderRadius: 999,
    height: 5,
    marginTop: 8,
    width: 5,
  },
  helpItemText: {
    color: '#40454D',
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
})
