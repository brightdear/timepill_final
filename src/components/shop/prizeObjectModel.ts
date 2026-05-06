import type { CranePrize } from '@/domain/reward/repository'

export type CraneRarity = 'common' | 'rare' | 'special'
export type PrizeObjectCategory = 'keyring' | 'keycap' | 'squishy' | 'sticker' | 'badge' | 'theme'
export type PrizeObjectShape = 'badge' | 'sticker' | 'blob' | 'ticket' | 'keycap' | 'charm'

export type PrizeObject = {
  id: string
  prize: CranePrize
  prizeId: string
  name: string
  category: PrizeObjectCategory
  rarity: CraneRarity
  x: number
  y: number
  width: number
  height: number
  rotation: number
  weight: number
  gripDifficulty: number
  slipChance: number
  shape: PrizeObjectShape
  color: string
  icon: string
  emoji?: string
  visualScale?: number
  opacity?: number
}

type PrizeProfile = {
  shape: PrizeObjectShape
  width: number
  height: number
  weight: number
  gripDifficulty: number
  slipChance: number
  colors: string[]
}

export const PRIZE_PROFILES: Record<PrizeObjectCategory, PrizeProfile> = {
  keyring: {
    shape: 'charm',
    width: 46,
    height: 54,
    weight: 0.45,
    gripDifficulty: 0.35,
    slipChance: 0.12,
    colors: ['#F8D7DA', '#D9F0E3', '#DDEBFF'],
  },
  keycap: {
    shape: 'keycap',
    width: 48,
    height: 44,
    weight: 0.55,
    gripDifficulty: 0.28,
    slipChance: 0.1,
    colors: ['#FFF1CA', '#E6DDFF', '#FFDCCE'],
  },
  squishy: {
    shape: 'blob',
    width: 58,
    height: 50,
    weight: 0.35,
    gripDifficulty: 0.2,
    slipChance: 0.18,
    colors: ['#CFE8D6', '#FFD9E3', '#CFE7FF'],
  },
  sticker: {
    shape: 'sticker',
    width: 56,
    height: 34,
    weight: 0.2,
    gripDifficulty: 0.6,
    slipChance: 0.28,
    colors: ['#FFFDF8', '#FDF1F5', '#EEF8FF'],
  },
  badge: {
    shape: 'badge',
    width: 48,
    height: 48,
    weight: 0.4,
    gripDifficulty: 0.38,
    slipChance: 0.2,
    colors: ['#F7D38A', '#D9F0E3', '#F8C8C8'],
  },
  theme: {
    shape: 'ticket',
    width: 54,
    height: 36,
    weight: 0.25,
    gripDifficulty: 0.55,
    slipChance: 0.24,
    colors: ['#DDEBFF', '#FFF2D8', '#E9E1FF'],
  },
}

export function normalizeRarity(value: string): CraneRarity {
  if (value === 'rare' || value === 'special') return value
  return 'common'
}

export function normalizePrizeCategory(value: string): PrizeObjectCategory {
  switch (value) {
    case '키링':
      return 'keyring'
    case '키캡':
      return 'keycap'
    case '말랑이':
      return 'squishy'
    case '스티커':
      return 'sticker'
    case '배지':
      return 'badge'
    case '테마':
      return 'theme'
    default:
      return 'squishy'
  }
}

export function rarityModifier(rarity: CraneRarity) {
  if (rarity === 'special') return 0.16
  if (rarity === 'rare') return 0.08
  return 0
}

export function createPrizeObject({
  prize,
  id,
  x,
  y,
  rotation,
  randomValue,
}: {
  prize: CranePrize
  id: string
  x: number
  y: number
  rotation: number
  randomValue: number
}): PrizeObject {
  const category = normalizePrizeCategory(prize.category)
  const profile = PRIZE_PROFILES[category]
  const rarity = normalizeRarity(prize.rarity)
  const sizeScale = 0.92 + randomValue * 0.18
  const color = profile.colors[Math.floor(randomValue * profile.colors.length) % profile.colors.length]

  return {
    id,
    prize,
    prizeId: prize.id,
    name: prize.name,
    category,
    rarity,
    x,
    y,
    width: Math.round(profile.width * sizeScale),
    height: Math.round(profile.height * sizeScale),
    rotation,
    weight: profile.weight,
    gripDifficulty: profile.gripDifficulty,
    slipChance: profile.slipChance,
    shape: profile.shape,
    color,
    icon: prize.emoji ?? prize.name.slice(0, 1),
    emoji: prize.emoji,
    visualScale: 1,
    opacity: 1,
  }
}
