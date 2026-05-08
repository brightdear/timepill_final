import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
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
import { Card, EmptyState, JellyPill, ReminderModeSlider, ui } from '@/components/ui/ProductUI'
import type { ReminderMode } from '@/db/schema'
import { resyncAlarmState } from '@/domain/alarm/alarmScheduler'
import { updateDoseRecordStatus } from '@/domain/doseRecord/repository'
import { getSettings } from '@/domain/settings/repository'
import {
  deleteMedicationWithTimes,
  deleteReminderTime,
  disableMedicationReminders,
  updateReminderTimeMode,
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

const REMINDER_MODE_LABELS: Record<ReminderMode, string> = {
  off: '끔',
  notify: '알림만',
  scan: '스캔까지',
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const HOME_COPY = {
  ko: {
    progress: '진행 현황',
    allDone: '모두 완료했어요',
    remaining: '{count}개 남았어요',
    sectionTitle: '약',
    sectionSubtitle: '오늘 해야 할 것',
    devScanTitle: '스캔 테스트',
    devScanCaption: '기록 없이 카메라와 모델만 확인',
  },
  en: {
    progress: 'Progress',
    allDone: 'All set for today',
    remaining: '{count} left',
    sectionTitle: 'Medication',
    sectionSubtitle: 'For today',
    devScanTitle: 'Scan test',
    devScanCaption: 'Check camera and model only',
  },
  ja: {
    progress: '進行状況',
    allDone: '今日は完了しました',
    remaining: '{count}件残っています',
    sectionTitle: '薬',
    sectionSubtitle: '今日の予定',
    devScanTitle: 'スキャンテスト',
    devScanCaption: '記録なしでカメラとモデルを確認',
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
  return value === 'off' || value === 'scan' || value === 'notify' ? value : 'notify'
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
  return `${remaining ?? 0}정`
}

function reminderMode(reminder: MedicationGroupReminder) {
  return normalizeReminderMode(reminder.reminderMode)
}

function isCompleted(reminder: MedicationGroupReminder) {
  const status = reminder.doseRecord?.status
  return status === 'completed' || status === 'frozen'
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
  const mode = reminderMode(reminder)
  const status = reminder.doseRecord?.status
  if (isCompleted(reminder)) return reminder.doseRecord?.verificationType === 'scan' ? '먹음' : '완료'
  if (status === 'missed') return '놓침'
  if (status === 'skipped') return '건너뜀'
  if (mode === 'off') return '알림 꺼짐'
  if (reminder.isActive === 0 && reminder.skipUntil) return '오늘 꺼짐'
  const windowState = reminderWindowState(reminder)
  if (windowState === 'overdue') return '지남'
  if (windowState === 'due') return mode === 'scan' ? '스캔 필요' : '대기'
  return '예정'
}

function reminderStatusTone(reminder: MedicationGroupReminder) {
  const mode = reminderMode(reminder)
  const status = reminder.doseRecord?.status
  if (isCompleted(reminder)) return 'done' as const
  if (status === 'missed' || reminderWindowState(reminder) === 'overdue') return 'danger' as const
  if (mode === 'off' || reminder.isActive === 0) return 'muted' as const
  if (reminderWindowState(reminder) === 'due') return 'active' as const
  return 'soft' as const
}

function reminderSortRank(reminder: MedicationGroupReminder) {
  if (isCompleted(reminder) || reminder.doseRecord?.status === 'skipped') return 4
  const mode = reminderMode(reminder)
  if (mode === 'off' || reminder.isActive === 0) return 3
  const windowState = reminderWindowState(reminder)
  if (windowState === 'overdue' || reminder.doseRecord?.status === 'missed') return 0
  if (windowState === 'due') return 1
  return 2
}

function sortedReminders(reminders: MedicationGroupReminder[]) {
  return [...reminders].sort((left, right) => {
    const byRank = reminderSortRank(left) - reminderSortRank(right)
    if (byRank !== 0) return byRank
    return (left.hour * 60 + left.minute) - (right.hour * 60 + right.minute)
  })
}

function MedicationCard({
  group,
  onMedicationPress,
  onReminderPress,
  onModeChange,
}: {
  group: MedicationGroup
  onMedicationPress: (group: MedicationGroup) => void
  onReminderPress: (group: MedicationGroup, reminder: MedicationGroupReminder) => void
  onModeChange: (reminderTimeId: string, mode: ReminderMode) => void
}) {
  const quantity = quantityLabel(group)
  const visibleReminders = sortedReminders(group.reminders)

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
          const statusTone = reminderStatusTone(reminder)
          return (
            <TouchableOpacity
              key={reminder.id}
              style={[
                styles.reminderRow,
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
              <ReminderModeSlider
                value={reminderMode(reminder)}
                onChange={mode => onModeChange(reminder.id, mode)}
                disabled={isCompleted(reminder)}
              />
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
  const [activeCardIndex, setActiveCardIndex] = useState(0)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
  const pendingTotal = Math.max(totals.total - totals.completed, 0)

  const needsNotificationBanner = !notificationsGranted && groups.some(group => group.reminders.some(reminder => reminderMode(reminder) !== 'off'))
  const showNotificationBanner = needsNotificationBanner && !permissionBannerDismissed
  const baseBottomInset = TAB_BAR_BASE_HEIGHT + insets.bottom
  const toastBottom = baseBottomInset + (showNotificationBanner ? 104 : FLOATING_GAP)
  const cardWidth = Math.max(280, screenWidth - (ui.spacing.screenX * 2))
  const carouselGap = 12
  const progressRatio = totals.total > 0 ? totals.completed / totals.total : 0
  const homeDateTitle = useMemo(() => formatHomeDateTitle(new Date(), lang), [lang])

  useEffect(() => {
    if (!needsNotificationBanner) setPermissionBannerDismissed(false)
  }, [needsNotificationBanner])

  useEffect(() => {
    if (activeCardIndex >= groups.length) {
      setActiveCardIndex(Math.max(0, groups.length - 1))
    }
  }, [activeCardIndex, groups.length])

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
  const handleModeChange = useCallback(async (reminderTimeId: string, mode: ReminderMode) => {
    try {
      await updateReminderTimeMode(reminderTimeId, mode)
      await refresh()
    } catch (error) {
      Alert.alert('모드를 바꾸지 못했어요', error instanceof Error ? error.message : undefined)
    }
  }, [refresh])

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
          paddingTop: insets.top + 12,
          paddingHorizontal: ui.spacing.screenX,
          paddingBottom: baseBottomInset + 128,
        }}
      >
        <View style={styles.homeHeader}>
          <Text style={styles.homeTitle}>{homeDateTitle}</Text>
          <View style={styles.homeActions}>
            <JellyPill balance={wallet?.balance} loading={walletLoading} compact />
            <TouchableOpacity style={styles.addButton} onPress={openRegistration} accessibilityLabel="등록">
              <Ionicons name="add" size={24} color={ui.color.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        {devModeEnabled ? (
          <TouchableOpacity style={styles.devScanTestButton} onPress={openDevScanTest} activeOpacity={0.84}>
            <View style={styles.devScanTestIcon}>
              <Ionicons name="scan-outline" size={18} color={ui.color.textPrimary} />
            </View>
            <View style={styles.devScanTestCopy}>
              <Text style={styles.devScanTestTitle}>{homeCopy.devScanTitle}</Text>
              <Text style={styles.devScanTestCaption}>{homeCopy.devScanCaption}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={ui.color.textSecondary} />
          </TouchableOpacity>
        ) : null}

        <View style={styles.summaryCard}>
          <View style={styles.summaryTopRow}>
            <View style={styles.summaryCopy}>
              <Text style={styles.summaryLabel}>{homeCopy.progress}</Text>
              <Text style={styles.summaryCaption}>
                {pendingTotal === 0 ? homeCopy.allDone : homeCopy.remaining.replace('{count}', String(pendingTotal))}
              </Text>
            </View>
            <Text style={styles.summaryValue}>{totals.completed} / {totals.total}</Text>
            <View style={styles.summaryReward}>
              <Text style={styles.summaryMeta}>🍬 +{wallet?.todayEarned ?? 0}</Text>
            </View>
          </View>
          <View style={styles.summaryProgressTrack}>
            <View style={[styles.summaryProgressFill, { width: `${Math.min(progressRatio * 100, 100)}%` }]} />
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionTitle}>{homeCopy.sectionTitle}</Text>
            <Text style={styles.sectionSubtitle}>{homeCopy.sectionSubtitle}</Text>
          </View>
          <Text style={styles.sectionCount}>{groups.length}개</Text>
        </View>

        {groups.length > 0 ? (
          <>
            <FlatList
              horizontal
              data={groups}
              keyExtractor={group => group.medication.id}
              showsHorizontalScrollIndicator={false}
              decelerationRate="fast"
              snapToInterval={cardWidth + carouselGap}
              snapToAlignment="start"
              disableIntervalMomentum
              contentContainerStyle={styles.carouselContent}
              style={styles.medicationCarousel}
              ItemSeparatorComponent={() => <View style={{ width: carouselGap }} />}
              onMomentumScrollEnd={(event) => {
                const nextIndex = Math.round(event.nativeEvent.contentOffset.x / (cardWidth + carouselGap))
                setActiveCardIndex(Math.max(0, Math.min(groups.length - 1, nextIndex)))
              }}
              renderItem={({ item: group }) => (
                <View style={[styles.carouselPage, { width: cardWidth }]}>
                  <MedicationCard
                    group={group}
                    onMedicationPress={(selectedGroup) => setActiveSheet({ type: 'medication', group: selectedGroup })}
                    onReminderPress={(selectedGroup, reminder) => setActiveSheet({ type: 'reminder', group: selectedGroup, reminder })}
                    onModeChange={(reminderTimeId, mode) => { void handleModeChange(reminderTimeId, mode) }}
                  />
                </View>
              )}
            />
            {groups.length > 1 ? (
              <View style={styles.pageDots}>
                {groups.map((group, index) => (
                  <View
                    key={group.medication.id}
                    style={[styles.pageDot, activeCardIndex === index && styles.pageDotActive]}
                  />
                ))}
              </View>
            ) : null}
          </>
        ) : (
          <EmptyState title="오늘 등록된 시간이 없습니다" />
        )}
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
    marginBottom: 12,
    minHeight: 44,
  },
  homeTitle: {
    color: ui.color.textPrimary,
    flex: 1,
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: 0,
    lineHeight: 24,
    paddingRight: 12,
  },
  homeActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  addButton: {
    alignItems: 'center',
    backgroundColor: ui.color.card,
    borderColor: ui.color.border,
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  summaryCard: {
    backgroundColor: '#FFF9EC',
    borderColor: '#F1E3C8',
    borderRadius: 24,
    borderWidth: 1,
    gap: 12,
    minHeight: 92,
    marginBottom: 22,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  summaryTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'space-between',
  },
  summaryCopy: {
    gap: 2,
    minWidth: 100,
  },
  summaryLabel: {
    color: ui.color.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  summaryCaption: {
    color: ui.color.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  summaryValue: {
    color: ui.color.textPrimary,
    flex: 1,
    fontSize: 34,
    fontWeight: '800',
    textAlign: 'center',
  },
  summaryReward: {
    alignItems: 'center',
    backgroundColor: '#FFF7E8',
    borderColor: '#FFE4B3',
    borderWidth: 1,
    borderRadius: 999,
    minHeight: 38,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  summaryMeta: {
    color: ui.color.orange,
    fontSize: 14,
    fontWeight: '800',
  },
  summaryProgressTrack: {
    backgroundColor: '#F1E3C8',
    borderRadius: 999,
    height: 6,
    overflow: 'hidden',
  },
  summaryProgressFill: {
    backgroundColor: ui.color.orange,
    borderRadius: 999,
    height: 6,
  },
  devScanTestButton: {
    alignItems: 'center',
    backgroundColor: ui.color.card,
    borderColor: ui.color.border,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    marginTop: 14,
    minHeight: 66,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  devScanTestIcon: {
    alignItems: 'center',
    backgroundColor: ui.color.orangeLight,
    borderRadius: 18,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  devScanTestCopy: {
    flex: 1,
    gap: 3,
  },
  devScanTestTitle: {
    color: ui.color.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  devScanTestCaption: {
    color: ui.color.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionTitle: {
    color: ui.color.textPrimary,
    fontSize: 24,
    fontWeight: '800',
  },
  sectionSubtitle: {
    color: ui.color.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  sectionCount: {
    color: ui.color.textSecondary,
    fontSize: 14,
    fontWeight: '800',
  },
  medicationCarousel: {
    marginHorizontal: -24,
  },
  carouselContent: {
    paddingHorizontal: 24,
    paddingTop: 4,
  },
  carouselPage: {
    minHeight: 220,
  },
  pageDots: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    marginTop: 14,
  },
  pageDot: {
    backgroundColor: '#D8D8D8',
    borderRadius: 4,
    height: 7,
    width: 7,
  },
  pageDotActive: {
    backgroundColor: ui.color.orange,
    width: 18,
  },
  medicationCard: {
    backgroundColor: ui.color.card,
    borderColor: ui.color.border,
    borderRadius: 28,
    borderWidth: 1,
    gap: 10,
    minHeight: 220,
    padding: 18,
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
    fontSize: 25,
    fontWeight: '800',
  },
  medicationActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  quantityText: {
    color: ui.color.textSecondary,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
  },
  editButton: {
    alignItems: 'center',
    backgroundColor: ui.color.input,
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
    backgroundColor: ui.color.input,
    borderRadius: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 60,
    paddingHorizontal: 16,
  },
  reminderRowDanger: {
    backgroundColor: '#FFF1EC',
  },
  reminderRowCompleted: {
    backgroundColor: '#F4F4F4',
    opacity: 0.72,
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
    fontSize: 22,
    fontWeight: '800',
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
    fontWeight: '700',
  },
  reminderStatusTextDanger: {
    color: '#D85B2A',
  },
  reminderStatusTextDone: {
    color: ui.color.textSecondary,
  },
  permissionBanner: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: ui.color.border,
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    height: 80,
    minHeight: 78,
    paddingHorizontal: 18,
    paddingVertical: 14,
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
    fontWeight: '800',
  },
  permissionCaption: {
    color: ui.color.textSecondary,
    fontSize: 12,
    fontWeight: '700',
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
    fontWeight: '800',
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
    fontWeight: '800',
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
