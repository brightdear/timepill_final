import React from 'react'
import { type StyleProp, type ViewStyle } from 'react-native'
import { JellyChip } from '@/components/jelly/JellyUi'

type JellyBalanceChipProps = {
  balance?: number | null
  loading?: boolean
  compact?: boolean
  style?: StyleProp<ViewStyle>
}

export function JellyBalanceChip({ balance, loading = false, compact = false, style }: JellyBalanceChipProps) {
  return <JellyChip compact={compact} loading={loading} style={style} value={balance ?? 0} />
}