import { CRANE_REWARD_ASSETS } from '@/components/shop/craneAssetManifest.generated'
import type { InventoryCategory } from '@/constants/rewards'

export type CraneRewardSourceType = 'normal' | 'day'
export type CraneRewardRarity = 'common' | 'rare' | 'special'
export type CraneRewardAssetKey = keyof typeof CRANE_REWARD_ASSETS
export type CraneRewardCategory = Exclude<InventoryCategory, '전체'>

export type CraneRewardCatalogItem = {
  id: string
  name: string
  category: CraneRewardCategory
  rarity: CraneRewardRarity
  emoji: string
  weight: number
  sortOrder: number
  assetKey: CraneRewardAssetKey
  sourceType: CraneRewardSourceType
  sourceFolder: 'items' | 'items_day'
  sourceFileName: string
  isPoolEligible?: boolean
  renderScale?: number
  hitboxScale?: number
  gripBias?: number
  slipBias?: number
  jellyValue?: number
}

export type CranePrizeSeed = Pick<
  CraneRewardCatalogItem,
  'id' | 'name' | 'category' | 'rarity' | 'emoji' | 'weight' | 'sortOrder'
>

export const CRANE_VISIBLE_POOL_SIZE = 6

export const CRANE_REWARD_CATALOG: CraneRewardCatalogItem[] = [
  {
    id: 'keyring_white',
    name: '하트 민트 키링',
    category: '키링',
    rarity: 'common',
    emoji: '💚',
    weight: 12,
    sortOrder: 0,
    assetKey: 'heartKeyring',
    sourceType: 'normal',
    sourceFolder: 'items',
    sourceFileName: 'heart_keyring.png',
    renderScale: 1.02,
  },
  {
    id: 'squishy_basic',
    name: '버블 말랑이',
    category: '말랑이',
    rarity: 'common',
    emoji: '🫧',
    weight: 11,
    sortOrder: 1,
    assetKey: 'bubbleMarlang',
    sourceType: 'normal',
    sourceFolder: 'items',
    sourceFileName: 'bubble_marlang.png',
    renderScale: 1.04,
    hitboxScale: 0.82,
    gripBias: -0.04,
  },
  {
    id: 'sticker_star',
    name: '스타 카드 스티커',
    category: '스티커',
    rarity: 'common',
    emoji: '⭐',
    weight: 8,
    sortOrder: 2,
    assetKey: 'starmarlang',
    sourceType: 'normal',
    sourceFolder: 'items',
    sourceFileName: 'starmarlang.png',
    renderScale: 0.98,
    hitboxScale: 0.7,
    gripBias: 0.08,
  },
  {
    id: 'keycap_orange',
    name: '파스텔 키캡',
    category: '키캡',
    rarity: 'rare',
    emoji: '⌨️',
    weight: 7,
    sortOrder: 3,
    assetKey: 'keyboardMalrang',
    sourceType: 'normal',
    sourceFolder: 'items',
    sourceFileName: 'keyboard_malrang.png',
    renderScale: 0.98,
    hitboxScale: 0.74,
  },
  {
    id: 'keyring_cat',
    name: '캣 말랑 키링',
    category: '키링',
    rarity: 'rare',
    emoji: '🐱',
    weight: 8,
    sortOrder: 4,
    assetKey: 'catmarlang',
    sourceType: 'normal',
    sourceFolder: 'items',
    sourceFileName: 'catmarlang.png',
    renderScale: 1.02,
  },
  {
    id: 'badge_sun',
    name: '구름 해 배지',
    category: '배지',
    rarity: 'rare',
    emoji: '⛅',
    weight: 6,
    sortOrder: 5,
    assetKey: 'cloudSun',
    sourceType: 'normal',
    sourceFolder: 'items',
    sourceFileName: 'cloud_sun.png',
    renderScale: 1.02,
    hitboxScale: 0.76,
  },
  {
    id: 'theme_morning',
    name: '데이 메달',
    category: '테마',
    rarity: 'special',
    emoji: '🏅',
    weight: 2,
    sortOrder: 6,
    assetKey: 'day10',
    sourceType: 'normal',
    sourceFolder: 'items',
    sourceFileName: 'day10.png',
    renderScale: 0.94,
    hitboxScale: 0.7,
    gripBias: 0.06,
    slipBias: 0.08,
    jellyValue: 15,
  },
  {
    id: 'squishy_special',
    name: '굿나잇 쿠션',
    category: '말랑이',
    rarity: 'special',
    emoji: '🌙',
    weight: 3,
    sortOrder: 7,
    assetKey: 'day7',
    sourceType: 'day',
    sourceFolder: 'items_day',
    sourceFileName: 'day7.png',
    renderScale: 1.02,
    hitboxScale: 0.8,
    gripBias: -0.02,
    slipBias: -0.03,
    jellyValue: 14,
  },
  {
    id: 'special_ticket',
    name: '스페셜 티켓',
    category: '테마',
    rarity: 'special',
    emoji: '🎟️',
    weight: 0,
    sortOrder: 8,
    assetKey: 'day10',
    sourceType: 'normal',
    sourceFolder: 'items',
    sourceFileName: 'day10.png',
    isPoolEligible: false,
    renderScale: 0.9,
  },
  {
    id: 'day_pill_mallang',
    name: '복약 말랑 참',
    category: '키링',
    rarity: 'rare',
    emoji: '💊',
    weight: 5,
    sortOrder: 9,
    assetKey: 'day1',
    sourceType: 'day',
    sourceFolder: 'items_day',
    sourceFileName: 'day1.png',
    renderScale: 0.94,
    hitboxScale: 0.72,
  },
  {
    id: 'day_calendar_charm',
    name: '데이 캘린더',
    category: '키링',
    rarity: 'rare',
    emoji: '📅',
    weight: 5,
    sortOrder: 10,
    assetKey: 'day2',
    sourceType: 'day',
    sourceFolder: 'items_day',
    sourceFileName: 'day2.png',
    renderScale: 0.96,
    hitboxScale: 0.76,
  },
  {
    id: 'day_backpack_charm',
    name: '데이 백팩',
    category: '키링',
    rarity: 'rare',
    emoji: '🎒',
    weight: 4,
    sortOrder: 11,
    assetKey: 'day3',
    sourceType: 'day',
    sourceFolder: 'items_day',
    sourceFileName: 'day3.png',
    renderScale: 0.98,
    hitboxScale: 0.76,
  },
  {
    id: 'day_pill_case',
    name: '알약 트레이',
    category: '테마',
    rarity: 'special',
    emoji: '🧰',
    weight: 4,
    sortOrder: 12,
    assetKey: 'day4',
    sourceType: 'day',
    sourceFolder: 'items_day',
    sourceFileName: 'day4.png',
    renderScale: 0.92,
    hitboxScale: 0.72,
    gripBias: 0.05,
  },
  {
    id: 'day_mug_charm',
    name: '데이 머그 키링',
    category: '키링',
    rarity: 'rare',
    emoji: '☕',
    weight: 5,
    sortOrder: 13,
    assetKey: 'day5',
    sourceType: 'day',
    sourceFolder: 'items_day',
    sourceFileName: 'day5.png',
    renderScale: 0.96,
  },
  {
    id: 'day_cloud_friends',
    name: '해님 구름 친구',
    category: '배지',
    rarity: 'special',
    emoji: '🌤️',
    weight: 4,
    sortOrder: 14,
    assetKey: 'day6',
    sourceType: 'day',
    sourceFolder: 'items_day',
    sourceFileName: 'day6.png',
    renderScale: 0.98,
    hitboxScale: 0.76,
    jellyValue: 12,
  },
  {
    id: 'day_check_board',
    name: '체크 보드',
    category: '테마',
    rarity: 'special',
    emoji: '✅',
    weight: 3,
    sortOrder: 15,
    assetKey: 'day8',
    sourceType: 'day',
    sourceFolder: 'items_day',
    sourceFileName: 'day8.png',
    renderScale: 0.92,
    hitboxScale: 0.7,
    gripBias: 0.07,
  },
  {
    id: 'day_thermometer',
    name: '데이 체온계',
    category: '키링',
    rarity: 'special',
    emoji: '🌡️',
    weight: 3,
    sortOrder: 16,
    assetKey: 'day9',
    sourceType: 'day',
    sourceFolder: 'items_day',
    sourceFileName: 'day9.png',
    renderScale: 0.88,
    hitboxScale: 0.62,
    gripBias: 0.08,
    slipBias: 0.06,
  },
  {
    id: 'pill_jar_charm',
    name: '알약 병 키링',
    category: '키링',
    rarity: 'rare',
    emoji: '🫙',
    weight: 8,
    sortOrder: 17,
    assetKey: 'item11',
    sourceType: 'normal',
    sourceFolder: 'items',
    sourceFileName: 'item11.png',
    renderScale: 0.98,
    hitboxScale: 0.74,
  },
  {
    id: 'capsule_charm',
    name: '핑크 캡슐',
    category: '키링',
    rarity: 'rare',
    emoji: '💊',
    weight: 8,
    sortOrder: 18,
    assetKey: 'item12',
    sourceType: 'normal',
    sourceFolder: 'items',
    sourceFileName: 'item12.png',
    renderScale: 0.96,
    hitboxScale: 0.72,
  },
  {
    id: 'rainbow_keypad_charm',
    name: '레인보우 키패드',
    category: '키캡',
    rarity: 'rare',
    emoji: '🧩',
    weight: 7,
    sortOrder: 19,
    assetKey: 'item13',
    sourceType: 'normal',
    sourceFolder: 'items',
    sourceFileName: 'item13.png',
    renderScale: 0.94,
    hitboxScale: 0.72,
    gripBias: 0.03,
  },
  {
    id: 'alarm_clock_charm',
    name: '데이 알람 시계',
    category: '테마',
    rarity: 'rare',
    emoji: '⏰',
    weight: 6,
    sortOrder: 20,
    assetKey: 'item14',
    sourceType: 'normal',
    sourceFolder: 'items',
    sourceFileName: 'item14.png',
    renderScale: 0.98,
    hitboxScale: 0.76,
  },
  {
    id: 'shaker_bottle_charm',
    name: '스카이 셰이커',
    category: '키링',
    rarity: 'rare',
    emoji: '🍼',
    weight: 8,
    sortOrder: 21,
    assetKey: 'item15',
    sourceType: 'normal',
    sourceFolder: 'items',
    sourceFileName: 'item15.png',
    renderScale: 0.98,
  },
  {
    id: 'moon_capsule_charm',
    name: '문 캡슐 참',
    category: '배지',
    rarity: 'special',
    emoji: '🌙',
    weight: 6,
    sortOrder: 22,
    assetKey: 'item16',
    sourceType: 'normal',
    sourceFolder: 'items',
    sourceFileName: 'item16.png',
    renderScale: 1.02,
    hitboxScale: 0.78,
    jellyValue: 11,
  },
  {
    id: 'sunshine_capsule_badge',
    name: '선샤인 캡슐',
    category: '배지',
    rarity: 'special',
    emoji: '🌞',
    weight: 5,
    sortOrder: 23,
    assetKey: 'item17',
    sourceType: 'normal',
    sourceFolder: 'items',
    sourceFileName: 'item17.png',
    renderScale: 1.02,
    hitboxScale: 0.78,
    jellyValue: 12,
  },
  {
    id: 'heart_bandage_charm',
    name: '하트 밴드 참',
    category: '키링',
    rarity: 'rare',
    emoji: '💗',
    weight: 6,
    sortOrder: 24,
    assetKey: 'item18',
    sourceType: 'normal',
    sourceFolder: 'items',
    sourceFileName: 'item18.png',
    renderScale: 0.98,
  },
  {
    id: 'gummy_cross_squishy',
    name: '젤리 플러스',
    category: '말랑이',
    rarity: 'special',
    emoji: '➕',
    weight: 5,
    sortOrder: 25,
    assetKey: 'item19',
    sourceType: 'normal',
    sourceFolder: 'items',
    sourceFileName: 'item19.png',
    renderScale: 1.04,
    hitboxScale: 0.82,
    gripBias: -0.03,
    jellyValue: 10,
  },
  {
    id: 'nurse_cap_charm',
    name: '너스 캡 참',
    category: '테마',
    rarity: 'rare',
    emoji: '🧢',
    weight: 6,
    sortOrder: 26,
    assetKey: 'item20',
    sourceType: 'normal',
    sourceFolder: 'items',
    sourceFileName: 'item20.png',
    renderScale: 0.96,
    hitboxScale: 0.74,
  },
] as const

export const CRANE_REWARD_CATALOG_BY_ID = new Map(
  CRANE_REWARD_CATALOG.map(item => [item.id, item]),
)

export const CRANE_REWARD_SEEDS: CranePrizeSeed[] = CRANE_REWARD_CATALOG.map(item => ({
  id: item.id,
  name: item.name,
  category: item.category,
  rarity: item.rarity,
  emoji: item.emoji,
  weight: item.weight,
  sortOrder: item.sortOrder,
}))

export function getCraneRewardCatalogItem(id: string) {
  return CRANE_REWARD_CATALOG_BY_ID.get(id) ?? null
}

export function getPoolEligibleCraneRewards(rewards: readonly CraneRewardCatalogItem[]) {
  return rewards.filter(reward => reward.isPoolEligible !== false)
}

export function makeCraneSeed() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function seededCraneRandom(seed: string) {
  let hash = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return () => {
    hash += hash << 13
    hash ^= hash >>> 7
    hash += hash << 3
    hash ^= hash >>> 17
    hash += hash << 5
    return ((hash >>> 0) % 10000) / 10000
  }
}

function drawWeightedIndex(items: readonly CraneRewardCatalogItem[], random: () => number) {
  const totalWeight = items.reduce((sum, item) => sum + Math.max(item.weight, 1), 0)
  let cursor = random() * totalWeight

  for (let index = 0; index < items.length; index += 1) {
    cursor -= Math.max(items[index]?.weight ?? 1, 1)
    if (cursor <= 0) return index
  }

  return 0
}

export function pickVisibleCraneRewardIds({
  rewards,
  count = CRANE_VISIBLE_POOL_SIZE,
  seed = makeCraneSeed(),
  excludeIds = [],
}: {
  rewards: readonly CraneRewardCatalogItem[]
  count?: number
  seed?: string
  excludeIds?: readonly string[]
}) {
  const random = seededCraneRandom(seed)
  const excluded = new Set(excludeIds)
  const eligible = getPoolEligibleCraneRewards(rewards).filter(item => !excluded.has(item.id))
  const bucket = [...eligible]
  const selection: string[] = []

  while (selection.length < count && bucket.length > 0) {
    const pickedIndex = drawWeightedIndex(bucket, random)
    const [picked] = bucket.splice(pickedIndex, 1)
    if (picked) selection.push(picked.id)
  }

  if (selection.length >= count) return selection

  const fallback = getPoolEligibleCraneRewards(rewards)
    .filter(item => !selection.includes(item.id))
    .map(item => item.id)

  for (const id of fallback) {
    if (selection.length >= count) break
    selection.push(id)
  }

  return selection.slice(0, count)
}

export function normalizeVisibleCraneRewardIds(
  rewards: readonly CraneRewardCatalogItem[],
  rawIds: readonly string[],
) {
  const validIds = new Set(getPoolEligibleCraneRewards(rewards).map(item => item.id))
  const unique: string[] = []

  for (const id of rawIds) {
    if (!validIds.has(id) || unique.includes(id)) continue
    unique.push(id)
  }

  return unique
}

export function replaceVisibleCraneRewardId({
  rewards,
  currentIds,
  replaceId,
  seed = makeCraneSeed(),
}: {
  rewards: readonly CraneRewardCatalogItem[]
  currentIds: readonly string[]
  replaceId: string
  seed?: string
}) {
  const replaceIndex = currentIds.indexOf(replaceId)
  if (replaceIndex < 0) return [...currentIds]

  const nextIds = [...currentIds]
  const excluded = nextIds.filter(id => id !== replaceId)
  const [replacementId] = pickVisibleCraneRewardIds({
    rewards,
    count: 1,
    seed,
    excludeIds: excluded,
  })

  if (!replacementId) {
    return nextIds.filter(id => id !== replaceId)
  }

  nextIds[replaceIndex] = replacementId
  return nextIds
}