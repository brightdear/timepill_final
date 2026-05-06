import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { CraneGoalFrame } from '@/hooks/useCraneGameMachine'

type ExitChuteProps = {
  frame: CraneGoalFrame
}

export function ExitChute({ frame }: ExitChuteProps) {
  return (
    <View pointerEvents="none" style={[styles.wrap, { left: frame.x, top: frame.y, width: frame.width, height: frame.height }]}>
      <View style={styles.shadowBase} />
      <View style={styles.body}>
        <View style={styles.bodyInset} />
        <View style={styles.innerOpening} />
        <View
          style={[
            styles.slot,
            {
              left: (frame.width - frame.slotWidth) / 2,
              width: frame.slotWidth,
              top: frame.slotY - frame.y,
              height: frame.slotHeight,
            },
          ]}
        />
        <View
          style={[
            styles.slotInnerShadow,
            {
              left: (frame.width - frame.slotWidth) / 2 + 6,
              width: frame.slotWidth - 12,
              top: frame.slotY - frame.y + 3,
            },
          ]}
        />
        <Text style={styles.label}>출구</Text>
        <View style={styles.frontLip} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    zIndex: 48,
  },
  shadowBase: {
    ...StyleSheet.absoluteFillObject,
    top: 10,
    borderRadius: 26,
    backgroundColor: 'rgba(16,19,25,0.12)',
  },
  body: {
    flex: 1,
    borderRadius: 26,
    backgroundColor: '#FFF2D8',
    borderColor: '#FF9F0A',
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bodyInset: {
    position: 'absolute',
    top: 8,
    left: 10,
    right: 10,
    bottom: 10,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  innerOpening: {
    position: 'absolute',
    top: 24,
    left: 18,
    right: 18,
    height: 24,
    borderRadius: 14,
    backgroundColor: 'rgba(121,76,8,0.16)',
  },
  slot: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: '#E8C27A',
    borderColor: 'rgba(255,159,10,0.28)',
    borderWidth: 1,
    shadowColor: '#8A5A0A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
  },
  slotInnerShadow: {
    position: 'absolute',
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(121,76,8,0.24)',
  },
  label: {
    marginTop: 28,
    color: '#8A5A0A',
    fontSize: 15,
    fontWeight: '800',
  },
  frontLip: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 24,
    backgroundColor: 'rgba(255,159,10,0.20)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,159,10,0.22)',
  },
})
