import React from 'react'
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native'
import Svg, { Defs, Ellipse, LinearGradient, Path, Stop } from 'react-native-svg'

type JellyIconProps = {
  size?: number
}

type JellyChipProps = {
  value: number | string
  loading?: boolean
  compact?: boolean
  style?: StyleProp<ViewStyle>
  textStyle?: StyleProp<TextStyle>
}

type JellyDeltaBadgeProps = {
  amount: number
  compact?: boolean
  style?: StyleProp<ViewStyle>
}

export function JellyIcon({ size = 18 }: JellyIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <Defs>
        <LinearGradient id="jellyShell" x1="5" y1="6" x2="26" y2="27" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#FFECC0" />
          <Stop offset="1" stopColor="#F4B55B" />
        </LinearGradient>
        <LinearGradient id="jellyCore" x1="10" y1="10" x2="22" y2="24" gradientUnits="userSpaceOnUse">
          <Stop offset="0" stopColor="#FFF7E1" />
          <Stop offset="1" stopColor="#F3C77D" />
        </LinearGradient>
      </Defs>
      <Path
        d="M15.7 3.8c-5.8 0-9.8 4.4-9.8 10.4 0 7 4.6 11.9 10.1 11.9 5.8 0 10-4.7 10-11.6 0-6.2-4-10.7-10.3-10.7Z"
        fill="url(#jellyShell)"
        stroke="#D79035"
        strokeWidth="1.6"
      />
      <Path
        d="M11 9.7c-2 1.6-3 4.1-3 6.4 0 4.1 2.9 7.1 6.9 7.1 4.7 0 7.8-4 7.8-8.2 0-4.1-2.5-7.2-6.9-7.2-1.9 0-3.5.6-4.8 1.9Z"
        fill="url(#jellyCore)"
        opacity="0.78"
      />
      <Ellipse cx="12.1" cy="10.6" rx="3.6" ry="2.2" fill="#FFFFFF" opacity="0.7" transform="rotate(-24 12.1 10.6)" />
      <Path
        d="M20.4 23.2c-1.2.8-2.7 1.3-4.5 1.3-3.1 0-5.5-1.4-7-3.9"
        stroke="#FFFFFF"
        strokeLinecap="round"
        strokeWidth="1.4"
        opacity="0.5"
      />
    </Svg>
  )
}

export function JellyChip({
  value,
  loading = false,
  compact = false,
  style,
  textStyle,
}: JellyChipProps) {
  const iconSize = compact ? 16 : 18

  return (
    <View style={[styles.chip, compact && styles.chipCompact, style]}>
      <JellyIcon size={iconSize} />
      {loading ? (
        <ActivityIndicator size="small" color="#C98B2D" />
      ) : (
        <Text style={[styles.value, compact && styles.valueCompact, textStyle]} numberOfLines={1}>
          {value}
        </Text>
      )}
    </View>
  )
}

export function JellyDeltaBadge({ amount, compact = false, style }: JellyDeltaBadgeProps) {
  return (
    <View style={[styles.deltaBadge, compact && styles.deltaBadgeCompact, style]}>
      <JellyIcon size={compact ? 14 : 16} />
      <Text style={[styles.deltaText, compact && styles.deltaTextCompact]} numberOfLines={1}>+{amount}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FFF5E2',
    borderColor: '#EEDCBD',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 40,
    minWidth: 70,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipCompact: {
    minHeight: 38,
    minWidth: 66,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  value: {
    color: '#101319',
    fontSize: 15,
    fontWeight: '700',
  },
  valueCompact: {
    fontSize: 14,
  },
  deltaBadge: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#FFF8EB',
    borderColor: '#F0DFC3',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    minHeight: 32,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  deltaBadgeCompact: {
    minHeight: 28,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  deltaText: {
    color: '#B16F16',
    fontSize: 13,
    fontWeight: '700',
  },
  deltaTextCompact: {
    fontSize: 12,
  },
})