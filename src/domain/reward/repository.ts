import { and, asc, desc, eq, gte, lt } from 'drizzle-orm'
import { randomUUID } from 'expo-crypto'
import {
  CHECK_REWARD_BY_SOURCE,
  CRANE_PLAY_COST,
  CRANE_REROLL_COST,
  DAILY_COMPLETE_BONUS_JELLY,
  ON_TIME_BONUS_JELLY,
  STATE_REWARD_DAILY_LIMIT,
  STATE_REWARD_JELLY,
  STREAK_BONUSES,
  type InventoryCategory,
} from '@/constants/rewards'
import { db } from '@/db/client'
import {
  craneMachineState,
  cranePlays,
  cranePrizes,
  doseRecords,
  inventoryItems,
  rewardTransactions,
  streakState,
  timeSlotStreaks,
  wallet,
} from '@/db/schema'
import {
  CRANE_REWARD_CATALOG,
  CRANE_REWARD_SEEDS,
  CRANE_VISIBLE_POOL_SIZE,
  getCraneRewardCatalogItem,
  makeCraneSeed,
  normalizeVisibleCraneRewardIds,
  pickVisibleCraneRewardIds,
  replaceVisibleCraneRewardId,
} from '@/domain/reward/craneRewards'
import { getSettings } from '@/domain/settings/repository'
import { getLocalDateKey, toLocalISOString } from '@/utils/dateUtils'

type PrizeRow = typeof cranePrizes.$inferSelect
type CatalogReward = (typeof CRANE_REWARD_CATALOG)[number]
type CraneMachineStateRow = typeof craneMachineState.$inferSelect
type RewardDbExecutor = Pick<typeof db, 'select' | 'insert' | 'update'>

type PrizeRowBase = Omit<
  PrizeRow,
  'category' | 'rarity' | 'priceJelly' | 'sourceType' | 'assetCollection' | 'assetKey' | 'isPurchasable' | 'isCraneAvailable'
>

type CatalogRewardDetails = Pick<
  CatalogReward,
  | 'category'
  | 'rarity'
  | 'priceJelly'
  | 'sourceType'
  | 'assetCollection'
  | 'sourceFolder'
  | 'sourceFileName'
  | 'assetKey'
  | 'isPurchasable'
  | 'isCraneAvailable'
  | 'isPoolEligible'
  | 'renderScale'
  | 'hitboxScale'
  | 'gripBias'
  | 'slipBias'
  | 'jellyValue'
>

export type CranePrize = PrizeRowBase & CatalogRewardDetails
export type CompletionSource = keyof typeof CHECK_REWARD_BY_SOURCE

export type InventorySummaryItem = CranePrize & {
  count: number
}

export type CraneMachineSession = {
  visiblePrizeIds: string[]
  visiblePrizes: CranePrize[]
  poolSeed: string
  lastWonPrizeId: string | null
}

export type CraneRerollResult = CraneMachineSession & {
  walletBalance: number
  isDevMode: boolean
  cost: number
}

type AwardInput = {
  amount: number
  kind: 'check_complete' | 'state_log' | 'streak_bonus' | 'on_time_bonus' | 'daily_complete'
  referenceId?: string
  label: string
  isDevMode?: boolean
}

type SpendInput = {
  amount: number
  kind: 'crane_play' | 'crane_reroll' | 'shop_purchase'
  label: string
  referenceId: string
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

async function ensureWalletRow(database: RewardDbExecutor = db) {
  const existing = await database.select().from(wallet).where(eq(wallet.id, 1)).get()
  if (existing) return existing

  const now = toLocalISOString(new Date())
  await database.insert(wallet).values({
    id: 1,
    balance: 0,
    todayEarned: 0,
    totalEarned: 0,
    lastEarnedDate: '',
    dailyStateRewardCount: 0,
    updatedAt: now,
  })

  return database.select().from(wallet).where(eq(wallet.id, 1)).get()
}

async function normalizeWalletDay(database: RewardDbExecutor = db) {
  const existing = await ensureWalletRow(database)
  if (!existing) {
    throw new Error('Wallet row was not created')
  }

  const today = getLocalDateKey()
  if (existing.lastEarnedDate === today) {
    return existing
  }

  const updatedAt = toLocalISOString(new Date())
  await database.update(wallet)
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

function parseVisiblePrizeIds(value: string | null | undefined) {
  if (!value) return []

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

function serializeVisiblePrizeIds(value: readonly string[]) {
  return JSON.stringify(value)
}

function enrichPrizeRow(row: PrizeRow): CranePrize {
  const catalog = getCraneRewardCatalogItem(row.id) ?? CRANE_REWARD_CATALOG[0]

  return {
    id: row.id,
    name: row.name,
    category: row.category as CatalogReward['category'],
    rarity: row.rarity as CatalogReward['rarity'],
    emoji: row.emoji,
    weight: row.weight,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    createdAt: row.createdAt,
    priceJelly: catalog.priceJelly,
    sourceType: catalog.sourceType,
    assetCollection: catalog.assetCollection,
    sourceFolder: catalog.sourceFolder,
    sourceFileName: catalog.sourceFileName,
    assetKey: catalog.assetKey,
    isPurchasable: catalog.isPurchasable,
    isCraneAvailable: catalog.isCraneAvailable,
    isPoolEligible: catalog.isPoolEligible,
    renderScale: catalog.renderScale,
    hitboxScale: catalog.hitboxScale,
    gripBias: catalog.gripBias,
    slipBias: catalog.slipBias,
    jellyValue: catalog.jellyValue,
  }
}

function hydrateVisiblePrizes(prizes: CranePrize[], visiblePrizeIds: readonly string[]) {
  const prizeMap = new Map(prizes.map(prize => [prize.id, prize]))
  return visiblePrizeIds
    .map(prizeId => prizeMap.get(prizeId) ?? null)
    .filter((prize): prize is CranePrize => prize !== null)
}

async function ensureCraneMachineStateRowInDatabase(database: RewardDbExecutor = db) {
  const existing = await database.select().from(craneMachineState).where(eq(craneMachineState.id, 1)).get()
  if (existing) return existing

  const now = toLocalISOString(new Date())
  await database.insert(craneMachineState).values({
    id: 1,
    visiblePrizeIds: '[]',
    poolSeed: '',
    lastWonPrizeId: null,
    updatedAt: now,
  })

  return database.select().from(craneMachineState).where(eq(craneMachineState.id, 1)).get()
}

async function ensureCraneMachineStateRow() {
  return ensureCraneMachineStateRowInDatabase(db)
}

async function saveCraneMachineState(input: {
  visiblePrizeIds: readonly string[]
  poolSeed: string
  lastWonPrizeId?: string | null
}) {
  const now = toLocalISOString(new Date())
  await ensureCraneMachineStateRow()

  await db.update(craneMachineState)
    .set({
      visiblePrizeIds: serializeVisiblePrizeIds(input.visiblePrizeIds),
      poolSeed: input.poolSeed,
      lastWonPrizeId: input.lastWonPrizeId ?? null,
      updatedAt: now,
    })
    .where(eq(craneMachineState.id, 1))

  return db.select().from(craneMachineState).where(eq(craneMachineState.id, 1)).get()
}

async function spendWalletBalanceInDatabase(database: RewardDbExecutor, input: SpendInput) {
  const walletRow = await normalizeWalletDay(database)
  if (!input.isDevMode && walletRow.balance < input.amount) {
    throw new Error('젤리가 부족합니다')
  }

  const now = toLocalISOString(new Date())
  if (!input.isDevMode) {
    const transactionId = randomUUID()
    await database.insert(rewardTransactions).values({
      id: transactionId,
      dayKey: getLocalDateKey(),
      amount: -input.amount,
      kind: input.kind,
      label: input.label,
      referenceId: input.referenceId,
      isDevMode: 0,
      createdAt: now,
    })

    await database.update(wallet)
      .set({
        balance: walletRow.balance - input.amount,
        lastEarnedDate: getLocalDateKey(),
        updatedAt: now,
      })
      .where(eq(wallet.id, 1))

    return {
      walletBalance: walletRow.balance - input.amount,
      transactionId,
    }
  }

  return {
    walletBalance: walletRow.balance,
    transactionId: null,
  }
}

async function spendWalletBalance(input: SpendInput) {
  return spendWalletBalanceInDatabase(db, input)
}

function isCompletedStatus(status: string) {
  return status === 'completed' || status === 'frozen'
}

function isOnTimeCompletion(scheduledTime: string, completedAt: string, verificationWindowMin: number) {
  const scheduledAt = new Date(scheduledTime).getTime()
  const completedAtMs = new Date(completedAt).getTime()
  return completedAtMs <= scheduledAt + verificationWindowMin * 60 * 1000
}

async function grantInventoryPrizeInDatabase(
  database: RewardDbExecutor,
  prizeId: string,
  acquiredAt = toLocalISOString(new Date()),
) {
  const existingInventory = await database.select().from(inventoryItems)
    .where(eq(inventoryItems.prizeId, prizeId))
    .get()

  if (existingInventory) {
    await database.update(inventoryItems)
      .set({
        quantity: existingInventory.quantity + 1,
        lastAcquiredAt: acquiredAt,
      })
      .where(eq(inventoryItems.id, existingInventory.id))
    return
  }

  await database.insert(inventoryItems).values({
    id: randomUUID(),
    prizeId,
    quantity: 1,
    lastAcquiredAt: acquiredAt,
    createdAt: acquiredAt,
  })
}

async function grantInventoryPrize(prizeId: string, acquiredAt = toLocalISOString(new Date())) {
  await ensureDefaultCranePrizes()
  await grantInventoryPrizeInDatabase(db, prizeId, acquiredAt)
}

async function hasCompletedAllChecksForDay(dayKey: string) {
  const records = await db.select().from(doseRecords).where(eq(doseRecords.dayKey, dayKey))
  if (records.length === 0) return false
  return records.every(record => isCompletedStatus(record.status))
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
  const existingById = new Map(existing.map(prize => [prize.id, prize]))
  const now = toLocalISOString(new Date())

  for (const prize of CRANE_REWARD_CATALOG) {
    const current = existingById.get(prize.id)
    if (!current) {
      await db.insert(cranePrizes).values({
        id: prize.id,
        name: prize.name,
        category: prize.category,
        rarity: prize.rarity,
        emoji: prize.emoji,
        weight: prize.weight,
        sortOrder: prize.sortOrder,
        priceJelly: prize.priceJelly,
        sourceType: prize.sourceType,
        assetCollection: prize.assetCollection,
        assetKey: prize.assetKey,
        isPurchasable: prize.isPurchasable ? 1 : 0,
        isCraneAvailable: prize.isCraneAvailable ? 1 : 0,
        isActive: 1,
        createdAt: now,
      })
      continue
    }

    const needsUpdate = (
      current.name !== prize.name ||
      current.category !== prize.category ||
      current.rarity !== prize.rarity ||
      current.emoji !== prize.emoji ||
      current.weight !== prize.weight ||
      current.sortOrder !== prize.sortOrder ||
      current.priceJelly !== prize.priceJelly ||
      current.sourceType !== prize.sourceType ||
      current.assetCollection !== prize.assetCollection ||
      current.assetKey !== prize.assetKey ||
      current.isPurchasable !== (prize.isPurchasable ? 1 : 0) ||
      current.isCraneAvailable !== (prize.isCraneAvailable ? 1 : 0) ||
      current.isActive !== 1
    )

    if (!needsUpdate) continue

    await db.update(cranePrizes)
      .set({
        name: prize.name,
        category: prize.category,
        rarity: prize.rarity,
        emoji: prize.emoji,
        weight: prize.weight,
        sortOrder: prize.sortOrder,
        priceJelly: prize.priceJelly,
        sourceType: prize.sourceType,
        assetCollection: prize.assetCollection,
        assetKey: prize.assetKey,
        isPurchasable: prize.isPurchasable ? 1 : 0,
        isCraneAvailable: prize.isCraneAvailable ? 1 : 0,
        isActive: 1,
      })
      .where(eq(cranePrizes.id, prize.id))
  }
}

export async function getShopCatalog(category: InventoryCategory = '전체') {
  await ensureDefaultCranePrizes()
  const prizes = await getCranePrizes()
  const inventory = await db.select().from(inventoryItems)
  const inventoryByPrize = new Map(inventory.map(item => [item.prizeId, item.quantity]))

  return prizes
    .filter(prize => prize.isPurchasable)
    .filter(prize => category === '전체' || prize.category === category)
    .map(prize => ({
      ...prize,
      count: inventoryByPrize.get(prize.id) ?? 0,
    }))
}

export async function purchaseShopItem(prizeId: string) {
  await ensureDefaultCranePrizes()

  const prize = (await getCranePrizes()).find(item => item.id === prizeId)
  if (!prize || !prize.isPurchasable) {
    throw new Error('구매할 수 없는 아이템입니다')
  }

  let walletBalance = 0
  let inventoryCount = 1

  await db.transaction(async (tx) => {
    const spendResult = await spendWalletBalanceInDatabase(tx, {
      amount: prize.priceJelly,
      kind: 'shop_purchase',
      label: `${prize.name} 구매`,
      referenceId: `shop-purchase:${randomUUID()}`,
    })

    await grantInventoryPrizeInDatabase(tx, prize.id)
    const inventoryEntry = await tx.select().from(inventoryItems).where(eq(inventoryItems.prizeId, prize.id)).get()

    walletBalance = spendResult.walletBalance
    inventoryCount = inventoryEntry?.quantity ?? 1
  })

  return {
    prize,
    walletBalance,
    inventoryCount,
  }
}

export async function getCranePrizes() {
  await ensureDefaultCranePrizes()
  const prizes = await db.select().from(cranePrizes)
    .where(eq(cranePrizes.isActive, 1))
    .orderBy(asc(cranePrizes.sortOrder))

  return prizes.map(enrichPrizeRow)
}

function drawPrize(prizes: CranePrize[]) {
  const totalWeight = prizes.reduce((sum, prize) => sum + Math.max(prize.weight, 1), 0)
  if (totalWeight <= 0) return prizes[0]

  const random = Math.floor(Math.random() * totalWeight) + 1
  let current = 0

  for (const prize of prizes) {
    current += Math.max(prize.weight, 1)
    if (random <= current) return prize
  }

  return prizes[0]
}

function hasSameVisiblePool(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((item, index) => item === right[index])
}

async function buildCraneMachineSession(row: CraneMachineStateRow | null = null): Promise<CraneMachineSession> {
  const prizes = await getCranePrizes()
  const currentRow = row ?? await ensureCraneMachineStateRow()
  const visiblePrizeIds = normalizeVisibleCraneRewardIds(
    CRANE_REWARD_CATALOG,
    parseVisiblePrizeIds(currentRow?.visiblePrizeIds),
  )

  if (visiblePrizeIds.length === CRANE_VISIBLE_POOL_SIZE && currentRow?.poolSeed) {
    return {
      visiblePrizeIds,
      visiblePrizes: hydrateVisiblePrizes(prizes, visiblePrizeIds),
      poolSeed: currentRow.poolSeed,
      lastWonPrizeId: currentRow.lastWonPrizeId ?? null,
    }
  }

  const poolSeed = makeCraneSeed()
  const nextVisiblePrizeIds = pickVisibleCraneRewardIds({
    rewards: CRANE_REWARD_CATALOG,
    count: CRANE_VISIBLE_POOL_SIZE,
    seed: poolSeed,
  })
  const savedRow = await saveCraneMachineState({
    visiblePrizeIds: nextVisiblePrizeIds,
    poolSeed,
    lastWonPrizeId: currentRow?.lastWonPrizeId ?? null,
  })

  return {
    visiblePrizeIds: nextVisiblePrizeIds,
    visiblePrizes: hydrateVisiblePrizes(prizes, nextVisiblePrizeIds),
    poolSeed: savedRow?.poolSeed ?? poolSeed,
    lastWonPrizeId: savedRow?.lastWonPrizeId ?? null,
  }
}

export async function getCraneMachineSession() {
  await ensureDefaultCranePrizes()
  const row = await ensureCraneMachineStateRow()
  return buildCraneMachineSession(row)
}

export async function rerollCranePrizePool(): Promise<CraneRerollResult> {
  await ensureDefaultCranePrizes()

  const settings = await getSettings()
  const isDevMode = settings.devMode === 1
  const currentSession = await getCraneMachineSession()
  const spendResult = await spendWalletBalance({
    amount: CRANE_REROLL_COST,
    kind: 'crane_reroll',
    label: '크레인 리롤',
    referenceId: `crane-reroll:${randomUUID()}`,
    isDevMode,
  })

  let poolSeed = makeCraneSeed()
  let visiblePrizeIds = pickVisibleCraneRewardIds({
    rewards: CRANE_REWARD_CATALOG,
    count: CRANE_VISIBLE_POOL_SIZE,
    seed: poolSeed,
  })

  const eligibleCount = CRANE_REWARD_CATALOG.filter(item => item.isPoolEligible !== false).length
  if (hasSameVisiblePool(currentSession.visiblePrizeIds, visiblePrizeIds) && eligibleCount > CRANE_VISIBLE_POOL_SIZE) {
    poolSeed = makeCraneSeed()
    visiblePrizeIds = pickVisibleCraneRewardIds({
      rewards: CRANE_REWARD_CATALOG,
      count: CRANE_VISIBLE_POOL_SIZE,
      seed: poolSeed,
    })
  }

  await saveCraneMachineState({
    visiblePrizeIds,
    poolSeed,
    lastWonPrizeId: currentSession.lastWonPrizeId,
  })

  const prizes = await getCranePrizes()
  return {
    visiblePrizeIds,
    visiblePrizes: hydrateVisiblePrizes(prizes, visiblePrizeIds),
    poolSeed,
    lastWonPrizeId: currentSession.lastWonPrizeId,
    walletBalance: spendResult.walletBalance,
    isDevMode,
    cost: isDevMode ? 0 : CRANE_REROLL_COST,
  }
}

export async function startCranePlay() {
  await ensureDefaultCranePrizes()

  const settings = await getSettings()
  const isDevMode = settings.devMode === 1
  const cost = isDevMode ? 0 : CRANE_PLAY_COST
  const now = toLocalISOString(new Date())
  const playId = randomUUID()
  const spendResult = await spendWalletBalance({
    amount: CRANE_PLAY_COST,
    kind: 'crane_play',
    label: '크레인',
    referenceId: playId,
    isDevMode,
  })

  await db.insert(cranePlays).values({
    id: playId,
    prizeId: null,
    cost,
    rewardTransactionId: spendResult.transactionId,
    isDevMode: isDevMode ? 1 : 0,
    createdAt: now,
  })

  return {
    playId,
    walletBalance: spendResult.walletBalance,
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

  const session = await getCraneMachineSession()
  if (!session.visiblePrizeIds.includes(prizeId)) {
    throw new Error('현재 크레인 풀에 없는 보상입니다')
  }

  const resolvedPrizeId = play.prizeId ?? prizeId
  const prizeRow = await db.select().from(cranePrizes).where(eq(cranePrizes.id, resolvedPrizeId)).get()
  if (!prizeRow || prizeRow.isActive !== 1) {
    throw new Error('보상 정보가 없습니다')
  }

  const prize = enrichPrizeRow(prizeRow)
  if (play.prizeId) {
    return { playId, prize, awarded: false, session }
  }

  const now = toLocalISOString(new Date())
  const poolSeed = makeCraneSeed()
  const visiblePrizeIds = replaceVisibleCraneRewardId({
    rewards: CRANE_REWARD_CATALOG,
    currentIds: session.visiblePrizeIds,
    replaceId: prizeId,
    seed: poolSeed,
  })

  let awarded = false
  let settledPrizeId: string | null = null

  await db.transaction(async (tx) => {
    const currentPlay = await tx.select().from(cranePlays).where(eq(cranePlays.id, playId)).get()
    if (!currentPlay) {
      throw new Error('크레인 기록을 찾을 수 없습니다')
    }

    if (currentPlay.prizeId) {
      settledPrizeId = currentPlay.prizeId
      return
    }

    await tx.update(cranePlays)
      .set({ prizeId })
      .where(eq(cranePlays.id, playId))

    await grantInventoryPrizeInDatabase(tx, prizeId, now)
    await ensureCraneMachineStateRowInDatabase(tx)
    await tx.update(craneMachineState)
      .set({
        visiblePrizeIds: serializeVisiblePrizeIds(visiblePrizeIds),
        poolSeed,
        lastWonPrizeId: prizeId,
        updatedAt: now,
      })
      .where(eq(craneMachineState.id, 1))

    awarded = true
    settledPrizeId = prizeId
  })

  if (!awarded) {
    const settledPrizeRow = await db.select().from(cranePrizes).where(eq(cranePrizes.id, settledPrizeId ?? prizeId)).get()
    if (!settledPrizeRow || settledPrizeRow.isActive !== 1) {
      throw new Error('보상 정보가 없습니다')
    }

    return {
      playId,
      prize: enrichPrizeRow(settledPrizeRow),
      awarded: false,
      session: await getCraneMachineSession(),
    }
  }

  const prizes = await getCranePrizes()
  return {
    playId,
    prize,
    awarded: true,
    session: {
      visiblePrizeIds,
      visiblePrizes: hydrateVisiblePrizes(prizes, visiblePrizeIds),
      poolSeed,
      lastWonPrizeId: prizeId,
    },
  }
}

export async function playCraneGame() {
  const start = await startCranePlay()
  const session = await getCraneMachineSession()
  if (session.visiblePrizes.length === 0) {
    throw new Error('보상 정보가 없습니다')
  }

  const prize = drawPrize(session.visiblePrizes)
  const result = await completeCranePlay(start.playId, prize.id)

  return {
    ...start,
    prize: result.prize,
    session: result.session,
  }
}

export async function getInventorySummary(category: InventoryCategory = '전체') {
  await ensureDefaultCranePrizes()
  const prizes = await getCranePrizes()
  const inventory = await db.select().from(inventoryItems)
  const inventoryByPrize = new Map(inventory.map(item => [item.prizeId, item]))

  return prizes
    .filter(prize => category === '전체' || prize.category === category)
    .map(prize => ({
      ...prize,
      count: inventoryByPrize.get(prize.id)?.quantity ?? 0,
    }))
    .filter(item => item.count > 0)
}

export async function getRecentCranePlays(limit = 8) {
  await ensureDefaultCranePrizes()
  const plays = await db.select().from(cranePlays).orderBy(desc(cranePlays.createdAt))
  const prizes = await getCranePrizes()
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