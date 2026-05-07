import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { CranePrize } from '@/domain/reward/repository'
import {
  createPrizeObject,
  type PrizeObject,
} from '@/components/shop/prizeObjectModel'

type PrizeObjectViewProps = {
  object: PrizeObject
  x: number
  y: number
  elevated?: boolean
  floorTop?: number
  floorBottom?: number
  rotation?: number
  scale?: number
  opacity?: number
  zIndex?: number
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function mix(from: number, to: number, progress: number) {
  return from + (to - from) * progress
}

function PrizeLabel({ object, compact = false }: { object: PrizeObject; compact?: boolean }) {
  const text = object.icon || object.emoji || object.name.slice(0, 1)
  return (
    <Text style={[styles.emoji, compact ? styles.emojiCompact : styles.emojiRegular]}>{text}</Text>
  )
}

function PrizeShape({ object, compact = false }: { object: PrizeObject; compact?: boolean }) {
  if (object.shape === 'charm') {
    return (
      <View style={[styles.charmWrap, { width: object.width, height: object.height }]}>
        <View style={styles.charmRingOuter} />
        <View style={styles.charmRingInner} />
        <View style={styles.charmBodyBase} />
        <View style={[styles.charmBody, { backgroundColor: object.color }]}>
          <View style={styles.surfaceGloss} />
          <PrizeLabel object={object} compact={compact} />
        </View>
      </View>
    )
  }

  if (object.shape === 'keycap') {
    return (
      <View style={[styles.keycapWrap, { width: object.width, height: object.height }]}>
        <View style={styles.keycapBase} />
        <View style={[styles.keycapFace, { backgroundColor: object.color }]}>
          <View style={styles.keycapTop} />
          <PrizeLabel object={object} compact={compact} />
        </View>
      </View>
    )
  }

  if (object.shape === 'blob') {
    return (
      <View style={[styles.blobWrap, { width: object.width, height: object.height }]}>
        <View style={styles.blobBase} />
        <View style={[styles.blob, { backgroundColor: object.color }]}>
          <View style={styles.blobHighlight} />
          <View style={styles.blobGloss} />
          <PrizeLabel object={object} compact={compact} />
        </View>
      </View>
    )
  }

  if (object.shape === 'ticket') {
    return (
      <View style={[styles.ticketWrap, { width: object.width, height: object.height }]}>
        <View style={styles.ticketBase} />
        <View style={[styles.ticket, { backgroundColor: object.color }]}>
          <View style={[styles.ticketNotch, styles.ticketNotchLeft]} />
          <View style={[styles.ticketNotch, styles.ticketNotchRight]} />
          <View style={styles.ticketLine} />
          <PrizeLabel object={object} compact={compact} />
        </View>
      </View>
    )
  }

  if (object.shape === 'badge') {
    return (
      <View style={[styles.badgeWrap, { width: object.width, height: object.height }]}>
        <View style={styles.badgeBase} />
        <View style={[styles.badge, { backgroundColor: object.color }]}>
          <View style={styles.badgeInner} />
          <View style={styles.badgeHighlight} />
          <PrizeLabel object={object} compact={compact} />
        </View>
      </View>
    )
  }

  return (
    <View style={[styles.stickerWrap, { width: object.width, height: object.height }]}>
      <View style={styles.stickerBase} />
      <View style={[styles.sticker, { backgroundColor: object.color }]}>
        <View style={styles.stickerLine} />
        <View style={styles.stickerCorner} />
        <PrizeLabel object={object} compact={compact} />
      </View>
    </View>
  )
}

export function PrizeObjectView({
  object,
  x,
  y,
  elevated = false,
  floorTop,
  floorBottom,
  rotation,
  scale,
  opacity,
  zIndex,
}: PrizeObjectViewProps) {
  const depthProgress = floorTop !== undefined && floorBottom !== undefined
    ? clamp((y - floorTop) / Math.max(1, floorBottom - floorTop), 0, 1)
    : 0.5
  const depthScale = mix(0.88, 1.06, depthProgress)
  const finalScale = depthScale * (scale ?? 1) * (object.visualScale ?? 1)
  const finalOpacity = opacity ?? object.opacity ?? 1
  const shadowOpacity = elevated ? 0.1 : mix(0.08, 0.16, depthProgress)

  return (
    <View
      pointerEvents="none"
      style={[
        styles.wrap,
        {
          left: x - object.width / 2,
          top: y - object.height / 2,
          width: object.width,
          height: object.height + 10,
          opacity: finalOpacity,
          zIndex: zIndex ?? (elevated ? 32 : 10),
          transform: [{ rotate: `${rotation ?? object.rotation}deg` }, { scale: finalScale }],
        },
      ]}
    >
      <View
        style={[
          styles.shadow,
          {
            width: object.width * 0.84,
            top: object.height - 6,
            left: object.width * 0.08,
            opacity: shadowOpacity,
          },
        ]}
      />
      <PrizeShape object={object} />
    </View>
  )
}

export function PrizeObjectMini({ prize }: { prize?: CranePrize }) {
  if (!prize) return null
  const object = createPrizeObject({
    prize,
    id: `preview-${prize.id}`,
    x: 0,
    y: 0,
    rotation: 0,
    randomValue: 0.46,
  })

  return (
    <View style={styles.miniWrap}>
      <PrizeShape object={{ ...object, width: object.width * 1.18, height: object.height * 1.18 }} compact />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  shadow: {
    position: 'absolute',
    height: 10,
    borderRadius: 999,
    backgroundColor: '#101319',
  },
  emoji: {
    color: '#101319',
    fontWeight: '800',
    textAlign: 'center',
  },
  emojiRegular: {
    fontSize: 16,
    lineHeight: 20,
  },
  emojiCompact: {
    fontSize: 18,
    lineHeight: 22,
  },
  charmWrap: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  charmRingOuter: {
    width: 17,
    height: 17,
    borderRadius: 9,
    borderWidth: 3,
    borderColor: '#A7A08F',
    backgroundColor: '#FDF9F1',
    zIndex: 2,
  },
  charmRingInner: {
    position: 'absolute',
    top: 4,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#FDF9F1',
    zIndex: 3,
  },
  charmBodyBase: {
    position: 'absolute',
    top: 18,
    width: '78%',
    height: '74%',
    borderRadius: 18,
    backgroundColor: 'rgba(16,19,25,0.08)',
  },
  charmBody: {
    marginTop: -2,
    width: '84%',
    flex: 1,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(16,19,25,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  surfaceGloss: {
    position: 'absolute',
    top: 6,
    left: 8,
    right: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.48)',
  },
  keycapWrap: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  keycapBase: {
    position: 'absolute',
    top: 6,
    left: 3,
    right: 3,
    bottom: 0,
    borderRadius: 14,
    backgroundColor: 'rgba(16,19,25,0.10)',
  },
  keycapFace: {
    flex: 1,
    alignSelf: 'stretch',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(16,19,25,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keycapTop: {
    position: 'absolute',
    top: 5,
    left: 6,
    right: 6,
    bottom: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
  },
  blobWrap: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  blobBase: {
    position: 'absolute',
    top: 6,
    left: 4,
    right: 4,
    bottom: 0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 23,
    borderBottomLeftRadius: 21,
    borderBottomRightRadius: 29,
    backgroundColor: 'rgba(16,19,25,0.10)',
  },
  blob: {
    flex: 1,
    alignSelf: 'stretch',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 23,
    borderBottomLeftRadius: 21,
    borderBottomRightRadius: 29,
    borderWidth: 1,
    borderColor: 'rgba(16,19,25,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  blobHighlight: {
    position: 'absolute',
    top: 8,
    left: 11,
    width: 15,
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.56)',
  },
  blobGloss: {
    position: 'absolute',
    top: 13,
    right: 10,
    width: 12,
    height: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.38)',
  },
  badgeWrap: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  badgeBase: {
    position: 'absolute',
    top: 4,
    left: 2,
    right: 2,
    bottom: 0,
    borderRadius: 999,
    backgroundColor: 'rgba(16,19,25,0.10)',
  },
  badge: {
    flex: 1,
    alignSelf: 'stretch',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(16,19,25,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeInner: {
    position: 'absolute',
    top: 6,
    left: 6,
    right: 6,
    bottom: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.62)',
  },
  badgeHighlight: {
    position: 'absolute',
    top: 8,
    left: 9,
    width: 16,
    height: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.44)',
  },
  stickerWrap: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  stickerBase: {
    position: 'absolute',
    top: 3,
    left: 2,
    right: 2,
    bottom: 0,
    borderRadius: 10,
    backgroundColor: 'rgba(16,19,25,0.09)',
  },
  sticker: {
    flex: 1,
    alignSelf: 'stretch',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(16,19,25,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickerLine: {
    position: 'absolute',
    top: 7,
    left: 8,
    right: 8,
    height: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(16,19,25,0.08)',
  },
  stickerCorner: {
    position: 'absolute',
    top: 5,
    right: 6,
    width: 10,
    height: 10,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  ticketWrap: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  ticketBase: {
    position: 'absolute',
    top: 4,
    left: 2,
    right: 2,
    bottom: 0,
    borderRadius: 9,
    backgroundColor: 'rgba(16,19,25,0.09)',
  },
  ticket: {
    flex: 1,
    alignSelf: 'stretch',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(16,19,25,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ticketLine: {
    position: 'absolute',
    left: 9,
    right: 9,
    top: 8,
    height: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.48)',
  },
  ticketNotch: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F7F1E7',
    top: '50%',
    marginTop: -4,
  },
  ticketNotchLeft: {
    left: -4,
  },
  ticketNotchRight: {
    right: -4,
  },
  miniWrap: {
    width: 84,
    height: 78,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
