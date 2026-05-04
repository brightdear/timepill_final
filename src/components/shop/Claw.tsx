import React from 'react'
import { StyleSheet, View } from 'react-native'

type ClawProps = {
  x: number
  y: number
  closed: boolean
}

export function Claw({ x, y, closed }: ClawProps) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.cable, { left: x - 1, height: y + 14 }]} />
      <View style={[styles.head, { left: x - 15, top: y }]}>
        <View style={styles.headBar} />
        <View style={[styles.arm, styles.leftArm, closed && styles.leftArmClosed]} />
        <View style={[styles.arm, styles.rightArm, closed && styles.rightArmClosed]} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  cable: {
    position: 'absolute',
    top: 0,
    width: 2,
    backgroundColor: '#8A8F98',
  },
  head: {
    position: 'absolute',
    width: 30,
    height: 42,
    alignItems: 'center',
  },
  headBar: {
    width: 30,
    height: 12,
    borderRadius: 8,
    backgroundColor: '#101319',
  },
  arm: {
    position: 'absolute',
    top: 10,
    width: 4,
    height: 36,
    borderRadius: 999,
    backgroundColor: '#8A8F98',
  },
  leftArm: {
    left: 6,
    transform: [{ rotate: '20deg' }],
  },
  rightArm: {
    right: 6,
    transform: [{ rotate: '-20deg' }],
  },
  leftArmClosed: {
    left: 10,
    transform: [{ rotate: '8deg' }],
  },
  rightArmClosed: {
    right: 10,
    transform: [{ rotate: '-8deg' }],
  },
})