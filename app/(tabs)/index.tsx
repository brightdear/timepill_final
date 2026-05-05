import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs'
import { useFocusEffect } from '@react-navigation/native'
import { useRouter } from 'expo-router'
import * as Notifications from 'expo-notifications'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@/components/AppIcon'
import { FreezePopup } from '@/components/FreezePopup'
import { AppHeader, Card, EmptyState, TimeRow, ui } from '@/components/ui/ProductUI'
import { getSettings } from '@/domain/settings/repository'
import { toggleReminderTimeEnabled, type MedicationGroup, type MedicationGroupReminder } from '@/domain/medicationSchedule/repository'
import { useAppInit } from '@/hooks/useAppInit'
import { isVerifiable } from '@/hooks/useTodayTimeslots'
import { useTodayMedicationGroups } from '@/hooks/useTodayMedicationGroups'
import { useWalletSummary } from '@/hooks/useWalletSummary'
import { fmtTime } from '@/utils/timeUtils'
import { subscribeToast } from '@/utils/uiEvents'

function displayMedicationName(group: MedicationGroup) {
  return group.medication.aliasName || group.medication.name || '복용 항목'
}

function actualMedicationName(group: MedicationGroup) {
  const actual = group.medication.actualName?.trim()
  const alias = displayMedicationName(group)
  return actual && actual !== alias ? actual : null
}

function quantityLabel(group: MedicationGroup) {
  const remaining = group.medication.remainingQuantity ?? group.medication.currentQuantity
  const total = group.medication.totalQuantity
  if (remaining == null && total == null) return null
  if (total && total > 0) return `${remaining ?? 0}/${total}정`
  return `${remaining ?? 0}정`
}

function reminderStatus(reminder: MedicationGroupReminder) {
  if (reminder.isEnabled === 0) return '알림 꺼짐'
  const status = reminder.doseRecord?.status
  if (status === 'completed' || status === 'frozen') return '완료'
  if (status === 'missed') return '놓침'
  if (status === 'skipped') return '건너뜀'
  return '대기'
}

function MedicationCard({
  group,
  onEdit,
  onCheck,
  onToggle,
}: {
  group: MedicationGroup
  onEdit: (medicationId: string) => void
  onCheck: (reminderTimeId: string) => void
  onToggle: (reminderTimeId: string, enabled: boolean) => void
}) {
  const realName = actualMedicationName(group)
  const quantity = quantityLabel(group)

  return (
    <Card style={styles.medicationCard}>
      <View style={styles.medicationHeader}>
        <View style={styles.medicationTitleBlock}>
          <View style={[styles.colorSwatch, { backgroundColor: group.medication.color || ui.color.orange }]} />
          <View style={styles.medicationCopy}>
            <Text style={styles.medicationTitle} numberOfLines={1}>{displayMedicationName(group)}</Text>
            {realName ? <Text style={styles.medicationMeta} numberOfLines={1}>{realName}</Text> : null}
          </View>
        </View>
        <View style={styles.medicationActions}>
          {quantity ? <Text style={styles.quantityText}>{quantity}</Text> : null}
          <TouchableOpacity style={styles.editButton} onPress={() => onEdit(group.medication.id)} accessibilityLabel="수정">
            <Ionicons name="create-outline" size={18} color={ui.color.textSecondary} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.timeList}>
        {group.reminders.slice(0, 3).map(reminder => {
          const canCheck = isVerifiable(reminder, reminder.doseRecord)
          return (
            <TimeRow
              key={reminder.id}
              timeLabel={fmtTime(reminder.hour, reminder.minute, { am: '오전', pm: '오후' })}
              enabled={reminder.isEnabled !== 0}
              status={reminderStatus(reminder)}
              onToggle={(enabled) => onToggle(reminder.id, enabled)}
              onPress={() => canCheck ? onCheck(reminder.id) : onEdit(group.medication.id)}
            />
          )
        })}
        {group.reminders.length > 3 ? <Text style={styles.moreTimes}>외 {group.reminders.length - 3}개</Text> : null}
      </View>
    </Card>
  )
}

export default function HomeScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const tabBarHeight = useBottomTabBarHeight()
  const { isReady, isBackfilling, freezeEligibleSlots, confirmFreeze } = useAppInit()
  const { data: groups, loading, refresh } = useTodayMedicationGroups(isReady)
  const { wallet, loading: walletLoading } = useWalletSummary()
  const [freezesRemaining, setFreezesRemaining] = useState(0)
  const [notificationsGranted, setNotificationsGranted] = useState(true)
  const [permissionBannerDismissed, setPermissionBannerDismissed] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
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
        setNotificationsGranted(Boolean(permission.granted || permission.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL))
      })()
    }, [isReady]),
  )

  useEffect(() => {
    if (freezeEligibleSlots.length === 0) return
    void getSettings().then(settings => setFreezesRemaining(settings.freezesRemaining))
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

  const needsNotificationBanner = !notificationsGranted && groups.some(group => group.reminders.some(reminder => reminder.isEnabled !== 0))
  const showNotificationBanner = needsNotificationBanner && !permissionBannerDismissed
  const toastBottom = tabBarHeight + (showNotificationBanner ? 112 : 24)

  useEffect(() => {
    if (!needsNotificationBanner) setPermissionBannerDismissed(false)
  }, [needsNotificationBanner])

  const openRegistration = useCallback(() => router.push('/check-item'), [router])
  const openEdit = useCallback((medicationId: string) => {
    router.push({ pathname: '/check-item', params: { medicationId } })
  }, [router])
  const openCheck = useCallback((reminderTimeId: string) => {
    router.navigate(`/scan?slotId=${reminderTimeId}`)
  }, [router])
  const openScanTest = useCallback(() => {
    router.navigate('/scan?test=1')
  }, [router])
  const handleToggle = useCallback(async (reminderTimeId: string, enabled: boolean) => {
    await toggleReminderTimeEnabled(reminderTimeId, enabled)
    await refresh()
  }, [refresh])

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
          paddingTop: insets.top + 24,
          paddingHorizontal: ui.spacing.screenX,
          paddingBottom: tabBarHeight + 28,
        }}
      >
        <AppHeader title="Timepill" balance={wallet?.balance} balanceLoading={walletLoading} onAdd={openRegistration} />

        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>오늘</Text>
          <Text style={styles.summaryValue}>{totals.completed}/{totals.total}</Text>
          <Text style={styles.summaryMeta}>젤리 +{wallet?.todayEarned ?? 0}</Text>
        </View>

        <TouchableOpacity style={styles.scanTestButton} onPress={openScanTest} accessibilityLabel="스캔 테스트">
          <Ionicons name="scan-outline" size={17} color={ui.color.textPrimary} />
          <Text style={styles.scanTestButtonText}>스캔 테스트</Text>
        </TouchableOpacity>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>약</Text>
          <Text style={styles.sectionCount}>{groups.length}개</Text>
        </View>

        {groups.length === 0 ? (
          <EmptyState title="오늘 등록된 시간이 없습니다" />
        ) : (
          <View style={styles.groupList}>
            {groups.map(group => (
              <MedicationCard
                key={group.medication.id}
                group={group}
                onEdit={openEdit}
                onCheck={openCheck}
                onToggle={handleToggle}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {showNotificationBanner ? (
        <View style={[styles.permissionBanner, { bottom: tabBarHeight + 24 }]}> 
          <View style={styles.permissionHeader}>
            <Text style={styles.permissionTitle}>알림 권한이 꺼져 있습니다</Text>
            <TouchableOpacity style={styles.permissionClose} onPress={() => setPermissionBannerDismissed(true)}>
              <Ionicons name="close" size={16} color={ui.color.textSecondary} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.permissionButton} onPress={() => Linking.openSettings()}>
            <Text style={styles.permissionButtonText}>설정 열기</Text>
          </TouchableOpacity>
        </View>
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
  summaryCard: {
    alignItems: 'center',
    backgroundColor: ui.color.softCard,
    borderColor: '#E7DFD2',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  summaryLabel: {
    color: ui.color.textSecondary,
    fontSize: 14,
    fontWeight: '800',
  },
  summaryValue: {
    color: ui.color.textPrimary,
    fontSize: 30,
    fontWeight: '800',
  },
  summaryMeta: {
    color: ui.color.orange,
    fontSize: 14,
    fontWeight: '800',
  },
  scanTestButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: ui.color.input,
    borderColor: ui.color.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    height: 40,
    justifyContent: 'center',
    marginBottom: 20,
    paddingHorizontal: 14,
  },
  scanTestButtonText: {
    color: ui.color.textPrimary,
    fontSize: 13,
    fontWeight: '800',
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    color: ui.color.textPrimary,
    fontSize: 24,
    fontWeight: '800',
  },
  sectionCount: {
    color: ui.color.textSecondary,
    fontSize: 14,
    fontWeight: '800',
  },
  groupList: {
    gap: 14,
  },
  medicationCard: {
    gap: 16,
  },
  medicationHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  medicationTitleBlock: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 12,
  },
  colorSwatch: {
    borderRadius: 7,
    height: 14,
    width: 14,
  },
  medicationCopy: {
    flex: 1,
  },
  medicationTitle: {
    color: ui.color.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  medicationMeta: {
    color: ui.color.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  medicationActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  quantityText: {
    color: ui.color.textSecondary,
    fontSize: 13,
    fontWeight: '800',
  },
  editButton: {
    alignItems: 'center',
    backgroundColor: ui.color.input,
    borderRadius: 16,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  timeList: {
    gap: 10,
  },
  moreTimes: {
    color: ui.color.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    paddingLeft: 4,
  },
  permissionBanner: {
    backgroundColor: ui.color.card,
    borderColor: ui.color.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: 12,
    left: 24,
    paddingHorizontal: 16,
    paddingVertical: 14,
    position: 'absolute',
    right: 24,
  },
  permissionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  permissionTitle: {
    color: ui.color.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  permissionClose: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  permissionButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: ui.color.input,
    borderRadius: 14,
    height: 38,
    justifyContent: 'center',
    paddingHorizontal: 14,
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
    minHeight: 48,
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
})
