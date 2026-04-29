export const CHECK_REWARD_BY_SOURCE = {
  manual: 1,
  scan: 3,
} as const
export const ON_TIME_BONUS_JELLY = 1
export const DAILY_COMPLETE_BONUS_JELLY = 3
export const STATE_REWARD_JELLY = 1
export const STREAK_BONUSES = {
  3: 5,
  7: 15,
  15: 35,
  30: 80,
} as const
export const STATE_REWARD_DAILY_LIMIT = 2
export const CRANE_PLAY_COST = 10

export const INVENTORY_CATEGORIES = ['전체', '키링', '키캡', '말랑이', '스티커', '배지', '테마'] as const

export type InventoryCategory = (typeof INVENTORY_CATEGORIES)[number]

export type PrizeSeed = {
  id: string
  name: string
  category: Exclude<InventoryCategory, '전체'>
  rarity: 'common' | 'rare' | 'special'
  emoji: string
  weight: number
  sortOrder: number
}

export const CRANE_PRIZE_SEEDS: PrizeSeed[] = [
  { id: 'keyring_white', name: '하얀 키링', category: '키링', rarity: 'common', emoji: '🤍', weight: 24, sortOrder: 0 },
  { id: 'squishy_basic', name: '말랑이', category: '말랑이', rarity: 'common', emoji: '🫧', weight: 23, sortOrder: 1 },
  { id: 'sticker_star', name: '별 스티커', category: '스티커', rarity: 'common', emoji: '⭐', weight: 23, sortOrder: 2 },
  { id: 'keycap_orange', name: '오렌지 키캡', category: '키캡', rarity: 'rare', emoji: '⌨️', weight: 10, sortOrder: 3 },
  { id: 'keyring_cat', name: '고양이 키링', category: '키링', rarity: 'rare', emoji: '🐱', weight: 8, sortOrder: 4 },
  { id: 'badge_sun', name: '선샤인 배지', category: '배지', rarity: 'rare', emoji: '🟠', weight: 7, sortOrder: 5 },
  { id: 'theme_morning', name: '모닝 테마', category: '테마', rarity: 'special', emoji: '🌤️', weight: 3, sortOrder: 6 },
  { id: 'squishy_special', name: '스페셜 말랑이', category: '말랑이', rarity: 'special', emoji: '🍊', weight: 2, sortOrder: 7 },
  { id: 'special_ticket', name: '스페셜 티켓', category: '테마', rarity: 'special', emoji: '🎟️', weight: 0, sortOrder: 8 },
]