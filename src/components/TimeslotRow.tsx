import React from 'react'
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Ionicons } from '@/components/AppIcon'
import { designHarness } from '@/design/designHarness'
import { deleteTimeslot, updateTimeslot } from '@/domain/timeslot/repository'
import type { TimeslotWithDose } from '@/hooks/useTodayTimeslots'
import { useI18n } from '@/hooks/useI18n'
import { isVerifiable } from '@/hooks/useTodayTimeslots'
import { fmtTime } from '@/utils/timeUtils'

interface Props {
  item: TimeslotWithDose
  onRefresh: () => void
  onOpenItem: (slotId: string) => void
  onVerify: (item: TimeslotWithDose) => void
}

type RowState = 'upcoming' | 'due' | 'overdue' | 'completed' | 'missed' | 'skipped' | 'off'

function rowStateFor(item: TimeslotWithDose): RowState {
  const { slot, doseRecord } = item
  if (slot.isActive === 0) return 'off'
  if (!doseRecord) return 'upcoming'
  if (doseRecord.status === 'completed' || doseRecord.status === 'frozen') return 'completed'
  if (doseRecord.status === 'missed') return 'missed'
  if (doseRecord.status === 'skipped') return 'skipped'
  if (isVerifiable(slot, doseRecord)) return 'due'

  const scheduled = new Date(doseRecord.scheduledTime).getTime()
  const windowEnd = scheduled + (slot.verificationWindowMin / 2) * 60 * 1000
  return Date.now() > windowEnd ? 'overdue' : 'upcoming'
}

function dotColor(state: RowState) {
  switch (state) {
    case 'due':
      return designHarness.colors.warning
    case 'overdue':
      return designHarness.colors.danger
    case 'completed':
      return designHarness.colors.success
    case 'missed':
      return '#C26D3B'
    case 'skipped':
      return '#B4B8BE'
    case 'off':
      return '#D7DADF'
    default:
      return '#D7DADF'
  }
}

function rowDisplayName(item: TimeslotWithDose, copy: ReturnType<typeof useI18n>['copy']) {
  const { slot, medication } = item
  const alias = slot.displayAlias?.trim()
  const realName = medication?.name?.trim()

  if (slot.privacyLevel === 'public') {
    return realName || alias || copy.rowFallbackAlias
  }

  if (slot.privacyLevel === 'custom') {
    return alias || copy.rowFallbackAlias
  }

  return copy.rowPrivateName
}

export function TimeslotRow({ item, onRefresh, onOpenItem, onVerify }: Props) {
  const { slot } = item
  const { copy } = useI18n()
  const rowState = rowStateFor(item)
  const canVerify = rowState === 'due' || rowState === 'overdue'
  const medName = rowDisplayName(item, copy)
  const timeLabel = fmtTime(slot.hour, slot.minute, { am: copy.amLabel, pm: copy.pmLabel })

  const handleDelete = async () => {
    await deleteTimeslot(slot.id)
    onRefresh()
  }

  const handleMore = () => {
    Alert.alert(medName, timeLabel, [
      { text: copy.rowEdit, onPress: () => onOpenItem(slot.id) },
      {
        text: slot.isActive === 1 ? copy.rowTurnOff : copy.rowTurnOn,
        onPress: async () => {
          await updateTimeslot(slot.id, { isActive: slot.isActive === 1 ? 0 : 1, skipUntil: null })
          onRefresh()
        },
      },
      { text: copy.delete, style: 'destructive', onPress: () => { void handleDelete() } },
      { text: copy.cancel, style: 'cancel' },
    ])
  }

  const renderAction = () => {
    if (rowState === 'completed') {
      return (
        <View style={[styles.stateBadge, styles.stateBadgeCompleted]}>
          <Ionicons name="checkmark" size={15} color={designHarness.colors.white} />
          <Text style={[styles.stateBadgeText, styles.stateBadgeTextCompleted]}>{copy.doseCompleted}</Text>
        </View>
      )
    }

    if (canVerify) {
      return (
        <TouchableOpacity style={styles.primaryAction} onPress={() => onVerify(item)}>
          <Text style={styles.primaryActionText}>{copy.rowCheck}</Text>
        </TouchableOpacity>
      )
    }

    const label = rowState === 'off'
      ? copy.rowStateOff
      : rowState === 'missed'
        ? copy.rowStateMissed
        : rowState === 'skipped'
          ? copy.rowStateSkipped
          : copy.rowStateUpcoming

    return (
      <View style={styles.stateBadge}>
        <Text style={styles.stateBadgeText}>{label}</Text>
      </View>
    )
  }

  return (
    <View style={[styles.row, rowState === 'off' && styles.rowMuted]}>
      <View style={[styles.dot, { backgroundColor: dotColor(rowState) }]} />
      <TouchableOpacity style={styles.info} onPress={() => onOpenItem(slot.id)} activeOpacity={0.8}>
        <Text style={styles.time}>{timeLabel}</Text>
        <Text style={styles.name} numberOfLines={1}>{medName}</Text>
      </TouchableOpacity>
      <View style={styles.actions}>
        {renderAction()}
        <TouchableOpacity style={styles.moreButton} onPress={handleMore}>
          <Ionicons name="ellipsis-horizontal" size={18} color={designHarness.colors.textMuted} />
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 18,
    backgroundColor: designHarness.colors.surface,
    borderRadius: 26,
    marginBottom: 14,
    gap: 16,
    borderWidth: 1,
    borderColor: '#E9EAEE',
  },
  rowMuted: {
    opacity: 0.62,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  info: {
    flex: 1,
    gap: 4,
  },
  time: {
    fontSize: 29,
    fontWeight: '800',
    color: designHarness.colors.textStrong,
  },
  name: {
    fontSize: 17,
    color: designHarness.colors.textMuted,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  primaryAction: {
    minWidth: 72,
    height: 48,
    borderRadius: 18,
    backgroundColor: designHarness.colors.warning,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  primaryActionText: {
    fontSize: 15,
    fontWeight: '800',
    color: designHarness.colors.white,
  },
  stateBadge: {
    minWidth: 72,
    height: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: designHarness.colors.surfaceSoft,
    paddingHorizontal: 12,
    flexDirection: 'row',
    gap: 6,
  },
  stateBadgeCompleted: {
    backgroundColor: designHarness.colors.success,
  },
  stateBadgeText: {
    fontSize: 14,
    fontWeight: '700',
    color: designHarness.colors.textMuted,
  },
  stateBadgeTextCompleted: {
    color: designHarness.colors.white,
  },
  moreButton: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: designHarness.colors.surfaceSoft,
  },
})
