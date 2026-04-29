import { db } from '@/db/client'
import { referenceImages } from '@/db/schema'
import { eq } from 'drizzle-orm'
import * as FileSystem from 'expo-file-system'
import { randomUUID } from 'expo-crypto'
import { toLocalISOString } from '@/utils/dateUtils'

export async function getReferenceImages(medicationId: string) {
  return db.select().from(referenceImages)
    .where(eq(referenceImages.medicationId, medicationId))
}

export async function getReferenceEmbeddings(medicationId: string): Promise<number[][]> {
  const images = await getReferenceImages(medicationId)
  return images.map(img => JSON.parse(img.embedding) as number[])
}

export async function insertReferenceImage(data: {
  medicationId: string
  originalUri: string
  croppedUri: string
  embedding: number[]
}) {
  const id = randomUUID()
  const now = toLocalISOString(new Date())
  await db.insert(referenceImages).values({
    id,
    medicationId: data.medicationId,
    originalUri: data.originalUri,
    croppedUri: data.croppedUri,
    embedding: JSON.stringify(data.embedding),
    createdAt: now,
  })
  return id
}

// 파일 시스템 정리 포함
export async function deleteReferenceImage(id: string) {
  const img = await db.select().from(referenceImages)
    .where(eq(referenceImages.id, id)).get()
  if (img) {
    await FileSystem.deleteAsync(img.originalUri, { idempotent: true })
    await FileSystem.deleteAsync(img.croppedUri, { idempotent: true })
  }
  await db.delete(referenceImages).where(eq(referenceImages.id, id))
}
