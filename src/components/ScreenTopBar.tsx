import React, { type ReactNode } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { JellyBalanceChip } from '@/components/JellyBalanceChip'
import { designHarness } from '@/design/designHarness'

type ScreenTopBarProps = {
  title: string
  subtitle?: string
  balance?: number | null
  balanceLoading?: boolean
  actions?: ReactNode
  showBalance?: boolean
  onBalancePress?: () => void
}

export function ScreenTopBar({
  title,
  subtitle,
  balance,
  balanceLoading = false,
  actions,
  showBalance = true,
  onBalancePress,
}: ScreenTopBarProps) {
  const balanceChip = <JellyBalanceChip balance={balance} loading={balanceLoading} />

  return (
    <View style={styles.row}>
      <View style={styles.copyBlock}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <View style={styles.actions}>
        {actions}
        {showBalance ? (
          onBalancePress ? (
            <TouchableOpacity activeOpacity={0.84} onPress={onBalancePress}>
              {balanceChip}
            </TouchableOpacity>
          ) : balanceChip
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  copyBlock: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 30,
    lineHeight: designHarness.lineHeight.screenTitle,
    fontWeight: '800',
    color: designHarness.colors.textStrong,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: designHarness.lineHeight.caption,
    color: designHarness.colors.textMuted,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
})