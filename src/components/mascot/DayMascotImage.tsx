import React from 'react'
import {
  Image,
  StyleSheet,
  View,
  type ImageSourcePropType,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native'

export type DayMascotImageVariant = 'default' | 'card' | 'modal' | 'chip'

type DayMascotImageProps = {
  source: ImageSourcePropType
  size?: number
  variant?: DayMascotImageVariant
  style?: StyleProp<ViewStyle>
  imageStyle?: StyleProp<ImageStyle>
}

const VARIANT_SCALE: Record<DayMascotImageVariant, number> = {
  default: 1.06,
  card: 1.1,
  modal: 1.16,
  chip: 1.08,
}

export function DayMascotImage({
  source,
  size = 64,
  variant = 'default',
  style,
  imageStyle,
}: DayMascotImageProps) {
  const wrapperSize = Math.round(size * VARIANT_SCALE[variant])
  const inset = Math.max(2, Math.round((wrapperSize - size) / 2))

  return (
    <View
      style={[
        styles.wrapper,
        {
          width: wrapperSize,
          height: wrapperSize,
          padding: inset,
        },
        style,
      ]}
    >
      <Image
        source={source}
        resizeMode="contain"
        style={[styles.image, { width: size, height: size }, imageStyle]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  image: {
    overflow: 'visible',
  },
})
