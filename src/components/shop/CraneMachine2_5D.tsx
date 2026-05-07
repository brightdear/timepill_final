import React, { useMemo } from 'react'
import { LayoutChangeEvent, StyleSheet, View } from 'react-native'
import { Claw2_5D } from '@/components/shop/Claw2_5D'
import { ExitChute, PrizeOutlet } from '@/components/shop/ExitChute'
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
  holePrizeObjectId: string | null
  outletPrizeObjectId: string | null
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
  holePrizeObjectId,
  outletPrizeObjectId,
  state,
  onLayout,
}: CraneMachine2_5DProps) {
  const { attachedObject, holeObject, outletObject, floorObjects } = useMemo(() => {
    const sorted = [...prizeObjects].sort((left, right) => left.y - right.y)
    return {
      attachedObject: sorted.find(object => object.id === attachedPrizeObjectId) ?? null,
      holeObject: sorted.find(object => object.id === holePrizeObjectId) ?? null,
      outletObject: sorted.find(object => object.id === outletPrizeObjectId) ?? null,
      floorObjects: sorted.filter(object => (
        object.id !== attachedPrizeObjectId &&
        object.id !== holePrizeObjectId &&
        object.id !== outletPrizeObjectId
      )),
    }
  }, [attachedPrizeObjectId, holePrizeObjectId, outletPrizeObjectId, prizeObjects])

  const showAttachedPrize = attachedObject !== null && state !== 'droppingToExit' && state !== 'dispensing'

  return (
    <View style={[styles.machine, { height }]} onLayout={onLayout}>
      <View style={styles.backWall} />
      <View style={styles.innerWall} />
      <View style={[styles.railDeck, { top: railY - 12 }]} />
      <View style={[styles.railDeckShadow, { top: railY + 30 }]} />
      <View style={[styles.floor, { top: floorTop, bottom: 18 }]} />
      <View style={[styles.floorInnerShadow, { top: floorTop + 4 }]} />
      <View style={[styles.floorGlow, { top: floorTop + 24 }]} />
      <View style={[styles.floorSheen, { top: floorTop + 78 }]} />
      <View style={[styles.track, { top: railY }]} />
      <View style={[styles.trackInset, { top: railY + 2 }]} />
      <View style={[styles.trackCap, styles.trackCapLeft, { top: railY - 2 }]} />
      <View style={[styles.trackCap, styles.trackCapRight, { top: railY - 2 }]} />
      <View style={[styles.sideWall, styles.sideWallLeft, { top: floorTop - 6 }]} />
      <View style={[styles.sideWall, styles.sideWallRight, { top: floorTop - 6 }]} />
      <View style={styles.leftGlassEdge} />
      <View style={styles.rightGlassEdge} />
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
            zIndex={10}
          />
        )
      })}

      <ExitChute frame={goalFrame} />

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
          zIndex={32}
        />
      ) : null}

      {holeObject ? (
        <PrizeObjectView
          object={holeObject}
          x={holeObject.x}
          y={holeObject.y}
          elevated
          floorTop={floorTop}
          floorBottom={floorBottom}
          zIndex={32}
        />
      ) : null}

      <View style={styles.frontLip} />
      <View style={styles.frontLipInset} />
      <View style={styles.frontPanelDotLeft} />
      <View style={styles.frontPanelDotRight} />
      <PrizeOutlet frame={goalFrame} />
      {outletObject ? (
        <PrizeObjectView
          object={outletObject}
          x={outletObject.x}
          y={outletObject.y}
          elevated
          floorTop={floorTop}
          floorBottom={floorBottom}
          zIndex={46}
        />
      ) : null}
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
    backgroundColor: '#FFF9EF',
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
    backgroundColor: '#FFF5E6',
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
    backgroundColor: 'rgba(255,255,255,0.32)',
    borderColor: 'rgba(255,255,255,0.34)',
    borderWidth: 1,
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
  railDeckShadow: {
    position: 'absolute',
    left: 22,
    right: 22,
    height: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    backgroundColor: 'rgba(124,84,24,0.05)',
    zIndex: 4,
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
  trackCap: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#AFA595',
    zIndex: 7,
  },
  trackCapLeft: {
    left: 24,
  },
  trackCapRight: {
    right: 24,
  },
  floor: {
    position: 'absolute',
    left: 14,
    right: 14,
    borderRadius: 30,
    backgroundColor: '#F2E7D4',
  },
  floorInnerShadow: {
    position: 'absolute',
    left: 18,
    right: 18,
    height: 46,
    borderRadius: 28,
    backgroundColor: 'rgba(122,83,30,0.045)',
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
  leftGlassEdge: {
    position: 'absolute',
    bottom: 42,
    left: 16,
    top: 80,
    width: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.44)',
    zIndex: 8,
  },
  rightGlassEdge: {
    position: 'absolute',
    bottom: 42,
    right: 16,
    top: 80,
    width: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.28)',
    zIndex: 8,
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
    zIndex: 18,
  },
  frontLip: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 44,
    backgroundColor: '#EADCC3',
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
  frontPanelDotLeft: {
    position: 'absolute',
    bottom: 15,
    left: 58,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(166,111,38,0.14)',
    zIndex: 42,
  },
  frontPanelDotRight: {
    position: 'absolute',
    bottom: 15,
    right: 58,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(166,111,38,0.14)',
    zIndex: 42,
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
    zIndex: 50,
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
    zIndex: 50,
  },
})
