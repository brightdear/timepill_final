import React from 'react'
import { StyleSheet, View } from 'react-native'

type CraneClawSpriteProps = {
  x: number
  y: number
  railY: number
  openRatio: number
  scale?: number
  sourceScale?: number
  sway?: number
}

const CARRIAGE_LOGICAL_WIDTH = 106
const CARRIAGE_LOGICAL_HEIGHT = 44
const CLAW_BODY_LOGICAL_WIDTH = 72
const CLAW_BODY_LOGICAL_HEIGHT = 38
const ROPE_LOGICAL_WIDTH = 4

function mix(from: number, to: number, progress: number) {
  return from + (to - from) * progress
}

export function CraneClawSprite({
  x,
  y,
  railY,
  openRatio,
  scale = 1,
  sourceScale = Math.max(0.1, railY / 258),
  sway = 0,
}: CraneClawSpriteProps) {
  const carriageWidth = CARRIAGE_LOGICAL_WIDTH * sourceScale
  const carriageHeight = CARRIAGE_LOGICAL_HEIGHT * sourceScale
  const bodyWidth = CLAW_BODY_LOGICAL_WIDTH * sourceScale
  const bodyHeight = CLAW_BODY_LOGICAL_HEIGHT * sourceScale
  const ropeWidth = Math.max(1.5, ROPE_LOGICAL_WIDTH * sourceScale)
  const clawBodyTop = y
  const ropeTop = railY + carriageHeight * 0.62
  const ropeHeight = Math.max(18 * sourceScale, clawBodyTop - ropeTop + bodyHeight * 0.15)
  const openAngle = mix(20, 42, openRatio)
  const armLength = mix(54, 68, openRatio) * sourceScale
  const armWidth = Math.max(3, 7 * sourceScale)
  const tipSize = Math.max(5, 11.5 * sourceScale)
  const pivotY = bodyHeight * 0.7
  const swayRotation = Math.max(-7, Math.min(7, sway * 0.25))

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.root]}>
      <View
        style={[
          styles.carriageShadow,
          {
            left: x - carriageWidth * 0.42,
            top: railY + carriageHeight * 0.72,
            width: carriageWidth * 0.84,
            height: Math.max(5, 11 * sourceScale),
            transform: [{ scale }],
          },
        ]}
      />
      <View
        style={[
          styles.carriage,
          {
            left: x - carriageWidth / 2,
            top: railY,
            width: carriageWidth,
            height: carriageHeight,
            borderRadius: 8 * sourceScale,
            transform: [{ scale }],
          },
        ]}
      >
        <View style={[styles.carriageTop, { height: Math.max(4, 8 * sourceScale) }]} />
        <View style={[styles.carriageHighlight, { left: carriageWidth * 0.16, width: carriageWidth * 0.5 }]} />
      </View>
      <View
        style={[
          styles.cable,
          {
            left: x - ropeWidth / 2,
            top: ropeTop,
            width: ropeWidth,
            height: ropeHeight,
          },
        ]}
      />
      <View
        style={[
          styles.clawWrap,
          {
            left: x - bodyWidth / 2,
            top: clawBodyTop,
            width: bodyWidth,
            height: bodyHeight + armLength * 0.95,
            transform: [{ translateX: sway * sourceScale }, { rotate: `${swayRotation}deg` }, { scale }],
          },
        ]}
      >
        <View
          style={[
            styles.clawBody,
            {
              left: 0,
              width: bodyWidth,
              height: bodyHeight,
              borderRadius: 9 * sourceScale,
            },
          ]}
        >
          <View style={[styles.clawBodyShine, { width: bodyWidth * 0.28 }]} />
        </View>
        <View
          style={[
            styles.clawNeck,
            {
              left: bodyWidth / 2 - armWidth * 0.6,
              top: bodyHeight * 0.76,
              width: armWidth * 1.2,
              height: armLength * 0.34,
              borderRadius: armWidth,
            },
          ]}
        />
        <View
          style={[
            styles.joint,
            {
              left: bodyWidth / 2 - armWidth * 1.35,
              top: pivotY - armWidth * 0.2,
              width: armWidth * 2.7,
              height: armWidth * 2.7,
              borderRadius: armWidth * 1.35,
            },
          ]}
        />
        <View
          style={[
            styles.centerArm,
            {
              left: bodyWidth / 2 - armWidth / 2,
              top: pivotY + armWidth * 0.9,
              width: armWidth,
              height: armLength * 0.72,
              borderRadius: armWidth / 2,
            },
          ]}
        />
        <View
          style={[
            styles.sideArm,
            {
              left: bodyWidth * 0.24,
              top: pivotY,
              width: armWidth,
              height: armLength,
              borderRadius: armWidth / 2,
              transform: [
                { translateX: -armWidth / 2 },
                { rotate: `${openAngle}deg` },
                { translateY: -armWidth * 0.2 },
              ],
            },
          ]}
        />
        <View
          style={[
            styles.sideArm,
            {
              right: bodyWidth * 0.24,
              top: pivotY,
              width: armWidth,
              height: armLength,
              borderRadius: armWidth / 2,
              transform: [
                { translateX: armWidth / 2 },
                { rotate: `${-openAngle}deg` },
                { translateY: -armWidth * 0.2 },
              ],
            },
          ]}
        />
        <View
          style={[
            styles.tip,
            {
              left: bodyWidth * 0.18,
              top: pivotY + armLength * 0.73,
              width: tipSize,
              height: tipSize,
              borderRadius: tipSize / 2,
            },
          ]}
        />
        <View
          style={[
            styles.tip,
            {
              right: bodyWidth * 0.18,
              top: pivotY + armLength * 0.73,
              width: tipSize,
              height: tipSize,
              borderRadius: tipSize / 2,
            },
          ]}
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    zIndex: 30,
  },
  carriageShadow: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(16,19,25,0.12)',
  },
  carriage: {
    position: 'absolute',
    overflow: 'hidden',
    backgroundColor: '#20242A',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.28)',
    zIndex: 12,
  },
  carriageTop: {
    width: '100%',
    backgroundColor: '#454B54',
  },
  carriageHighlight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  cable: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: '#1A1F27',
    opacity: 0.9,
    zIndex: 14,
  },
  clawWrap: {
    position: 'absolute',
    zIndex: 18,
  },
  clawBody: {
    position: 'absolute',
    top: 0,
    backgroundColor: '#2E3135',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    shadowColor: '#4B3217',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 6,
  },
  clawBodyShine: {
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  clawNeck: {
    position: 'absolute',
    backgroundColor: '#545A61',
    borderWidth: 1,
    borderColor: 'rgba(24,25,27,0.2)',
  },
  joint: {
    position: 'absolute',
    backgroundColor: '#3B3F45',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    zIndex: 1,
  },
  centerArm: {
    position: 'absolute',
    backgroundColor: '#50565E',
    borderWidth: 1,
    borderColor: 'rgba(24,25,27,0.24)',
    zIndex: 2,
  },
  sideArm: {
    position: 'absolute',
    backgroundColor: '#626870',
    borderWidth: 1,
    borderColor: 'rgba(24,25,27,0.24)',
    zIndex: 2,
  },
  tip: {
    position: 'absolute',
    backgroundColor: '#3B3E42',
  },
})
