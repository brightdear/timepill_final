import React, { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
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
  getCraneMachineSession,
  getWalletSummary,
  rerollCranePrizePool,
  startCranePlay,
  type CranePrize,
} from '@/domain/reward/repository'
import { getSettings } from '@/domain/settings/repository'
import { designHarness } from '@/design/designHarness'
import { useI18n } from '@/hooks/useI18n'

const CRANE_SCREEN_COPY = {
  ko: {
    title: '크레인',
    close: '닫기',
    devMode: '개발 모드',
  },
  en: {
    title: 'Crane',
    close: 'Close',
    devMode: 'Dev mode',
  },
  ja: {
    title: 'クレーン',
    close: '閉じる',
    devMode: '開発モード',
  },
} as const

export default function CraneGameScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { lang } = useI18n()
  const copy = CRANE_SCREEN_COPY[lang]
  const [walletBalance, setWalletBalance] = useState(0)
  const [prizePool, setPrizePool] = useState<CranePrize[]>([])
  const [poolSeed, setPoolSeed] = useState('')
  const [loading, setLoading] = useState(true)
  const [devMode, setDevMode] = useState(false)

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const [walletSummary, settings, machineSession] = await Promise.all([
        getWalletSummary(),
        getSettings(),
        getCraneMachineSession(),
      ])
      setWalletBalance(walletSummary.balance)
      setDevMode(settings.devMode === 1)
      setPrizePool(machineSession.visiblePrizes)
      setPoolSeed(machineSession.poolSeed)
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

  const handleReroll = useCallback(async () => {
    const result = await rerollCranePrizePool()
    setWalletBalance(result.walletBalance)
    setPrizePool(result.visiblePrizes)
    setPoolSeed(result.poolSeed)
    return result
  }, [])

  const openInventory = useCallback(() => {
    router.replace({ pathname: '/(tabs)/shop', params: { focus: 'inventory' } })
  }, [router])

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} accessibilityLabel={copy.close}>
          <Ionicons name="chevron-back" size={22} color={ui.color.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{copy.title}</Text>
        <View style={styles.headerActions}>
          {devMode ? <Text style={styles.devBadge}>{copy.devMode}</Text> : null}
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
            paddingHorizontal: 8,
            paddingTop: 12,
            paddingBottom: insets.bottom + 28,
          }}
        >
          <CraneGame
            jellyBalance={walletBalance}
            devMode={devMode}
            poolSeed={poolSeed}
            prizePool={prizePool}
            onSpendJelly={handleSpendJelly}
            onPrizeWon={handlePrizeWon}
            onReroll={handleReroll}
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
    minHeight: 66,
    paddingHorizontal: 18,
    paddingBottom: 8,
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
    fontWeight: '700',
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
    fontWeight: '700',
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
