import React from 'react'
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native'
import { designHarness } from '@/design/designHarness'

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
    // DESIGN: scan loading scrim color. Edit `designHarness.colors.overlayStrong`.
    backgroundColor: designHarness.colors.overlayStrong,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  box: { alignItems: 'center', gap: 16 },
  txt: { color: designHarness.colors.white, fontSize: 16, fontWeight: '500' },
})
