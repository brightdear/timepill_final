import React, { useEffect, useState } from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { WheelColumn } from './WheelColumn'
import { designHarness } from '@/design/designHarness'

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))

interface Props {
  visible: boolean
  initialHour: number   // 0-23
  initialMinute: number // 0-59
  title: string
  amLabel: string
  pmLabel: string
  cancelLabel: string
  confirmLabel: string
  onConfirm: (hour: number, minute: number) => void
  onClose: () => void
}

function selectedTimeLabel(hour: number, minute: number, amLabel: string, pmLabel: string) {
  const period = hour < 12 ? amLabel : pmLabel
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return `${period} ${hour12}:${String(minute).padStart(2, '0')}`
}

function normalizeHourState(hour: number) {
  const periodIndex = hour < 12 ? 0 : 1
  const hour12 = hour % 12 === 0 ? 12 : hour % 12

  return {
    periodIndex,
    hourIndex: hour12 - 1,
  }
}

export function TimePickerModal({
  visible,
  initialHour,
  initialMinute,
  title,
  amLabel,
  pmLabel,
  cancelLabel,
  confirmLabel,
  onConfirm,
  onClose,
}: Props) {
  const [periodIdx, setPeriodIdx] = useState(initialHour < 12 ? 0 : 1)
  const [hourIdx, setHourIdx] = useState(normalizeHourState(initialHour).hourIndex)
  const [minIdx, setMinIdx] = useState(initialMinute)

  useEffect(() => {
    if (!visible) return
    const nextState = normalizeHourState(initialHour)
    setPeriodIdx(nextState.periodIndex)
    setHourIdx(nextState.hourIndex)
    setMinIdx(initialMinute)
  }, [initialHour, initialMinute, visible])

  const confirm = () => {
    const hour12 = hourIdx + 1
    const normalizedHour = periodIdx === 0
      ? (hour12 === 12 ? 0 : hour12)
      : (hour12 === 12 ? 12 : hour12 + 12)

    onConfirm(normalizedHour, minIdx)
  }

  const periodItems = [amLabel, pmLabel]
  const selectedHour = periodIdx === 0
    ? (hourIdx + 1 === 12 ? 0 : hourIdx + 1)
    : (hourIdx + 1 === 12 ? 12 : hourIdx + 13)

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.sheet}>
          <TouchableOpacity style={s.closeButton} onPress={onClose}>
            <Text style={s.closeButtonText}>×</Text>
          </TouchableOpacity>

          <Text style={s.title}>{title}</Text>
          <View style={s.wheelCard}>
            <WheelColumn
              items={periodItems}
              selectedIndex={periodIdx}
              onIndexChange={setPeriodIdx}
              width={70}
            />
            <WheelColumn
              items={HOURS}
              selectedIndex={hourIdx}
              onIndexChange={setHourIdx}
              width={74}
              enableDirectInput
              numericInput
            />
            <Text style={s.colon}>:</Text>
            <WheelColumn
              items={MINUTES}
              selectedIndex={minIdx}
              onIndexChange={setMinIdx}
              width={74}
              enableDirectInput
              numericInput
            />
          </View>
          <Text style={s.selectedLabel}>{selectedTimeLabel(selectedHour, minIdx, amLabel, pmLabel)}</Text>
          <View style={s.btnRow}>
            <TouchableOpacity onPress={onClose} style={s.btn}>
              <Text style={s.btnTxt}>{cancelLabel}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={confirm} style={[s.btn, s.btnPrimary]}>
              <Text style={[s.btnTxt, s.btnTxtPrimary]}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,16,20,0.28)',
    paddingHorizontal: 14,
    paddingTop: 24,
    paddingBottom: 24,
    justifyContent: 'center',
  },
  sheet: {
    backgroundColor: designHarness.colors.surface,
    borderRadius: 34,
    paddingTop: 28,
    paddingBottom: 28,
    paddingHorizontal: 20,
  },
  closeButton: {
    position: 'absolute',
    top: 18,
    right: 18,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: designHarness.colors.black,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  closeButtonText: {
    fontSize: 30,
    lineHeight: 30,
    color: designHarness.colors.white,
    fontWeight: '300',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 24,
    color: designHarness.colors.textStrong,
  },
  wheelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 340,
    borderRadius: 30,
    backgroundColor: '#F5F1F1',
  },
  colon: {
    fontSize: 32,
    fontWeight: '800',
    color: designHarness.colors.textStrong,
    marginHorizontal: 2,
  },
  selectedLabel: {
    marginTop: 18,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '700',
    color: designHarness.colors.textStrong,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 28,
  },
  btn: {
    flex: 1,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: designHarness.colors.surfaceMuted,
  },
  btnPrimary: {
    backgroundColor: designHarness.colors.warning,
  },
  btnTxt: {
    fontSize: 18,
    fontWeight: '700',
    color: designHarness.colors.textStrong,
  },
  btnTxtPrimary: {
    color: '#fff',
  },
})
