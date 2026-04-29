import { db } from '@backend/db/client'
import { escapeRecords } from '@backend/db/schema'
import { eq, desc } from 'drizzle-orm'
import { randomUUID } from 'expo-crypto'
import { toLocalISOString, getLocalDateKey } from '@shared/utils/dateUtils'

export async function insertEscapeRecord(data: {
  medicationId?: string | null
  timeSlotId?: string | null
  doseRecordId?: string | null
  reason?: string | null
  isUserFault?: number
  note?: string | null
}) {
  const id = randomUUID()
  const now = toLocalISOString(new Date())
  await db.insert(escapeRecords).values({
    id,
    medicationId: data.medicationId ?? null,
    timeSlotId: data.timeSlotId ?? null,
    doseRecordId: data.doseRecordId ?? null,
    dayKey: getLocalDateKey(),
    reason: data.reason ?? null,
    isUserFault: data.isUserFault ?? 1,
    note: data.note ?? null,
    createdAt: now,
  })
  return id
}

export async function getEscapeRecords() {
  return db.select().from(escapeRecords).orderBy(desc(escapeRecords.createdAt))
}

export async function getEscapeRecordsByTimeslot(timeSlotId: string) {
  return db.select().from(escapeRecords)
    .where(eq(escapeRecords.timeSlotId, timeSlotId))
    .orderBy(desc(escapeRecords.createdAt))
}
