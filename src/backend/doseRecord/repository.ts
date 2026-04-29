import { db } from '@backend/db/client'
import { doseRecords, timeSlots } from '@backend/db/schema'
import { eq, and, gte, lt, inArray, desc } from 'drizzle-orm'
import { isTodayDue } from '@shared/utils/cycleUtils'
import { getLocalDateKey, toLocalISOString, getLocalDayBounds, getDateRange } from '@shared/utils/dateUtils'
import { randomUUID } from 'expo-crypto'

export async function getDoseRecordsByDate(dateKey: string) {
  const { start, end } = getLocalDayBounds(dateKey)
  return db.select().from(doseRecords)
    .where(and(gte(doseRecords.scheduledTime, start), lt(doseRecords.scheduledTime, end)))
}

export async function getDoseRecordsByMonth(year: number, month: number) {
  const pad = (n: number) => String(n).padStart(2, '0')
  const start = `${year}-${pad(month)}-01T00:00:00.000`
  const nextYear  = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  const end = `${nextYear}-${pad(nextMonth)}-01T00:00:00.000`
  return db.select().from(doseRecords)
    .where(and(gte(doseRecords.scheduledTime, start), lt(doseRecords.scheduledTime, end)))
}

export async function insertDoseRecord(data: {
  medicationId: string | null
  medicationName: string
  timeSlotId: string | null
  dayKey: string
  scheduledTime: string
  targetDoseCount: number
  status?: 'pending' | 'missed'
}) {
  const id = randomUUID()
  const now = toLocalISOString(new Date())
  await db.insert(doseRecords)
    .values({ ...data, id, status: data.status ?? 'pending', createdAt: now })
    .onConflictDoNothing()  // UNIQUE(time_slot_id, day_key) 충돌 시 무시
  return id
}

export async function updateDoseRecordStatus(
  id: string,
  status: 'completed' | 'missed' | 'frozen',
  completedAt?: string
) {
  await db.update(doseRecords).set({ status, completedAt }).where(eq(doseRecords.id, id))
}

export async function deleteDoseRecord(id: string) {
  await db.delete(doseRecords).where(eq(doseRecords.id, id))
}

export async function getTodayDoseRecordForSlot(timeSlotId: string, dayKey: string) {
  return db.select().from(doseRecords)
    .where(and(eq(doseRecords.timeSlotId, timeSlotId), eq(doseRecords.dayKey, dayKey)))
    .get()
}

export async function updateDoseRecordScheduledTimeForSlot(
  timeSlotId: string,
  dayKey: string,
  scheduledTime: string,
) {
  await db.update(doseRecords)
    .set({ scheduledTime })
    .where(and(eq(doseRecords.timeSlotId, timeSlotId), eq(doseRecords.dayKey, dayKey)))
}

// 오늘 이전 pending 조회만 — DB write 없음. freeze 팝업 결과 확정 후 markDosesMissed 호출할 것.
export async function checkMissedDoses(): Promise<{
  timeSlotIds: string[]
  records: (typeof doseRecords.$inferSelect)[]
}> {
  const todayStart = `${getLocalDateKey()}T00:00:00.000`

  const pending = await db.select().from(doseRecords)
    .where(
      and(
        eq(doseRecords.status, 'pending'),
        lt(doseRecords.scheduledTime, todayStart)
      )
    )

  if (pending.length === 0) return { timeSlotIds: [], records: [] }

  const timeSlotIds = pending
    .map(r => r.timeSlotId)
    .filter((id): id is string => id !== null)

  return { timeSlotIds, records: pending }
}

// freeze 팝업 완료 후 호출 — frozen으로 처리된 레코드는 제외하고 missed 기록
export async function markDosesMissed(recordIds: string[]): Promise<void> {
  if (recordIds.length === 0) return
  await db.update(doseRecords).set({ status: 'missed' }).where(inArray(doseRecords.id, recordIds))
}

// 앱 미실행 기간 backfill + 오늘 pending 생성
// 읽기로 삽입 목록 먼저 수집 → 단일 트랜잭션으로 일괄 INSERT (원자성 + 성능)
export async function backfillAndGenerateDoseRecords(): Promise<{
  insertedMissedRecords: (typeof doseRecords.$inferSelect)[]
}> {
  const allSlots = await db.select().from(timeSlots)
  const todayKey = getLocalDateKey()
  const now = toLocalISOString(new Date())

  type InsertRow = typeof doseRecords.$inferInsert
  const toInsert: InsertRow[] = []

  // 슬롯별 최신 레코드를 한 번에 조회 — 슬롯마다 쿼리하는 N+1 방지
  const latestRecords = await db
    .select({ timeSlotId: doseRecords.timeSlotId, scheduledTime: doseRecords.scheduledTime })
    .from(doseRecords)
    .orderBy(desc(doseRecords.scheduledTime))

  const latestMap = new Map<string, string>()
  for (const r of latestRecords) {
    if (r.timeSlotId && !latestMap.has(r.timeSlotId)) {
      latestMap.set(r.timeSlotId, r.scheduledTime)
    }
  }

  // 모든 medication을 한 번에 로드
  const { getMedications } = await import('@backend/medication/repository')
  const allMeds = await getMedications()
  const medMap = new Map(allMeds.map(m => [m.id, m]))

  for (const slot of allSlots) {
    const lastScheduled = latestMap.get(slot.id)
    const fromKey = lastScheduled
      ? (() => {
          const d = new Date(`${lastScheduled.slice(0, 10)}T12:00:00`)
          d.setDate(d.getDate() + 1)
          return getLocalDateKey(d)
        })()
      : slot.createdAt.slice(0, 10)

    if (fromKey > todayKey) continue

    const med = medMap.get(slot.medicationId)
    if (!med) continue

    const dateRange = getDateRange(fromKey, todayKey)

    for (const dateKey of dateRange) {
      const checkDate = new Date(`${dateKey}T12:00:00`)
      if (!isTodayDue(slot, checkDate)) continue

      const scheduledTime = toLocalISOString(
        new Date(checkDate.getFullYear(), checkDate.getMonth(), checkDate.getDate(), slot.hour, slot.minute)
      )

      toInsert.push({
        id: randomUUID(),
        medicationId: slot.medicationId,
        medicationName: med.name,
        timeSlotId: slot.id,
        dayKey: dateKey,
        scheduledTime,
        status: dateKey < todayKey ? 'missed' : 'pending',
        targetDoseCount: slot.doseCountPerIntake,
        createdAt: now,
      })
    }
  }

  if (toInsert.length === 0) return { insertedMissedRecords: [] }

  await db.transaction(async (tx) => {
    for (const row of toInsert) {
      await tx.insert(doseRecords).values(row).onConflictDoNothing()
    }
  })

  return {
    // Return inserted missed rows so startup freeze/streak logic can process days created by backfill.
    insertedMissedRecords: toInsert
      .filter(row => row.status === 'missed')
      .map(row => ({
        id: row.id!,
        medicationId: row.medicationId ?? null,
        medicationName: row.medicationName!,
        timeSlotId: row.timeSlotId ?? null,
        dayKey: row.dayKey!,
        scheduledTime: row.scheduledTime!,
        status: row.status!,
        targetDoseCount: row.targetDoseCount!,
        completedAt: row.completedAt ?? null,
        createdAt: row.createdAt!,
      })),
  }
}
