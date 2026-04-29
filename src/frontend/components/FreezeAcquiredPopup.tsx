import React from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native'

interface Props {
  visible: boolean
  currentStreak: number
  onClose: () => void
}

export function FreezeAcquiredPopup({ visible, currentStreak, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.box}>
          <Text style={s.icon}>🧊</Text>
          <Text style={s.title}>Freeze 획득!</Text>
          <Text style={s.body}>
            {currentStreak}일 연속 복용을 달성했습니다.{'\n'}
            Freeze 1개를 획득했습니다.
          </Text>
          <TouchableOpacity style={s.btn} onPress={onClose}>
            <Text style={s.btnTxt}>확인</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  box: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    width: 280,
    gap: 12,
  },
  icon: { fontSize: 48 },
  title: { fontSize: 22, fontWeight: '800', color: '#111' },
  body: { fontSize: 15, color: '#555', textAlign: 'center', lineHeight: 22 },
  btn: {
    marginTop: 4,
    backgroundColor: '#111',
    borderRadius: 12,
    paddingHorizontal: 32,
    paddingVertical: 12,
  },
  btnTxt: { fontSize: 16, fontWeight: '700', color: '#fff' },
})
