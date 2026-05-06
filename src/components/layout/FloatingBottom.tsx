import React from 'react'
import { StyleSheet, View, type ViewProps } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export const TAB_BAR_BASE_HEIGHT = 72
export const FLOATING_GAP = 12
export const SCREEN_HORIZONTAL_PADDING = 24

type FloatingBottomProps = {
  children: React.ReactNode
  variant?: 'banner' | 'cta'
  bottomOffset?: number
  horizontalPadding?: number
  pointerEvents?: ViewProps['pointerEvents']
}

export function FloatingBottom({
  children,
  bottomOffset = 0,
  horizontalPadding = SCREEN_HORIZONTAL_PADDING,
  pointerEvents = 'box-none',
}: FloatingBottomProps) {
  const insets = useSafeAreaInsets()
  const bottom = TAB_BAR_BASE_HEIGHT + insets.bottom + FLOATING_GAP + bottomOffset

  return (
    <View
      pointerEvents={pointerEvents}
      style={[
        styles.container,
        {
          bottom,
          left: horizontalPadding,
          right: horizontalPadding,
        },
      ]}
    >
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    elevation: 12,
    position: 'absolute',
    zIndex: 100,
  },
})
