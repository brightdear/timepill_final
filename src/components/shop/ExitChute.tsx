import React from 'react'
import { StyleSheet, View } from 'react-native'
import type { CraneGoalFrame } from '@/hooks/useCraneGameMachine'

type ExitChuteProps = {
  frame: CraneGoalFrame
}

export function ExitChute({ frame }: ExitChuteProps) {
  return (
    <View
      pointerEvents="none"
      style={[
        styles.holeWrap,
        {
          left: frame.x,
          top: frame.y,
          width: frame.width,
          height: frame.height,
        },
      ]}
    >
      <View style={styles.floorPanel} />
      <View
        style={[
          styles.slotShadow,
          {
            left: (frame.width - frame.slotWidth) / 2 - 4,
            top: frame.slotY - frame.y - 4,
            width: frame.slotWidth + 8,
            height: frame.slotHeight + 8,
          },
        ]}
      />
      <View
        style={[
          styles.slot,
          {
            left: (frame.width - frame.slotWidth) / 2,
            top: frame.slotY - frame.y,
            width: frame.slotWidth,
            height: frame.slotHeight,
          },
        ]}
      />
      <View
        style={[
          styles.slotGlow,
          {
            left: (frame.width - frame.slotWidth) / 2 + 8,
            top: frame.slotY - frame.y + 3,
            width: frame.slotWidth - 16,
          },
        ]}
      />
    </View>
  )
}

export function PrizeOutlet({ frame }: ExitChuteProps) {
  return (
    <View
      pointerEvents="none"
      style={[
        styles.outletWrap,
        {
          left: frame.outletX,
          top: frame.outletY,
          width: frame.outletWidth,
          height: frame.outletHeight,
        },
      ]}
    >
      <View style={styles.outletShadow} />
      <View style={styles.outletSlot} />
      <View style={styles.outletHighlight} />
    </View>
  )
}

const styles = StyleSheet.create({
  holeWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'flex-start',
    zIndex: 12,
  },
  floorPanel: {
    position: 'absolute',
    left: 6,
    right: 6,
    top: 2,
    bottom: 6,
    borderRadius: 24,
    backgroundColor: 'rgba(255,242,216,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(166,111,38,0.12)',
  },
  slotShadow: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(61,40,18,0.30)',
  },
  slot: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: '#B9843D',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
  },
  slotGlow: {
    position: 'absolute',
    height: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  outletWrap: {
    position: 'absolute',
    borderRadius: 18,
    backgroundColor: 'rgba(255,242,216,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(255,159,10,0.26)',
    overflow: 'hidden',
    zIndex: 45,
  },
  outletShadow: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: 8,
    height: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(105,72,22,0.24)',
  },
  outletSlot: {
    position: 'absolute',
    left: 20,
    right: 20,
    top: 11,
    height: 9,
    borderRadius: 999,
    backgroundColor: '#B8873F',
  },
  outletHighlight: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 4,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.26)',
  },
})
