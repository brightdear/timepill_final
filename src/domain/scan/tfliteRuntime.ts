import { isRunningInExpoGo } from 'expo'

export const EXPO_GO_TFLITE_MESSAGE =
  '이 스캔 기능은 Expo Go에서 동작하지 않습니다. iPhone에서는 development build 또는 prebuild 후 실행해주세요.'

type TensorInfo = {
  shape?: number[]
}

export interface TfliteModelLike {
  run(inputs: ArrayBuffer[]): Promise<ArrayBuffer[]>
  inputs?: TensorInfo[]
  outputs?: TensorInfo[]
}

type TfliteModule = {
  loadTensorflowModel: (
    asset: number,
    delegates: unknown[]
  ) => Promise<TfliteModelLike>
}

function getTfliteModule(): TfliteModule {
  if (isRunningInExpoGo()) {
    throw new Error(EXPO_GO_TFLITE_MESSAGE)
  }

  try {
    // Lazy require prevents Expo Go from crashing during module evaluation.
    return require('react-native-fast-tflite') as TfliteModule
  } catch {
    throw new Error(EXPO_GO_TFLITE_MESSAGE)
  }
}

export async function loadTfliteModelAsset(asset: number): Promise<TfliteModelLike> {
  const { loadTensorflowModel } = getTfliteModule()
  return loadTensorflowModel(asset, [])
}
