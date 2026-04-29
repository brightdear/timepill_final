import { db } from '@backend/db/client'
import { doseRecords, daycare } from '@backend/db/schema'
import { eq, gte, lte, and, sql } from 'drizzle-orm'
import { getLocalDateKey } from '@shared/utils/dateUtils'
import { getDateStreak } from '@backend/streak/repository'
import { STAGE_ORDER, GROWTH_CONDITIONS } from '@shared/constants/daycareConfig'
import type { DaycareStage } from '@shared/constants/daycareConfig'

const DAYCARE_ID = 1

async function ensureRow() {
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
        lte(doseRecords.dayKey, endKey)
      )
    )

  const nonPending = records.filter(r => r.status !== 'pending')
  if (nonPending.length === 0) return 100

  const done = nonPending.filter(r => r.status === 'completed').length
  return Math.round((done / nonPending.length) * 100)
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
      const nextIndex = STAGE_ORDER.indexOf(stage) + 1
      stage = STAGE_ORDER[nextIndex]
      await db
        .update(daycare)
        .set({ stage })
        .where(eq(daycare.id, DAYCARE_ID))
      advanced = true
    }
  }

  const currentConditions = GROWTH_CONDITIONS[stage]
  const complianceDays = currentConditions?.complianceDays ?? 60
  const complianceRate = await getRecentComplianceRate(complianceDays)

  return { stage, streak, complianceRate }
}

export async function getJellyBalance(): Promise<number> {
  await ensureRow()
  const row = await db
    .select({ jellyBalance: daycare.jellyBalance })
    .from(daycare)
    .where(eq(daycare.id, DAYCARE_ID))
    .get()
  return row?.jellyBalance ?? 0
}

export async function awardJelly(amount: number): Promise<void> {
  await ensureRow()
  await db
    .update(daycare)
    .set({ jellyBalance: sql`${daycare.jellyBalance} + ${amount}` })
    .where(eq(daycare.id, DAYCARE_ID))
}
