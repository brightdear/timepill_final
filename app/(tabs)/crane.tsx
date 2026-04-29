import React, { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ScreenTopBar } from '@/components/ScreenTopBar'
import { CRANE_PLAY_COST, INVENTORY_CATEGORIES, type InventoryCategory } from '@/constants/rewards'
import {
  getInventorySummary,
  getRecentRewardTransactions,
  getWalletSummary,
  playCraneGame,
  type InventorySummaryItem,
} from '@/domain/reward/repository'
import { designHarness } from '@/design/designHarness'

type ResultPrize = Pick<InventorySummaryItem, 'name' | 'emoji' | 'category' | 'rarity'>

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
  const [loading, setLoading] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [resultPrize, setResultPrize] = useState<ResultPrize | null>(null)
  const [resultVisible, setResultVisible] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [walletSummary, inventorySummary, rewardSummary] = await Promise.all([
        getWalletSummary(),
        getInventorySummary(selectedCategory),
        getRecentRewardTransactions(6),
      ])

      setWalletBalance(walletSummary.balance)
      setTodayEarned(walletSummary.todayEarned)
      setInventory(inventorySummary)
      setRecentRewards(rewardSummary)
    } finally {
      setLoading(false)
    }
  }, [selectedCategory])

  useFocusEffect(useCallback(() => {
    void load()
  }, [load]))

  const canPlay = walletBalance >= CRANE_PLAY_COST && !playing
  const inventoryCount = useMemo(
    () => inventory.reduce((sum, item) => sum + item.count, 0),
    [inventory],
  )

  const handlePlay = async () => {
    if (!canPlay) {
      setErrorMessage('젤리가 부족해요')
      return
    }

    setPlaying(true)
    setErrorMessage(null)

    try {
      const result = await playCraneGame()
      setResultPrize(result.prize)
      setResultVisible(true)
      await load()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '상점을 불러오지 못했어요')
    } finally {
      setPlaying(false)
    }
  }

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
                <Text style={styles.sectionMeta}>{CRANE_PLAY_COST}젤리</Text>
              </View>
              <View style={styles.machineBox}>
                <Text style={styles.machineEmoji}>{playing ? '📦' : '🎁'}</Text>
                <Text style={styles.machineCopy}>{playing ? '아이템을 꺼내는 중' : '조용한 보상 뽑기'}</Text>
              </View>
              <TouchableOpacity
                style={[styles.primaryButton, !canPlay && styles.primaryButtonDisabled]}
                onPress={handlePlay}
                disabled={!canPlay}
              >
                <Text style={styles.primaryButtonText}>{playing ? '뽑는 중...' : '뽑기'}</Text>
              </TouchableOpacity>
              {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}
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
                      <Text style={styles.inventoryAmount}>x{item.count}</Text>
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

      <Modal transparent visible={resultVisible} animationType="fade" onRequestClose={() => setResultVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.resultCard}>
            <Text style={styles.resultTitle}>획득했어요</Text>
            <Text style={styles.resultEmoji}>{resultPrize?.emoji}</Text>
            <Text style={styles.resultName}>{resultPrize?.name}</Text>
            <Text style={styles.resultMeta}>{resultPrize?.category} · {resultPrize ? rarityLabel(resultPrize.rarity) : ''}</Text>
            <TouchableOpacity style={styles.resultPrimaryButton} onPress={() => setResultVisible(false)}>
              <Text style={styles.resultPrimaryText}>보관함 보기</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.resultSecondaryButton}
              onPress={() => {
                setResultVisible(false)
                void handlePlay()
              }}
              disabled={walletBalance < CRANE_PLAY_COST}
            >
              <Text style={[styles.resultSecondaryText, walletBalance < CRANE_PLAY_COST && styles.resultSecondaryTextDisabled]}>다시 뽑기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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
  machineBox: {
    minHeight: 160,
    borderRadius: 24,
    backgroundColor: '#F4F1EA',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  machineEmoji: {
    fontSize: 54,
  },
  machineCopy: {
    fontSize: 15,
    fontWeight: '600',
    color: '#8A8F98',
  },
  primaryButton: {
    height: 52,
    borderRadius: 20,
    backgroundColor: '#FF9F0A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    backgroundColor: '#D8D8D8',
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  errorText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#B4532A',
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(16,19,25,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  resultCard: {
    width: '100%',
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
    paddingVertical: 24,
    alignItems: 'center',
    gap: 8,
  },
  resultTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#101319',
  },
  resultEmoji: {
    fontSize: 56,
    marginVertical: 8,
  },
  resultName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#101319',
  },
  resultMeta: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8A8F98',
    marginBottom: 8,
  },
  resultPrimaryButton: {
    width: '100%',
    height: 52,
    borderRadius: 20,
    backgroundColor: '#FF9F0A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultPrimaryText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  resultSecondaryButton: {
    width: '100%',
    height: 48,
    borderRadius: 20,
    backgroundColor: '#F1F1F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultSecondaryText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#101319',
  },
  resultSecondaryTextDisabled: {
    color: '#8A8F98',
  },
})