import React from 'react'
import {
  Image,
  StyleSheet,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import {
  MASCOT_STATUS_ASSETS,
  MASCOT_STATUS_DETAILS,
  type MascotStatusKey,
} from '@/constants/mascotStatus'

type StatusMascotProps = {
  statusKey: MascotStatusKey
  size?: number
  framed?: boolean
  style?: StyleProp<ViewStyle>
  imageStyle?: StyleProp<ImageStyle>
}

export function StatusMascot({
  statusKey,
  size = 64,
  framed = false,
  style,
  imageStyle,
}: StatusMascotProps) {
  const details = MASCOT_STATUS_DETAILS[statusKey]
  const framePadding = Math.max(6, Math.round(size * 0.1))

  return (
    <View
      style={[
        framed && {
          backgroundColor: details.surface,
          borderColor: details.border,
          borderRadius: size / 2 + framePadding + 8,
          borderWidth: 1,
          padding: framePadding,
        },
        style,
      ]}
    >
      <Image
        source={MASCOT_STATUS_ASSETS[statusKey]}
        resizeMode="contain"
        style={[styles.image, { width: size, height: size }, imageStyle]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  image: {
    overflow: 'visible',
  },
})