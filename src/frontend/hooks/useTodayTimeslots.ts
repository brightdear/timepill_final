import { useState, useCallback } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { db } from '@/db/client'
import { doseRecords, timeSlots, timeSlotStreaks, medications } from '@/db/schema'
import { and, eq, isNotNull, ne, sql, count } from 'drizzle-orm'
import { getLocalDateKey } from '@/utils/dateUtils'

type Slot = typeof timeSlots.$inferSelect
type DoseRecord = typeof doseRecords.$inferSelect
type Streak = typeof timeSlotStreaks.$inferSelect
type Medication = typeof medications.$inferSelect

export type TimeslotWithDose = {
  slot: Slot
  doseRecord: DoseRecord | null
  medication: Medication | null
  streak: Streak | null
  completionRate: number | null  // completed / (completed+missed+frozen), null = 기록 없음
}

function slotMinutes(s: Slot) { return s.hour * 60 + s.minute }

async function fetchAll(): Promise<{
  items: TimeslotWithDose[]
  totalSlotCount: number
}> {
  const todayKey = getLocalDateKey()
  const allSlots = await db.select().from(timeSlots)
  if (allSlots.length === 0) return { items: [], totalSlotCount: 0 }

  // 5개 테이블을 각 1번씩만 조회 — N+1 방지
  const [allMeds, allStreaks, todayRecords, medStats] = await Promise.all([
    db.select().from(medications),
    db.select().from(timeSlotStreaks),
    db.select().from(doseRecords).where(eq(doseRecords.dayKey, todayKey)),
    db.select({
      medicationId: doseRecords.medicationId,
      total: count(),
      completed: sql<number>`cast(sum(case when ${doseRecords.status} = 'completed' then 1 else 0 end) as integer)`,
    })
      .from(doseRecords)
      .where(and(isNotNull(doseRecords.medicationId), ne(doseRecords.status, 'pending')))
      .groupBy(doseRecords.medicationId),
  ])

  const medMap = new Map(allMeds.map(m => [m.id, m]))
  const streakMap = new Map(allStreaks.map(s => [s.timeSlotId, s]))
  const recordMap = new Map(todayRecords.map(r => [r.timeSlotId, r]))
  const rateMap = new Map(
    medStats.map(s => [
      s.medicationId,
      s.total > 0 ? s.completed / s.total : null,
    ]),
  )

  const results = allSlots.map(slot => ({
    slot,
    doseRecord: recordMap.get(slot.id) ?? null,
    medication: medMap.get(slot.medicationId) ?? null,
    streak: streakMap.get(slot.id) ?? null,
    completionRate: rateMap.get(slot.medicationId) ?? null,
  }))

  // sort: active (time asc) → skip (skipUntil asc) → off (time asc)
  const active = results
    .filter(r => r.slot.isActive === 1 && r.doseRecord !== null)
    .sort((a, b) => slotMinutes(a.slot) - slotMinutes(b.slot))

  const skip = results
    .filter(r => r.slot.isActive === 0 && r.slot.skipUntil !== null)
    .sort((a, b) => (a.slot.skipUntil ?? '') < (b.slot.skipUntil ?? '') ? -1 : 1)

  const off = results
    .filter(r => r.slot.isActive === 0 && r.slot.skipUntil === null)
    .sort((a, b) => slotMinutes(a.slot) - slotMinutes(b.slot))

  return { items: [...active, ...skip, ...off], totalSlotCount: allSlots.length }
}

export function useTodayTimeslots() {
  const [data, setData] = useState<TimeslotWithDose[]>([])
  const [totalSlotCount, setTotalSlotCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const next = await fetchAll()
      setData(next.items)
      setTotalSlotCount(next.totalSlotCount)
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void refresh()
    }, [refresh]),
  )

  return { data, loading, refresh, totalSlotCount }
}

// Whether the user can verify this dose right now
export function isVerifiable(slot: Slot, doseRecord: DoseRecord | null): boolean {
  if (!doseRecord || doseRecord.status !== 'pending') return false
  const now = Date.now()
  const scheduled = new Date(doseRecord.scheduledTime).getTime()
  const halfWindow = (slot.verificationWindowMin / 2) * 60 * 1000
  const windowStart = scheduled - halfWindow
  const windowEnd   = scheduled + halfWindow
  return now >= windowStart && now <= windowEnd
}
