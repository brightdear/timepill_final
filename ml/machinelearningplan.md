# Timepill v3 — Machine Learning Plan

작성일: 2026-04-20

---

## 1. 모델 구성

| 역할 | 모델 | 형식 |
|---|---|---|
| 알약 위치 감지 (bbox) | YOLO11n | TFLite int8 |
| 알약 identity 매칭 (embedding) | MobileNetV3 Small | TFLite int8 |

두 모델 모두 완전 온디바이스. 인터넷 불필요.

### 추상화 레이어

```ts
// src/domain/scan/scanInferenceBridge.ts
export interface ScanInferenceBridge {
  detectPill(imageUri: string): Promise<BboxResult | null>
  extractEmbedding(croppedUri: string): Promise<number[]>
}
// Android → TFLite 구현체
// iOS → Core ML 구현체 (추후)
```

---

## 2. 보유 데이터 인벤토리

| 데이터 | 수량 | 특징 |
|---|---|---|
| 실사 알약 사진 | ~190장 | 실환경, 가장 희귀한 데이터 |
| Hard negatives | ~140장 (4알/장) | 알약처럼 생긴 비알약 or 헷갈리는 조합 |
| 40종 다각도 | ~3,000장 | 종당 ~75장, 각도/배경/배열 다양 |
| AIHub 단일약제 50종 | ~10,800장 | 종당 216장, 3고도각 × 18방위 × 4조명 |
| AIHub 조합약제 | ~2,000장 | 503조합 × 3각도, 복수 알약 동시 촬영 |
| 배경없는 샘플 이미지 | ~144장 | 24종 × 앞뒤 6장, 컷아웃 형태 |

### AIHub 데이터 파일명 구조

```
K-012685_0_0_0_0_75_020_200.png
           │       │  │   └─ 크기(200)
           │       │  └───── 방위각(0°~340°, 20° 간격)
           │       └──────── 카메라 고도각(70°/75°/90°)
           └──────────────── 기타 촬영 조건
```

### AIHub JSON 라벨 구조 (COCO format)

```json
{
  "images": [{
    "drug_N": "K-012685",
    "dl_name": "중외에페리손염산염정",
    "drug_shape": "원형",
    "color_class1": "하양",
    "camera_la": 75,
    "camera_lo": 20
  }],
  "annotations": [{
    "bbox": [385, 522, 193, 190]  // [x, y, w, h] COCO format
  }]
}
```

---

## 3. YOLO11n 학습 계획

### 목표

실환경에서 알약 위치(bbox) 정확하게 감지. 단일 클래스 (`nc: 1`, "pill").

### 학습 데이터 구성

| 데이터 | 역할 | 비율 |
|---|---|---|
| 실사 190장 | 핵심 (실환경 = 배포환경) | 우선 |
| Hard negatives 140장 | FP 방지 필수 | 전체의 10~15% |
| 40종 다각도 3,000장 | 주요 학습셋 | 포함 |
| AIHub 단일 70°/75° 이미지 우선 | 핵심 보조 | 30~40% 수준으로 조절 |
| AIHub 단일 90° 이미지 | 보조 | 소량 |
| 합성 데이터 (배경없는 샘플 활용) | 실환경 다양성 보완 | 추가 생성 |

> **카메라 고도각 기준**: 실사용 스캔 각도는 60~75° 범위가 자연스러움. 90° 정수직은 팔꿈치를 꺾어야 해서 비현실적. AIHub 70°/75° 데이터를 핵심으로, 90°는 보조.
>
> **60° 이하 저각도 대응**: AIHub에는 60° 이하 데이터 없음. perspective transform augmentation으로 기존 70° 이미지를 저각도처럼 변환해 커버. 실사 추가 수집 시 저각도도 의도적으로 포함 — 30~50장이면 충분 (부담되면 10종 × 3장).
### COCO → YOLO 라벨 변환

```python
def coco_to_yolo(bbox, img_w, img_h):
    x, y, w, h = bbox
    cx = (x + w / 2) / img_w
    cy = (y + h / 2) / img_h
    return cx, cy, w / img_w, h / img_h
```

### 합성 데이터 생성 (배경없는 샘플 활용)

```python
# 배경없는 알약 컷아웃 → 다양한 배경에 합성
backgrounds = [책상, 손바닥, 흰종이, 타일, ...]
pill_cutout = 배경없는샘플_24종
# → 랜덤 위치/크기/회전으로 합성 → bbox 자동 생성
```

### 과적합 방지

- Mosaic augmentation (YOLO 기본 탑재, 반드시 활성화)
- Hard negatives 비율 유지 (10~15%)
- 검증셋을 **약 종류 기준**으로 격리 (같은 약이 학습/검증에 섞이지 않도록)
- Early stopping (validation loss 기준)
- 배경 랜덤화 augmentation
ㄴ augmentation할 때 휴대폰 그림자 augmentation도 있어야할 것 같은데...? 실 사용 환경에서 휴대폰 그림자가 많이 생기더라. 이거 mobilenet finetuning할 때도 고려해야할까?
ㄴ맞음. 실사용에서 핸드폰이 광원 위에 있으니까 이미지 한 쪽에 반달형 그림자 생기는 거 흔함. YOLO 학습 augmentation에 추가해야 함 (이미지 일부 영역을 랜덤하게 어둡게 처리). MobileNet fine-tuning 때도 동일하게 적용해야 함 — 등록 시 참조사진 augmentation 목록에도 그림자 항목 추가. 아래 augmentation 표에 반영함.

### Augmentation 강화 계획

> [claude] Gemini 분석: 현재 학습 초기 에포크에서 P/R이 0.99에 달하는 건 과적합 신호. albumentations 파라미터가 p=0.01로 전부 너무 낮고, YOLO 내장 augmentation도 보수적. 아래 수치로 강화 필요. **노트북 반영 전 사용자 승인 필요.**

#### YOLO 내장 augmentation (현재 → 권장)

| 파라미터 | 현재 | 권장 | 이유 |
|---|---|---|---|
| `degrees` | 0.0 | 15.0 | 실환경에서 알약이 기울어짐 |
| `translate` | 0.03 | 0.10 | 이동 다양성 |
| `scale` | 0.10 | 0.20 | 카메라 거리 차이 (줌 인/아웃, 카메라 2~3배 줌 고정 고려해 축소) |
ㄴ0.4는 얼마나 줌인 줌 아웃 한거지?? 너무 작은 것까지 검출하려고 하다가 fp가 많아질 것 같은데. 너무 작게 찍히지 않게 ui로 안내할거고, scan, 등록할 때, 자동으로 카메라 2~3배 줌 고정시킬거라서, 알약이 작을 때 너무 줌 아웃은 안 시켰으면 해.
ㄴscale=0.40은 ±40% 크기 변동. 원래 100px 알약이 60px~140px 범위로 학습됨. 카메라 2~3배 줌 고정이면 실환경에서 변동폭이 훨씬 작아지니까 0.40은 과함. **0.15~0.20으로 조정.** 줌아웃보다 줌인 방향 augmentation만 의미있음 (알약이 더 크게 찍히는 경우 커버). 반영: 권장값 0.20으로 수정.
| `hsv_s` | 0.20 | 0.40 | 조명 색온도 차이 |
| `hsv_v` | 0.18 | 0.35 | 밝기 편차 |
ㄴ 이미 밝은 사진에 더 밝게 만들면/ 이미 어두운 사진에 더 어둡게 만들면 문제가 생기지 않아?? 그거 고려해서 밑에 주석 달아줘.
ㄴ맞음. YOLO의 hsv_v는 ±range로 랜덤 적용이라 방향을 제어 못함. 이미 과노출 이미지(픽셀 대부분 230+)에 +35% 주면 255 클리핑 → 정보 손실. 이미 암부 이미지에 -35% 주면 전부 뭉개짐. **YOLO 자체 파라미터로는 해결 불가.** 그래서 밑에 albumentations의 `RandomBrightnessContrast`를 별도로 쓰는 건데, 그것도 동일한 문제가 있음. 실용적 해결책: hsv_v는 0.25 정도로 완화하고, 학습 데이터에 극단적 밝기 이미지가 적게 들어오도록 데이터 단에서 필터링 (EXIF 밝기값 기준으로 상위/하위 5% 제외). MobileNet 등록 augmentation에서는 위에 Section 4 밝기 편향 로직으로 별도 대응.
ㄴ ㄱㅊ네
| `mosaic` | 0.8 | 0.8 | 유지 (적절) |
| `fliplr` | 0.0 | 0.0 | 유지 (인쇄 마킹 보존) |
| `perspective` | 0.0002 | 0.0005 | 저각도 시점 시뮬레이션 |
ㄴ 질문. 알약이 약간 가려질 때도 알약이 한 20% 가려질 때도 학습시키면 좋지 않을까? 네 생각은 어때. 알약들끼리 겹쳐서 or 다른 사물로 가려졌을 때도 인식할 수 있어야한다고 생각하는데.
ㄴ동의. **occlusion augmentation** 이라고 함. YOLO 파라미터 중 `copy_paste` (다른 이미지 객체 붙여넣기)와, albumentations의 `CoarseDropout` (이미지 일부를 회색/검정으로 가리기)으로 구현 가능. 실사용에서 멀티필 슬롯에서 알약끼리 겹치거나 손가락이 일부 가리는 케이스가 실제로 있으니까 넣는 게 맞음. bbox는 그대로이고 이미지만 가려지는 구조라 라벨 변환 없이 바로 적용 가능. `CoarseDropout(max_holes=3, max_height=40, max_width=40, p=0.25)` 정도 추천. 아래 albumentations 표에 추가.
ㄴ 이랬다가 알약 모든 부분을 가리면 어떡함.? 알약의 최대 알약의 40% 가려졌을 때까지만 인식 가능하면 될 것 같은데데
ㄴ맞음. `CoarseDropout`의 `max_holes`와 `max_height/width` 조합으로 제어 가능. 640px 이미지 기준, 알약 bbox 대략 150×150px라고 하면: `max_holes=2, max_height=60, max_width=60` → 최대 2개 구멍이 60×60 = 총 7,200px 가림 / 알약 면적 22,500px → **최대 ~32% 가림.** 이 정도면 40% 이하 조건 충족. 단, 구멍이 bbox 중심에 몰리면 더 가릴 수 있는데, YOLO augmentation 파이프라인에서 `CoarseDropout`은 이미지 전체에 랜덤 배치라 알약만 집중 가리는 케이스는 확률적으로 드묾. 실용적으로 위 파라미터면 충분.


#### albumentations 강화 (현재 p=0.01 → 권장값)

| Transform | 현재 p | 권장 p | 이유 |
|---|---|---|---|
| `Blur` / `MedianBlur` | 0.01 | 0.25 | 카메라 초점 흔들림 |
ㄴ 0.25는 너무 흔들리는거 아냐?? 
ㄴp=0.25는 **확률**임 — 이미지 4장 중 1장에 blur 적용한다는 뜻. blur 강도는 별개 파라미터(`blur_limit`)로 약하게 설정하면 됨. 실환경에서 손 흔들림으로 살짝 흐릿한 경우가 꽤 있어서 p=0.25 자체는 적절함. 다만 `blur_limit=3` (기본 7) 으로 낮게 설정해서 **약하게 흐릿한 것만** 재현. 심하게 흔들린 사진은 사용자가 다시 찍을 테니까 커버할 필요 없음.
| `CLAHE` | 0.01 | 0.20 | 조명 불균일 보정 시뮬레이션 |
| `RandomBrightnessContrast` | (없음) | 0.30 | 실환경 조명 편차 |
ㄴ 위에 밝기에 대한 주석 참조.
ㄴ위 hsv_v 주석 참조. 동일한 클리핑 문제 있음. `brightness_limit=0.2, contrast_limit=0.2` 로 강도를 낮게 유지하고, 데이터 단에서 극단 밝기 이미지 필터링으로 보완.
| `GaussNoise` | (없음) | 0.20 | 저조도 노이즈 |
| `RandomShadow` | (없음) | 0.30 | **핸드폰 그림자** (반달형) |
ㄴ 핸드폰 그림자는 보통 직사각형이야. 반달형의 비율보다 직사각형 그림자가 더 필요해.
ㄴ맞음. `RandomShadow`는 다각형 그림자라 실제 핸드폰 그림자랑 안 맞음. 대신 `CoarseDropout`에 낮은 fill_value(어두운 값)를 주거나, 커스텀으로 이미지 한쪽 가장자리에 직사각형 어두운 오버레이 얹는 방식이 적합. 예: 이미지 상단/좌/우 중 한 면에 높이 10~30%, 투명도 40~70%의 어두운 직사각형 패치. 코드로 구현 필요 (albumentations built-in으로는 정확히 안 맞음). 미결 사항에 추가.
ㄴ 미결이라는 건 네가 구현을 해야한다는거지?
ㄴ아니. 미결 사항 = "아직 결정 안 된 것들" 목록. 구현이 필요한 것도 있고, 논의/결정만 하면 되는 것도 있음. 직사각형 그림자 augmentation은 내가 **코드를 작성**할 수 있는데, 노트북에 넣을지 여부는 너랑 먼저 상의하고 넣는 게 맞음 (노트북은 상의 후 수정 원칙). 단순히 파이썬 함수로 먼저 써두고 확인받는 방식으로 진행할게.
| `CoarseDropout` | (없음) | 0.25 | occlusion augmentation (알약 20% 가림, max_holes=3, max_height=40) |
| `ImageCompression` | (없음) | 0.20 | JPEG 압축 아티팩트 |
ㄴ? 이거는 뭐지.
ㄴJPEG로 저장할 때 품질을 낮추면 이미지가 블록 단위로 뭉개지는 현상 (화질 낮은 사진에서 보이는 그 계단 아티팩트). 카메라 앱마다 JPEG 압축률이 다르고, 캡처 → 앱 전달 과정에서 재압축이 일어날 수 있어서 학습시켜두면 실환경 대응력이 올라감. 영향이 작은 편이라 필요성 낮으면 제외해도 됨.
> `RandomShadow`는 albumentations의 built-in transform. 이미지 일부에 다각형 어두운 패치를 씌워서 핸드폰이 광원 위에 있을 때 생기는 그림자를 시뮬레이션함.

#### AIHub 비율 조절 (중요)

AIHub 단일약제 ~10,800장 vs 실사진 190장 → **57:1 불균형**. AIHub 데이터가 스튜디오 환경이라 이 비율 그대로 학습하면 실환경 성능 저하 필연적.

| 조치 | 방법 |
|---|---|
| AIHub 서브샘플링 | 종당 최대 80장만 사용 (현재 216장 → 50종 × 80장 = 4,000장) |
| 실사진 오버샘플링 | 190장을 augmentation으로 ×10~15배 → 1,900~2,850장으로 취급 |
| Hard negative 비율 | 전체의 10~15% 유지 |

**→ 이 조치들은 현재 학습 실행 중인 노트북에는 미반영. 다음 run 시 적용 논의 필요.**
ㄴ augmentation했을 때 문제점이 생길 수 있다면 어떤 것일까?
ㄴ크게 세 가지:
1. **과도한 augmentation → 학습 수렴 실패.** 너무 왜곡된 이미지를 학습시키면 모델이 패턴을 못 찾음. degrees=15, scale=0.20 정도면 안전하지만, 거기서 더 올리면 loss가 안 내려갈 수 있음.
2. **현실과 다른 augmentation → 오히려 성능 저하.** 예: 알약을 좌우 반전 학습시키면 마킹이 거울상인 이미지에 맞춰버려서 실사용에서 틀림. `fliplr=0.0` 유지한 이유가 이것.
3. **bbox mismatch.** degrees(회전), perspective 등은 bbox 좌표도 같이 변환해줘야 함. YOLO는 자체적으로 처리하지만, 커스텀 augmentation (직사각형 그림자 등) 추가할 때 bbox는 안 건드리는 transform만 써야 함 — 그래서 그림자/블러/밝기는 bbox 좌표 변경 없이 픽셀만 바꾸는 것들로 선택한 것.

### 도메인 갭 주의

AIHub 데이터는 스튜디오 환경 (검은색/회색 배경, 통제 조명). 비중이 너무 높으면 실환경 성능 저하 가능. 실사진 비율을 핵심으로 유지.

---

## 4. MobileNetV3 Fine-tuning 계획

### 목표

알약 이미지를 128-dim embedding 벡터로 변환. 같은 약은 가깝게, 다른 약은 멀게.

### 모델 구조

```python
backbone = MobileNetV3Small(weights='imagenet')
x = backbone.output
x = GlobalAveragePooling2D()(x)
x = Dense(128, activation='relu')(x)
embedding = L2Normalize()(x)  # 128-dim 유닛 벡터

# 1단계: backbone 동결, embedding head만 학습
# 2단계: backbone 마지막 2~3 블록 해제 후 전체 fine-tune
ㄴ 나중에 다른 문서에 이 부분 자세히 설명해주라 나 공부좀 하게(트리플렛로스부분)
ㄴ응. triplet_loss_guide.md 따로 만들어줄게. anchor/positive/negative 개념부터 hard negative mining, margin 의미, 실제 학습 루프까지. 미결 사항에 추가해놓음.
```

### 학습 데이터 구성

| 데이터 | 클래스 수 | 클래스당 이미지 |
|---|---|---|
| 40종 다각도 | 40종 | ~75장 |
| AIHub 단일 50종 | 50종 | 216장 |
| 합계 (겹침 제외 추정) | ~70~90종 | 평균 ~100장 |

### 학습 방법: Triplet Loss

```
Triplet = (anchor, positive, negative)
anchor  = 참조사진 1장
positive = 같은 약, 다른 각도/조명 사진
negative = 다른 약 사진 (hard negative 우선)

Loss = max(d(anchor, positive) - d(anchor, negative) + margin, 0)
```

Hard negative mining: 비슷하게 생긴 흰색 원형 정제끼리를 negative로 활용 → 종간 유사도 문제 직접 대응.

### 참조사진 Augmentation (등록 시 1회 실행)

등록 시 참조사진 1장당 augmentation 적용 후 embedding 저장. 이미지가 아닌 **embedding만 저장** (128 float ≈ 512B).

| Augmentation | 강도 | 이유 |
|---|---|---|
| 밝기 ±25% | 강 | 조명 차이 커버 |
| 대비 조정 | 강 | 조명 차이 커버 |
| 회전 ±20° | 중 | 촬영 각도 차이 |
| Gaussian blur (약) | 약 | 초점 차이 |
| Zoom crop | 중 | 크기 차이 |
| 색조 shift (소량) | 매우 약 | 화이트밸런스 차이 |
| 그림자 오버레이 | 중 | 핸드폰 그림자 커버 |

> **밝기 augmentation 방향 조정**: 등록 이미지의 평균 밝기를 측정 후 augmentation 범위를 편향.
> 밝은 이미지(avg > 180): -40% ~ -5% (밝은 쪽은 이미 커버됨, 어두운 쪽 위주로)
> 어두운 이미지(avg < 80): +5% ~ +40% (반대 방향)
> 보통 이미지: 기존 ±25% 대칭 유지.
ㄴ맞는 직관임. ±25% 대칭으로 무조건 augment하면, 이미 과노출된 이미지에 +25% 추가할 때 픽셀이 255로 클리핑되면서 정보 손실 나고 쓸모없는 샘플이 됨. 평균 밝기 체크해서 augmentation 방향 편향시키는 거 구현 비용 낮고 효과 확실함. 등록 시 1회만 실행하니까 성능 부담도 없음. 반영함.
> 좌우 반전 제외: 인쇄 마킹 있는 약에서 오인식 위험.
> 색조는 아주 작게: 색이 알약 식별의 핵심 특징.
ㄴ 위에 말했던 그림자 augmentation..다시한 번 고려 부탁.
ㄴ위 augmentation 표에 추가했음. 등록 시 참조사진에도 그림자 오버레이 augmentation 포함. 이미지 랜덤 영역에 반투명 어두운 패치 얹는 방식으로 구현하면 됨.

---

## 5. 스캔 파이프라인

### 참조사진 등록 (약 등록 시)

```
사진 찍기 (3~10장)
  → YOLO11n → bbox 감지
  → bbox 없음 → "알약이 감지되지 않았어요" 피드백
  → bbox 있음 → 사각형 crop 저장 (cropped_uri)
              → Augmentation 적용 (1장 → 8장)
              → MobileNetV3 → embedding 추출
              → DB 저장 (원본 crop URI + embedding JSON)
```
ㄴbbox 여러개 있는데 알약 n개 맞냐고 물어보기.
ㄴ반영. 등록 플로우에서 YOLO가 N개 감지하면 "알약 N개가 감지되었습니다. 맞습니까?" 확인 후 저장. 이 N이 멀티필 슬롯의 registered_count로 기록됨.
ㄴ아니면 다시 스캔해주시길 바랍니다. 하는 거 맞지?
ㄴ맞음. "아니오" 선택 시 → "약을 다시 배치하고 촬영해주세요" → 재촬영. 확인 전까지는 저장 안 함.



### 인증 스캔 (복용 확인 시)

```
카메라 촬영 (expected_count = timeslot.pillCount)
  → YOLO11n (threshold 낮게 0.2~0.3) → bbox 감지
  → 알약 없음 → 인식 실패, 재시도 유도 (수동확인 없음)
  → 알약 있음 → bbox crop → MobileNetV3 → embedding 추출
              → 타임슬롯 약 종류에 따라 분기:
                [단일 약] 해당 약 참조 embedding과만 비교 → pass / fail
                [멀티필]  등록된 모든 약 참조 embedding과 비교
                          expected_count = timeslot.pillCount 기준으로 Section 6 멀티필 로직
```

---

## 6. 유사도 판단 로직

### 단일 약 슬롯

타임슬롯에 약이 1종만 등록된 경우. 스캔 컨텍스트에 어떤 약인지 이미 알고 있으므로 해당 약의 참조 embedding과만 비교.

> YOLO 감지 결과에서 max 유사도가 HIGH_THRESHOLD 이상이면 인증 완료.

### 멀티필 슬롯

타임슬롯에 약이 2종 이상 등록된 경우 (처방약 등).

**핵심 가정:** 사용자는 처방약을 악의적으로 일부만 보여주거나 틀린 약을 섞지 않는다. 검증 실패는 악의가 아닌 감지 노이즈에서 온다.
ㄴ 핵심 가정 하나 더 악의적인 유저는 보통 알약 검증하기 귀찮아서 근처 다른 사물을 보여주는 경우라서... 근데 판단 기준 저걸로 대부분은 거를 수 있을 것 같다.
ㄴ맞음. 추가 가정 반영: "악의적 사용은 주로 귀찮아서 주변 사물을 보여주는 형태." 그 경우 HIGH_THRESHOLD 0.70을 랜덤 사물이 넘을 가능성은 매우 낮음. 정밀하게 속이려면 오히려 약을 직접 들고 찍는 게 더 쉬움 — 즉 속이려는 시도 자체가 복용을 유도함.
**판단 기준:**

YOLO가 감지한 각 box에 대해, 등록된 모든 참조 embedding과 비교한 최대 유사도를 계산한다. 이 최대 유사도가 HIGH_THRESHOLD 이상인 box의 수가 등록된 알약 수의 COUNT_RATIO 이상이면 인증 완료.

- 단추나 이물질은 HIGH_THRESHOLD를 넘지 못하므로 자동으로 제외됨
- 별도의 count_ok 조건 불필요 — HIGH_THRESHOLD 통과 수가 이미 count를 함의함

**임시 기준값 (FP/FN 데이터 축적 후 조정):**

| 파라미터 | 초기값 | 역할 |
|---|---|---|
| HIGH_THRESHOLD | 0.70 | 개별 알약 인증 기준 |
| COUNT_RATIO | 0.60 | 등록 알약 대비 인증 완료 비율 |

예시: 5알 등록 → 3알 이상이 0.70 넘으면 통과. 3알 등록 → 2알 이상이 0.70 넘으면 통과.

> 모든 threshold는 dev 모드 FP/FN 비율을 보고 조정. 지금 값은 가설.

### YOLO bbox → MobileNet crop 좌표 변환

#### 배경: letterbox 문제

YOLO는 640×640 정사각형 입력만 받는다. 카메라 원본(예: 1920×1080)을 그대로 주면 비율이 깨지므로, 비율을 유지한 채 축소 후 남는 공간을 회색 바로 채우는 letterbox 방식을 사용한다.

```
원본 1920×1080
    ↓ 비율 유지 축소 → 640×360
    ↓ 위아래 140px씩 회색 바 추가
    ↓ 640×640 완성
```

이 경우 YOLO가 출력하는 bbox 좌표는 640×640 기준이므로, 원본에서 crop하려면 역변환(scale 복원 + 패딩 제거)이 필요하다.

```
scale  = min(640/1920, 640/1080) = 0.333
pad_x  = (640 - 1920 × scale) / 2 = 80
pad_y  = (640 - 1080 × scale) / 2 = 0
orig_x = (bbox_x - pad_x) / scale
orig_y = (bbox_y - pad_y) / scale
```

---

#### 채택 방식: UI 중앙 네모 crop 선제 적용

카메라 전체 프레임을 YOLO에 넘기는 대신, 스캔 UI의 중앙 가이드 네모 영역만 먼저 crop한 뒤 YOLO에 넘긴다. 등록과 인증 스캔 모두 동일하게 적용한다.

```
카메라 원본 (예: 1920×1080)
    ↓
[UI 중앙 가이드 네모] — 유저가 알약을 이 안에 맞춰 찍음
    ↓ 해당 영역만 crop (예: 700×700)
    ↓ 이미 정사각형에 가까움 → YOLO letterbox 패딩 0 또는 무시 가능
    ↓ YOLO 640×640 입력
    ↓ YOLO bbox 출력 (640×640 기준)
    ↓ 역변환: crop 영역 기준 좌표 → 원본 좌표
        orig_x = crop_start_x + bbox_x_normalized × crop_width
        orig_y = crop_start_y + bbox_y_normalized × crop_height
    ↓ 원본에서 알약 단위 crop
    ↓ 160×160 resize → MobileNet 입력
```

letterbox 역변환이 단순한 offset + scale로 줄어든다. crop 영역이 정사각형이면 letterbox 패딩 자체가 0이 된다.

---

#### 이 방식의 장점

| 항목 | 전체 프레임 방식 | UI crop 선제 적용 방식 |
|---|---|---|
| letterbox 역변환 | scale + padding 계산 필요 | offset 덧셈만으로 충분 |
| YOLO 처리 영역 | 전체 1920×1080 | 가이드 네모 안만 |
| 추론 속도 | 상대적으로 느림 | 빠름 |
| 유저 행동 유도 | 어디 놓을지 불분명 | 네모 안에 맞추도록 자연스럽게 유도 |
| 배경 노이즈 | 많음 | 적음 (네모 밖 배경 제거됨) |

---

#### 앱 구현 시 주의사항

- UI 가이드 네모는 **정사각형** 권장. 직사각형이면 미세한 letterbox 패딩이 생기지만 무시 가능한 수준.
- 가이드 네모 크기는 화면 짧은 변의 70~80% 정도가 적당. 너무 작으면 알약이 작게 찍혀 YOLO 감지율 저하.
- YOLO bbox를 MobileNet에 넘길 때 10~20px 여유(padding) 추가 권장. 경계 알약의 특징이 잘려나가는 것을 방지.
- 등록 시와 인증 시 모두 동일한 crop 로직을 사용해야 embedding 공간이 일관됨.

**Edge Case 1 — padding Out-of-Bounds:**

알약이 프레임 모서리에 바짝 붙어 있을 때, padding을 더하면 원본 이미지 범위를 벗어나는 음수 좌표 또는 초과 좌표가 생긴다. 반드시 클리핑 처리가 필요하다. 없으면 앱 크래시.

```js
const cropX = Math.max(0, bboxX - padding);
const cropY = Math.max(0, bboxY - padding);
const cropW = Math.min(frameWidth  - cropX, bboxW + padding * 2);
const cropH = Math.min(frameHeight - cropY, bboxH + padding * 2);
```

**Edge Case 2 — Android 기기별 해상도 파편화:**

카메라 원본 해상도가 기기마다 다르다. 1920×1080(16:9)으로 오는 기기도 있고, 4:3 비율로 오는 기기도 있다. `crop_offset`을 고정값으로 하드코딩하면 일부 기기에서 가이드 네모 위치가 틀어진다.

매 프레임마다 카메라 원본 `width / height`를 동적으로 읽어서 중앙 좌표를 계산해야 한다.

```js
// 매 프레임마다 동적 계산
const cropSize = Math.min(frameWidth, frameHeight) * 0.75;
const cropStartX = (frameWidth  - cropSize) / 2;
const cropStartY = (frameHeight - cropSize) / 2;
```

---
ㄴ 스캔할 때 yolo는 박스를 잘 치는 게 우선이어야하나? yolo의 threshold도 고민해봐야할 문제이네.
ㄴ맞음. YOLO에도 confidence threshold가 있음 (기본 0.25). 이게 낮으면 단추 같은 것도 박스 치고, 높으면 진짜 알약을 놓침. 우리 파이프라인에서는 MobileNet이 2차 필터 역할을 하니까 YOLO threshold는 낮게 (0.2~0.3) 유지하고 박스를 넉넉히 잡는 게 맞음. 놓치는 것보다 MobileNet이 걸러내는 구조가 더 안전함. 미결 사항에 추가.
ㄴ 근데 우리 등록할 때에도 yolo를 사용하잖아 그때는 threshold가 적절 수준으로 높아야하지 않을까? -> 1개인데 threshold가 낮아서 2개~3개로 인식해버리면 곤란하잖아.
ㄴ맞음. YOLO threshold를 용도별로 분리해야 함. 등록 시에는 높게 (0.5+) 잡아서 확실한 박스만 감지, 인증 스캔 시에는 낮게 (0.2~0.3) 잡아서 MobileNet에 넘기는 구조.
ㄴ생각해보니까 우리 timeslot에 몇 정 먹는지 넣어놨잖아. 그거 이용하면 되겠다. 위에 주석에도 넣으면 될 거 같은데???
ㄴ완전 맞음. timeslot.pillCount가 expected_count 역할을 함. 인증 스캔 시 registered_count를 별도로 관리할 필요 없이 타임슬롯에서 바로 읽으면 됨. Section 5 인증 스캔 파이프라인과 Section 6 판단 로직 모두 이걸 기준으로 쓰면 됨. Section 5 파이프라인에 반영함.

## 7. Hungarian Algorithm (조건부)

**다중 알약 동시 스캔 기능 구현 시** 적용.

```
YOLO가 한 프레임에서 알약 N개 감지
등록된 약 M개 존재
→ Hungarian algorithm으로 N:M 최적 1:1 assignment
→ 각 감지 알약 → 가장 적합한 등록약 매핑
```

현재 범위 밖. 한 타임슬롯 내 약 전체를 Section 6 멀티필 로직으로 처리하므로 Hungarian 불필요. 향후 "복수 타임슬롯 동시 인증" 기능 추가 시 재검토.
---

## 8. 단계별 학습 전략

### 학습 우선순위

```
1단계: 40종 + AIHub 50종으로 triplet fine-tuning → 앱에 붙이기
2단계: 전체 AIHub 데이터 처리 완료 후 수백 종으로 확장
```

> 상용화 시 AIHub 상업 라이센스 취득 또는 자체 데이터 구축 필요.
---

## 9. iOS / Android 전략

| | Android | iOS |
|---|---|---|
| YOLO | TFLite | TFLite 또는 Core ML 변환 |
| MobileNetV3 | TFLite | Core ML 변환 권장 |

`best.pt` 원본 보유 중 → iOS용 Core ML 변환 가능.
ScanInferenceBridge 인터페이스로 추상화하면 iOS 포팅 시 구현체만 교체.

---

## 10. Dev 모드

dev 플래그 활성화 시 스캔 결과를 기기 사진첩에 자동 저장.

```
TimepillDev/
  FP/   ← 매칭됐지만 틀린 케이스 (false positive)
  FN/   ← 매칭 실패했지만 맞는 약이었던 케이스 (false negative)
  ㄴ응. 스캔 직후 dev 오버레이에서 "FP였나요 / FN이었나요" 선택 UI 띄우는 방식으로 구현. 앱이 "매칭됨"이라고 했는데 틀렸으면 FP, 앱이 "실패"했는데 실제론 맞는 약이었으면 FN. 사용자가 직접 분류해서 저장하는 구조. 이 라벨이 fine-tuning 데이터 품질 결정하니까 dev 모드에서 이 UI 꼭 넣어야 함.
```

저장 내용: 스캔 이미지 + 유사도 점수 + 매칭 결과. 실제 사용 중 FP/FN 데이터 축적 → 추후 fine-tuning 데이터로 활용.

---

## 11. 미결 사항

- [ ] MobileNetV3 Small TFLite 모델 파일 준비
- [ ] AIHub 전체 25GB 데이터 전처리 스크립트 작성 (COCO bbox → crop + YOLO txt)
- [ ] Triplet loss 학습 환경 구성 (GPU 서버 또는 Colab)
- [ ] HIGH_THRESHOLD(0.70) / COUNT_RATIO(0.60) 실험값 결정 — dev 모드 FP/FN 데이터 기반
- [ ] YOLO confidence threshold 튜닝 — 등록 시 0.5+ (정확한 count), 인증 시 0.2~0.3 (MobileNet이 2차 필터)
- [ ] 배경없는 샘플 합성 데이터 생성 파이프라인
- [ ] perspective transform augmentation으로 저각도(60° 이하) 데이터 보강
- [ ] 그림자 오버레이 augmentation 구현 (YOLO 학습 + MobileNet 등록 augmentation 양쪽)
- [ ] triplet_loss_guide.md 작성 (학습용 상세 설명 문서)
- [ ] iOS Core ML 변환 시점
- [ ] 상용화 시 AIHub 라이센스 검토 또는 자체 데이터 구축 계획
