import { db } from '@/db/client'
import { daycare, doseRecords } from '@/db/schema'
import { eq, gte, lte, and, sql } from 'drizzle-orm'
import { getDateStreak } from '@/domain/streak/repository'
import { getWalletSummary, updateJellyBalance } from '@/domain/reward/repository'
import { GROWTH_CONDITIONS, STAGE_ORDER } from '@/constants/daycareConfig'
import type { DaycareStage } from '@/constants/daycareConfig'
import { getLocalDateKey, toLocalISOString } from '@/utils/dateUtils'

const DAYCARE_ID = 1

async function ensureRow() {
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS daycare (
      id INTEGER PRIMARY KEY DEFAULT 1,
      stage TEXT NOT NULL DEFAULT 'egg',
      jelly_balance INTEGER NOT NULL DEFAULT 0
    )
  `)
  await db.insert(daycare).values({ id: DAYCARE_ID }).onConflictDoNothing()
}

export async function getRecentComplianceRate(days: number): Promise<number> {
  const today = new Date()
  const start = new Date(today)
  start.setDate(today.getDate() - (days - 1))

  const pad = (n: number) => String(n).padStart(2, '0')
  const startKey = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`
  const endKey = getLocalDateKey()

  const records = await db
    .select({ status: doseRecords.status })
    .from(doseRecords)
    .where(
      and(
        gte(doseRecords.dayKey, startKey),
        lte(doseRecords.dayKey, endKey),
      ),
    )

  const nonPending = records.filter(record => record.status !== 'pending')
  if (nonPending.length === 0) return 100

  const completed = nonPending.filter(record => record.status === 'completed').length
  return Math.round((completed / nonPending.length) * 100)
}

export async function getDaycareStage(): Promise<DaycareStage> {
  await ensureRow()
  const row = await db
    .select({ stage: daycare.stage })
    .from(daycare)
    .where(eq(daycare.id, DAYCARE_ID))
    .get()
  return (row?.stage ?? 'egg') as DaycareStage
}

export async function checkAndAdvanceStage(): Promise<{
  stage: DaycareStage
  streak: number
  complianceRate: number
}> {
  let stage = await getDaycareStage()
  const { current: streak } = await getDateStreak()

  let advanced = true
  while (advanced) {
    advanced = false
    const conditions = GROWTH_CONDITIONS[stage]
    if (!conditions) break

    const compliance = await getRecentComplianceRate(conditions.complianceDays)
    if (streak >= conditions.streakDays && compliance >= conditions.complianceMin) {
      const nextStage = STAGE_ORDER[STAGE_ORDER.indexOf(stage) + 1]
      if (!nextStage) break
      stage = nextStage
      await db.update(daycare).set({ stage }).where(eq(daycare.id, DAYCARE_ID))
      advanced = true
    }
  }

  const currentConditions = GROWTH_CONDITIONS[stage]
  const complianceDays = currentConditions?.complianceDays ?? 60
  const complianceRate = await getRecentComplianceRate(complianceDays)

  return { stage, streak, complianceRate }
}

export async function getJellyBalance(): Promise<number> {
  const wallet = await getWalletSummary()
  return wallet.balance
}

export async function awardJelly(amount: number): Promise<void> {
  if (amount <= 0) return
  await updateJellyBalance(amount, 'streak_bonus', {
    label: '데이케어 보상',
    referenceId: `daycare:${toLocalISOString(new Date())}`,
  })
}
