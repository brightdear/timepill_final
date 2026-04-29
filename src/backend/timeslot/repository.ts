import { db } from '@/db/client'
import { timeSlots, timeSlotStreaks } from '@/db/schema'
import { eq, and, lt, isNotNull } from 'drizzle-orm'
import { isTodayDue } from '@/utils/cycleUtils'
import { toLocalISOString } from '@/utils/dateUtils'
import { safeParseJson } from '@/utils/safeJson'
import { randomUUID } from 'expo-crypto'
import { MAX_TIMESLOTS } from '@/constants/alarmConfig'
import * as Notifications from 'expo-notifications'

export async function getTimeslotsByMedication(medicationId: string) {
  return db.select().from(timeSlots).where(eq(timeSlots.medicationId, medicationId))
}

export async function getAllTimeslots() {
  return db.select().from(timeSlots)
}

// 오늘 복용일인 슬롯만 반환 (cycle 계산 포함)
export async function getTodayTimeslots() {
  const all = await db.select().from(timeSlots)
  return all.filter(slot => isTodayDue(slot))
}

export async function getTimeslotById(id: string) {
  return db.select().from(timeSlots).where(eq(timeSlots.id, id)).get()
}

export async function insertTimeslot(
  data: Omit<typeof timeSlots.$inferInsert, 'id' | 'createdAt'>
) {
  const count = await db.select().from(timeSlots).then(rows => rows.length)
  if (count >= MAX_TIMESLOTS) {
    throw new Error(`슬롯은 최대 ${MAX_TIMESLOTS}개까지 등록 가능합니다`)
  }
  const id = randomUUID()
  const now = toLocalISOString(new Date())
  await db.insert(timeSlots).values({ ...data, id, createdAt: now })
  return id
}

export async function updateTimeslot(
  id: string,
  data: Partial<typeof timeSlots.$inferInsert>
) {
  await db.update(timeSlots).set(data).where(eq(timeSlots.id, id))
}

export async function deleteTimeslot(id: string) {
  const slot = await getTimeslotById(id)
  if (slot) {
    for (const col of [slot.notificationIds, slot.forceNotificationIds]) {
      const ids = safeParseJson<string[]>(col)
      if (!ids || ids.length === 0) continue
      await Promise.all(ids.map(nid => Notifications.cancelScheduledNotificationAsync(nid)))
    }
  }
  // Do not rely only on SQLite FK enforcement; keep streak cleanup explicit.
  await db.delete(timeSlotStreaks).where(eq(timeSlotStreaks.timeSlotId, id))
  await db.delete(timeSlots).where(eq(timeSlots.id, id))
}

// skip_until 지난 슬롯 활성화 복귀 — toLocalISOString 필수 (toISOString UTC 사용 시 KST 비교 깨짐)
export async function restoreExpiredSkips() {
  const now = toLocalISOString(new Date())
  await db.update(timeSlots)
    .set({ isActive: 1, skipUntil: null })
    .where(
      and(
        isNotNull(timeSlots.skipUntil),
        lt(timeSlots.skipUntil, now)
      )
    )
}
