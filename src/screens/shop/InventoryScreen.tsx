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
import { ScreenTopBar } from '@/components/ScreenTopBar'
import { TAB_BAR_BASE_HEIGHT } from '@/components/layout/FloatingBottom'
import { RewardSpriteThumb } from '@/components/shop/RewardSpriteView'
import { INVENTORY_CATEGORIES, type InventoryCategory } from '@/constants/rewards'
import { designHarness } from '@/design/designHarness'
import { getInventorySummary, getWalletSummary, type InventorySummaryItem } from '@/domain/reward/repository'

export default function InventoryScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [selectedCategory, setSelectedCategory] = useState<InventoryCategory>('전체')
  const [walletBalance, setWalletBalance] = useState(0)
  const [items, setItems] = useState<InventorySummaryItem[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [walletSummary, inventory] = await Promise.all([
        getWalletSummary(),
        getInventorySummary(selectedCategory),
      ])
      setWalletBalance(walletSummary.balance)
      setItems(inventory)
    } finally {
      setLoading(false)
    }
  }, [selectedCategory])

  useFocusEffect(useCallback(() => {
    void load()
  }, [load]))

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 20,
          paddingBottom: TAB_BAR_BASE_HEIGHT + insets.bottom + 28,
        }}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={20} color="#101319" />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <ScreenTopBar title="보관함" balance={walletBalance} balanceLoading={loading} />
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={designHarness.colors.warning} />
          </View>
        ) : (
          <>
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

            {items.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>보관한 아이템 없음</Text>
              </View>
            ) : (
              <View style={styles.grid}>
                {items.map(item => (
                  <View key={item.id} style={styles.card}>
                    <View style={styles.cardArt}>
                      <RewardSpriteThumb prize={item} width={86} height={74} scale={0.7} compact />
                      <View style={styles.countChip}>
                        <Text style={styles.countChipText}>x{item.count}</Text>
                      </View>
                    </View>
                    <Text numberOfLines={1} style={styles.cardName}>{item.name}</Text>
                    <Text style={styles.cardMeta}>{item.category}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: '#FAFAF8',
    flex: 1,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  backButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    borderRadius: 999,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  headerCopy: {
    flex: 1,
  },
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 280,
  },
  categoryWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 18,
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
    marginTop: 18,
    minHeight: 88,
  },
  emptyText: {
    color: '#8A8F98',
    fontSize: 14,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 18,
  },
  card: {
    backgroundColor: '#F9F7F2',
    borderRadius: 18,
    gap: 10,
    minHeight: 168,
    paddingHorizontal: 12,
    paddingVertical: 12,
    width: '48%',
  },
  cardArt: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    height: 92,
    justifyContent: 'center',
    position: 'relative',
  },
  countChip: {
    backgroundColor: '#101319',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    position: 'absolute',
    right: 8,
    top: 8,
  },
  countChipText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  cardName: {
    color: '#101319',
    fontSize: 14,
    fontWeight: '800',
  },
  cardMeta: {
    color: '#8A8F98',
    fontSize: 12,
    fontWeight: '700',
  },
})