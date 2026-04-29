import { db } from '@backend/db/client'
import { doseRecords } from '@backend/db/schema'
import { count, sql } from 'drizzle-orm'
import { getLocalDateKey } from '@shared/utils/dateUtils'

// 날짜 기준 streak: 하루 모든 dose_records가 completed인 연속 일수
export async function getDateStreak(): Promise<{ current: number; longest: number }> {
  const today = getLocalDateKey()

  // 날짜별로 total / completed 집계
  const rows = await db.select({
    dayKey: doseRecords.dayKey,
    total: count(),
    completed: sql<number>`cast(sum(case when ${doseRecords.status} = 'completed' then 1 else 0 end) as integer)`,
  })
    .from(doseRecords)
    .groupBy(doseRecords.dayKey)

  // 하루 모든 레코드가 completed인 날짜만 추출
  const completeDays = new Set(
    rows
      .filter(r => r.total > 0 && r.completed === r.total)
      .map(r => r.dayKey),
  )

  function prevDay(key: string): string {
    const d = new Date(`${key}T12:00:00`)
    d.setDate(d.getDate() - 1)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }

  // current: 오늘부터 역순으로 연속된 complete 날수
  let current = 0
  let checkDay = today
  while (completeDays.has(checkDay)) {
    current++
    checkDay = prevDay(checkDay)
  }

  // longest: 전체 기록에서 최장 연속 complete 일수
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
