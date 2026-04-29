import { deleteAsync, copyAsync, documentDirectory } from 'expo-file-system/legacy'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { Platform } from 'react-native'
import { extractEmbedding } from './mobilenetEmbedder'
import { detectPills } from './yoloPillDetector'
import { computeMatchScore } from '@/utils/similarity'
import { getReferenceEmbeddings } from '@/domain/referenceImage/repository'
import { SCAN_CONFIG } from '@/constants/scanConfig'
import { randomUUID } from 'expo-crypto'
import type { BboxResult } from './scanInferenceBridge'

export type ScanResult =
  | { type: 'no_pill' }
  | { type: 'pill_too_small' }
  | { type: 'matched'; medicationId: string; embedding: number[]; score: number }
  | { type: 'unmatched'; embedding: number[]; score: number }

export type CaptureReferenceResult =
  | { ok: true; originalUri: string; croppedUri: string; embedding: number[] }
  | { ok: false; reason: 'no_pill' | 'too_small' }

export interface ScanDebugInfo {
  photoUri: string
  actualW: number
  actualH: number
  cropSize: number
  cropStartX: number
  cropStartY: number
  bboxes: BboxResult[]
  guideUri?: string
  focusUri?: string
}

export interface BurstScanParams {
  takePicture: () => Promise<{ uri: string; width: number; height: number } | null>
  candidates: Array<{ medicationId: string; doseCount: number }>
  onBestPhotoUri?: (uri: string) => void
  onDebugInfo?: (info: ScanDebugInfo) => void
}

async function cropGuideFrame(
  uri: string,
): Promise<{ uri: string; cropSize: number; cropStartX: number; cropStartY: number; actualW: number; actualH: number }> {
  // Normalize first: render → save. The saved file's pixel layout is guaranteed to match
  // normRef.width × normRef.height, eliminating EXIF coordinate mismatch on Android.
  const normRef = await ImageManipulator.manipulate(uri).renderAsync()
  const actualW = normRef.width
  const actualH = normRef.height
  const normSaved = await normRef.saveAsync({ format: SaveFormat.JPEG, compress: 1.0 })

  console.log(`[CROP] photo dims from IM: ${actualW}×${actualH}`)

  const cropSize = Math.min(actualW, actualH)
  const cropStartX = Math.floor((actualW - cropSize) / 2)
  const cropStartY = Math.floor((actualH - cropSize) / 2)

  console.log(`[CROP] center square: x=${cropStartX}, y=${cropStartY}, size=${cropSize}`)

  // Crop from the normalized saved file — coordinate space is now guaranteed consistent
  const imageRef = await ImageManipulator.manipulate(normSaved.uri)
    .crop({ originX: cropStartX, originY: cropStartY, width: cropSize, height: cropSize })
    .renderAsync()
  const result = await imageRef.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 })

  await deleteAsync(normSaved.uri, { idempotent: true })

  return { uri: result.uri, cropSize, cropStartX, cropStartY, actualW, actualH }
}

function pickBestBbox(bboxes: BboxResult[]): BboxResult | null {
  if (!bboxes.length) return null
  return [...bboxes].sort((left, right) => right.confidence - left.confidence)[0] ?? null
}

async function cropDetectedPill(
  guideUri: string,
  bbox: BboxResult,
  cropSize: number,
): Promise<string> {
  const maxSide = Math.max(bbox.width, bbox.height)
  const padding = maxSide * SCAN_CONFIG.BBOX_PADDING_RATIO
  const squareSize = Math.min(
    cropSize,
    Math.max(maxSide + padding * 2, Math.max(bbox.width, bbox.height)),
  )
  const centerX = bbox.x + bbox.width / 2
  const centerY = bbox.y + bbox.height / 2
  const originX = Math.max(0, Math.min(cropSize - squareSize, centerX - squareSize / 2))
  const originY = Math.max(0, Math.min(cropSize - squareSize, centerY - squareSize / 2))

  const imageRef = await ImageManipulator.manipulate(guideUri)
    .crop({
      originX: Math.round(originX),
      originY: Math.round(originY),
      width: Math.round(squareSize),
      height: Math.round(squareSize),
    })
    .renderAsync()

  const result = await imageRef.saveAsync({ format: SaveFormat.JPEG, compress: 0.95 })
  return result.uri
}

async function prepareEmbeddingSource(
  guideUri: string,
  cropSize: number,
): Promise<
  | { ok: true; uri: string; bboxes: BboxResult[] }
  | { ok: false; reason: 'no_pill' | 'too_small'; bboxes: BboxResult[] }
> {
  if (Platform.OS !== 'ios') {
    return { ok: true, uri: guideUri, bboxes: [] }
  }

  const bboxes = await detectPills(guideUri, cropSize, cropSize)
  const bestBox = pickBestBbox(bboxes)
  if (!bestBox) {
    return { ok: false, reason: 'no_pill', bboxes }
  }

  const widthNorm = bestBox.width / cropSize
  const heightNorm = bestBox.height / cropSize
  if (
    widthNorm < SCAN_CONFIG.MIN_BBOX_W_NORM ||
    heightNorm < SCAN_CONFIG.MIN_BBOX_H_NORM
  ) {
    return { ok: false, reason: 'too_small', bboxes }
  }

  const focusUri = await cropDetectedPill(guideUri, bestBox, cropSize)
  return { ok: true, uri: focusUri, bboxes }
}

export async function runBurstScanInference({
  takePicture,
  candidates,
  onBestPhotoUri,
  onDebugInfo,
}: BurstScanParams): Promise<ScanResult> {
  const photo = await takePicture()
  if (!photo) return { type: 'no_pill' }

  const { uri: guideUri, cropSize, cropStartX, cropStartY, actualW, actualH } =
    await cropGuideFrame(photo.uri)

  const prepared = await prepareEmbeddingSource(guideUri, cropSize)
  if (!prepared.ok) {
    if (!onBestPhotoUri) await deleteAsync(photo.uri, { idempotent: true })
    if (!onDebugInfo) await deleteAsync(guideUri, { idempotent: true })
    return prepared.reason === 'too_small'
      ? { type: 'pill_too_small' }
      : { type: 'no_pill' }
  }

  const embeddingUri = prepared.uri
  if (onBestPhotoUri) onBestPhotoUri(photo.uri)
  if (onDebugInfo) onDebugInfo({
    photoUri: photo.uri,
    actualW,
    actualH,
    cropSize,
    cropStartX,
    cropStartY,
    bboxes: prepared.bboxes,
    guideUri,
    focusUri: embeddingUri !== guideUri ? embeddingUri : undefined,
  })

  const scanEmbedding = await extractEmbedding(embeddingUri)
  if (!onDebugInfo) {
    await deleteAsync(guideUri, { idempotent: true })
    if (embeddingUri !== guideUri) {
      await deleteAsync(embeddingUri, { idempotent: true })
    }
  }

  let globalBestScore = 0

  for (const { medicationId } of candidates) {
    const embeddings = await getReferenceEmbeddings(medicationId)
    if (embeddings.length === 0) continue

    const score = computeMatchScore(scanEmbedding, embeddings)
    if (score > globalBestScore) globalBestScore = score
    if (score >= SCAN_CONFIG.HIGH_THRESHOLD) {
      if (!onBestPhotoUri) await deleteAsync(photo.uri, { idempotent: true })
      return { type: 'matched', medicationId, embedding: scanEmbedding, score }
    }
  }

  if (!onBestPhotoUri) await deleteAsync(photo.uri, { idempotent: true })
  return { type: 'unmatched', embedding: scanEmbedding, score: globalBestScore }
}

export async function captureReferenceImage(params: {
  imageUri: string
  frameWidth: number
  frameHeight: number
  onDebugInfo?: (info: ScanDebugInfo) => void
}): Promise<CaptureReferenceResult> {
  const { uri: guideUri, cropSize, cropStartX, cropStartY, actualW, actualH } =
    await cropGuideFrame(params.imageUri)

  const prepared = await prepareEmbeddingSource(guideUri, cropSize)
  if (!prepared.ok) {
    if (!params.onDebugInfo) await deleteAsync(guideUri, { idempotent: true })
    return {
      ok: false,
      reason: prepared.reason === 'too_small' ? 'too_small' : 'no_pill',
    }
  }

  const embeddingUri = prepared.uri

  const keepGuideForDebug = __DEV__ && !!params.onDebugInfo
  if (params.onDebugInfo) params.onDebugInfo({
    photoUri: params.imageUri,
    actualW,
    actualH,
    cropSize,
    cropStartX,
    cropStartY,
    bboxes: prepared.bboxes,
    guideUri: keepGuideForDebug ? guideUri : undefined,
    focusUri: embeddingUri !== guideUri ? embeddingUri : undefined,
  })

  const origDestUri = `${documentDirectory ?? ''}orig_${randomUUID()}.jpg`
  await copyAsync({ from: params.imageUri, to: origDestUri })

  const destUri = `${documentDirectory ?? ''}ref_${randomUUID()}.jpg`
  await copyAsync({ from: embeddingUri, to: destUri })
  if (!keepGuideForDebug) await deleteAsync(guideUri, { idempotent: true })
  if (embeddingUri !== guideUri) await deleteAsync(embeddingUri, { idempotent: true })

  let embedding: number[]
  try {
    embedding = await extractEmbedding(destUri)
  } catch (e) {
    await Promise.all([
      deleteAsync(origDestUri, { idempotent: true }),
      deleteAsync(destUri, { idempotent: true }),
    ])
    throw e
  }
  return { ok: true, originalUri: origDestUri, croppedUri: destUri, embedding }
}
