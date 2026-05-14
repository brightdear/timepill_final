import { imageToFloat32 } from '@/utils/imageUtils'
import type { BboxResult } from './scanInferenceBridge'
import { loadTfliteModelAsset, type TfliteModelLike } from './tfliteRuntime'

const INPUT_SIZE = 640
const CONF_THRESHOLD = 0.50
const NMS_IOU_THRESHOLD = 0.45

let model: TfliteModelLike | null = null

const DETECTOR_MODEL_ASSET = require('../../../assets/models/real_float32.tflite')

async function getModel(): Promise<TfliteModelLike> {
  if (!model) {
    model = await loadTfliteModelAsset(
      DETECTOR_MODEL_ASSET,
    )
  }
  return model
}

type OutputLayout = 'anchor-major' | 'channel-major'
type ConfidenceMode = 'logit' | 'probability'

// Infer numAnchors from output shape: [1, 5, N] → N, [1, N, 5] → N
function inferNumAnchors(shape?: number[]): number {
  if (shape?.length) {
    const last = shape.slice(-2)
    if (last[0] === 5 && last[1] > 5) return last[1]
    if (last[1] === 5 && last[0] > 5) return last[0]
  }
  return 8400
}

function inferOutputLayout(shape?: number[]): OutputLayout {
  if (shape?.length) {
    const last = shape.slice(-2)
    if (last[0] === 5 && last[1] > 5) return 'channel-major'
    if (last[1] === 5 && last[0] > 5) return 'anchor-major'
  }
  return 'channel-major'
}

// Check if confidence values are already probabilities [0,1] or raw logits
function inferConfidenceMode(flat: Float32Array, layout: OutputLayout, numAnchors: number): ConfidenceMode {
  let min = Infinity, max = -Infinity
  for (let i = 0; i < numAnchors; i++) {
    const conf = layout === 'channel-major'
      ? flat[4 * numAnchors + i]
      : flat[i * 5 + 4]
    if (!Number.isFinite(conf)) continue
    if (conf < min) min = conf
    if (conf > max) max = conf
  }
  return min >= 0 && max <= 1 ? 'probability' : 'logit'
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x))
}

function computeIoU(a: BboxResult, b: BboxResult): number {
  const ax2 = a.x + a.width, ay2 = a.y + a.height
  const bx2 = b.x + b.width, by2 = b.y + b.height
  const ix1 = Math.max(a.x, b.x), iy1 = Math.max(a.y, b.y)
  const ix2 = Math.min(ax2, bx2), iy2 = Math.min(ay2, by2)
  const inter = Math.max(0, ix2 - ix1) * Math.max(0, iy2 - iy1)
  const union = a.width * a.height + b.width * b.height - inter
  return union <= 0 ? 0 : inter / union
}

function applyNMS(boxes: BboxResult[]): BboxResult[] {
  const sorted = [...boxes].sort((a, b) => b.confidence - a.confidence)
  const kept: BboxResult[] = []
  for (const box of sorted) {
    if (kept.every(k => computeIoU(k, box) < NMS_IOU_THRESHOLD)) kept.push(box)
  }
  return kept
}


export async function detectPills(
  imageUri: string,
  frameWidth: number,
  frameHeight: number,
): Promise<BboxResult[]> {
  const net = await getModel()
  const pixels = await imageToFloat32(imageUri, INPUT_SIZE)
  if (__DEV__) {
    const sample = Array.from(pixels.slice(0, 9)).map(v => v.toFixed(3))
    console.log('[YOLO] pixel sample (first 9):', sample, 'total:', pixels.length)
    console.log('[YOLO] input tensor:', JSON.stringify(net.inputs?.[0]))
  }

  const outputBuffers = await net.run([pixels.buffer as ArrayBuffer])
  const flat = new Float32Array(outputBuffers[0])

  const outputShape = net.outputs?.[0]?.shape
  const numAnchors = inferNumAnchors(outputShape)
  const layout = inferOutputLayout(outputShape)
  const confMode = inferConfidenceMode(flat, layout, numAnchors)

  if (__DEV__) {
    console.log('[YOLO] output shape:', outputShape, '→ numAnchors:', numAnchors, 'layout:', layout, 'confMode:', confMode)
    let topConf = 0
    for (let i = 0; i < numAnchors; i++) {
      const c = layout === 'channel-major' ? flat[4 * numAnchors + i] : flat[i * 5 + 4]
      if (Number.isFinite(c) && c > topConf) topConf = c
    }
    console.log('[YOLO] top raw confidence:', topConf.toFixed(4))
  }

  const boxes: BboxResult[] = []
  for (let i = 0; i < numAnchors; i++) {
    let cx: number, cy: number, bw: number, bh: number, rawConf: number
    if (layout === 'channel-major') {
      cx      = flat[0 * numAnchors + i]
      cy      = flat[1 * numAnchors + i]
      bw      = flat[2 * numAnchors + i]
      bh      = flat[3 * numAnchors + i]
      rawConf = flat[4 * numAnchors + i]
    } else {
      cx      = flat[i * 5 + 0]
      cy      = flat[i * 5 + 1]
      bw      = flat[i * 5 + 2]
      bh      = flat[i * 5 + 3]
      rawConf = flat[i * 5 + 4]
    }
    const conf = confMode === 'logit' ? sigmoid(rawConf) : rawConf
    if (!Number.isFinite(conf) || conf < CONF_THRESHOLD) continue

    const x      = Math.max(0, cx - bw / 2) * frameWidth
    const y      = Math.max(0, cy - bh / 2) * frameHeight
    const right  = Math.min(1, cx + bw / 2) * frameWidth
    const bottom = Math.min(1, cy + bh / 2) * frameHeight
    const width  = right - x
    const height = bottom - y
    if (width <= 0 || height <= 0) continue

    boxes.push({ x, y, width, height, confidence: conf })
  }

  const result = applyNMS(boxes)
  if (__DEV__) {
    console.log('[YOLO] detections after NMS:', result.length)
  }
  return result
}
