import type { CranePrize } from '@/domain/reward/repository'
import { CRANE_REWARD_ASSETS } from '@/components/shop/craneAssetManifest.generated'

export type CraneRarity = 'common' | 'rare' | 'special'
export type PrizeObjectCategory = 'keyring' | 'keycap' | 'squishy' | 'sticker' | 'badge' | 'theme'
export type PrizeObjectShape = 'badge' | 'sticker' | 'blob' | 'ticket' | 'keycap' | 'charm'
export type CraneRewardAssetKey = keyof typeof CRANE_REWARD_ASSETS

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
  hitboxWidth: number
  hitboxHeight: number
  rotation: number
  weight: number
  gripDifficulty: number
  slipChance: number
  shape: PrizeObjectShape
  color: string
  icon: string
  assetKey: CraneRewardAssetKey
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

const CATEGORY_ASSET_FALLBACKS: Record<PrizeObjectCategory, CraneRewardAssetKey> = {
  keyring: 'heartKeyring',
  keycap: 'keyboardMalrang',
  squishy: 'bubbleMarlang',
  sticker: 'starPulse',
  badge: 'cloudSun',
  theme: 'cloudSun',
}

function hasRewardAsset(key: string): key is CraneRewardAssetKey {
  return key in CRANE_REWARD_ASSETS
}

export function resolvePrizeAssetKey(prize: CranePrize, category = normalizePrizeCategory(prize.category)): CraneRewardAssetKey {
  const id = prize.id.toLowerCase()
  const name = prize.name.toLowerCase()
  const text = `${id} ${name} ${prize.category.toLowerCase()}`

  const candidates: CraneRewardAssetKey[] = []

  if (id.includes('keyring_white') || text.includes('하얀')) candidates.push('heartKeyring')
  if (id.includes('keyring_cat')) candidates.push('catmarlang')
  if (id.includes('badge_sun') || text.includes('sun') || text.includes('선샤인')) candidates.push('cloudSun')
  if (id.includes('sticker_star')) candidates.push('starmarlang')
  if (id.includes('theme_morning') || text.includes('morning') || text.includes('모닝')) candidates.push('cloudSun')
  if (id.includes('squishy_special')) candidates.push('bubbleMarlang')
  if (text.includes('bubble')) candidates.push('bubbleMarlang')
  if (text.includes('cat') || text.includes('고양')) candidates.push('catmarlang')
  if (text.includes('cloud') || text.includes('sun') || text.includes('구름')) candidates.push('cloudSun')
  if (text.includes('heart') || text.includes('하트')) candidates.push('heartKeyring')
  if (text.includes('keyboard') || text.includes('keycap') || text.includes('키캡') || text.includes('키보드')) candidates.push('keyboardMalrang')
  if (text.includes('pulse') || text.includes('sticker') || text.includes('스티커')) candidates.push('starPulse')
  if (text.includes('star') || text.includes('별')) candidates.push('starmarlang')

  candidates.push(CATEGORY_ASSET_FALLBACKS[category])

  const match = candidates.find(hasRewardAsset)
  if (match) return match

  const [firstKey] = Object.keys(CRANE_REWARD_ASSETS)
  return firstKey as CraneRewardAssetKey
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
  const sizeScale = 0.96 + randomValue * 0.08
  const color = profile.colors[Math.floor(randomValue * profile.colors.length) % profile.colors.length]
  const assetKey = resolvePrizeAssetKey(prize, category)
  const asset = CRANE_REWARD_ASSETS[assetKey]
  const displayWidth = asset?.displayWidth ?? profile.width
  const displayHeight = asset?.displayHeight ?? profile.height
  const hitboxWidth = asset?.hitboxWidth ?? displayWidth * 0.72
  const hitboxHeight = asset?.hitboxHeight ?? displayHeight * 0.72

  return {
    id,
    prize,
    prizeId: prize.id,
    name: prize.name,
    category,
    rarity,
    x,
    y,
    width: Math.round(displayWidth * sizeScale),
    height: Math.round(displayHeight * sizeScale),
    hitboxWidth: Math.round(hitboxWidth * sizeScale),
    hitboxHeight: Math.round(hitboxHeight * sizeScale),
    rotation,
    weight: profile.weight,
    gripDifficulty: profile.gripDifficulty,
    slipChance: profile.slipChance,
    shape: profile.shape,
    color,
    icon: prize.emoji ?? prize.name.slice(0, 1),
    assetKey,
    emoji: prize.emoji,
    visualScale: 1,
    opacity: 1,
  }
}
