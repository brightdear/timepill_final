import React from 'react'
import {
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { DayMascotImage } from '@/components/mascot/DayMascotImage'
import {
  MASCOT_STATUS_ASSETS,
  MASCOT_STATUS_DETAILS,
  MASCOT_STATUS_IMAGE_TUNING,
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
  const tuning = MASCOT_STATUS_IMAGE_TUNING[statusKey]
  const framePadding = Math.max(6, Math.round(size * 0.1))
  const variant = framed ? 'chip' : size >= 88 ? 'modal' : size >= 56 ? 'card' : 'default'

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
      <DayMascotImage
        source={MASCOT_STATUS_ASSETS[statusKey]}
        size={size}
        variant={variant}
        imageStyle={[
          {
            transform: [
              { translateX: Math.round(size * tuning.translateX) },
              { translateY: Math.round(size * tuning.translateY) },
              { scale: tuning.scale },
            ],
          },
          imageStyle,
        ]}
      />
    </View>
  )
}
