import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { TAB_BAR_BASE_HEIGHT } from '@/components/layout/FloatingBottom'
import { JellyPill } from '@/components/ui/ProductUI'
import { CRANE_PLAY_COST, INVENTORY_CATEGORIES, type InventoryCategory } from '@/constants/rewards'
import {
  getCranePrizes,
  getInventorySummary,
  getRecentCranePlays,
  getRecentRewardTransactions,
  getWalletSummary,
  type CranePrize,
  type InventorySummaryItem,
} from '@/domain/reward/repository'
import { getSettings } from '@/domain/settings/repository'
import { designHarness } from '@/design/designHarness'

type RecentItem = {
  id: string
  createdAt: string
  label: string
  meta: string
}

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
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const params = useLocalSearchParams<{ focus?: string }>()
  const scrollRef = useRef<ScrollView>(null)
  const [inventoryY, setInventoryY] = useState(0)
  const [selectedCategory, setSelectedCategory] = useState<InventoryCategory>('전체')
  const [walletBalance, setWalletBalance] = useState(0)
  const [todayEarned, setTodayEarned] = useState(0)
  const [inventory, setInventory] = useState<InventorySummaryItem[]>([])
  const [recentRewards, setRecentRewards] = useState<Awaited<ReturnType<typeof getRecentRewardTransactions>>>([])
  const [recentCranePlays, setRecentCranePlays] = useState<Awaited<ReturnType<typeof getRecentCranePlays>>>([])
  const [prizePool, setPrizePool] = useState<CranePrize[]>([])
  const [loading, setLoading] = useState(true)
  const [devMode, setDevMode] = useState(false)

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true)
    try {
      const [walletSummary, inventorySummary, rewardSummary, cranePlaySummary, settings, prizes] = await Promise.all([
        getWalletSummary(),
        getInventorySummary(selectedCategory),
        getRecentRewardTransactions(5),
        getRecentCranePlays(5),
        getSettings(),
        getCranePrizes(),
      ])

      setWalletBalance(walletSummary.balance)
      setTodayEarned(walletSummary.todayEarned)
      setInventory(inventorySummary)
      setRecentRewards(rewardSummary)
      setRecentCranePlays(cranePlaySummary)
      setDevMode(settings.devMode === 1)
      setPrizePool(prizes)
    } finally {
      if (showLoading) setLoading(false)
    }
  }, [selectedCategory])

  useFocusEffect(useCallback(() => {
    void load()
  }, [load]))

  useEffect(() => {
    if (params.focus !== 'inventory' || loading || inventoryY <= 0) return undefined
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, inventoryY - 16), animated: true })
    }, 120)
    return () => clearTimeout(timer)
  }, [inventoryY, loading, params.focus])

  const inventoryCount = useMemo(
    () => inventory.reduce((sum, item) => sum + item.count, 0),
    [inventory],
  )

  const canPlayCrane = devMode || walletBalance >= CRANE_PLAY_COST
  const previewPrizes = prizePool.filter(prize => prize.weight > 0).slice(0, 5)

  const recentItems = useMemo<RecentItem[]>(() => {
    const rewardItems = recentRewards.map(item => ({
      id: `reward-${item.id}`,
      createdAt: item.createdAt,
      label: rewardLabel(item.kind),
      meta: `🍬 +${item.amount}`,
    }))
    const craneItems = recentCranePlays
      .filter(item => item.prize)
      .map(item => ({
        id: `crane-${item.id}`,
        createdAt: item.createdAt,
        label: '크레인',
        meta: `${item.prize?.name ?? '보상'} 획득`,
      }))

    return [...rewardItems, ...craneItems]
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, 6)
  }, [recentCranePlays, recentRewards])

  return (
    <View style={styles.root}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 24,
          paddingHorizontal: 24,
          paddingBottom: TAB_BAR_BASE_HEIGHT + insets.bottom + 24,
        }}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>상점</Text>
          <JellyPill balance={walletBalance} loading={loading} compact />
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={designHarness.colors.warning} />
          </View>
        ) : (
          <>
            <View style={styles.walletCard}>
              <View>
                <Text style={styles.cardLabel}>젤리</Text>
                <Text style={styles.walletValue}>{walletBalance}개</Text>
              </View>
              <View style={styles.walletTodayPill}>
                <Text style={styles.walletMeta}>오늘 +{todayEarned}</Text>
              </View>
            </View>

            <View style={styles.craneEntryCard}>
              <View style={styles.craneCopy}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>크레인</Text>
                  {devMode ? <Text style={styles.devBadge}>개발 모드</Text> : null}
                </View>
                <Text style={styles.craneSubtitle}>
                  {devMode ? '개발 모드에서는 젤리를 쓰지 않아요' : `${CRANE_PLAY_COST}젤리로 한 번 도전해요`}
                </Text>
              </View>

              <View style={styles.cranePreview}>
                <View style={styles.previewRail} />
                <View style={styles.previewClaw} />
                <View style={styles.previewPrizeRow}>
                  {previewPrizes.map((prize, index) => (
                    <View key={prize.id} style={[styles.previewPrize, index % 2 === 1 && styles.previewPrizeLifted]}>
                      <Text style={styles.previewPrizeEmoji}>{prize.emoji}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <TouchableOpacity
                style={[styles.craneButton, !canPlayCrane && styles.craneButtonDisabled]}
                onPress={() => router.push('/crane-game')}
                disabled={!canPlayCrane}
                activeOpacity={0.86}
              >
                <Text style={[styles.craneButtonText, !canPlayCrane && styles.craneButtonTextDisabled]}>
                  {canPlayCrane ? '크레인 하기' : '젤리가 부족해요'}
                </Text>
              </TouchableOpacity>
            </View>

            <View
              style={styles.inventoryCard}
              onLayout={(event) => setInventoryY(event.nativeEvent.layout.y)}
            >
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
                  <Text style={styles.emptyText}>아직 모은 보상이 없어요</Text>
                </View>
              ) : (
                <View style={styles.inventoryGrid}>
                  {inventory.map(item => (
                    <View key={item.id} style={styles.inventoryItem}>
                      <Text style={styles.inventoryEmoji}>{item.emoji}</Text>
                      <Text style={styles.inventoryName} numberOfLines={1}>{item.name}</Text>
                      <Text style={styles.inventoryMeta}>{item.category} · {rarityLabel(item.rarity)}</Text>
                      <Text style={styles.inventoryAmount}>{item.count}개</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.historyCard}>
              <Text style={styles.sectionTitle}>최근 획득</Text>
              {recentItems.length === 0 ? (
                <Text style={styles.emptyText}>최근 획득이 없어요</Text>
              ) : (
                recentItems.map(item => (
                  <View key={item.id} style={styles.historyRow}>
                    <Text style={styles.historyLabel}>{item.label}</Text>
                    <Text style={styles.historyAmount}>{item.meta}</Text>
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
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 22,
    minHeight: 44,
  },
  headerTitle: {
    color: '#101319',
    fontSize: 34,
    fontWeight: '800',
    lineHeight: 40,
  },
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 320,
  },
  walletCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAEE',
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: 'row',
    height: 108,
    justifyContent: 'space-between',
    marginBottom: 16,
    padding: 20,
  },
  cardLabel: {
    color: '#8A8F98',
    fontSize: 14,
    fontWeight: '700',
  },
  walletValue: {
    color: '#101319',
    fontSize: 34,
    fontWeight: '800',
    lineHeight: 39,
    marginTop: 4,
  },
  walletTodayPill: {
    alignItems: 'center',
    backgroundColor: '#FFF2D8',
    borderRadius: 999,
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  walletMeta: {
    color: '#FF9F0A',
    fontSize: 14,
    fontWeight: '800',
  },
  craneEntryCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAEE',
    borderRadius: 28,
    borderWidth: 1,
    gap: 14,
    marginBottom: 16,
    minHeight: 174,
    padding: 18,
  },
  craneCopy: {
    gap: 4,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: '#101319',
    fontSize: 22,
    fontWeight: '800',
  },
  sectionMeta: {
    color: '#8A8F98',
    fontSize: 14,
    fontWeight: '800',
  },
  devBadge: {
    backgroundColor: '#FFF2D8',
    borderRadius: 999,
    color: '#101319',
    fontSize: 12,
    fontWeight: '800',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  craneSubtitle: {
    color: '#8A8F98',
    fontSize: 14,
    fontWeight: '700',
  },
  cranePreview: {
    backgroundColor: '#F4F1EA',
    borderColor: '#F1E3C8',
    borderRadius: 22,
    borderWidth: 1,
    height: 74,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  previewRail: {
    backgroundColor: '#D8D3C8',
    borderRadius: 999,
    height: 5,
    left: 16,
    position: 'absolute',
    right: 58,
    top: 14,
  },
  previewClaw: {
    backgroundColor: '#101319',
    borderRadius: 8,
    height: 12,
    position: 'absolute',
    right: 42,
    top: 10,
    width: 30,
  },
  previewPrizeRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 10,
  },
  previewPrize: {
    alignItems: 'center',
    backgroundColor: '#FFFDF8',
    borderColor: 'rgba(16,19,25,0.08)',
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  previewPrizeLifted: {
    marginBottom: 8,
  },
  previewPrizeEmoji: {
    fontSize: 18,
  },
  craneButton: {
    alignItems: 'center',
    backgroundColor: '#FF9F0A',
    borderRadius: 18,
    height: 50,
    justifyContent: 'center',
  },
  craneButtonDisabled: {
    backgroundColor: '#E5E7EB',
  },
  craneButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  craneButtonTextDisabled: {
    color: '#8A8F98',
  },
  inventoryCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAEE',
    borderRadius: 28,
    borderWidth: 1,
    gap: 14,
    marginBottom: 16,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  categoryWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    alignItems: 'center',
    backgroundColor: '#F1F1F3',
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: 12,
  },
  categoryChipSelected: {
    backgroundColor: '#FFF2D8',
    borderColor: '#FF9F0A',
    borderWidth: 1,
  },
  categoryChipText: {
    color: '#8A8F98',
    fontSize: 13,
    fontWeight: '800',
  },
  categoryChipTextSelected: {
    color: '#101319',
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: '#F4F1EA',
    borderRadius: 22,
    justifyContent: 'center',
    paddingVertical: 18,
  },
  emptyText: {
    color: '#8A8F98',
    fontSize: 14,
    fontWeight: '700',
  },
  inventoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  inventoryItem: {
    backgroundColor: '#F4F1EA',
    borderRadius: 22,
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 15,
    width: '48%',
  },
  inventoryEmoji: {
    fontSize: 32,
  },
  inventoryName: {
    color: '#101319',
    fontSize: 15,
    fontWeight: '800',
  },
  inventoryMeta: {
    color: '#8A8F98',
    fontSize: 12,
    fontWeight: '700',
  },
  inventoryAmount: {
    color: '#101319',
    fontSize: 13,
    fontWeight: '800',
  },
  historyCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAEE',
    borderRadius: 28,
    borderWidth: 1,
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  historyRow: {
    alignItems: 'center',
    borderBottomColor: '#F1F1F3',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  historyLabel: {
    color: '#101319',
    fontSize: 15,
    fontWeight: '700',
  },
  historyAmount: {
    color: '#101319',
    fontSize: 15,
    fontWeight: '800',
  },
})
