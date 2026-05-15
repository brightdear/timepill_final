import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useRouter } from 'expo-router'
import * as Notifications from 'expo-notifications'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@/components/AppIcon'
import { AppToast } from '@/components/AppToast'
import { JellyBalanceChip } from '@/components/JellyBalanceChip'
import { TAB_BAR_BASE_HEIGHT } from '@/components/layout/FloatingBottom'
import { StatusMascot } from '@/components/mascot/StatusMascot'
import {
  MASCOT_STATUS_DETAILS,
  getMascotLabel,
  type MascotStatusKey,
} from '@/constants/mascotStatus'
import type { Lang } from '@/constants/translations'
import type { ReminderMode } from '@/db/schema'
import { getDoseRecordsByDate } from '@/domain/doseRecord/repository'
import {
  requestNotificationPermissions,
  resyncAlarmState,
  startAlarmRefreshTask,
} from '@/domain/alarm/alarmScheduler'
import { completeMedicationSchedule } from '@/domain/medicationSchedule/completion'
import { getScanVerificationWindowState } from '@/domain/medicationSchedule/scanWindow'
import { deleteMedicationWithTimes, type MedicationGroup, type MedicationGroupReminder } from '@/domain/medicationSchedule/repository'
import { syncStreakState } from '@/domain/reward/repository'
import { getSettings } from '@/domain/settings/repository'
import { useAppInit } from '@/hooks/useAppInit'
import { useI18n } from '@/hooks/useI18n'
import { useTodayMedicationGroups } from '@/hooks/useTodayMedicationGroups'
import { useWalletSummary } from '@/hooks/useWalletSummary'
import { getDateRange, getLocalDateKey } from '@/utils/dateUtils'
import { subscribeToast, type ToastPayload } from '@/utils/uiEvents'

type TodayScheduleStatus = 'overdue' | 'pending' | 'completed' | 'disabled'

type TodayScheduleItem = {
  id: string
  medicationId: string
  scheduleId: string
  group: MedicationGroup
  reminder: MedicationGroupReminder
  medicationName: string
  timeLabel: string
  scheduledTimestamp: number
  status: TodayScheduleStatus
  reminderMode: ReminderMode
  remainingQuantity: number | null
  doseAmount: number | null
}

type WeekProgressState = 'complete' | 'partial' | 'missed' | 'none'

type HomeStreakSummary = Awaited<ReturnType<typeof syncStreakState>>

const SCREEN_PADDING = 20
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
let notificationBannerDismissedForSession = false

const HOME_COPY = {
  ko: {
    emptyTitle: '오늘 일정이 없어요',
    addMedication: '약 추가',
    statePending: '예정',
    stateDone: '완료',
    stateOverdue: '지남',
    stateOff: '꺼짐',
    actionScan: '스캔하기',
    actionScanUpcoming: '스캔 대기',
    actionScanExpired: '스캔 만료',
    actionCheck: '완료하기',
    actionDone: '완료됨',
    actionOff: '알림 꺼짐',
    actionWorking: '처리 중',
    reminderModes: {
      off: '알림 꺼짐',
      notify: '알림 전용',
      scan: '스캔 필요',
    },
    statRemaining: '남은 수량',
    statTakenToday: '오늘 복용',
    statDose: '1회 용량',
    quantityOff: '추적 안 함',
    todaySchedule: '오늘 일정',
    quickScanTitle: '빠른 스캔',
    scanTestTitle: '스캔 테스트',
    scanTestCaption: '기록 없이 카메라만 확인',
    permissionTitle: '알림 꺼짐',
    permissionCaption: '',
    settings: '설정',
    cannotCheckTitle: '체크할 수 없어요',
    cannotCheckMessage: '지금 처리할 수 있는 기록이 없습니다.',
  },
  en: {
    emptyTitle: 'No medication scheduled today',
    addMedication: 'Add medication',
    statePending: 'Upcoming',
    stateDone: 'Done',
    stateOverdue: 'Overdue',
    stateOff: 'Off',
    actionScan: 'Scan',
    actionScanUpcoming: 'Not yet',
    actionScanExpired: 'Expired',
    actionCheck: 'Complete',
    actionDone: 'Done',
    actionOff: 'Alerts off',
    actionWorking: 'Working',
    reminderModes: {
      off: 'Alerts off',
      notify: 'Reminder only',
      scan: 'Scan required',
    },
    statRemaining: 'Remaining',
    statTakenToday: 'Taken today',
    statDose: 'Dose',
    quantityOff: 'Not tracked',
    todaySchedule: 'Today schedule',
    quickScanTitle: 'Quick scan',
    scanTestTitle: 'Scan test',
    scanTestCaption: 'Camera test only',
    permissionTitle: 'Notifications off',
    permissionCaption: '',
    settings: 'Settings',
    cannotCheckTitle: 'Cannot complete this yet',
    cannotCheckMessage: 'There is no pending record for this schedule.',
  },
  ja: {
    emptyTitle: '今日の予定はありません',
    addMedication: '薬を追加',
    statePending: '予定',
    stateDone: '完了',
    stateOverdue: '遅れ',
    stateOff: 'オフ',
    actionScan: 'スキャン',
    actionScanUpcoming: '待機中',
    actionScanExpired: '期限切れ',
    actionCheck: '完了する',
    actionDone: '完了済み',
    actionOff: '通知オフ',
    actionWorking: '処理中',
    reminderModes: {
      off: '通知オフ',
      notify: '通知のみ',
      scan: 'スキャン必要',
    },
    statRemaining: '残量',
    statTakenToday: '今日の服用',
    statDose: '1回量',
    quantityOff: '追跡なし',
    todaySchedule: '今日の予定',
    quickScanTitle: 'クイックスキャン',
    scanTestTitle: 'スキャンテスト',
    scanTestCaption: '記録なしでカメラのみ確認',
    permissionTitle: '通知オフ',
    permissionCaption: '',
    settings: '設定',
    cannotCheckTitle: '今は完了できません',
    cannotCheckMessage: '処理できる保留レコードがありません。',
  },
} as const

type HomeCopy = (typeof HOME_COPY)[Lang]

function formatHomeDateTitle(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const weekday = WEEKDAY_LABELS[date.getDay()]

  return `${month}.${day} ${weekday}`
}

function formatHomeStreakTitle(streak: number, lang: Lang) {
  if (lang === 'en') return `${streak} Day Streak`
  if (lang === 'ja') return `${streak}日連続服用`
  return `${streak}일 연속 복용`
}

function formatTime24(hour: number, minute: number) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function formatTabletCount(count: number, lang: Lang) {
  if (lang === 'en') return `${count} tabs`
  if (lang === 'ja') return `${count}錠`
  return `${count}정`
}

function formatDoseAmount(count: number, lang: Lang) {
  if (lang === 'en') return `${count} tab / dose`
  if (lang === 'ja') return `${count}錠 / 回`
  return `${count}정 / 회`
}

function normalizeReminderMode(value?: string | null): ReminderMode {
  return value === 'off' || value === 'scan' || value === 'notify' ? value : 'scan'
}

function displayMedicationName(group: MedicationGroup) {
  return group.medication.aliasName || group.medication.name || 'Medication'
}

function isTakenReminder(reminder: MedicationGroupReminder) {
  const status = reminder.doseRecord?.status
  return status === 'completed' || status === 'frozen'
}

function isSettledReminder(reminder: MedicationGroupReminder) {
  const status = reminder.doseRecord?.status
  return status === 'completed' || status === 'frozen' || status === 'skipped'
}

function isDisabledReminder(reminder: MedicationGroupReminder) {
  return normalizeReminderMode(reminder.reminderMode) === 'off' || reminder.isActive === 0
}

function reminderScheduledTimestamp(reminder: MedicationGroupReminder) {
  if (reminder.doseRecord?.scheduledTime) return new Date(reminder.doseRecord.scheduledTime).getTime()

  const fallback = new Date()
  fallback.setHours(reminder.hour, reminder.minute, 0, 0)
  return fallback.getTime()
}

function scanWindowStateForReminder(reminder: MedicationGroupReminder) {
  const record = reminder.doseRecord
  if (!record || record.status !== 'pending') return 'upcoming'
  return getScanVerificationWindowState({
    scheduledDate: record.dayKey,
    scheduledTime: record.scheduledTime,
  })
}

function reminderWindowState(reminder: MedicationGroupReminder) {
  const record = reminder.doseRecord
  if (!record || record.status !== 'pending') return 'upcoming'

  if (normalizeReminderMode(reminder.reminderMode) === 'scan') {
    const scanWindowState = scanWindowStateForReminder(reminder)
    if (scanWindowState === 'expired') return 'overdue'
    if (scanWindowState === 'open') return 'due'
    return 'upcoming'
  }

  const scheduled = new Date(record.scheduledTime).getTime()
  const halfWindow = ((reminder.verificationWindowMin ?? 60) / 2) * 60 * 1000
  const now = Date.now()

  if (now > scheduled + halfWindow) return 'overdue'
  if (now >= scheduled - halfWindow) return 'due'
  return 'upcoming'
}

function resolveTodayScheduleStatus(reminder: MedicationGroupReminder): TodayScheduleStatus {
  if (isDisabledReminder(reminder)) return 'disabled'
  if (isSettledReminder(reminder)) return 'completed'
  if (reminder.doseRecord?.status === 'missed' || reminderWindowState(reminder) === 'overdue') return 'overdue'
  return 'pending'
}

function scheduleStatusRank(status: TodayScheduleStatus) {
  if (status === 'pending') return 0
  if (status === 'overdue') return 1
  if (status === 'completed') return 2
  return 3
}

function remainingQuantityValue(group: MedicationGroup) {
  if (group.medication.quantityTrackingEnabled !== 1) return null
  return group.medication.remainingQuantity ?? group.medication.currentQuantity ?? null
}

function takenTodayAmount(group: MedicationGroup) {
  return group.reminders.reduce((total, reminder) => {
    if (!isTakenReminder(reminder)) return total
    return total + (reminder.doseRecord?.targetDoseCount ?? reminder.doseCountPerIntake ?? group.medication.dosePerIntake ?? 0)
  }, 0)
}

function buildTodayScheduleItems(groups: MedicationGroup[]) {
  return groups
    .flatMap(group => group.reminders.map(reminder => ({
      id: reminder.id,
      medicationId: group.medication.id,
      scheduleId: reminder.id,
      group,
      reminder,
      medicationName: displayMedicationName(group),
      timeLabel: formatTime24(reminder.hour, reminder.minute),
      scheduledTimestamp: reminderScheduledTimestamp(reminder),
      status: resolveTodayScheduleStatus(reminder),
      reminderMode: normalizeReminderMode(reminder.reminderMode),
      remainingQuantity: remainingQuantityValue(group),
      doseAmount: group.medication.dosePerIntake ?? reminder.doseCountPerIntake ?? null,
    } satisfies TodayScheduleItem)))
    .sort((left, right) => {
      // Same medication: preserve time order regardless of status
      if (left.medicationId === right.medicationId) {
        return left.scheduledTimestamp - right.scheduledTimestamp
      }

      const rank = scheduleStatusRank(left.status) - scheduleStatusRank(right.status)
      if (rank !== 0) return rank

      const timeRank = left.scheduledTimestamp - right.scheduledTimestamp
      if (timeRank !== 0) return timeRank

      const nameRank = left.medicationName.localeCompare(right.medicationName)
      if (nameRank !== 0) return nameRank

      return left.scheduleId.localeCompare(right.scheduleId)
    })
}

function isScanActionOpen(item: TodayScheduleItem) {
  return item.reminderMode === 'scan' && scanWindowStateForReminder(item.reminder) === 'open'
}

function buildMedicationScheduleRows(group: MedicationGroup, selectedScheduleId: string) {
  return [...group.reminders]
    .sort((left, right) => {
      const timeRank = reminderScheduledTimestamp(left) - reminderScheduledTimestamp(right)
      if (timeRank !== 0) return timeRank
      return left.id.localeCompare(right.id)
    })
    .map(reminder => ({
      id: reminder.id,
      timeLabel: formatTime24(reminder.hour, reminder.minute),
      status: resolveTodayScheduleStatus(reminder),
      isSelected: reminder.id === selectedScheduleId,
    }))
}

function scheduleStatusLabel(status: TodayScheduleStatus, copy: HomeCopy) {
  if (status === 'completed') return copy.stateDone
  if (status === 'overdue') return copy.stateOverdue
  if (status === 'disabled') return copy.stateOff
  return copy.statePending
}

function resolveHomeMascotState(args: {
  currentStreak: number
  hasMissedToday: boolean
  surprise?: boolean
}) {
  const { currentStreak, hasMissedToday, surprise = false } = args

  if (surprise) return 'surprised' as const
  if (hasMissedToday || currentStreak === 0) return 'sad' as const
  if (currentStreak <= 2) return 'soso' as const
  if (currentStreak <= 4) return 'normal' as const
  if (currentStreak <= 6) return 'proud' as const
  return 'happy' as const
}

function detailCardMascotKey(item: TodayScheduleItem, homeMascotKey: MascotStatusKey) {
  if (item.status === 'completed') {
    if (homeMascotKey === 'proud' || homeMascotKey === 'happy' || homeMascotKey === 'surprised') return homeMascotKey
    return 'happy' as const
  }
  if (item.status === 'overdue') return homeMascotKey === 'sad' ? 'sad' as const : 'soso' as const
  if (item.status === 'disabled') return 'normal' as const
  if (homeMascotKey === 'surprised') return 'surprised' as const
  return 'normal' as const
}

function weekProgressState(records: Array<{ status: string }>): WeekProgressState {
  if (records.length === 0) return 'none'

  const completedCount = records.filter(record => record.status === 'completed' || record.status === 'frozen').length
  const missedCount = records.filter(record => record.status === 'missed' || record.status === 'skipped').length

  if (completedCount === records.length) return 'complete'
  if (missedCount > 0) return 'missed'
  if (completedCount > 0) return 'partial'
  return 'none'
}

function scheduleDotStyle(status: TodayScheduleStatus) {
  if (status === 'overdue') return styles.statusDotOverdue
  if (status === 'completed') return styles.statusDotCompleted
  if (status === 'disabled') return styles.statusDotDisabled
  return styles.statusDotPending
}

function detailCardStyle(status: TodayScheduleStatus) {
  if (status === 'overdue') return styles.detailCardOverdue
  if (status === 'completed') return styles.detailCardCompleted
  if (status === 'disabled') return styles.detailCardDisabled
  return styles.detailCardPending
}

function stateChipStyle(status: TodayScheduleStatus) {
  if (status === 'overdue') return styles.stateChipOverdue
  if (status === 'completed') return styles.stateChipCompleted
  if (status === 'disabled') return styles.stateChipDisabled
  return styles.stateChipPending
}

function stateChipTextStyle(status: TodayScheduleStatus) {
  if (status === 'overdue') return styles.stateChipTextOverdue
  if (status === 'completed') return styles.stateChipTextCompleted
  if (status === 'disabled') return styles.stateChipTextDisabled
  return styles.stateChipTextPending
}

function actionProps(item: TodayScheduleItem, copy: HomeCopy) {
  if (item.status === 'completed') {
    return { label: copy.actionDone, disabled: true }
  }

  if (item.status === 'disabled') {
    return { label: copy.actionOff, disabled: true }
  }

  if (item.reminderMode === 'scan') {
    const scanWindowState = scanWindowStateForReminder(item.reminder)
    if (scanWindowState === 'upcoming' || scanWindowState === 'invalid') {
      return { label: copy.actionScanUpcoming, disabled: true }
    }
    if (scanWindowState === 'expired') {
      return { label: copy.actionScanExpired, disabled: true }
    }
    return { label: copy.actionScan, disabled: false }
  }

  return { label: copy.actionCheck, disabled: false }
}

function DetailCard({
  item,
  copy,
  lang,
  width,
  dayMascotKey,
  busy,
  onEdit,
  onDelete,
  onPrimaryAction,
}: {
  item: TodayScheduleItem
  copy: HomeCopy
  lang: Lang
  width: number
  dayMascotKey: MascotStatusKey
  busy: boolean
  onEdit: (medicationId: string) => void
  onDelete: (medicationId: string) => void
  onPrimaryAction: (item: TodayScheduleItem) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const action = actionProps(item, copy)
  const accentMascotKey = detailCardMascotKey(item, dayMascotKey)
  const scheduleRows = buildMedicationScheduleRows(item.group, item.scheduleId)
  const remainingText = item.remainingQuantity != null ? formatTabletCount(item.remainingQuantity, lang) : copy.quantityOff
  const takenTodayText = formatTabletCount(takenTodayAmount(item.group), lang)
  const doseText = formatDoseAmount(item.doseAmount ?? 0, lang)

  return (
    <View style={[styles.detailCard, detailCardStyle(item.status), { width }]}>
      <View style={styles.detailHeader}>
        <TouchableOpacity
          accessibilityLabel="Medication menu"
          onPress={() => setMenuOpen(prev => !prev)}
          style={styles.detailMenuButton}
        >
          <Ionicons name="ellipsis-horizontal" size={18} color="#69707D" />
        </TouchableOpacity>

        {menuOpen ? (
          <View style={styles.inlineDropdown}>
            <TouchableOpacity
              style={styles.inlineDropdownItem}
              onPress={() => { setMenuOpen(false); onEdit(item.medicationId) }}
            >
              <Ionicons name="create-outline" size={15} color="#1C1B1F" />
              <Text style={styles.inlineDropdownText}>편집</Text>
            </TouchableOpacity>
            <View style={styles.inlineDropdownDivider} />
            <TouchableOpacity
              style={styles.inlineDropdownItem}
              onPress={() => { setMenuOpen(false); onDelete(item.medicationId) }}
            >
              <Ionicons name="trash-outline" size={15} color="#EF4444" />
              <Text style={[styles.inlineDropdownText, styles.inlineDropdownDanger]}>삭제</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <StatusMascot size={92} statusKey={accentMascotKey} style={styles.detailMascot} />

        <View style={styles.detailLead}>
          <View style={styles.detailNameRow}>
            <View style={[styles.colorSwatch, { backgroundColor: item.group.medication.color || '#F59E0B' }]} />
            <Text numberOfLines={1} style={styles.detailName}>{item.medicationName}</Text>
          </View>
          <Text style={styles.detailTime}>{item.timeLabel}</Text>
        </View>
      </View>

      <View style={styles.detailMetaRow}>
        <View style={[styles.stateChip, stateChipStyle(item.status)]}>
          <Text style={[styles.stateChipText, stateChipTextStyle(item.status)]}>{scheduleStatusLabel(item.status, copy)}</Text>
        </View>
        <Text numberOfLines={1} style={styles.reminderModeText}>{copy.reminderModes[item.reminderMode]}</Text>
      </View>

      <View style={styles.statGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>{copy.statRemaining}</Text>
          <Text style={styles.statValue}>{remainingText}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>{copy.statTakenToday}</Text>
          <Text style={styles.statValue}>{takenTodayText}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>{copy.statDose}</Text>
          <Text style={styles.statValue}>{doseText}</Text>
        </View>
      </View>

      <View style={styles.scheduleSection}>
        <Text style={styles.scheduleSectionTitle}>{copy.todaySchedule}</Text>
        <View style={styles.scheduleList}>
          {scheduleRows.map(row => (
            <View key={row.id} style={[styles.scheduleRow, row.isSelected && styles.scheduleRowSelected]}>
              <View style={styles.scheduleRowLead}>
                <View style={[styles.scheduleRowDot, scheduleDotStyle(row.status)]} />
                <Text style={[styles.scheduleRowTime, row.isSelected && styles.scheduleRowTimeSelected]}>{row.timeLabel}</Text>
              </View>
              <Text style={[styles.scheduleRowStatus, row.isSelected && styles.scheduleRowStatusSelected]}>
                {scheduleStatusLabel(row.status, copy)}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <TouchableOpacity
        disabled={action.disabled || busy}
        onPress={() => onPrimaryAction(item)}
        style={[
          styles.primaryAction,
          item.status === 'overdue' && styles.primaryActionOverdue,
          (action.disabled || busy) && styles.primaryActionDisabled,
        ]}
      >
        <Text style={(action.disabled || busy) ? styles.primaryActionTextDisabled : styles.primaryActionText}>
          {busy ? copy.actionWorking : action.label}
        </Text>
      </TouchableOpacity>
    </View>
  )
}

export default function HomeTabScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { width: screenWidth } = useWindowDimensions()
  const { lang } = useI18n()
  const copy = HOME_COPY[lang]
  const { isReady } = useAppInit()
  const { data: groups, loading, refresh } = useTodayMedicationGroups(isReady)
  const { wallet, loading: walletLoading, reload: reloadWallet } = useWalletSummary()
  const [devModeEnabled, setDevModeEnabled] = useState(false)
  const [streakSummary, setStreakSummary] = useState<HomeStreakSummary | null>(null)
  const [recentWeekStates, setRecentWeekStates] = useState<WeekProgressState[]>([])
  const [notificationsGranted, setNotificationsGranted] = useState(true)
  const [permissionBannerDismissed, setPermissionBannerDismissed] = useState(notificationBannerDismissedForSession)
  const [submittingId, setSubmittingId] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<ToastPayload | null>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const timelineListRef = useRef<FlatList<TodayScheduleItem> | null>(null)
  const detailPagerRef = useRef<FlatList<TodayScheduleItem> | null>(null)
  const selectedScheduleIdRef = useRef<string | null>(null)

  const refreshMeta = useCallback(async () => {
    const today = new Date()
    const weekStart = new Date(today)
    weekStart.setDate(today.getDate() - 6)
    const weekKeys = getDateRange(getLocalDateKey(weekStart), getLocalDateKey(today))

    const [settings, streak, permission, weekRecords] = await Promise.all([
      getSettings(),
      syncStreakState(),
      Notifications.getPermissionsAsync(),
      Promise.all(weekKeys.map(dayKey => getDoseRecordsByDate(dayKey))),
    ])

    setDevModeEnabled(settings.devMode === 1)
    setStreakSummary(streak ?? null)
    setRecentWeekStates(weekRecords.map(records => weekProgressState(records)))
    setNotificationsGranted(Boolean(permission.granted || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL))
  }, [])

  useFocusEffect(
    useCallback(() => {
      if (!isReady) return
      void refreshMeta()
    }, [isReady, refreshMeta]),
  )

  useEffect(() => {
    const unsubscribe = subscribeToast(payload => {
      const captionParts = payload.caption?.split(' · ').filter(Boolean) ?? []
      const [headline, ...rest] = captionParts

      setToastMessage({
        message: headline || copy.actionDone,
        caption: rest.length > 0 ? rest.join(' · ') : undefined,
        jellyDelta: payload.jellyDelta,
      })

      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      toastTimerRef.current = setTimeout(() => setToastMessage(null), 1800)
    })

    return () => {
      unsubscribe()
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [copy.actionDone])

  const todayScheduleItems = useMemo(() => buildTodayScheduleItems(groups), [groups])
  const needsNotificationBanner = !notificationsGranted && groups.some(group => group.reminders.some(reminder => normalizeReminderMode(reminder.reminderMode) !== 'off'))
  const showNotificationBanner = needsNotificationBanner && !permissionBannerDismissed
  const nextScanItem = todayScheduleItems.find(item => isScanActionOpen(item)) ?? null
  const showQuickScanCard = Boolean(nextScanItem) || devModeEnabled
  const homeDateTitle = useMemo(() => formatHomeDateTitle(new Date()), [])
  const timelineTabWidth = useMemo(() => Math.max(78, Math.min(84, Math.floor((screenWidth - SCREEN_PADDING * 2) / 4.35))), [screenWidth])
  const timelineItemWidth = timelineTabWidth + 4
  const detailPagerWidth = screenWidth
  const detailCardWidth = Math.max(300, screenWidth - 32)
  const currentStreak = streakSummary?.currentStreak ?? 0
  const hasMissedToday = todayScheduleItems.some(item => item.status === 'overdue')
  const dayMascotKey = resolveHomeMascotState({ currentStreak, hasMissedToday })
  const dayMascotDetails = MASCOT_STATUS_DETAILS[dayMascotKey]
  const dayMascotLabel = getMascotLabel(dayMascotKey, lang)
  const streakTitle = formatHomeStreakTitle(currentStreak, lang)
  const floatingBannerBottom = TAB_BAR_BASE_HEIGHT + insets.bottom + 12
  const homeToastBottom = showNotificationBanner ? floatingBannerBottom + 78 : TAB_BAR_BASE_HEIGHT + insets.bottom + 12

  const handleDismissPermissionBanner = useCallback(() => {
    notificationBannerDismissedForSession = true
    setPermissionBannerDismissed(true)
  }, [])

  const handleNotificationPermissionPress = useCallback(async () => {
    const permission = await Notifications.getPermissionsAsync()

    if (permission.canAskAgain !== false) {
      const granted = await requestNotificationPermissions()
      setNotificationsGranted(granted)
      if (granted) {
        await resyncAlarmState()
        await startAlarmRefreshTask()
        return
      }
    }

    await Linking.openSettings()
  }, [])

  const scrollTimelineToIndex = useCallback((index: number, animated = true) => {
    if (todayScheduleItems.length === 0) return

    requestAnimationFrame(() => {
      timelineListRef.current?.scrollToIndex({ index, animated, viewPosition: 0.5 })
    })
  }, [todayScheduleItems.length])

  const scrollPagerToIndex = useCallback((index: number, animated = true) => {
    if (todayScheduleItems.length === 0) return

    requestAnimationFrame(() => {
      detailPagerRef.current?.scrollToIndex({ index, animated })
    })
  }, [todayScheduleItems.length])

  const syncSelectedIndex = useCallback((nextIndex: number, source: 'timeline' | 'pager' | 'data', animated = true) => {
    if (todayScheduleItems.length === 0) return

    const clampedIndex = Math.max(0, Math.min(todayScheduleItems.length - 1, nextIndex))
    const selectedItem = todayScheduleItems[clampedIndex]
    if (!selectedItem) return

    selectedScheduleIdRef.current = selectedItem.scheduleId
    setSelectedIndex(current => (current === clampedIndex ? current : clampedIndex))
    scrollTimelineToIndex(clampedIndex, animated)

    if (source !== 'pager') {
      scrollPagerToIndex(clampedIndex, animated)
    }
  }, [scrollPagerToIndex, scrollTimelineToIndex, todayScheduleItems])

  useEffect(() => {
    if (todayScheduleItems.length === 0) {
      selectedScheduleIdRef.current = null
      setSelectedIndex(0)
      return
    }

    const nextIndexById = selectedScheduleIdRef.current
      ? todayScheduleItems.findIndex(item => item.scheduleId === selectedScheduleIdRef.current)
      : -1
    const fallbackIndex = Math.min(selectedIndex, todayScheduleItems.length - 1)

    syncSelectedIndex(nextIndexById >= 0 ? nextIndexById : fallbackIndex, 'data', false)
  }, [selectedIndex, syncSelectedIndex, todayScheduleItems])

  const handleTimelineScrollToIndexFailed = useCallback((info: { index: number; averageItemLength: number }) => {
    timelineListRef.current?.scrollToOffset({
      offset: Math.max(0, info.index * (info.averageItemLength || timelineItemWidth)),
      animated: true,
    })
  }, [timelineItemWidth])

  const handlePagerScrollToIndexFailed = useCallback((info: { index: number; averageItemLength: number }) => {
    detailPagerRef.current?.scrollToOffset({
      offset: Math.max(0, info.index * (info.averageItemLength || detailPagerWidth)),
      animated: true,
    })
  }, [detailPagerWidth])

  const handlePagerMomentumEnd = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (todayScheduleItems.length <= 1) return

    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / detailPagerWidth)
    syncSelectedIndex(nextIndex, 'pager')
  }, [detailPagerWidth, syncSelectedIndex, todayScheduleItems.length])

  const openRegistration = useCallback(() => {
    router.push('/check-item')
  }, [router])

  const openEdit = useCallback((medicationId: string) => {
    router.push({ pathname: '/check-item', params: { medicationId } })
  }, [router])

  const handleDeleteMedication = useCallback((medicationId: string) => {
    Alert.alert('약 삭제', '이 약과 모든 복용 시간을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          await deleteMedicationWithTimes(medicationId)
          refresh()
        },
      },
    ])
  }, [refresh])

  const openScan = useCallback((item: TodayScheduleItem) => {
    router.navigate({
      pathname: '/scan',
      params: {
        slotId: item.scheduleId,
        scheduleId: item.scheduleId,
        medicationId: item.medicationId,
        scheduledDate: item.reminder.doseRecord?.dayKey ?? getLocalDateKey(),
        scheduledTime: item.reminder.doseRecord?.scheduledTime ?? item.timeLabel,
      },
    })
  }, [router])

  const handlePrimaryAction = useCallback(async (item: TodayScheduleItem) => {
    if (item.status === 'completed' || item.status === 'disabled' || submittingId === item.id) return

    if (item.reminderMode === 'scan') {
      if (!isScanActionOpen(item)) return
      openScan(item)
      return
    }

    const pendingRecord = item.reminder.doseRecord

    setSubmittingId(item.id)

    try {
      const result = await completeMedicationSchedule({
        medicationId: item.medicationId,
        scheduleId: item.scheduleId,
        scheduledDate: pendingRecord?.dayKey ?? getLocalDateKey(),
        scheduledTime: pendingRecord?.scheduledTime ?? item.timeLabel,
        method: 'manual',
      })
      if (!result.success) {
        throw new Error(result.error ?? copy.cannotCheckMessage)
      }
      await Promise.all([refresh(), reloadWallet(), refreshMeta()])
    } catch (error) {
      Alert.alert(copy.cannotCheckTitle, error instanceof Error ? error.message : copy.cannotCheckMessage)
    } finally {
      setSubmittingId(null)
    }
  }, [copy.cannotCheckMessage, copy.cannotCheckTitle, openScan, refresh, refreshMeta, reloadWallet, submittingId])

  if (!isReady || loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#F59E0B" />
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.root}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 8,
          paddingHorizontal: SCREEN_PADDING,
          paddingBottom: TAB_BAR_BASE_HEIGHT + insets.bottom + 28,
        }}
      >
        <View style={styles.header}>
          <Text style={styles.headerDate}>{homeDateTitle}</Text>

          <View style={styles.headerActions}>
            <JellyBalanceChip balance={wallet?.balance} compact loading={walletLoading} />
            <TouchableOpacity style={styles.addButton} onPress={openRegistration} accessibilityLabel={copy.addMedication}>
              <Ionicons name="add" size={20} color="#101319" />
            </TouchableOpacity>
          </View>
        </View>

        {todayScheduleItems.length > 0 ? (
          <>
            <FlatList
              ref={timelineListRef}
              data={todayScheduleItems}
              horizontal
              bounces={false}
              contentContainerStyle={styles.timelineListContent}
              getItemLayout={(_, index) => ({ length: timelineItemWidth, offset: timelineItemWidth * index, index })}
              keyExtractor={item => `timeline-${item.scheduleId}`}
              onScrollToIndexFailed={handleTimelineScrollToIndexFailed}
              showsHorizontalScrollIndicator={false}
              style={styles.timelineList}
              renderItem={({ item, index }) => (
                <View style={[styles.timelineItem, { width: timelineItemWidth }]}> 
                  <TouchableOpacity
                    activeOpacity={0.9}
                    onPress={() => syncSelectedIndex(index, 'timeline')}
                    style={[
                      styles.timelineTab,
                      { width: timelineTabWidth },
                      index === selectedIndex && styles.timelineTabSelected,
                    ]}
                  >
                    <Text numberOfLines={1} style={[styles.timelineTime, index === selectedIndex && styles.timelineTimeSelected]}>
                      {item.timeLabel}
                    </Text>
                    <Text numberOfLines={1} style={[styles.timelineName, index === selectedIndex && styles.timelineNameSelected]}>
                      {item.medicationName}
                    </Text>
                    <View style={styles.timelineStatusRow}>
                      <View style={[styles.timelineStatusDot, scheduleDotStyle(item.status)]} />
                    </View>
                  </TouchableOpacity>
                </View>
              )}
              scrollEnabled={todayScheduleItems.length > 1}
            />

            <FlatList
              ref={detailPagerRef}
              data={todayScheduleItems}
              horizontal
              bounces={false}
              decelerationRate="fast"
              getItemLayout={(_, index) => ({ length: detailPagerWidth, offset: detailPagerWidth * index, index })}
              keyExtractor={item => `detail-${item.scheduleId}`}
              onMomentumScrollEnd={handlePagerMomentumEnd}
              onScrollToIndexFailed={handlePagerScrollToIndexFailed}
              pagingEnabled
              renderItem={({ item }) => (
                <View style={[styles.detailPage, { width: detailPagerWidth }]}> 
                  <DetailCard
                    item={item}
                    copy={copy}
                    lang={lang}
                    width={detailCardWidth}
                    dayMascotKey={dayMascotKey}
                    busy={submittingId === item.id}
                    onEdit={openEdit}
                    onDelete={handleDeleteMedication}
                    onPrimaryAction={handlePrimaryAction}
                  />
                </View>
              )}
              scrollEnabled={todayScheduleItems.length > 1}
              showsHorizontalScrollIndicator={false}
              style={styles.detailPager}
            />
          </>
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{copy.emptyTitle}</Text>
            <TouchableOpacity style={styles.emptyButton} onPress={openRegistration}>
              <Text style={styles.emptyButtonText}>{copy.addMedication}</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={[styles.streakCard, { backgroundColor: dayMascotDetails.surface, borderColor: dayMascotDetails.border }]}> 
          <StatusMascot size={90} statusKey={dayMascotKey} />
          <View style={styles.streakCopy}>
            <Text style={styles.streakTitle}>{streakTitle}</Text>
            <Text style={[styles.streakLabel, { color: dayMascotDetails.accent }]}>{dayMascotLabel}</Text>
            <View style={styles.weekDots}>
              {recentWeekStates.map((state, index) => (
                <View
                  key={`week-${index}`}
                  style={[
                    styles.weekDot,
                    state === 'complete' && styles.weekDotComplete,
                    state === 'partial' && styles.weekDotPartial,
                    state === 'missed' && styles.weekDotMissed,
                  ]}
                />
              ))}
            </View>
          </View>
        </View>

        {showQuickScanCard ? (
          <TouchableOpacity
            activeOpacity={0.84}
            onPress={() => {
              if (nextScanItem) {
                openScan(nextScanItem)
                return
              }

              router.push({ pathname: '/scan', params: { test: '1' } })
            }}
            style={styles.utilityCard}
          >
            <View style={styles.utilityIconAccent}>
              <Ionicons name="scan-outline" size={18} color="#101319" />
            </View>
            <View style={styles.utilityCopy}>
              <Text style={styles.utilityTitle}>{nextScanItem ? copy.quickScanTitle : copy.scanTestTitle}</Text>
              <Text numberOfLines={1} style={styles.utilityCaption}>
                {nextScanItem ? `${nextScanItem.timeLabel} · ${nextScanItem.medicationName}` : copy.scanTestCaption}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#69707D" />
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      {showNotificationBanner ? (
        <View style={[styles.floatingPermissionBanner, { bottom: floatingBannerBottom }]}>
          <View style={styles.floatingPermissionLead}>
            <View style={styles.floatingPermissionIcon}>
              <Ionicons name="notifications-off-outline" size={17} color="#69707D" />
            </View>
            <Text style={styles.floatingPermissionText}>{copy.permissionTitle}</Text>
          </View>
          <View style={styles.floatingPermissionActions}>
            <TouchableOpacity style={styles.floatingPermissionButton} onPress={handleNotificationPermissionPress}>
              <Text style={styles.floatingPermissionButtonText}>{copy.settings}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.floatingPermissionClose} onPress={handleDismissPermissionBanner}>
              <Ionicons name="close" size={15} color="#69707D" />
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <AppToast bottom={homeToastBottom} payload={toastMessage} />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FAFAF8',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAFAF8',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    minHeight: 40,
  },
  headerDate: {
    color: '#101319',
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 24,
    paddingRight: 8,
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  addButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 999,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  timelineList: {
    marginHorizontal: -SCREEN_PADDING,
  },
  timelineListContent: {
    paddingHorizontal: SCREEN_PADDING,
    paddingRight: SCREEN_PADDING + 4,
  },
  timelineItem: {
    justifyContent: 'center',
  },
  timelineTab: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 18,
    borderWidth: 1,
    gap: 3,
    minHeight: 68,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  timelineTabSelected: {
    backgroundColor: '#FFF6EA',
    borderColor: '#E3C58E',
  },
  timelineTime: {
    color: '#101319',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    lineHeight: 17,
  },
  timelineTimeSelected: {
    color: '#B06912',
  },
  timelineName: {
    color: '#69707D',
    fontSize: 10,
    fontWeight: '600',
    lineHeight: 12,
  },
  timelineNameSelected: {
    color: '#101319',
  },
  timelineStatusRow: {
    alignItems: 'flex-end',
    marginTop: 'auto',
  },
  timelineStatusDot: {
    borderRadius: 999,
    height: 6,
    width: 6,
  },
  statusDotPending: {
    backgroundColor: '#E69E22',
  },
  statusDotOverdue: {
    backgroundColor: '#D1653A',
  },
  statusDotCompleted: {
    backgroundColor: '#7E8794',
  },
  statusDotDisabled: {
    backgroundColor: '#C8CDD5',
  },
  detailPager: {
    marginHorizontal: -SCREEN_PADDING,
    marginTop: 8,
  },
  detailPage: {
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  detailCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 28,
    borderWidth: 1,
    gap: 8,
    padding: 16,
  },
  detailCardPending: {
    backgroundColor: '#FFFDF8',
    borderColor: '#E6D1AF',
  },
  detailCardOverdue: {
    backgroundColor: '#FFF8F4',
    borderColor: '#E9C8BF',
  },
  detailCardCompleted: {
    backgroundColor: '#F5F6F8',
    borderColor: '#E2E7EC',
  },
  detailCardDisabled: {
    backgroundColor: '#F5F6F8',
    borderColor: '#E1E5EA',
  },
  detailHeader: {
    minHeight: 112,
    position: 'relative',
  },
  detailLead: {
    gap: 6,
    paddingRight: 144,
  },
  detailNameRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  colorSwatch: {
    borderRadius: 6,
    height: 12,
    width: 12,
  },
  detailName: {
    color: '#101319',
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 22,
  },
  detailTime: {
    color: '#101319',
    fontSize: 31,
    fontWeight: '700',
    lineHeight: 35,
  },
  detailMenuButton: {
    alignItems: 'center',
    backgroundColor: '#F6F7F9',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    position: 'absolute',
    right: 0,
    top: 0,
    width: 32,
  },
  detailMascot: {
    position: 'absolute',
    right: 34,
    top: 10,
  },
  detailMetaRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  stateChip: {
    alignItems: 'center',
    borderRadius: 999,
    minHeight: 22,
    justifyContent: 'center',
    paddingHorizontal: 9,
  },
  stateChipPending: {
    backgroundColor: '#FFF1D2',
  },
  stateChipOverdue: {
    backgroundColor: '#FFE7DF',
  },
  stateChipCompleted: {
    backgroundColor: '#EAEFF4',
  },
  stateChipDisabled: {
    backgroundColor: '#ECEFF3',
  },
  stateChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  stateChipTextPending: {
    color: '#A56409',
  },
  stateChipTextOverdue: {
    color: '#C55E37',
  },
  stateChipTextCompleted: {
    color: '#69707D',
  },
  stateChipTextDisabled: {
    color: '#7C8591',
  },
  reminderModeText: {
    color: '#69707D',
    fontSize: 12,
    fontWeight: '600',
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  statCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EBEEF2',
    borderRadius: 14,
    borderWidth: 1,
    flex: 1,
    gap: 2,
    minWidth: 92,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  statLabel: {
    color: '#69707D',
    fontSize: 10,
    fontWeight: '500',
  },
  statValue: {
    color: '#101319',
    fontSize: 13,
    fontWeight: '600',
  },
  scheduleSection: {
    gap: 6,
  },
  scheduleSectionTitle: {
    color: '#101319',
    fontSize: 11,
    fontWeight: '600',
  },
  scheduleList: {
    gap: 4,
  },
  scheduleRow: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: 'transparent',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 34,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  scheduleRowSelected: {
    backgroundColor: '#FFF5E8',
    borderColor: '#E4C58D',
  },
  scheduleRowLead: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  scheduleRowDot: {
    borderRadius: 999,
    height: 6,
    width: 6,
  },
  scheduleRowTime: {
    color: '#101319',
    fontSize: 12,
    fontWeight: '600',
  },
  scheduleRowTimeSelected: {
    color: '#B06912',
  },
  scheduleRowStatus: {
    color: '#69707D',
    fontSize: 10,
    fontWeight: '600',
  },
  scheduleRowStatusSelected: {
    color: '#101319',
  },
  primaryAction: {
    alignItems: 'center',
    backgroundColor: '#101319',
    borderRadius: 14,
    height: 44,
    justifyContent: 'center',
    marginTop: 2,
    paddingHorizontal: 16,
  },
  primaryActionOverdue: {
    backgroundColor: '#D1653A',
  },
  primaryActionDisabled: {
    backgroundColor: '#E5E7EB',
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  primaryActionTextDisabled: {
    color: '#7C8591',
    fontSize: 15,
    fontWeight: '700',
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 28,
    borderWidth: 1,
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 22,
  },
  emptyTitle: {
    color: '#101319',
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  emptyButton: {
    alignItems: 'center',
    backgroundColor: '#101319',
    borderRadius: 999,
    height: 42,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  streakCard: {
    alignItems: 'center',
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    minHeight: 112,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  streakCopy: {
    flex: 1,
    gap: 6,
  },
  streakTitle: {
    color: '#101319',
    fontSize: 18,
    fontWeight: '700',
  },
  streakLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  weekDots: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  weekDot: {
    backgroundColor: '#D6DBE2',
    borderRadius: 999,
    height: 9,
    width: 9,
  },
  weekDotComplete: {
    backgroundColor: '#4AA574',
  },
  weekDotPartial: {
    backgroundColor: '#D39A43',
  },
  weekDotMissed: {
    backgroundColor: '#D1795F',
  },
  utilityCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  utilityIconMuted: {
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 18,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  utilityIconAccent: {
    alignItems: 'center',
    backgroundColor: '#FFF2D8',
    borderRadius: 18,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  utilityCopy: {
    flex: 1,
    gap: 2,
  },
  utilityTitle: {
    color: '#101319',
    fontSize: 15,
    fontWeight: '600',
  },
  utilityCaption: {
    color: '#69707D',
    fontSize: 12,
    fontWeight: '500',
  },
  utilityButton: {
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 999,
    height: 32,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  utilityButtonText: {
    color: '#101319',
    fontSize: 13,
    fontWeight: '700',
  },
  utilityClose: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  floatingPermissionBanner: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 20,
    borderWidth: 1,
    elevation: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: SCREEN_PADDING,
    paddingHorizontal: 14,
    paddingVertical: 10,
    position: 'absolute',
    right: SCREEN_PADDING,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    zIndex: 100,
  },
  floatingPermissionLead: {
    alignItems: 'center',
    flexDirection: 'row',
    flex: 1,
    gap: 10,
    minHeight: 36,
  },
  floatingPermissionIcon: {
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  floatingPermissionText: {
    color: '#101319',
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  floatingPermissionActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginLeft: 10,
  },
  floatingPermissionButton: {
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 999,
    height: 30,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  floatingPermissionButtonText: {
    color: '#101319',
    fontSize: 12,
    fontWeight: '800',
  },
  floatingPermissionClose: {
    alignItems: 'center',
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  inlineDropdown: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 12,
    borderWidth: 1,
    elevation: 6,
    minWidth: 110,
    overflow: 'hidden',
    position: 'absolute',
    right: 0,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    top: 36,
    zIndex: 100,
  },
  inlineDropdownItem: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  inlineDropdownText: {
    color: '#1C1B1F',
    fontSize: 14,
    fontWeight: '600',
  },
  inlineDropdownDivider: {
    backgroundColor: '#F3F4F6',
    height: 1,
  },
  inlineDropdownDanger: {
    color: '#EF4444',
  },
})
