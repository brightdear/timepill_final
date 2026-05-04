import React from 'react'
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native'
import { Capsule } from '@/components/shop/Capsule'
import { Claw } from '@/components/shop/Claw'
import type { CraneCapsule, CraneGameState } from '@/components/shop/useCraneGame'

type CraneMachineProps = {
  height: number
  clawX: number
  clawY: number
  goalX: number
  capsules: CraneCapsule[]
  attachedCapsuleId: string | null
  state: CraneGameState
  onLayout: (event: LayoutChangeEvent) => void
}

export function CraneMachine({
  height,
  clawX,
  clawY,
  goalX,
  capsules,
  attachedCapsuleId,
  state,
  onLayout,
}: CraneMachineProps) {
  const closed = state === 'grabbing' || state === 'lifting' || state === 'carrying' || state === 'droppingToGoal'

  return (
    <View style={[styles.machine, { height }]} onLayout={onLayout}>
      <View style={styles.backPanel} />
      <View style={styles.track} />
      <View style={[styles.goal, { left: Math.max(12, goalX - 40) }]}>
        <Text style={styles.goalText}>출구</Text>
      </View>
      <View style={styles.floor} />
      {capsules.map(capsule => {
        const attached = capsule.id === attachedCapsuleId
        return (
          <Capsule
            key={capsule.id}
            capsule={capsule}
            x={attached ? clawX : capsule.x}
            y={attached ? clawY + 58 : capsule.y}
            elevated={attached}
          />
        )
      })}
      <Claw x={clawX} y={clawY} closed={closed} />
    </View>
  )
}

const styles = StyleSheet.create({
  machine: {
    overflow: 'hidden',
    borderRadius: 24,
    backgroundColor: '#F4F1EA',
    borderWidth: 1,
    borderColor: '#E6DED1',
  },
  backPanel: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#F8F5EF',
  },
  track: {
    position: 'absolute',
    top: 18,
    left: 18,
    right: 18,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#D8D4CC',
  },
  goal: {
    position: 'absolute',
    right: 14,
    bottom: 16,
    width: 76,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#FFF2D8',
    borderWidth: 1,
    borderColor: '#F7C77A',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  goalText: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '800',
    color: '#8A5A0A',
  },
  floor: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 38,
    backgroundColor: 'rgba(232,220,200,0.72)',
  },
})