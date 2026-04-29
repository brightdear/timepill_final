import { Platform } from 'react-native'

const platformScanTuning = Platform.select({
  ios: {
    CAMERA_ZOOM: 0.32,
    CROP_RATIO: 0.68,
  },
  default: {
    CAMERA_ZOOM: 0.2,
    CROP_RATIO: 0.75,
  },
})!

export const SCAN_CONFIG = {
  // 개별 알약 인증 threshold — HIGH_THRESHOLD를 넘은 box만 카운트에 포함
  HIGH_THRESHOLD: 0.70,
  // 등록 알약 수 대비 인증 통과 비율 — ceil(doseCount * COUNT_RATIO)개 이상이면 matched
  COUNT_RATIO: 0.60,
  // 참조사진 매칭 로직 (3장 이하: max / 4장 이상: 최저 1개 제거 후 평균)에 사용하는 threshold
  // HIGH_THRESHOLD와 동일하게 유지. 별도 조정 필요 시 분리.
  SIMILARITY_THRESHOLD: 0.70,
  MIN_REFERENCE_IMAGES: 3,
  MAX_REFERENCE_IMAGES: 10,
  // UI 가이드 네모 크기 비율 (Math.min(frameW, frameH) * CROP_RATIO)
  CROP_RATIO: platformScanTuning.CROP_RATIO,
  CAMERA_ZOOM: platformScanTuning.CAMERA_ZOOM,
  YOLO_INPUT_SIZE: 640,
  MOBILENET_INPUT_SIZE: 160,
  HIGH_DOSE_WARNING_COUNT: 5,   // 5정 이상 시 스캔 경고 문구 표시
  BBOX_PADDING_RATIO: 0.10,     // squarified bbox 변의 10% — 기기 해상도에 무관하게 일정 비율
  // 가이드 crop 기준 정규화 최소 bbox 크기 — 이 미만이면 MobileNet 투입 막고 재촬영 안내
  MIN_BBOX_W_NORM: 0.03,        // bbox.width / cropSize
  MIN_BBOX_H_NORM: 0.02,        // bbox.height / cropSize
} as const
