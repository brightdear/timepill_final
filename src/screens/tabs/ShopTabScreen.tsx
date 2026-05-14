import React, { useCallback, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
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
import {
  getShopCatalog,
  getWalletSummary,
  purchaseShopItem,
  type InventorySummaryItem,
} from '@/domain/reward/repository'
import { designHarness } from '@/design/designHarness'

export default function ShopTabScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [selectedCategory, setSelectedCategory] = useState<InventoryCategory>('전체')
  const [walletBalance, setWalletBalance] = useState(0)
  const [shopItems, setShopItems] = useState<InventorySummaryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [purchaseItemId, setPurchaseItemId] = useState<string | null>(null)
  const [openingCrane, setOpeningCrane] = useState(false)
  const [openingInventory, setOpeningInventory] = useState(false)
  const purchaseLockRef = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [walletSummary, catalog] = await Promise.all([
        getWalletSummary(),
        getShopCatalog(selectedCategory),
      ])

      setWalletBalance(walletSummary.balance)
      setShopItems(catalog)
    } finally {
      setLoading(false)
    }
  }, [selectedCategory])

  useFocusEffect(useCallback(() => {
    void load()
  }, [load]))

  const openCrane = () => {
    if (openingCrane) return
    setOpeningCrane(true)
    router.push('/crane')
    requestAnimationFrame(() => setOpeningCrane(false))
  }

  const openInventory = () => {
    if (openingInventory) return
    setOpeningInventory(true)
    router.push('/rewards')
    requestAnimationFrame(() => setOpeningInventory(false))
  }

  const handlePurchase = async (item: InventorySummaryItem) => {
    if (purchaseLockRef.current || purchaseItemId || walletBalance < item.priceJelly) return

    purchaseLockRef.current = true
    setPurchaseItemId(item.id)
    try {
      const result = await purchaseShopItem(item.id)
      setWalletBalance(result.walletBalance)
      setShopItems(current => current.map(entry => (
        entry.id === item.id
          ? { ...entry, count: result.inventoryCount }
          : entry
      )))
    } catch (error) {
      Alert.alert('구매할 수 없어요', error instanceof Error ? error.message : '다시 시도해 주세요')
    } finally {
      purchaseLockRef.current = false
      setPurchaseItemId(null)
    }
  }

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingHorizontal: 20,
          paddingBottom: TAB_BAR_BASE_HEIGHT + insets.bottom + 116,
        }}
      >
        <ScreenTopBar title="상점" balance={walletBalance} balanceLoading={loading} />

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

            {shopItems.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>아이템 없음</Text>
              </View>
            ) : (
              <View style={styles.productGrid}>
                {shopItems.map(item => {
                  const isBusy = purchaseItemId === item.id
                  const canPurchase = walletBalance >= item.priceJelly && !isBusy

                  return (
                    <View key={item.id} style={styles.productCard}>
                      <View style={styles.productArtWrap}>
                        <RewardSpriteThumb prize={item} width={86} height={74} scale={0.7} compact />
                        {item.count > 0 ? (
                          <View style={styles.ownedChip}>
                            <Text style={styles.ownedChipText}>x{item.count}</Text>
                          </View>
                        ) : null}
                      </View>

                      <View style={styles.productCopy}>
                        <Text numberOfLines={1} style={styles.productName}>{item.name}</Text>
                        <Text style={styles.productMeta}>{item.category}</Text>
                      </View>

                      <View style={styles.productFooter}>
                        <View style={styles.priceChip}>
                          <Text style={styles.priceChipText}>{item.priceJelly} 젤리</Text>
                        </View>
                        <TouchableOpacity
                          activeOpacity={0.86}
                          style={[styles.buyButton, !canPurchase && styles.buyButtonDisabled]}
                          onPress={() => handlePurchase(item)}
                          disabled={!canPurchase}
                        >
                          <Text style={styles.buyButtonText}>
                            {isBusy ? '구매 중' : canPurchase ? '구매' : '젤리 부족'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {!loading ? (
        <>
          <View style={[styles.floatingActionWrap, styles.floatingActionWrapLeft, { bottom: TAB_BAR_BASE_HEIGHT + insets.bottom + 12 }]}>
            <TouchableOpacity activeOpacity={0.86} style={styles.floatingActionButton} onPress={openInventory}>
              <Ionicons name="archive-outline" size={22} color="#101319" />
            </TouchableOpacity>
            <Text style={styles.floatingActionLabel}>보관함</Text>
          </View>

          <View style={[styles.floatingActionWrap, styles.floatingActionWrapRight, { bottom: TAB_BAR_BASE_HEIGHT + insets.bottom + 12 }]}>
            <TouchableOpacity activeOpacity={0.86} style={styles.floatingActionButton} onPress={openCrane}>
              <Ionicons name="game-controller-outline" size={22} color="#101319" />
            </TouchableOpacity>
            <Text style={styles.floatingActionLabel}>크레인</Text>
          </View>
        </>
      ) : null}
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
  productGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 18,
  },
  productCard: {
    backgroundColor: '#F9F7F2',
    borderRadius: 18,
    gap: 10,
    minHeight: 212,
    paddingHorizontal: 12,
    paddingVertical: 12,
    width: '48%',
  },
  productArtWrap: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    height: 92,
    justifyContent: 'center',
    position: 'relative',
  },
  ownedChip: {
    backgroundColor: '#101319',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    position: 'absolute',
    right: 8,
    top: 8,
  },
  ownedChipText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  productCopy: {
    gap: 4,
  },
  productName: {
    color: '#101319',
    fontSize: 14,
    fontWeight: '800',
  },
  productMeta: {
    color: '#8A8F98',
    fontSize: 12,
    fontWeight: '700',
  },
  productFooter: {
    gap: 8,
    marginTop: 'auto',
  },
  priceChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFF2D8',
    borderColor: '#F5D7A1',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  priceChipText: {
    color: '#9A5D00',
    fontSize: 12,
    fontWeight: '800',
  },
  buyButton: {
    alignItems: 'center',
    backgroundColor: '#101319',
    borderRadius: 16,
    height: 40,
    justifyContent: 'center',
  },
  buyButtonDisabled: {
    backgroundColor: '#C8CDD4',
  },
  buyButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  floatingActionWrap: {
    alignItems: 'center',
    gap: 6,
    position: 'absolute',
  },
  floatingActionWrapLeft: {
    left: 16,
  },
  floatingActionWrapRight: {
    right: 16,
  },
  floatingActionButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAEE',
    borderRadius: 999,
    borderWidth: 1,
    height: 56,
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    width: 56,
  },
  floatingActionLabel: {
    color: '#40454D',
    fontSize: 11,
    fontWeight: '800',
  },
})
