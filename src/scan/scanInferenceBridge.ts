export interface BboxResult {
  x: number      // pixels, in original frame coords
  y: number
  width: number
  height: number
  confidence: number
}

// Platform-agnostic interface — Android: TFLite, iOS: Core ML (future)
export interface ScanInferenceBridge {
  detectPills(imageUri: string): Promise<BboxResult[]>
  extractEmbedding(croppedUri: string): Promise<number[]>
}
