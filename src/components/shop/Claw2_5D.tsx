import React from 'react'
import { StyleSheet, View } from 'react-native'

type Claw2_5DProps = {
  x: number
  y: number
  railY: number
  openRatio: number
  scale?: number
}

function mix(from: number, to: number, progress: number) {
  return from + (to - from) * progress
}

export function Claw2_5D({ x, y, railY, openRatio, scale = 1 }: Claw2_5DProps) {
  const cableHeight = Math.max(18, y - railY + 18)
  const armSpread = mix(7, 16, openRatio)
  const armAngle = mix(11, 26, openRatio)
  const centerLength = mix(28, 24, openRatio)

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.carriageShadow, { left: x - 24, top: railY + 3, transform: [{ scale }] }]} />
      <View style={[styles.carriage, { left: x - 22, top: railY - 1, transform: [{ scale }] }]}>
        <View style={styles.carriageInset} />
        <View style={styles.carriageHighlight} />
      </View>
      <View style={[styles.depthWire, { left: x - 1, top: railY + 9, height: Math.max(12, y - railY - 10) }]} />
      <View style={[styles.cable, { left: x - 1.5, top: railY + 10, height: cableHeight }]} />

      <View style={[styles.head, { left: x - 21, top: y, transform: [{ scale }] }]}>
        <View style={styles.headGlow} />
        <View style={styles.headShell} />
        <View style={styles.palm} />
        <View style={[styles.arm, { left: 10 + armSpread * 0.35, transform: [{ rotate: `${armAngle}deg` }] }]}>
          <View style={styles.joint} />
          <View style={styles.tip} />
        </View>
        <View style={[styles.arm, { left: 23, height: centerLength }]}>
          <View style={styles.joint} />
          <View style={styles.tip} />
        </View>
        <View style={[styles.arm, { right: 10 + armSpread * 0.35, transform: [{ rotate: `${-armAngle}deg` }] }]}>
          <View style={styles.joint} />
          <View style={styles.tip} />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  carriageShadow: {
    position: 'absolute',
    width: 48,
    height: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(16,19,25,0.10)',
  },
  carriage: {
    position: 'absolute',
    width: 44,
    height: 20,
    borderRadius: 12,
    backgroundColor: '#101319',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 12,
  },
  carriageInset: {
    position: 'absolute',
    left: 6,
    right: 6,
    top: 5,
    bottom: 5,
    borderRadius: 10,
    backgroundColor: '#1C212A',
  },
  carriageHighlight: {
    position: 'absolute',
    top: 4,
    left: 10,
    right: 10,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  cable: {
    position: 'absolute',
    width: 2,
    borderRadius: 999,
    backgroundColor: '#1A1F27',
    opacity: 0.92,
  },
  depthWire: {
    position: 'absolute',
    width: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    zIndex: 10,
  },
  head: {
    position: 'absolute',
    width: 42,
    height: 68,
    alignItems: 'center',
    zIndex: 18,
  },
  headGlow: {
    position: 'absolute',
    top: 6,
    width: 38,
    height: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(16,19,25,0.12)',
  },
  headShell: {
    width: 40,
    height: 16,
    borderRadius: 10,
    backgroundColor: '#101319',
  },
  palm: {
    position: 'absolute',
    top: 16,
    width: 18,
    height: 14,
    borderBottomLeftRadius: 9,
    borderBottomRightRadius: 9,
    backgroundColor: '#1F252E',
  },
  arm: {
    position: 'absolute',
    top: 24,
    width: 4,
    height: 34,
    borderRadius: 999,
    backgroundColor: '#1F252E',
    alignItems: 'center',
  },
  joint: {
    position: 'absolute',
    top: -2,
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#313946',
  },
  tip: {
    position: 'absolute',
    bottom: -4,
    width: 8,
    height: 7,
    borderRadius: 6,
    backgroundColor: '#101319',
  },
})
