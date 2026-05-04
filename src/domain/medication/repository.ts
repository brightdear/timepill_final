import { db } from '@/db/client'
import { medications, referenceImages } from '@/db/schema'
import { eq } from 'drizzle-orm'
import * as FileSystem from 'expo-file-system'
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
  const rows = await db.select().from(medications)
  return rows.find(item => item.name === name || item.aliasName === name || item.actualName === name)
}

export async function insertMedication(data: {
  name: string
  aliasName?: string
  actualName?: string | null
  totalQuantity?: number | null
  currentQuantity?: number | null
  remainingQuantity?: number | null
  dosePerIntake?: number
}) {
  const all = await getMedications()
  const color = MEDICATION_COLORS[all.length % MEDICATION_COLORS.length]
  const now = toLocalISOString(new Date())
  const id = randomUUID()
  const aliasName = data.aliasName?.trim() || data.name.trim()
  const actualName = data.actualName?.trim() || null
  const totalQuantity = Math.max(0, data.totalQuantity ?? 0)
  const remainingQuantity = Math.max(0, data.remainingQuantity ?? data.currentQuantity ?? totalQuantity ?? 0)
  await db.insert(medications).values({
    id,
    name: actualName ?? aliasName,
    aliasName,
    actualName,
    color,
    totalQuantity,
    currentQuantity: remainingQuantity,
    remainingQuantity,
    dosePerIntake: Math.max(1, data.dosePerIntake ?? 1),
    isActive: 1,
    isArchived: 0,
    createdAt: now,
    updatedAt: now,
  })
  return id
}

export async function updateMedication(
  id: string,
  data: Partial<typeof medications.$inferInsert>
) {
  const patch: Partial<typeof medications.$inferInsert> = { ...data }
  if ('totalQuantity' in patch) patch.totalQuantity = Math.max(0, patch.totalQuantity ?? 0)
  if ('currentQuantity' in patch) patch.currentQuantity = Math.max(0, patch.currentQuantity ?? 0)
  if ('remainingQuantity' in patch) patch.remainingQuantity = Math.max(0, patch.remainingQuantity ?? 0)
  if ('dosePerIntake' in patch) patch.dosePerIntake = Math.max(1, patch.dosePerIntake ?? 1)
  await db.update(medications).set({ ...patch, updatedAt: toLocalISOString(new Date()) }).where(eq(medications.id, id))
}

export async function consumeMedicationInventory(id: string, amount: number) {
  if (amount <= 0) return

  const medication = await getMedicationById(id)
  if (!medication) return

  const current = medication.remainingQuantity ?? medication.currentQuantity ?? 0
  const nextQuantity = Math.max(0, current - amount)
  await updateMedication(id, { currentQuantity: nextQuantity, remainingQuantity: nextQuantity })
}

// 파일 시스템 정리 → DB CASCADE 순서 준수
export async function deleteMedication(id: string) {
  const images = await db.select().from(referenceImages)
    .where(eq(referenceImages.medicationId, id))
  for (const img of images) {
    await FileSystem.deleteAsync(img.originalUri, { idempotent: true })
    await FileSystem.deleteAsync(img.croppedUri, { idempotent: true })
  }
  await db.delete(medications).where(eq(medications.id, id))
}
