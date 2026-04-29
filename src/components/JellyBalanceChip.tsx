import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { designHarness } from '@/design/designHarness'

type JellyBalanceChipProps = {
  balance?: number | null
  loading?: boolean
}

export function JellyBalanceChip({ balance, loading = false }: JellyBalanceChipProps) {
  return (
    <View style={styles.chip}>
      <Text style={styles.emoji}>🍬</Text>
      <Text style={styles.value}>{loading ? '...' : String(balance ?? 0)}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 38,
    borderRadius: 999,
    paddingHorizontal: 14,
    backgroundColor: '#FFF0D8',
    borderWidth: 1,
    borderColor: '#F7C77A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  emoji: {
    fontSize: 15,
  },
  value: {
    fontSize: 14,
    fontWeight: '800',
    color: designHarness.colors.textStrong,
  },
})