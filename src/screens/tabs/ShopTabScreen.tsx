import React, { useCallback, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
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

const SHOP_SCREEN_PADDING = 20
const SHOP_GRID_GAP = 14

type PurchaseFeedback =
  | { type: 'success'; item: InventorySummaryItem }
  | { type: 'shortage' }

export default function ShopTabScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { width: screenWidth } = useWindowDimensions()
  const [selectedCategory, setSelectedCategory] = useState<InventoryCategory>('전체')
  const [searchQuery, setSearchQuery] = useState('')
  const [walletBalance, setWalletBalance] = useState(0)
  const [shopItems, setShopItems] = useState<InventorySummaryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [purchaseItemId, setPurchaseItemId] = useState<string | null>(null)
  const [purchaseFeedback, setPurchaseFeedback] = useState<PurchaseFeedback | null>(null)
  const [openingCrane, setOpeningCrane] = useState(false)
  const [openingInventory, setOpeningInventory] = useState(false)
  const purchaseLockRef = useRef(false)
  const cardWidth = Math.floor((screenWidth - SHOP_SCREEN_PADDING * 2 - SHOP_GRID_GAP * 2) / 3)
  const artBoxSize = Math.max(76, Math.floor(cardWidth * 0.82))
  const cardHeight = Math.max(166, artBoxSize + 92)
  const spriteSize = Math.max(46, Math.floor(artBoxSize * 0.72))

  const filteredItems = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase()
    if (!query) return shopItems
    return shopItems.filter(item => item.name.toLocaleLowerCase().includes(query))
  }, [searchQuery, shopItems])

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
    if (purchaseLockRef.current || purchaseItemId) return

    if (walletBalance < item.priceJelly) {
      setPurchaseFeedback({ type: 'shortage' })
      return
    }

    purchaseLockRef.current = true
    setPurchaseItemId(item.id)
    try {
      const result = await purchaseShopItem(item.id)
      const purchasedItem = { ...item, count: result.inventoryCount }
      setWalletBalance(result.walletBalance)
      setShopItems(current => current.map(entry => (
        entry.id === item.id
          ? { ...entry, count: result.inventoryCount }
          : entry
      )))
      setPurchaseFeedback({ type: 'success', item: purchasedItem })
    } catch (error) {
      if (error instanceof Error && error.message.includes('젤리')) {
        setPurchaseFeedback({ type: 'shortage' })
      } else {
        console.warn('[shop] purchase failed', error)
      }
    } finally {
      purchaseLockRef.current = false
      setPurchaseItemId(null)
    }
  }

  const handleViewInventoryFromModal = () => {
    setPurchaseFeedback(null)
    router.push('/rewards')
  }

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingHorizontal: SHOP_SCREEN_PADDING,
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

            <View style={styles.searchBox}>
              <Ionicons name="search" size={17} color="#8A8F98" />
              <TextInput
                accessibilityLabel="아이템 검색"
                autoCorrect={false}
                placeholder="검색"
                placeholderTextColor="#A0A5AE"
                returnKeyType="search"
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 ? (
                <TouchableOpacity style={styles.clearSearchButton} onPress={() => setSearchQuery('')} accessibilityLabel="검색 지우기">
                  <Ionicons name="close" size={16} color="#8A8F98" />
                </TouchableOpacity>
              ) : null}
            </View>

            {filteredItems.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>아이템 없음</Text>
              </View>
            ) : (
              <View style={styles.productGrid}>
                {filteredItems.map(item => {
                  const isBusy = purchaseItemId === item.id
                  const canPurchase = walletBalance >= item.priceJelly
                  const purchaseLabel = isBusy ? '구매 중' : canPurchase ? '구매' : '모자람'

                  return (
                    <View
                      key={item.id}
                      style={[styles.productCard, { width: cardWidth, height: cardHeight }]}
                    >
                      <View style={[styles.productArtWrap, { height: artBoxSize }]}>
                        <RewardSpriteThumb prize={item} width={spriteSize} height={spriteSize} scale={0.52} compact />
                        {item.count > 0 ? (
                          <View style={styles.ownedChip}>
                            <Text style={styles.ownedChipText}>x{item.count}</Text>
                          </View>
                        ) : null}
                      </View>

                      <View style={styles.productCopy}>
                        <Text numberOfLines={1} ellipsizeMode="tail" style={styles.productName}>{item.name}</Text>
                        <Text numberOfLines={1} style={styles.productMeta}>{item.category}</Text>
                      </View>

                      <View style={styles.productFooter}>
                        <View style={styles.priceChip}>
                          <Text numberOfLines={1} style={styles.priceChipText}>{item.priceJelly} 젤리</Text>
                        </View>
                        <TouchableOpacity
                          activeOpacity={0.86}
                          accessibilityState={{ disabled: !canPurchase || isBusy }}
                          style={[styles.buyButton, !canPurchase && styles.buyButtonDisabled]}
                          onPress={() => handlePurchase(item)}
                          disabled={isBusy}
                        >
                          <Text numberOfLines={1} style={styles.buyButtonText}>{purchaseLabel}</Text>
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
              <Ionicons name="archive-outline" size={20} color="#101319" />
            </TouchableOpacity>
            <Text style={styles.floatingActionLabel}>보관함</Text>
          </View>

          <View style={[styles.floatingActionWrap, styles.floatingActionWrapRight, { bottom: TAB_BAR_BASE_HEIGHT + insets.bottom + 12 }]}>
            <TouchableOpacity activeOpacity={0.86} style={styles.floatingActionButton} onPress={openCrane}>
              <Ionicons name="game-controller-outline" size={20} color="#101319" />
            </TouchableOpacity>
            <Text style={styles.floatingActionLabel}>크레인</Text>
          </View>
        </>
      ) : null}

      <PurchaseFeedbackModal
        feedback={purchaseFeedback}
        onClose={() => setPurchaseFeedback(null)}
        onViewInventory={handleViewInventoryFromModal}
      />
    </View>
  )
}

function PurchaseFeedbackModal({
  feedback,
  onClose,
  onViewInventory,
}: {
  feedback: PurchaseFeedback | null
  onClose: () => void
  onViewInventory: () => void
}) {
  const item = feedback?.type === 'success' ? feedback.item : null

  return (
    <Modal transparent visible={feedback !== null} animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <TouchableOpacity style={styles.modalCloseButton} onPress={onClose} accessibilityLabel="닫기">
            <Text style={styles.modalCloseIcon}>×</Text>
          </TouchableOpacity>

          <Text style={styles.modalTitle}>{item ? '보관함에 쏙 넣었어요!' : '젤리가 부족합니다!'}</Text>

          {item ? (
            <>
              <View style={styles.modalArtWrap}>
                <RewardSpriteThumb prize={item} width={118} height={108} scale={0.74} compact />
              </View>
              <Text numberOfLines={1} ellipsizeMode="tail" style={styles.modalItemName}>{item.name}</Text>

              <TouchableOpacity activeOpacity={0.86} style={styles.modalPrimaryButton} onPress={onViewInventory}>
                <Text numberOfLines={1} style={styles.modalPrimaryText}>보관함으로</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.86} style={styles.modalSecondaryButton} onPress={onClose}>
                <Text numberOfLines={1} style={styles.modalSecondaryText}>계속 보기</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.modalCaption}>조금 더 모으면 데려올 수 있어요.</Text>
              <TouchableOpacity activeOpacity={0.86} style={styles.modalPrimaryButton} onPress={onClose}>
                <Text numberOfLines={1} style={styles.modalPrimaryText}>닫기</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
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
    gap: 7,
    marginTop: 16,
  },
  categoryChip: {
    alignItems: 'center',
    backgroundColor: '#F1F1F3',
    borderRadius: 999,
    height: 30,
    justifyContent: 'center',
    paddingHorizontal: 10,
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
  searchBox: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAEE',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    height: 42,
    marginTop: 14,
    paddingHorizontal: 12,
  },
  searchInput: {
    color: '#101319',
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    height: 40,
    padding: 0,
  },
  clearSearchButton: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    width: 28,
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
    columnGap: SHOP_GRID_GAP,
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 18,
    rowGap: 16,
  },
  productCard: {
    backgroundColor: '#F9F7F2',
    borderRadius: 14,
    gap: 6,
    paddingHorizontal: 7,
    paddingVertical: 7,
  },
  productArtWrap: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    justifyContent: 'center',
    position: 'relative',
    width: '100%',
  },
  ownedChip: {
    backgroundColor: '#101319',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
    position: 'absolute',
    right: 6,
    top: 6,
  },
  ownedChipText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  productCopy: {
    gap: 2,
    minHeight: 30,
  },
  productName: {
    color: '#101319',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
  },
  productMeta: {
    color: '#8A8F98',
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 13,
  },
  productFooter: {
    alignItems: 'flex-start',
    gap: 4,
    marginTop: 'auto',
  },
  priceChip: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFF2D8',
    borderColor: '#F5D7A1',
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: '100%',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  priceChipText: {
    color: '#9A5D00',
    fontSize: 11,
    fontWeight: '800',
  },
  buyButton: {
    alignItems: 'center',
    backgroundColor: '#101319',
    borderRadius: 999,
    height: 30,
    justifyContent: 'center',
    minWidth: 50,
    paddingHorizontal: 10,
  },
  buyButtonDisabled: {
    backgroundColor: '#C8CDD4',
  },
  buyButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  modalOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(16,19,25,0.28)',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E8EAEE',
    borderRadius: 28,
    borderWidth: 1,
    gap: 10,
    maxWidth: 320,
    paddingBottom: 20,
    paddingHorizontal: 20,
    paddingTop: 22,
    width: '86%',
  },
  modalCloseButton: {
    alignItems: 'center',
    backgroundColor: '#F1F1F3',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    position: 'absolute',
    right: 14,
    top: 14,
    width: 32,
  },
  modalCloseIcon: {
    color: '#8A8F98',
    fontSize: 21,
    fontWeight: '800',
    lineHeight: 23,
  },
  modalTitle: {
    color: '#101319',
    fontSize: 23,
    fontWeight: '800',
    lineHeight: 30,
    marginTop: 4,
    textAlign: 'center',
  },
  modalCaption: {
    color: '#69707D',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
    textAlign: 'center',
  },
  modalArtWrap: {
    alignItems: 'center',
    backgroundColor: '#FAFAF8',
    borderRadius: 18,
    height: 118,
    justifyContent: 'center',
    marginTop: 2,
    width: 142,
  },
  modalItemName: {
    color: '#101319',
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 22,
    maxWidth: '100%',
  },
  modalPrimaryButton: {
    alignItems: 'center',
    backgroundColor: '#101319',
    borderRadius: 16,
    height: 46,
    justifyContent: 'center',
    marginTop: 4,
    width: '100%',
  },
  modalPrimaryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  modalSecondaryButton: {
    alignItems: 'center',
    backgroundColor: '#F1F1F3',
    borderRadius: 16,
    height: 44,
    justifyContent: 'center',
    width: '100%',
  },
  modalSecondaryText: {
    color: '#101319',
    fontSize: 14,
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
    height: 50,
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    width: 50,
  },
  floatingActionLabel: {
    color: '#40454D',
    fontSize: 11,
    fontWeight: '800',
  },
})
