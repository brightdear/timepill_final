import React, { useState } from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { WheelColumn } from './WheelColumn'

const AM_PM = ['오전', '오후']
const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1))
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))

interface Props {
  visible: boolean
  initialHour: number   // 0-23
  initialMinute: number // 0-59
  onConfirm: (hour: number, minute: number) => void
  onClose: () => void
}

function toAmPmIdx(h: number) { return h < 12 ? 0 : 1 }
function toHourIdx(h: number) { return (h % 12 === 0 ? 12 : h % 12) - 1 }
function to24h(amPmIdx: number, hourIdx: number) {
  const h12 = hourIdx + 1
  if (amPmIdx === 0) return h12 === 12 ? 0 : h12
  return h12 === 12 ? 12 : h12 + 12
}

export function TimePickerModal({
  visible,
  initialHour,
  initialMinute,
  onConfirm,
  onClose,
}: Props) {
  const [amPmIdx, setAmPmIdx] = useState(() => toAmPmIdx(initialHour))
  const [hourIdx, setHourIdx] = useState(() => toHourIdx(initialHour))
  const [minIdx, setMinIdx] = useState(initialMinute)

  const confirm = () => {
    onConfirm(to24h(amPmIdx, hourIdx), minIdx)
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.sheet}>
          <Text style={s.title}>시간 선택</Text>
          <View style={s.wheelRow}>
            <WheelColumn items={AM_PM} selectedIndex={amPmIdx} onIndexChange={setAmPmIdx} width={72} />
            <WheelColumn
              items={HOURS}
              selectedIndex={hourIdx}
              onIndexChange={setHourIdx}
              width={64}
              enableDirectInput
              numericInput
            />
            <Text style={s.colon}>:</Text>
            <WheelColumn
              items={MINUTES}
              selectedIndex={minIdx}
              onIndexChange={setMinIdx}
              width={64}
              enableDirectInput
              numericInput
            />
          </View>
          <View style={s.btnRow}>
            <TouchableOpacity onPress={onClose} style={s.btn}>
              <Text style={s.btnTxt}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={confirm} style={[s.btn, s.btnPrimary]}>
              <Text style={[s.btnTxt, { color: '#fff' }]}>확인</Text>
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
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: 40,
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 16,
    color: '#111',
  },
  wheelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  colon: {
    fontSize: 22,
    fontWeight: '600',
    color: '#111',
    marginHorizontal: 4,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  btn: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f0f0',
  },
  btnPrimary: {
    backgroundColor: '#111',
  },
  btnTxt: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111',
  },
})
