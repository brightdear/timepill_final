import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs'
import { useRouter } from 'expo-router'
import { useFocusEffect } from '@react-navigation/native'
import * as Notifications from 'expo-notifications'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@/components/AppIcon'
import { FreezePopup } from '@/components/FreezePopup'
import { ScreenTopBar } from '@/components/ScreenTopBar'
import { designHarness } from '@/design/designHarness'
import { getSettings } from '@/domain/settings/repository'
import { useAppInit } from '@/hooks/useAppInit'
import { isVerifiable, type TimeslotWithDose, useTodayTimeslots } from '@/hooks/useTodayTimeslots'
import { useWalletSummary } from '@/hooks/useWalletSummary'
import { fmtTime } from '@/utils/timeUtils'
import { subscribeToast } from '@/utils/uiEvents'

type RowTone = 'check' | 'done' | 'missed' | 'pending'

type ChecklistRowItem = {
  id: string
  slotId: string
  tone: RowTone
  alias: string
  timeLabel: string
  buttonLabel: string
  canCheck: boolean
}

function resolveAlias(item: TimeslotWithDose) {
  const display = item.slot.displayAlias?.trim() || item.medication?.name?.trim() || '복용 항목'
  if (item.slot.privacyLevel === 'public' || item.slot.privacyLevel === 'custom') {
    return display
  }

  return '비공개 항목'
}

function resolveRowState(item: TimeslotWithDose): Pick<ChecklistRowItem, 'tone' | 'buttonLabel' | 'canCheck'> {
  const status = item.doseRecord?.status

  if (status === 'completed' || status === 'frozen') {
    return {
      tone: 'done',
      buttonLabel: '완료',
      canCheck: false,
    }
  }

  if (status === 'missed' || status === 'skipped') {
    return {
      tone: 'missed',
      buttonLabel: '놓침',
      canCheck: false,
    }
  }

  if (isVerifiable(item.slot, item.doseRecord)) {
    return {
      tone: 'check',
      buttonLabel: '체크',
      canCheck: true,
    }
  }

  return {
    tone: 'pending',
    buttonLabel: '예정',
    canCheck: false,
  }
}

function buildChecklist(items: TimeslotWithDose[]) {
  const activeItems = items
    .filter(item => item.slot.isActive === 1)
    .sort((left, right) => (left.slot.hour * 60 + left.slot.minute) - (right.slot.hour * 60 + right.slot.minute))

  const rows = activeItems.map(item => ({
    id: item.slot.id,
    slotId: item.slot.id,
    alias: resolveAlias(item),
    timeLabel: fmtTime(item.slot.hour, item.slot.minute, { am: '오전', pm: '오후' }),
    ...resolveRowState(item),
  }))

  const completedCount = activeItems.filter(item => {
    const status = item.doseRecord?.status
    return status === 'completed' || status === 'frozen'
  }).length

  const nextPending = activeItems.find(item => {
    const status = item.doseRecord?.status
    return status !== 'completed' && status !== 'frozen' && status !== 'missed' && status !== 'skipped'
  })

  return {
    rows,
    completedCount,
    totalCount: activeItems.length,
    nextLabel: nextPending
      ? fmtTime(nextPending.slot.hour, nextPending.slot.minute, { am: '오전', pm: '오후' })
      : '오늘 완료',
  }
}

function ChecklistRow({
  item,
  onCheck,
  onMore,
}: {
  item: ChecklistRowItem
  onCheck: (slotId: string) => void
  onMore: (slotId: string) => void
}) {
  return (
    <View style={styles.rowCard}>
      <View style={styles.rowLeading}>
        <View
          style={[
            styles.statusDot,
            item.tone === 'check' && styles.statusDotCheck,
            item.tone === 'done' && styles.statusDotDone,
            item.tone === 'missed' && styles.statusDotMissed,
          ]}
        />
        <View style={styles.rowCopy}>
          <Text style={styles.rowTime}>{item.timeLabel}</Text>
          <Text style={styles.rowAlias} numberOfLines={1}>{item.alias}</Text>
        </View>
      </View>

      <View style={styles.rowActions}>
        <TouchableOpacity
          style={[
            styles.checkButton,
            !item.canCheck && styles.checkButtonMuted,
          ]}
          onPress={() => item.canCheck && onCheck(item.slotId)}
          disabled={!item.canCheck}
        >
          <Text
            style={[
              styles.checkButtonText,
              !item.canCheck && styles.checkButtonTextMuted,
            ]}
          >
            {item.buttonLabel}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.moreButton} onPress={() => onMore(item.slotId)}>
          <Ionicons name="ellipsis-horizontal" size={18} color={designHarness.colors.textStrong} />
        </TouchableOpacity>
      </View>
    </View>
  )
}

export default function HomeScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const tabBarHeight = useBottomTabBarHeight()
  const { isReady, isBackfilling, freezeEligibleSlots, confirmFreeze } = useAppInit()
  const { data, loading } = useTodayTimeslots(isReady)
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

  const checklist = useMemo(() => buildChecklist(data), [data])
  const needsNotificationBanner = !notificationsGranted && data.some(item => item.slot.isActive === 1 && item.slot.alarmEnabled === 1)
  const showNotificationBanner = needsNotificationBanner && !permissionBannerDismissed
  const toastBottom = tabBarHeight + (showNotificationBanner ? 112 : 24)

  useEffect(() => {
    if (!needsNotificationBanner) setPermissionBannerDismissed(false)
  }, [needsNotificationBanner])

  const openRegistration = useCallback(() => {
    router.push('/check-item')
  }, [router])

  const openManage = useCallback((slotId: string) => {
    router.push({ pathname: '/check-item', params: { slotId } })
  }, [router])

  const openCheck = useCallback((slotId: string) => {
    router.navigate(`/scan?slotId=${slotId}`)
  }, [router])

  if (!isReady || loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={designHarness.colors.textStrong} />
        {isBackfilling ? <Text style={styles.loadingText}>기록을 정리하는 중입니다</Text> : null}
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <FlatList
        data={checklist.rows}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.rowSpacer} />}
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingHorizontal: 24,
          paddingBottom: tabBarHeight + 24,
        }}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            <ScreenTopBar
              title="Timepill"
              balance={wallet?.balance}
              balanceLoading={walletLoading}
              actions={(
                <TouchableOpacity style={styles.plusButton} onPress={openRegistration}>
                  <Ionicons name="add" size={22} color={designHarness.colors.white} />
                </TouchableOpacity>
              )}
            />
            <Text style={styles.sectionTitle}>오늘 체크</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>오늘 일정이 없습니다</Text>
            <TouchableOpacity style={styles.emptyButton} onPress={openRegistration}>
              <Text style={styles.emptyButtonText}>일정 추가</Text>
            </TouchableOpacity>
          </View>
        }
        ListFooterComponent={
          <View style={styles.summaryCard}>
            <Text style={styles.summaryEyebrow}>오늘</Text>
            <Text style={styles.summaryCount}>{checklist.completedCount} / {checklist.totalCount} 완료</Text>
            <Text style={styles.summaryMeta}>다음 {checklist.nextLabel}</Text>
            <Text style={styles.summaryJelly}>젤리 +{wallet?.todayEarned ?? 0}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <ChecklistRow item={item} onCheck={openCheck} onMore={openManage} />
        )}
      />

      {showNotificationBanner ? (
        <View style={[styles.permissionBanner, { bottom: tabBarHeight + 24 }]}> 
          <View style={styles.permissionHeader}>
            <Text style={styles.permissionTitle}>알림을 켜면 체크 시점을 놓치지 않습니다</Text>
            <TouchableOpacity style={styles.permissionClose} onPress={() => setPermissionBannerDismissed(true)}>
              <Ionicons name="close" size={16} color={designHarness.colors.textMuted} />
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
    backgroundColor: '#FAFAF8',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: '#FAFAF8',
  },
  loadingText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#8A8F98',
  },
  headerBlock: {
    gap: 20,
    marginBottom: 18,
  },
  plusButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#101319',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#101319',
  },
  rowSpacer: {
    height: 10,
  },
  rowCard: {
    minHeight: 80,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EAEE',
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowLeading: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#D8D8D8',
  },
  statusDotCheck: {
    backgroundColor: '#FF9F0A',
  },
  statusDotDone: {
    backgroundColor: '#22C55E',
  },
  statusDotMissed: {
    backgroundColor: '#B4532A',
  },
  rowCopy: {
    flex: 1,
    gap: 2,
  },
  rowTime: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8A8F98',
  },
  rowAlias: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '700',
    color: '#101319',
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkButton: {
    minWidth: 72,
    height: 44,
    borderRadius: 20,
    backgroundColor: '#FF9F0A',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  checkButtonMuted: {
    backgroundColor: '#F1F1F3',
  },
  checkButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  checkButtonTextMuted: {
    color: '#8A8F98',
  },
  moreButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F1F1F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCard: {
    marginTop: 24,
    minHeight: 126,
    borderRadius: 30,
    backgroundColor: '#FFF2D8',
    borderWidth: 1,
    borderColor: '#F3D6A4',
    paddingHorizontal: 20,
    paddingVertical: 18,
    gap: 6,
  },
  summaryEyebrow: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8A8F98',
  },
  summaryCount: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: '800',
    color: '#101319',
  },
  summaryMeta: {
    fontSize: 16,
    fontWeight: '500',
    color: '#101319',
  },
  summaryJelly: {
    fontSize: 14,
    fontWeight: '700',
    color: '#B4532A',
  },
  emptyCard: {
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EAEE',
    paddingHorizontal: 20,
    paddingVertical: 24,
    alignItems: 'center',
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#101319',
  },
  emptyButton: {
    minWidth: 112,
    height: 42,
    borderRadius: 18,
    backgroundColor: '#101319',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  emptyButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  permissionBanner: {
    position: 'absolute',
    left: 24,
    right: 24,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EAEE',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  permissionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  permissionTitle: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: '#101319',
  },
  permissionClose: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionButton: {
    alignSelf: 'flex-start',
    minWidth: 92,
    height: 38,
    borderRadius: 18,
    backgroundColor: '#F1F1F3',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  permissionButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#101319',
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
