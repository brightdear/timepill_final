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
export const CRANE_PLAY_COST = 3
export const CRANE_REROLL_COST = 5
export const SHOP_BASE_PRICE_JELLY = 10

export const INVENTORY_CATEGORIES = ['전체', '키링', '키캡', '말랑이', '스티커', '배지', '테마'] as const

export type InventoryCategory = (typeof INVENTORY_CATEGORIES)[number]