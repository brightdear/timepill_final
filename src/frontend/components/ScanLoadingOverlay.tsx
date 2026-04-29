import React from 'react'
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native'

interface Props {
  visible: boolean
  message?: string
}

export function ScanLoadingOverlay({ visible, message = '알약을 인식하는 중...' }: Props) {
  if (!visible) return null
  return (
    <View style={s.overlay}>
      <View style={s.box}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={s.txt}>{message}</Text>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  box: { alignItems: 'center', gap: 16 },
  txt: { color: '#fff', fontSize: 16, fontWeight: '500' },
})
