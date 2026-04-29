import { readAsStringAsync } from 'expo-file-system/legacy'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const jpegJs = require('jpeg-js') as {
  decode: (data: Uint8Array, opts?: { useTArray?: boolean }) => {
    width: number
    height: number
    data: Uint8Array
  }
}

const IMAGENET_MEAN = [0.485, 0.456, 0.406] as const
const IMAGENET_STD = [0.229, 0.224, 0.225] as const

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// Resize to targetSize×targetSize, decode JPEG, return Float32[HWC-RGB] normalized [0,1]
export async function imageToFloat32(uri: string, targetSize: number): Promise<Float32Array> {
  const ref = await ImageManipulator.manipulate(uri)
    .resize({ width: targetSize, height: targetSize })
    .renderAsync()
  const resized = await ref.saveAsync({ format: SaveFormat.JPEG, base64: true })

  const b64 = resized.base64
  if (!b64) throw new Error('imageToFloat32: base64 missing from manipulator result')

  const jpegBytes = base64ToUint8Array(b64)
  const { data } = jpegJs.decode(jpegBytes, { useTArray: true })
  // data layout: RGBA interleaved
  const pixels = targetSize * targetSize
  const out = new Float32Array(pixels * 3)
  for (let i = 0; i < pixels; i++) {
    out[i * 3 + 0] = data[i * 4 + 0]
    out[i * 3 + 1] = data[i * 4 + 1]
    out[i * 3 + 2] = data[i * 4 + 2]
  }
  return out
}

// Same but normalized to [-1,1] for MobileNetV3
export async function imageToFloat32Normalized(uri: string, targetSize: number): Promise<Float32Array> {
  const out = await imageToFloat32(uri, targetSize)
  for (let i = 0; i < out.length; i++) out[i] = out[i] * 2 - 1
  return out
}

// ImageNet mean/std normalization for MobileNet training/export parity
export async function imageToFloat32ImageNetNormalized(uri: string, targetSize: number): Promise<Float32Array> {
  const out = await imageToFloat32(uri, targetSize)
  for (let i = 0; i < out.length; i += 3) {
    // ImageNet mean/std assumes channels are already scaled to [0, 1].
    out[i + 0] = ((out[i + 0] / 255) - IMAGENET_MEAN[0]) / IMAGENET_STD[0]
    out[i + 1] = ((out[i + 1] / 255) - IMAGENET_MEAN[1]) / IMAGENET_STD[1]
    out[i + 2] = ((out[i + 2] / 255) - IMAGENET_MEAN[2]) / IMAGENET_STD[2]
  }
  return out
}

export async function readFileAsBase64(uri: string): Promise<string> {
  return readAsStringAsync(uri, { encoding: 'base64' })
}
