import { db } from '@/db/client'
import { settings, doseRecords } from '@/db/schema'
import { eq } from 'drizzle-orm'

const SETTINGS_ID = 1

export async function getSettings() {
  await db.insert(settings).values({ id: SETTINGS_ID }).onConflictDoNothing()
  return (await db.select().from(settings).where(eq(settings.id, SETTINGS_ID)).get())!
}

export async function updateSettings(data: Partial<typeof settings.$inferInsert>) {
  await db.update(settings).set(data).where(eq(settings.id, SETTINGS_ID))
}

// 여러 dose_record를 frozen으로 바꾸고 freeze를 일괄 차감하는 작업을 단일 트랜잭션으로 실행.
// 앱 종료 등으로 일부만 적용되는 데이터 불일치 방지.
export async function applyFreezeToRecords(recordIds: string[]): Promise<void> {
  if (recordIds.length === 0) return
  await db.transaction(async (tx) => {
    const s = await tx.select({ freezesRemaining: settings.freezesRemaining })
      .from(settings).where(eq(settings.id, SETTINGS_ID)).get()
    if (!s) return
    const toFreeze = Math.min(recordIds.length, s.freezesRemaining)
    if (toFreeze === 0) return
    await tx.update(settings)
      .set({ freezesRemaining: s.freezesRemaining - toFreeze })
      .where(eq(settings.id, SETTINGS_ID))
    for (const recordId of recordIds.slice(0, toFreeze)) {
      await tx.update(doseRecords)
        .set({ status: 'frozen' })
        .where(eq(doseRecords.id, recordId))
    }
  })
}

export async function incrementFreeze() {
  const s = await getSettings()
  if (s.freezesRemaining >= 3) return
  await db.update(settings)
    .set({ freezesRemaining: s.freezesRemaining + 1 })
    .where(eq(settings.id, SETTINGS_ID))
}
