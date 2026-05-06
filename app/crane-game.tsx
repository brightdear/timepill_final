import React, { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@/components/AppIcon'
import { CraneGame } from '@/components/shop/CraneGame'
import { JellyPill, ui } from '@/components/ui/ProductUI'
import {
  completeCranePlay,
  getCranePrizes,
  getWalletSummary,
  startCranePlay,
  type CranePrize,
} from '@/domain/reward/repository'
import { getSettings } from '@/domain/settings/repository'
import { designHarness } from '@/design/designHarness'

export default function CraneGameScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()
  const [walletBalance, setWalletBalance] = useState(0)
  const [prizePool, setPrizePool] = useState<CranePrize[]>([])
  const [loading, setLoading] = useState(true)
  const [devMode, setDevMode] = useState(false)

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const [walletSummary, settings, prizes] = await Promise.all([
        getWalletSummary(),
        getSettings(),
        getCranePrizes(),
      ])
      setWalletBalance(walletSummary.balance)
      setDevMode(settings.devMode === 1)
      setPrizePool(prizes)
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [])

  useFocusEffect(useCallback(() => {
    void load()
  }, [load]))

  const handleSpendJelly = useCallback(async () => {
    const play = await startCranePlay()
    setWalletBalance(play.walletBalance)
    return play
  }, [])

  const handlePrizeWon = useCallback(async ({ playId, prizeId }: { playId: string, prizeId: string }) => {
    await completeCranePlay(playId, prizeId)
    await load(false)
  }, [load])

  const openInventory = useCallback(() => {
    router.replace({ pathname: '/(tabs)/crane', params: { focus: 'inventory' } })
  }, [router])

  const machineHeight = Math.min(440, Math.max(340, height - insets.top - insets.bottom - 318))

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/(tabs)/crane')} accessibilityLabel="닫기">
          <Ionicons name="chevron-back" size={22} color={ui.color.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>크레인</Text>
        <View style={styles.headerActions}>
          {devMode ? <Text style={styles.devBadge}>개발 모드</Text> : null}
          <JellyPill balance={walletBalance} loading={loading} compact />
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={designHarness.colors.warning} />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: 18,
            paddingBottom: insets.bottom + 28,
          }}
        >
          <CraneGame
            jellyBalance={walletBalance}
            devMode={devMode}
            machineHeight={machineHeight}
            prizePool={prizePool}
            onSpendJelly={handleSpendJelly}
            onPrizeWon={handlePrizeWon}
            onViewInventory={openInventory}
          />
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#FAFAF8',
    flex: 1,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 72,
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAEE',
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  headerTitle: {
    color: '#101319',
    flex: 1,
    fontSize: 24,
    fontWeight: '800',
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  devBadge: {
    backgroundColor: '#FFF2D8',
    borderRadius: 999,
    color: '#101319',
    fontSize: 12,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  loadingWrap: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
})
