import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Image,
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
import { JellyBalanceChip } from '@/components/JellyBalanceChip'
import { TAB_BAR_BASE_HEIGHT } from '@/components/layout/FloatingBottom'
import { RewardSpriteThumb } from '@/components/shop/RewardSpriteView'
import { INVENTORY_CATEGORIES, type InventoryCategory } from '@/constants/rewards'
import { designHarness } from '@/design/designHarness'
import { getInventorySummary, getWalletSummary, type InventorySummaryItem } from '@/domain/reward/repository'

const CABINET_ASSET = require('../../../assets/bookshelf.png')
const CABINET_IMAGE_WIDTH = 1122
const CABINET_IMAGE_HEIGHT = 1402
const CABINET_ASPECT_RATIO = CABINET_IMAGE_WIDTH / CABINET_IMAGE_HEIGHT
const CABINET_SLOT_COUNT = 20
const INVENTORY_SCREEN_PADDING = 14

type ItemDisplayStyle = 'hanging' | 'standing' | 'flat' | 'special'

type CabinetSlotFrame = {
  x: number
  y: number
  width: number
  height: number
}

type CabinetSlot = {
  index: number
  item: InventorySummaryItem | null
}

const CABINET_SLOT_FRAMES: CabinetSlotFrame[] = Array.from({ length: CABINET_SLOT_COUNT }, (_, index) => {
  const column = index % 4
  const row = Math.floor(index / 4)

  return {
    x: 0.095 + column * 0.2115,
    y: 0.206 + row * 0.1415,
    width: 0.18,
    height: 0.104,
  }
})

function parseDateTime(value?: string | null) {
  if (!value) return Number.NaN
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : Number.NaN
}

function compareByCollectionOrder(left: InventorySummaryItem, right: InventorySummaryItem) {
  const leftTime = parseDateTime(left.firstObtainedAt)
  const rightTime = parseDateTime(right.firstObtainedAt)

  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
    return leftTime - rightTime
  }

  const sortRank = (left.sortOrder ?? 0) - (right.sortOrder ?? 0)
  if (sortRank !== 0) return sortRank
  return left.id.localeCompare(right.id)
}

function getCabinetSlots(items: InventorySummaryItem[]): CabinetSlot[] {
  const displayedItems = [...items].sort(compareByCollectionOrder).slice(0, CABINET_SLOT_COUNT)
  return Array.from({ length: CABINET_SLOT_COUNT }, (_, index) => ({
    index,
    item: displayedItems[index] ?? null,
  }))
}

function resolveDisplayStyle(item: InventorySummaryItem): ItemDisplayStyle {
  if (item.rarity === 'special') return 'special'
  if (item.category === '키링') return 'hanging'
  if (item.category === '스티커' || item.category === '배지' || item.category === '테마') return 'flat'
  return 'standing'
}

function matchesFilters(item: InventorySummaryItem, selectedCategory: InventoryCategory, query: string) {
  const categoryMatches = selectedCategory === '전체' || item.category === selectedCategory
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const queryMatches = !normalizedQuery || (
    item.name.toLocaleLowerCase().includes(normalizedQuery) ||
    item.category.toLocaleLowerCase().includes(normalizedQuery)
  )

  return categoryMatches && queryMatches
}

function formatCollectionDate(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`
}

function rarityLabel(value?: string | null) {
  if (value === 'common') return '일반'
  if (value === 'rare') return '레어'
  if (value === 'special') return '스페셜'
  return value || '-'
}

export default function InventoryScreen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { width: screenWidth } = useWindowDimensions()
  const [selectedCategory, setSelectedCategory] = useState<InventoryCategory>('전체')
  const [searchQuery, setSearchQuery] = useState('')
  const [walletBalance, setWalletBalance] = useState(0)
  const [items, setItems] = useState<InventorySummaryItem[]>([])
  const [selectedItem, setSelectedItem] = useState<InventorySummaryItem | null>(null)
  const [loading, setLoading] = useState(true)
  const cabinetWidth = Math.min(screenWidth - 16, 470)
  const cabinetHeight = Math.round(cabinetWidth / CABINET_ASPECT_RATIO)

  const cabinetSlots = useMemo(() => getCabinetSlots(items), [items])
  const activeFilter = selectedCategory !== '전체' || searchQuery.trim().length > 0
  const matchedCount = useMemo(() => (
    items.filter(item => matchesFilters(item, selectedCategory, searchQuery)).length
  ), [items, searchQuery, selectedCategory])
  const overflowCount = Math.max(0, items.length - CABINET_SLOT_COUNT)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [walletSummary, inventory] = await Promise.all([
        getWalletSummary(),
        getInventorySummary('전체'),
      ])
      setWalletBalance(walletSummary.balance)
      setItems(inventory)
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(useCallback(() => {
    void load()
  }, [load]))

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 12,
          paddingHorizontal: INVENTORY_SCREEN_PADDING,
          paddingBottom: TAB_BAR_BASE_HEIGHT + insets.bottom + 28,
        }}
      >
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} accessibilityLabel="뒤로">
            <Ionicons name="chevron-back" size={20} color="#101319" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>보관함</Text>
          <JellyBalanceChip balance={walletBalance} loading={loading} />
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

            <View style={styles.searchBox}>
              <Ionicons name="search" size={17} color="#8A8F98" />
              <TextInput
                accessibilityLabel="보관함 검색"
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

            <View style={styles.collectionHeader}>
              <Text style={styles.collectionTitle}>컬렉션 서랍장</Text>
              <Text style={styles.collectionCount}>{Math.min(items.length, CABINET_SLOT_COUNT)} / {CABINET_SLOT_COUNT}</Text>
            </View>

            {items.length === 0 ? (
              <Text style={styles.emptyText}>아이템 없음</Text>
            ) : activeFilter ? (
              <Text style={styles.filterHint}>
                {matchedCount > 0 ? `${matchedCount}개 아이템을 밝게 표시했어요` : '맞는 아이템이 아직 없어요'}
              </Text>
            ) : null}

            <View style={styles.cabinetWrap}>
              <View style={[styles.cabinetStage, { width: cabinetWidth, height: cabinetHeight }]}>
                <Image source={CABINET_ASSET} resizeMode="contain" style={styles.cabinetImage} />
                {cabinetSlots.map(slot => {
                  const frame = CABINET_SLOT_FRAMES[slot.index]
                  const slotWidth = frame.width * cabinetWidth
                  const slotHeight = frame.height * cabinetHeight
                  const dimmed = Boolean(
                    slot.item &&
                    activeFilter &&
                    !matchesFilters(slot.item, selectedCategory, searchQuery),
                  )

                  return (
                    <CabinetSlotView
                      key={`slot-${slot.index}`}
                      frame={frame}
                      imageWidth={cabinetWidth}
                      imageHeight={cabinetHeight}
                      item={slot.item}
                      slotHeight={slotHeight}
                      slotWidth={slotWidth}
                      dimmed={dimmed}
                      onPress={() => {
                        if (slot.item) setSelectedItem(slot.item)
                      }}
                    />
                  )
                })}
              </View>
            </View>

            {overflowCount > 0 ? (
              <View style={styles.overflowNotice}>
                <Ionicons name="albums-outline" size={15} color="#9A6A1E" />
                <Text style={styles.overflowNoticeText}>서랍 확장 대기 아이템 {overflowCount}개</Text>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <InventoryDetailSheet
        bottomInset={insets.bottom}
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
      />
    </View>
  )
}

function CabinetSlotView({
  dimmed,
  frame,
  imageHeight,
  imageWidth,
  item,
  onPress,
  slotHeight,
  slotWidth,
}: {
  dimmed: boolean
  frame: CabinetSlotFrame
  imageHeight: number
  imageWidth: number
  item: InventorySummaryItem | null
  onPress: () => void
  slotHeight: number
  slotWidth: number
}) {
  const pop = useRef(new Animated.Value(item ? 0.92 : 1)).current
  const displayStyle = item ? resolveDisplayStyle(item) : 'standing'

  useEffect(() => {
    if (!item) return
    pop.setValue(0.88)
    Animated.spring(pop, {
      toValue: 1,
      useNativeDriver: true,
      friction: 7,
      tension: 120,
    }).start()
  }, [item?.id, pop])

  return (
    <TouchableOpacity
      activeOpacity={item ? 0.82 : 1}
      accessibilityLabel={item ? `${item.name} 보관 슬롯` : '빈 보관 슬롯'}
      onPress={onPress}
      style={[
        styles.slotTouch,
        {
          left: frame.x * imageWidth,
          top: frame.y * imageHeight,
          width: slotWidth,
          height: slotHeight,
        },
      ]}
    >
      {item ? (
        <Animated.View style={[styles.slotItemWrap, dimmed && styles.slotItemDimmed, { transform: [{ scale: pop }] }]}>
          <CabinetItemView item={item} slotHeight={slotHeight} slotWidth={slotWidth} displayStyle={displayStyle} />
        </Animated.View>
      ) : (
        <View style={styles.emptySlotHint}>
          <Text style={styles.emptySlotText}>?</Text>
        </View>
      )}
    </TouchableOpacity>
  )
}

function CabinetItemView({
  displayStyle,
  item,
  slotHeight,
  slotWidth,
}: {
  displayStyle: ItemDisplayStyle
  item: InventorySummaryItem
  slotHeight: number
  slotWidth: number
}) {
  const flat = displayStyle === 'flat'
  const hanging = displayStyle === 'hanging'
  const special = displayStyle === 'special'
  const itemWidth = slotWidth * (flat ? 0.82 : hanging ? 0.76 : special ? 0.8 : 0.74)
  const itemHeight = slotHeight * (flat ? 0.78 : hanging ? 0.88 : special ? 0.86 : 0.78)

  return (
    <View style={[styles.cabinetItem, hanging && styles.cabinetItemHanging, !hanging && styles.cabinetItemStanding]}>
      {hanging ? <View style={styles.itemHook} /> : null}
      {special ? <View style={styles.specialGlow} /> : null}
      {!flat && !hanging ? <View style={[styles.contactShadow, { width: itemWidth * 0.62 }]} /> : null}
      <RewardSpriteThumb
        prize={item}
        width={itemWidth}
        height={itemHeight}
        scale={special ? 0.78 : flat ? 0.76 : hanging ? 0.74 : 0.72}
        compact
      />
      {item.count > 1 ? (
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>x{item.count}</Text>
        </View>
      ) : null}
      {item.rarity !== 'common' ? (
        <View style={styles.rarityMarker}>
          <Ionicons name="star" size={9} color="#D9911A" />
        </View>
      ) : null}
    </View>
  )
}

function InventoryDetailSheet({
  bottomInset,
  item,
  onClose,
}: {
  bottomInset: number
  item: InventorySummaryItem | null
  onClose: () => void
}) {
  return (
    <Modal transparent visible={item !== null} animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetLayer}>
        <TouchableOpacity activeOpacity={1} style={styles.sheetScrim} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: bottomInset + 16 }]}>
          <View style={styles.sheetHandle} />
          <TouchableOpacity style={styles.sheetCloseButton} onPress={onClose} accessibilityLabel="닫기">
            <Ionicons name="close" size={17} color="#69707D" />
          </TouchableOpacity>

          <View style={styles.sheetArt}>
            <RewardSpriteThumb prize={item ?? undefined} width={168} height={146} scale={0.78} compact />
          </View>

          <Text numberOfLines={1} ellipsizeMode="tail" style={styles.sheetName}>{item?.name}</Text>
          <Text numberOfLines={1} style={styles.sheetCategory}>{item?.category} · {rarityLabel(item?.rarity)}</Text>

          <View style={styles.sheetMetaGrid}>
            <SheetMeta label="보유 수량" value={`x${item?.count ?? 0}`} />
            <SheetMeta label="처음 획득" value={formatCollectionDate(item?.firstObtainedAt)} />
            <SheetMeta label="최근 획득" value={formatCollectionDate(item?.lastObtainedAt)} />
          </View>

          <TouchableOpacity activeOpacity={0.86} style={styles.sheetFutureButton}>
            <Ionicons name="sparkles-outline" size={16} color="#9A6A1E" />
            <Text style={styles.sheetFutureText}>즐겨찾기와 위치 이동은 곧 추가돼요</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

function SheetMeta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.sheetMetaCard}>
      <Text style={styles.sheetMetaLabel}>{label}</Text>
      <Text numberOfLines={1} style={styles.sheetMetaValue}>{value}</Text>
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
    minHeight: 42,
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
  headerTitle: {
    color: '#101319',
    flex: 1,
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 33,
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
  collectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 18,
  },
  collectionTitle: {
    color: '#101319',
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 22,
  },
  collectionCount: {
    color: '#9A6A1E',
    fontSize: 13,
    fontWeight: '900',
  },
  emptyText: {
    color: '#8A8F98',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 6,
  },
  filterHint: {
    color: '#8A8F98',
    fontSize: 12,
    fontWeight: '800',
    marginTop: 6,
  },
  cabinetWrap: {
    alignItems: 'center',
    marginHorizontal: -8,
    marginTop: 6,
  },
  cabinetStage: {
    position: 'relative',
  },
  cabinetImage: {
    ...StyleSheet.absoluteFillObject,
    height: '100%',
    width: '100%',
  },
  slotTouch: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
  },
  slotItemWrap: {
    alignItems: 'center',
    height: '100%',
    justifyContent: 'center',
    width: '100%',
  },
  slotItemDimmed: {
    opacity: 0.26,
  },
  emptySlotHint: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: 999,
    borderWidth: 1,
    height: 20,
    justifyContent: 'center',
    opacity: 0.35,
    width: 20,
  },
  emptySlotText: {
    color: '#C6A070',
    fontSize: 12,
    fontWeight: '900',
  },
  cabinetItem: {
    alignItems: 'center',
    height: '100%',
    justifyContent: 'center',
    position: 'relative',
    width: '100%',
  },
  cabinetItemHanging: {
    justifyContent: 'flex-start',
    paddingTop: 2,
  },
  cabinetItemStanding: {
    justifyContent: 'flex-end',
    paddingBottom: 2,
  },
  itemHook: {
    backgroundColor: '#CFAE84',
    borderRadius: 999,
    height: 11,
    marginBottom: -4,
    opacity: 0.6,
    width: 2,
  },
  contactShadow: {
    backgroundColor: 'rgba(113,73,30,0.14)',
    borderRadius: 999,
    bottom: 5,
    height: 6,
    position: 'absolute',
  },
  specialGlow: {
    backgroundColor: 'rgba(255,236,164,0.42)',
    borderRadius: 999,
    height: '72%',
    position: 'absolute',
    width: '72%',
  },
  countBadge: {
    backgroundColor: '#FFF0C4',
    borderColor: '#E4B35C',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    position: 'absolute',
    right: 3,
    top: 4,
  },
  countBadgeText: {
    color: '#8B5500',
    fontSize: 9,
    fontWeight: '900',
  },
  rarityMarker: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#F0D49E',
    borderRadius: 999,
    borderWidth: 1,
    height: 15,
    justifyContent: 'center',
    left: 3,
    position: 'absolute',
    top: 4,
    width: 15,
  },
  overflowNotice: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#FFF6E6',
    borderColor: '#F2D6A7',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  overflowNoticeText: {
    color: '#9A6A1E',
    fontSize: 12,
    fontWeight: '800',
  },
  sheetLayer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(16,19,25,0.3)',
  },
  sheet: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    gap: 8,
    paddingHorizontal: 22,
    paddingTop: 12,
  },
  sheetHandle: {
    backgroundColor: '#D8DCE2',
    borderRadius: 999,
    height: 4,
    marginBottom: 6,
    width: 42,
  },
  sheetCloseButton: {
    alignItems: 'center',
    backgroundColor: '#F1F1F3',
    borderRadius: 16,
    height: 32,
    justifyContent: 'center',
    position: 'absolute',
    right: 18,
    top: 18,
    width: 32,
  },
  sheetArt: {
    alignItems: 'center',
    backgroundColor: '#FAFAF8',
    borderColor: '#EFE6D8',
    borderRadius: 22,
    borderWidth: 1,
    height: 150,
    justifyContent: 'center',
    marginTop: 14,
    width: 180,
  },
  sheetName: {
    color: '#101319',
    fontSize: 21,
    fontWeight: '800',
    lineHeight: 27,
    maxWidth: '100%',
  },
  sheetCategory: {
    color: '#8A8F98',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 17,
  },
  sheetMetaGrid: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    width: '100%',
  },
  sheetMetaCard: {
    backgroundColor: '#F6F7F9',
    borderRadius: 16,
    flex: 1,
    gap: 3,
    minHeight: 54,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  sheetMetaLabel: {
    color: designHarness.colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
  },
  sheetMetaValue: {
    color: '#101319',
    fontSize: 13,
    fontWeight: '900',
  },
  sheetFutureButton: {
    alignItems: 'center',
    backgroundColor: '#FFF6E6',
    borderColor: '#F2D6A7',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    marginTop: 8,
    minHeight: 44,
    paddingHorizontal: 14,
  },
  sheetFutureText: {
    color: '#9A6A1E',
    flex: 1,
    fontSize: 13,
    fontWeight: '800',
  },
})
