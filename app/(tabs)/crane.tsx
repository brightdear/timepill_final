import React, { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ScreenTopBar } from '@/components/ScreenTopBar'
import { CraneGame } from '@/components/shop/CraneGame'
import { CRANE_PLAY_COST, INVENTORY_CATEGORIES, type InventoryCategory } from '@/constants/rewards'
import {
  completeCranePlay,
  getCranePrizes,
  getInventorySummary,
  getRecentRewardTransactions,
  getWalletSummary,
  startCranePlay,
  type CranePrize,
  type InventorySummaryItem,
} from '@/domain/reward/repository'
import { getSettings } from '@/domain/settings/repository'
import { designHarness } from '@/design/designHarness'

function rewardLabel(kind: string) {
  switch (kind) {
    case 'state_log':
      return '상태 기록'
    case 'on_time_bonus':
      return '정시 완료'
    case 'daily_complete':
      return '오늘 모두 완료'
    case 'streak_bonus':
      return '연속 보상'
    default:
      return '체크 완료'
  }
}

function rarityLabel(value: string) {
  if (value === 'rare') return '레어'
  if (value === 'special') return '스페셜'
  return '일반'
}

export default function ShopScreen() {
  const insets = useSafeAreaInsets()
  const [selectedCategory, setSelectedCategory] = useState<InventoryCategory>('전체')
  const [walletBalance, setWalletBalance] = useState(0)
  const [todayEarned, setTodayEarned] = useState(0)
  const [inventory, setInventory] = useState<InventorySummaryItem[]>([])
  const [recentRewards, setRecentRewards] = useState<Awaited<ReturnType<typeof getRecentRewardTransactions>>>([])
  const [prizePool, setPrizePool] = useState<CranePrize[]>([])
  const [loading, setLoading] = useState(true)
  const [devMode, setDevMode] = useState(false)

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const [walletSummary, inventorySummary, rewardSummary, settings, prizes] = await Promise.all([
        getWalletSummary(),
        getInventorySummary(selectedCategory),
        getRecentRewardTransactions(6),
        getSettings(),
        getCranePrizes(),
      ])

      setWalletBalance(walletSummary.balance)
      setTodayEarned(walletSummary.todayEarned)
      setInventory(inventorySummary)
      setRecentRewards(rewardSummary)
      setDevMode(settings.devMode === 1)
      setPrizePool(prizes)
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [selectedCategory])

  useFocusEffect(useCallback(() => {
    void load()
  }, [load]))

  const inventoryCount = useMemo(
    () => inventory.reduce((sum, item) => sum + item.count, 0),
    [inventory],
  )

  const handleSpendJelly = useCallback(async () => {
    const play = await startCranePlay()
    setWalletBalance(play.walletBalance)
    return play
  }, [])

  const handlePrizeWon = useCallback(async ({ playId, prizeId }: { playId: string, prizeId: string }) => {
    await completeCranePlay(playId, prizeId)
    await load(false)
  }, [load])

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingHorizontal: 24,
          paddingBottom: insets.bottom + 40,
        }}
      >
        <View style={styles.headerBlock}>
          <ScreenTopBar title="상점" balance={walletBalance} balanceLoading={loading} />
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={designHarness.colors.warning} />
          </View>
        ) : (
          <>
            <View style={styles.walletCard}>
              <Text style={styles.cardLabel}>젤리</Text>
              <Text style={styles.walletValue}>{walletBalance}개</Text>
              <Text style={styles.walletMeta}>오늘 +{todayEarned}</Text>
            </View>

            <View style={styles.craneCard}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>크레인</Text>
                <View style={styles.craneMetaRow}>
                  {devMode ? <Text style={styles.devBadge}>개발 모드</Text> : null}
                  <Text style={styles.sectionMeta}>{devMode ? '0젤리' : `${CRANE_PLAY_COST}젤리`}</Text>
                </View>
              </View>
              <CraneGame
                jellyBalance={walletBalance}
                devMode={devMode}
                onSpendJelly={handleSpendJelly}
                onPrizeWon={handlePrizeWon}
                prizePool={prizePool}
              />
            </View>

            <View style={styles.inventoryCard}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>보관함</Text>
                <Text style={styles.sectionMeta}>{inventoryCount}개</Text>
              </View>

              <View style={styles.categoryWrap}>
                {INVENTORY_CATEGORIES.map(category => {
                  const selected = selectedCategory === category
                  return (
                    <TouchableOpacity
                      key={category}
                      style={[styles.categoryChip, selected && styles.categoryChipSelected]}
                      onPress={() => setSelectedCategory(category)}
                    >
                      <Text style={[styles.categoryChipText, selected && styles.categoryChipTextSelected]}>{category}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>

              {inventory.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>보관 중인 아이템이 없습니다</Text>
                </View>
              ) : (
                <View style={styles.inventoryGrid}>
                  {inventory.map(item => (
                    <View key={item.id} style={styles.inventoryItem}>
                      <Text style={styles.inventoryEmoji}>{item.emoji}</Text>
                      <Text style={styles.inventoryName}>{item.name}</Text>
                      <Text style={styles.inventoryMeta}>{item.category} · {rarityLabel(item.rarity)}</Text>
                      <Text style={styles.inventoryAmount}>{item.count}개</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.historyCard}>
              <Text style={styles.sectionTitle}>최근 적립</Text>
              {recentRewards.length === 0 ? (
                <Text style={styles.emptyText}>최근 적립이 없습니다</Text>
              ) : (
                recentRewards.map(item => (
                  <View key={item.id} style={styles.historyRow}>
                    <Text style={styles.historyLabel}>{rewardLabel(item.kind)}</Text>
                    <Text style={styles.historyAmount}>+{item.amount}</Text>
                  </View>
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FAFAF8',
  },
  headerBlock: {
    marginBottom: 22,
  },
  loadingWrap: {
    minHeight: 320,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletCard: {
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EAEE',
    paddingHorizontal: 20,
    paddingVertical: 18,
    marginBottom: 16,
    gap: 4,
  },
  cardLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8A8F98',
  },
  walletValue: {
    fontSize: 32,
    lineHeight: 36,
    fontWeight: '800',
    color: '#101319',
  },
  walletMeta: {
    fontSize: 14,
    fontWeight: '700',
    color: '#B4532A',
  },
  craneCard: {
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EAEE',
    paddingHorizontal: 20,
    paddingVertical: 18,
    marginBottom: 16,
    gap: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#101319',
  },
  sectionMeta: {
    fontSize: 14,
    fontWeight: '700',
    color: '#8A8F98',
  },
  craneMetaRow: {
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
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  inventoryCard: {
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EAEE',
    paddingHorizontal: 20,
    paddingVertical: 18,
    marginBottom: 16,
    gap: 14,
  },
  categoryWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    minHeight: 36,
    borderRadius: 999,
    backgroundColor: '#F1F1F3',
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryChipSelected: {
    backgroundColor: '#FFF2D8',
    borderWidth: 1,
    borderColor: '#FF9F0A',
  },
  categoryChipText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#8A8F98',
  },
  categoryChipTextSelected: {
    color: '#101319',
  },
  emptyCard: {
    borderRadius: 22,
    backgroundColor: '#F4F1EA',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
  },
  emptyText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#8A8F98',
  },
  inventoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  inventoryItem: {
    width: '48%',
    borderRadius: 22,
    backgroundColor: '#F4F1EA',
    paddingHorizontal: 14,
    paddingVertical: 16,
    gap: 4,
  },
  inventoryEmoji: {
    fontSize: 34,
  },
  inventoryName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#101319',
  },
  inventoryMeta: {
    fontSize: 13,
    fontWeight: '500',
    color: '#8A8F98',
  },
  inventoryAmount: {
    fontSize: 14,
    fontWeight: '800',
    color: '#101319',
  },
  historyCard: {
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EAEE',
    paddingHorizontal: 20,
    paddingVertical: 18,
    gap: 10,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F1F3',
  },
  historyLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#101319',
  },
  historyAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: '#101319',
  },
})