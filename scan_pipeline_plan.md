# Scan Pipeline Plan

작성일: 2026-04-23

---

## 변경 이력

| 날짜 | 주석 내용 | 반영 사항 |
|--|--|--|
| 2026-04-23 | `boxes.length == 0`이 아니라 `boxes.length != doseCount`일 때 재촬영 안내 | 3-B 스캔 흐름 수정 |
| 2026-04-23 | 학습 파라미터 나중에 수정 예정 | Section 6 학습 파라미터 TBD 표시 |
| 2026-04-23 | "건드리지 않는 파일"도 typecheck 등 위해 읽어봐야 함 | Section 7 섹션명 및 설명 수정 |

---

## 1. 현황 진단

### 근본 문제: 학습 / inference 분포 불일치

| | 기존 학습 | 기존 inference |
|--|--|--|
| 입력 이미지 | 원본 전체 사진 | 가이드 crop 정사각형 |
| 알약 상대 크기 | 프레임 대비 작음 | 프레임 대비 큼 |
| 결과 | confidence ≈ 0.0008 | 탐지 불가 |

**해결 방향**: 학습도 inference와 동일하게 가이드 crop된 이미지로 맞춘다.

### 복구 불가 파일
`assets/models/yolo11n_int8.tflite` — 원본(0.821 conf) 덮어씌워짐. 재학습 필요.

---

## 2. 확정된 결정 사항

| 항목 | 결정 |
|--|--|
| 버스트 촬영 (3장) | 폐기 → 단일 촬영 |
| 실시간 YOLO polling | 제거 |
| 카메라 zoom | 2x (CameraView zoom prop) |
| 가이드 박스 비율 | 75% (CROP_RATIO = 0.75 유지) |
| 데이터 수집 모드 | `__DEV__` 일 때만 노출 |
| 학습 순서 | A(기존 데이터 전처리) → B(앱 실데이터 혼합) |

---

## 3. 앱 inference 파이프라인

### 3-A. 등록 (register) 흐름

```
카메라 프리뷰 (guide box UI 표시, zoom 2x)
  │
  ▼ 촬영 버튼
takePictureAsync()
  │
  ▼
cropGuideFrame()
  - Image.getSize() → actualW, actualH
  - cropSize = floor(min(actualW, actualH) * 0.75)
  - manipulateAsync (구 API, EXIF 적용) → guideUri (cropSize×cropSize)
  │
  ▼
YOLO inference
  - imageToFloat32(guideUri, 640) → Float32[640×640×3] normalized [0,1]
  - net.run([...]) → output [1, 5, 8400]
  - auto-detect: numAnchors, outputLayout, confMode
  - decode: cx, cy, bw, bh (normalized) × cropSize → pixel coords
  - filter: conf ≥ 0.25
  - NMS: IoU 0.45
  → BboxResult[] (guide-crop 기준 픽셀 좌표)
  │
  ▼
각 bbox에 대해:
  - isBboxTooSmall? → skip
  - toOriginalCoords(box, cropStartX, cropStartY) → 원본 이미지 기준 좌표
  - cropToBbox(원본uri, originalBox, padding=20) → croppedUri
  - MobileNet embedding → number[576]
  - 저장
  │
  ▼
반복 (총 3~10회 촬영, 최대 100개 bbox embedding 누적)
3회 이상 → 완료 버튼 활성화
```

**주의**: 1번 촬영에 알약이 1~10개 있을 수 있음. 각 bbox마다 embedding 1개.

### 3-B. 스캔 (scan) 흐름

```
카메라 프리뷰 (guide box UI 표시, zoom 2x)
doseCount개 알약을 guide box 안에 전부 놓기
  │
  ▼ 촬영 버튼
takePictureAsync()
  │
  ▼
cropGuideFrame() → guideUri
  │
  ▼
YOLO inference → BboxResult[] (guide-crop 기준)
  │
  ▼
boxes.length != doseCount → no_pill → 재촬영 안내
  ("알약 N개를 가이드 안에 놓고 다시 찍어주세요")
  │
  ▼
topBoxes = boxes[0..doseCount-1]  (confidence 내림차순)

for box in topBoxes:
  - isBboxTooSmall? → pill_too_small → 재촬영 안내
  - toOriginalCoords → originalBox
  - cropToBbox → croppedUri
  - MobileNet embedding
  - computeMatchScore(embedding, referenceEmbeddings)
  - score >= HIGH_THRESHOLD(0.70) → matchedCount++

required = ceil(doseCount * COUNT_RATIO(0.60))
matchedCount >= required → matched (인증 통과)
미달 → unmatched → 재촬영 안내
```

### 3-C. 실패 처리

| 결과 | 안내 메시지 | 처리 |
|--|--|--|
| no_pill | "알약이 감지되지 않았습니다. 가이드 안에 알약이 보이도록 다시 찍어주세요." | 재촬영 |
| pill_too_small | "알약이 너무 작습니다. 더 가까이서 찍어주세요." | 재촬영 |
| unmatched | "알약을 확인할 수 없습니다. 다시 찍어주세요." | 재촬영 |

---

## 4. 좌표계 정리

```
원본 이미지 (actualW × actualH)
  └─ guide crop 시작점: (cropStartX, cropStartY)
       └─ guide crop 영역: cropSize × cropSize
            └─ YOLO 입력: 640 × 640 (리사이즈)
                 └─ YOLO 출력: cx, cy, bw, bh (normalized [0,1], 640 기준)
                      ↓ × cropSize
                      픽셀 좌표 (guide-crop 기준)
                      ↓ + cropStartX, cropStartY
                      픽셀 좌표 (원본 이미지 기준)
                      ↓ cropToBbox
                      알약 단일 crop → MobileNet
```

---

## 5. dev 모드 기능

`__DEV__ === true` 일 때만 노출:

- **bbox overlay**: 촬영 후 guide crop 이미지 위에 탐지된 bbox 시각화
- **데이터 수집 버튼**: guide crop 이미지 (640×640) 를 `documentDirectory/training_data/` 에 저장
  - 파일명: `{YYYYMMDD_HHMMSS}_{index}.jpg`
  - 나중에 이 이미지들을 라벨링해서 학습 데이터로 사용

---

## 6. 모델 학습 계획

### Phase A: 기존 데이터 전처리 변환

`pill.yolov8` 실사 이미지에 guide crop 시뮬레이션 적용:

```
원본 이미지 (W × H) + YOLO 라벨 (cx, cy, bw, bh normalized)
  │
  ▼
guide crop 시뮬레이션
  - cropSize = floor(min(W, H) * 0.75)
  - cropStartX = floor((W - cropSize) / 2)
  - cropStartY = floor((H - cropSize) / 2)
  │
  ▼
이미지: 중앙 정사각형 crop → 640×640 리사이즈
라벨 변환:
  - 원본 좌표 → 픽셀 좌표 (× W, × H)
  - guide crop 기준으로 이동 (- cropStartX, - cropStartY)
  - 다시 정규화 (/ cropSize)
  - crop 영역 밖 bbox 필터링
  │
  ▼
학습 데이터 (guide-crop 640×640 + 변환된 라벨)
```

`build_real_prototype_dataset.py` 에 `--guide-crop` 옵션으로 추가.

### Phase B: 앱 실데이터 혼합

1. 앱 dev 모드에서 guide crop 이미지 수집 (`training_data/` 폴더)
2. Roboflow 또는 LabelImg로 라벨링 (class 0: pill)
3. Phase A 데이터와 혼합해서 재학습
4. export: `yolo11n_int8.tflite` → `assets/models/` 교체

### 학습 파라미터 (TBD — 추후 수정 예정)

- 모델: yolo11n.pt
- input size: 640×640
- epochs: 40
- batch: 16
- export: TFLite int8

---

## 7. 파일 작업 목록

### 재작성 대상

| 파일 | 작업 |
|--|--|
| `src/domain/scan/yoloPillDetector.ts` | 재작성 |
| `src/domain/scan/runScanInference.ts` | 재작성 (burst 제거, 단일 촬영) |
| `src/domain/scan/trainingDataCollector.ts` | 신규 (dev 모드 데이터 수집) |
| `app/(tabs)/register.tsx` | 카메라 zoom 2x, guide box UI, dev overlay 유지 |
| `app/scan.tsx` | polling 제거, 단순 촬영→inference→결과 |
| `ml/0422/build_real_prototype_dataset.py` | guide crop 전처리 옵션 추가 |

### 코드 수정 없음 (읽기 필요 — typecheck·타입 연동 확인용)

| 파일 | 비고 |
|--|--|
| `src/utils/imageUtils.ts` | 정상 동작 |
| `src/domain/scan/mobilenetEmbedder.ts` | 정상 동작 |
| `src/domain/scan/scanInferenceBridge.ts` | 타입 정의만 |
| `src/utils/similarity.ts` | 정상 동작 |
| `src/constants/scanConfig.ts` | 이미 최신화됨 |
| MobileNet 모델 파일 | 유지 |
