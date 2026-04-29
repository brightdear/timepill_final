import { db } from '@backend/db/client'
import { settings } from '@backend/db/schema'
import { eq } from 'drizzle-orm'

const SETTINGS_ID = 1

export async function getSettings() {
  await db.insert(settings).values({ id: SETTINGS_ID }).onConflictDoNothing()
  return (await db.select().from(settings).where(eq(settings.id, SETTINGS_ID)).get())!
}

export async function updateSettings(data: Partial<typeof settings.$inferInsert>) {
  await db.update(settings).set(data).where(eq(settings.id, SETTINGS_ID))
}
