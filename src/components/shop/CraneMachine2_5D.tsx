import React, { useMemo } from 'react'
import { LayoutChangeEvent, StyleSheet, View } from 'react-native'
import { Claw2_5D } from '@/components/shop/Claw2_5D'
import { ExitChute } from '@/components/shop/ExitChute'
import { PrizeObjectView } from '@/components/shop/PrizeObjectView'
import type {
  CraneGameState,
  CraneGoalFrame,
  CraneShadowMetrics,
  PrizeObject,
} from '@/hooks/useCraneGameMachine'

type CraneMachine2_5DProps = {
  height: number
  floorTop: number
  floorBottom: number
  railY: number
  clawX: number
  clawY: number
  clawDepthY: number
  clawOpen: number
  clawScale: number
  clawShadow: CraneShadowMetrics
  attachedPrizeRotation: number
  attachedPrizeOffsetY: number
  goalFrame: CraneGoalFrame
  prizeObjects: PrizeObject[]
  attachedPrizeObjectId: string | null
  state: CraneGameState
  onLayout: (event: LayoutChangeEvent) => void
}

export function CraneMachine2_5D({
  height,
  floorTop,
  floorBottom,
  railY,
  clawX,
  clawY,
  clawDepthY,
  clawOpen,
  clawScale,
  clawShadow,
  attachedPrizeRotation,
  attachedPrizeOffsetY,
  goalFrame,
  prizeObjects,
  attachedPrizeObjectId,
  state,
  onLayout,
}: CraneMachine2_5DProps) {
  const { attachedObject, floorObjects } = useMemo(() => {
    const sorted = [...prizeObjects].sort((left, right) => left.y - right.y)
    return {
      attachedObject: sorted.find(object => object.id === attachedPrizeObjectId) ?? null,
      floorObjects: sorted.filter(object => object.id !== attachedPrizeObjectId),
    }
  }, [attachedPrizeObjectId, prizeObjects])

  const showAttachedPrize = attachedObject !== null || state === 'dropping'

  return (
    <View style={[styles.machine, { height }]} onLayout={onLayout}>
      <View style={styles.backWall} />
      <View style={styles.innerWall} />
      <View style={[styles.railDeck, { top: railY - 12 }]} />
      <View style={[styles.floor, { top: floorTop, bottom: 18 }]} />
      <View style={[styles.floorGlow, { top: floorTop + 24 }]} />
      <View style={[styles.floorSheen, { top: floorTop + 78 }]} />
      <View style={[styles.track, { top: railY }]} />
      <View style={[styles.trackInset, { top: railY + 2 }]} />
      <View style={[styles.sideWall, styles.sideWallLeft, { top: floorTop - 6 }]} />
      <View style={[styles.sideWall, styles.sideWallRight, { top: floorTop - 6 }]} />
      <View
        style={[
          styles.depthGuide,
          {
            left: clawX - 6,
            top: railY + 10,
            height: Math.max(18, clawDepthY - railY),
          },
        ]}
      />

      {floorObjects.map(object => {
        return (
          <PrizeObjectView
            key={object.id}
            object={object}
            x={object.x}
            y={object.y}
            floorTop={floorTop}
            floorBottom={floorBottom}
          />
        )
      })}

      <View
        style={[
          styles.clawShadow,
          {
            left: clawShadow.x - 36,
            top: clawShadow.y,
            opacity: clawShadow.opacity,
            transform: [{ scaleX: clawShadow.scale }, { scaleY: mix(0.8, 1.04, clawShadow.scale) }],
          },
        ]}
      />

      <Claw2_5D x={clawX} y={clawY} railY={railY} openRatio={clawOpen} scale={clawScale} />

      {showAttachedPrize && attachedObject ? (
        <PrizeObjectView
          object={attachedObject}
          x={clawX}
          y={clawY + attachedPrizeOffsetY}
          elevated
          floorTop={floorTop}
          floorBottom={floorBottom}
          rotation={attachedPrizeRotation}
          scale={1.02}
        />
      ) : null}

      <ExitChute frame={goalFrame} />

      <View style={styles.frontLip} />
      <View style={styles.frontLipInset} />
      <View style={styles.glassHighlight} />
      <View style={styles.glassHighlightSecondary} />
    </View>
  )
}

function mix(from: number, to: number, progress: number) {
  return from + (to - from) * progress
}

const styles = StyleSheet.create({
  machine: {
    backgroundColor: '#FAF7F0',
    borderColor: '#F1DDB8',
    borderRadius: 34,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  backWall: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 88,
    backgroundColor: '#FDF9F1',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(16,19,25,0.06)',
  },
  innerWall: {
    position: 'absolute',
    left: 18,
    right: 18,
    top: 18,
    height: 64,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.20)',
  },
  railDeck: {
    position: 'absolute',
    left: 20,
    right: 20,
    height: 48,
    borderRadius: 20,
    backgroundColor: '#F6EAD7',
    borderWidth: 1,
    borderColor: 'rgba(241,221,184,0.9)',
  },
  track: {
    position: 'absolute',
    left: 28,
    right: 28,
    height: 9,
    borderRadius: 999,
    backgroundColor: '#CFC5B5',
    zIndex: 5,
  },
  trackInset: {
    position: 'absolute',
    left: 36,
    right: 36,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.45)',
    zIndex: 6,
  },
  floor: {
    position: 'absolute',
    left: 14,
    right: 14,
    borderRadius: 30,
    backgroundColor: '#F3EAD9',
  },
  floorGlow: {
    position: 'absolute',
    left: 62,
    right: 82,
    height: 118,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  floorSheen: {
    position: 'absolute',
    left: 32,
    right: 136,
    height: 42,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    transform: [{ rotate: '-12deg' }],
  },
  sideWall: {
    position: 'absolute',
    bottom: 20,
    width: 24,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.34)',
    zIndex: 4,
  },
  sideWallLeft: {
    left: 8,
  },
  sideWallRight: {
    right: 8,
  },
  depthGuide: {
    position: 'absolute',
    width: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    zIndex: 7,
  },
  clawShadow: {
    position: 'absolute',
    width: 72,
    height: 24,
    borderRadius: 999,
    backgroundColor: '#101319',
    zIndex: 15,
  },
  frontLip: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 44,
    backgroundColor: '#EDE2CD',
    borderTopWidth: 1,
    borderTopColor: 'rgba(16,19,25,0.06)',
    zIndex: 40,
  },
  frontLipInset: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 16,
    height: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.26)',
    zIndex: 41,
  },
  glassHighlight: {
    position: 'absolute',
    top: 30,
    left: -12,
    width: 128,
    height: 272,
    borderRadius: 42,
    backgroundColor: 'rgba(255,255,255,0.08)',
    transform: [{ rotate: '16deg' }],
    zIndex: 42,
  },
  glassHighlightSecondary: {
    position: 'absolute',
    top: 110,
    right: 26,
    width: 54,
    height: 184,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.06)',
    transform: [{ rotate: '12deg' }],
    zIndex: 42,
  },
})
