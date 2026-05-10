import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useRouter } from 'expo-router'
import * as Notifications from 'expo-notifications'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@/components/AppIcon'
import { FreezePopup } from '@/components/FreezePopup'
import { FLOATING_GAP, FloatingBottom, TAB_BAR_BASE_HEIGHT } from '@/components/layout/FloatingBottom'
import { Card, ui } from '@/components/ui/ProductUI'
import type { ReminderMode } from '@/db/schema'
import { resyncAlarmState } from '@/domain/alarm/alarmScheduler'
import { updateDoseRecordStatus } from '@/domain/doseRecord/repository'
import { getSettings } from '@/domain/settings/repository'
import {
  deleteMedicationWithTimes,
  deleteReminderTime,
  disableMedicationReminders,
  type MedicationGroup,
  type MedicationGroupReminder,
} from '@/domain/medicationSchedule/repository'
import { useAppInit } from '@/hooks/useAppInit'
import { useI18n } from '@/hooks/useI18n'
import { useTodayMedicationGroups } from '@/hooks/useTodayMedicationGroups'
import { completeVerification } from '@/hooks/useStreakUpdate'
import { useWalletSummary } from '@/hooks/useWalletSummary'
import type { Lang } from '@/constants/translations'
import { fmtTime } from '@/utils/timeUtils'
import { subscribeToast } from '@/utils/uiEvents'

type ActiveSheet =
  | { type: 'reminder'; group: MedicationGroup; reminder: MedicationGroupReminder }
  | { type: 'medication'; group: MedicationGroup }
  | null

type SheetOption = {
  label: string
  icon: React.ComponentProps<typeof Ionicons>['name']
  onPress: () => void
  tone?: 'default' | 'primary' | 'danger'
  disabled?: boolean
}

type ScheduleCardState = 'overdue' | 'pending' | 'completed' | 'off'

type ScheduleCardItem = {
  id: string
  group: MedicationGroup
  reminder: MedicationGroupReminder
  medicationName: string
  quantity: string | null
  mode: ReminderMode
  timeLabel: string
  state: ScheduleCardState
}

const REMINDER_MODE_LABELS: Record<ReminderMode, string> = {
  off: '끔',
  notify: '알림만',
  scan: '스캔까지',
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const HOME_COPY = {
  ko: {
    devScanTitle: '스캔 테스트',
    devScanCaption: '기록 없이 카메라와 모델만 확인',
    emptyTitle: '등록된 약이 없어요',
    emptyCaption: '약을 추가해보세요.',
    addMedication: '약 추가하기',
    statePending: '예정',
    stateDone: '완료',
    stateOverdue: '지남',
    stateOff: '끔',
    actionScan: '스캔하기',
    actionCheck: '체크하기',
    actionDone: '기록됨',
    actionOff: '꺼짐',
    actionManage: '관리',
  },
  en: {
    devScanTitle: 'Scan test',
    devScanCaption: 'Check camera and model only',
    emptyTitle: 'No medication yet',
    emptyCaption: 'Add medication to get started.',
    addMedication: 'Add medication',
    statePending: 'Upcoming',
    stateDone: 'Done',
    stateOverdue: 'Overdue',
    stateOff: 'Off',
    actionScan: 'Scan',
    actionCheck: 'Check',
    actionDone: 'Done',
    actionOff: 'Off',
    actionManage: 'Manage',
  },
  ja: {
    devScanTitle: 'スキャンテスト',
    devScanCaption: '記録なしでカメラとモデルを確認',
    emptyTitle: '登録された薬がありません',
    emptyCaption: '薬を追加してください。',
    addMedication: '薬を追加',
    statePending: '予定',
    stateDone: '完了',
    stateOverdue: '遅れ',
    stateOff: 'オフ',
    actionScan: 'スキャン',
    actionCheck: 'チェック',
    actionDone: '完了',
    actionOff: 'オフ',
    actionManage: '管理',
  },
} as const

export function formatHomeDateTitle(date: Date, lang: Lang) {
  void lang
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const weekday = WEEKDAY_LABELS[date.getDay()]

  return `${month}.${day} ${weekday}`
}

function normalizeReminderMode(value?: string | null): ReminderMode {
  return value === 'off' || value === 'scan' || value === 'notify' ? value : 'scan'
}

function displayMedicationName(group: MedicationGroup) {
  return group.medication.aliasName || group.medication.name || '복용 항목'
}

function actualMedicationName(group: MedicationGroup) {
  const actual = group.medication.actualName?.trim()
  const alias = displayMedicationName(group)
  return actual && actual !== alias ? actual : null
}

function quantityLabel(group: MedicationGroup) {
  if (group.medication.quantityTrackingEnabled !== 1) return null
  const remaining = group.medication.remainingQuantity ?? group.medication.currentQuantity
  if (remaining == null) return null
  return `남은 ${remaining ?? 0}정`
}

function reminderMode(reminder: MedicationGroupReminder) {
  return normalizeReminderMode(reminder.reminderMode)
}

function isCompleted(reminder: MedicationGroupReminder) {
  const status = reminder.doseRecord?.status
  return status === 'completed' || status === 'frozen'
}

function isDisabledReminder(reminder: MedicationGroupReminder) {
  return reminderMode(reminder) === 'off' || reminder.isActive === 0
}

function isSettledReminder(reminder: MedicationGroupReminder) {
  return isCompleted(reminder) || reminder.doseRecord?.status === 'skipped'
}

function reminderScheduledTimestamp(reminder: MedicationGroupReminder) {
  if (reminder.doseRecord?.scheduledTime) return new Date(reminder.doseRecord.scheduledTime).getTime()

  const fallback = new Date()
  fallback.setHours(reminder.hour, reminder.minute, 0, 0)
  return fallback.getTime()
}

function reminderWindowState(reminder: MedicationGroupReminder) {
  const record = reminder.doseRecord
  if (!record || record.status !== 'pending') return 'upcoming'
  const scheduled = new Date(record.scheduledTime).getTime()
  const halfWindow = (reminder.verificationWindowMin / 2) * 60 * 1000
  const now = Date.now()
  if (now > scheduled + halfWindow) return 'overdue'
  if (now >= scheduled - halfWindow) return 'due'
  return 'upcoming'
}

function reminderStatus(reminder: MedicationGroupReminder) {
  const status = reminder.doseRecord?.status
  if (isSettledReminder(reminder)) return '완료'
  if (isDisabledReminder(reminder)) return '알림 꺼짐'
  if (status === 'missed') return '지남'
  const windowState = reminderWindowState(reminder)
  if (windowState === 'overdue') return '지남'
  if (windowState === 'due') return '대기'
  return '예정'
}

function reminderStatusTone(reminder: MedicationGroupReminder, isNextReminder = false) {
  const status = reminder.doseRecord?.status
  if (isSettledReminder(reminder)) return 'done' as const
  if (status === 'missed' || reminderWindowState(reminder) === 'overdue') return 'danger' as const
  if (isDisabledReminder(reminder)) return 'muted' as const
  if (isNextReminder || reminderWindowState(reminder) === 'due') return 'active' as const
  return 'soft' as const
}

function nextUpcomingReminderId(reminders: MedicationGroupReminder[]) {
  const candidates = reminders
    .filter(reminder => !isSettledReminder(reminder))
    .filter(reminder => !isDisabledReminder(reminder))
    .filter(reminder => reminder.doseRecord?.status !== 'missed')
    .filter(reminder => reminderWindowState(reminder) !== 'overdue')
    .sort((left, right) => reminderScheduledTimestamp(left) - reminderScheduledTimestamp(right))

  return candidates[0]?.id ?? null
}

function reminderSortRank(reminder: MedicationGroupReminder, nextReminderId: string | null) {
  if (reminder.id === nextReminderId) return 0
  if (isSettledReminder(reminder)) return 3
  if (isDisabledReminder(reminder)) return 4
  const windowState = reminderWindowState(reminder)
  if (windowState === 'overdue' || reminder.doseRecord?.status === 'missed') return 1
  return 2
}

function sortedReminders(reminders: MedicationGroupReminder[]) {
  const nextReminderId = nextUpcomingReminderId(reminders)

  return [...reminders].sort((left, right) => {
    const byRank = reminderSortRank(left, nextReminderId) - reminderSortRank(right, nextReminderId)
    if (byRank !== 0) return byRank
    return reminderScheduledTimestamp(left) - reminderScheduledTimestamp(right)
  })
}

function groupSortScore(group: MedicationGroup) {
  const firstReminder = sortedReminders(group.reminders)[0]
  if (!firstReminder) return Number.MAX_SAFE_INTEGER
  const nextReminderId = nextUpcomingReminderId(group.reminders)
  return (reminderSortRank(firstReminder, nextReminderId) * 10000000000000) + reminderScheduledTimestamp(firstReminder)
}

function sortedMedicationGroups(groups: MedicationGroup[]) {
  return [...groups].sort((left, right) => groupSortScore(left) - groupSortScore(right))
}

function scheduleCardState(reminder: MedicationGroupReminder): ScheduleCardState {
  if (isDisabledReminder(reminder)) return 'off'
  if (isSettledReminder(reminder)) return 'completed'
  if (reminder.doseRecord?.status === 'missed' || reminderWindowState(reminder) === 'overdue') return 'overdue'
  return 'pending'
}

function scheduleCardStateRank(state: ScheduleCardState) {
  if (state === 'overdue') return 0
  if (state === 'pending') return 1
  if (state === 'completed') return 2
  return 3
}

function scheduleCardStateLabel(item: ScheduleCardItem, copy: typeof HOME_COPY[Lang]) {
  if (item.state === 'completed') return copy.stateDone
  if (item.state === 'off') return copy.stateOff
  if (item.state === 'overdue') return copy.stateOverdue
  return copy.statePending
}

function buildScheduleCards(groups: MedicationGroup[]) {
  return groups
    .flatMap(group => group.reminders.map(reminder => ({
      id: reminder.id,
      group,
      reminder,
      medicationName: displayMedicationName(group),
      quantity: quantityLabel(group),
      mode: reminderMode(reminder),
      timeLabel: fmtTime(reminder.hour, reminder.minute, { am: '오전', pm: '오후' }),
      state: scheduleCardState(reminder),
    } satisfies ScheduleCardItem)))
    .sort((left, right) => {
      const stateRank = scheduleCardStateRank(left.state) - scheduleCardStateRank(right.state)
      if (stateRank !== 0) return stateRank

      const timeRank = reminderScheduledTimestamp(left.reminder) - reminderScheduledTimestamp(right.reminder)
      if (timeRank !== 0) return timeRank

      const nameRank = left.medicationName.localeCompare(right.medicationName, 'ko')
      if (nameRank !== 0) return nameRank

      return left.id.localeCompare(right.id)
    })
}

function ScheduleCarouselCard({
  item,
  copy,
  width,
  devModeEnabled,
  onMedicationPress,
  onReminderPress,
  onPrimaryAction,
}: {
  item: ScheduleCardItem
  copy: typeof HOME_COPY[Lang]
  width: number
  devModeEnabled: boolean
  onMedicationPress: (group: MedicationGroup) => void
  onReminderPress: (group: MedicationGroup, reminder: MedicationGroupReminder) => void
  onPrimaryAction: (item: ScheduleCardItem) => void
}) {
  const stateLabel = scheduleCardStateLabel(item, copy)
  const canComplete = item.reminder.doseRecord?.status === 'pending' && item.state !== 'off' && item.state !== 'completed'
  const actionLabel = item.state === 'completed'
    ? copy.actionDone
    : item.state === 'off'
      ? copy.actionOff
      : canComplete
        ? item.mode === 'scan' && !devModeEnabled
          ? copy.actionScan
          : copy.actionCheck
        : copy.actionManage
  const actionDisabled = item.state === 'completed' || item.state === 'off'

  return (
    <TouchableOpacity
      activeOpacity={0.94}
      onPress={() => onReminderPress(item.group, item.reminder)}
      style={[
        styles.scheduleCard,
        { width },
        item.state === 'pending' && styles.scheduleCardPending,
        item.state === 'overdue' && styles.scheduleCardOverdue,
        item.state === 'completed' && styles.scheduleCardCompleted,
        item.state === 'off' && styles.scheduleCardOff,
      ]}
    >
      <View style={styles.scheduleCardHeader}>
        <View style={styles.scheduleCardHeaderLeft}>
          <View style={[styles.colorSwatch, { backgroundColor: item.group.medication.color || ui.color.orange }]} />
          <View style={[
            styles.scheduleStatePill,
            item.state === 'pending' && styles.scheduleStatePillPending,
            item.state === 'overdue' && styles.scheduleStatePillOverdue,
            item.state === 'completed' && styles.scheduleStatePillCompleted,
            item.state === 'off' && styles.scheduleStatePillOff,
          ]}>
            <Text
              style={[
                styles.scheduleStateText,
                item.state === 'pending' && styles.scheduleStateTextPending,
                item.state === 'overdue' && styles.scheduleStateTextOverdue,
                item.state === 'completed' && styles.scheduleStateTextCompleted,
                item.state === 'off' && styles.scheduleStateTextOff,
              ]}
              numberOfLines={1}
            >
              {stateLabel}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          accessibilityLabel="약 메뉴"
          onPress={event => {
            event.stopPropagation()
            onMedicationPress(item.group)
          }}
          style={styles.scheduleMenuButton}
        >
          <Ionicons name="ellipsis-horizontal" size={18} color={ui.color.textSecondary} />
        </TouchableOpacity>
      </View>

      <Text numberOfLines={1} style={styles.scheduleMedicationName}>{item.medicationName}</Text>
      {item.quantity ? (
        <Text numberOfLines={1} style={styles.scheduleQuantity}>{item.quantity}</Text>
      ) : (
        <View style={styles.scheduleQuantitySpacer} />
      )}

      <View style={styles.scheduleInfoRow}>
        <Text numberOfLines={1} style={styles.scheduleTime}>{item.timeLabel}</Text>
        <ReminderModeBadge mode={item.mode} />
      </View>

      <View style={styles.scheduleFooter}>
        <TouchableOpacity
          disabled={actionDisabled}
          onPress={event => {
            event.stopPropagation()
            onPrimaryAction(item)
          }}
          style={[
            styles.scheduleActionButton,
            item.state === 'overdue' && styles.scheduleActionButtonOverdue,
            item.state === 'completed' && styles.scheduleActionButtonDisabled,
            item.state === 'off' && styles.scheduleActionButtonDisabled,
            !canComplete && item.state !== 'completed' && item.state !== 'off' && styles.scheduleActionButtonSecondary,
          ]}
        >
          <Text
            numberOfLines={1}
            style={[
              styles.scheduleActionText,
              (item.state === 'completed' || item.state === 'off') && styles.scheduleActionTextDisabled,
              !canComplete && item.state !== 'completed' && item.state !== 'off' && styles.scheduleActionTextSecondary,
            ]}
          >
            {actionLabel}
          </Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  )
}

function ReminderModeBadge({ mode }: { mode: ReminderMode }) {
  return (
    <View style={[
      styles.modeBadge,
      mode === 'notify' && styles.modeBadgeNotify,
      mode === 'scan' && styles.modeBadgeScan,
      mode === 'off' && styles.modeBadgeOff,
    ]}>
      <Text style={[
        styles.modeBadgeText,
        mode === 'notify' && styles.modeBadgeTextNotify,
        mode === 'scan' && styles.modeBadgeTextScan,
        mode === 'off' && styles.modeBadgeTextOff,
      ]} numberOfLines={1}>
        {REMINDER_MODE_LABELS[mode]}
      </Text>
    </View>
  )
}

function MedicationCard({
  group,
  onMedicationPress,
  onReminderPress,
}: {
  group: MedicationGroup
  onMedicationPress: (group: MedicationGroup) => void
  onReminderPress: (group: MedicationGroup, reminder: MedicationGroupReminder) => void
}) {
  const quantity = quantityLabel(group)
  const visibleReminders = sortedReminders(group.reminders)
  const nextReminderId = nextUpcomingReminderId(group.reminders)

  return (
    <Card style={styles.medicationCard}>
      <View style={styles.medicationHeader}>
        <View style={styles.medicationTitleBlock}>
          <View style={[styles.colorSwatch, { backgroundColor: group.medication.color || ui.color.orange }]} />
          <View style={styles.medicationCopy}>
            <Text style={styles.medicationTitle} numberOfLines={1}>{displayMedicationName(group)}</Text>
            {quantity ? <Text style={styles.quantityText}>{quantity}</Text> : null}
          </View>
        </View>
        <View style={styles.medicationActions}>
          <TouchableOpacity style={styles.editButton} onPress={() => onMedicationPress(group)} accessibilityLabel="약 메뉴">
            <Ionicons name="ellipsis-horizontal" size={18} color={ui.color.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.timeList}>
        {visibleReminders.map(reminder => {
          const isNextReminder = reminder.id === nextReminderId
          const statusTone = reminderStatusTone(reminder, isNextReminder)
          const mode = reminderMode(reminder)
          return (
            <TouchableOpacity
              key={reminder.id}
              style={[
                styles.reminderRow,
                isNextReminder && styles.reminderRowNext,
                statusTone === 'danger' && styles.reminderRowDanger,
                statusTone === 'done' && styles.reminderRowCompleted,
                statusTone === 'muted' && styles.reminderRowMuted,
              ]}
              onPress={() => onReminderPress(group, reminder)}
              activeOpacity={0.82}
            >
              <View style={styles.reminderRowCopy}>
                <Text style={[styles.reminderTimeText, isCompleted(reminder) && styles.reminderTimeTextMuted]}>
                  {fmtTime(reminder.hour, reminder.minute, { am: '오전', pm: '오후' })}
                </Text>
                <View style={styles.reminderStatusLine}>
                  <View style={[
                    styles.reminderStatusDot,
                    isNextReminder && styles.reminderStatusDotActive,
                    statusTone === 'danger' && styles.reminderStatusDotDanger,
                    statusTone === 'active' && styles.reminderStatusDotActive,
                    statusTone === 'done' && styles.reminderStatusDotDone,
                    statusTone === 'muted' && styles.reminderStatusDotMuted,
                  ]} />
                  <Text style={[
                    styles.reminderStatusText,
                    statusTone === 'danger' && styles.reminderStatusTextDanger,
                    isCompleted(reminder) && styles.reminderStatusTextDone,
                  ]}>
                    {reminderStatus(reminder)}
                  </Text>
                </View>
              </View>
              <ReminderModeBadge mode={mode} />
            </TouchableOpacity>
          )
        })}
      </View>
    </Card>
  )
}

export default function HomeScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { width: screenWidth } = useWindowDimensions()
  const { lang } = useI18n()
  const homeCopy = HOME_COPY[lang]
  const { isReady, isBackfilling, freezeEligibleSlots, confirmFreeze } = useAppInit()
  const { data: groups, loading, refresh } = useTodayMedicationGroups(isReady)
  const { wallet, loading: walletLoading } = useWalletSummary()
  const [freezesRemaining, setFreezesRemaining] = useState(0)
  const [devModeEnabled, setDevModeEnabled] = useState(false)
  const [notificationsGranted, setNotificationsGranted] = useState(true)
  const [permissionBannerDismissed, setPermissionBannerDismissed] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [activeScheduleIndex, setActiveScheduleIndex] = useState(0)

  useFocusEffect(
    useCallback(() => {
      if (!isReady) return
      void (async () => {
        const [settings, permission] = await Promise.all([
          getSettings(),
          Notifications.getPermissionsAsync(),
        ])
        setFreezesRemaining(settings.freezesRemaining)
        setDevModeEnabled(settings.devMode === 1)
        setNotificationsGranted(Boolean(permission.granted || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL))
      })()
    }, [isReady]),
  )

  useEffect(() => {
    if (freezeEligibleSlots.length === 0) return
    void getSettings().then(settings => {
      setFreezesRemaining(settings.freezesRemaining)
      setDevModeEnabled(settings.devMode === 1)
    })
  }, [freezeEligibleSlots])

  useEffect(() => {
    const unsubscribe = subscribeToast(message => {
      setToastMessage(message)
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      toastTimerRef.current = setTimeout(() => setToastMessage(null), 1800)
    })
    return () => {
      unsubscribe()
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  const totals = useMemo(() => groups.reduce((acc, group) => ({
    completed: acc.completed + group.completedCount,
    total: acc.total + group.totalCount,
  }), { completed: 0, total: 0 }), [groups])

  const needsNotificationBanner = !notificationsGranted && groups.some(group => group.reminders.some(reminder => reminderMode(reminder) !== 'off'))
  const showNotificationBanner = needsNotificationBanner && !permissionBannerDismissed
  const baseBottomInset = TAB_BAR_BASE_HEIGHT + insets.bottom
  const toastBottom = baseBottomInset + (showNotificationBanner ? 104 : FLOATING_GAP)
  const homeDateTitle = useMemo(() => formatHomeDateTitle(new Date(), lang), [lang])
  const scheduleCards = useMemo(() => buildScheduleCards(groups), [groups])
  const scheduleCardWidth = useMemo(() => Math.min(screenWidth - ui.spacing.screenX * 2 - 28, 380), [screenWidth])
  const scheduleSnapInterval = scheduleCardWidth + 12

  useEffect(() => {
    if (!needsNotificationBanner) setPermissionBannerDismissed(false)
  }, [needsNotificationBanner])

  useEffect(() => {
    setActiveScheduleIndex(current => Math.min(current, Math.max(scheduleCards.length - 1, 0)))
  }, [scheduleCards.length])

  const openRegistration = useCallback(() => router.push('/check-item'), [router])
  const openDevScanTest = useCallback(() => {
    router.push({ pathname: '/scan', params: { test: '1' } })
  }, [router])
  const openEdit = useCallback((medicationId: string) => {
    router.push({ pathname: '/check-item', params: { medicationId } })
  }, [router])
  const openTimeEdit = useCallback((reminderTimeId: string) => {
    setActiveSheet(null)
    router.push({ pathname: '/check-item', params: { slotId: reminderTimeId } })
  }, [router])
  const openScan = useCallback((reminderTimeId: string) => {
    setActiveSheet(null)
    router.navigate(`/scan?slotId=${reminderTimeId}`)
  }, [router])
  const handleScheduleSnap = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (scheduleCards.length <= 1) return
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / scheduleSnapInterval)
    setActiveScheduleIndex(Math.max(0, Math.min(scheduleCards.length - 1, nextIndex)))
  }, [scheduleCards.length, scheduleSnapInterval])
  const completeReminder = useCallback(async (reminder: MedicationGroupReminder) => {
    if (reminderMode(reminder) === 'scan' && !devModeEnabled) {
      openScan(reminder.id)
      return
    }
    if (!reminder.doseRecord || reminder.doseRecord.status !== 'pending') {
      Alert.alert('체크할 기록이 없습니다', '이미 처리됐거나 아직 오늘 기록이 준비되지 않았어요.')
      return
    }
    try {
      setActiveSheet(null)
      await completeVerification(reminder.doseRecord.id, reminder.id, reminderMode(reminder) === 'scan' ? 'scan' : 'manual')
      await refresh()
    } catch (error) {
      Alert.alert('완료할 수 없어요', error instanceof Error ? error.message : undefined)
    }
  }, [devModeEnabled, openScan, refresh])

  const skipReminder = useCallback(async (reminder: MedicationGroupReminder) => {
    if (!reminder.doseRecord || reminder.doseRecord.status !== 'pending') return
    setActiveSheet(null)
    await updateDoseRecordStatus(reminder.doseRecord.id, 'skipped', undefined, 'skip_today')
    await resyncAlarmState()
    await refresh()
  }, [refresh])

  const deleteReminder = useCallback((reminder: MedicationGroupReminder) => {
    Alert.alert('시간을 삭제할까요?', fmtTime(reminder.hour, reminder.minute, { am: '오전', pm: '오후' }), [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setActiveSheet(null)
            await deleteReminderTime(reminder.id)
            await refresh()
          })()
        },
      },
    ])
  }, [refresh])

  const turnOffMedicationReminders = useCallback(async (group: MedicationGroup) => {
    try {
      setActiveSheet(null)
      await disableMedicationReminders(group.medication.id)
      await refresh()
    } catch (error) {
      Alert.alert('알림을 끄지 못했어요', error instanceof Error ? error.message : undefined)
    }
  }, [refresh])

  const removeMedication = useCallback((group: MedicationGroup) => {
    Alert.alert('약을 삭제할까요?', displayMedicationName(group), [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setActiveSheet(null)
            try {
              await deleteMedicationWithTimes(group.medication.id)
              await refresh()
            } catch (error) {
              Alert.alert('삭제하지 못했어요', error instanceof Error ? error.message : undefined)
            }
          })()
        },
      },
    ])
  }, [refresh])

  const runPrimaryScheduleAction = useCallback((item: ScheduleCardItem) => {
    const pendingRecord = item.reminder.doseRecord?.status === 'pending'

    if (!pendingRecord) {
      setActiveSheet({ type: 'reminder', group: item.group, reminder: item.reminder })
      return
    }

    if (item.mode === 'scan' && !devModeEnabled) {
      openScan(item.reminder.id)
      return
    }

    void completeReminder(item.reminder)
  }, [completeReminder, devModeEnabled, openScan])

  const renderActionSheet = () => {
    if (!activeSheet) return null

    const isReminderSheet = activeSheet.type === 'reminder'
    const title = isReminderSheet ? displayMedicationName(activeSheet.group) : displayMedicationName(activeSheet.group)
    const subtitle = isReminderSheet
      ? `${fmtTime(activeSheet.reminder.hour, activeSheet.reminder.minute, { am: '오전', pm: '오후' })} · ${REMINDER_MODE_LABELS[reminderMode(activeSheet.reminder)]}${reminderMode(activeSheet.reminder) === 'off' ? ' · 알림은 꺼져 있어요' : ''}`
      : actualMedicationName(activeSheet.group) ?? '약 관리'

    const options: SheetOption[] = isReminderSheet
      ? (() => {
          const reminder = activeSheet.reminder
          const mode = reminderMode(reminder)
          const hasPendingRecord = reminder.doseRecord?.status === 'pending'
          const primaryOption: SheetOption | null = hasPendingRecord
            ? mode === 'scan'
              ? { label: '스캔하기', icon: 'scan-outline', tone: 'primary', onPress: () => openScan(reminder.id) }
              : { label: '체크하기', icon: 'checkmark-circle-outline', tone: 'primary', onPress: () => { void completeReminder(reminder) } }
            : null

          return [
            ...(primaryOption ? [primaryOption] : []),
            { label: '오늘 건너뛰기', icon: 'play-skip-forward-outline', onPress: () => { void skipReminder(reminder) }, disabled: !hasPendingRecord },
            { label: '시간 수정', icon: 'time-outline', onPress: () => openTimeEdit(reminder.id) },
            { label: '시간 삭제', icon: 'trash-outline', tone: 'danger', onPress: () => deleteReminder(reminder) },
          ]
        })()
      : [
          { label: '약 정보 수정', icon: 'create-outline', onPress: () => { setActiveSheet(null); openEdit(activeSheet.group.medication.id) } },
          { label: '시간 관리', icon: 'time-outline', onPress: () => { setActiveSheet(null); openEdit(activeSheet.group.medication.id) } },
          { label: '알림 전체 끄기', icon: 'notifications-off-outline', onPress: () => { void turnOffMedicationReminders(activeSheet.group) } },
          { label: '삭제', icon: 'trash-outline', tone: 'danger', onPress: () => removeMedication(activeSheet.group) },
        ]

    return (
      <Modal transparent visible animationType="fade" onRequestClose={() => setActiveSheet(null)}>
        <View style={styles.sheetOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setActiveSheet(null)} />
          <View style={[styles.sheetPanel, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View style={styles.sheetTitleBlock}>
                <Text style={styles.sheetTitle} numberOfLines={1}>{title}</Text>
                <Text style={styles.sheetSubtitle} numberOfLines={1}>{subtitle}</Text>
              </View>
              <TouchableOpacity style={styles.sheetClose} onPress={() => setActiveSheet(null)} accessibilityLabel="닫기">
                <Ionicons name="close" size={18} color={ui.color.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.sheetOptionList}>
              {options.map(option => (
                <TouchableOpacity
                  key={option.label}
                  style={[styles.sheetOption, option.disabled && styles.sheetOptionDisabled]}
                  onPress={option.onPress}
                  disabled={option.disabled}
                >
                  <View style={[styles.sheetOptionIcon, option.tone === 'primary' && styles.sheetOptionIconPrimary, option.tone === 'danger' && styles.sheetOptionIconDanger]}>
                    <Ionicons
                      name={option.icon}
                      size={18}
                      color={option.tone === 'danger' ? ui.color.danger : option.tone === 'primary' ? '#FFFFFF' : ui.color.textPrimary}
                    />
                  </View>
                  <Text style={[styles.sheetOptionText, option.tone === 'danger' && styles.sheetOptionTextDanger]}>{option.label}</Text>
                  <Ionicons name="chevron-forward" size={16} color={ui.color.textSecondary} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    )
  }

  if (!isReady || loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={ui.color.textPrimary} />
        {isBackfilling ? <Text style={styles.loadingText}>기록 정리 중</Text> : null}
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 18,
          paddingHorizontal: ui.spacing.screenX,
          paddingBottom: baseBottomInset + (showNotificationBanner ? 144 : 120),
        }}
      >
        <View style={styles.homeHeader}>
          <Text style={styles.homeTitle}>{homeDateTitle}</Text>
          <View style={styles.homeActions}>
            <View style={styles.headerJellyChip}>
              <Ionicons name="water" size={16} color={ui.color.orange} />
              {walletLoading ? (
                <ActivityIndicator size="small" color={ui.color.orange} />
              ) : (
                <Text style={styles.headerJellyText}>{wallet?.balance ?? 0}</Text>
              )}
            </View>
            <TouchableOpacity style={styles.addButton} onPress={openRegistration} accessibilityLabel="등록">
              <Ionicons name="add" size={24} color={ui.color.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        {scheduleCards.length > 0 ? (
          <View style={styles.scheduleCarouselSection}>
            <ScrollView
              horizontal
              decelerationRate="fast"
              disableIntervalMomentum
              onMomentumScrollEnd={handleScheduleSnap}
              showsHorizontalScrollIndicator={false}
              snapToAlignment="start"
              snapToInterval={scheduleSnapInterval}
              contentContainerStyle={styles.scheduleCarouselContent}
            >
              {scheduleCards.map((item, index) => (
                <View key={item.id} style={[styles.scheduleCarouselItem, index === scheduleCards.length - 1 && styles.scheduleCarouselItemLast]}>
                  <ScheduleCarouselCard
                    item={item}
                    copy={homeCopy}
                    width={scheduleCardWidth}
                    devModeEnabled={devModeEnabled}
                    onMedicationPress={(selectedGroup) => setActiveSheet({ type: 'medication', group: selectedGroup })}
                    onReminderPress={(selectedGroup, reminder) => setActiveSheet({ type: 'reminder', group: selectedGroup, reminder })}
                    onPrimaryAction={runPrimaryScheduleAction}
                  />
                </View>
              ))}
            </ScrollView>

            {scheduleCards.length > 1 ? (
              <View style={styles.scheduleDots}>
                {scheduleCards.map((item, index) => (
                  <View
                    key={`${item.id}-dot`}
                    style={[styles.scheduleDot, index === activeScheduleIndex && styles.scheduleDotActive]}
                  />
                ))}
              </View>
            ) : null}
          </View>
        ) : (
          <View style={styles.emptyMedicationCard}>
            <Text style={styles.emptyMedicationTitle}>{homeCopy.emptyTitle}</Text>
            <Text style={styles.emptyMedicationCaption}>{homeCopy.emptyCaption}</Text>
            <TouchableOpacity style={styles.emptyMedicationButton} onPress={openRegistration} activeOpacity={0.86}>
              <Text style={styles.emptyMedicationButtonText}>{homeCopy.addMedication}</Text>
            </TouchableOpacity>
          </View>
        )}

        {devModeEnabled ? (
          <TouchableOpacity style={styles.devScanTestButton} onPress={openDevScanTest} activeOpacity={0.84}>
            <View style={styles.devScanTestIcon}>
              <Ionicons name="scan-outline" size={20} color={ui.color.textPrimary} />
            </View>
            <View style={styles.devScanTestCopy}>
              <Text style={styles.devScanTestTitle}>{homeCopy.devScanTitle}</Text>
              <Text style={styles.devScanTestCaption}>{homeCopy.devScanCaption}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={ui.color.textSecondary} />
          </TouchableOpacity>
        ) : null}
      </ScrollView>

      {showNotificationBanner ? (
        <FloatingBottom variant="banner">
          <View style={styles.permissionBanner}>
            <View style={styles.permissionIcon}>
              <Ionicons name="notifications-off-outline" size={18} color={ui.color.textSecondary} />
            </View>
            <View style={styles.permissionCopy}>
              <Text style={styles.permissionTitle}>알림 권한이 꺼져 있어요</Text>
              <Text style={styles.permissionCaption}>설정에서 다시 켤 수 있어요</Text>
            </View>
            <TouchableOpacity style={styles.permissionButton} onPress={() => Linking.openSettings()}>
              <Text style={styles.permissionButtonText}>설정</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.permissionClose} onPress={() => setPermissionBannerDismissed(true)}>
              <Ionicons name="close" size={16} color={ui.color.textSecondary} />
            </TouchableOpacity>
          </View>
        </FloatingBottom>
      ) : null}

      <FreezePopup
        visible={freezeEligibleSlots.length > 0}
        slots={freezeEligibleSlots}
        freezesRemaining={freezesRemaining}
        onConfirm={confirmFreeze}
        onDismiss={() => confirmFreeze([])}
      />

      {toastMessage ? (
        <View style={[styles.toast, { bottom: toastBottom }]}>
          <Text style={styles.toastText}>{toastMessage}</Text>
        </View>
      ) : null}

      {renderActionSheet()}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: ui.color.background,
  },
  center: {
    alignItems: 'center',
    backgroundColor: ui.color.background,
    flex: 1,
    gap: 12,
    justifyContent: 'center',
  },
  loadingText: {
    color: ui.color.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  homeHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 22,
    minHeight: 44,
  },
  homeTitle: {
    color: ui.color.textPrimary,
    flex: 1,
    fontSize: 27,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 34,
    paddingRight: 12,
  },
  homeActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  headerJellyChip: {
    alignItems: 'center',
    backgroundColor: '#FFF5DE',
    borderRadius: 999,
    borderColor: '#F4E3BE',
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    height: 40,
    justifyContent: 'center',
    minWidth: 66,
    paddingHorizontal: 13,
  },
  headerJellyEmoji: {
    fontSize: 16,
  },
  headerJellyText: {
    color: ui.color.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  addButton: {
    alignItems: 'center',
    backgroundColor: ui.color.card,
    borderColor: ui.color.border,
    borderRadius: 999,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  scheduleCarouselSection: {
    marginBottom: 18,
  },
  scheduleCarouselContent: {
    paddingRight: 4,
  },
  scheduleCarouselItem: {
    marginRight: 12,
  },
  scheduleCarouselItemLast: {
    marginRight: 0,
  },
  scheduleCard: {
    backgroundColor: ui.color.card,
    borderColor: ui.color.border,
    borderRadius: 28,
    borderWidth: 1,
    gap: 12,
    minHeight: 228,
    padding: 20,
  },
  scheduleCardPending: {
    borderColor: '#F0DEC0',
    backgroundColor: '#FFFCF5',
  },
  scheduleCardOverdue: {
    borderColor: '#F2C8BD',
    backgroundColor: '#FFF7F3',
  },
  scheduleCardCompleted: {
    backgroundColor: '#F6F7F8',
    borderColor: '#E5E8EC',
  },
  scheduleCardOff: {
    backgroundColor: '#F5F6F8',
    borderColor: '#E1E5EA',
  },
  scheduleCardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  scheduleCardHeaderLeft: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  scheduleStatePill: {
    alignItems: 'center',
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 28,
    paddingHorizontal: 10,
  },
  scheduleStatePillPending: {
    backgroundColor: '#FFF1D2',
  },
  scheduleStatePillOverdue: {
    backgroundColor: '#FFE7DF',
  },
  scheduleStatePillCompleted: {
    backgroundColor: '#EBEEF2',
  },
  scheduleStatePillOff: {
    backgroundColor: '#ECEFF3',
  },
  scheduleStateText: {
    fontSize: 12,
    fontWeight: '700',
  },
  scheduleStateTextPending: {
    color: '#A26108',
  },
  scheduleStateTextOverdue: {
    color: '#C95B31',
  },
  scheduleStateTextCompleted: {
    color: '#6C7480',
  },
  scheduleStateTextOff: {
    color: '#7C8591',
  },
  scheduleMenuButton: {
    alignItems: 'center',
    backgroundColor: '#F6F7F9',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  scheduleMedicationName: {
    color: ui.color.textPrimary,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
  },
  scheduleQuantity: {
    color: ui.color.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    minHeight: 18,
  },
  scheduleQuantitySpacer: {
    minHeight: 18,
  },
  scheduleInfoRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 42,
  },
  scheduleTime: {
    color: ui.color.textPrimary,
    flex: 1,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 30,
    paddingRight: 12,
  },
  scheduleFooter: {
    marginTop: 'auto',
  },
  scheduleActionButton: {
    alignItems: 'center',
    backgroundColor: ui.color.textPrimary,
    borderRadius: 18,
    height: 48,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  scheduleActionButtonOverdue: {
    backgroundColor: '#D8642D',
  },
  scheduleActionButtonSecondary: {
    backgroundColor: '#FFFFFF',
    borderColor: ui.color.border,
    borderWidth: 1,
  },
  scheduleActionButtonDisabled: {
    backgroundColor: '#E5E7EB',
  },
  scheduleActionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  scheduleActionTextSecondary: {
    color: ui.color.textPrimary,
  },
  scheduleActionTextDisabled: {
    color: '#7C8591',
  },
  scheduleDots: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginTop: 12,
  },
  scheduleDot: {
    backgroundColor: '#D5DAE1',
    borderRadius: 999,
    height: 6,
    width: 6,
  },
  scheduleDotActive: {
    backgroundColor: ui.color.textPrimary,
    width: 18,
  },
  devScanTestButton: {
    alignItems: 'center',
    backgroundColor: ui.color.card,
    borderColor: ui.color.border,
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
    minHeight: 84,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  devScanTestIcon: {
    alignItems: 'center',
    backgroundColor: ui.color.orangeLight,
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  devScanTestCopy: {
    flex: 1,
    gap: 3,
  },
  devScanTestTitle: {
    color: ui.color.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  devScanTestCaption: {
    color: ui.color.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  medicationCard: {
    backgroundColor: ui.color.card,
    borderColor: ui.color.border,
    borderRadius: 27,
    borderWidth: 1,
    gap: 14,
    padding: 19,
  },
  medicationHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 42,
    justifyContent: 'space-between',
  },
  medicationTitleBlock: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 12,
  },
  colorSwatch: {
    borderRadius: 6,
    height: 12,
    width: 12,
  },
  medicationCopy: {
    flex: 1,
  },
  medicationTitle: {
    color: ui.color.textPrimary,
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
  },
  medicationActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  quantityText: {
    color: ui.color.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  editButton: {
    alignItems: 'center',
    backgroundColor: '#F6F7F9',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  timeList: {
    gap: 10,
  },
  reminderRow: {
    alignItems: 'center',
    backgroundColor: '#F8F9FB',
    borderColor: 'transparent',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 74,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  reminderRowNext: {
    backgroundColor: '#FFF7E8',
    borderColor: '#FFE1A8',
  },
  reminderRowDanger: {
    backgroundColor: '#FFF1EC',
    borderColor: '#FFD7C7',
  },
  reminderRowCompleted: {
    backgroundColor: '#F4F6F4',
    opacity: 0.78,
  },
  reminderRowMuted: {
    backgroundColor: '#F1F1F3',
  },
  reminderRowCopy: {
    flex: 1,
    gap: 4,
    paddingRight: 12,
  },
  reminderTimeText: {
    color: ui.color.textPrimary,
    fontSize: 21,
    fontWeight: '700',
    lineHeight: 26,
  },
  reminderTimeTextMuted: {
    color: ui.color.textSecondary,
  },
  reminderStatusLine: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  reminderStatusDot: {
    backgroundColor: ui.color.success,
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  reminderStatusDotActive: {
    backgroundColor: ui.color.orange,
  },
  reminderStatusDotDanger: {
    backgroundColor: '#F97316',
  },
  reminderStatusDotDone: {
    backgroundColor: ui.color.textSecondary,
  },
  reminderStatusDotMuted: {
    backgroundColor: '#C4C8D0',
  },
  reminderStatusText: {
    color: ui.color.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  reminderStatusTextDanger: {
    color: '#D85B2A',
  },
  reminderStatusTextDone: {
    color: ui.color.textSecondary,
  },
  modeBadge: {
    alignItems: 'center',
    borderRadius: 999,
    height: 32,
    justifyContent: 'center',
    minWidth: 76,
    paddingHorizontal: 14,
  },
  modeBadgeNotify: {
    backgroundColor: '#FFF3CC',
  },
  modeBadgeScan: {
    backgroundColor: ui.color.textPrimary,
  },
  modeBadgeOff: {
    backgroundColor: '#EDEFF2',
  },
  modeBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  modeBadgeTextNotify: {
    color: '#D97904',
  },
  modeBadgeTextScan: {
    color: '#FFFFFF',
  },
  modeBadgeTextOff: {
    color: ui.color.textSecondary,
  },
  emptyMedicationCard: {
    alignItems: 'flex-start',
    backgroundColor: ui.color.card,
    borderColor: ui.color.border,
    borderRadius: 28,
    borderWidth: 1,
    gap: 8,
    padding: 20,
  },
  emptyMedicationTitle: {
    color: ui.color.textPrimary,
    fontSize: 19,
    fontWeight: '700',
  },
  emptyMedicationCaption: {
    color: ui.color.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  emptyMedicationButton: {
    alignItems: 'center',
    backgroundColor: ui.color.textPrimary,
    borderRadius: 999,
    height: 44,
    justifyContent: 'center',
    marginTop: 8,
    paddingHorizontal: 18,
  },
  emptyMedicationButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  permissionBanner: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: ui.color.border,
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    height: 72,
    minHeight: 72,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#101319',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
  },
  permissionIcon: {
    alignItems: 'center',
    backgroundColor: ui.color.input,
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  permissionCopy: {
    flex: 1,
    gap: 3,
  },
  permissionTitle: {
    color: ui.color.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  permissionCaption: {
    color: ui.color.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  permissionClose: {
    alignItems: 'center',
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  permissionButton: {
    alignItems: 'center',
    backgroundColor: ui.color.input,
    borderRadius: 999,
    height: 40,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  permissionButtonText: {
    color: ui.color.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  toast: {
    alignItems: 'center',
    backgroundColor: ui.color.textPrimary,
    borderRadius: 18,
    justifyContent: 'center',
    left: 24,
    minHeight: 52,
    paddingHorizontal: 18,
    paddingVertical: 12,
    position: 'absolute',
    right: 24,
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  sheetOverlay: {
    backgroundColor: 'rgba(16, 19, 25, 0.34)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetPanel: {
    backgroundColor: ui.color.card,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: ui.color.border,
    borderRadius: 2,
    height: 4,
    marginBottom: 16,
    width: 42,
  },
  sheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sheetTitleBlock: {
    flex: 1,
  },
  sheetTitle: {
    color: ui.color.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  sheetSubtitle: {
    color: ui.color.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 3,
  },
  sheetClose: {
    alignItems: 'center',
    backgroundColor: ui.color.input,
    borderRadius: 15,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  sheetOptionList: {
    gap: 8,
  },
  sheetOption: {
    alignItems: 'center',
    backgroundColor: ui.color.input,
    borderRadius: 14,
    flexDirection: 'row',
    gap: 12,
    minHeight: 54,
    paddingHorizontal: 12,
  },
  sheetOptionDisabled: {
    opacity: 0.45,
  },
  sheetOptionIcon: {
    alignItems: 'center',
    backgroundColor: ui.color.card,
    borderRadius: 13,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  sheetOptionIconPrimary: {
    backgroundColor: ui.color.orange,
  },
  sheetOptionIconDanger: {
    backgroundColor: '#FFEAE6',
  },
  sheetOptionText: {
    color: ui.color.textPrimary,
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
  },
  sheetOptionTextDanger: {
    color: ui.color.danger,
  },
})
