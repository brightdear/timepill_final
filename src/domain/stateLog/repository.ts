import { and, desc, eq, gte, lt } from 'drizzle-orm'
import { randomUUID } from 'expo-crypto'
import { db } from '@/db/client'
import { stateLogs } from '@/db/schema'
import { getLocalDateKey, toLocalISOString } from '@/utils/dateUtils'

export type StateLogInput = {
  dayKey?: string
  mood: string
  condition: string
  focus: string
  tags: string[]
  memo?: string
  rewardGranted?: boolean
}

function monthBounds(year: number, month: number) {
  const pad = (value: number) => String(value).padStart(2, '0')
  const start = `${year}-${pad(month)}-01`
  const next = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${pad(month + 1)}-01`

  return { start, next }
}

export async function insertStateLog(input: StateLogInput) {
  const id = randomUUID()
  const createdAt = toLocalISOString(new Date())

  await db.insert(stateLogs).values({
    id,
    dayKey: input.dayKey ?? getLocalDateKey(),
    mood: input.mood,
    condition: input.condition,
    focus: input.focus,
    tags: JSON.stringify(input.tags),
    memo: input.memo?.trim() ? input.memo.trim() : null,
    rewardGranted: input.rewardGranted ? 1 : 0,
    createdAt,
  })

  return id
}

export async function updateStateLogReward(id: string, rewardGranted: boolean) {
  await db.update(stateLogs)
    .set({ rewardGranted: rewardGranted ? 1 : 0 })
    .where(eq(stateLogs.id, id))
}

export async function getStateLogsByDay(dayKey: string) {
  return db.select().from(stateLogs)
    .where(eq(stateLogs.dayKey, dayKey))
    .orderBy(desc(stateLogs.createdAt))
}

export async function getStateLogsByMonth(year: number, month: number) {
  const { start, next } = monthBounds(year, month)
  return db.select().from(stateLogs)
    .where(and(gte(stateLogs.dayKey, start), lt(stateLogs.dayKey, next)))
    .orderBy(desc(stateLogs.createdAt))
}
