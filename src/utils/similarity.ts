export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

export function computeMatchScore(
  scanEmbedding: number[],
  referenceEmbeddings: number[][]
): number {
  if (referenceEmbeddings.length === 0) return 0
  const scores = referenceEmbeddings.map(ref => cosineSimilarity(scanEmbedding, ref))
  if (scores.length <= 3) return Math.max(...scores)
  const sorted = [...scores].sort((a, b) => a - b)
  const trimmed = sorted.slice(1)
  return trimmed.reduce((s, v) => s + v, 0) / trimmed.length
}

