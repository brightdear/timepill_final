import { loadTensorflowModel } from 'react-native-fast-tflite'
import type { TfliteModel } from 'react-native-fast-tflite'
import { imageToFloat32ImageNetNormalized } from '@/utils/imageUtils'

// MobileNetV3 Small — 160×160×3 input, ImageNet mean/std normalized
const INPUT_SIZE = 160

let model: TfliteModel | null = null

async function getModel(): Promise<TfliteModel> {
  if (!model) {
    model = await loadTensorflowModel(
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../../../assets/models/mobilenet_v3_small.tflite'),
      [],
    )
  }
  return model
}

export async function extractEmbedding(croppedUri: string): Promise<number[]> {
  const net = await getModel()
  const pixels = await imageToFloat32ImageNetNormalized(croppedUri, INPUT_SIZE)
  const outputBuffers = await net.run([pixels.buffer as ArrayBuffer])
  return Array.from(new Float32Array(outputBuffers[0]))
}
