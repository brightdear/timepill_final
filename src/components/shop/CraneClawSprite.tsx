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

const CARRIAGE_LOGICAL_WIDTH = 118
const CARRIAGE_LOGICAL_HEIGHT = 56
const CLAW_BODY_LOGICAL_WIDTH = 86
const CLAW_BODY_LOGICAL_HEIGHT = 44
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
          styles.carriageShell,
          {
            left: x - carriageWidth / 2,
            top: railY,
            width: carriageWidth,
            height: carriageHeight,
            transform: [{ scale }],
          },
        ]}
      >
        <View style={[styles.carriageTop, { height: Math.max(5, 10 * sourceScale) }]} />
        <View
          style={[
            styles.carriageWindow,
            {
              left: carriageWidth * 0.12,
              right: carriageWidth * 0.12,
              top: carriageHeight * 0.34,
              height: carriageHeight * 0.42,
              borderRadius: 12 * sourceScale,
            },
          ]}
        />
        <View
          style={[
            styles.carriageHighlight,
            {
              left: carriageWidth * 0.16,
              top: carriageHeight * 0.18,
              width: carriageWidth * 0.34,
              height: carriageHeight * 0.2,
            },
          ]}
        />
        <View
          style={[
            styles.carriageBolt,
            {
              left: carriageWidth * 0.14,
              top: carriageHeight * 0.18,
              width: Math.max(4, 7 * sourceScale),
              height: Math.max(4, 7 * sourceScale),
              borderRadius: Math.max(2, 3.5 * sourceScale),
            },
          ]}
        />
        <View
          style={[
            styles.carriageBolt,
            {
              right: carriageWidth * 0.14,
              top: carriageHeight * 0.18,
              width: Math.max(4, 7 * sourceScale),
              height: Math.max(4, 7 * sourceScale),
              borderRadius: Math.max(2, 3.5 * sourceScale),
            },
          ]}
        />
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
            },
          ]}
        >
          <View
            style={[
              styles.clawBodyInset,
              {
                left: bodyWidth * 0.1,
                right: bodyWidth * 0.1,
                top: bodyHeight * 0.18,
                height: bodyHeight * 0.48,
                borderRadius: 10 * sourceScale,
              },
            ]}
          />
          <View
            style={[
              styles.clawBodyHighlight,
              {
                left: bodyWidth * 0.16,
                top: bodyHeight * 0.14,
                width: bodyWidth * 0.28,
                height: bodyHeight * 0.18,
                borderRadius: 999,
              },
            ]}
          />
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
  carriageShell: {
    backgroundColor: '#23272D',
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'absolute',
    shadowColor: '#0F1115',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    zIndex: 12,
  },
  carriageTop: {
    backgroundColor: '#454B53',
    width: '100%',
  },
  carriageWindow: {
    backgroundColor: '#15181D',
    borderColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    position: 'absolute',
  },
  carriageHighlight: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    position: 'absolute',
  },
  carriageBolt: {
    backgroundColor: '#6B7179',
    position: 'absolute',
  },
  cable: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: '#2E3135',
    opacity: 0.75,
    zIndex: 14,
  },
  clawWrap: {
    position: 'absolute',
    zIndex: 18,
  },
  clawBody: {
    backgroundColor: '#24282E',
    borderColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'absolute',
    shadowColor: '#15181D',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 5,
    top: 0,
    zIndex: 3,
  },
  clawBodyInset: {
    backgroundColor: '#15181D',
    borderColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    position: 'absolute',
  },
  clawBodyHighlight: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    position: 'absolute',
  },
  clawNeck: {
    position: 'absolute',
    backgroundColor: '#50555C',
    borderWidth: 1,
    borderColor: 'rgba(24,25,27,0.2)',
  },
  joint: {
    position: 'absolute',
    backgroundColor: '#4A4E55',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    zIndex: 1,
  },
  centerArm: {
    position: 'absolute',
    backgroundColor: '#5C626A',
    borderWidth: 1,
    borderColor: 'rgba(24,25,27,0.24)',
    zIndex: 2,
  },
  sideArm: {
    position: 'absolute',
    backgroundColor: '#666D75',
    borderWidth: 1,
    borderColor: 'rgba(24,25,27,0.24)',
    zIndex: 2,
  },
  tip: {
    position: 'absolute',
    backgroundColor: '#3F4348',
  },
})
