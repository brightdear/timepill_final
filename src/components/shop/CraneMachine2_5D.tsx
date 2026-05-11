import React, { useEffect, useMemo, useRef } from 'react'
import { Image, LayoutChangeEvent, StyleSheet, View } from 'react-native'
import {
  CRANE_DEBUG_LAYOUT,
  getContainedImageRect,
  MACHINE_REGIONS,
  toScreenSize,
  toScreenX,
  toScreenY,
} from '@/components/shop/craneSceneLayout'
import { CRANE_MACHINE_ASSETS } from '@/components/shop/craneAssetManifest.generated'
import { CraneClawSprite } from '@/components/shop/CraneClawSprite'
import { RewardSpriteView } from '@/components/shop/RewardSpriteView'
import type {
  CraneGameState,
  CraneGoalFrame,
  CraneShadowMetrics,
  PrizeObject,
} from '@/hooks/useCraneGameMachine'

type CraneMachine2_5DProps = {
  machineWidth?: number
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
  attachedPrizeOffsetX: number
  goalFrame: CraneGoalFrame
  prizeObjects: PrizeObject[]
  attachedPrizeObjectId: string | null
  holePrizeObjectId: string | null
  outletPrizeObjectId: string | null
  state: CraneGameState
  onLayout: (event: LayoutChangeEvent) => void
}

function mix(from: number, to: number, progress: number) {
  return from + (to - from) * progress
}

function toScreenObject(object: PrizeObject, imageRect: ReturnType<typeof getContainedImageRect>): PrizeObject {
  return {
    ...object,
    x: toScreenX(object.x, imageRect),
    y: toScreenY(object.y, imageRect),
    width: toScreenSize(object.width, imageRect),
    height: toScreenSize(object.height, imageRect),
    hitboxWidth: toScreenSize(object.hitboxWidth, imageRect),
    hitboxHeight: toScreenSize(object.hitboxHeight, imageRect),
  }
}

export function CraneMachine2_5D({
  machineWidth = 0,
  height,
  floorTop,
  floorBottom,
  railY,
  clawX,
  clawY,
  clawOpen,
  clawScale,
  clawShadow,
  attachedPrizeRotation,
  attachedPrizeOffsetY,
  attachedPrizeOffsetX,
  prizeObjects,
  attachedPrizeObjectId,
  holePrizeObjectId,
  outletPrizeObjectId,
  state,
  onLayout,
}: CraneMachine2_5DProps) {
  const debugKeyRef = useRef('')
  const imageRect = useMemo(() => (
    getContainedImageRect(machineWidth, height)
  ), [height, machineWidth])
  const screenRailY = toScreenY(railY, imageRect)
  const screenClawX = toScreenX(clawX, imageRect)
  const screenClawY = toScreenY(clawY, imageRect)
  const screenFloorTop = toScreenY(floorTop, imageRect)
  const screenFloorBottom = toScreenY(floorBottom, imageRect)
  const screenAttachedPrizeOffsetY = toScreenSize(attachedPrizeOffsetY, imageRect)
  const screenAttachedPrizeOffsetX = toScreenSize(attachedPrizeOffsetX, imageRect)
  const screenShadowWidth = toScreenSize(130, imageRect)
  const screenShadowHeight = toScreenSize(38, imageRect)
  const screenClawShadow = {
    ...clawShadow,
    x: toScreenX(clawShadow.x, imageRect),
    y: toScreenY(clawShadow.y, imageRect),
  }
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
  const showDebugLayout = __DEV__ && CRANE_DEBUG_LAYOUT

  useEffect(() => {
    if (!__DEV__ || !CRANE_DEBUG_LAYOUT) return
    const debugKey = [machineWidth, height, imageRect.scale, prizeObjects.length].join(':')
    if (debugKeyRef.current === debugKey) return
    debugKeyRef.current = debugKey
    console.log('[Crane] container', machineWidth, height)
    console.log('[Crane] imageRect', imageRect)
    console.log(
      '[Crane] rail screen',
      toScreenX(MACHINE_REGIONS.rail.xMin, imageRect),
      toScreenX(MACHINE_REGIONS.rail.xMax, imageRect),
      toScreenY(MACHINE_REGIONS.rail.y, imageRect),
    )
    if (machineWidth <= 0 || height <= 0 || imageRect.scale <= 0) {
      console.warn('[crane] machine layout is not ready', { machineWidth, height, imageRect })
    }
    if (prizeObjects.length === 0) {
      console.warn('[crane] no prize objects to render')
    }
    for (const object of prizeObjects) {
      if (!object.assetKey) console.warn('[crane] prize object missing assetKey', object.id)
      if (object.width <= 0 || object.height <= 0) console.warn('[crane] prize object has invalid size', object.id)
      if (object.x < MACHINE_REGIONS.playfield.left || object.x > MACHINE_REGIONS.playfield.right || object.y < MACHINE_REGIONS.playfield.top || object.y > MACHINE_REGIONS.playfield.bottom) {
        console.warn('[crane] prize object outside machine bounds', object.id, object.x, object.y)
      }
      const screenX = toScreenX(object.x, imageRect)
      const screenY = toScreenY(object.y, imageRect)
      const screenWidth = toScreenSize(object.width, imageRect)
      const screenHeight = toScreenSize(object.height, imageRect)
      console.log('[Crane] item', object.assetKey, screenX, screenY, screenWidth, screenHeight)
      if (screenWidth > imageRect.width * 0.35 || screenHeight > imageRect.height * 0.35) {
        console.warn('[crane] prize sprite is too large', object.id, object.assetKey, screenWidth, screenHeight)
      }
    }
    if (clawX < MACHINE_REGIONS.rail.xMin || clawX > MACHINE_REGIONS.rail.xMax) {
      console.warn('[crane] claw outside rail bounds', clawX)
    }
  }, [clawX, height, imageRect, machineWidth, prizeObjects])

  return (
    <View
      style={[
        styles.machine,
        {
          width: machineWidth,
          height,
        },
        showDebugLayout && styles.debugStage,
      ]}
      onLayout={onLayout}
    >
      <Image
        source={CRANE_MACHINE_ASSETS.base}
        fadeDuration={0}
        resizeMode="contain"
        style={[
          styles.machineImage,
          {
            left: imageRect.offsetX,
            top: imageRect.offsetY,
            width: imageRect.renderedWidth,
            height: imageRect.renderedHeight,
          },
        ]}
      />

      <View
        pointerEvents="none"
        style={[
          styles.staticClawMask,
          {
            left: toScreenX(190, imageRect),
            top: toScreenY(236, imageRect),
            width: toScreenSize(146, imageRect),
            height: toScreenSize(112, imageRect),
            borderRadius: toScreenSize(18, imageRect),
          },
        ]}
      />

      <View
        pointerEvents="none"
        style={[
          styles.glassPaneFill,
          {
            left: toScreenX(208, imageRect),
            top: toScreenY(300, imageRect),
            width: toScreenSize(668, imageRect),
            height: toScreenSize(690, imageRect),
          },
        ]}
      />

      <View
        pointerEvents="none"
        style={[
          styles.railBayFill,
          {
            left: toScreenX(196, imageRect),
            top: toScreenY(246, imageRect),
            width: toScreenSize(680, imageRect),
            height: toScreenSize(80, imageRect),
            borderRadius: toScreenSize(10, imageRect),
          },
        ]}
      />

      <View
        pointerEvents="none"
        style={[
          styles.railMain,
          {
            left: toScreenX(222, imageRect),
            top: toScreenY(MACHINE_REGIONS.rail.y, imageRect),
            width: toScreenSize(636, imageRect),
            height: Math.max(2, toScreenSize(5, imageRect)),
            borderRadius: toScreenSize(4, imageRect),
          },
        ]}
      />

      <View
        pointerEvents="none"
        style={[
          styles.railHighlight,
          {
            left: toScreenX(224, imageRect),
            top: toScreenY(MACHINE_REGIONS.rail.y - 5, imageRect),
            width: toScreenSize(632, imageRect),
            height: Math.max(1, toScreenSize(3, imageRect)),
            borderRadius: toScreenSize(2, imageRect),
          },
        ]}
      />

      <View
        pointerEvents="none"
        style={[
          styles.railGlow,
          {
            left: toScreenX(222, imageRect),
            top: toScreenY(MACHINE_REGIONS.rail.y + 14, imageRect),
            width: toScreenSize(636, imageRect),
            height: Math.max(1, toScreenSize(3, imageRect)),
            borderRadius: toScreenSize(2, imageRect),
          },
        ]}
      />

      {showDebugLayout ? (
        <>
          <View
            pointerEvents="none"
            style={[
              styles.debugImageRect,
              {
                left: imageRect.offsetX,
                top: imageRect.offsetY,
                width: imageRect.renderedWidth,
                height: imageRect.renderedHeight,
              },
            ]}
          />
          <View
            pointerEvents="none"
            style={[
              styles.debugPlayfield,
              {
                left: toScreenX(MACHINE_REGIONS.playfield.left, imageRect),
                top: toScreenY(MACHINE_REGIONS.playfield.top, imageRect),
                width: toScreenSize(MACHINE_REGIONS.playfield.right - MACHINE_REGIONS.playfield.left, imageRect),
                height: toScreenSize(MACHINE_REGIONS.playfield.bottom - MACHINE_REGIONS.playfield.top, imageRect),
              },
            ]}
          />
          <View
            pointerEvents="none"
            style={[
              styles.debugRail,
              {
                left: toScreenX(MACHINE_REGIONS.rail.xMin, imageRect),
                top: screenRailY,
                width: toScreenSize(MACHINE_REGIONS.rail.xMax - MACHINE_REGIONS.rail.xMin, imageRect),
              },
            ]}
          />
        </>
      ) : null}

      {floorObjects.map(object => (
        <RewardSpriteView
          key={object.id}
          object={toScreenObject(object, imageRect)}
          x={toScreenX(object.x, imageRect)}
          y={toScreenY(object.y, imageRect)}
          floorTop={screenFloorTop}
          floorBottom={screenFloorBottom}
          zIndex={10}
        />
      ))}

      <View
        style={[
          styles.clawShadow,
          {
            left: screenClawShadow.x - screenShadowWidth / 2,
            top: screenClawShadow.y,
            width: screenShadowWidth,
            height: screenShadowHeight,
            opacity: clawShadow.opacity * 0.42,
            transform: [{ scaleX: clawShadow.scale }, { scaleY: mix(0.8, 1.04, clawShadow.scale) }],
          },
        ]}
      />

      <CraneClawSprite
        x={screenClawX}
        y={screenClawY}
        railY={screenRailY}
        openRatio={clawOpen}
        scale={clawScale}
        sourceScale={imageRect.scale}
        sway={attachedPrizeOffsetX}
      />

      {showAttachedPrize && attachedObject ? (
        <RewardSpriteView
          object={toScreenObject(attachedObject, imageRect)}
          x={screenClawX + screenAttachedPrizeOffsetX}
          y={screenClawY + screenAttachedPrizeOffsetY}
          elevated
          floorTop={screenFloorTop}
          floorBottom={screenFloorBottom}
          rotation={attachedPrizeRotation}
          scale={1.02}
          zIndex={32}
        />
      ) : null}

      {holeObject ? (
        <RewardSpriteView
          object={toScreenObject(holeObject, imageRect)}
          x={toScreenX(holeObject.x, imageRect)}
          y={toScreenY(holeObject.y, imageRect)}
          elevated
          floorTop={screenFloorTop}
          floorBottom={screenFloorBottom}
          zIndex={28}
        />
      ) : null}

      {outletObject ? (
        <RewardSpriteView
          object={toScreenObject(outletObject, imageRect)}
          x={toScreenX(outletObject.x, imageRect)}
          y={toScreenY(outletObject.y, imageRect)}
          elevated
          floorTop={screenFloorTop}
          floorBottom={screenFloorBottom}
          zIndex={46}
        />
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  machine: {
    alignSelf: 'center',
    backgroundColor: '#FCF7EC',
    borderRadius: 32,
    overflow: 'hidden',
  },
  machineImage: {
    position: 'absolute',
  },
  staticClawMask: {
    backgroundColor: '#FFF8EA',
    position: 'absolute',
    zIndex: 3,
  },
  glassPaneFill: {
    backgroundColor: '#FFF9EF',
    position: 'absolute',
    zIndex: 1,
  },
  railBayFill: {
    backgroundColor: '#FFF8EA',
    position: 'absolute',
    zIndex: 2,
  },
  railMain: {
    backgroundColor: '#746B5A',
    borderColor: 'rgba(255,255,255,0.36)',
    borderWidth: 1,
    opacity: 0.88,
    position: 'absolute',
    zIndex: 4,
  },
  railHighlight: {
    backgroundColor: 'rgba(255,255,255,0.54)',
    position: 'absolute',
    zIndex: 5,
  },
  railGlow: {
    backgroundColor: 'rgba(255, 197, 68, 0.38)',
    position: 'absolute',
    zIndex: 5,
  },
  clawShadow: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: '#2C3138',
    zIndex: 18,
  },
  debugStage: {
    borderColor: 'rgba(255,0,0,0.85)',
    borderWidth: 1,
  },
  debugImageRect: {
    position: 'absolute',
    borderColor: 'rgba(0,102,255,0.85)',
    borderWidth: 1,
    zIndex: 80,
  },
  debugPlayfield: {
    position: 'absolute',
    borderColor: 'rgba(0,180,80,0.9)',
    borderWidth: 1,
    zIndex: 81,
  },
  debugRail: {
    position: 'absolute',
    height: 2,
    backgroundColor: 'rgba(255,210,0,0.95)',
    zIndex: 82,
  },
})
