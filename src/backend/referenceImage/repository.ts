import { db } from '@backend/db/client'
import { referenceImages } from '@backend/db/schema'
import { eq } from 'drizzle-orm'
import { deleteAsync } from 'expo-file-system/legacy'
import { randomUUID } from 'expo-crypto'
import { toLocalISOString } from '@shared/utils/dateUtils'
import { safeParseJson } from '@shared/utils/safeJson'

export async function getReferenceImages(medicationId: string) {
  return db.select().from(referenceImages)
    .where(eq(referenceImages.medicationId, medicationId))
}

export async function getReferenceEmbeddings(medicationId: string): Promise<number[][]> {
  const images = await getReferenceImages(medicationId)
  return images.flatMap(img => {
    const parsed = safeParseJson<number[] | number[][]>(img.embedding)
    if (!Array.isArray(parsed)) return []
    // Legacy: flat number[] → wrap. New: number[][] → flatten.
    if (parsed.length === 0 || typeof parsed[0] === 'number') return [parsed as number[]]
    return parsed as number[][]
  })
}

export async function insertReferenceImage(data: {
  medicationId: string
  originalUri: string
  croppedUri: string
  embeddings: number[][]
}) {
  const id = randomUUID()
  const now = toLocalISOString(new Date())
  await db.insert(referenceImages).values({
    id,
    medicationId: data.medicationId,
    originalUri: data.originalUri,
    croppedUri: data.croppedUri,
    embedding: JSON.stringify(data.embeddings),
    createdAt: now,
  })
  return id
}

// 파일 시스템 정리 포함
export async function deleteReferenceImage(id: string) {
  const img = await db.select().from(referenceImages)
    .where(eq(referenceImages.id, id)).get()
  if (img) {
    await deleteAsync(img.originalUri, { idempotent: true })
    await deleteAsync(img.croppedUri, { idempotent: true })
  }
  await db.delete(referenceImages).where(eq(referenceImages.id, id))
}
