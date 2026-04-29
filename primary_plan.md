# Timepill v3 — Primary Plan

작성일: 2026-04-20

---

## 1. 프로젝트 개요

약 복용 알림 및 인증 앱. 핵심 가치:
- 복용 알람을 무시하기 어렵게 만든다
- 실제로 약을 먹었는지 카메라로 인증한다
- 복용 기록과 streak을 통해 습관을 형성한다
- **완전 온디바이스** — 인터넷 없이 모든 기능 동작

---

## 2. 기술 스택

| 항목 | 선택 | 이유 |
|---|---|---|
| Framework | React Native + Expo SDK 54 | 기존 유지 |
| Language | TypeScript | 기존 유지 |
| DB | Drizzle ORM + expo-sqlite | AsyncStorage 대체, 타입 안전, 마이그레이션 툴링 |
| 스캔 모델 1 | YOLO11n.tflite | 알약 bbox 감지 |
| 스캔 모델 2 | MobileNetV3 Small.tflite | 참조사진 embedding 추출 및 유사도 비교 |
| 플랫폼 | Android 우선, iOS 추후 |  |
| 카메라 | expo-camera | v2 동일, TFLite 연동 구조에 적합 |
| 알림 | expo-notifications + full-screen intent (Android) | 강제알람 full screen은 native 처리 필요 |
ㄴ [claude] 알림 라이브러리가 없음. expo-notifications 쓸 건지 확인 필요. 강제알람(full screen) 구현에 필수.
ㄴ [claude] 카메라 라이브러리도 명시 필요. expo-camera vs react-native-vision-camera 선택해야 함. v2에서 뭐 썼어?
ㄴ v2에서도 알름은 구현 안 함.. android에서는 어떤 기반, ios에는 어떤 기반을 사용하는게 좋을까?
ㄴ 완성도는 어떤게 높고 구현 난이도는 뭐가 높아?
ㄴ 카메라 라이브러리는 네가 c드라이브의 timepillv2폴더를 보고 알아볼래?
  ㄴ v2: expo-camera(~17.0.10) + expo-notifications(~0.32.16) 사용 중. 알람은 구현 안 됨.
  ㄴ **카메라: expo-camera 그대로 유지.** react-native-vision-camera가 성능은 좋지만 TFLite frameProcessor 연동이 복잡하고 native 코드 필요. expo-camera + 정지 프레임 캡처 방식이 우리 스캔 구조(버튼 누르면 캡처 → 추론)에 딱 맞음. 구현 난이도도 훨씬 낮음.
  ㄴ **알림: expo-notifications 유지.** 단, 강제알람(full screen intent)은 expo-notifications만으로 안 됨. Android는 `expo-notifications` + `expo-task-manager` + 별도 full screen intent 처리가 필요. 구현 방법 미결 사항에 있음. iOS는 expo-notifications로 커버됨.
  ㄴ 정리: 기술 스택 표에 expo-camera + expo-notifications 추가.
---

## 3. DB 설계 원칙

### AsyncStorage → SQLite 전환 이유
- 전체 배열 읽기 (getMedications → 전체 파싱)
- FK 없음 → orphan 레코드 수동 관리
- 원자성 없음 → partial write 위험

### 삭제 정책
| 액션 | time_slots | dose_records | escape_records |
|---|---|---|---|
| 약 삭제 | CASCADE | medication_id → NULL, 기록 유지 (medication_name 스냅샷으로 표시) | medication_id → NULL, 기록 유지 |
| 슬롯 삭제 | 해당 삭제 | time_slot_id → NULL, 기록 유지 | time_slot_id → NULL |
| 기록 삭제 | 유지 | 해당만 삭제 | 유지 |

슬롯 삭제 후 `time_slot_id = NULL`인 기록은 History에서 약 이름 + scheduledTime으로 표시.

---

## 4. DB 스키마

```sql
-- 약 기본정보
CREATE TABLE medications (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  color       TEXT NOT NULL,  -- hex, 앱에서 랜덤 배정. 추후 사용자 커스텀 가능하게 확장 예정.
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL
);
ㄴ 약 컬러는 우리가 random으로 제공하자. 나중에 디자인까지 짜고 나서 괜찮은 색상 배열 선택해보면 좋을 듯?
ㄴ 더 나중에 개발 완료 단계 되었을 때 사용자가 색깔 정할 수 있게 하든지 말든지 하자.
  ㄴ 반영. 스키마 컬럼은 그대로 유지하고, 앱 로직에서 미리 정한 색상 배열 중 랜덤 배정. 추후 사용자 선택 기능 붙이기 쉽게 컬럼은 남겨둠.

-- 복용 스케줄
CREATE TABLE time_slots (
  id                        TEXT PRIMARY KEY,
  medication_id             TEXT NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  hour                      INTEGER NOT NULL,
  minute                    INTEGER NOT NULL,
  dose_count_per_intake     INTEGER NOT NULL DEFAULT 1 CHECK(dose_count_per_intake BETWEEN 1 AND 10),
  -- 5알 이상이면 스캔 화면에서 "스캔 정확도가 낮아질 수 있습니다" 안내 문구 표시
  cycle_config              TEXT NOT NULL,  -- JSON, type 포함한 single source of truth. cycle_type 컬럼 없음.
  -- 예: {"type":"specific_days","days":[1,3,5]} / {"type":"rest","active_value":7,"rest_value":3,"unit":"day"}
  cycle_start_date          TEXT,           -- 휴약기 계산 기준일 (rest 타입일 때만 사용)
  -- ㄴ [claude] timepill 원본에 cycleStartDate 있었음. 오늘이 복용일인지 계산할 때 기준점 필요. rest 타입 아니면 NULL.
  verification_window_min   INTEGER NOT NULL DEFAULT 60,  -- 30 | 60 | 120
  alarm_enabled             INTEGER NOT NULL DEFAULT 1,
  force_alarm               INTEGER NOT NULL DEFAULT 0,
  popup_enabled             INTEGER NOT NULL DEFAULT 1,
  snooze_count              INTEGER NOT NULL DEFAULT 0 CHECK(snooze_count BETWEEN 0 AND 3),
  snooze_interval_min       INTEGER NOT NULL DEFAULT 5,
  -- 스누즈 최대 3회. 주기는 snooze_interval_min으로 관리 (기본 5분, 추후 사용자 설정 가능하게 확장)
  alarm_sound               TEXT NOT NULL DEFAULT 'default',
  vibration_enabled         INTEGER NOT NULL DEFAULT 1,
  skip_until                TEXT,  -- 하루 건너뛰기 시 복귀 시각 (ISO datetime). NULL이면 완전 off 또는 활성 상태.
  is_active                 INTEGER NOT NULL DEFAULT 1,
  created_at                TEXT NOT NULL
);
ㄴ intake 제한 10개로 해야하지 않을까? 한 번에 10알 이상 먹는 경우도 잘 없을 것 같고, scan하기도 힘들 듯?? 아닌가
ㄴ 만약 있다면 어떻게 스캔 방침 세울지도 모르겠네, 5알 이상인 경우 scan 성능에 제한이 있을 수 있습니다. 라고 안내 문구를 추가하든 해야겠네.
ㄴ 스누즈 카운트는 최대 3회로 제한해. 스누즈 주기는 5분 고정.
  ㄴ 반영. dose_count_per_intake에 CHECK(1~10) 추가. 5알 이상 스캔 안내 문구는 앱 로직에서 처리.
  ㄴ snooze_count CHECK(0~3) 추가. snooze 주기는 DB 컬럼 없이 앱 상수 5분으로 고정.
 ㄴ 앱 상수 5분에서 나중에 막 3분으로 고칠 수도 있고 유동적으로 선택하게 만들수도 있으니까 나중에 수정하기 쉽게 만들어두자.
  ㄴ 반영. snooze_interval_min 컬럼 추가 (DEFAULT 5). 나중에 사용자 설정 붙이면 이 컬럼값만 바꾸면 됨.
-- 복용 기록
CREATE TABLE dose_records (
  id                TEXT PRIMARY KEY,
  medication_id     TEXT REFERENCES medications(id) ON DELETE SET NULL,  -- 약 삭제 시 NULL, 기록 유지
  medication_name   TEXT NOT NULL,  -- 기록 시점 약 이름 스냅샷 (medication 삭제 후에도 표시 가능)
  time_slot_id      TEXT REFERENCES time_slots(id) ON DELETE SET NULL,
  scheduled_time    TEXT NOT NULL,  -- ISO datetime, 슬롯 삭제 후에도 시간 보존
  status            TEXT NOT NULL,  -- 'pending' | 'completed' | 'missed' | 'frozen'
  target_dose_count INTEGER NOT NULL DEFAULT 1,
  completed_at      TEXT,
  created_at        TEXT NOT NULL
);

-- 강제알람 탈출 기록
-- 사용자가 force_alarm 상태에서 "Emergency Escape" 버튼을 누른 이벤트를 남기는 audit 테이블.
-- 언제, 어떤 약의 알람을, 왜 탈출했는지 추적. streak 정책 및 통계에 활용.
CREATE TABLE escape_records (
  id              TEXT PRIMARY KEY,
  medication_id   TEXT REFERENCES medications(id) ON DELETE SET NULL,  -- 약 삭제 시 NULL 유지 (기록 보존)
  time_slot_id    TEXT REFERENCES time_slots(id) ON DELETE SET NULL,
  dose_record_id  TEXT REFERENCES dose_records(id) ON DELETE SET NULL,
  day_key         TEXT NOT NULL,  -- 'YYYY-MM-DD'
  reason          TEXT,
  is_user_fault   INTEGER NOT NULL DEFAULT 1,
  note            TEXT,
  created_at      TEXT NOT NULL
);
ㄴ 이거는 뭐지?? 제대로 설명해줄래
  ㄴ 강제알람(force_alarm) 화면에서 사용자가 "긴급 탈출" 버튼을 눌렀을 때 남기는 기록이야.
  ㄴ "언제, 어떤 약 알람을, 사용자 귀책인지" 추적하는 audit log. 나중에 "이 사람이 얼마나 자주 강제알람을 무시했나" 통계 낼 때 씀.
  ㄴ 지금 당장 안 쓰더라도 나중에 정책 만들 때 데이터가 있어야 하니까 남겨두는 거야.
  ㄴ ㅇㅎ ㅇㅋ

-- timeslot별 streak (freeze는 앱 전역에서 관리 → settings 테이블 참고)
-- streak 단위: timeslot별 연속 인증 횟수. 인증 즉시 +1.
CREATE TABLE time_slot_streaks (
  time_slot_id        TEXT PRIMARY KEY REFERENCES time_slots(id) ON DELETE CASCADE,
  current_streak      INTEGER NOT NULL DEFAULT 0,
  longest_streak      INTEGER NOT NULL DEFAULT 0,
  last_completed_date TEXT NOT NULL DEFAULT ''
  -- 15회 연속 달성 시 freeze 1개 획득 (15, 30, 45...마다 반복)
);
ㄴ freezes는 약별로 적용하지만, 사용자가 가질 수 있는 freezes가 3개 제한이라는 뜻이야. 수정해.
ㄴ 만약 freezes를 사용자가 1개를 갖고 있고, 약 2개가 시간이 지나버렸다면, 약 1개에만 선택적으로 freeze를 쓸 수 있다는 뜻이지.
  ㄴ 반영. freezes_remaining을 medication_streaks에서 제거하고 settings로 이동.
  ㄴ freeze는 사용자가 앱 전역으로 최대 3개 보유. 여러 약이 동시에 놓쳤을 때 어느 약에 쓸지 사용자가 선택.
  ㄴ굿굿

-- 참조 사진 (등록 시 찍는 알약 기준 사진)
CREATE TABLE reference_images (
  id              TEXT PRIMARY KEY,
  medication_id   TEXT NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  original_uri    TEXT NOT NULL,   -- 원본 사진 파일 경로
  cropped_uri     TEXT NOT NULL,   -- YOLO bbox crop 결과 파일 경로
  embedding       TEXT NOT NULL,   -- MobileNetV3 feature vector (JSON: "[0.12, 0.34, ...]")
  created_at      TEXT NOT NULL
);
ㄴ 나중에 3장~10장까지 추가하라고 시킬텐데 ㄱㅊ아? 그거 제한 안 걸어도 되겠어?
ㄴ 내가 sql문을 잘 몰라서 ㄱ런데 왜 text로 저장하는지 알 수 있어?
  ㄴ SQL 레벨 제한 안 걸어도 됨. 3~10장 제한은 앱 로직에서 처리하면 충분해. DB는 몰라도 됨.
  ㄴ TEXT인 이유: SQLite에는 배열 타입이 없어. MobileNet이 뽑는 embedding은 float 숫자 수백 개짜리 배열인데,
  ㄴ 이걸 "[0.12, 0.34, 0.56, ...]" 형태의 JSON 문자열로 저장하는 거야. BLOB(이진)으로도 가능하지만
  ㄴ TEXT JSON이 디버깅할 때 눈으로 읽을 수 있어서 개발 중에는 TEXT가 편함.
  ㄴ그렇군

-- 스캔 기록 → 제거 결정
-- dose_record에 completed_at이 있고, 스캔 성공 시 dose_record.status = 'completed'로 충분.
-- 디버깅/ML 정확도 분석 필요해지면 그때 추가.
ㄴ 스캔 기록은 필요한가??
ㄴ 스캔 바로 하고 인증되면 필요 없잖아.
ㄴ 여기 네 의견 부탁해.
  ㄴ 동의. MVP에서는 제거. dose_record.status + completed_at으로 충분히 추적 가능.
  ㄴ 나중에 "스캔 실패율", "유사도 분포" 같은 ML 분석이 필요해지면 그때 추가하는 게 맞음.
  ㄴ ㅇㅎ 그러면 dev용으로 만들어두자 나중에 내가 fp나 fn이라고 생각이 들면 자동으로 내 사진첩에 폴더별로 정리되면 좋을 것 같은데
  ㄴ 반영. dev 모드 플래그 켤 때 스캔 결과(이미지 + 유사도 점수)를 기기 사진첩 내 "TimepillDev/FP", "TimepillDev/FN" 폴더에 자동 저장하는 기능 추가 예정. 미결 사항에 추가.

-- 앱 설정 (단일 row)
CREATE TABLE settings (
  id                  INTEGER PRIMARY KEY DEFAULT 1,
  private_mode        INTEGER NOT NULL DEFAULT 0,
  freezes_remaining   INTEGER NOT NULL DEFAULT 0,  -- 앱 전역 freeze 보유량, max 3
  language            TEXT NOT NULL DEFAULT 'ko',  -- 언어설정
  dev_mode            INTEGER NOT NULL DEFAULT 0   -- FP/FN 사진 자동 저장 모드
);
-- alarm_volume / vibration_enabled 제거 — timeslot별 개별 관리 (time_slots 참고)
ㄴ 여기에 freeze가 들어가야한다고 생각함.
  ㄴ 반영. freezes_remaining을 settings로 이동. medication_streaks에서 제거.
  ㄴ 굿굿
ㄴ [claude] 엑셀 설정탭에 언어설정 있어서 language 컬럼 추가했어. 동의하면 놔두고 아니면 말해줘.
ㄴ동의
ㄴ [claude] dev_mode 컬럼도 추가. 미결사항에 있는 FP/FN 사진 저장 기능 on/off용.
ㄴ 좋다.
```

### 인덱스
```sql
CREATE INDEX idx_dose_records_medication_date
  ON dose_records(medication_id, scheduled_time);

CREATE INDEX idx_dose_records_status
  ON dose_records(status, scheduled_time);

CREATE INDEX idx_reference_images_medication
  ON reference_images(medication_id);
```
ㄴ 내가 index를 잘 몰라서 그런데 설명해줘.
  ㄴ 책의 목차 같은 거야. 책에서 "스트레스" 단어를 찾으려면 처음부터 끝까지 다 읽어야 하는데,
  ㄴ 목차(인덱스)가 있으면 바로 몇 페이지인지 알고 펼칠 수 있잖아.
  ㄴ DB도 마찬가지. 인덱스 없으면 "오늘 복용 기록"을 찾으려고 dose_records 전체를 훑어야 해.
  ㄴ idx_dose_records_medication_date가 있으면 medication_id + 날짜로 바로 점프. 앱이 빨라짐.

---

## 5. 스캔 파이프라인

### 카메라 입력 전처리 — UI 가이드 네모 crop 선제 적용

카메라 전체 프레임을 YOLO에 바로 넘기지 않는다. 스캔 화면 중앙의 정사각형 가이드 네모 영역만 먼저 crop한 뒤 YOLO에 넘긴다. 등록과 인증 스캔 모두 동일하게 적용.

```
카메라 원본 (기기마다 해상도 다름)
    ↓ UI 중앙 정사각형 crop
    ↓ YOLO 640×640 입력 (letterbox 패딩 ≈ 0)
    ↓ YOLO bbox → 원본 좌표 역변환
    ↓ 원본에서 알약 단위 crop → MobileNet 160×160 입력
```

**장점:** YOLO 처리 영역 축소 → 속도 향상 / 배경 노이즈 감소 / letterbox 역변환 단순화.

**구현 시 필수 처리 — Edge Case 2가지:**

```js
// 1. 해상도 파편화 대응 — crop 크기를 매 프레임 동적 계산 (하드코딩 금지)
const cropSize   = Math.min(frameWidth, frameHeight) * 0.75;
const cropStartX = (frameWidth  - cropSize) / 2;
const cropStartY = (frameHeight - cropSize) / 2;

// 2. padding Out-of-Bounds 클리핑 — 없으면 모서리 알약에서 앱 크래시
const cropX = Math.max(0, bboxX - padding);
const cropY = Math.max(0, bboxY - padding);
const cropW = Math.min(frameWidth  - cropX, bboxW + padding * 2);
const cropH = Math.min(frameHeight - cropY, bboxH + padding * 2);
```

상세 설계: `machinelearningplan.md` Section 5 참조.

---

### 참조사진 등록 (약 등록 시)
```
사진 찍기 (UI 가이드 네모 안에 알약 배치)
  → UI crop → YOLO11n.tflite 실행
  → bbox 없음 → "알약이 감지되지 않았어요. 다시 찍어주세요"
  → bbox 있음 → crop 저장 (cropped_uri)
              → MobileNetV3 Small.tflite → embedding 추출 → DB 저장
```
- 최소 3장, 최대 10장
- 카메라 화면에 YOLO bbox 실시간 오버레이 (사용자가 프레임 잡는 데 도움)
- 찍는 순간 바로 YOLO 실행 → 즉각 피드백

### 인증 스캔 (복용 확인 시)
```
카메라로 알약 촬영 (UI 가이드 네모 안에 배치)
  → UI crop → YOLO11n.tflite
  → 알약 없음 → 인식 실패, 재시도 유도 ("알약을 확인할 수 없습니다. 다시 scan해주세요")
  → 알약 있음 → bbox crop (padding + 클리핑 처리)
              → MobileNetV3 → embedding 추출
              → 등록된 참조사진 embedding들과 cosine similarity 비교
              → 판단
```
ㄴ [claude] "수동 확인 옵션"이 뭔지 정의 필요. 엑셀에서 "알약을 확인할 수 없습니다. 다시 scan해주세요" 라고 했는데, 수동으로 그냥 복용 완료 처리하는 버튼도 있는 건지?
ㄴ 수동확인은 안돼. 무조건 인증을 통해 검증해야함.
  ㄴ 반영. 스캔 실패 시 재시도 유도만. 수동 완료 버튼 없음. 미결 사항에서 제거.
ㄴ [claude] 강제알람에서 넘어온 경우 threshold를 낮게 쓰자고 엑셀에 적혀있었는데 — 동의함. 강제알람 context flag를 스캔 화면에 넘겨서 threshold 분기 처리하면 됨. 이거 여기 반영해야 함.
ㄴthreshold낮게 처리할 필요 ㅓㅄ음.
  ㄴ 반영. threshold 분기 제거. 파이프라인 텍스트에서 "수동 확인 옵션" → "재시도 유도"로 수정.

### 유사도 판단 기준 (보류 — 수치 추후 조정)
```
similarity >= 0.45  → matched (자동 인증)
similarity < 0.45   → no_match (수동 확인 옵션)
```
ㄴ 아직 보류. 이 약 맞나요? 확인 요청은 안 해도 될 듯. 0.45여도 그냥 넘어가자.
  ㄴ 반영. needs_confirmation 구간 제거. 0.45 이상이면 바로 matched 처리.
  ㄴ FN 줄이는 게 우선이라 관대하게 가는 방향 맞음. 수치는 실제 테스트 후 조정.
  ㄴ ㅇㅋㅋ

**FN(false negative)이 FP보다 UX에 더 치명적.** 약을 먹었는데 인증 실패 → 사용자 이탈.
참조사진 여러 장 중 하나라도 threshold 넘으면 matched.
ㄴ 하나라도 넘기기 vs 이상치 없애고 평균값 vs 중간값 등등 뭘 고를까??
  ㄴ 추천: 참조사진 3장 → max (하나라도 넘기기). 4장 이상 → 최저값 1개 제거 후 평균.
  ㄴ 이유: 3장은 샘플이 적어서 이상치 제거하면 오히려 불안정. 4장 이상이면 이상치 제거 후 평균이 노이즈에 강함.
  ㄴ 수치는 실제 테스트 후 조정. 보류로 남겨둠.

---

## 6. 주요 기능 설계

### Streak Freeze
- **timeslot별 연속 15회 인증 성공 시 freeze 1개 획득**, 최대 3개 보유 (앱 전역)
- freeze는 medication 단위로 적용, 보유량은 사용자 단위 (`settings.freezes_remaining`)
- freeze 사용 유효 기간: 실패 당일 + 다음날(D+1)까지
ㄴ [claude] "14일 연속 복용" 기준이 모호함. 약이 여러 개일 때 — 모든 약을 다 먹어야 1일 카운트? 아니면 약별로 각자 14일 세는 건지?
ㄴ timeslot별로 14번 연속 복용 어때? timeslot 14번 연속 복용하면 계정에 streakfreeze하나 주는거지
ㄴ [claude] freeze 획득 시점: 14일째 복용 완료 즉시 팝업으로 알려줄 건지, 아니면 설정탭에서 확인만 하는 건지.
ㄴ 팝업으로 알려주자! 사용자한테 뿌듯함을 제공하자.
ㄴ 15 연속 복용 단위 마다 streak freeze 1개 씩 제공 어때??
ㄴ 날짜보다는?
  ㄴ 반영. **timeslot별 15회 연속 인증 성공 시 freeze 1개 획득** (날짜 기준 아님). 이유: 하루 1번 슬롯이면 15일이고, 하루 2번 슬롯이면 7.5일 — 복용 빈도에 따라 자연스럽게 스케일됨. 15회마다 반복 (15, 30, 45...). 획득 즉시 팝업 알림. 반영.
  ㄴ **[정책 변경 — 이후 재변경됨]** medication별 연속 복용일로 바꿨다가 → Section 12F에서 다시 timeslot별로 최종 확정.
  ㄴ **[최종 정책 — Section 12F 확정]** timeslot별 연속 15회 인증 성공 시 freeze 1개. 스키마: time_slot_streaks (time_slot_id PK). 아래 medication별 내용은 폐기.
- **Semi-auto**: 복용 놓친 후 앱 열면 freeze 사용 팝업
  - 1개 놓쳤을 때: "이 약에 freeze를 사용하시겠습니까?"
  - 여러 개 놓쳤을 때: 놓친 약 목록 표시 → 어느 약에 쓸지 선택 (선택 안 함도 가능)
- 사용 시 `freezes_remaining - 1`, 선택한 약의 streak 유지
- 소진 기록 별도 저장 안 함
ㄴ 1번에 여러 알 놓치면 이 중에서 어떤 알약을 freeze하시겠습니까? 를 물어봐야하지 않겠나. freeze안 하는 선택지도 제공해야하고.
  ㄴ 반영. 여러 약 동시 놓쳤을 때 목록 보여주고 선택. "사용 안 함" 선택지 포함.
  ㄴ 굿. 팝업창으로 제공할 것 맞지?
  ㄴ 맞아. 앱 열릴 때 홈 위에 팝업으로 띄움. 선택 후 닫히는 방식.

### Private Mode
- 앱 전역 설정 (`settings.private_mode`)
- 활성화 시 모든 화면/팝업/알람에서 약 이름 → 알약1, 알약2... 로 표시
- DB에는 실제 이름 그대로 저장, 표시 레이어에서만 처리

### 주기 설정 (cycle_config JSON 예시)
```json
// 매일
{"type": "daily"}

// 주중 (월~금)
{"type": "weekly"}

// 주말 (토~일)
{"type": "weekends"}

// 요일 선택 (월/수/금)
{"type": "specific_days", "days": [1, 3, 5]}

// 휴약기 — active_value(1~99), rest_value(1~99), unit: 'day' | 'week'
// 예: 7일 복용 3일 휴식
{"type": "rest", "active_value": 7, "rest_value": 3, "unit": "day"}
// 예: 2주 복용 1주 휴식
{"type": "rest", "active_value": 2, "rest_value": 1, "unit": "week"}
// 등록 default
{"type": "rest", "active_value": 1, "rest_value": 1, "unit": "day"}
```
ㄴ 주말도?
  ㄴ 반영. cycle_type에 'weekends' 추가.
  ㄴㅇㅋㅋ
ㄴ 등록탭에서 휴약기 선택 시 default는 당연히 1:1이다.
  ㄴ 반영. rest default를 active_days:1, rest_days:1로 명시.
  ㄴ active(1~30), rest(1~30) dayorweek(y/n) 등으로 바꾸어야함. 주단위로 먹는 약이 있을 수 있으니까
  ㄴ여기 주석 다는게 맞는지는모르겠는데 참고하고 수정할 수 있도록 어느번째 줄 수정했는지 나중에 말해줄 수 있도록.
  ㄴ 반영 (277번째 줄). rest JSON 구조를 active_value/rest_value/unit 으로 변경.
  ㄴ unit은 'day' | 'week'. 각각 1~99 범위. 주단위 휴약기도 커버됨.
  ㄴ 정수 범위는 1~99로 하자
    ㄴ 반영 (277번째 줄). 1~30 → 1~99로 수정.
  ㄴ 근데 나중에 ui만들 때 scroll혹은 직접입력 둘 다 가능하게 만들면 좋을 듯, 일/주 선택은 그냥 스크롤로 하고.
  ㄴ 이것도 어디다가 반영해둘건지 줄 번호 적어줘.
    ㄴ 등록 화면 UI 상세 내용이라 7. 화면 구성 → 등록 탭 항목에 반영. 아래 316번째 줄 참고.

### on/off 토글 (time_slots.is_active)
- 기본값 on
- off로 바꿀 때: "하루만 건너뛰시겠습니까?" 팝업
- yes → `is_active = 0`, 다음 인증 시간 이후 자동으로 on
- no → 그냥 off
ㄴ [claude] "다음 인증 시간 이후 자동으로 on" — 구현 방식 미결. 앱이 켜질 때마다 체크하는 방식인지, 백그라운드 job인지. 앱 열릴 때 체크하는 게 제일 단순한데 동의해?
ㄴ 앱이 켜질 때마다 체크하면, 앱을 그 이후로 안 켰을 때 동기화가 안 될텐데?? 자정마다 backgroundjob으로 하든가?
ㄴ 만약 자정에 울리는 알람을 off한 경우에는 어쩌지 1시간 마다 해야하나나?
ㄴ [claude] "no → 그냥 off"일 때 streak는 어떻게 처리해? off 상태로 인증 못 하면 streak가 끊기는 건지, off된 날은 streak 계산에서 제외하는 건지.
ㄴ off 상태에서는 인증도 안 해도 되는거지, 그래서 그냥 streak계산에서 제외하자 어때?
ㄴstreak계산은 timeslot 별로 연속 인증성공의 개수를 세면 되지, 그러다가 인증 missed가 생기면 연속 끊김, freezed가 생기면 그대로 연속 지속, 어때?
ㄴ그러면 off 상태에서는 timeslot의 인증이 missed될 일이 없으니까. streak유지인거지
  ㄴ **자동복구 방식 확정: 알람 스케줄링으로 처리.** "하루 건너뛰기" on 시, 해당 슬롯의 다음 인증 시간에 알람을 등록해두고 알람 콜백에서 is_active=1로 되돌림. 자정 background job 불필요. 자정 알람 off 케이스도 커버됨. expo-task-manager + expo-notifications 조합으로 구현 가능.
  ㄴ 그런데 그러면 user가 앱을 다시 켰을 때 어 뭐야 비활성화 되어있네?라고 생각할 수도 있잖아
  ㄴ어플을 켰을 때에도 체크할 필요가 있지 않나? 음.
  ㄴ다시 예시 들어볼게. 만약. 매일 08:30에 등록시간(range1시간)인 timeslot이 있어. 내가 7시에 그 timeslot을 하루만 off를 눌렀어. 그렇다면, 그날 9:30분 이후에 어플리케이션을 켰을 때에는 다시 timeslot이 활성화가 되어있어야한다고 생각해.
  ㄴ 네생각은 어때때
    ㄴ 완전 동의. **이중 복구 메커니즘으로 확정:**
    ㄴ ① 알람 콜백: skip_until 시각에 백그라운드 알람 등록 → 시간 되면 is_active=1 복귀 (앱 꺼져 있어도 동작)
    ㄴ ② 앱 시작 시 체크: 앱 열릴 때마다 skip_until < 현재시각인 슬롯을 조회 → is_active=1로 일괄 복귀
    ㄴ 둘 다 있으면 예시 케이스(9:30 이후 앱 열었을 때) 완전 커버. skip_until 컬럼 time_slots에 추가 필요.
  ㄴ **streak 정책 최종 확정 (medication별 연속 복용일):**
  ㄴ - medication별로 스트릭 카운트 (medication_streaks.current_streak = 연속 복용 일수)
  ㄴ - 1일 완료: 해당 약의 모든 active timeslot 완료 시
  ㄴ - off(is_active=0) 슬롯은 제외하고 나머지만 완료하면 됨 → missed 안 됨 → streak 유지
  ㄴ - missed 발생 → streak 리셋 (0으로)
  ㄴ - freeze 사용 → streak 유지
  ㄴ - **연속 10일 달성 시 freeze 1개 획득, 팝업 알림**

### 슬롯 삭제
- 삭제 버튼 → "삭제하시겠습니까?" 확인
- 해당 medication의 마지막 timeslot이면 → "약도 함께 삭제됩니다" 추가 안내
ㄴ 이 부분은 좀 더 고민해보자.
  ㄴ 보류. UX 흐름 더 구체화되면 재논의.

---

## 7. 화면 구성

| 탭 | 설명 |
|---|---|
| 홈 | 오늘 알람 현황, 시간순 정렬, streak 표시 |
| 등록 | 약 등록/수정, 참조사진 촬영. 시간 선택: 3컬럼(오전/오후 스크롤 \| 시 스크롤+직접입력 \| 분 스크롤+직접입력). 휴약기 숫자 입력: 스크롤 또는 직접 입력 둘 다 지원. 일/주 단위 선택은 스크롤. |
ㄴ 등록탭에 시간 정할 때에도 스크롤 또는 직접 입력 둘 다 지원하자(오전/오후 제외), 3colums로 만들자
  ㄴ 반영 (319번째 줄). 시간 선택 3컬럼 구조 명시. 오전/오후는 스크롤만, 시/분은 스크롤+직접입력 둘 다 지원.
| 기록 | 캘린더 뷰, 날짜별 달성률, 약별 색상 indicator |
| 설정 | streak freeze 현황, escape 기록, private mode 등 |
| 알람 | 강제알람 화면 (full screen) |
| 스캔 | 인증 카메라 화면 |
ㄴ [claude] 홈/등록/기록/설정 각 화면 상세 설계가 이 표 한 줄씩밖에 없음. 각 화면별로 섹션 따로 만들어서 채워야 구현 가능. 아래에 섹션 추가 제안함.

ㄴ [claude] 알람(강제알람) 화면 플로우가 완전히 비어있음. 엑셀에도 알람 탭이 비어있었고. 이게 핵심 기능이라 제일 먼저 채워야 함.

ㄴ [claude] 스캔 화면도 한 줄밖에 없음. 엑셀에 적어뒀던 내용 (인증 가능 알약 목록, 강제알람 context 분기 등) 여기로 옮겨서 정리 필요.

ㄴ [claude] 알약사진등록 플로우(등록 시 사진 찍는 단계)가 Section 5 파이프라인에만 있고 화면 흐름으로는 안 정리됨.
ㄴ 저 밑에 달아볼게.
### 7-1. 홈 화면 상세
ㄴ [claude] 엑셀에서 읽은 내용 정리해서 초안 작성함. 수정할 부분 ㄴ로 달아줘.

- 상단: 어플 이름 + streak 요약 (약별 현재 streak, 최대 streak, 평균 복용률)
ㄴ 어플 이름은 최상단.
  ㄴ 반영. 레이아웃: 앱 이름(최상단 고정) → streak 요약 → 오늘 알람 리스트.
- streak 영역이 스크롤로 사라지면 → 중앙 하단에 작은 동그란 화살표 버튼 표시, 누르면 최상단으로 이동
- 오늘 알람 현황 리스트 (시간순 정렬)
  - 각 row: 시간 / 약이름 / 몇 정 / 강제알람 여부 / 알람 여부 / on-off 토글 / 인증버튼 / 삭제버튼
  - 정렬 기준: 인증 가능한 slot 중 등록시간 가장 빠른 순 → 인증 불가 slot 중 다음 등록시간 가장 빠른 순
  - 인증버튼: 인증 가능 시간이 아닐 때 회색 비활성화
  - on-off 토글: off 전환 시 "하루만 건너뛰시겠습니까?" 팝업
  - 비활성화된 row는 최하단으로 자동 재정렬
  - row 터치 → 해당 timeslot 수정 모드로 등록탭 이동
  - 인증버튼 터치 → 스캔 화면으로 이동
- 최하단 고정: 광고 배너 (도입 여부 미결)
ㄴ 일단 도입x 대신 나중에 도입하기 쉽게 만들어두자.
  ㄴ 반영. MVP에서 배너 제외. 레이아웃에 탭바 아래 공간만 예약해두면 나중에 AdMob SDK 붙일 때 레이아웃 수정 없이 바로 on/off 가능.
ㄴ 나중에 도입하더라도, 탭 네비게이션 바 아래에 있어야할 듯. 매우 작게.
  ㄴ 반영. 광고 배너 위치: 탭 네비게이션 바 아래, 매우 작게. 도입 시 홈 레이아웃에 최하단 고정 영역으로 배치.
- 최하단 고정: 탭 네비게이션 바

ㄴ [claude] 엑셀에 "비활성화된 탭끼리도 마찬가지인 정렬 순서를 가짐" 이라고 했는데 — 비활성 row 안에서도 시간순 정렬하는 건지?
ㄴ 그렇지. 시간순만 하면 안 되고 일시까지 다 따져서 비활성화된 탭들 중에서 가장 빨리 등록일시가 다가오는 순서로 정렬하는거지.
ㄴ 근데 비활성화된 탭들 중에서도 그 완전 off인 애들이랑 한 번만 skip하는 애들이랑 구분해야할 것 같은데 어떻게 생각하니??
  ㄴ 동의. 비활성 row 안에서도 구분 필요. 정렬 우선순위 제안:
  ㄴ 1순위(활성): 인증 가능한 slot → 다음 인증시간 오름차순
  ㄴ 2순위(1회 skip): is_active=0 + skip_until 있음 → 복귀 시간 오름차순. 색상 살짝 옅게
  ㄴ 3순위(완전 off): is_active=0 + skip_until 없음 → 다음 예정 시간 오름차순. 회색 처리
  ㄴ skip_until 컬럼이 time_slots에 없어서 추가 필요. 반영.
### 7-2. 등록 화면 상세
ㄴ [claude] 초안. 수정할 부분 ㄴ로 달아줘.

- 진입 시 항상 초기화 (다른 탭 갔다 오면 비워짐). 단, 주기=매일, 시간=08:00, 1정, 알람=on 은 default 유지
ㄴ 시간은 현재 시간으로 유지
ㄴ강제 알람은 off고
ㄴ팝업은 on이야.
  ㄴ 반영. default: 주기=매일, 시간=현재시간, 1정, 팝업=on, 알람=on, 강제알람=off.
  ㄴ또 default로 해둬야할 사항이 있을까?
    ㄴ 추가 default 제안: 스누즈=off(0회), 진동=on, verification_window=60분, snooze_interval=5분. 이미 DB DEFAULT로 설정된 것들이라 앱에서 별도 처리 없어도 됨. 등록 화면에서 보여줄 기본값으로 위 값들 그대로 쓰면 됨.
- 수정 모드 진입 시: 해당 timeslot 정보 불러와서 채워둠
- 구성 요소:
  - 약 이름 입력 (기등록 약 이름 자동완성 제안)
  - 복용 수 선택 (1~10, Stepper 또는 WheelColumn)
  - 시간 선택 (오전/오후 | 시 | 분 — 3컬럼 스크롤+직접입력)
  - 주기 선택 (매일 / 주중 / 주말 / 요일 선택 / 휴약기)
  - 휴약기 선택 시: 복용일 | / | 휴약일 | 단위(일/주) — 3컬럼
  - 알람 여부 토글
  - 강제알람 여부 토글
  ㄴ 알람 여부가 on이어야만 활성화됨. 그러니까 알람 여부가 off이면 비활성화일뿐더러 off임.
  - 팝업 여부 토글
  - 알람 소리 선택
  - 진동 여부 토글
  ㄴ 알람소리 선택이랑, 진동 여부도 알람 여부가 on이어야함.
  ㄴ 팝업 여부를 가장위로 올리고 안내하기 쉽게 팝업여부 - 알람여부 - 알람에 따른 기타등등여부들(강제/알람소리/진동/스누즈 등등등) 선택으로 하자.
  ㄴ 그리고 휴약기 선택 다음 사진 등록 다음 알람~~으로 하자. 필수로 채워야하는 것들부터 먼저 보여주고 싶었어.
  ㄴ 반영. 구성 요소 순서 재배치:
  ㄴ [필수] 약 이름 → 복용 수 → 시간 → 주기(→ 휴약기) → 사진 등록
  ㄴ [알람] 팝업 여부 → 알람 여부 → (알람 on일 때만) 강제알람 / 알람소리 / 진동 / 스누즈
  ㄴ 강제알람·알람소리·진동·스누즈는 알람 여부 off면 비활성화 + off 고정.
  - 스누즈 토글 + 횟수(0~3) + 간격(분)
  - 알약 사진 등록 (+ 버튼 → 카메라/갤러리, 최소 3장 최대 10장)
  - 저장 버튼 (하단 탭바 위)
- 저장 없이 탭 이동 시: "저장하지 않고 나가시겠습니까?" 팝업

ㄴ [claude] 알약 사진 등록을 등록 화면 안에서 하는 건지, 별도 화면(알약사진등록 탭)으로 이동하는 건지? 엑셀에 탭이 따로 있었는데 흐름 명확히 해야 함.
ㄴ 별도 화면으로 하고 싶었던 이유는 알약을 예쁘게? 인식하기 좋게? 업로드하기 좋게 하려고 했었는데, 그게 아니라면. 그냥 카메라/갤러리 선택으로 해도 될 것 같아.
ㄴ 대신 사진을 받고, yolo로 bbox를 치고 crop해서 저장하는 과정이 시간이 걸리니까. 처리중.. 하는 멘트가 떠야할 것 같아. 어때?
  ㄴ 반영. 별도 화면 없이 등록 화면 내에서 처리. + 버튼 누르면 카메라/갤러리 선택 → 사진 선택 후 YOLO 처리 중 로딩 오버레이("알약을 인식하는 중...") 표시 → 완료 후 crop 썸네일 row에 추가. 미결 사항에서 해당 항목 제거.

### 7-3. 강제알람 화면 상세
ㄴ [claude] 엑셀 알람 탭이 비어있어서 내가 플랜 기반으로 초안 잡았어. 빠진 거 추가하거나 틀린 거 수정해줘.

- Full screen (잠금화면에서도 실행 가능해야 함 — 구현 방법 미결)
ㄴ 어떻게 구현하면 좋을까 추천 받음.
  ㄴ Android: `full-screen intent` 방식. expo-notifications의 `setNotificationHandler`만으론 부족하고, `expo-intent-launcher` 또는 native module로 `FLAG_SHOW_WHEN_LOCKED + FLAG_TURN_SCREEN_ON + FLAG_DISMISS_KEYGUARD` 플래그를 Activity에 설정해야 함. react-native-alarm-notification 라이브러리가 이걸 처리해줌 — 검토 필요.
  ㄴ라이브러리 도입하자. 라이브러리 도입하면 생길만한 단점이나 문제점 있어?
    ㄴ 주요 단점 3가지:
    ㄴ ① **Expo Go 불가** — native 코드 포함이라 Expo Go 앱에서 테스트 불가. EAS Build로 custom dev client 만들어야 함. 개발 환경 세팅이 한 단계 더 필요.
    ㄴ그러면 강제 알람은 어쩔 수 없이 가장 마지막에 개발해야겠네. 디버깅하는 과정이 매우 시간이 오래 걸리니까.
      ㄴ 맞음. 강제알람은 개발 순서상 마지막. EAS Build 없이는 테스트 자체가 안 되니까 나머지 기능 다 붙이고 마지막에 진행.
    ㄴ ② **Android 버전별 권한 파편화** — Android 12+는 `SCHEDULE_EXACT_ALARM` 권한 별도 요청 필요. 기기마다 배터리 최적화 예외 설정도 달라서 일부 기기에서 알람이 안 울릴 수 있음.
    ㄴ 그런 권한들을 다 요청하는 거는 어때?
      ㄴ 맞음. 앱 최초 실행 시 또는 첫 알람 설정 시 필요한 권한을 한 번에 요청하는 게 좋음. `SCHEDULE_EXACT_ALARM` + 배터리 최적화 예외는 설명 팝업 띄우고 설정 화면으로 안내하는 방식으로 구현. 사용자가 거부하면 알람이 정확하지 않을 수 있다고 경고만 표시.
    ㄴ ③ **라이브러리 유지보수 리스크** — react-native-alarm-notification이 active하게 관리되는지 확인 필요. Expo SDK 버전 올릴 때마다 호환성 체크해야 함.
    ㄴ 대안으로 expo-notifications + expo-task-manager 조합으로 직접 구현하는 방법도 있음 — 더 복잡하지만 Expo 생태계 안에서 관리 가능. 어떤 방향 선호해?
    ㄴ 직접 구현하면 많이 달라져?? 예상 소요시간과 bug가 생길 가능성은?
      ㄴ 차이 요약:
      ㄴ **라이브러리(react-native-alarm-notification)**: 세팅 1~2일. 버그는 주로 Android 버전별 차이에서 나고, 라이브러리가 대부분 처리해줌. Expo SDK 버전업 시 호환성 체크 필요.
      ㄴ **직접 구현**: 3~7일. full-screen intent Android native 코드를 직접 짜야 해서 Java/Kotlin 코드 진입. 버그 가능성 높고 디버깅 어려움. Expo 생태계 안에서 관리되는 장점은 있음.
      ㄴ **추천: 라이브러리.** 소요시간 차이가 크고 직접 구현이 버그 리스크가 훨씬 높음. 라이브러리 유지보수 리스크는 SDK 버전 올릴 때 한 번씩 확인하면 충분.
  ㄴ iOS: `UNNotificationContent` + foreground presentation + UIApplication full screen 처리. lockscreen에서 full screen은 iOS 정책상 제한 있음 (CallKit 수준이 아니면 불가). 현실적 대안: 크게 뜨는 배너 + 소리/진동으로 대체.
  ㄴ MVP에서는 Android full-screen intent 먼저 구현, iOS는 배너 수준으로 출시 후 대응.
  ㄴ ㅇㅋ
- 표시 내용: 약 이름 / 복용 시간 / 몇 정
- 버튼:
  - 인증하기 → 스캔 화면으로 이동 (강제알람 context 플래그 전달)
  - 스누즈 (설정된 횟수 남아있을 때만 활성화)
  - 긴급 탈출 (escape_records 기록 후 홈으로)
- 인증 완료 시 알람 해제 → 홈으로
- 강제알람 중 스캔 threshold: 일반과 동일 (threshold 분기 없음)
ㄴ [claude] 강제알람 시 인증 가능한 알약만 보여주자고 엑셀에 있었어. 동의함. timeslot의 verification_window_min 기준으로 현재 인증 가능한 것만 필터링.
ㄴthreshold 일반보다 낮게 안 해도 될 것 같은데.
ㄴ대신 현재 인증가능한 것들보다. 지금 인증해야하는 알약들만 보여주고, 그 인증해야하는 알약에서 유사도 검사 해야할 듯. 사용자가 인증해야하는 알약을 보여줬는데 다른 약이 인증되어버려서 강제 알람 인증이 늦어진다면 짜증날 것 같아.
  ㄴ 반영. threshold 분기 제거. 강제알람 context에서 스캔 화면 진입 시 → 해당 alarmtimeslot의 약만 인증 대상으로 고정. 다른 약은 embedding 비교 대상에서 제외.
ㄴ여기다가 적는거 아닌건 아는데 scan화면에서 후레시를 켤 수 있는 버튼이 있으면 좋을 것 같아.
  ㄴ 반영. 스캔 화면에 플래시 토글 버튼 추가. expo-camera의 `flashMode` prop으로 구현 가능.
ㄴ [claude] 알람끼리 시간 충돌 시 처리 정책이 미결 사항에 있음. 같은 시간에 알람 2개면 어떻게 할지 정해야 함.
ㄴ 같은 시간에 알람이 2개면 알람이 울리는 동안 다른 알람은 뜨지 않게 하자.(popup 정도만)
ㄴ 만약 강제 알람과 그냥 알람이 겹쳐버리면.. 알람 화면에서 강제 알람 화면으로 옮겨질 수 있나?
ㄴ 그리고 인증해야하는 알약 목록만 새로고침하면 좋을 것 같은데 어떻게 생각해?
  ㄴ 반영. 충돌 정책:
  ㄴ 같은 시간 알람 2개: 첫 번째 알람 처리 중이면 두 번째는 popup 알림만 (화면 전환 없음).
  ㄴ 강제알람 + 일반알람 겹침: 강제알람 우선. 일반알람은 "대기열"에 넣고, 강제알람 해제 후 팝업으로 알림.
  ㄴ 강제알람 화면 내 알약 목록: 실시간 새로고침 (인증 완료 시 해당 항목 제거). 모두 완료되면 자동 해제.
  ㄴ 알람 충돌 미결 사항에서 제거.
  ㄴ 질문, 만약 snooze로 그냥 알람을 미룬 상태에서 강제 알람이 떠야하면 어떻게 처리할건데?
    ㄴ **스누즈 대기 중 + 강제알람 발생:** 강제알람 full screen intent가 우선 실행됨. 스누즈 타이머는 백그라운드에서 계속 카운트. 강제알람 해결 후 스누즈 시간 되면 → 강제알람이 이미 꺼진 상태면 정상 알림, 강제알람 아직 처리 중이면 팝업으로 쌓임. 스누즈 자체는 취소 안 함 — 두 알람이 독립적으로 처리됨.
    ㄴ 1분 차이로 알람들이 켜져도 대응 가능한거지?
      ㄴ 대응 가능. 각 알람은 독립적으로 스케줄되고 library가 개별 처리함. 1분 차이든 1초 차이든 충돌 정책(강제알람 우선 / 일반알람 팝업 대기)이 동일하게 적용됨.
    ㄴ 원래 울리던 그냥 알람이 울리다가 강제 알람이 떠야하면 그냥 알람을 그냥 멈추고 강제 알람이 다시 뜨는거니? 아니면 강제알람 context를 넘기면 새로고침 될 수 있는거니?
      ㄴ 강제알람 full-screen intent가 발동되면 현재 일반알람 소리/진동은 dismiss되고 강제알람 화면이 위에 뜸. 사용자 입장에선 "바뀐" 것처럼 보임. 기술적으로는 새 화면이 스택에 push되는 방식 — context(어떤 약 인증해야 하는지)는 강제알람 intent에 실어서 넘기면 됨. 일반알람 화면은 백그라운드에 남아있다가 강제알람 해제 후 팝업 알림으로 처리.

### 7-4. 스캔 화면 상세
ㄴ [claude] 초안. 엑셀 스캔탭 내용 + 플랜 기반.

- 카메라 뷰 (중앙 정사각형 가이드 네모)
- 현재 인증 가능한 알약 목록 표시 (화면 하단)
ㄴ 우측에 작게 목록으로 표시 어때?
ㄴ scan버튼이 화면 중하단에 있어야할 거 같은데데
  ㄴ 반영. 레이아웃: 카메라 뷰(중앙 가이드 네모) / scan 버튼(중하단) / 알약 목록(우측 세로 작은 칩). scan 버튼이 중앙 하단에 크게, 목록은 우측에 겹치지 않게 배치.
- YOLO bbox 실시간 오버레이
ㄴ 실시간 오버레이를 한다고?
ㄴ user한테 보여준다는 뜻이야?
  ㄴ 맞음. 카메라 프리뷰 위에 YOLO가 감지한 알약 위치에 실시간으로 초록 사각형을 그려줌. 사용자가 "지금 알약이 인식되고 있구나"를 눈으로 확인하고 scan 버튼을 누를 수 있음. 프리뷰는 매 프레임 YOLO 추론 → bbox 오버레이 → 화면 표시 루프로 동작. scan 버튼 누르는 순간 프레임 정지 후 최종 추론.
  ㄴ 실시간 오버레이는 휴대폰 특성상 불가능할 것 같은데??
    ㄴ 기술적으로 불가능하진 않음 (YOLO11n int8 TFLite 5~15fps 가능). 그러나 구형 기기에서 lag 있고 배터리 소모 큼.
  ㄴ yolo뿐 아니라 mobilenet도 적용할것이라서 굳이 안해도 될듯.
    ㄴ 동의. MobileNet이 실제 인식을 담당하니 YOLO bbox 시각화가 UX 가치를 크게 더하지 않음. 오버레이 제거.
  ㄴ 만약 할 거면 알약이 감지되고 있습니다.. 정도??
    ㄴ 반영. 실시간 박스 대신 텍스트 인디케이터로 대체. N프레임마다 YOLO 경량 체크 → 알약 감지 시 "알약이 감지되고 있습니다" 텍스트 표시, 미감지 시 숨김. 박스 드로잉 없음.
- scan 버튼 (누르면 정지 프레임 → 인식)
- 인식 성공: "~~ 인증 완료! 인증 가능한 알약이 남아있다면 더 인증하시겠어요?" 팝업
  - 예 → 스캔 화면 유지
  - 아니요 → 홈으로
- 인식 실패: "알약을 확인할 수 없습니다. 다시 scan해주세요"
- 모든 알약 인증 완료 시: "현재 모든 알약을 인증하셨습니다! 홈으로 돌아갑니다"
- dev 모드 on: 별도 로그 창 열 수 있는 버튼 표시
ㄴ여기에 fp인가요? fn인가요?를 추가하는게 어때?
ㄴ 스캔할 때마다 fp인가요? fn인가요?를 물어보면 될 거 같은데
  ㄴ 반영. dev 모드 on일 때만 노출. 스캔 결과 직후 "이 결과가 정확했나요?" → FP(틀린 인증) / FN(놓친 인식) / 정확함 선택 UI. 선택 시 이미지 + 유사도 점수를 TimepillDev/FP or FN 폴더에 저장.
- 잠금화면에서도 실행 가능 (강제알람 연결 시)
ㄴ 그냥 알람에서도 인증 버튼을 누르면서 알람이 꺼지면 좋을 것 같은데?
  ㄴ 반영. 일반 알람 화면에도 "인증하기" 버튼 추가. 누르면 스캔 화면으로 이동 + 알람 소리/진동 해제. 강제알람이 아닌 경우도 동일한 흐름으로 통일.

---

### 7-5. 기록 화면 상세

#### 화면 구성
```
┌─────────────────────────────┐
│  [월 선택]  < 2026년 4월 >  │
├─────────────────────────────┤
│  [캘린더]                   │
│  월~일 7열, 날짜별 dot 표시  │
│  - 모두 완료: 초록 dot       │
│  - 일부 완료: 노란 dot       │
│  - 미복용: 빨간 dot          │
│  - 데이터 없음: 없음         │
├─────────────────────────────┤
│  [선택한 날짜 상세]          │
│  약이름  ✅  완료             │
│  약이름  ❌  미복용           │
│  약이름  —   해당 없음        │
├─────────────────────────────┤
│  [전체 복용률 요약]          │
│  이번 달 전체: 82%           │
│  약이름별 복용률:            │
│    약A  ████░░  90%          │
│    약B  ███░░░  70%          │
├─────────────────────────────┤
│  [연속 복용 현황]            │
│  약A - 오전 8시   🔥 12일    │
│  약B - 저녁 9시   🔥 5일     │
└─────────────────────────────┘
```
ㄴ 선택한 날짜 상세는 해당 날짜를 터치 햇을 때 popup으로 띄워야하는 거 알지? 약이름 완료/미복용/해당없음 보다는 해당없는 약 이름은 보여주지 말고, 약이름과 그 날의 복용률만 넣으면 될 것 같은데, 그리고 그날 streak freeze나 skip을 했는지 등등.

#### 기록 삭제
- 날짜 상세 영역에서 개별 dose_record 스와이프 또는 롱프레스 → 삭제 확인 팝업
ㄴ 꾹 눌러서 삭제하는 것 보다는 그 행에 삭제 버튼(-)이 있는 것이 좋은 것 같아.
- 삭제 시 해당 dose_record 제거 + 해당 timeslot의 streak 재계산
- medication 삭제 후 남은 기록은 `medication_name` 스냅샷으로 표시 (medication_id = NULL)

#### 데이터 쿼리
- `getDoseRecordsByMonth(year, month)` — 월별 날짜별 completed/total
- `getMedicationCompletionRate(medicationId, year, month)` — 약별 복용률
- `getStreakSummary()` — timeslot별 current_streak

#### 파일
- `app/(tabs)/history.tsx`
- `src/db/repositories/doseRecordRepository.ts` (조회 메서드 추가)

---

### 7-6. 설정 화면 상세

#### 화면 구성
```
┌─────────────────────────┐
│  Private Mode    [토글] │
│  약 이름 대신 알약1/2.. │
├─────────────────────────┤
│  Freeze 현황            │
│  남은 freeze: N개 / 3개 │
│  (사용 기록 없으면 숨김) │
├─────────────────────────┤
│  언어 선택     [드롭다운]│
│  한국어 / English        │
├─────────────────────────┤
│  Dev Mode        [토글] │
│  (활성 시 스캔 결과 로그│
│   + FP/FN 피드백 UI)    │
├─────────────────────────┤
│  버전정보 v1.0.0        │
└─────────────────────────┘
※ 알람 볼륨 / 진동은 timeslot별 설정 (등록 화면에서 관리)
```

#### Private Mode
- `settings.private_mode = 1` 이면 모든 화면에서 약 이름 → "알약1", "알약2"... (등록 순서 기준)
- `src/utils/displayName.ts` 에서 처리, 홈/스캔/알람/기록 전체 적용

#### Dev Mode
- on: 스캔 화면 하단에 로그 버튼 표시, FP/FN 피드백 UI 활성화
- off: 관련 UI 완전 숨김

#### 파일
- `app/(tabs)/settings.tsx`
- `src/hooks/useSettings.ts`
- `src/utils/displayName.ts`

---

## 8. v2에서 가져갈 것

| 경로 | 내용 |
|---|---|
| `src/domain/scan/yoloPillDetector.ts` | YOLO TFLite 연동 |
| `src/domain/scan/runScanInference.ts` | 스캔 파이프라인 (ML Kit 부분 제거 후 재활용) |
| `src/domain/scan/guideFrames.ts` | 카메라 가이드 ROI |
| `src/domain/scan/pillInHandDetector.ts` | 손 안의 알약 감지 보조 |
| `src/labs/scanSession/` | 스캔 세션 상태 머신 (reducer, selectors) |
| `src/domain/occurrence/index.ts` | occurrence 생성 비즈니스 로직 |
| `assets/models/best_int8.tflite` | 현재 YOLO 모델 |
| `ml/` | 훈련 데이터, 노트북, 모델 원본 |
ㄴ v2에서 등록탭의 시간 입력 ui가져오자 그걸로 휴약기 숫자 입력, 등록 시간 입력하는데 참고하면 될듯.
ㄴ v2에서 말고 그냥 timepill폴더도 있거든?? 거기서도 가져올만한 것 면밀히 분석해서 가져와볼래?
ㄴ 이 밑에다가 작성하면 내가 검토해볼게 줄 번호 알려줘
  ㄴ timepill 폴더는 C 드라이브 어디에도 없었어. 혹시 다른 경로가 있으면 알려줘. v2만 분석함.
  ㄴ v2 AddScreen.tsx 분석 결과 (아래 348번째 줄부터 항목 추가):
  ㄴC:\Users\bgl08\OneDrive\바탕 화면\약먹자친구들 여기기
    ㄴ 반영. OneDrive 경로에서 발견. 분석 결과 아래 표에 추가.

### v2에서 가져올 것 (UI 컴포넌트)

| 경로 | 내용 | v3 활용 방법 |
|---|---|---|
| `src/screens/AddScreen.tsx` → `WheelColumn` (217~365번 줄) | PanResponder 기반 스크롤 휠. `inputEnabled` prop으로 더블탭 직접입력 모드 전환. `halfVisible` prop으로 표시 행 수 조정. spring 스냅 애니메이션 포함. | 시간(오전/오후·시·분), 휴약기 숫자(active_value, rest_value), 복용 수 입력에 재사용. **직접입력 지원하므로 timepill보다 기능 우위.** |
| `src/screens/AddScreen.tsx` → 시간 피커 모달 (946~992번 줄) | AMPM\|시\|:\|분 3컬럼 구조. AMPM은 `inputEnabled=false`, 시·분은 더블탭 직접입력 지원. | v3 등록탭 시간 입력 모달 기반으로 사용. |
| `src/screens/AddScreen.tsx` → 휴약기 휠 블록 (1074~1110번 줄) | 복용\|/\|휴약\|단위(일/주) 3컬럼. `halfVisible=1`로 컴팩트 표시. | v3 휴약기 입력에 재사용. `CYCLE_ITEMS`를 30→99로 확장 필요. |
| `src/screens/AddScreen.tsx` → `Stepper` (171~207번 줄) | +/- 버튼, min/max, suffix. | 복용 수(dose_count_per_intake) 입력. WheelColumn으로 대체도 가능. |

### timepill(원본)에서 가져올 것

경로: `C:\Users\bgl08\OneDrive\바탕 화면\약먹자친구들\timepill\`

| 경로 | 내용 | v3 활용 방법 |
|---|---|---|
| `src/components/time-picker-modal.tsx` | FlatList + `snapToInterval` 기반 WheelColumn. 훨씬 단순한 구현. 3컬럼(오전/오후·시·분). 직접입력은 없음. | v2의 PanResponder WheelColumn과 비교해서 **구현 방식 참고용**. 직접입력 필요하면 v2 채택, 단순함 원하면 이 방식. |
ㄴ 직접 입력 원함.
  ㄴ 반영. v2 WheelColumn(PanResponder + 더블탭 직접입력) 채택. timepill 원본은 참고용으로만.
| `src/utils/medication-occurrence.ts` | Occurrence 타입 시스템. `MedicationOccurrence`, `MedicationOccurrenceGroup`, `MedicationOccurrenceTimeGroup`. 그룹 상태: `actionable \| upcoming \| done \| missed \| mixed`. | v3 홈화면 occurrence 표시 로직 설계 참고. v2보다 타입이 더 정교함. |
| `src/utils/medication-schedule.ts` | `isMedicationDueOnDateKey()` — cycle 계산 로직 포함. `cycleActiveDays + cycleRestDays + cycleStartDate`로 날짜별 복용 여부 판단. `findLatestDueDateOnOrBefore()` — 최근 복용일 역산. | v3 cycle_config 기반 occurrence 생성 로직 작성 시 참고. 핵심 계산식 그대로 이식 가능. |
| `src/screens/RegisterScreen.tsx` | frequency 모드: `daily \| weekday \| weekend \| custom`. `scheduleType: standard \| cycle`. verification window 옵션(10분/30분/1시간/2시간/제한없음). | v3 등록 화면 frequency 선택 UI 참고. weekends 별도 타입도 확인됨. |


**버리는 것:** `storage.ts`, `scanSessionStore.ts`, ML Kit 관련 (`referenceDescriptors.ts`, `nativeInferenceBridge.ts`, `localReferenceMatcher.ts`), 각 Screen 파일 (UI 참고만)

---

## 9. iOS / Android 전략

### 기본 방침
- **1단계**: Android 완성
- **2단계**: iOS 포팅

React Native + Expo 자체는 크로스플랫폼 자동 처리 (화면, 네비게이션, expo-sqlite, 알림).
**변수는 TFLite native bridge** — Android 기준으로 작성되며 iOS는 별도 작업 필요.

### TFLite iOS 대응
| | Android | iOS |
|---|---|---|
| TFLite 직접 사용 | ✅ | ✅ (가능하나 비권장) |
| Core ML 변환 | - | ✅ 권장, 성능 우수 |
| GPU delegate | ✅ | Core ML delegate |

`best.pt` 원본이 있으니 iOS용 Core ML 변환 가능.

### 추상화 레이어 (지금부터 지켜야 할 것)
Android 작업 중에 TFLite bridge를 인터페이스로 감싸두면 iOS 포팅 시 해당 레이어만 교체.

```ts
// src/domain/scan/scanInferenceBridge.ts
export interface ScanInferenceBridge {
  detectPill(imageUri: string): Promise<BboxResult | null>
  extractEmbedding(croppedUri: string): Promise<number[]>
}

// Android 구현체 → TFLite
// iOS 구현체 → Core ML (추후)
```

---

## 10. 미결 사항

- [ ] MobileNetV3 Small TFLite 모델 준비
- [x] 광고 배너 도입 여부 → iOS 완성 + 사용자 모인 후 도입 확정
ㄴ ios 다 만들고, 나중에 사용자 좀 모으고 나서.
  ㄴ 반영. 확정.
- [x] iOS 지원 시점 → Android 완성 → 모델 안정화 → 디자인 완성 후 포팅 확정
ㄴ 일단 안드로이드 앱 다 만들고, model 괜찮게 뽑고 나서, design도 얼추되고 나서 도입.
  ㄴ 반영. 확정.
- [x] 평균 복용률 구현 여부 → medication별로 구현 확정
- [ ] 슬롯 삭제 UX 세부 정책 (마지막 슬롯 삭제 시 약 삭제 처리 방식)
- [ ] [claude] 강제알람 잠금화면: Android full-screen intent 구현 (react-native-alarm-notification 검토)
ㄴ 내가 위에 적었나? 밥 먹고 와서 까먹음.
ㄴ 아니라면 다시 설명 부탁. 좀 더 쉽게.
  ㄴ 위에 적었어 (7-3. 강제알람 화면 상세). 요약: Android 잠금화면에서 알람 화면 띄우려면 special 권한 필요 → react-native-alarm-notification 라이브러리 도입 확정. 단, EAS Build(테스트 환경 세팅) 필요해서 가장 마지막 개발 순서.
- [ ] [claude] time_slots에 skip_until 컬럼 추가 (1회 skip 복귀시간 추적용)
ㄴ 내가 위에 적었나? 밥 먹고 와서 까먹음.
ㄴ 아니라면 다시 설명 부탁. 좀 더 쉽게.
  ㄴ 위에 적었어 (on/off 토글 섹션). 요약: 하루 건너뛰기 누르면 "언제까지 skip인지" 시간을 저장하는 컬럼이 필요해. 그 시간 지나면 자동으로 다시 활성화됨. DB 스키마에 skip_until TEXT 컬럼 추가해야 함 — 아직 스키마에 안 들어가 있어서 미결로 남겨둔 거야.
  ㄴ스키마에 안 들어가있다는 얘기는 뭐지?? 설명 부탁.
    ㄴ 위에 Section 4 DB 스키마 SQL 코드 보면 time_slots 테이블에 컬럼들이 쭉 나열돼 있어. 거기에 skip_until 컬럼이 아직 없다는 뜻이야. 즉 지금 코드대로 DB 만들면 skip_until 저장할 공간이 없어서 하루 건너뛰기 기능 구현할 때 오류 남. 나중에 구현 전에 SQL에 `skip_until TEXT` 한 줄 추가해야 해.

### 확정된 항목 (미결 아님)
- [x] 알림: expo-notifications / 카메라: expo-camera
- [x] 알람 충돌 정책: 강제알람 우선, 일반알람 대기열 후 팝업
- [x] on/off 자동복구: 다음 알람 콜백에서 is_active=1로 복귀
- [x] off 상태 streak: missed 안 됨 → streak 유지
- [x] freeze 획득: timeslot별 연속 15회 인증 성공 시 1개 획득 (15, 30, 45...마다 반복), 즉시 팝업 알림
  - streak 단위: timeslot별, 인증 즉시 +1
  - freeze는 medication 단위로 적용 (해당 약 전체 timeslot을 묶어서 skip 처리)
  - freeze 사용 유효: 실패 당일(D+0) + 다음날(D+1)까지
- [x] 알약사진등록: 등록 화면 내에서 처리 (별도 화면 없음), 처리 중 로딩 표시
- [x] 스캔 실패 시: 재시도 유도만, 수동 완료 버튼 없음
- [x] on/off 자동복구: 이중 메커니즘 (알람 콜백 + 앱 시작 시 체크) / skip_until 컬럼 필요
- [x] 스누즈 대기 중 강제알람: 강제알람 우선, 스누즈 타이머 독립 유지

---

## 11. 전체 결정사항 요약 (빠른 참조용)

> 주석 다 읽기 힘들 때 여기서 확인. 최신 상태 반영.

### 기술 스택
- 카메라: **expo-camera** (v2 동일)
- 알림: **expo-notifications**
- 강제알람: **react-native-alarm-notification** (EAS Build 필요, 마지막 개발)
- DB: **Drizzle ORM + expo-sqlite**
- Android 우선, iOS는 MVP 배너 수준

### DB 주요 결정
- 약 색상: 앱에서 랜덤 배정, 나중에 사용자 선택 가능하게 확장
- 복용 수: 1~10정, 5정 이상 시 스캔 정확도 경고 문구
ㄴ scan시 10정 이상이 탐지되면 어쩔래? 가장 확률 높은 알약 10개만 할까?
  ㄴ 등록 자체가 최대 10정이라 정상 케이스는 최대 10개. 카메라에 우연히 더 많이 찍히면 → YOLO confidence 높은 순으로 dose_count_per_intake개만 MobileNet에 넘기는 방식으로 처리.
- 스누즈: 최대 3회, snooze_interval_min 컬럼 (기본 5분)
- Freeze: 앱 전역, settings.freezes_remaining (max 3)
- **skip_until 컬럼: time_slots에 반영 완료** — NULL이면 활성 또는 완전 off, 값 있으면 1회 skip 상태. 해당 시각 지나면 자동 활성화 복귀.

### Streak / Freeze 정책
- **timeslot별 연속 인증 횟수** 카운트, 인증 즉시 +1
- off(is_active=0) 슬롯은 인증 대상 제외 → missed 안 됨 → streak 유지
- missed 발생 → 해당 timeslot streak 리셋 (0)
- freeze 사용 → streak 유지
- **timeslot 연속 15회 달성 시 freeze 1개 획득, 즉시 팝업 알림** (15, 30, 45...마다 반복)
- freeze는 medication 단위 적용 (해당 약의 모든 timeslot 묶어서 skip)
- 여러 약 동시 놓쳤을 때 어느 약에 쓸지 사용자 선택 팝업 (사용 안 함 선택지 포함)
- **freeze 사용 유효 기간: 실패 당일(D+0) + 다음날(D+1)까지. D+2 이후 팝업 없음.**

### on/off 토글
- 하루 건너뛰기: skip_until 시각까지 비활성
- 자동복구 이중 메커니즘: ① 알람 콜백에서 is_active=1 ② 앱 시작 시 체크
- 완전 off: is_active=0, skip_until 없음

### 홈 화면 정렬
1. 활성 슬롯 (인증 가능) — 다음 인증시간 오름차순
2. 1회 skip 슬롯 — 복귀시간 오름차순, 색상 옅게
3. 완전 off 슬롯 — 다음 예정시간 오름차순, 회색

### 스캔 파이프라인
- UI 가이드 네모 crop → YOLO11n → MobileNetV3 → cosine similarity
- threshold: 0.45 (관대하게, FN 줄이기 우선)
- 3장: max(하나라도 넘기기) / 4장 이상: 최저값 제거 후 평균
- 수동 완료 버튼 없음, 재시도만
- YOLO 실시간 박스 오버레이 제거 → "알약이 감지되고 있습니다" 텍스트만
- scan 버튼: 중하단 / 알약 목록: 우측 세로 작은 칩

### 강제알람
- Android: full-screen intent (react-native-alarm-notification)
- iOS MVP: 큰 배너 수준
- 강제알람 context에서 스캔 진입 시 해당 슬롯의 약만 인증 대상
- 알람 충돌: 강제알람 우선, 일반알람 대기열 후 팝업
- 스누즈 대기 중 강제알람: 독립 처리 (스누즈 취소 안 함)
- 1분 차이 알람도 정책 동일 적용

### 등록 화면
- 기본값: 현재시간, 팝업=on, 알람=on, 강제알람=off, 스누즈=off, 진동=on, window=60분
- 구성 순서: [필수] 이름→복용수→시간→주기(→휴약기)→사진 / [알람] 팝업→알람→강제/소리/진동/스누즈
- 시간 입력: 3컬럼 스크롤+직접입력 (v2 WheelColumn 재사용)
- 휴약기: active_value/rest_value/unit(day|week), 1~99
- 사진 등록: 등록 화면 내 처리, YOLO 처리 중 로딩 오버레이

### dev 모드
- 스캔 결과 직후 "FP / FN / 정확함" 선택 UI
- 선택 시 이미지 + 유사도 점수를 TimepillDev/FP or FN 폴더에 자동 저장

### 미작성 섹션 (구현 전 작성 필요)
- 기록 화면 상세 (캘린더 뷰)
ㄴtimepill참고해서 만들자.
  ㄴ 반영. 기록 화면은 `C:\Users\bgl08\OneDrive\바탕 화면\약먹자친구들\timepill\` 의 기록 탭 UI 참고해서 작성 예정. 캘린더 뷰 + 날짜별 복용률 + medication별 복용률 + medication별 연속 복용일. 구현 전 7-5 섹션으로 상세 작성.
ㄴ이거 답변은/
  ㄴ 위에 답변 달았어.
- 설정 화면 상세

### 미결 사항 (결정 필요)
- ~~광고 배너 도입 여부~~ → 확정: iOS 완성 + 사용자 모인 후. MVP 제외, 레이아웃 공간만 예약.
ㄴ 아직 ㄴㄴ 대신 나중에 배너 도입하기 쉽게 만들어두는걸로.
  ㄴ 반영. 확정.
- ~~평균 복용률 구현 여부~~ → 확정: medication별로 구현
ㄴ 구현하자. medication별로
  ㄴ 반영. dose_records에서 completed/전체 비율 계산. 홈 화면 streak 요약 옆에 표시.
- [ ] 슬롯 삭제 UX 세부 정책
ㄴ 어쩌지
  ㄴ 제안: 마지막 슬롯 삭제 시 "이 약의 마지막 복용 시간입니다. 약도 함께 삭제됩니다" 컨펌 팝업 → 확인 시 약 + 슬롯 + 관련 기록 CASCADE 삭제. 어때?
  ㄴ 기록까지 cascade삭제한다고? 우리 기록은 따로 관리하기로 했잖아.
    ㄴ 맞아 잘못됐어. Section 3 삭제 정책 기준으로 수정:
    ㄴ 마지막 슬롯 삭제 → 약도 함께 삭제 (컨펌 팝업) → 슬롯/약 삭제. 단, dose_records + escape_records는 time_slot_id/medication_id → NULL로 유지. 기록 탭에서 "약 이름 + 시간"으로 계속 표시됨. 확정.
    ㄴ 나중에 기록 탭에서 약 이름 + 시간?? 기록 탭에서는 시간이 나올 필요가 없는데?? 뭐지
      ㄴ 아 내가 잘못 설명했어. "약 이름 + 시간"은 UI 표시 얘기가 아니라 삭제된 슬롯의 dose_record가 DB에 어떤 데이터로 남는지 설명한 거야. 기록 탭 UI에서는 시간 안 보여줘도 됨. 날짜별 복용률 + 약별 복용률로 표시하면 충분.
    ㄴ 기록 탭에서는 날짜별로 medication 별로 약 얼마나 먹었는지(날짜별 복용률, 전체 복용률), medication 별 연속 복용일로 하면 되는데
      ㄴ 반영. 기록 탭: 날짜별 복용률 + medication별 복용률 + medication별 연속 복용일. 심플하게.
    ㄴ 아 아까 timeslot별로 streak한다고 한 거 수정해야된다. medication 별 연속 복용일로 하자. 그리고 그걸 바탕으로 schema제대로 작성해야겠네.
      ㄴ **streak 정책 변경: timeslot별 → medication별 연속 복용일로 확정.**
      ㄴ medication_streaks 스키마는 medication_id가 PK라 그대로 유지. current_streak는 이제 "연속 복용 일수" 의미.
      ㄴ 질문: 약에 timeslot이 2개(아침/저녁)일 때, 그날 "복용 완료"로 인정하는 기준이 뭐야?
      ㄴ ① 모든 timeslot 완료 → 1일 카운트 (엄격)
      ㄴ ② 하나라도 완료 → 1일 카운트 (관대)
      ㄴ 일단, 모든 timeslot완료로 하자 대신 
        ㄴ 확정: **모든 timeslot 완료 = 1일 카운트 (엄격)**.
      ㄴ freeze 획득 기준도 "timeslot 15회" → "medication 연속 N일"로 바꿔야 하는데 N은 몇으로 할지도 결정 필요.
      ㄴ medication 10일로 하자. 대신 1일부터 시작해서 5일 먹고 5일 쉬는데 5일 쉰다고 하자. 그러면 10일에freeze를 제공하는 것이 아니라, 15일에 freeze 제공이야 알겠지.
        ㄴ 확정: **연속 10일 복용 달성 시 freeze 1개 획득**. 연속이 끊기면(스트릭 리셋) 다시 카운트 시작 → 5일 복용 후 5일 공백이면 스트릭 리셋, 이후 10일을 더 채워야 freeze → 달력 기준 15일 이상 소요. 맞게 이해한 거지?
        ㄴ 엉 맞아. freeze는 timeslot에만 적용하는거 맞지?
          ㄴ freeze는 **medication 단위**로 적용이야. streak가 medication별이니까 freeze도 "이 약의 streak을 보호할 건지"를 약 단위로 선택. timeslot별로 따로 적용하는 게 아니라 → 그 약의 모든 timeslot이 1개 묶음으로 freeze됨. 예: 아침/저녁 2슬롯 있는 약에 freeze 쓰면 그날 그 약 전체 skip 처리.
          ㄴ ㅇㅎ ㅇㅋㅋ

- ~~MobileNetV3 Small TFLite 모델 준비~~ → machinelearningplan.md에서 진행 중
ㄴ? 이거는 machinelearningplan.md에서 하고 있는거 아냐?
  ㄴ 맞아. 학습은 거기서 진행. 여기선 "앱에 붙일 TFLite 파일이 아직 없음"을 표시한 거야. 학습 완료 후 export하면 이 항목 해제.

---

## 12. 검토 필요 사항 (구현 전 확정)

> 플랜 전체를 면밀히 읽고 발견한 빠진 것들. 주석 달아줘.

### A. SQL 스키마 누락 — `skip_until` 컬럼
- time_slots 테이블에 `skip_until TEXT` 컬럼이 여러 곳에서 언급됐지만 Section 4 SQL 코드에 실제로 없음.
- 구현 전에 스키마에 추가해야 하루 건너뛰기 기능 동작 가능.
ㄴ 추가해해
  ㄴ 반영 완료. Section 4 time_slots에 `skip_until TEXT` 추가됨. NULL이면 활성 또는 완전 off, 값 있으면 1회 skip 상태.

### B. 약 삭제 정책 모순
- Section 3 삭제 정책 테이블: "약 삭제 → dose_records CASCADE(삭제)"
- 그런데 "마지막 슬롯 삭제 → 약도 삭제" 흐름이면 → 약 삭제 → dose_records CASCADE → 기록 삭제
- 그런데 "기록은 따로 관리, 유지한다"는 원칙과 충돌
- 질문: 약을 삭제(마지막 슬롯 삭제 포함)할 때 과거 dose_records는 어떻게 처리해?
  - ① 약 삭제 시에도 기록 유지 (medication_id → NULL) → 기록 탭에서 과거 데이터 볼 수 있음
  - ② 약 삭제 시 기록도 삭제 (CASCADE) → 깔끔하지만 과거 복용 이력 사라짐
  ㄴ 1번.
  ㄴ 기록이 삭제되는 건 기록 탭에서만 관리할거야.
    ㄴ 반영 완료. Section 3 삭제 정책 표 수정: 약 삭제 → dose_records/escape_records는 medication_id → NULL, 기록 유지. dose_records에 medication_name TEXT 스냅샷 컬럼 추가해서 약 삭제 후에도 이름 표시 가능. CASCADE 제거.

### C. `popup_enabled` DB DEFAULT 불일치
- Section 4 SQL: `popup_enabled INTEGER NOT NULL DEFAULT 0` (off)
- Section 7-2 등록 화면 default: 팝업=on
- 둘 중 어느 쪽이 맞는지 확정 필요.
ㄴ popupon으로 하자.
  ㄴ 반영 완료. Section 4 SQL: `popup_enabled DEFAULT 0 → DEFAULT 1`. 등록 화면 기본값과 일치.

### D. 일반 알람 화면 상세 미작성
- 7-3은 강제알람 화면만 다룸.
- 강제알람이 아닌 일반 알람(popup/notification) 화면의 UI, 버튼 구성, 흐름이 없음.
- 일반 알람에서도 인증하기 버튼이 있다고 했는데 화면 상세가 없음.
ㄴ 강제 알람이랑 일반 알람이랑 거의 똑같음.
ㄴ 다만 일반 알람은 인증하기 버튼을 누르거나 그냥 알람 끄기 버튼을 누르고 알람을 끌 수 있다는 점이 다르고
ㄴ 일반 알람은 그 timeslot에 해당하는 알약들을 보여주면 될 것 같은데.
ㄴ 만약에 강제 알람 2개가 겹쳐버리면 어쩌지? 둘 다 인증하지 않으면 알람이 안 끊기게 해야하는데.
  ㄴ 반영. **일반 알람 화면 확정:**
  ㄴ - 강제알람과 동일한 레이아웃이지만 "알람 끄기" 버튼 추가 (인증 없이 닫을 수 있음)
  ㄴ - 표시: 약 이름 / 복용 시간 / 몇 정 / 인증하기 버튼 / 알람 끄기 버튼
  ㄴ - 해당 timeslot의 약만 표시
  ㄴ **강제알람 2개 겹침 정책:** 두 번째 강제알람이 발동될 때 첫 번째 화면의 약 목록에 추가 (화면 전환 없이 목록만 업데이트). 모든 약 인증 완료 시에만 화면 해제. → 1개 화면에서 모두 처리.

### E. freeze 사용 가능 시점 미결
- 약을 놓쳤을 때 언제까지 freeze를 쓸 수 있는지 정의 없음.
- 당일에만 쓸 수 있나? 다음날 앱을 열었을 때도 쓸 수 있나?
ㄴ 다음날 앱을 열었을 때도 사용 가능.
ㄴ 만약 다다음날일 때는?
  ㄴ 제안: **다다음날 이후 freeze 사용 불가.** 복용 실패 당일 + 다음날(D+1)까지만 유효. D+2부터는 팝업 없음. 이유: freeze는 "실수 구제" 용도인데 이틀 이상 지나면 사용자가 잊어버리기도 하고, 오래된 실패까지 소급해서 streak 보호하면 의미가 퇴색됨. 동의하면 확정.
  ㄴ ㅇㅇ..
    ㄴ 확정. **freeze 사용 유효 기간: 실패 당일(D+0) + 다음날(D+1)까지. D+2 이후 팝업 없음.**

### F. streak +1 타이밍 미결
- 마지막 timeslot 완료 즉시 streak +1 하는지, 자정에 배치로 하루치를 확정하는지 정의 없음.
- 즉시 방식: 구현 단순, 그날 자정 전에 추가 복용이 생기면 재계산 필요
- 자정 배치 방식: 구현 복잡, 하루가 완전히 끝난 뒤 확정
ㄴ자정 배치 방식을 사용하되, 그 날의 마지막 복용 알약의 인증 가능시간이 자정 이후인 경우, 그 인증 가능시간을 기점으로 확정하자.
ㄴ 아 사실 아직도 고민임. timeslot별로 하는게 맞는 것 같기도하고??
ㄴ 왜냐하면 그냥 timeslot별로 해버리면, 인증하고 나서 사람한테 바로 자극을 줄 수 있잖아.
ㄴ 넌 어떻게 생각해?
  ㄴ **timeslot별 추천.** 이유: 인증 직후 바로 streak +1 → 즉각 보상감. medication별이면 아침 약 먹어도 저녁 약 먹기 전까지 streak 안 올라가서 피드백이 하루 내내 지연됨. 앱의 핵심 가치가 "복용 습관 강화"인데 timeslot별 즉각 피드백이 그에 맞음. 다만 스키마 변경 필요: medication_streaks → time_slot_streaks (time_slot_id PK). freeze 획득 기준도 "timeslot 연속 N회"로 재정의 필요. N은 15회 추천 (하루 1번 슬롯 = 15일, 2번 = 7.5일로 복용 빈도에 맞게 스케일됨). 결정해줘.
  ㄴtimeslot별로 하자. ㄱㄱ
  ㄴ스키마도 바꾸고고
    ㄴ 확정. **timeslot별 streak, 인증 즉시 +1.** Section 4 스키마 medication_streaks → time_slot_streaks (time_slot_id PK)로 변경. freeze 획득: timeslot 연속 15회. Section 6/11 반영 완료.
### G. 슬롯 삭제 UX 세부 정책
- Section 6, Section 10 모두 "보류" / `[ ]` 미결 상태.
- 마지막 슬롯 삭제 → 약도 함께 삭제 흐름은 잡혔는데 → B번 모순 해결 후 여기도 같이 확정 필요.
ㄴ 무슨 말이지지
  ㄴ 설명: B번에서 "약 삭제 시 기록 유지(medication_id → NULL)"로 확정됐으니까 G번 슬롯 삭제 UX도 자동으로 정리됨. 마지막 슬롯 삭제 → 약도 함께 삭제 컨펌 팝업 → 삭제 시 슬롯/약만 지워지고 dose_records는 medication_id = NULL로 보존. 미결 아님.

### H. `snooze_used_today` 컬럼 목적 불명확
- settings 테이블에 `snooze_used_today INTEGER` 있음.
- time_slots에도 `snooze_count`가 있음.
- 둘의 역할 차이가 설명 없음. `snooze_used_today`가 왜 settings에 있는지 (앱 전역 스누즈 제한 용도인지?).
ㄴ 그니까 왜 settings에는 전역 스누즈 필요 없는데데
  ㄴ 맞아. snooze_used_today는 역할이 불명확하고 time_slots.snooze_count로 슬롯별 관리가 되니까 불필요. Section 4 settings에서 제거 완료.

### I. 미작성 화면 상세
- 7-5 기록 화면 상세 (캘린더 뷰, timepill 원본 참고)
- 7-6 설정 화면 상세
ㄴ 이거는 내가 넣고 싶은거 다 넣고 layout만 나중에 고치면 될 거 같은데데
  ㄴ ㅇㅋ. 7-5 기록 화면 / 7-6 설정 화면은 구현 직전에 작성. timepill 원본 참고해서 초안 잡을게.
