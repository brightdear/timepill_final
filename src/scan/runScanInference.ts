import { deleteAsync, copyAsync, documentDirectory } from 'expo-file-system/legacy'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { detectPills } from './yoloPillDetector'
import { extractEmbedding } from './mobilenetEmbedder'
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
  | { ok: true; originalUri: string; croppedUri: string; embeddings: number[][]; devCroppedUris?: string[] }
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

  const cropSize = Math.min(actualW, actualH)
  const cropStartX = Math.floor((actualW - cropSize) / 2)
  const cropStartY = Math.floor((actualH - cropSize) / 2)

  const imageRef = await ImageManipulator.manipulate(normSaved.uri)
    .crop({ originX: cropStartX, originY: cropStartY, width: cropSize, height: cropSize })
    .renderAsync()
  const result = await imageRef.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 })

  await deleteAsync(normSaved.uri, { idempotent: true })

  return { uri: result.uri, cropSize, cropStartX, cropStartY, actualW, actualH }
}

function toOriginalCoords(box: BboxResult, cropStartX: number, cropStartY: number): BboxResult {
  return { ...box, x: box.x + cropStartX, y: box.y + cropStartY }
}

// Expand bbox to square (longer side wins) so MobileNet gets undistorted input.
// Clamp to frame: shift origin first so the result is always exactly side×side.
function squarifyBbox(box: BboxResult, frameWidth: number, frameHeight: number): BboxResult {
  const side = Math.min(Math.max(box.width, box.height), frameWidth, frameHeight)
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  const x = Math.max(0, Math.min(cx - side / 2, frameWidth  - side))
  const y = Math.max(0, Math.min(cy - side / 2, frameHeight - side))
  return { x, y, width: side, height: side, confidence: box.confidence }
}

function isBboxTooSmall(box: BboxResult, frameShortSide: number): boolean {
  const wNorm = box.width  / frameShortSide
  const hNorm = box.height / frameShortSide
  console.log(`[SCAN] bbox norm: w=${wNorm.toFixed(3)} h=${hNorm.toFixed(3)} (threshold w=${SCAN_CONFIG.MIN_BBOX_W_NORM} h=${SCAN_CONFIG.MIN_BBOX_H_NORM}) conf=${box.confidence.toFixed(3)}`)
  return wNorm < SCAN_CONFIG.MIN_BBOX_W_NORM || hNorm < SCAN_CONFIG.MIN_BBOX_H_NORM
}

async function cropToBbox(
  uri: string,
  bbox: BboxResult,
  padding: number,
  frameWidth: number,
  frameHeight: number,
): Promise<string> {
  const x = Math.floor(Math.max(0, bbox.x - padding))
  const y = Math.floor(Math.max(0, bbox.y - padding))
  const w = Math.floor(Math.min(frameWidth  - x, bbox.width  + padding * 2))
  const h = Math.floor(Math.min(frameHeight - y, bbox.height + padding * 2))

  const imageRef = await ImageManipulator.manipulate(uri)
    .crop({ originX: x, originY: y, width: w, height: h })
    .renderAsync()
  const result = await imageRef.saveAsync({ compress: 0.9, format: SaveFormat.JPEG })
  return result.uri
}

interface DetectResult {
  photoUri: string
  frameWidth: number
  frameHeight: number
  boxes: BboxResult[]
  cropSize: number
  cropStartX: number
  cropStartY: number
  guideUri?: string
}

async function detectInPhoto(photo: {
  uri: string
  width: number
  height: number
}, keepGuide = false): Promise<DetectResult> {
  const { uri: guideUri, cropSize, cropStartX, cropStartY, actualW, actualH } =
    await cropGuideFrame(photo.uri)
  const boxes = await detectPills(guideUri, cropSize, cropSize)
  if (!keepGuide) await deleteAsync(guideUri, { idempotent: true })
  return {
    photoUri: photo.uri, frameWidth: actualW, frameHeight: actualH,
    boxes, cropSize, cropStartX, cropStartY,
    guideUri: keepGuide ? guideUri : undefined,
  }
}

export async function runBurstScanInference({
  takePicture,
  candidates,
  onBestPhotoUri,
  onDebugInfo,
}: BurstScanParams): Promise<ScanResult> {
  const t0 = Date.now()

  const photo = await takePicture()
  if (!photo) return { type: 'no_pill' }
  console.log(`[SCAN] takePicture: ${Date.now() - t0}ms`)

  const t1 = Date.now()
  const detected = await detectInPhoto(photo, !!onDebugInfo)
  console.log(`[SCAN] cropGuideFrame+YOLO: ${Date.now() - t1}ms`)

  if (detected.boxes.length === 0) {
    await deleteAsync(detected.photoUri, { idempotent: true })
    if (detected.guideUri) await deleteAsync(detected.guideUri, { idempotent: true })
    return { type: 'no_pill' }
  }

  const usableBoxes = detected.boxes.filter(box => !isBboxTooSmall(box, detected.cropSize))
  if (usableBoxes.length === 0) {
    await deleteAsync(detected.photoUri, { idempotent: true })
    if (detected.guideUri) await deleteAsync(detected.guideUri, { idempotent: true })
    return { type: 'pill_too_small' }
  }

  if (onBestPhotoUri) onBestPhotoUri(detected.photoUri)
  if (onDebugInfo) onDebugInfo({
    photoUri: detected.photoUri,
    actualW: detected.frameWidth,
    actualH: detected.frameHeight,
    cropSize: detected.cropSize,
    cropStartX: detected.cropStartX,
    cropStartY: detected.cropStartY,
    bboxes: detected.boxes.map(b => toOriginalCoords(b, detected.cropStartX, detected.cropStartY)),
    guideUri: detected.guideUri,
  })

  let globalBestScore = 0

  for (const { medicationId, doseCount } of candidates) {
    const topBoxes = usableBoxes.slice(0, doseCount)
    const embeddings = await getReferenceEmbeddings(medicationId)
    if (embeddings.length === 0) continue

    const required = Math.ceil(doseCount * SCAN_CONFIG.COUNT_RATIO)
    let matchedCount = 0
    let lastMatchedEmbedding: number[] = []
    let lastMatchedScore = 0

    for (const box of topBoxes) {
      const originalBox = squarifyBbox(
        toOriginalCoords(box, detected.cropStartX, detected.cropStartY),
        detected.frameWidth,
        detected.frameHeight,
      )
      const croppedUri = await cropToBbox(
        detected.photoUri,
        originalBox,
        Math.round(originalBox.width * SCAN_CONFIG.BBOX_PADDING_RATIO),
        detected.frameWidth,
        detected.frameHeight,
      )
      const t2 = Date.now()
      const scanEmbedding = await extractEmbedding(croppedUri)
      console.log(`[SCAN] MobileNet embedding: ${Date.now() - t2}ms`)
      await deleteAsync(croppedUri, { idempotent: true })

      const score = computeMatchScore(scanEmbedding, embeddings)
      if (score > globalBestScore) globalBestScore = score
      if (score >= SCAN_CONFIG.HIGH_THRESHOLD) {
        matchedCount++
        lastMatchedEmbedding = scanEmbedding
        lastMatchedScore = score
      }
    }

    if (matchedCount >= required) {
      console.log(`[SCAN] total: ${Date.now() - t0}ms → matched`)
      if (!onBestPhotoUri) await deleteAsync(detected.photoUri, { idempotent: true })
      return { type: 'matched', medicationId, embedding: lastMatchedEmbedding, score: lastMatchedScore }
    }
  }

  console.log(`[SCAN] total: ${Date.now() - t0}ms → unmatched`)
  if (!onBestPhotoUri) await deleteAsync(detected.photoUri, { idempotent: true })
  return { type: 'unmatched', embedding: [], score: globalBestScore }
}

export async function captureReferenceImage(params: {
  imageUri: string
  frameWidth: number
  frameHeight: number
  doseCount: number
  onDebugInfo?: (info: ScanDebugInfo) => void
}): Promise<CaptureReferenceResult> {
  const { uri: guideUri, cropSize, cropStartX, cropStartY, actualW, actualH } =
    await cropGuideFrame(params.imageUri)
  const boxes = await detectPills(guideUri, cropSize, cropSize)

  if (params.onDebugInfo) params.onDebugInfo({
    photoUri: params.imageUri,
    actualW,
    actualH,
    cropSize,
    cropStartX,
    cropStartY,
    bboxes: boxes.map(b => toOriginalCoords(b, cropStartX, cropStartY)),
    guideUri: __DEV__ ? guideUri : undefined,
  })

  if (boxes.length === 0) {
    await deleteAsync(guideUri, { idempotent: true })
    return { ok: false, reason: 'no_pill' }
  }

  // Registration is conservative: save refs only when the expected dose count is visible.
  const validBoxes = boxes.filter(box =>
    box.confidence >= SCAN_CONFIG.MIN_CONFIDENCE && !isBboxTooSmall(box, cropSize),
  )
  if (validBoxes.length < params.doseCount) {
    await deleteAsync(guideUri, { idempotent: true })
    return { ok: false, reason: validBoxes.length === 0 ? 'no_pill' : 'too_small' }
  }

  const origDestUri = `${documentDirectory ?? ''}orig_${randomUUID()}.jpg`
  await copyAsync({ from: params.imageUri, to: origDestUri })

  // Extract embedding for top N boxes (N = doseCount)
  const targetBoxes = validBoxes.slice(0, params.doseCount)
  const embeddings: number[][] = []
  let displayCroppedUri: string | null = null
  const devCroppedUris: string[] = []

  try {
    for (let i = 0; i < targetBoxes.length; i++) {
      const box = targetBoxes[i]
      const tmpUri = await cropToBbox(
        guideUri,
        box,
        Math.round(box.width * SCAN_CONFIG.BBOX_PADDING_RATIO),
        cropSize,
        cropSize,
      )
      if (i === 0) {
        // First crop: persist as display thumbnail
        const destUri = `${documentDirectory ?? ''}ref_${randomUUID()}.jpg`
        await copyAsync({ from: tmpUri, to: destUri })
        await deleteAsync(tmpUri, { idempotent: true })
        displayCroppedUri = destUri
        embeddings.push(await extractEmbedding(destUri))
        if (__DEV__) devCroppedUris.push(destUri)
      } else {
        // Additional crops: extract embedding, keep alive in __DEV__ for inspection
        embeddings.push(await extractEmbedding(tmpUri))
        if (__DEV__) {
          devCroppedUris.push(tmpUri)
        } else {
          await deleteAsync(tmpUri, { idempotent: true })
        }
      }
    }
  } catch (e) {
    await Promise.all([
      deleteAsync(origDestUri, { idempotent: true }),
      displayCroppedUri ? deleteAsync(displayCroppedUri, { idempotent: true }) : Promise.resolve(),
      ...(devCroppedUris.slice(1).map(u => deleteAsync(u, { idempotent: true }))),
    ])
    await deleteAsync(guideUri, { idempotent: true })
    throw e
  }

  await deleteAsync(guideUri, { idempotent: true })
  return {
    ok: true,
    originalUri: origDestUri,
    croppedUri: displayCroppedUri!,
    embeddings,
    devCroppedUris: __DEV__ ? devCroppedUris : undefined,
  }
}
