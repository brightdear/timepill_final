import { db } from '@/db/client'
import { medications, referenceImages } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { deleteAsync } from 'expo-file-system/legacy'
import { randomUUID } from 'expo-crypto'
import { toLocalISOString } from '@/utils/dateUtils'
import { MEDICATION_COLORS } from '@/constants/medicationColors'

export async function getMedications() {
  return db.select().from(medications)
}

export async function getMedicationById(id: string) {
  return db.select().from(medications).where(eq(medications.id, id)).get()
}

export async function getMedicationByName(name: string) {
  return db.select().from(medications).where(eq(medications.name, name)).get()
}

export async function insertMedication(data: { name: string }) {
  const all = await getMedications()
  const color = MEDICATION_COLORS[all.length % MEDICATION_COLORS.length]
  const now = toLocalISOString(new Date())
  const id = randomUUID()
  await db.insert(medications).values({ id, name: data.name, color, isActive: 1, createdAt: now })
  return id
}

export async function updateMedication(
  id: string,
  data: Partial<typeof medications.$inferInsert>
) {
  await db.update(medications).set(data).where(eq(medications.id, id))
}

// 파일 시스템 정리 → DB CASCADE 순서 준수
export async function deleteMedication(id: string) {
  const images = await db.select().from(referenceImages)
    .where(eq(referenceImages.medicationId, id))
  for (const img of images) {
    await deleteAsync(img.originalUri, { idempotent: true })
    await deleteAsync(img.croppedUri, { idempotent: true })
  }
  await db.delete(medications).where(eq(medications.id, id))
}
