import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { CraneCapsule } from '@/components/shop/useCraneGame'

type CapsuleProps = {
  capsule: CraneCapsule
  x: number
  y: number
  elevated?: boolean
}

export function Capsule({ capsule, x, y, elevated = false }: CapsuleProps) {
  const size = capsule.radius * 2

  return (
    <View
      pointerEvents="none"
      style={[
        styles.capsule,
        {
          width: size,
          height: size,
          borderRadius: capsule.radius,
          left: x - capsule.radius,
          top: y - capsule.radius,
          backgroundColor: capsule.color,
        },
        elevated && styles.elevated,
      ]}
    >
      <View style={styles.gloss} />
      <Text style={styles.emoji}>{capsule.prize.emoji}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  capsule: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(16,19,25,0.08)',
  },
  elevated: {
    zIndex: 8,
  },
  gloss: {
    position: 'absolute',
    top: 4,
    left: 5,
    width: 8,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.64)',
  },
  emoji: {
    fontSize: 12,
    lineHeight: 14,
  },
})