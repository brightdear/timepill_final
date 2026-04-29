# Timepill v3 — Secondary Plan (구현 세션 상세)

작성일: 2026-04-21  
기준: primary_plan.md 확정 내용 기반  
원칙: **ㄴ 주석이 최신 정책. 모순 시 ㄴ 주석 우선.**

---

## Git 워크플로우 (모든 세션 공통)

### 기본 원칙
- 세션 시작 전 브랜치 생성, 세션 완료 후 main에 머지
- 작업 단위가 동작하면 바로 커밋 — 나중에 몰아서 하지 않음
- 여차하면 `git revert` 또는 `git checkout` 으로 언제든 복귀 가능하게

### 브랜치 전략
```
main              ← 항상 동작하는 상태만
  └─ s0/setup
  └─ s1/db-schema
  └─ s2/register-basic
  └─ s3/home-basic
  └─ s4/scan-pipeline
  └─ ...
```

### 세션별 루틴
```bash
# 세션 시작
git checkout main
git pull
git checkout -b s{N}/기능명

# 작업 중 — 동작 단위마다 커밋
git add src/domain/xxx/ app/xxx.tsx
git commit -m "feat(s{N}): 설명"

# 세션 완료
git checkout main
git merge s{N}/기능명
git push
```

### 커밋 메시지 컨벤션
```
feat(s2): WheelColumn v2에서 이식
fix(s3): skip_until 복귀 타이밍 오류 수정
chore(s1): Drizzle 마이그레이션 생성
```

### 되돌리기
```bash
# 마지막 커밋 취소 (변경사항 유지)
git reset HEAD~1

# 특정 커밋으로 되돌리기 (이력 보존)
git revert <commit-hash>

# 브랜치 전체 버리기
git checkout main
git branch -D s{N}/기능명
```

---

## 개요

| 세션 | 이름 | 핵심 결과물 |
|---|---|---|
| S0 | 프로젝트 세팅 | Expo + Drizzle 초기화, 폴더 구조 |
| S1 | DB 스키마 | 전체 테이블, 마이그레이션, repository layer |
| S2 | 약 등록 기본 | 이름/복용수/시간/주기 저장 (사진·알람 제외) |
| S3 | 홈 화면 기본 | 오늘 슬롯 리스트, on/off 토글, 정렬 |
| S4 | 스캔 파이프라인 | YOLO + MobileNet 연동, 참조사진 촬영·저장 |
| S5 | 인증 흐름 | 스캔 화면, dose_records 업데이트, streak +1 |
| S6 | Streak & Freeze | streak 표시, freeze 획득 팝업, freeze 사용 팝업 |
| S7 | 일반 알람 | expo-notifications 스케줄, 알람 화면 |
| S8 | 등록 화면 알람 설정 | 팝업/알람/강제알람/스누즈 토글 완성 |
| S9 | 기록 화면 | 캘린더 뷰, 날짜별/약별 복용률, 연속 streak |
| S10 | 설정 화면 | private mode, freeze 현황, dev mode |
| S11 | 강제알람 | react-native-alarm-notification, EAS Build |

---

## S0. 프로젝트 세팅 ✅ 완료

### 목표
코드 한 줄 없어도 앱이 켜지고 탭 네비게이션이 보이는 상태.

### 작업 목록
1. `npx create-expo-app timepillv3 --template blank-typescript`
2. Expo SDK 54 확인
3. 의존성 설치
   ```
   expo-sqlite
   drizzle-orm
   drizzle-kit
   expo-camera
   expo-notifications
   expo-task-manager
   expo-media-library  (FP/FN 저장용 dev mode)
   expo-router
   react-native-safe-area-context
   react-native-screens
   ```
4. Expo Router 파일 기반 라우팅 설정 (`app/` 폴더 구조)
5. 탭 네비게이션 스켈레톤: 홈 / 등록 / 기록 / 설정

### 폴더 구조
```
app/
  (tabs)/
    index.tsx          ← 홈
    register.tsx       ← 등록
    history.tsx        ← 기록
    settings.tsx       ← 설정
  scan.tsx             ← 스캔 (모달)
  alarm.tsx            ← 일반 알람 (모달)
  force-alarm.tsx      ← 강제알람 (모달, S11)
src/
  db/
    schema.ts          ← Drizzle 스키마
    client.ts          ← DB 연결
    migrations/
  domain/
    medication/
    timeslot/
    doseRecord/
    streak/
    scan/
    alarm/
  hooks/
  components/
  constants/
  utils/
assets/
  models/              ← .tflite 파일
```

### 완료 기준
- 앱 실행 시 탭 4개가 보임
- TypeScript 오류 없음

---

## S1. DB 스키마 & Repository Layer ✅ 완료

### 목표
Drizzle 스키마 전체 작성 + 각 테이블 CRUD 함수.

### 스키마 파일: `src/db/schema.ts`

아래 SQL을 그대로 Drizzle 타입으로 변환.

```sql
CREATE TABLE medications (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL,  -- hex, 앱에서 색상 배열 중 랜덤 배정 (src/constants/medicationColors.ts)
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL
);

CREATE TABLE time_slots (
  id                        TEXT PRIMARY KEY,
  medication_id             TEXT NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  hour                      INTEGER NOT NULL,
  minute                    INTEGER NOT NULL,
  dose_count_per_intake     INTEGER NOT NULL DEFAULT 1 CHECK(dose_count_per_intake BETWEEN 1 AND 10),
  -- 5정 이상이면 스캔 화면에서 "스캔 정확도가 낮아질 수 있습니다" 안내 문구 표시
  cycle_config              TEXT NOT NULL,  -- JSON (아래 cycle_config 구조 참고). type 포함한 single source of truth. cycle_type 컬럼 없음.
  cycle_start_date          TEXT,           -- rest 타입일 때만 사용, 휴약기 계산 기준일
  verification_window_min   INTEGER NOT NULL DEFAULT 60,  -- 선택지: 30 | 60 | 120
  alarm_enabled             INTEGER NOT NULL DEFAULT 1,
  force_alarm               INTEGER NOT NULL DEFAULT 0,
  popup_enabled             INTEGER NOT NULL DEFAULT 1,
  snooze_count              INTEGER NOT NULL DEFAULT 0 CHECK(snooze_count BETWEEN 0 AND 3),
  snooze_interval_min       INTEGER NOT NULL DEFAULT 5,
  alarm_sound               TEXT NOT NULL DEFAULT 'default',
  vibration_enabled         INTEGER NOT NULL DEFAULT 1,
  skip_until                TEXT,  -- 하루 건너뛰기 시 복귀 시각 (ISO datetime). NULL이면 활성 또는 완전 off
  notification_ids          TEXT,  -- JSON string[] — 등록된 expo notification ID 목록 (취소/재등록용)
  is_active                 INTEGER NOT NULL DEFAULT 1,
  created_at                TEXT NOT NULL
);

CREATE TABLE dose_records (
  id                TEXT PRIMARY KEY,
  medication_id     TEXT REFERENCES medications(id) ON DELETE SET NULL,
  medication_name   TEXT NOT NULL,  -- 기록 시점 약 이름 스냅샷 (삭제 후에도 표시 가능)
  time_slot_id      TEXT REFERENCES time_slots(id) ON DELETE SET NULL,
  day_key           TEXT NOT NULL,  -- 'YYYY-MM-DD' — UNIQUE(time_slot_id, day_key)로 중복 방지
  scheduled_time    TEXT NOT NULL,  -- ISO datetime (로컬, Z 없음)
  status            TEXT NOT NULL,  -- 'pending'|'completed'|'missed'|'frozen'
  target_dose_count INTEGER NOT NULL DEFAULT 1,
  completed_at      TEXT,
  created_at        TEXT NOT NULL,
  UNIQUE(time_slot_id, day_key)
  -- time_slot_id NULL인 행은 UNIQUE 미적용 (SQLite NULL != NULL 동작)
  -- backfill/앱 재시작 시 INSERT OR IGNORE 패턴으로 활용
);

CREATE TABLE escape_records (
  id              TEXT PRIMARY KEY,
  medication_id   TEXT REFERENCES medications(id) ON DELETE SET NULL,
  time_slot_id    TEXT REFERENCES time_slots(id) ON DELETE SET NULL,
  dose_record_id  TEXT REFERENCES dose_records(id) ON DELETE SET NULL,
  day_key         TEXT NOT NULL,  -- 'YYYY-MM-DD'
  reason          TEXT,
  is_user_fault   INTEGER NOT NULL DEFAULT 1,
  note            TEXT,
  created_at      TEXT NOT NULL
);

CREATE TABLE time_slot_streaks (
  time_slot_id        TEXT PRIMARY KEY REFERENCES time_slots(id) ON DELETE CASCADE,
  current_streak      INTEGER NOT NULL DEFAULT 0,
  longest_streak      INTEGER NOT NULL DEFAULT 0,
  last_completed_date TEXT NOT NULL DEFAULT ''
);

CREATE TABLE reference_images (
  id              TEXT PRIMARY KEY,
  medication_id   TEXT NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  original_uri    TEXT NOT NULL,
  cropped_uri     TEXT NOT NULL,
  embedding       TEXT NOT NULL,  -- MobileNetV3 feature vector JSON "[0.12, 0.34, ...]"
  created_at      TEXT NOT NULL
);

CREATE TABLE settings (
  id                  INTEGER PRIMARY KEY DEFAULT 1,
  private_mode        INTEGER NOT NULL DEFAULT 0,
  freezes_remaining   INTEGER NOT NULL DEFAULT 0,  -- 앱 전역 freeze 보유량, max 3
  language            TEXT NOT NULL DEFAULT 'ko',
  dev_mode            INTEGER NOT NULL DEFAULT 0
  -- alarm_volume / vibration_enabled 없음 — time_slots별 개별 관리
);
```

### 인덱스
```
uniq_dose_slot_day                UNIQUE (time_slot_id, day_key)   ← DB 레벨 중복 방지
idx_dose_records_medication_date  (medication_id, scheduled_time)
idx_dose_records_status           (status, scheduled_time)
idx_reference_images_medication   (medication_id)
```

### Repository 함수 (파일별)

**`src/domain/medication/repository.ts`**
- `getMedications()` — 전체 조회 (is_active 무관)
- `getMedicationById(id)`
- `insertMedication(data)`
- `updateMedication(id, data)`
- `deleteMedication(id)` — CASCADE 주의: time_slots만 CASCADE, dose_records는 SET NULL
  - 파일 시스템 정리: 삭제 전 해당 medication의 reference_images 조회 → original_uri / cropped_uri 파일 삭제 후 DB CASCADE

**`src/domain/timeslot/repository.ts`**
- `getTimeslotsByMedication(medicationId)`
- `getTodayTimeslots()` — cycle 계산 포함 (오늘이 복용일인지 판단)
- `insertTimeslot(data)`
- `updateTimeslot(id, data)`
- `deleteTimeslot(id)`
- `restoreExpiredSkips()` — `skip_until < now`인 슬롯 `is_active=1`로 일괄 복귀 (앱 시작 시 호출)
  - ※ `now`는 반드시 `toLocalISOString(new Date())` — `toISOString()` UTC 사용 시 KST 비교 깨짐

**`src/domain/doseRecord/repository.ts`**
- `getDoseRecordsByDate(dateKey)` — 'YYYY-MM-DD'
- `getDoseRecordsByMonth(year, month)`
- `insertDoseRecord(data)`
- `updateDoseRecordStatus(id, status, completedAt?)`

**`src/domain/streak/repository.ts`**
- `getStreakByTimeslot(timeSlotId)`
- `upsertStreak(timeSlotId, data)`
- `incrementStreak(timeSlotId)` — current_streak +1, longest_streak 갱신, 15 배수 도달 시 freeze 획득 트리거

**`src/domain/settings/repository.ts`**
- `getSettings()` — 단일 row (id=1)
- `updateSettings(data)`
- `decrementFreeze()` — freezes_remaining - 1 (0 미만 방지)
- `incrementFreeze()` — freezes_remaining + 1 (max 3)

### Cycle 계산 로직: `src/utils/cycleUtils.ts`
timepill 원본 `medication-schedule.ts` 이식 기준.

```typescript
// isTodayDue(timeslot): boolean
// — 'daily' | 'weekly' | 'weekends' | 'specific_days' | 'rest' 각각 처리
// — rest 타입: cycle_start_date 기준으로 오늘이 active 구간인지 계산

// cycle_config JSON 구조:
// 매일:        { "type": "daily" }
// 주중(월~금): { "type": "weekly" }
// 주말(토~일): { "type": "weekends" }
// 요일 선택:   { "type": "specific_days", "days": [1,3,5] }  // 0=일,1=월,...,6=토
// 휴약기:      { "type": "rest", "active_value": 7, "rest_value": 3, "unit": "day" }
//              { "type": "rest", "active_value": 2, "rest_value": 1, "unit": "week" }
//              active_value / rest_value: 1~99, unit: 'day'|'week'
//              등록 default: { "type": "rest", "active_value": 1, "rest_value": 1, "unit": "day" }
```

### medication 색상 배정: `src/constants/medicationColors.ts`
- 미리 정한 hex 색상 배열에서 순환 배정 (`insertMedication` 시 현재 약 개수 기준 index)
- 색상 배열은 구현 시 확정. 나중에 사용자가 직접 선택할 수 있도록 medications.color 컬럼은 유지

### 앱 시작 시 초기화: `src/hooks/useAppInit.ts`
```typescript
// 앱 열릴 때마다 실행 (순서 중요):
// 1. restoreExpiredSkips() — skip_until 지난 슬롯 활성화 복귀
// 2. checkMissedDoses() — 오늘 이전 pending → missed 처리. 반환: { timeSlotIds, records }
//    ※ 로컬 시간 기준 비교. toISOString() 사용 금지 (UTC→KST 날짜 밀림)
// 3. checkFreezeEligibility(missedRecords) — streak 리셋 전에 반드시 먼저 실행
//    streak > 0 조건 체크가 이 시점에서만 유효함
// 4. resetStreaks(missedSlotIds) — freeze 팝업 체크 완료 후 streak 0으로 리셋
// 5. backfillAndGenerateDoseRecords() — 앱 미실행 기간 누락 기록 생성 + 오늘 pending 생성
//    각 슬롯의 마지막 dose_record 다음날부터 오늘까지 순회
//    과거 날짜 → status='missed' 직접 삽입 / 오늘 → status='pending'
//    isTodayDue(slot, checkDate) — checkDate 파라미터로 과거 날짜 전달
```

### 완료 기준
- `npx drizzle-kit generate` 성공
- 마이그레이션 적용 후 SQLite에 모든 테이블 생성 확인
- 각 repository 함수 기본 동작 확인

---

## S2. 약 등록 기본 ✅ 완료

### 목표
약 이름 / 복용 수 / 시간 / 주기 를 입력해서 DB에 저장. 사진 촬영과 알람 설정은 제외 (스텁으로 둠).

### v2에서 이식할 것
| v2 경로 | v3 활용 |
|---|---|
| `src/screens/AddScreen.tsx` → `WheelColumn` (217~365줄) | 시간/복용수/휴약기 스크롤 입력 |
| 시간 피커 모달 (946~992줄) | 오전/오후·시·분 3컬럼 구조 |
| 휴약기 휠 블록 (1074~1110줄) | active_value/rest_value/unit 입력 (`CYCLE_ITEMS` 99로 확장) |
| `Stepper` (171~207줄) | 복용 수 입력 (또는 WheelColumn 대체) |

### 화면 구성 (등록 탭 기본)

**입력 순서 [필수]:**
1. 약 이름 (TextInput, 기등록 약 이름 자동완성 제안)
2. 복용 수 (1~10, Stepper 또는 WheelColumn)
ㄴ 복용 수n보다 사진 등록 시 yolo box가 더 많으면 box 중에서 confidence가 높은 상위 n개만 취함.
  ㄴ 반영. S4 runScanInference에서 bbox 결과를 confidence 내림차순 정렬 후 상위 dose_count_per_intake개만 MobileNet에 넘김.
3. 시간 (3컬럼: 오전/오후 스크롤 | 시 스크롤+직접입력 | 분 스크롤+직접입력)
4. 주기 (매일 / 주중 / 주말 / 요일 선택 / 휴약기)
   - 휴약기 선택 시: active_value | / | rest_value | 단위(일/주) 3컬럼
5. 사진 등록 → 이 세션에서는 스텁 ("사진 등록 준비 중")
6. 저장 버튼 (하단 탭바 위)

**Default 값:**
- 시간: 현재 시각
- 주기: 매일
- 복용 수: 1
- 팝업: on (popup_enabled=1)
- 알람: on
- 강제알람: off
- 알람 소리: default
- 스누즈: off (0회), snooze_interval: 5분
- 진동: on
- verification_window: 60분 (선택지: 30 / 60 / 120분)

**수정 모드:** 홈에서 row 탭 → 해당 timeslot 정보 불러와서 입력 필드 채움.

**저장 흐름:**
```
저장 버튼 →
  medications 테이블 upsert (새 약이면 insert, 같은 이름이면 기존 medication_id 재사용)
  time_slots insert
  dose_records 오늘치 생성 (status='pending')
  홈 탭으로 이동
```

**저장 없이 탭 이동:** "저장하지 않고 나가시겠습니까?" 팝업.

### 파일
- `app/(tabs)/register.tsx`
- `src/components/WheelColumn.tsx` (v2 이식)
- `src/components/TimePickerModal.tsx` (v2 이식)
- `src/components/CyclePicker.tsx`
- `src/utils/cycleUtils.ts`

### 완료 기준
- 약 등록 → DB에 medication + timeslot 생성 확인
- 수정 모드 진입 → 기존 값 불러오기 확인
- WheelColumn 스크롤 + 더블탭 직접입력 동작 확인

---

## S3. 홈 화면 기본 ✅ 완료

### 목표
오늘 복용해야 할 슬롯 리스트 표시, on/off 토글, 정렬 로직.

### 화면 구성
```
┌─────────────────────────┐
│  Timepill               │  ← 앱 이름 최상단 고정
├─────────────────────────┤
│  streak 요약 영역        │  ← timeslot별 current_streak 표시
│  (스크롤로 사라지면      │
│   중앙 하단 ↑ 버튼 노출)│
├─────────────────────────┤
│  오늘 알람 리스트        │  ← 시간순 정렬
│  [row] 시간 / 약이름 /  │
│  몇 정 / on-off / 인증  │
│  ...                    │
└─────────────────────────┘
│  탭 네비게이션 바        │
└─────────────────────────┘
```

### 정렬 규칙 (우선순위)
1. **활성 슬롯** (is_active=1) — 인증 가능 여부 무관, 다음 인증시간 오름차순
2. **1회 skip 슬롯** (is_active=0 + skip_until IS NOT NULL) — 복귀시간 오름차순, 색상 옅게
3. **완전 off 슬롯** (is_active=0 + skip_until IS NULL) — 다음 예정시간 오름차순, 회색

### 각 Row 구성
- 시간 / 약이름 / 몇 정
- 강제알람 여부 아이콘
- 인증버튼: 인증 가능 시간 내 활성(초록) / 아니면 회색 비활성
- on/off 토글
- 삭제버튼

### on/off 토글 동작
```
토글 off 시 팝업:
  "하루만 건너뛰시겠습니까?"
  [하루만 건너뛰기] → is_active=0, skip_until = 해당 슬롯 인증 마감 시각
  [완전 off]        → is_active=0, skip_until = NULL
  [취소]
```

### 앱 시작 시 처리 (useAppInit)
1. `restoreExpiredSkips()` — skip_until 지난 슬롯 복귀
2. `checkMissedDoses()` — 전날 pending → missed 처리
3. freeze 사용 팝업 체크 (S6에서 완성)

### 파일
- `app/(tabs)/index.tsx`
- `src/hooks/useTodayTimeslots.ts`
- `src/hooks/useAppInit.ts`
- `src/components/TimeslotRow.tsx`
- `src/components/FreezePopup.tsx` (스텁, S6 완성)

### 완료 기준
- 등록한 약이 홈에 표시됨
- 정렬 순서 동작 확인
- on/off 토글 → 팝업 → DB 반영 확인
- 앱 재시작 시 skip_until 지난 슬롯 자동 복귀 확인

---

## S4. 스캔 파이프라인 ✅ 완료 → 재작성 예정 (scan_pipeline_plan.md)

### 목표
YOLO11n.tflite + MobileNetV3 연동. 참조사진 촬영 → bbox crop → embedding 저장까지 완성.

> **재작성 방향**: 학습/inference 분포 불일치 문제로 전면 재작성. 상세는 `scan_pipeline_plan.md` 참고.

### 확정 결정 사항
- 버스트 촬영 폐기 → 단일 촬영
- 실시간 YOLO polling 제거
- 카메라 zoom 2x (CameraView zoom prop)
- 가이드 박스 비율 75% (CROP_RATIO = 0.75 유지)
- dev 모드에서 guide crop 이미지 저장 기능 추가

### 스캔 파이프라인 흐름 (재작성 기준)
```
카메라 프리뷰 (guide box UI, zoom 2x)
  ↓ 촬영 버튼
takePictureAsync()
  ↓
cropGuideFrame()
  - manipulateAsync (구 API, EXIF 적용) — new ImageManipulator API 사용 금지 (EXIF 불일치)
  - cropSize = floor(min(actualW, actualH) * 0.75)
  → guideUri (cropSize×cropSize)
  ↓
YOLO inference (yoloPillDetector.ts)
  - imageToFloat32(guideUri, 640) → Float32[640×640×3] normalized [0,1]
  - output auto-detect: numAnchors, outputLayout, confMode
  - decode: cx,cy,bw,bh (normalized) × cropSize → pixel coords (guide-crop 기준)
  - filter conf ≥ 0.25, NMS IoU 0.45
  → BboxResult[]
  ↓
각 bbox: toOriginalCoords → cropToBbox → MobileNet embedding → 저장
```

### 등록 흐름
```
촬영 1회 → YOLO → 1~10개 bbox → 각 bbox embedding 저장
3~10회 반복, 최대 100개 embedding 누적
3회 이상 → 완료 버튼 활성화
```

### iOS/Android TFLite 추상화
- `src/domain/scan/scanInferenceBridge.ts` 유지 (타입 정의)
- Android TFLite 구현 → iOS Core ML은 추후 포팅

### 파일 (재작성)
- `src/domain/scan/yoloPillDetector.ts` — 재작성
- `src/domain/scan/runScanInference.ts` — 재작성 (burst 제거)
- `src/domain/scan/trainingDataCollector.ts` — 신규 (dev 모드 데이터 수집)
- `src/domain/scan/scanInferenceBridge.ts` — 유지
- `src/domain/scan/mobilenetEmbedder.ts` — 유지
- `src/utils/similarity.ts` — 유지
- `assets/models/yolo11n_int8.tflite` — 재학습 후 교체 예정
- `assets/models/mobilenet_v3_small.tflite` — 유지

### 완료 기준
- 사진 찍으면 YOLO bbox 감지 확인
- MobileNetV3 embedding 추출 확인
- reference_images DB 저장 확인
- 등록 화면에서 3회 이상 촬영 후 저장 동작 확인

---

## S5. 인증 흐름 ✅ 완료

### 목표
스캔 화면에서 인증 → dose_record 완료 처리 → streak +1.

### 스캔 화면 레이아웃
```
┌─────────────────────────┐
│  [카메라 뷰]            │
│  중앙 정사각형 가이드   │       ← 플래시 버튼 (우상단)
│                         │
│  "알약이 감지되고 있습니다"  ← setInterval 폴링 (expo-camera takePictureAsync)
│                    [💊] │  ← 우측 세로 알약 목록 칩
│                    [💊] │
│       [SCAN]            │  ← 중하단 scan 버튼 → 점사 3회 → majority vote
└─────────────────────────┘
```

### 카메라 구현 방식
- **expo-camera** 사용 (react-native-vision-camera 미사용)
- 실시간 프레임 추론 없음 — setInterval polling 제거
- 단순 흐름: 촬영 버튼 → takePictureAsync → inference → 결과
- 카메라 zoom 2x (CameraView zoom prop)
- guide box UI: 화면 중앙 정사각형 (CROP_RATIO 0.75)

### 인증 가능 약 필터링
- 현재 시각이 `timeslot.hour:minute ± verification_window_min/2` 범위 내인 슬롯만
- 강제알람 context로 진입 시: 해당 슬롯의 약만 고정 (다른 약 제외)
- `dose_count_per_intake >= 5`인 슬롯: 스캔 화면 상단에 "스캔 정확도가 낮아질 수 있습니다" 안내 문구 표시

### 인증 판단 로직 (단일 촬영)

SCAN 버튼 → `runScanInference` 호출 (버스트 폐기):

```
촬영 1회 → cropGuideFrame → YOLO → BboxResult[]

boxes.length != doseCount → no_pill → 재촬영 안내
  ("알약 N개를 가이드 안에 놓고 다시 찍어주세요")

topBoxes = boxes[0..doseCount-1]  (confidence 내림차순)

for box in topBoxes:
  isBboxTooSmall? → pill_too_small → 재촬영 안내
  cropToBbox → MobileNet → embedding
  computeMatchScore(embedding, referenceEmbeddings)
  score >= HIGH_THRESHOLD(0.70) → matchedCount++

required = ceil(doseCount * COUNT_RATIO(0.60))
matchedCount >= required → matched
미달 → unmatched → 재촬영 안내
```

상수 (`src/constants/scanConfig.ts`):
- `HIGH_THRESHOLD = 0.70`
- `COUNT_RATIO = 0.60`
- `CONF_THRESHOLD = 0.25` (YOLO bbox 필터)
### 인증 성공 흐름
```
matched →
  dose_records.status = 'completed', completed_at = now
  incrementStreak(timeSlotId)
    → current_streak % 15 === 0 → incrementFreeze() + freeze 획득 팝업
  "~~ 인증 완료! 더 인증할 약이 있습니다. 계속하시겠어요?" 팝업
    [예] → 스캔 화면 유지 (목록 새로고침)
    [아니요] → 홈으로
  모든 약 완료 시 → "현재 모든 알약을 인증하셨습니다!" → 홈으로
```

### 인증 실패 흐름
```
not matched →
  "알약을 확인할 수 없습니다. 다시 scan해주세요"
  스캔 화면 유지
```

### dev 모드 (dev_mode=1일 때만)
- 스캔 결과 직후 "이 결과가 정확했나요?" → FP / FN / 정확함 선택 UI
- 선택 시 이미지 + 유사도 점수 → `TimepillDev/FP` or `TimepillDev/FN` 폴더에 저장 (expo-media-library)

### 파일
- `app/scan.tsx`
- `src/domain/scan/runScanInference.ts` (v2 이식 + MobileNet 추가)
- `src/hooks/useStreakUpdate.ts`
- `src/components/FreezeAcquiredPopup.tsx`

### 완료 기준
- 스캔 성공 → dose_record status=completed 확인
- streak +1, longest_streak 갱신 확인
- 15회 달성 시 freeze 획득 팝업 확인
- 실패 시 재시도 유도만 (수동 완료 버튼 없음) 확인

---

## S6. Streak & Freeze 시스템 ✅ 완료

### 목표
홈 화면 streak 표시 완성, freeze 사용 팝업(앱 시작 시) 완성.
ㄴfreeze 사용 팝업은 그 skip된 timeslot이 있을 때만 물어봐야하는잖아.
  ㄴ 맞아. 조건에 `streak > 0` 추가. streak이 0이면 freeze 써봐도 보호할 연속이 없으니까 팝업 안 띄움. checkFreezeEligibility 로직에 반영.
### 홈 화면 streak 요약
- 각 timeslot별 `current_streak` / `longest_streak` 표시
- 약별 평균 복용률 (dose_records.completed / 전체 count)
- 스크롤로 streak 영역 사라지면 → 중앙 하단 ↑ 버튼

### freeze 사용 팝업
 (앱 시작 시 checkFreezeEligibility — useAppInit step 3에서 호출, streak 리셋 전)
```
조건: settings.freezes_remaining > 0
    AND checkMissedDoses()가 반환한 missed records 중 D+0/D+1 범위인 것 존재
    AND 해당 timeslot의 current_streak > 0 (이 시점은 아직 리셋 전이라 유효)
    ※ streak 리셋(step 4) 후에 체크하면 항상 0 → 팝업 조건 미충족. 순서 엄수.

missed 1개:
  "어제 [약이름] 복용을 놓쳤습니다. Freeze를 사용하시겠습니까? (남은 freeze: N개)"
  [사용] → freeze 소비, 해당 timeslot dose_record.status = 'frozen', streak 유지 (리셋 skip)
  [사용 안 함] → missed 그대로, step 4에서 streak 리셋됨

missed 여러 개:
  "놓친 약이 N개 있습니다. 어느 약에 Freeze를 사용하시겠습니까?"
  체크박스 목록 → 선택한 약만 freeze 적용
  [확인] / [사용 안 함]
```

**freeze 유효 기간 체크:**
- missed 발생일이 D+2 이상이면 팝업 없음

### missed 처리 타이밍 (useAppInit에서)
```
앱 열릴 때:
  어제 날짜의 status='pending' dose_records → status='missed'로 업데이트
  해당 timeslot streak → current_streak = 0 (리셋)
```

### 파일
- `src/hooks/useFreezeEligibility.ts`
- `src/components/FreezePopup.tsx` (S3 스텁 완성)
- `src/components/StreakSummary.tsx`

### 완료 기준
- 앱 시작 시 missed dose 감지 후 freeze 팝업 노출 확인
- freeze 사용 시 streak 유지 확인
- freeze 미사용 시 streak 0 확인
- D+2 이후 팝업 없음 확인

---

## S7. 일반 알람 ✅ 완료

### 목표
expo-notifications로 timeslot마다 알람 스케줄. 알람 화면 구현.

### 알람 스케줄링 전략: 5일치 one-time + 6시간 rolling refresh

expo-notifications의 repeating trigger는 cycle(휴약기·요일 지정)을 지원하지 않음.  
→ 복용일을 직접 계산해 one-time notification으로 개별 등록.

```
슬롯 MAX 10개 × 5일 = 50 notifications ≤ 64 (expo 상한)
상수: MAX_TIMESLOTS = 10, ALARM_SCHEDULE_DAYS = 5  (src/constants/alarmConfig.ts)
```

#### 슬롯 저장 시 (즉시)
```typescript
// timeslot INSERT/UPDATE 후 호출
await scheduleAlarmsForSlot(timeslot)
// 1. notification_ids 기존 알람 전부 취소
// 2. 오늘 ~ +5일 복용일만 계산 (isTodayDue 활용)
// 3. one-time notification 등록 → ID 목록을 notification_ids에 저장
```

#### Background Refresh (앱 시작 시 registerAlarmRefreshTask 등록)
```typescript
// expo-background-fetch minimumInterval: 6 * 60 * 60 (6시간)
// 태스크명: ALARM_REFRESH_TASK_NAME
// 실행 내용: scheduleAlarmsForAllSlots() — 전체 슬롯 재스케줄
// 6시간 × 4회/일 → Android OS 지연 고려해도 알람 공백 최소화
// 최소 커버리지: 5일 - 6시간 = 약 4.75일
```

#### 하루 건너뛰기 복귀 알람
```typescript
scheduleOneTimeNotification({
  trigger: { date: skip_until },
  data: { type: 'restore_skip', timeSlotId }
})
```
ㄴ 긴급탈출버튼 만들까말까. 그냥 폰 강제종료하면 되긴하잖아.
  ㄴ 일반 알람에는 이미 "알람 끄기" 버튼이 있어서 긴급탈출 불필요. 강제알람에만 긴급탈출 버튼 (escape_records 기록 용도). primary_plan 기준 그대로.
ㄴ 강제 종료했을 때의 정책 만들어야겠네네
  ㄴ useAppInit이 커버함. 앱 재시작 시 어제 pending → missed 처리, skip_until 복귀 체크 모두 실행되니까 강제종료 후 재시작해도 정상 상태로 복원됨.

### 일반 알람 화면 (`app/alarm.tsx`)
강제알람과 동일한 레이아웃 + "알람 끄기" 버튼 추가.

```
표시 내용:
  약 이름 / 복용 시간 / 몇 정
  해당 timeslot의 약 목록

버튼:
  [인증하기] → scan.tsx로 이동 + 알람 소리/진동 해제
  [알람 끄기] → 알람만 해제, 인증 없이 닫힘
  [스누즈] → 설정된 횟수 남아있을 때만 활성화
```

### 충돌 정책
- 알람 처리 중 다른 알람: popup 알림만 (화면 전환 없음)
- 강제알람 + 일반알람 겹침: 강제알람 우선, 일반알람 대기열 팝업
- 스누즈 대기 중 강제알람: 독립 처리 (스누즈 취소 안 함)

### skip_until 복귀 콜백 처리
```typescript
// 알람 콜백에서 type='restore_skip' 감지 시
await updateTimeslot(timeSlotId, { isActive: 1, skipUntil: null })
```

### 파일
- `src/constants/alarmConfig.ts` — MAX_TIMESLOTS=10, ALARM_SCHEDULE_DAYS=5, 태스크명
- `src/domain/alarm/alarmScheduler.ts` — scheduleAlarmsForSlot / scheduleAlarmsForAllSlots / registerAlarmRefreshTask
- `app/alarm.tsx`
- `src/hooks/useNotificationHandler.ts`

### 완료 기준
- timeslot 저장 시 5일치 one-time 알람 등록 확인
- background refresh 6시간 간격 등록 확인 (expo-background-fetch)
- 슬롯 10개 초과 시 등록 거부 확인
- 알람 수신 → 알람 화면 노출 확인
- 인증하기 → 스캔 화면 이동 + 알람 해제 확인
- 스누즈 → N분 후 재알람 확인
- skip_until 복귀 콜백 → is_active=1 확인

---

## S8. 등록 화면 알람 설정 완성 ✅ 완료

### 목표
S2에서 스텁으로 둔 알람 관련 설정 입력 완성.

### 추가 입력 항목 [알람]
```
팝업 여부 토글 (default: on)
  ↓
알람 여부 토글 (default: on)
  알람 off → 아래 항목 모두 비활성화 + off 고정
  ↓
  강제알람 여부 토글 (default: off)
  알람 소리 선택
  진동 여부 토글 (default: on)
  스누즈 토글
    스누즈 on → 횟수(0~3) + 간격(분, snooze_interval_min)
```

### 저장 시 알람 스케줄 등록
timeslot INSERT 또는 UPDATE 시 → `alarmScheduler.scheduleForTimeslot(timeslot)` 호출

### 완료 기준
- 알람 off → 하위 항목 비활성화 확인
- 저장 시 알람 스케줄 등록 확인
- 수정 시 기존 알람 취소 후 재등록 확인

---

## S9. 기록 화면 ✅ 완료

### 목표
날짜별 복용률 + medication별 복용률 + timeslot별 streak.  
timepill 원본 (`약먹자친구들\timepill\`) UI 참고.
ㄴ 완전 똑같이 하라는 뜻은 아님.
  ㄴ ㅇㅋ. UI 참고용으로만. 구체적 레이아웃은 구현 직전 primary_plan 7-5 섹션에서 결정.
### 화면 구성
```
┌─────────────────────────┐
│  [캘린더 뷰]            │
│  날짜별 알약별 색상 dot │
│  - 각 약의 고유 색상 dot│
│  - 복용률 → dot 투명도  │
│    완전 복용: 불투명     │
│    일부 복용: 반투명     │
│    미복용:   더 투명     │
│  - 복용일 아님: dot 없음 │
│  날짜 터치 → 팝업       │
│  ┌───────────────────┐  │
│  │  약이름  N/N 복용  │  │  ← 복용일인 약만 표시
│  │  🧊 freeze 사용   │  │  ← 해당 시만 표시
│  │  ⏭️ skip          │  │  ← 해당 시만 표시
│  │  [삭제(-)버튼]    │  │
│  └───────────────────┘  │
│  해당 없는 약은 목록 제외│
├─────────────────────────┤
│  전체 복용률 요약        │
│  medication별 복용률    │
│  timeslot별 연속 streak  │
└─────────────────────────┘
ㄴ기록삭제 어디감감
  ㄴ 기록 삭제는 primary_plan 기준 "기록 탭에서만 관리". 기록 탭에서 개별 dose_record 삭제 기능 추가. 날짜 팝업 내 삭제(-) 버튼으로 처리.
```

### 데이터
- 날짜별: `getDoseRecordsByMonth(year, month)` → 날짜별 completed/total 집계
- 약별 복용률: medication_id 기준으로 그룹핑
- streak: `time_slot_streaks.current_streak` / `longest_streak`
- 삭제된 약(medication_id=NULL): `medication_name` 스냅샷으로 표시

**`src/domain/streak/repository.ts` 추가 함수:**
- `recalculateStreak(timeSlotId)` — 기록 삭제 후 호출. 해당 timeslot의 dose_records를 날짜 오름차순으로 다시 순회 → current_streak / longest_streak 재산출 후 upsert

### 파일
- `app/(tabs)/history.tsx`
- `src/hooks/useMonthlyRecords.ts`
- `src/components/CalendarView.tsx`

### 완료 기준
- 오늘 날짜 복용률 캘린더에 반영 확인
- 삭제된 약의 과거 기록도 표시 확인 (medication_name 스냅샷)

---

## S10. 설정 화면 ✅ 완료

### 목표
private mode / freeze 현황 / dev mode / 언어 설정.

### 화면 구성
```
┌─────────────────────────┐
│  Private Mode    [토글] │
├─────────────────────────┤
│  Freeze 현황            │
│  남은 freeze: N개 / 3개 │
│  escape 기록            │
├─────────────────────────┤
│  언어 선택       [드롭다운]│
│  Dev Mode        [토글] │  ← dev_mode=1
├─────────────────────────┤
│  버전정보 v1.0.0        │
└─────────────────────────┘
```
※ 알람 볼륨 / 진동은 timeslot별 설정 (S8 등록 화면에서 관리)
ㄴ 알람 볼륨이랑 진동은 timeslot에 있어야하는건데.
ㄴ 이것들도 마찬가지로 알람이 off면 비활성화.
  ㄴ 반영. 설정 화면에서 알람 볼륨/진동 제거. S8 등록 화면 알람 설정에서 timeslot별로 입력 (알람 off면 비활성화). 설정 화면은 Private Mode / Freeze 현황 / 언어 / Dev Mode / 버전정보만.
ㄴ그리고 버전정보 추가하자.
  ㄴ 반영. 설정 화면 하단에 버전정보 추가.

### Private Mode 처리
- `settings.private_mode = 1` 이면 약 이름 → "알약1", "알약2"...
- 표시 레이어에서만 처리: `src/utils/displayName.ts`
  ```typescript
  function displayMedicationName(name: string, index: number, privateMode: boolean): string
  ```
- 홈 / 스캔 / 알람 / 기록 모든 화면에 적용

### 파일
- `app/(tabs)/settings.tsx`
- `src/utils/displayName.ts`
- `src/hooks/useSettings.ts`

### 완료 기준
- private mode 토글 → 홈/스캔/기록 전체 이름 변경 확인
- freeze 현황 표시 확인

---

## S11. 강제알람 (마지막) ✅ 완료

> **EAS Build 환경 없이 테스트 불가.** S0~S10 완성 후 진행.

### 목표
잠금화면에서도 뜨는 full-screen 강제알람 화면 (Android).

### 라이브러리
`react-native-alarm-notification`

### 권한 요청 (앱 최초 실행 or 첫 알람 설정 시)
- `SCHEDULE_EXACT_ALARM` (Android 12+)
- 배터리 최적화 예외 → 설정 화면으로 안내
- 거부 시 "알람이 정확하지 않을 수 있습니다" 경고만

### 강제알람 화면 (`app/force-alarm.tsx`)
```
표시 내용:
  약 이름 / 복용 시간 / 몇 정
  인증 대상 약 목록 (해당 슬롯의 약만)

버튼:
  [인증하기] → scan.tsx (해당 슬롯 context 고정)
  [스누즈]  → 남은 횟수 있을 때만 활성화
  [긴급 탈출] → escape_records INSERT → 홈으로

알람 2개 겹침:
  두 번째 강제알람 발동 시 → 첫 번째 화면 목록에 추가 (화면 전환 없음)
  모든 약 인증 완료 시에만 화면 해제
```

### iOS
MVP: 큰 배너 수준 (full-screen intent 없음). iOS 포팅 단계에서 대응.

### 파일
- `app/force-alarm.tsx`
- `src/domain/alarm/forceAlarmScheduler.ts`
- Native 권한 요청 모듈

### 완료 기준
- 잠금화면에서 강제알람 화면 노출 확인 (실기기 EAS Build)
- 인증 완료 → 알람 해제 확인
- 긴급 탈출 → escape_records 기록 확인

---

## 공통 주의사항

### 삭제 정책 (구현 시 반드시 확인)
| 액션 | time_slots | dose_records | escape_records | reference_images | 파일 시스템 |
|---|---|---|---|---|---|
| 약 삭제 | CASCADE | medication_id → NULL | medication_id → NULL | CASCADE | original_uri / cropped_uri 삭제 |
| 슬롯 삭제 | 해당 삭제 | time_slot_id → NULL | time_slot_id → NULL | — | — |
| 기록 삭제 | 유지 | 해당만 삭제 | 유지 | — | recalculateStreak 호출, freeze 보정 없음 |
| 참조사진 삭제 | — | — | — | 해당만 삭제 | original_uri / cropped_uri 삭제 |

→ dose_records INSERT 시 `medication_name` 반드시 함께 저장할 것.
→ `deleteReferenceImage`도 파일 먼저 삭제 후 DB row 삭제 (deleteMedication과 동일 원칙).
→ 기록 삭제 시 freeze는 보정하지 않음 — 이미 소비된 케이스 복원 불가, 소급 추적 테이블 없음.

### streak 정책 요약
- **단위**: timeslot별 (time_slot_streaks.time_slot_id PK)
- **+1 타이밍**: 인증 즉시
- **리셋**: missed 발생 시 해당 timeslot streak = 0
- **freeze 획득**: current_streak % 15 === 0 시 freezes_remaining +1 (max 3)
- **off 슬롯**: missed 대상 아님 → streak 유지

### freeze 정책 요약
- **적용 단위**: medication (해당 약 전체 timeslot 묶음)
  - freeze 사용 시 → 해당 날짜 그 medication의 missed timeslot **전체**에 frozen 적용
  - 일부만 missed인 경우(아침 completed + 저녁 missed) → missed인 timeslot만 frozen
  - timeslot별 streak는 각자 유지 (리셋 skip)
- **유효 기간**: 실패 D+0 / D+1까지. D+2 이후 팝업 없음
- **보유 한도**: max 3개 (settings.freezes_remaining)

### cycle 계산 주의
- `rest` 타입은 `cycle_start_date` 기준으로 오늘이 active 구간인지 계산
- `specific_days`의 days 배열: 0=일, 1=월, ..., 6=토
