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
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ScreenTopBar } from '@/components/ScreenTopBar'
import { TAB_BAR_BASE_HEIGHT } from '@/components/layout/FloatingBottom'
import { RewardSpriteThumb } from '@/components/shop/RewardSpriteView'
import { CRANE_PLAY_COST, CRANE_REROLL_COST, INVENTORY_CATEGORIES, type InventoryCategory } from '@/constants/rewards'
import {
  getCraneMachineSession,
  getInventorySummary,
  getWalletSummary,
  type CranePrize,
  type InventorySummaryItem,
} from '@/domain/reward/repository'
import { getSettings } from '@/domain/settings/repository'
import { designHarness } from '@/design/designHarness'

function rarityLabel(value: string) {
  if (value === 'rare') return '레어'
  if (value === 'special') return '스페셜'
  return '일반'
}

export default function ShopTabScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [selectedCategory, setSelectedCategory] = useState<InventoryCategory>('전체')
  const [walletBalance, setWalletBalance] = useState(0)
  const [inventory, setInventory] = useState<InventorySummaryItem[]>([])
  const [prizePool, setPrizePool] = useState<CranePrize[]>([])
  const [loading, setLoading] = useState(true)
  const [devMode, setDevMode] = useState(false)
  const [openingCrane, setOpeningCrane] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [walletSummary, inventorySummary, machineSession, settings] = await Promise.all([
        getWalletSummary(),
        getInventorySummary(selectedCategory),
        getCraneMachineSession(),
        getSettings(),
      ])

      setWalletBalance(walletSummary.balance)
      setInventory(inventorySummary)
      setPrizePool(machineSession.visiblePrizes)
      setDevMode(settings.devMode === 1)
    } finally {
      setLoading(false)
    }
  }, [selectedCategory])

  useFocusEffect(useCallback(() => {
    void load()
  }, [load]))

  const previewPrizes = useMemo(() => prizePool.slice(0, 6), [prizePool])
  const canPlayCrane = devMode || walletBalance >= CRANE_PLAY_COST
  const inventoryCount = inventory.reduce((sum, item) => sum + item.count, 0)

  const openCrane = () => {
    if (openingCrane || !canPlayCrane) return
    setOpeningCrane(true)
    router.push('/crane')
    requestAnimationFrame(() => setOpeningCrane(false))
  }

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 20,
          paddingBottom: TAB_BAR_BASE_HEIGHT + insets.bottom + 24,
        }}
      >
        <ScreenTopBar title="상점" balance={walletBalance} balanceLoading={loading} />

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={designHarness.colors.warning} />
          </View>
        ) : (
          <>
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>크레인 머신</Text>
                <View style={styles.costChip}>
                  <Text style={styles.costChipText}>{CRANE_PLAY_COST} / {CRANE_REROLL_COST} 젤리</Text>
                </View>
              </View>

              <View style={styles.previewRow}>
                {previewPrizes.map(prize => (
                  <View key={prize.id} style={styles.previewItem}>
                    <RewardSpriteThumb prize={prize} width={48} height={42} scale={0.58} compact />
                  </View>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.primaryButton, !canPlayCrane && styles.primaryButtonDisabled]}
                onPress={openCrane}
                disabled={!canPlayCrane}
              >
                <Text style={styles.primaryButtonText}>뽑기</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.sectionCard}>
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
                  <Text style={styles.emptyText}>아이템이 없어요</Text>
                </View>
              ) : (
                <View style={styles.inventoryGrid}>
                  {inventory.map(item => (
                    <View key={item.id} style={styles.inventoryItem}>
                      <View style={styles.inventoryArt}>
                        <RewardSpriteThumb prize={item} width={60} height={48} scale={0.62} compact />
                      </View>
                      <Text numberOfLines={1} style={styles.inventoryName}>{item.name}</Text>
                      <Text style={styles.inventoryMeta}>{item.category} · {rarityLabel(item.rarity)}</Text>
                      <Text style={styles.inventoryCount}>{item.count}개</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.sectionCard}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>아이템 상점</Text>
                <Text style={styles.sectionMeta}>준비 중</Text>
              </View>
              <View style={styles.futureCard}>
                <Text style={styles.futureText}>젤리로 바로 교환하는 기능은 준비 중입니다.</Text>
              </View>
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
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 280,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAEE',
    borderRadius: 24,
    borderWidth: 1,
    gap: 12,
    marginTop: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: '#101319',
    fontSize: 17,
    fontWeight: '800',
  },
  sectionMeta: {
    color: '#8A8F98',
    fontSize: 13,
    fontWeight: '700',
  },
  costChip: {
    backgroundColor: '#FFF2D8',
    borderColor: '#F5D7A1',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  costChipText: {
    color: '#9A5D00',
    fontSize: 12,
    fontWeight: '800',
  },
  previewRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  previewItem: {
    alignItems: 'center',
    backgroundColor: '#F6F3ED',
    borderRadius: 16,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#101319',
    borderRadius: 18,
    height: 46,
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: '#C8CDD4',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
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
    height: 34,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  categoryChipSelected: {
    backgroundColor: '#FFF2D8',
    borderColor: '#FF9F0A',
    borderWidth: 1,
  },
  categoryChipText: {
    color: '#8A8F98',
    fontSize: 12,
    fontWeight: '800',
  },
  categoryChipTextSelected: {
    color: '#101319',
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: '#F4F1EA',
    borderRadius: 18,
    justifyContent: 'center',
    minHeight: 88,
  },
  emptyText: {
    color: '#8A8F98',
    fontSize: 14,
    fontWeight: '600',
  },
  inventoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  inventoryItem: {
    backgroundColor: '#F9F7F2',
    borderRadius: 18,
    gap: 4,
    minHeight: 148,
    paddingHorizontal: 12,
    paddingVertical: 12,
    width: '48%',
  },
  inventoryArt: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    height: 64,
    justifyContent: 'center',
    marginBottom: 4,
  },
  inventoryName: {
    color: '#101319',
    fontSize: 14,
    fontWeight: '800',
  },
  inventoryMeta: {
    color: '#8A8F98',
    fontSize: 11,
    fontWeight: '600',
  },
  inventoryCount: {
    color: '#B16F16',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  futureCard: {
    alignItems: 'center',
    backgroundColor: '#F4F1EA',
    borderRadius: 18,
    justifyContent: 'center',
    minHeight: 72,
    paddingHorizontal: 16,
  },
  futureText: {
    color: '#8A8F98',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
})
