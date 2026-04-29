# Timepill v3 — DB 스키마 & 비즈니스 규칙 분석서

---

## 1. 데이터베이스 스키마

### 1-1. medications (약)

**파일**: `src/db/schema.ts`

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| `id` | text | PK | UUID |
| `name` | text | NOT NULL | 약 이름 |
| `color` | text | NOT NULL | 앱 내 표시 색상 (HEX) |
| `isActive` | integer | default 1 | 활성 여부 (0/1 boolean) |
| `createdAt` | text | NOT NULL | 생성 시각 (로컬 ISO, Z 없음) |

**CASCADE 관계**:
- medications 삭제 → timeSlots 삭제 (CASCADE)
- medications 삭제 → referenceImages 삭제 (CASCADE)

---

### 1-2. time_slots (슬롯)

**파일**: `src/db/schema.ts`

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| `id` | text | PK | UUID |
| `medicationId` | text | FK → medications, CASCADE | 소속 약 |
| `hour` | integer | NOT NULL | 복용 시각 (0~23) |
| `minute` | integer | NOT NULL | 복용 시각 (0~59) |
| `doseCountPerIntake` | integer | default 1, CHECK 1~10 | 1회 복용 정 수 |
| `cycleConfig` | text | NOT NULL | JSON 문자열 (CycleConfig) |
| `cycleStartDate` | text | nullable | 'YYYY-MM-DD' (휴약기 전용) |
| `verificationWindowMin` | integer | default 60 | 인증 가능 창 (분) |
| `alarmEnabled` | integer | default 1 | 알람 ON/OFF |
| `forceAlarm` | integer | default 0 | 강제 알람 ON/OFF |
| `popupEnabled` | integer | default 1 | 팝업 알림 ON/OFF |
| `snoozeCount` | integer | default 0, CHECK 0~3 | 스누즈 최대 횟수 |
| `snoozeIntervalMin` | integer | default 5 | 스누즈 간격 (분) |
| `alarmSound` | text | default 'default' | 알람 소리 종류 |
| `vibrationEnabled` | integer | default 1 | 진동 ON/OFF |
| `skipUntil` | text | nullable | 'YYYY-MM-DD' (이 날까지 일시정지) |
| `notificationIds` | text | | JSON string[] (일반 알람 ID 목록) |
| `forceNotificationIds` | text | | JSON string[] (강제 알람 ID 목록) |
| `isActive` | integer | default 1 | 슬롯 활성 여부 |
| `createdAt` | text | NOT NULL | 생성 시각 |

**CycleConfig 타입 정의**:

| 타입 | 설명 | 추가 파라미터 |
|------|------|---------------|
| `daily` | 매일 | 없음 |
| `weekly` | 주중 (월~금) | 없음 |
| `weekends` | 주말 (토~일) | 없음 |
| `specific_days` | 특정 요일 | `days: number[]` (0=일, 1=월, ..., 6=토) |
| `rest` | 휴약기 패턴 | `active_value`, `rest_value`, `unit: 'day' \| 'week'` |

---

### 1-3. dose_records (복용 기록)

**파일**: `src/db/schema.ts`

| 컬럼 | 타입 | 제약 | 설명 |
|------|------|------|------|
| `id` | text | PK | UUID |
| `medicationId` | text | FK → medications, SET NULL | 약 ID (삭제 시 null) |
| `medicationName` | text | NOT NULL | 약 이름 (역정규화 — 약 삭제 후에도 기록 보존) |
| `timeSlotId` | text | FK → timeSlots, SET NULL | 슬롯 ID (삭제 시 null) |
| `dayKey` | text | NOT NULL | 'YYYY-MM-DD' (해당 날짜) |
| `scheduledTime` | text | NOT NULL | 복용 예정 시각 (로컬 ISO) |
| `status` | text | NOT NULL | 'pending' \| 'completed' \| 'missed' \| 'frozen' |
| `targetDoseCount` | integer | default 1 | 복용해야 할 정 수 |
| `completedAt` | text | nullable | 인증 완료 시각 |
| `createdAt` | text | NOT NULL | 생성 시각 |

**인덱스**:
- UNIQUE `(timeSlotId, dayKey)` — 슬롯당 하루 한 기록만 허용
- `(medicationId, scheduledTime)`
- `(status, scheduledTime)`

---

### 1-4. escape_records (긴급 탈출 기록)

**파일**: `src/db/schema.ts`

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | text | PK UUID |
| `medicationId` | text | FK → medications, SET NULL |
| `timeSlotId` | text | FK → timeSlots, SET NULL |
| `doseRecordId` | text | FK → doseRecords, SET NULL |
| `dayKey` | text | 'YYYY-MM-DD' |
| `reason` | text | 탈출 이유 (nullable) |
| `isUserFault` | integer | 사용자 귀책 여부 (0/1) |
| `note` | text | 추가 메모 (nullable) |
| `createdAt` | text | 생성 시각 |

**목적**: 강제 알람 긴급 탈출 이력 감사용 (analytics)

---

### 1-5. time_slot_streaks (스트릭)

**파일**: `src/db/schema.ts`

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `timeSlotId` | text | PK, FK → timeSlots (CASCADE) |
| `currentStreak` | integer | 현재 연속 복용 일수 |
| `longestStreak` | integer | 최고 기록 |
| `lastCompletedDate` | text | 마지막 완료 날짜 ('YYYY-MM-DD') |

**관계**: timeSlots와 1:1 대응

---

### 1-6. reference_images (기준 사진)

**파일**: `src/db/schema.ts`

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | text | PK UUID |
| `medicationId` | text | FK → medications (CASCADE) |
| `originalUri` | text | 원본 사진 파일 경로 |
| `croppedUri` | text | 크롭된 사진 파일 경로 |
| `embedding` | text | JSON number[] — MobileNet 임베딩 벡터 |
| `createdAt` | text | 생성 시각 |

**인덱스**: `(medicationId)`  
**삭제 시**: DB 레코드 + 파일시스템 URI 양쪽 모두 삭제

---

### 1-7. settings (앱 설정)

**파일**: `src/db/schema.ts`

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | integer | PK (항상 1, 싱글턴 패턴) |
| `privateMode` | integer | 0/1 — 약 이름 익명화 |
| `freezesRemaining` | integer | 남은 Freeze 개수 (최대 3) |
| `language` | text | 언어 코드 ('ko', 'en', 'ja') |
| `devMode` | integer | 0/1 — 개발자 모드 |

---

## 2. 비즈니스 규칙

### 규칙 1. 주기(Cycle) 판별 — `isTodayDue()`

**파일**: `src/utils/cycleUtils.ts`  
**용도**: 특정 날짜에 해당 슬롯이 복용 대상인지 판단

| 주기 타입 | 판별 로직 |
|-----------|-----------|
| `daily` | 항상 true |
| `weekly` | 요일이 1~5 (월~금)이면 true |
| `weekends` | 요일이 0 또는 6 (일, 토)이면 true |
| `specific_days` | 요일 번호가 days 배열에 포함되면 true |
| `rest` | cycleStartDate 기준으로 사이클 내 위치 계산, position < activeTotal이면 true |

**휴약기 계산 공식**:
```
cycleLen = active + rest (단위 환산 후)
position = ((diffDays % cycleLen) + cycleLen) % cycleLen
isTodayDue = position < activeTotal
```

**중요**: 모든 날짜 계산은 정오(12:00:00)를 기준으로 함  
→ 타임존·서머타임으로 인한 날짜 오차 방지

---

### 규칙 2. 알람 스케줄링

**파일**: `src/domain/alarm/alarmScheduler.ts`, `forceAlarmScheduler.ts`  
**상수**: `src/constants/alarmConfig.ts`

| 상수 | 값 | 의미 |
|------|----|------|
| `MAX_TIMESLOTS` | 10 | 최대 슬롯 수 (10슬롯 × 5일 = 50개, Expo 한도 64개 이하) |
| `ALARM_SCHEDULE_DAYS` | 5 | 앞으로 5일치 알람 예약 |
| 백그라운드 갱신 주기 | 6시간 | 앱 종료 후에도 알람 유지 |

**일반 알람 스케줄 조건**:
- `alarmEnabled = 1`
- `isTodayDue()` = true
- 예약 시각이 현재보다 미래

**강제 알람 추가 조건**:
- `forceAlarm = 1` AND `alarmEnabled = 1`
- 진동 패턴 강화: `[0, 500, 200, 500]`
- 우선순위: `AndroidNotificationPriority.MAX`

**일시정지 복원 알림**:  
`skipUntil` 날짜에 `"{약 이름} 알람이 다시 시작됩니다"` 1회 전송

---

### 규칙 3. 복용 기록 자동 생성 (Backfill)

**파일**: `src/domain/doseRecord/repository.ts`  
**함수**: `backfillAndGenerateDoseRecords()`  
**호출 시점**: 앱 시작 시

**알고리즘**:
1. 활성화된 모든 슬롯 조회
2. 슬롯별 시작 날짜 결정:
   - 기존 기록 있음 → 마지막 기록 다음 날부터
   - 신규 슬롯 → 슬롯 생성 날짜부터
3. 시작 날짜 ~ 오늘까지 각 날짜에 대해:
   - `isTodayDue()` = true인 경우에만 기록 생성
   - 과거 날짜: `status = 'missed'`
   - 오늘: `status = 'pending'`
4. 단일 트랜잭션으로 일괄 INSERT
   - `onConflictDoNothing()` — UNIQUE 제약 위반 시 무시 (중복 방지)

---

### 규칙 4. 놓친 복용 감지 & Freeze 자격 확인

**파일**: `src/hooks/useFreezeEligibility.ts`, `src/hooks/useAppInit.ts`

**앱 시작 시 순서**:

```
1. 만료된 skipUntil 슬롯 복원 (restoreExpiredSkips)
       ↓
2. 놓친 복용 감지 (checkMissedDoses)
   - status='pending' AND scheduledTime < 오늘 자정
       ↓
3. Freeze 자격 확인 (checkFreezeEligibility)
   - 어제 날짜의 기록만 대상 (D+1 초과분 불가)
   - 해당 슬롯 currentStreak > 0 이어야 함
   - freezesRemaining > 0 이어야 함
       ↓
4. FreezePopup 표시 (자격 있는 기록이 있으면)
       ↓
5. 사용자 선택
   - 사용 → applyFreezeToRecords() (트랜잭션)
             선택 기록: status='frozen', freezesRemaining--
   - 사용 안 함 → 해당 기록: status='missed'
       ↓
6. 나머지 미처리 기록 → status='missed' (streak 리셋)
```

**Freeze 불가 조건**:
- D+2 이상 지난 기록 (어제 기록만 가능)
- 해당 슬롯의 currentStreak가 이미 0
- freezesRemaining이 0

---

### 규칙 5. 스트릭(Streak) 관리

**파일**: `src/domain/streak/repository.ts`

#### 증가 (incrementStreak)
- 스캔 성공 직후 호출
- `lastCompletedDate == 오늘`이면 중복 방지를 위해 그냥 반환
- 아니면: `currentStreak++`, `longestStreak = max(current, longest)`
- **15의 배수 달성 시** → `incrementFreeze()` (최대 3개 한도)

#### 리셋 (resetStreaks)
- missed 상태 확정 시 해당 슬롯의 `currentStreak = 0`
- frozen 슬롯은 리셋하지 않음

#### 재계산 (recalculateStreak)
- 기록 삭제 후 전체 기록을 시간순으로 재연산
- frozen → 연속 취급 (streak 유지)
- missed → streak 0으로 리셋
- Freeze 크레딧은 소급 재계산 안 함

---

### 규칙 6. 스캔(Pill Verification) 파이프라인

**파일**: `src/domain/scan/runScanInference.ts`, `src/utils/similarity.ts`  
**상수**: `src/constants/scanConfig.ts`

#### 스캔 상수

| 상수 | 값 | 의미 |
|------|----|------|
| `HIGH_THRESHOLD` | 0.70 | 알약 1개 매칭 판정 임계값 |
| `COUNT_RATIO` | 0.60 | 필요 매칭 정 수 비율 |
| `MIN_REFERENCE_IMAGES` | 3 | 최소 기준 사진 수 |
| `MAX_REFERENCE_IMAGES` | 10 | 최대 기준 사진 수 |
| `HIGH_DOSE_WARNING_COUNT` | 5 | 이 정 수 이상이면 경고 표시 |
| `BBOX_PADDING` | 20px | 검출된 알약 주변 크롭 여백 |
| `MIN_BBOX_W_NORM` | 0.08 | 최소 bbox 너비 (크롭 대비 비율) |
| `MIN_BBOX_H_NORM` | 0.06 | 최소 bbox 높이 (크롭 대비 비율) |
| `CROP_RATIO` | 0.75 | 가이드 프레임 크기 (화면 최소 변의 75%) |
| `YOLO_INPUT_SIZE` | 640px | YOLO 모델 입력 크기 |
| `MOBILENET_INPUT_SIZE` | 160px | MobileNet 임베딩 추출 입력 크기 |

#### 스캔 파이프라인 (Burst 모드)

```
1. 사진 3장 연속 촬영
       ↓
2. 각 사진에서 YOLO로 알약 검출
   - 검출 성공 사진이 2장 이상이어야 통과
   - 가장 신뢰도 높은 사진 선택
       ↓
3. bbox 크기 필터
   - MIN_BBOX_W_NORM, MIN_BBOX_H_NORM 미만 → 'pill_too_small'
   - 검출 없음 → 'no_pill'
       ↓
4. 매칭 루프 (각 약 후보에 대해)
   - 기준 사진 < 3장 → 건너뜀
   - 필요 매칭 수 = ceil(doseCount × 0.60)
   - 각 bbox에서 MobileNet 임베딩 추출
   - computeMatchScore()로 기준 사진들과 비교
   - score >= 0.70이면 매칭 카운트++
   - matchedCount >= 필요 매칭 수 → '매칭 성공' ✓
       ↓
5. 결과: 'matched' | 'unmatched' | 'no_pill' | 'pill_too_small'
```

#### 유사도 점수 계산 (computeMatchScore)

- 코사인 유사도 사용: `dot(a, b) / (||a|| × ||b||)`
- 기준 사진 3장 이하: 최댓값 반환
- 기준 사진 4장 이상: 점수 정렬 후 최솟값 1개 제거, 나머지 평균
  - 이유: 데이터가 많을수록 이상값(outlier) 영향 최소화

#### 예시 (3정 복용)

```
필요 매칭 수 = ceil(3 × 0.60) = 2
→ 3개 bbox 중 2개 이상이 score >= 0.70이면 인증 성공
```

---

### 규칙 7. 인증 가능 창 (Verification Window)

**파일**: `src/hooks/useTodayTimeslots.ts`  
**함수**: `isVerifiable(slot, doseRecord)`

```
halfWindow = (verificationWindowMin / 2) × 60 × 1000 (ms)
windowStart = scheduledTime - halfWindow
windowEnd   = scheduledTime + halfWindow
isVerifiable = windowStart <= now <= windowEnd
```

**기본값 예시** (verificationWindowMin = 60):
- 예약 시각: 09:00
- 인증 가능 창: 08:30 ~ 09:30 (±30분)

---

### 규칙 8. 일시정지 (Skip) 기능

**파일**: `src/domain/timeslot/repository.ts`

| 상태 | 필드 값 |
|------|---------|
| 일시정지 중 | `isActive = 0`, `skipUntil = 'YYYY-MM-DD'` |
| 복원 완료 | `isActive = 1`, `skipUntil = NULL` |

**자동 복원 조건**: 앱 시작 시 `skipUntil < now`인 슬롯 자동 복원 (사용자에게 완전히 비가시적)  
- 복원은 앱 시작 스피너 뒤에서 실행되므로 슬롯이 자연스럽게 목록에 등장  
- 복원 알림 없음 (의도적으로 제거 — 사용자 눈에 보이지 않아야 하기 때문)

---

### 규칙 9. Freeze 시스템 전체 규칙

**파일**: `src/domain/settings/repository.ts`

| 규칙 | 내용 |
|------|------|
| 획득 조건 | 15일 연속 달성 시 1개 지급 |
| 최대 보유 | 3개 |
| 사용 가능 대상 | 어제(D+1) 날짜의 missed 기록만 |
| 사용 조건 | 해당 슬롯 currentStreak > 0 |
| 효과 | status = 'frozen' → streak 유지, 기록에는 frozen 표시 |
| 트랜잭션 | 선택한 모든 기록과 freezesRemaining 감소를 원자적 처리 |

---

### 규칙 10. 복용 상태(Status) 생명주기

```
pending (초기 생성)
  ├─ 스캔 성공 → completed   + streak++
  ├─ 창 내 미인증 → missed   + streak 리셋
  └─ Freeze 적용 → frozen    + streak 유지

completed  → 불변 (terminal)
missed     → 불변 (terminal)
frozen     → 불변 (terminal, completed처럼 취급)
```

---

### 규칙 11. 시간 표현 규칙

**원칙**: DB의 모든 시각은 **로컬 타임존 문자열** (Z 접미사 없음)

| 형식 | 예시 | 용도 |
|------|------|------|
| `YYYY-MM-DD` | `2024-03-15` | dayKey, skipUntil |
| `YYYY-MM-DD HH:mm:ss.000` | `2024-03-15 09:00:00.000` | scheduledTime, createdAt |

**이유**: UTC 저장 시 KST 23:00 → UTC 14:00 (전날)로 날짜 역전 발생  
**정오 기준**: 사이클 계산은 정오(12:00:00) 기준으로 통일하여 서머타임 방지

---

### 규칙 12. 데이터 무결성 원칙

| 원칙 | 구현 방법 |
|------|-----------|
| 역정규화 | medicationName을 doseRecords에 복사 → 약 삭제 후에도 기록 보존 |
| CASCADE 삭제 | medications → timeSlots, referenceImages |
| SET NULL 삭제 | timeSlots/medications 삭제 시 doseRecords 외래키 null 처리 |
| 중복 방지 | UNIQUE (timeSlotId, dayKey) + onConflictDoNothing() |
| 파일 정리 | referenceImages 삭제 시 DB + 파일시스템 동시 삭제 |
| 원자적 트랜잭션 | Freeze 적용, Backfill 삽입 모두 단일 트랜잭션 |

---

## 3. 비즈니스 규칙 전체 요약표

| 규칙 | 트리거 | 핵심 상수 |
|------|--------|-----------|
| 알람 스케줄링 | 슬롯 생성/수정 | 5일 창, 최대 10슬롯, 6시간 갱신 |
| 주기 판별 | 기록 생성, 슬롯 표시 | CycleConfig 타입별 요일/날짜 계산 |
| Backfill | 앱 시작 | 생성일~오늘, missed/pending 상태 |
| 놓친 복용 감지 | 앱 시작 | pending + 과거 날짜 |
| Freeze 자격 | 앱 시작 (놓침 있을 때) | D+1만 대상, streak > 0 필수 |
| Freeze 적용 | 사용자 확인 | 최대 3개, 트랜잭션 처리 |
| Streak 증가 | 스캔 성공 | 15의 배수 → freeze 1개 획득 |
| Streak 리셋 | missed 확정 | frozen 슬롯은 리셋 제외 |
| 인증 창 | 스캔 시도 | ±(verificationWindowMin/2)분 |
| 스캔 매칭 | SCAN 버튼 | HIGH_THRESHOLD=0.70, COUNT_RATIO=0.60 |
| 일시정지 복원 | 앱 시작 | skipUntil < now → isActive=1 |
| 기준 사진 | 사진 등록 | MIN=3장, MAX=10장, 임베딩 저장 |

---

## 4. 주석 반영 내역

| 위치 | 원래 주석 | 답변 및 반영 내용 |
|------|-----------|-------------------|
| 규칙 8 — 복원 알림 | `ㄴ 로컬 알림이 뭐지?` | 서버·인터넷 없이 기기 OS가 직접 발송하는 알림. Expo Notifications로 스케줄을 OS에 미리 등록해두면 앱이 꺼져도 발송됨. 본문에 설명 추가. |
| 규칙 8 — 복원 알림 | `ㄴ언제 로컬 알림 보낼 건데??? 자정에?` | **자정 아님.** `슬롯 시각 + verificationWindowMin` 시각에 발송. 예: 09:00 슬롯·60분 창 → 10:00에 발송. 코드 근거: `TimeslotRow.tsx` — `skipUntil = scheduled + verificationWindowMin * 60 * 1000`. 본문에 발송 시각 명시. |
| 규칙 8 — 복원 알림 | 재등장 과정 및 로컬 알림이 안 보였으면 좋겠다 | 복원 알림(`scheduleSkipRestoreNotification`) 완전 제거. `restore_skip` 핸들러도 제거. 복원은 앱 시작 스피너 단계에서만 실행 → 완전 비가시적. 본문 업데이트. |
