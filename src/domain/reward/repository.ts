import { and, asc, desc, eq, gte, lt } from 'drizzle-orm'
import { randomUUID } from 'expo-crypto'
import {
  CHECK_REWARD_BY_SOURCE,
  CRANE_PLAY_COST,
  CRANE_PRIZE_SEEDS,
  DAILY_COMPLETE_BONUS_JELLY,
  ON_TIME_BONUS_JELLY,
  STATE_REWARD_DAILY_LIMIT,
  STATE_REWARD_JELLY,
  STREAK_BONUSES,
  type InventoryCategory,
} from '@/constants/rewards'
import { db } from '@/db/client'
import {
  cranePlays,
  cranePrizes,
  doseRecords,
  inventoryItems,
  rewardTransactions,
  streakState,
  timeSlotStreaks,
  wallet,
} from '@/db/schema'
import { getSettings } from '@/domain/settings/repository'
import { getLocalDateKey, toLocalISOString } from '@/utils/dateUtils'

type WalletRow = typeof wallet.$inferSelect
type RewardTransactionRow = typeof rewardTransactions.$inferSelect
type PrizeRow = typeof cranePrizes.$inferSelect
export type CranePrize = PrizeRow
export type CompletionSource = keyof typeof CHECK_REWARD_BY_SOURCE

export type InventorySummaryItem = PrizeRow & {
  count: number
}

type AwardInput = {
  amount: number
  kind: 'check_complete' | 'state_log' | 'streak_bonus' | 'on_time_bonus' | 'daily_complete'
  referenceId?: string
  label: string
  isDevMode?: boolean
}

function monthBounds(year: number, month: number) {
  const pad = (value: number) => String(value).padStart(2, '0')
  const start = `${year}-${pad(month)}-01`
  const next = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${pad(month + 1)}-01`

  return { start, next }
}

async function ensureWalletRow() {
  const existing = await db.select().from(wallet).where(eq(wallet.id, 1)).get()
  if (existing) return existing

  const now = toLocalISOString(new Date())
  await db.insert(wallet).values({
    id: 1,
    balance: 0,
    todayEarned: 0,
    totalEarned: 0,
    lastEarnedDate: '',
    dailyStateRewardCount: 0,
    updatedAt: now,
  })

  return db.select().from(wallet).where(eq(wallet.id, 1)).get()
}

async function normalizeWalletDay() {
  const existing = await ensureWalletRow()
  if (!existing) {
    throw new Error('Wallet row was not created')
  }

  const today = getLocalDateKey()
  if (existing.lastEarnedDate === today) {
    return existing
  }

  const updatedAt = toLocalISOString(new Date())
  await db.update(wallet)
    .set({
      todayEarned: 0,
      dailyStateRewardCount: 0,
      lastEarnedDate: today,
      updatedAt,
    })
    .where(eq(wallet.id, 1))

  return {
    ...existing,
    todayEarned: 0,
    dailyStateRewardCount: 0,
    lastEarnedDate: today,
    updatedAt,
  }
}

async function findRewardTransactionByReference(referenceId?: string) {
  if (!referenceId) return null

  return db.select().from(rewardTransactions)
    .where(eq(rewardTransactions.referenceId, referenceId))
    .get()
}

async function recordRewardTransaction(input: AwardInput) {
  const existing = await findRewardTransactionByReference(input.referenceId)
  if (existing) {
    return { awarded: false, transaction: existing }
  }

  const walletRow = await normalizeWalletDay()
  const now = toLocalISOString(new Date())
  const dayKey = getLocalDateKey()
  const transactionId = randomUUID()

  await db.insert(rewardTransactions).values({
    id: transactionId,
    dayKey,
    amount: input.amount,
    kind: input.kind,
    label: input.label,
    referenceId: input.referenceId ?? null,
    isDevMode: input.isDevMode ? 1 : 0,
    createdAt: now,
  })

  await db.update(wallet)
    .set({
      balance: walletRow.balance + input.amount,
      todayEarned: walletRow.todayEarned + input.amount,
      totalEarned: walletRow.totalEarned + input.amount,
      lastEarnedDate: dayKey,
      dailyStateRewardCount: input.kind === 'state_log'
        ? walletRow.dailyStateRewardCount + 1
        : walletRow.dailyStateRewardCount,
      updatedAt: now,
    })
    .where(eq(wallet.id, 1))

  return {
    awarded: true,
    transaction: await db.select().from(rewardTransactions).where(eq(rewardTransactions.id, transactionId)).get(),
  }
}

export async function getWalletSummary() {
  return normalizeWalletDay()
}

export async function getRewardTransactionsByDay(dayKey: string) {
  return db.select().from(rewardTransactions)
    .where(eq(rewardTransactions.dayKey, dayKey))
    .orderBy(desc(rewardTransactions.createdAt))
}

export async function getRewardTransactionsByMonth(year: number, month: number) {
  const { start, next } = monthBounds(year, month)
  return db.select().from(rewardTransactions)
    .where(and(gte(rewardTransactions.dayKey, start), lt(rewardTransactions.dayKey, next)))
    .orderBy(desc(rewardTransactions.createdAt))
}

export async function getRecentRewardTransactions(limit = 12) {
  const rows = await db.select().from(rewardTransactions)
    .orderBy(desc(rewardTransactions.createdAt))

  return rows.filter(row => row.amount > 0).slice(0, limit)
}

function isCompletedStatus(status: string) {
  return status === 'completed' || status === 'frozen'
}

function isOnTimeCompletion(scheduledTime: string, completedAt: string, verificationWindowMin: number) {
  const scheduledAt = new Date(scheduledTime).getTime()
  const completedAtMs = new Date(completedAt).getTime()
  return completedAtMs <= scheduledAt + verificationWindowMin * 60 * 1000
}

async function grantInventoryPrize(prizeId: string, acquiredAt = toLocalISOString(new Date())) {
  await ensureDefaultCranePrizes()

  const existingInventory = await db.select().from(inventoryItems)
    .where(eq(inventoryItems.prizeId, prizeId))
    .get()

  if (existingInventory) {
    await db.update(inventoryItems)
      .set({
        quantity: existingInventory.quantity + 1,
        lastAcquiredAt: acquiredAt,
      })
      .where(eq(inventoryItems.id, existingInventory.id))
    return
  }

  await db.insert(inventoryItems).values({
    id: randomUUID(),
    prizeId,
    quantity: 1,
    lastAcquiredAt: acquiredAt,
    createdAt: acquiredAt,
  })
}

async function hasCompletedAllChecksForDay(dayKey: string) {
  const records = await db.select().from(doseRecords).where(eq(doseRecords.dayKey, dayKey))
  if (records.length === 0) return false
  return records.every(record => isCompletedStatus(record.status))
}

export async function awardCheckCompletionReward(referenceId: string, source: CompletionSource) {
  return recordRewardTransaction({
    amount: CHECK_REWARD_BY_SOURCE[source],
    kind: 'check_complete',
    referenceId: `check:${referenceId}`,
    label: source === 'scan' ? '스캔 완료' : '직접 완료',
  })
}

export async function awardOnTimeBonus(referenceId: string, scheduledTime: string, completedAt: string, verificationWindowMin: number) {
  if (!isOnTimeCompletion(scheduledTime, completedAt, verificationWindowMin)) {
    return { awarded: false, transaction: null }
  }

  return recordRewardTransaction({
    amount: ON_TIME_BONUS_JELLY,
    kind: 'on_time_bonus',
    referenceId: `on-time:${referenceId}`,
    label: '정시 완료',
  })
}

export async function awardDailyCompletionBonus(dayKey: string) {
  const completedAll = await hasCompletedAllChecksForDay(dayKey)
  if (!completedAll) {
    return { awarded: false, transaction: null }
  }

  return recordRewardTransaction({
    amount: DAILY_COMPLETE_BONUS_JELLY,
    kind: 'daily_complete',
    referenceId: `daily-complete:${dayKey}`,
    label: '오늘 모두 완료',
  })
}

export async function awardStateLogReward(referenceId: string) {
  const walletRow = await normalizeWalletDay()
  if (walletRow.dailyStateRewardCount >= STATE_REWARD_DAILY_LIMIT) {
    return { awarded: false, transaction: null }
  }

  return recordRewardTransaction({
    amount: STATE_REWARD_JELLY,
    kind: 'state_log',
    referenceId,
    label: '상태 기록',
  })
}

export async function awardStreakBonusIfEligible(currentStreak: number) {
  const amount = STREAK_BONUSES[currentStreak as keyof typeof STREAK_BONUSES]
  if (!amount) {
    return { awarded: false, transaction: null }
  }

  const referenceId = `streak:${getLocalDateKey()}:${currentStreak}`
  const result = await recordRewardTransaction({
    amount,
    kind: 'streak_bonus',
    referenceId,
    label: `${currentStreak}일 연속`,
  })

  if (result.awarded && currentStreak === 30) {
    await grantInventoryPrize('special_ticket')
    return { ...result, specialTicketGranted: true }
  }

  return { ...result, specialTicketGranted: false }
}

export async function ensureDefaultCranePrizes() {
  const existing = await db.select().from(cranePrizes)
  const existingIds = new Set(existing.map(prize => prize.id))
  const now = toLocalISOString(new Date())

  const missing = CRANE_PRIZE_SEEDS.filter(prize => !existingIds.has(prize.id))
  if (missing.length === 0) return

  await db.insert(cranePrizes).values(missing.map(prize => ({
    ...prize,
    isActive: 1,
    createdAt: now,
  })))
}

export async function getCranePrizes() {
  await ensureDefaultCranePrizes()
  return db.select().from(cranePrizes)
    .where(eq(cranePrizes.isActive, 1))
    .orderBy(asc(cranePrizes.sortOrder))
}

function drawPrize(prizes: PrizeRow[]) {
  const totalWeight = prizes.reduce((sum, prize) => sum + prize.weight, 0)
  if (totalWeight <= 0) return prizes[0]

  const random = Math.floor(Math.random() * totalWeight) + 1

  let current = 0
  for (const prize of prizes) {
    current += prize.weight
    if (random <= current) return prize
  }

  return prizes[0]
}

export async function startCranePlay() {
  const walletRow = await normalizeWalletDay()
  const settings = await getSettings()
  const isDevMode = settings.devMode === 1
  const cost = isDevMode ? 0 : CRANE_PLAY_COST

  if (!isDevMode && walletRow.balance < CRANE_PLAY_COST) {
    throw new Error('젤리가 부족합니다')
  }

  const now = toLocalISOString(new Date())
  const transactionId = isDevMode ? null : randomUUID()
  const playId = randomUUID()

  if (!isDevMode && transactionId) {
    await db.insert(rewardTransactions).values({
      id: transactionId,
      dayKey: getLocalDateKey(),
      amount: -cost,
      kind: 'crane_play',
      label: '크레인',
      referenceId: playId,
      isDevMode: 0,
      createdAt: now,
    })

    await db.update(wallet)
      .set({
        balance: walletRow.balance - CRANE_PLAY_COST,
        lastEarnedDate: getLocalDateKey(),
        updatedAt: now,
      })
      .where(eq(wallet.id, 1))
  }

  await db.insert(cranePlays).values({
    id: playId,
    prizeId: null,
    cost,
    rewardTransactionId: transactionId,
    isDevMode: isDevMode ? 1 : 0,
    createdAt: now,
  })

  return {
    playId,
    walletBalance: isDevMode ? walletRow.balance : walletRow.balance - CRANE_PLAY_COST,
    isDevMode,
    cost,
  }
}

export async function completeCranePlay(playId: string, prizeId: string) {
  await ensureDefaultCranePrizes()

  const play = await db.select().from(cranePlays).where(eq(cranePlays.id, playId)).get()
  if (!play) {
    throw new Error('크레인 기록을 찾을 수 없습니다')
  }

  const prize = await db.select().from(cranePrizes).where(eq(cranePrizes.id, play.prizeId ?? prizeId)).get()
  if (!prize || prize.isActive !== 1) {
    throw new Error('보상 정보가 없습니다')
  }

  if (play.prizeId) {
    return { playId, prize, awarded: false }
  }

  const now = toLocalISOString(new Date())
  await db.update(cranePlays)
    .set({ prizeId })
    .where(eq(cranePlays.id, playId))

  await grantInventoryPrize(prizeId, now)

  return { playId, prize, awarded: true }
}

export async function playCraneGame() {
  const start = await startCranePlay()
  const prizes = await getCranePrizes()
  if (prizes.length === 0) {
    throw new Error('보상 정보가 없습니다')
  }

  const prize = drawPrize(prizes)
  await completeCranePlay(start.playId, prize.id)

  return {
    ...start,
    prize,
  }
}

export async function getInventorySummary(category: InventoryCategory = '전체') {
  await ensureDefaultCranePrizes()
  const prizes = await db.select().from(cranePrizes).orderBy(asc(cranePrizes.sortOrder))
  const inventory = await db.select().from(inventoryItems)

  const inventoryByPrize = new Map(inventory.map(item => [item.prizeId, item]))
  return prizes
    .filter(prize => prize.isActive === 1)
    .filter(prize => category === '전체' || prize.category === category)
    .map(prize => ({
      ...prize,
      count: inventoryByPrize.get(prize.id)?.quantity ?? 0,
    }))
    .filter(item => category === '전체' ? item.count > 0 : true)
}

export async function getRecentCranePlays(limit = 8) {
  await ensureDefaultCranePrizes()
  const plays = await db.select().from(cranePlays).orderBy(desc(cranePlays.createdAt))
  const prizes = await db.select().from(cranePrizes)

  const prizeMap = new Map(prizes.map(prize => [prize.id, prize]))
  return plays.slice(0, limit).map(play => ({
    ...play,
    prize: play.prizeId ? prizeMap.get(play.prizeId) ?? null : null,
  }))
}

export async function syncStreakState() {
  const streaks = await db.select().from(timeSlotStreaks)
  const settings = await getSettings()

  const currentStreak = streaks.reduce((max, item) => Math.max(max, item.currentStreak), 0)
  const longestStreak = streaks.reduce((max, item) => Math.max(max, item.longestStreak), 0)
  const lastCheckDate = streaks.reduce((latest, item) => item.lastCompletedDate > latest ? item.lastCompletedDate : latest, '')
  const updatedAt = toLocalISOString(new Date())

  const existing = await db.select().from(streakState).where(eq(streakState.id, 1)).get()
  if (existing) {
    await db.update(streakState)
      .set({
        currentStreak,
        longestStreak,
        lastCheckDate,
        freezeCount: settings.freezesRemaining,
        updatedAt,
      })
      .where(eq(streakState.id, 1))
  } else {
    await db.insert(streakState).values({
      id: 1,
      currentStreak,
      longestStreak,
      lastCheckDate,
      freezeCount: settings.freezesRemaining,
      updatedAt,
    })
  }

  return db.select().from(streakState).where(eq(streakState.id, 1)).get()
}