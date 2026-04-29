import { useState, useCallback } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { db } from '@/db/client'
import { doseRecords, timeSlots, timeSlotStreaks, medications } from '@/db/schema'
import { eq, and } from 'drizzle-orm'
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
}

function slotMinutes(s: Slot) { return s.hour * 60 + s.minute }

async function fetchAll(): Promise<TimeslotWithDose[]> {
  const todayKey = getLocalDateKey()
  const allSlots = await db.select().from(timeSlots)
  if (allSlots.length === 0) return []

  // 4개 테이블을 각 1번씩만 조회 — N+1 방지
  const allMeds = await db.select().from(medications)
  const allStreaks = await db.select().from(timeSlotStreaks)
  const todayRecords = await db.select().from(doseRecords).where(eq(doseRecords.dayKey, todayKey))

  const medMap = new Map(allMeds.map(m => [m.id, m]))
  const streakMap = new Map(allStreaks.map(s => [s.timeSlotId, s]))
  const recordMap = new Map(todayRecords.map(r => [r.timeSlotId, r]))

  const results = allSlots.map(slot => ({
    slot,
    doseRecord: recordMap.get(slot.id) ?? null,
    medication: medMap.get(slot.medicationId) ?? null,
    streak: streakMap.get(slot.id) ?? null,
  }))

  // sort: active (time asc) → skip (skipUntil asc) → off (time asc)
  const active = results
    .filter(r => r.slot.isActive === 1)
    .sort((a, b) => slotMinutes(a.slot) - slotMinutes(b.slot))

  const skip = results
    .filter(r => r.slot.isActive === 0 && r.slot.skipUntil !== null)
    .sort((a, b) => (a.slot.skipUntil ?? '') < (b.slot.skipUntil ?? '') ? -1 : 1)

  const off = results
    .filter(r => r.slot.isActive === 0 && r.slot.skipUntil === null)
    .sort((a, b) => slotMinutes(a.slot) - slotMinutes(b.slot))

  return [...active, ...skip, ...off]
}

export function useTodayTimeslots(enabled = true) {
  const [data, setData] = useState<TimeslotWithDose[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setData(await fetchAll())
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      if (!enabled) {
        setLoading(false)
        return
      }

      void refresh()
    }, [enabled, refresh]),
  )

  return { data, loading, refresh }
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
