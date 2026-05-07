import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@/components/AppIcon'
import { FLOATING_GAP, FloatingBottom, TAB_BAR_BASE_HEIGHT } from '@/components/layout/FloatingBottom'
import { ScreenTopBar } from '@/components/ScreenTopBar'
import { STATE_MOODS, StateCheckInSheet, type StateMood } from '@/components/StateCheckInSheet'
import { designHarness } from '@/design/designHarness'
import {
  addCustomMoodEmoji,
  deleteCustomMoodEmoji,
  getCustomMoodEmojis,
} from '@/domain/stateLog/customMoodEmojiRepository'
import { useCalendarHub } from '@/hooks/useCalendarHub'
import { useI18n } from '@/hooks/useI18n'
import { useWalletSummary } from '@/hooks/useWalletSummary'
import { getLocalDateKey } from '@/utils/dateUtils'
import { fmtTime } from '@/utils/timeUtils'

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

function dayLabel(dateKey: string) {
  const date = new Date(`${dateKey}T12:00:00`)
  return `${date.getMonth() + 1}월 ${date.getDate()}일`
}

function levelLabel(value: string) {
  if (value === 'low') return '낮음'
  if (value === 'good') return '좋음'
  return '보통'
}

const RECORDS_COPY = {
  ko: {
    title: '기록',
    addEmojiTitle: '이모지 추가',
    addEmojiSubtitle: '사용할 이모지를 선택하세요',
    addEmojiPlaceholder: '🙂',
    addEmojiButton: '추가하기',
    deleteEmoji: '삭제',
    close: '닫기',
    emojiError: '이모지 하나만 입력해 주세요',
    addStateLabel: '이모지 추가',
    stateA11y: '상태 기록',
  },
  en: {
    title: 'Records',
    addEmojiTitle: 'Add emoji',
    addEmojiSubtitle: 'Choose an emoji',
    addEmojiPlaceholder: '🙂',
    addEmojiButton: 'Add',
    deleteEmoji: 'Delete',
    close: 'Close',
    emojiError: 'Enter one emoji.',
    addStateLabel: 'Add emoji',
    stateA11y: 'State log',
  },
  ja: {
    title: '記録',
    addEmojiTitle: '絵文字を追加',
    addEmojiSubtitle: '使う絵文字を選んでください',
    addEmojiPlaceholder: '🙂',
    addEmojiButton: '追加',
    deleteEmoji: '削除',
    close: '閉じる',
    emojiError: '絵文字を1つ入力してください',
    addStateLabel: '絵文字を追加',
    stateA11y: '状態記録',
  },
} as const

function calendarState(statuses: string[]) {
  if (statuses.length === 0) return 'none' as const

  const doneCount = statuses.filter(status => status === 'completed' || status === 'frozen').length
  const missedCount = statuses.filter(status => status === 'missed' || status === 'skipped').length

  if (doneCount === statuses.length) return 'complete' as const
  if (doneCount > 0) return 'partial' as const
  if (missedCount > 0) return 'missed' as const
  return 'pending' as const
}

function CalendarGrid({
  year,
  month,
  records,
  stateLogs,
  selectedDay,
  onSelectDay,
}: {
  year: number
  month: number
  records: Array<{ dayKey: string; status: string }>
  stateLogs: Array<{ dayKey: string; mood: string | null }>
  selectedDay: string
  onSelectDay: (dayKey: string) => void
}) {
  const todayKey = getLocalDateKey()
  const daysInMonth = new Date(year, month, 0).getDate()
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay()
  const dayStatusMap = new Map<string, string[]>()
  const dayStateLogMap = new Map<string, { count: number; mood: string | null }>()

  for (const record of records) {
    const statuses = dayStatusMap.get(record.dayKey)
    if (statuses) {
      statuses.push(record.status)
    } else {
      dayStatusMap.set(record.dayKey, [record.status])
    }
  }

  for (const log of stateLogs) {
    const current = dayStateLogMap.get(log.dayKey)
    if (current) {
      current.count += 1
    } else {
      dayStateLogMap.set(log.dayKey, { count: 1, mood: log.mood })
    }
  }

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
        {['일', '월', '화', '수', '목', '금', '토'].map(label => (
          <Text key={label} style={styles.weekHeaderText}>{label}</Text>
        ))}
      </View>

      {weeks.map((week, weekIndex) => (
        <View key={`${year}-${month}-${weekIndex}`} style={styles.weekRow}>
          {week.map((day, dayIndex) => {
            if (day === null) {
              return <View key={`${weekIndex}-${dayIndex}`} style={styles.dayCell} />
            }

            const key = toDateKey(year, month, day)
            const selected = selectedDay === key
            const today = todayKey === key
            const statuses = dayStatusMap.get(key) ?? []
            const state = calendarState(statuses)
            const checkCount = statuses.length
            const stateActivity = dayStateLogMap.get(key)

            return (
              <TouchableOpacity
                key={`${weekIndex}-${dayIndex}`}
                style={styles.dayCell}
                onPress={() => onSelectDay(key)}
              >
                <View
                  style={[
                    styles.dayCircle,
                    selected && styles.dayCircleSelected,
                    today && styles.dayCircleToday,
                  ]}
                >
                  <Text style={[styles.dayText, selected && styles.dayTextSelected]}>{day}</Text>
                </View>
                <View style={styles.dayMarkers}>
                  {checkCount > 0 ? (
                    <View
                      style={[
                        styles.checkMarker,
                        state === 'complete' && styles.checkMarkerComplete,
                        state === 'partial' && styles.checkMarkerPartial,
                        state === 'missed' && styles.checkMarkerMissed,
                        stateActivity && styles.checkMarkerCompact,
                      ]}
                    >
                      <Text
                        style={[
                          styles.checkMarkerText,
                          state === 'complete' && styles.checkMarkerTextComplete,
                          state === 'missed' && styles.checkMarkerTextMissed,
                        ]}
                      >
                        {checkCount > 1 ? `약${Math.min(checkCount, 9)}` : state === 'complete' ? '✓' : '약'}
                      </Text>
                    </View>
                  ) : null}
                  {stateActivity ? (
                    <View style={styles.stateMarker}>
                      <Text style={styles.stateMarkerText}>{stateActivity.mood ?? '•'}</Text>
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

export default function HistoryScreen() {
  const insets = useSafeAreaInsets()
  const { lang } = useI18n()
  const copy = RECORDS_COPY[lang]
  const todayKey = getLocalDateKey()
  const today = parseDateKey(todayKey)
  const [year, setYear] = useState(today.year)
  const [month, setMonth] = useState(today.month)
  const [selectedDay, setSelectedDay] = useState(todayKey)
  const [sheetVisible, setSheetVisible] = useState(false)
  const [quickMood, setQuickMood] = useState<StateMood>('🙂')
  const [customEmojis, setCustomEmojis] = useState<string[]>([])
  const [emojiSheetVisible, setEmojiSheetVisible] = useState(false)
  const [emojiInput, setEmojiInput] = useState('')
  const [emojiError, setEmojiError] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { records, medications, timeslots, stateLogs, rewardTransactions, loading, reload } = useCalendarHub(year, month)
  const { wallet, loading: walletLoading } = useWalletSummary()
  const isFutureSelectedDay = selectedDay > todayKey
  const baseBottomInset = TAB_BAR_BASE_HEIGHT + insets.bottom
  const quickMoodOptions = useMemo(() => [...STATE_MOODS, ...customEmojis], [customEmojis])

  const openCheckIn = (mood: StateMood = '🙂') => {
    setQuickMood(mood)
    setSheetVisible(true)
  }

  const openEmojiSheet = () => {
    setEmojiInput('')
    setEmojiError(null)
    setEmojiSheetVisible(true)
  }

  const addCustomEmoji = async () => {
    const result = await addCustomMoodEmoji(emojiInput)
    if (!result.ok) {
      setEmojiError(copy.emojiError)
      return
    }

    setCustomEmojis(result.emojis)
    setEmojiInput('')
    setEmojiError(null)
    setEmojiSheetVisible(false)
  }

  const removeCustomEmoji = async (emoji: string) => {
    const next = await deleteCustomMoodEmoji(emoji)
    setCustomEmojis(next)
    if (quickMood === emoji) setQuickMood('🙂')
  }

  const goToDay = (dayKey: string) => {
    const parsed = parseDateKey(dayKey)
    setYear(parsed.year)
    setMonth(parsed.month)
    setSelectedDay(dayKey)
  }

  const changeMonth = (direction: -1 | 1) => {
    const nextMonth = month + direction
    if (nextMonth < 1) {
      setYear(prev => prev - 1)
      setMonth(12)
      setSelectedDay(toDateKey(year - 1, 12, 1))
      return
    }

    if (nextMonth > 12) {
      setYear(prev => prev + 1)
      setMonth(1)
      setSelectedDay(toDateKey(year + 1, 1, 1))
      return
    }

    setMonth(nextMonth)
    setSelectedDay(toDateKey(year, nextMonth, 1))
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

  useEffect(() => {
    void getCustomMoodEmojis().then(setCustomEmojis)

    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  const timelineItems = useMemo(() => {
    const medicationMap = new Map(medications.map(medication => [medication.id, medication]))
    const reminderMap = new Map(timeslots.map(timeslot => [timeslot.id, timeslot]))

    const checkItems = records
      .filter(record => record.dayKey === selectedDay)
      .map(record => {
        const reminder = reminderMap.get(record.reminderTimeId ?? record.timeSlotId ?? '')
        const medication = record.medicationId ? medicationMap.get(record.medicationId) : undefined
        const alias = medication?.aliasName || record.medicationName
        const stateLabel = reminder?.isEnabled === 0
          ? '알림 꺼짐'
          : record.status === 'completed' || record.status === 'frozen'
            ? '체크 완료'
            : record.status === 'missed'
              ? '체크 놓침'
              : record.status === 'skipped'
                ? '체크 건너뜀'
                : '체크 대기'
        return {
          id: `check-${record.id}`,
          time: record.scheduledAt || record.scheduledTime,
          label: `${alias} ${stateLabel}`,
          meta: record.status === 'completed' || record.status === 'frozen' ? '+3 젤리' : '',
          tone: record.status === 'completed' || record.status === 'frozen'
            ? 'complete'
            : record.status === 'missed' || record.status === 'skipped'
              ? 'missed'
              : 'pending',
        }
      })

    const stateItems = stateLogs
      .filter(log => log.dayKey === selectedDay)
      .map(log => ({
        id: `state-${log.id}`,
        time: log.createdAt,
        label: log.condition === log.focus
          ? `${log.mood} ${levelLabel(log.condition)}`
          : `${log.mood} 컨디션 ${levelLabel(log.condition)} · 집중 ${levelLabel(log.focus)}`,
        meta: '',
        tone: 'state',
      }))

    const rewardItems = rewardTransactions
      .filter(transaction => transaction.dayKey === selectedDay && transaction.amount > 0)
      .map(transaction => ({
        id: `reward-${transaction.id}`,
        time: transaction.createdAt,
        label: transaction.label,
        meta: `+${transaction.amount} 젤리`,
        tone: 'reward',
      }))

    return [...checkItems, ...stateItems, ...rewardItems].sort((left, right) => left.time.localeCompare(right.time))
  }, [medications, records, rewardTransactions, selectedDay, stateLogs, timeslots])

  const showToast = (message: string) => {
    setToastMessage(message)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToastMessage(null), 1800)
  }

  return (
    <View style={styles.root} {...panResponder.panHandlers}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingHorizontal: 24,
          paddingBottom: baseBottomInset + 128,
        }}
      >
        <View style={styles.headerBlock}>
          <ScreenTopBar title={copy.title} balance={wallet?.balance} balanceLoading={walletLoading} />
        </View>

        <View style={styles.monthRow}>
          <TouchableOpacity style={styles.monthButton} onPress={() => changeMonth(-1)}>
            <Ionicons name="chevron-back" size={18} color={designHarness.colors.textStrong} />
          </TouchableOpacity>
          <Text style={styles.monthText}>{monthLabel(year, month)}</Text>
          <TouchableOpacity style={styles.monthButton} onPress={() => changeMonth(1)}>
            <Ionicons name="chevron-forward" size={18} color={designHarness.colors.textStrong} />
          </TouchableOpacity>
        </View>

        <View style={styles.calendarCard}>
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={designHarness.colors.warning} />
            </View>
          ) : (
            <CalendarGrid
              year={year}
              month={month}
              records={records}
              stateLogs={stateLogs}
              selectedDay={selectedDay}
              onSelectDay={goToDay}
            />
          )}
        </View>

        <View style={styles.timelineBlock}>
          <Text style={styles.timelineTitle}>{dayLabel(selectedDay)}</Text>

          {timelineItems.length === 0 ? (
            <View style={styles.emptyTimelineCard}>
              <Text style={styles.emptyTimelineText}>아직 기록이 없습니다</Text>
            </View>
          ) : (
            timelineItems.map(item => (
              <View key={item.id} style={styles.timelineRow}>
                <Text style={styles.timelineTime}>{fmtTime(Number(item.time.slice(11, 13)), Number(item.time.slice(14, 16)), { am: '오전', pm: '오후' })}</Text>
                <View
                  style={[
                    styles.timelineDot,
                    item.tone === 'complete' && styles.timelineDotComplete,
                    item.tone === 'pending' && styles.timelineDotPending,
                    item.tone === 'missed' && styles.timelineDotMissed,
                    item.tone === 'state' && styles.timelineDotState,
                    item.tone === 'reward' && styles.timelineDotReward,
                  ]}
                />
                <View style={styles.timelineCopy}>
                  <Text style={styles.timelineLabel}>{item.label}</Text>
                  {item.meta ? <Text style={styles.timelineMeta}>{item.meta}</Text> : null}
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {!isFutureSelectedDay ? (
        <FloatingBottom variant="cta">
          <View style={styles.quickCheckBar}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.quickMoodScroller}
              contentContainerStyle={styles.quickMoodScroll}
            >
              {quickMoodOptions.map(mood => {
                const custom = customEmojis.includes(mood)
                return (
                  <TouchableOpacity
                    key={mood}
                    style={[styles.quickMoodButton, quickMood === mood && sheetVisible && styles.quickMoodButtonActive]}
                    onPress={() => openCheckIn(mood)}
                    onLongPress={custom ? () => { void removeCustomEmoji(mood) } : undefined}
                    activeOpacity={0.82}
                    accessibilityLabel={copy.stateA11y}
                  >
                    <Text style={styles.quickMoodText}>{mood}</Text>
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
            <TouchableOpacity
              style={styles.quickPlusButton}
              onPress={openEmojiSheet}
              activeOpacity={0.82}
              accessibilityLabel={copy.addStateLabel}
            >
              <Ionicons name="add" size={22} color="#101319" />
            </TouchableOpacity>
          </View>
        </FloatingBottom>
      ) : null}

      <StateCheckInSheet
        visible={sheetVisible}
        dayKey={selectedDay}
        initialMood={quickMood}
        customMoods={customEmojis}
        onClose={() => setSheetVisible(false)}
        onSaved={(message) => {
          setSheetVisible(false)
          void reload()
          showToast(message)
        }}
      />

      <Modal visible={emojiSheetVisible} transparent animationType="fade" onRequestClose={() => setEmojiSheetVisible(false)}>
        <TouchableOpacity style={styles.emojiOverlay} activeOpacity={1} onPress={() => setEmojiSheetVisible(false)} />
        <View style={[styles.emojiSheet, { paddingBottom: insets.bottom + 18 }]}>
          <View style={styles.emojiSheetHandle} />
          <View style={styles.emojiSheetHeader}>
            <View>
              <Text style={styles.emojiSheetTitle}>{copy.addEmojiTitle}</Text>
              <Text style={styles.emojiSheetSubtitle}>{copy.addEmojiSubtitle}</Text>
            </View>
            <TouchableOpacity style={styles.emojiCloseButton} onPress={() => setEmojiSheetVisible(false)}>
              <Text style={styles.emojiCloseText}>{copy.close}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.emojiInputRow}>
            <TextInput
              style={styles.emojiInput}
              value={emojiInput}
              onChangeText={(value) => {
                setEmojiInput(value)
                setEmojiError(null)
              }}
              placeholder={copy.addEmojiPlaceholder}
              placeholderTextColor="#8A8F98"
              maxLength={12}
              autoFocus
            />
            <TouchableOpacity style={styles.emojiAddButton} onPress={() => { void addCustomEmoji() }}>
              <Text style={styles.emojiAddText}>{copy.addEmojiButton}</Text>
            </TouchableOpacity>
          </View>
          {emojiError ? <Text style={styles.emojiError}>{emojiError}</Text> : null}
          {customEmojis.length > 0 ? (
            <View style={styles.customEmojiWrap}>
              {customEmojis.map(emoji => (
                <TouchableOpacity
                  key={emoji}
                  style={styles.customEmojiChip}
                  onPress={() => { void removeCustomEmoji(emoji) }}
                  onLongPress={() => { void removeCustomEmoji(emoji) }}
                >
                  <Text style={styles.customEmojiText}>{emoji}</Text>
                  <Text style={styles.customEmojiDelete}>{copy.deleteEmoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>
      </Modal>

      {toastMessage ? (
        <View style={[styles.toast, { bottom: baseBottomInset + FLOATING_GAP + 68 }]}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FAFAF8',
  },
  headerBlock: {
    marginBottom: 22,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  monthButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EAEE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthText: {
    fontSize: 20,
    fontWeight: '800',
    color: '#101319',
  },
  calendarCard: {
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EAEE',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  loadingWrap: {
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarWrap: {
    gap: 6,
  },
  weekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  weekHeaderText: {
    width: 44,
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
    color: '#8A8F98',
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dayCell: {
    width: 44,
    height: 68,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 3,
  },
  dayCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleSelected: {
    backgroundColor: '#FF9F0A',
  },
  dayCircleToday: {
    borderColor: '#FF9F0A',
  },
  dayText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#101319',
  },
  dayTextSelected: {
    color: '#FFFFFF',
  },
  dayMarkers: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 3,
    height: 28,
    justifyContent: 'center',
    width: 44,
  },
  checkMarker: {
    alignItems: 'center',
    backgroundColor: '#FF9F0A',
    borderRadius: 999,
    height: 15,
    justifyContent: 'center',
    minWidth: 28,
    paddingHorizontal: 5,
  },
  checkMarkerCompact: {
    minWidth: 24,
    paddingHorizontal: 4,
  },
  checkMarkerComplete: {
    backgroundColor: '#22C55E',
  },
  checkMarkerPartial: {
    backgroundColor: '#FF9F0A',
  },
  checkMarkerMissed: {
    backgroundColor: '#F6D5C5',
  },
  checkMarkerText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
    lineHeight: 12,
  },
  checkMarkerTextComplete: {
    color: '#FFFFFF',
  },
  checkMarkerTextMissed: {
    color: '#9A3412',
  },
  stateMarker: {
    alignItems: 'center',
    backgroundColor: '#E7F7F5',
    borderRadius: 8,
    height: 16,
    justifyContent: 'center',
    width: 16,
  },
  stateMarkerText: {
    fontSize: 10,
    lineHeight: 12,
  },
  timelineBlock: {
    marginTop: 24,
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EAEE',
    paddingHorizontal: 18,
    paddingVertical: 18,
    gap: 14,
  },
  timelineTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#101319',
  },
  emptyTimelineCard: {
    borderRadius: 22,
    backgroundColor: '#F4F1EA',
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTimelineText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#8A8F98',
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  timelineTime: {
    width: 70,
    fontSize: 14,
    fontWeight: '600',
    color: '#8A8F98',
    paddingTop: 1,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#D8D8D8',
    marginTop: 6,
  },
  timelineDotComplete: {
    backgroundColor: '#22C55E',
  },
  timelineDotPending: {
    backgroundColor: '#FF9F0A',
  },
  timelineDotMissed: {
    backgroundColor: '#B4532A',
  },
  timelineDotState: {
    backgroundColor: '#6BC7C3',
  },
  timelineDotReward: {
    backgroundColor: '#101319',
  },
  timelineCopy: {
    flex: 1,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F1F3',
    gap: 2,
  },
  timelineLabel: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    color: '#101319',
  },
  timelineMeta: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8A8F98',
  },
  quickCheckBar: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAEE',
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    height: 68,
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    shadowColor: '#101319',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
  },
  quickMoodScroll: {
    alignItems: 'center',
    gap: 6,
    paddingRight: 6,
  },
  quickMoodScroller: {
    flex: 1,
  },
  quickMoodButton: {
    alignItems: 'center',
    backgroundColor: '#F7F7F8',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  quickMoodButtonActive: {
    backgroundColor: '#FFF2D8',
  },
  quickMoodText: {
    fontSize: 26,
  },
  quickPlusButton: {
    alignItems: 'center',
    backgroundColor: '#F1F1F3',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  emojiOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(16,19,25,0.20)',
  },
  emojiSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    bottom: 0,
    gap: 14,
    left: 0,
    paddingHorizontal: 22,
    paddingTop: 12,
    position: 'absolute',
    right: 0,
  },
  emojiSheetHandle: {
    alignSelf: 'center',
    backgroundColor: '#D8D8D8',
    borderRadius: 999,
    height: 4,
    width: 40,
  },
  emojiSheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  emojiSheetTitle: {
    color: '#101319',
    fontSize: 24,
    fontWeight: '800',
  },
  emojiSheetSubtitle: {
    color: '#8A8F98',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 3,
  },
  emojiCloseButton: {
    alignItems: 'center',
    backgroundColor: '#F1F1F3',
    borderRadius: 999,
    height: 36,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  emojiCloseText: {
    color: '#101319',
    fontSize: 13,
    fontWeight: '800',
  },
  emojiInputRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  emojiInput: {
    backgroundColor: '#F4F1EA',
    borderRadius: 18,
    color: '#101319',
    flex: 1,
    fontSize: 28,
    fontWeight: '800',
    height: 54,
    paddingHorizontal: 16,
    textAlign: 'center',
  },
  emojiAddButton: {
    alignItems: 'center',
    backgroundColor: '#FF9F0A',
    borderRadius: 18,
    height: 54,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  emojiAddText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  emojiError: {
    color: '#B4532A',
    fontSize: 13,
    fontWeight: '700',
  },
  customEmojiWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  customEmojiChip: {
    alignItems: 'center',
    backgroundColor: '#FFF2D8',
    borderRadius: 18,
    flexDirection: 'row',
    gap: 6,
    height: 38,
    paddingHorizontal: 12,
  },
  customEmojiText: {
    fontSize: 20,
  },
  customEmojiDelete: {
    color: '#8C7755',
    fontSize: 12,
    fontWeight: '800',
  },
  toast: {
    position: 'absolute',
    left: 24,
    right: 24,
    minHeight: 48,
    borderRadius: 22,
    backgroundColor: '#101319',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  toastText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
})
