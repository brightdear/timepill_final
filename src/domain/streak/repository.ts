import { db } from '@/db/client'
import { timeSlotStreaks, doseRecords } from '@/db/schema'
import { eq, and, asc, inArray, count, sql } from 'drizzle-orm'
import { incrementFreeze } from '@/domain/settings/repository'
import { getLocalDateKey } from '@/utils/dateUtils'

export async function getStreakByTimeslot(timeSlotId: string) {
  return db.select().from(timeSlotStreaks)
    .where(eq(timeSlotStreaks.timeSlotId, timeSlotId))
    .get()
}

export async function upsertStreak(
  timeSlotId: string,
  data: Partial<typeof timeSlotStreaks.$inferInsert>
) {
  const existing = await getStreakByTimeslot(timeSlotId)
  if (existing) {
    await db.update(timeSlotStreaks).set(data).where(eq(timeSlotStreaks.timeSlotId, timeSlotId))
  } else {
    await db.insert(timeSlotStreaks).values({
      timeSlotId,
      currentStreak: 0,
      longestStreak: 0,
      lastCompletedDate: '',
      ...data,
    })
  }
}

// 인증 즉시 +1 — 같은 날 중복 호출 방지
export async function incrementStreak(timeSlotId: string) {
  const streak = await getStreakByTimeslot(timeSlotId)
  const today = getLocalDateKey()  // toISOString() UTC 사용 금지

  if (streak?.lastCompletedDate === today) {
    return { freezeAcquired: false, currentStreak: streak.currentStreak }
  }

  const current = (streak?.currentStreak ?? 0) + 1
  const longest = Math.max(current, streak?.longestStreak ?? 0)

  await upsertStreak(timeSlotId, { currentStreak: current, longestStreak: longest, lastCompletedDate: today })

  if (current === 15) {
    await incrementFreeze()
    return { freezeAcquired: true, currentStreak: current }
  }
  return { freezeAcquired: false, currentStreak: current }
}

// missed 발생 시 해당 timeslot streak 리셋
export async function resetStreaks(timeSlotIds: string[]) {
  if (timeSlotIds.length === 0) return
  await db.update(timeSlotStreaks)
    .set({ currentStreak: 0 })
    .where(inArray(timeSlotStreaks.timeSlotId, timeSlotIds))
}

export async function getDateStreak(): Promise<{ current: number; longest: number }> {
  const today = getLocalDateKey()

  const rows = await db.select({
    dayKey: doseRecords.dayKey,
    total: count(),
    completed: sql<number>`cast(sum(case when ${doseRecords.status} = 'completed' then 1 else 0 end) as integer)`,
  })
    .from(doseRecords)
    .groupBy(doseRecords.dayKey)

  const completeDays = new Set(
    rows
      .filter(row => row.total > 0 && row.completed === row.total)
      .map(row => row.dayKey),
  )

  const prevDay = (key: string) => {
    const date = new Date(`${key}T12:00:00`)
    date.setDate(date.getDate() - 1)
    return getLocalDateKey(date)
  }

  let current = 0
  let checkDay = today
  while (completeDays.has(checkDay)) {
    current += 1
    checkDay = prevDay(checkDay)
  }

  const allDays = [...completeDays].sort()
  let longest = 0
  let run = 0
  let prevKey: string | null = null

  for (const day of allDays) {
    if (prevKey === null) {
      run = 1
    } else {
      const prev = new Date(`${prevKey}T12:00:00`)
      const cur = new Date(`${day}T12:00:00`)
      const diff = Math.round((cur.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24))
      run = diff === 1 ? run + 1 : 1
    }
    prevKey = day
    longest = Math.max(longest, run)
  }

  return { current, longest }
}

// 기록 삭제 후 호출 — dose_records 재순회해서 streak 재산출
// freeze는 보정하지 않음 (소급 추적 테이블 없음, 이미 소비된 케이스 복원 불가)
export async function recalculateStreak(timeSlotId: string) {
  const records = await db.select().from(doseRecords)
    .where(
      and(
        eq(doseRecords.timeSlotId, timeSlotId),
        inArray(doseRecords.status, ['completed', 'missed', 'frozen', 'skipped'])
        // pending은 재계산에서 제외
      )
    )
    .orderBy(asc(doseRecords.scheduledTime))

  let currentStreak = 0
  let longestStreak = 0
  let lastCompletedDate = ''

  for (const r of records) {
    if (r.status === 'completed' || r.status === 'frozen') {
      currentStreak++
      longestStreak = Math.max(longestStreak, currentStreak)
      lastCompletedDate = r.scheduledTime.slice(0, 10)
    } else if (r.status === 'missed' || r.status === 'skipped') {
      currentStreak = 0
    }
  }

  await upsertStreak(timeSlotId, { currentStreak, longestStreak, lastCompletedDate })
}
