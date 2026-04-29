import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native'
import { updateTimeslot, deleteTimeslot } from '@backend/timeslot/repository'
import { cancelAlarmsForSlot, scheduleAlarmsForSlot } from '@backend/alarm/alarmScheduler'
import { cancelForceAlarmsForSlot, scheduleForceAlarmsForSlot } from '@backend/alarm/forceAlarmScheduler'
import { toLocalISOString } from '@shared/utils/dateUtils'
import type { TimeslotWithDose } from '@frontend/hooks/useTodayTimeslots'
import { isVerifiable } from '@frontend/hooks/useTodayTimeslots'
import { displayMedicationName } from '@shared/utils/displayName'
import { fmtTime } from '@shared/utils/timeUtils'

interface Props {
  item: TimeslotWithDose
  index: number
  onRefresh: () => void
  onEdit: (slotId: string) => void
  onVerify: (item: TimeslotWithDose) => void
  privateMode: boolean
  privateIndex: number
}

function statusColor(status: string | undefined): string {
  if (status === 'completed') return '#22c55e'
  if (status === 'missed') return '#ef4444'
  return '#d1d5db'
}

export function TimeslotRow({ item, index, onRefresh, onEdit, onVerify, privateMode, privateIndex }: Props) {
  const { slot, doseRecord, medication } = item
  const isOff = slot.isActive === 0
  const isSkip = isOff && slot.skipUntil !== null
  const canVerify = isVerifiable(slot, doseRecord)
  const actualMedName = medication?.name ?? '(삭제된 약)'
  const medName = displayMedicationName(actualMedName, privateIndex ?? index, privateMode)

  // DB state alone is not enough: already-scheduled notifications must be cancelled too.
  const cancelScheduledAlarms = async () => {
    await Promise.all([
      cancelAlarmsForSlot(slot),
      cancelForceAlarmsForSlot(slot),
    ])
  }

  const handleToggleOff = () => {
    Alert.alert('하루만 건너뛰시겠습니까?', '', [
      {
        text: '하루만 건너뛰기',
        onPress: async () => {
          const scheduled = new Date()
          scheduled.setHours(slot.hour, slot.minute, 0, 0)
          const skipUntil = toLocalISOString(
            new Date(scheduled.getTime() + (slot.verificationWindowMin / 2) * 60 * 1000),
          )
          await updateTimeslot(slot.id, { isActive: 0, skipUntil })
          await cancelScheduledAlarms()
          onRefresh()
        },
      },
      {
        text: '완전 off',
        onPress: async () => {
          await updateTimeslot(slot.id, { isActive: 0, skipUntil: null })
          await cancelScheduledAlarms()
          onRefresh()
        },
      },
      { text: '취소', style: 'cancel' },
    ])
  }

  const handleToggleOn = async () => {
    await updateTimeslot(slot.id, { isActive: 1, skipUntil: null })
    // Recreate notifications from the updated active state.
    const updatedSlot = { ...slot, isActive: 1, skipUntil: null }
    await scheduleAlarmsForSlot(updatedSlot, actualMedName)
    await scheduleForceAlarmsForSlot(updatedSlot, actualMedName)
    onRefresh()
  }

  const handleDelete = () => {
    Alert.alert('슬롯 삭제', `${medName} ${fmtTime(slot.hour, slot.minute)} 슬롯을 삭제하시겠습니까?`, [
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          await deleteTimeslot(slot.id)
          onRefresh()
        },
      },
      { text: '취소', style: 'cancel' },
    ])
  }

  const dotColor = doseRecord ? statusColor(doseRecord.status) : '#d1d5db'
  const rowOpacity = isSkip ? 0.5 : isOff ? 0.3 : 1

  return (
    <View style={[s.row, { opacity: rowOpacity }]}>
      {/* Status dot */}
      <View style={[s.dot, { backgroundColor: dotColor }]} />

      {/* Main info */}
      <TouchableOpacity style={s.info} onPress={() => onEdit(slot.id)} activeOpacity={0.7}>
        <Text style={s.time}>{fmtTime(slot.hour, slot.minute)}</Text>
        <Text style={s.name} numberOfLines={1}>{medName}</Text>
        <Text style={s.dose}>{slot.doseCountPerIntake}정</Text>
        {slot.forceAlarm === 1 && <Text style={s.forceTag}>강제</Text>}
      </TouchableOpacity>

      {/* Verify button */}
      <TouchableOpacity
        style={[s.verifyBtn, canVerify ? s.verifyActive : s.verifyInactive]}
        onPress={() => canVerify && onVerify(item)}
        disabled={!canVerify}
      >
        <Text style={[s.verifyTxt, canVerify && { color: '#fff' }]}>
          {doseRecord?.status === 'completed' ? '완료' : '인증'}
        </Text>
      </TouchableOpacity>

      {/* Toggle */}
      <TouchableOpacity
        style={[s.toggleBtn, isOff && s.toggleOff]}
        onPress={isOff ? handleToggleOn : handleToggleOff}
      >
        <Text style={[s.toggleTxt, isOff && { color: '#aaa' }]}>{isOff ? 'OFF' : 'ON'}</Text>
      </TouchableOpacity>

      {/* Delete */}
      <TouchableOpacity style={s.deleteBtn} onPress={handleDelete}>
        <Text style={s.deleteTxt}>✕</Text>
      </TouchableOpacity>
    </View>
  )
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderRadius: 14,
    marginBottom: 10,
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  info: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  time: { fontSize: 15, fontWeight: '600', color: '#111' },
  name: { fontSize: 14, color: '#444', flex: 1 },
  dose: { fontSize: 13, color: '#888' },
  forceTag: {
    fontSize: 11,
    color: '#ef4444',
    fontWeight: '700',
    borderWidth: 1,
    borderColor: '#ef4444',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  streakTxt: { fontSize: 13, color: '#f59e0b' },
  verifyBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  verifyActive: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  verifyInactive: { backgroundColor: 'transparent', borderColor: '#d1d5db' },
  verifyTxt: { fontSize: 13, fontWeight: '600', color: '#aaa' },
  toggleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#111',
  },
  toggleOff: { backgroundColor: '#f2f2f2' },
  toggleTxt: { fontSize: 12, fontWeight: '700', color: '#fff' },
  deleteBtn: { padding: 6 },
  deleteTxt: { fontSize: 14, color: '#d1d5db' },
})
