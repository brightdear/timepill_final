import React, { useMemo } from 'react'
import { Image, StyleProp, StyleSheet, View, ViewStyle } from 'react-native'
import type { CranePrize } from '@/domain/reward/repository'
import { CRANE_REWARD_ASSETS, type CraneRewardAsset } from '@/components/shop/craneAssetManifest.generated'
import { CRANE_DEBUG_LAYOUT } from '@/components/shop/craneSceneLayout'
import { createPrizeObject, type PrizeObject } from '@/components/shop/prizeObjectModel'

type RewardSpriteViewProps = {
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

function resolveRewardAsset(object: PrizeObject): CraneRewardAsset | null {
  const asset = CRANE_REWARD_ASSETS[object.assetKey]

  if (!asset && __DEV__ && CRANE_DEBUG_LAYOUT) {
    console.warn('[crane] reward asset lookup failed', object.id, object.assetKey)
  }

  return asset ?? null
}

function fitContain(asset: CraneRewardAsset, maxWidth: number, maxHeight: number) {
  if (maxWidth <= 0 || maxHeight <= 0 || asset.width <= 0 || asset.height <= 0) {
    if (__DEV__ && CRANE_DEBUG_LAYOUT) {
      console.warn('[crane] invalid reward display size', { asset, maxWidth, maxHeight })
    }
    return { width: 1, height: 1 }
  }

  const trimWidth = asset.trimWidth || asset.width
  const trimHeight = asset.trimHeight || asset.height
  const scale = Math.min(maxWidth / trimWidth, maxHeight / trimHeight)

  return {
    width: trimWidth * scale,
    height: trimHeight * scale,
  }
}

function spriteDimensions(object: PrizeObject, asset: CraneRewardAsset, compact = false) {
  const widthBox = object.width * (compact ? 1.18 : 1)
  const heightBox = object.height * (compact ? 1.18 : 1)

  return fitContain(asset, widthBox, heightBox)
}

function spriteAnchor(object: PrizeObject, asset: CraneRewardAsset) {
  const aspect = (asset.trimHeight || asset.height) / Math.max(1, asset.trimWidth || asset.width)

  if (aspect >= 1.3) return 0.76
  if (object.category === 'keycap') return 0.68
  if (object.category === 'sticker' || object.category === 'theme') return 0.7
  return 0.72
}

function RewardSprite({ object, compact = false }: { object: PrizeObject; compact?: boolean }) {
  const asset = resolveRewardAsset(object)
  const dimensions = useMemo(() => (
    asset ? spriteDimensions(object, asset, compact) : { width: object.width, height: object.height }
  ), [asset, compact, object])

  if (!asset) {
    return <View style={[styles.missingSprite, { width: dimensions.width, height: dimensions.height }]} />
  }

  return (
    <View style={[styles.spriteStage, { width: dimensions.width, height: dimensions.height }]}>
      <Image
        source={asset.source}
        style={{ width: dimensions.width, height: dimensions.height }}
        resizeMode="contain"
        fadeDuration={0}
      />
    </View>
  )
}

export function RewardSpriteView({
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
}: RewardSpriteViewProps) {
  const asset = resolveRewardAsset(object)
  const dimensions = asset ? spriteDimensions(object, asset) : { width: object.width, height: object.height }
  const depthProgress = floorTop !== undefined && floorBottom !== undefined
    ? clamp((y - floorTop) / Math.max(1, floorBottom - floorTop), 0, 1)
    : 0.5
  const depthScale = mix(0.88, 1.04, depthProgress)
  const finalScale = depthScale * (scale ?? 1) * (object.visualScale ?? 1)
  const finalOpacity = opacity ?? object.opacity ?? 1
  const shadowOpacity = elevated ? 0.06 : mix(0.12, 0.2, depthProgress)
  const anchorY = asset ? spriteAnchor(object, asset) : 0.72
  const shadowWidth = dimensions.width * mix(0.48, 0.68, depthProgress) * (elevated ? 0.52 : 1)
  const shadowHeight = mix(5, 9, depthProgress) * (elevated ? 0.64 : 1)
  const shadowTop = y + dimensions.height * mix(0.12, 0.2, depthProgress) + (elevated ? dimensions.height * 0.18 : 0)
  const spriteZIndex = zIndex ?? (elevated ? 32 : 10)

  if (__DEV__ && CRANE_DEBUG_LAYOUT) {
    if (!object.assetKey) console.warn('[crane] prize object missing assetKey', object.id)
    if (dimensions.width <= 1 || dimensions.height <= 1) console.warn('[crane] reward sprite collapsed', object.id, object.assetKey)
  }

  return (
    <>
      <View
        style={[
          styles.floorShadow,
          {
            left: x - shadowWidth / 2,
            top: shadowTop,
            width: shadowWidth,
            height: shadowHeight,
            opacity: shadowOpacity * finalOpacity,
            zIndex: Math.max(1, spriteZIndex - 1),
            transform: [{ scaleX: elevated ? 0.82 : mix(0.92, 1.08, depthProgress) }],
          },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.wrap,
          {
            left: x - dimensions.width / 2,
            top: y - dimensions.height * anchorY,
            width: dimensions.width,
            height: dimensions.height + 14,
            opacity: finalOpacity,
            zIndex: spriteZIndex,
            transform: [{ rotate: `${rotation ?? object.rotation}deg` }, { scale: finalScale }],
          },
        ]}
      >
        <RewardSprite object={object} />
      </View>
    </>
  )
}

export function RewardSpriteMini({ prize }: { prize?: CranePrize }) {
  if (!prize) return null
  return <RewardSpriteThumb prize={prize} width={84} height={78} scale={0.58} compact />
}

export function RewardSpriteThumb({
  prize,
  width = 70,
  height = 68,
  scale = 0.72,
  compact = false,
  style,
}: {
  prize?: CranePrize
  width?: number
  height?: number
  scale?: number
  compact?: boolean
  style?: StyleProp<ViewStyle>
}) {
  if (!prize) return null

  const object = createPrizeObject({
    prize,
    id: `preview-${prize.id}`,
    x: 0,
    y: 0,
    rotation: 0,
    randomValue: 0.46,
  })
  const maxWidth = width * 0.92
  const maxHeight = height * 0.92

  return (
    <View style={[styles.thumbWrap, { width, height }, style]}>
      <RewardSprite
        object={{
          ...object,
          width: Math.min(maxWidth, object.width * scale),
          height: Math.min(maxHeight, object.height * scale),
        }}
        compact={compact}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  floorShadow: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(74,52,24,0.5)',
  },
  spriteStage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  missingSprite: {
    borderRadius: 999,
    backgroundColor: '#FFF2D8',
    borderWidth: 1,
    borderColor: '#F1DDB8',
  },
  thumbWrap: {
    width: 84,
    height: 78,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
