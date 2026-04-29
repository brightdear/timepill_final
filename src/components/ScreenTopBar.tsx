import React, { type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { JellyBalanceChip } from '@/components/JellyBalanceChip'
import { designHarness } from '@/design/designHarness'

type ScreenTopBarProps = {
  title: string
  subtitle?: string
  balance?: number | null
  balanceLoading?: boolean
  actions?: ReactNode
  showBalance?: boolean
}

export function ScreenTopBar({
  title,
  subtitle,
  balance,
  balanceLoading = false,
  actions,
  showBalance = true,
}: ScreenTopBarProps) {
  return (
    <View style={styles.row}>
      <View style={styles.copyBlock}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <View style={styles.actions}>
        {actions}
        {showBalance ? <JellyBalanceChip balance={balance} loading={balanceLoading} /> : null}
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
    lineHeight: 34,
    fontWeight: '800',
    color: designHarness.colors.textStrong,
  },
  subtitle: {
    fontSize: 13,
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