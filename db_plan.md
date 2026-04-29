# Timepill v3 — DB 구현 플랜

작성 기준: secondary_plan.md S1 + 관련 세션 전체

---

## 1. 패키지 및 파일 구조

### 설치
```bash
npx expo install expo-sqlite
npm install drizzle-orm
npm install -D drizzle-kit
```

### 파일 구조
```
src/
  db/
    client.ts           ← DB 연결 + drizzle 인스턴스
    schema.ts           ← Drizzle 스키마 전체
    migrations/         ← drizzle-kit generate 결과물
  domain/
    medication/
      repository.ts
    timeslot/
      repository.ts
    doseRecord/
      repository.ts
    streak/
      repository.ts
    settings/
      repository.ts
    referenceImage/
      repository.ts
  hooks/
    useAppInit.ts
  utils/
    cycleUtils.ts
    similarity.ts
    displayName.ts
  constants/
    medicationColors.ts
    scanConfig.ts
```

---

## 2. DB 클라이언트: `src/db/client.ts`

```typescript
import { drizzle } from 'drizzle-orm/expo-sqlite'
import { openDatabaseSync } from 'expo-sqlite'
import * as schema from './schema'

const sqlite = openDatabaseSync('timepill.db')
export const db = drizzle(sqlite, { schema })
```

---

## 3. 스키마: `src/db/schema.ts`

### TypeScript 타입 정의 (cycle_config JSON)

```typescript
export type CycleConfig =
  | { type: 'daily' }
  | { type: 'weekly' }
  | { type: 'weekends' }
  | { type: 'specific_days'; days: number[] }  // 0=일,1=월,...,6=토
  | { type: 'rest'; active_value: number; rest_value: number; unit: 'day' | 'week' }

export type DoseStatus = 'pending' | 'completed' | 'missed' | 'frozen'
```

### Drizzle 스키마

```typescript
import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

// ── medications ──────────────────────────────────────────────────────────────
export const medications = sqliteTable('medications', {
  id:        text('id').primaryKey(),
  name:      text('name').notNull(),
  color:     text('color').notNull(),   // hex, src/constants/medicationColors.ts에서 배정
  isActive:  integer('is_active').notNull().default(1),
  createdAt: text('created_at').notNull(),
})

// ── time_slots ───────────────────────────────────────────────────────────────
export const timeSlots = sqliteTable('time_slots', {
  id:                     text('id').primaryKey(),
  medicationId:           text('medication_id').notNull()
                            .references(() => medications.id, { onDelete: 'cascade' }),
  hour:                   integer('hour').notNull(),
  minute:                 integer('minute').notNull(),
  doseCountPerIntake:     integer('dose_count_per_intake').notNull().default(1),
  // CHECK(dose_count_per_intake BETWEEN 1 AND 10) — drizzle-kit migrate 시 raw SQL로 추가
  cycleConfig:            text('cycle_config').notNull(),
  // JSON.stringify(CycleConfig) — type 포함한 완전한 설정. cycle_type 컬럼 없음, 여기가 single source of truth
  // 타입별 SQL 필터 필요 시: json_extract(cycle_config, '$.type') = 'daily'
  // 단, 슬롯 수가 수십 개 수준이라 JS 필터로 충분 — raw SQL 혼용 불필요
  cycleStartDate:         text('cycle_start_date'),       // rest 타입만 사용
  verificationWindowMin:  integer('verification_window_min').notNull().default(60), // 30|60|120
  alarmEnabled:           integer('alarm_enabled').notNull().default(1),
  forceAlarm:             integer('force_alarm').notNull().default(0),
  popupEnabled:           integer('popup_enabled').notNull().default(1),
  snoozeCount:            integer('snooze_count').notNull().default(0),
  // CHECK(snooze_count BETWEEN 0 AND 3)
  snoozeIntervalMin:      integer('snooze_interval_min').notNull().default(5),
  alarmSound:             text('alarm_sound').notNull().default('default'),
  vibrationEnabled:       integer('vibration_enabled').notNull().default(1),
  skipUntil:              text('skip_until'),  // ISO datetime | NULL
  notificationIds:        text('notification_ids'),  // JSON string[] — 등록된 expo notification ID 목록 (취소/재등록용)
  isActive:               integer('is_active').notNull().default(1),
  createdAt:              text('created_at').notNull(),
})

// ── dose_records ─────────────────────────────────────────────────────────────
export const doseRecords = sqliteTable('dose_records', {
  id:             text('id').primaryKey(),
  medicationId:   text('medication_id')
                    .references(() => medications.id, { onDelete: 'set null' }),
  medicationName: text('medication_name').notNull(),  // 스냅샷 — 삭제 후에도 표시
  timeSlotId:     text('time_slot_id')
                    .references(() => timeSlots.id, { onDelete: 'set null' }),
  dayKey:         text('day_key').notNull(),           // 'YYYY-MM-DD' — UNIQUE(time_slot_id, day_key)로 중복 방지
  scheduledTime:  text('scheduled_time').notNull(),   // ISO datetime (로컬, Z 없음)
  status:         text('status').notNull(),            // DoseStatus
  targetDoseCount:integer('target_dose_count').notNull().default(1),
  completedAt:    text('completed_at'),
  createdAt:      text('created_at').notNull(),
}, (table) => ({
  uniqSlotDay: uniqueIndex('uniq_dose_slot_day').on(table.timeSlotId, table.dayKey),
  // UNIQUE(time_slot_id, day_key): 동일 슬롯 동일 날짜 중복 삽입 DB 레벨에서 차단
  // backfill 또는 앱 재시작 시 INSERT OR IGNORE 패턴으로 활용
}))

// ── escape_records ───────────────────────────────────────────────────────────
export const escapeRecords = sqliteTable('escape_records', {
  id:           text('id').primaryKey(),
  medicationId: text('medication_id')
                  .references(() => medications.id, { onDelete: 'set null' }),
  timeSlotId:   text('time_slot_id')
                  .references(() => timeSlots.id, { onDelete: 'set null' }),
  doseRecordId: text('dose_record_id')
                  .references(() => doseRecords.id, { onDelete: 'set null' }),
  dayKey:       text('day_key').notNull(),  // 'YYYY-MM-DD'
  reason:       text('reason'),
  isUserFault:  integer('is_user_fault').notNull().default(1),
  note:         text('note'),
  createdAt:    text('created_at').notNull(),
})

// ── time_slot_streaks ────────────────────────────────────────────────────────
export const timeSlotStreaks = sqliteTable('time_slot_streaks', {
  timeSlotId:        text('time_slot_id').primaryKey()
                       .references(() => timeSlots.id, { onDelete: 'cascade' }),
  currentStreak:     integer('current_streak').notNull().default(0),
  longestStreak:     integer('longest_streak').notNull().default(0),
  lastCompletedDate: text('last_completed_date').notNull().default(''),
  // 15회 연속 달성마다 freeze 1개 획득 (앱 로직에서 처리)
})

// ── reference_images ─────────────────────────────────────────────────────────
export const referenceImages = sqliteTable('reference_images', {
  id:           text('id').primaryKey(),
  medicationId: text('medication_id').notNull()
                  .references(() => medications.id, { onDelete: 'cascade' }),
  originalUri:  text('original_uri').notNull(),
  croppedUri:   text('cropped_uri').notNull(),
  embedding:    text('embedding').notNull(),  // JSON "[0.12, 0.34, ...]"
  createdAt:    text('created_at').notNull(),
})

// ── settings (단일 row, id=1) ─────────────────────────────────────────────────
export const settings = sqliteTable('settings', {
  id:               integer('id').primaryKey().default(1),
  privateMode:      integer('private_mode').notNull().default(0),
  freezesRemaining: integer('freezes_remaining').notNull().default(0),  // max 3
  language:         text('language').notNull().default('ko'),
  devMode:          integer('dev_mode').notNull().default(0),
  // alarm_volume / vibration_enabled 없음 — time_slots별 관리
})
```

---

## 4. 마이그레이션: `drizzle.config.ts`

```typescript
import type { Config } from 'drizzle-kit'

export default {
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'sqlite',
  driver: 'expo',
} satisfies Config
```

### 실행
```bash
npx drizzle-kit generate   # migrations/ 폴더에 SQL 생성
```

### 마이그레이션 적용: `src/db/client.ts`에 추가
```typescript
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator'
import migrations from './migrations/migrations'

// 앱 루트에서:
const { success, error } = useMigrations(db, migrations)
```

### CHECK 제약 조건 (drizzle-kit 미지원 → 수동 SQL)
마이그레이션 파일 생성 후 아래를 수동 추가:
```sql
-- dose_count_per_intake BETWEEN 1 AND 10
-- snooze_count BETWEEN 0 AND 3
-- (SQLite는 CHECK를 CREATE TABLE 시에만 선언 가능, ALTER 불가)
```

---

## 5. 인덱스: 마이그레이션 파일에 추가

```sql
CREATE UNIQUE INDEX uniq_dose_slot_day
  ON dose_records(time_slot_id, day_key);
-- time_slot_id NULL인 행은 UNIQUE 제약 미적용 (SQLite NULL 동작: NULL != NULL)

CREATE INDEX idx_dose_records_medication_date
  ON dose_records(medication_id, scheduled_time);

CREATE INDEX idx_dose_records_status
  ON dose_records(status, scheduled_time);

CREATE INDEX idx_reference_images_medication
  ON reference_images(medication_id);
```

---

## 6. Repository 함수

### 6-1. `src/domain/medication/repository.ts`

```typescript
import { db } from '@/db/client'
import { medications, referenceImages } from '@/db/schema'
import { eq } from 'drizzle-orm'
import * as FileSystem from 'expo-file-system'
import { randomUUID } from 'expo-crypto'
import { toLocalISOString } from '@/utils/dateUtils'
import { MEDICATION_COLORS } from '@/constants/medicationColors'

export async function getMedications() {
  return db.select().from(medications)
}

export async function getMedicationById(id: string) {
  return db.select().from(medications).where(eq(medications.id, id)).get()
}

export async function insertMedication(data: { name: string }) {
  const all = await getMedications()
  const color = MEDICATION_COLORS[all.length % MEDICATION_COLORS.length]
  const now = toLocalISOString(new Date())
  const id = randomUUID()
  await db.insert(medications).values({ id, name: data.name, color, isActive: 1, createdAt: now })
  return id
}

export async function updateMedication(id: string, data: Partial<typeof medications.$inferInsert>) {
  await db.update(medications).set(data).where(eq(medications.id, id))
}

// 삭제 전 파일 시스템 정리 필수
export async function deleteMedication(id: string) {
  // 1. reference_images 파일 삭제 (DB CASCADE 전에 파일 먼저 정리)
  const images = await db.select().from(referenceImages)
    .where(eq(referenceImages.medicationId, id))
  for (const img of images) {
    await FileSystem.deleteAsync(img.originalUri, { idempotent: true })
    await FileSystem.deleteAsync(img.croppedUri, { idempotent: true })
  }
  // 2. DB 삭제 (time_slots CASCADE, dose_records/escape_records SET NULL)
  await db.delete(medications).where(eq(medications.id, id))
}
```

---

### 6-2. `src/domain/timeslot/repository.ts`

```typescript
import { db } from '@/db/client'
import { timeSlots } from '@/db/schema'
import { eq, and, lt, isNotNull } from 'drizzle-orm'
import { isTodayDue } from '@/utils/cycleUtils'
import { toLocalISOString } from '@/utils/dateUtils'
import { randomUUID } from 'expo-crypto'
import { MAX_TIMESLOTS } from '@/constants/alarmConfig'

export async function getTimeslotsByMedication(medicationId: string) {
  return db.select().from(timeSlots).where(eq(timeSlots.medicationId, medicationId))
}

// 오늘 복용일인 슬롯 전체 반환 (cycle 계산 포함)
export async function getTodayTimeslots() {
  const all = await db.select().from(timeSlots)
  return all.filter(slot => isTodayDue(slot))
}

export async function insertTimeslot(data: Omit<typeof timeSlots.$inferInsert, 'id' | 'createdAt'>) {
  const count = await db.select().from(timeSlots).then(rows => rows.length)
  if (count >= MAX_TIMESLOTS) throw new Error(`슬롯은 최대 ${MAX_TIMESLOTS}개까지 등록 가능합니다`)
  const id = randomUUID()
  const now = toLocalISOString(new Date())
  await db.insert(timeSlots).values({ ...data, id, createdAt: now })
  return id
}

export async function updateTimeslot(id: string, data: Partial<typeof timeSlots.$inferInsert>) {
  await db.update(timeSlots).set(data).where(eq(timeSlots.id, id))
}

export async function deleteTimeslot(id: string) {
  await db.delete(timeSlots).where(eq(timeSlots.id, id))
}

// 앱 시작 시: skip_until 지난 슬롯 일괄 활성화 복귀
export async function restoreExpiredSkips() {
  const now = toLocalISOString(new Date())  // toISOString() 사용 금지 — UTC vs 로컬 불일치로 복귀 안 됨
  await db.update(timeSlots)
    .set({ isActive: 1, skipUntil: null })
    .where(
      and(
        isNotNull(timeSlots.skipUntil),
        lt(timeSlots.skipUntil, now)
      )
    )
}
```

---

### 6-3. `src/domain/doseRecord/repository.ts`

```typescript
import { db } from '@/db/client'
import { doseRecords, timeSlots } from '@/db/schema'
import { eq, and, gte, lt, inArray, desc } from 'drizzle-orm'
import { isTodayDue } from '@/utils/cycleUtils'
import { getLocalDateKey, toLocalISOString, getLocalDayBounds, getDateRange } from '@/utils/dateUtils'
import { getMedicationById } from '@/domain/medication/repository'
import { randomUUID } from 'expo-crypto'

// 날짜별 조회 ('YYYY-MM-DD') — 로컬 시간 기준
export async function getDoseRecordsByDate(dateKey: string) {
  const { start, end } = getLocalDayBounds(dateKey)
  return db.select().from(doseRecords)
    .where(and(gte(doseRecords.scheduledTime, start), lt(doseRecords.scheduledTime, end)))
}

// 월별 조회 — 로컬 시간 기준
export async function getDoseRecordsByMonth(year: number, month: number) {
  const pad = (n: number) => String(n).padStart(2, '0')
  const start = `${year}-${pad(month)}-01T00:00:00.000`
  const nextYear  = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  const end = `${nextYear}-${pad(nextMonth)}-01T00:00:00.000`
  return db.select().from(doseRecords)
    .where(and(gte(doseRecords.scheduledTime, start), lt(doseRecords.scheduledTime, end)))
}

export async function insertDoseRecord(data: {
  medicationId: string | null
  medicationName: string
  timeSlotId: string | null
  dayKey: string           // 'YYYY-MM-DD' — UNIQUE(time_slot_id, day_key) 충돌 시 무시
  scheduledTime: string
  targetDoseCount: number
  status?: 'pending' | 'missed'
}) {
  const id = randomUUID()
  const now = toLocalISOString(new Date())
  await db.insert(doseRecords)
    .values({ ...data, id, status: data.status ?? 'pending', createdAt: now })
    .onConflictDoNothing()  // UNIQUE(time_slot_id, day_key) 충돌 시 조용히 무시
  return id
}

export async function updateDoseRecordStatus(
  id: string,
  status: 'completed' | 'missed' | 'frozen',
  completedAt?: string
) {
  await db.update(doseRecords).set({ status, completedAt }).where(eq(doseRecords.id, id))
}

export async function deleteDoseRecord(id: string) {
  await db.delete(doseRecords).where(eq(doseRecords.id, id))
}

// 앱 시작 시: 오늘 이전 pending → missed 처리
// 반환값: { timeSlotIds, records } — freeze 팝업 체크에서 records 사용, streak 리셋에서 timeSlotIds 사용
export async function checkMissedDoses(): Promise<{
  timeSlotIds: string[]
  records: (typeof doseRecords.$inferSelect)[]
}> {
  const todayStart = `${getLocalDateKey()}T00:00:00.000`

  const missed = await db.select().from(doseRecords)
    .where(
      and(
        eq(doseRecords.status, 'pending'),
        lt(doseRecords.scheduledTime, todayStart)
      )
    )

  if (missed.length === 0) return { timeSlotIds: [], records: [] }

  const ids = missed.map(r => r.id)
  await db.update(doseRecords).set({ status: 'missed' }).where(inArray(doseRecords.id, ids))

  const timeSlotIds = missed
    .map(r => r.timeSlotId)
    .filter((id): id is string => id !== null)

  return { timeSlotIds, records: missed }
}

// 앱 미실행 기간 누락 기록 backfill + 오늘 pending 생성
// 각 슬롯의 마지막 dose_record 다음 날부터 오늘까지 순회해서 빈 날짜 채움
// 깊이 무제한 — 장기 부재 시 수백~수천 건 삽입 가능. UI에서 로딩 표시 필수.
// e.g., useAppInit에서 isBackfilling 상태 노출 → "지난 날들의 내역을 불러오는 중입니다" 표시
export async function backfillAndGenerateDoseRecords() {
  const allSlots = await db.select().from(timeSlots)
  const todayKey = getLocalDateKey()

  for (const slot of allSlots) {
    // 이 슬롯의 마지막 dose_record 날짜 조회
    const lastRecord = await db
      .select({ scheduledTime: doseRecords.scheduledTime })
      .from(doseRecords)
      .where(eq(doseRecords.timeSlotId, slot.id))
      .orderBy(desc(doseRecords.scheduledTime))
      .limit(1)
      .get()

    // 시작일: 마지막 기록 다음날 OR 슬롯 생성일
    const fromKey = lastRecord
      ? (() => {
          const d = new Date(`${lastRecord.scheduledTime.slice(0, 10)}T12:00:00`)
          d.setDate(d.getDate() + 1)
          return getLocalDateKey(d)
        })()
      : slot.createdAt.slice(0, 10)

    if (fromKey > todayKey) continue  // 이미 최신

    const med = await getMedicationById(slot.medicationId)
    if (!med) continue

    const dateRange = getDateRange(fromKey, todayKey)

    for (const dateKey of dateRange) {
      const checkDate = new Date(`${dateKey}T12:00:00`)
      if (!isTodayDue(slot, checkDate)) continue

      const scheduledTime = toLocalISOString(
        new Date(checkDate.getFullYear(), checkDate.getMonth(), checkDate.getDate(), slot.hour, slot.minute)
      )

      // 과거 날짜는 바로 missed, 오늘은 pending
      const status = dateKey < todayKey ? 'missed' : 'pending'

      await insertDoseRecord({
        medicationId: slot.medicationId,
        medicationName: med.name,
        timeSlotId: slot.id,
        dayKey: dateKey,
        scheduledTime,
        targetDoseCount: slot.doseCountPerIntake,
        status,
      })
    }
  }
}
```

---

### 6-4. `src/domain/streak/repository.ts`

```typescript
import { db } from '@/db/client'
import { timeSlotStreaks, doseRecords } from '@/db/schema'
import { eq, and, asc, inArray, notInArray } from 'drizzle-orm'
import { incrementFreeze } from '@/domain/settings/repository'
import { getLocalDateKey } from '@/utils/dateUtils'

export async function getStreakByTimeslot(timeSlotId: string) {
  return db.select().from(timeSlotStreaks)
    .where(eq(timeSlotStreaks.timeSlotId, timeSlotId))
    .get()
}

export async function upsertStreak(timeSlotId: string, data: Partial<typeof timeSlotStreaks.$inferInsert>) {
  const existing = await getStreakByTimeslot(timeSlotId)
  if (existing) {
    await db.update(timeSlotStreaks).set(data).where(eq(timeSlotStreaks.timeSlotId, timeSlotId))
  } else {
    await db.insert(timeSlotStreaks).values({ timeSlotId, currentStreak: 0, longestStreak: 0, lastCompletedDate: '', ...data })
  }
}

// 인증 즉시 +1 (timeslot별)
// 같은 날 중복 호출 방지: lastCompletedDate가 오늘이면 이미 처리됨 → 무시
export async function incrementStreak(timeSlotId: string) {
  const streak = await getStreakByTimeslot(timeSlotId)
  const today = getLocalDateKey()  // 로컬 날짜키 — toISOString() UTC 사용 금지

  if (streak?.lastCompletedDate === today) {
    return { freezeAcquired: false, currentStreak: streak.currentStreak }
  }

  const current = (streak?.currentStreak ?? 0) + 1
  const longest = Math.max(current, streak?.longestStreak ?? 0)

  await upsertStreak(timeSlotId, {
    currentStreak: current,
    longestStreak: longest,
    lastCompletedDate: today,
  })

  // 15회 배수 달성 시 freeze 획득
  if (current % 15 === 0) {
    await incrementFreeze()
    return { freezeAcquired: true, currentStreak: current }
  }
  return { freezeAcquired: false, currentStreak: current }
}

// missed 발생 시 해당 timeslot streak 리셋
export async function resetStreaks(timeSlotIds: string[]) {
  if (timeSlotIds.length === 0) return
  await db.update(timeSlotStreaks)
    .set({ currentStreak: 0 })
    .where(inArray(timeSlotStreaks.timeSlotId, timeSlotIds))
}

// 기록 삭제 후 호출 — dose_records 재순회해서 streak 재산출
// freeze는 보정하지 않음 — 이미 획득/사용된 freeze를 소급 조정하는 추적 테이블이 없고,
// 이미 소비된 케이스는 복원 불가. 기록 삭제는 사용자 명시적 행위이므로 freeze 현황은 그대로 유지.
export async function recalculateStreak(timeSlotId: string) {
  const records = await db.select().from(doseRecords)
    .where(
      and(
        eq(doseRecords.timeSlotId, timeSlotId),
        inArray(doseRecords.status, ['completed', 'missed', 'frozen'])
        // pending은 재계산에서 제외 — 오늘 미결 기록이 연속 카운트에 영향 주지 않도록
      )
    )
    .orderBy(asc(doseRecords.scheduledTime))

  let currentStreak = 0
  let longestStreak = 0
  let lastCompletedDate = ''

  for (const r of records) {
    if (r.status === 'completed' || r.status === 'frozen') {
      currentStreak++
      longestStreak = Math.max(longestStreak, currentStreak)
      lastCompletedDate = r.scheduledTime.slice(0, 10)
    } else if (r.status === 'missed') {
      currentStreak = 0
    }
    // pending은 무시
  }

  await upsertStreak(timeSlotId, { currentStreak, longestStreak, lastCompletedDate })
}
```

---

### 6-5. `src/domain/settings/repository.ts`

```typescript
import { db } from '@/db/client'
import { settings } from '@/db/schema'
import { eq, sql } from 'drizzle-orm'

const SETTINGS_ID = 1

export async function getSettings() {
  let row = await db.select().from(settings).where(eq(settings.id, SETTINGS_ID)).get()
  if (!row) {
    await db.insert(settings).values({ id: SETTINGS_ID })
    row = await db.select().from(settings).where(eq(settings.id, SETTINGS_ID)).get()
  }
  return row!
}

export async function updateSettings(data: Partial<typeof settings.$inferInsert>) {
  await db.update(settings).set(data).where(eq(settings.id, SETTINGS_ID))
}

// freeze 차감 (0 미만 방지)
export async function decrementFreeze() {
  const s = await getSettings()
  if (s.freezesRemaining <= 0) return
  await db.update(settings)
    .set({ freezesRemaining: s.freezesRemaining - 1 })
    .where(eq(settings.id, SETTINGS_ID))
}

// freeze 획득 (max 3)
export async function incrementFreeze() {
  const s = await getSettings()
  if (s.freezesRemaining >= 3) return
  await db.update(settings)
    .set({ freezesRemaining: s.freezesRemaining + 1 })
    .where(eq(settings.id, SETTINGS_ID))
}
```

---

### 6-6. `src/domain/referenceImage/repository.ts`

```typescript
import { db } from '@/db/client'
import { referenceImages } from '@/db/schema'
import { eq } from 'drizzle-orm'
import * as FileSystem from 'expo-file-system'
import { randomUUID } from 'expo-crypto'
import { toLocalISOString } from '@/utils/dateUtils'

export async function getReferenceImages(medicationId: string) {
  return db.select().from(referenceImages)
    .where(eq(referenceImages.medicationId, medicationId))
}

export async function getReferenceEmbeddings(medicationId: string): Promise<number[][]> {
  const images = await getReferenceImages(medicationId)
  return images.map(img => JSON.parse(img.embedding) as number[])
}

export async function insertReferenceImage(data: {
  medicationId: string
  originalUri: string
  croppedUri: string
  embedding: number[]
}) {
  const id = randomUUID()
  const now = toLocalISOString(new Date())
  await db.insert(referenceImages).values({
    id,
    medicationId: data.medicationId,
    originalUri: data.originalUri,
    croppedUri: data.croppedUri,
    embedding: JSON.stringify(data.embedding),
    createdAt: now,
  })
  return id
}

// 파일 시스템 정리 포함 — deleteMedication과 동일한 원칙
export async function deleteReferenceImage(id: string) {
  const img = await db.select().from(referenceImages)
    .where(eq(referenceImages.id, id)).get()
  if (img) {
    await FileSystem.deleteAsync(img.originalUri, { idempotent: true })
    await FileSystem.deleteAsync(img.croppedUri, { idempotent: true })
  }
  await db.delete(referenceImages).where(eq(referenceImages.id, id))
}
```

---

## 7. 유틸리티 함수

### 7-1. `src/utils/cycleUtils.ts`

```typescript
import { type CycleConfig } from '@/db/schema'

// timeSlot row를 받아서 해당 날짜가 복용일인지 판단
// checkDate 생략 시 오늘 기준 — backfill에서는 과거 날짜를 넘겨서 사용
export function isTodayDue(
  slot: {
    cycleConfig: string        // cycleType 컬럼 없음 — config.type으로 판단
    cycleStartDate: string | null
    isActive: number
  },
  checkDate = new Date()
): boolean {
  if (slot.isActive === 0) return false

  const config = JSON.parse(slot.cycleConfig) as CycleConfig
  const dow = checkDate.getDay()  // 0=일, 1=월, ..., 6=토

  switch (config.type) {
    case 'daily':
      return true

    case 'weekly':  // 주중 월~금
      return dow >= 1 && dow <= 5

    case 'weekends':  // 주말 토~일
      return dow === 0 || dow === 6

    case 'specific_days':
      return config.days.includes(dow)

    case 'rest': {
      if (!slot.cycleStartDate) return false
      const start = new Date(slot.cycleStartDate)
      const unit = config.unit === 'week' ? 7 : 1
      const activeTotal = config.active_value * unit
      const restTotal   = config.rest_value * unit
      const cycleLen    = activeTotal + restTotal

      const diffDays = Math.floor((checkDate.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
      const posInCycle = ((diffDays % cycleLen) + cycleLen) % cycleLen
      return posInCycle < activeTotal
    }

    default:
      return false
  }
}
```

---

### 7-2. `src/utils/similarity.ts`

```typescript
// cosine similarity: -1 ~ 1 범위
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

// 인증 판단 (threshold: scanConfig.ts에서 관리)
// 3장 이하: max / 4장 이상: 최저값 1개 제거 후 평균
export function isMatched(scanEmbedding: number[], referenceEmbeddings: number[][], threshold: number): boolean {
  if (referenceEmbeddings.length === 0) return false

  const scores = referenceEmbeddings.map(ref => cosineSimilarity(scanEmbedding, ref))

  if (scores.length <= 3) {
    return Math.max(...scores) >= threshold
  } else {
    const sorted = [...scores].sort((a, b) => a - b)
    const trimmed = sorted.slice(1)  // 최저값 1개 제거
    const avg = trimmed.reduce((s, v) => s + v, 0) / trimmed.length
    return avg >= threshold
  }
}
```

---

### 7-3. `src/utils/dateUtils.ts`

> 모든 날짜/시간은 **로컬 시간 기준** 문자열로 저장. `toISOString()`은 UTC 반환이라 KST(UTC+9) 환경에서 날짜가 밀리므로 전면 사용 금지.

```typescript
// 로컬 날짜키 'YYYY-MM-DD'
export function getLocalDateKey(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// Z 없는 로컬 ISO 문자열 — DB scheduledTime / createdAt 저장 전용
export function toLocalISOString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.000`
  )
}

// dateKey 하루의 시작/끝 로컬 문자열 (DB 범위 쿼리용)
// end는 다음날 자정 — lt(scheduledTime, end) 패턴 사용 (lte + 23:59:59.999 경계 버그 방지)
export function getLocalDayBounds(dateKey: string) {
  const d = new Date(`${dateKey}T12:00:00`)
  d.setDate(d.getDate() + 1)
  const pad = (n: number) => String(n).padStart(2, '0')
  const nextDay = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return {
    start: `${dateKey}T00:00:00.000`,
    end:   `${nextDay}T00:00:00.000`,  // 다음날 자정 — lt()와 함께 사용
  }
}

// fromKey ~ toKey 날짜 목록 생성 (양쪽 포함)
export function getDateRange(fromKey: string, toKey: string): string[] {
  const dates: string[] = []
  const cur = new Date(`${fromKey}T12:00:00`)
  const end = new Date(`${toKey}T12:00:00`)
  while (cur <= end) {
    dates.push(getLocalDateKey(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}
```

---

### 7-4. `src/utils/displayName.ts`

```typescript
// Private Mode 처리 — DB는 실제 이름 유지, 표시 레이어에서만 변환
export function displayMedicationName(
  name: string,
  index: number,
  privateMode: boolean
): string {
  if (!privateMode) return name
  return `알약${index + 1}`
}
```

---

## 7-5. `src/hooks/useFreezeEligibility.ts`

```typescript
import { getStreakByTimeslot } from '@/domain/streak/repository'
import { getSettings } from '@/domain/settings/repository'
import { doseRecords } from '@/db/schema'

// useAppInit step 3: streak 리셋 전에 호출 — streak > 0 조건이 리셋 후엔 항상 false
// missedRecords: checkMissedDoses()가 반환한 missed 기록 배열
// 동작: 놓친 슬롯 중 streak > 0 AND freezes_remaining > 0인 경우 → freeze 사용 팝업 트리거
// 팝업 구현은 S6 세션. 여기서는 팝업 조건 확인 + 상태 저장만.
export async function checkFreezeEligibility(
  missedRecords: (typeof doseRecords.$inferSelect)[]
): Promise<void> {
  const settings = await getSettings()
  if (settings.freezesRemaining <= 0) return  // freeze 없으면 팝업 불필요
  if (missedRecords.length === 0) return

  const eligibleSlotIds: string[] = []
  for (const record of missedRecords) {
    if (!record.timeSlotId) continue
    const streak = await getStreakByTimeslot(record.timeSlotId)
    if ((streak?.currentStreak ?? 0) > 0) {
      eligibleSlotIds.push(record.timeSlotId)
    }
  }

  if (eligibleSlotIds.length === 0) return

  // 팝업 트리거 — S6에서 전역 상태(Zustand/Context)로 구현
  // 여기서는 pending freeze use 슬롯 ID 목록을 전달하는 시그널만 발행
  // e.g., useFreezeStore.getState().setPendingFreeze(eligibleSlotIds)
}
// ※ freeze 실제 사용 (decrementFreeze + updateDoseRecordStatus → 'frozen') 은 S6 팝업 확인 버튼에서 처리
```

---

## 8. 앱 초기화: `src/hooks/useAppInit.ts`

```typescript
import { useEffect } from 'react'
import { restoreExpiredSkips } from '@/domain/timeslot/repository'
import { checkMissedDoses, backfillAndGenerateDoseRecords } from '@/domain/doseRecord/repository'
import { resetStreaks } from '@/domain/streak/repository'
import { checkFreezeEligibility } from '@/hooks/useFreezeEligibility'

export function useAppInit() {
  useEffect(() => {
    async function init() {
      // 1. skip_until 지난 슬롯 활성화 복귀
      await restoreExpiredSkips()

      // 2. 오늘 이전 pending → missed 처리 (streak 리셋 전에 실행)
      const { timeSlotIds: missedSlotIds, records: missedRecords } = await checkMissedDoses()

      // 3. freeze 팝업 체크 — streak 리셋 전에 반드시 먼저 실행
      //    (리셋 후엔 streak=0이라 팝업 조건 streak>0이 항상 false가 됨)
      if (missedRecords.length > 0) {
        await checkFreezeEligibility(missedRecords)
      }

      // 4. streak 리셋 — freeze 팝업 체크 완료 후
      if (missedSlotIds.length > 0) {
        await resetStreaks(missedSlotIds)
      }

      // 5. 앱 미실행 기간 누락 기록 backfill + 오늘 pending 생성
      await backfillAndGenerateDoseRecords()
    }

    init()
  }, [])
}
```

---

## 9. 상수 정의

### 9-1. `src/constants/medicationColors.ts`

```typescript
// 구현 시 디자인 확정 후 색상 배열 교체
export const MEDICATION_COLORS: string[] = [
  '#FF6B6B',
  '#4ECDC4',
  '#45B7D1',
  '#96CEB4',
  '#FFEAA7',
  '#DDA0DD',
  '#98D8C8',
  '#F7DC6F',
  '#BB8FCE',
  '#85C1E9',
]
// insertMedication 시 (현재 약 개수 % MEDICATION_COLORS.length) 인덱스로 배정
```

---

### 9-2. `src/constants/scanConfig.ts`

```typescript
export const SCAN_CONFIG = {
  SIMILARITY_THRESHOLD: 0.45,    // FN 줄이기 우선, 실제 테스트 후 조정
  MIN_REFERENCE_IMAGES: 3,
  MAX_REFERENCE_IMAGES: 10,
  CROP_RATIO: 0.75,              // Math.min(frameWidth, frameHeight) * 0.75
  YOLO_INPUT_SIZE: 640,
  MOBILENET_INPUT_SIZE: 160,
  HIGH_DOSE_WARNING_COUNT: 5,    // 5정 이상 시 스캔 경고 문구 표시
} as const
```

---

### 9-3. `src/constants/alarmConfig.ts`

```typescript
export const MAX_TIMESLOTS = 10
// 슬롯 10개 × 5일 = 50 notifications (expo-notifications 상한 64 이내)

export const ALARM_SCHEDULE_DAYS = 5
// 알람 선예약 일수. background refresh가 6시간마다 실행되므로 최소 커버리지 ≈ 4.75일

export const ALARM_REFRESH_TASK_NAME = 'ALARM_REFRESH_TASK'
// expo-task-manager 태스크 이름 (S7에서 등록)
```

---

## 10. 알람 스케줄링 전략 (S7 구현 기준)

### 전략: 5일치 one-time + 6시간 rolling refresh

expo-notifications의 repeating trigger는 cycle (휴약기·요일 지정 등) 지원 불가.  
→ 각 복용일을 계산해서 one-time notification으로 개별 등록.

```
슬롯 10개 × 5일 = 50 notifications ≤ 64 (expo 상한)
```

### 슬롯 저장 시 (즉시 등록)

```typescript
// src/domain/alarm/alarmScheduler.ts
import * as Notifications from 'expo-notifications'
import * as TaskManager from 'expo-task-manager'
import * as BackgroundFetch from 'expo-background-fetch'
import { db } from '@/db/client'
import { timeSlots, medications } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { ALARM_SCHEDULE_DAYS, ALARM_REFRESH_TASK_NAME } from '@/constants/alarmConfig'
import { isTodayDue } from '@/utils/cycleUtils'
import { getDateRange, getLocalDateKey } from '@/utils/dateUtils'
import { updateTimeslot } from '@/domain/timeslot/repository'

type TimeslotRow = typeof timeSlots.$inferSelect

// 슬롯 1개에 대해 향후 ALARM_SCHEDULE_DAYS일치 알람 등록
// 기존 notification_ids 먼저 취소 후 재등록
// medicationName: time_slots에 없으므로 호출부에서 별도 조회 후 전달
export async function scheduleAlarmsForSlot(slot: TimeslotRow, medicationName: string) {
  // 기존 알람 취소
  const existing: string[] = slot.notificationIds ? JSON.parse(slot.notificationIds) : []
  for (const nid of existing) {
    await Notifications.cancelScheduledNotificationAsync(nid).catch(() => {})
  }

  if (!slot.alarmEnabled) {
    await updateTimeslot(slot.id, { notificationIds: null })
    return
  }

  const todayKey = getLocalDateKey()
  const endKey = getLocalDateKey(new Date(Date.now() + ALARM_SCHEDULE_DAYS * 86400_000))
  const dates = getDateRange(todayKey, endKey)

  const newIds: string[] = []
  for (const dateKey of dates) {
    const checkDate = new Date(`${dateKey}T12:00:00`)
    if (!isTodayDue(slot, checkDate)) continue

    // 이미 지난 시간은 skip
    const triggerDate = new Date(checkDate.getFullYear(), checkDate.getMonth(), checkDate.getDate(), slot.hour, slot.minute)
    if (triggerDate <= new Date()) continue

    const nid = await Notifications.scheduleNotificationAsync({
      content: {
        title: '복용 시간입니다',
        body: `${medicationName} ${slot.doseCountPerIntake}정 — ${slot.hour}:${String(slot.minute).padStart(2, '0')}`,
        data: { timeSlotId: slot.id, medicationId: slot.medicationId, isForceAlarm: false },
        sound: slot.alarmSound,
      },
      trigger: { type: 'date', date: triggerDate },
    })
    newIds.push(nid)
  }

  await updateTimeslot(slot.id, { notificationIds: JSON.stringify(newIds) })
}

// 전체 슬롯 재스케줄 (background refresh / 앱 시작 시 호출)
export async function scheduleAlarmsForAllSlots() {
  const slots = await db.select().from(timeSlots)
  for (const slot of slots) {
    const med = await db.select().from(medications).where(eq(medications.id, slot.medicationId)).get()
    const medicationName = med?.name ?? '알약'
    await scheduleAlarmsForSlot(slot, medicationName)
  }
}
```

### Background Refresh 등록 (앱 루트에서 최초 1회)

```typescript
// src/domain/alarm/alarmScheduler.ts (계속)

// TaskManager에 태스크 정의
TaskManager.defineTask(ALARM_REFRESH_TASK_NAME, async () => {
  try {
    await scheduleAlarmsForAllSlots()
    return BackgroundFetch.BackgroundFetchResult.NewData
  } catch {
    return BackgroundFetch.BackgroundFetchResult.Failed
  }
})

// 앱 루트 (App.tsx 또는 _layout.tsx) 에서 호출
export async function registerAlarmRefreshTask() {
  const isRegistered = await TaskManager.isTaskRegisteredAsync(ALARM_REFRESH_TASK_NAME)
  if (!isRegistered) {
    await BackgroundFetch.registerTaskAsync(ALARM_REFRESH_TASK_NAME, {
      minimumInterval: 6 * 60 * 60,  // 6시간 (초 단위)
      stopOnTerminate: false,
      startOnBoot: true,
    })
  }
}
```

> **Android 동작 특성**: BackgroundFetch는 정확한 시각이 아닌 최소 간격 보장.  
> OS가 배터리 최적화로 지연할 수 있으나, 6시간 간격 4회/일이면 알람 공백 최소화.  
> 5일치 등록이므로 1~2회 refresh 실패해도 커버 가능.

---

## 11. 삭제 정책 정리

| 액션 | time_slots | dose_records | escape_records | reference_images | 파일 시스템 |
|---|---|---|---|---|---|
| 약 삭제 | CASCADE | medication_id → NULL | medication_id → NULL | CASCADE | original_uri / cropped_uri 삭제 |
| 슬롯 삭제 | 해당 삭제 | time_slot_id → NULL | time_slot_id → NULL | — | — |
| 기록 삭제 | 유지 | 해당만 삭제 | 유지 | — | recalculateStreak 호출 |

> **슬롯 삭제 후 통계 주의:** `time_slot_id → NULL`이 되면 해당 기록은 medication_id로만 조회 가능.
> S9 캘린더에서 슬롯별 통계는 슬롯 삭제 이후 기록에 대해 표시 불가 — 약 단위 통계만 가능.
> 의도된 동작 (기록 보존 우선). 슬롯 삭제 전 사용자에게 안내 문구 표시 권장.

---

## 12. 완료 기준 (S1)

### 기본 동작
- `npx drizzle-kit generate` 성공
- 마이그레이션 적용 후 SQLite에 7개 테이블 생성 확인
- `getMedications()`, `insertMedication()` 기본 동작 확인
- `getTodayTimeslots()` — cycle 계산 포함 동작 확인
- `restoreExpiredSkips()` — skip_until 지난 슬롯 활성화 확인

### 필수 경계 케이스 (테스트 필수)
- **UNIQUE(time_slot_id, day_key) + onConflictDoNothing:** 같은 슬롯+날짜로 두 번 insert 시 두 번째 무시 확인
- **incrementStreak 중복 방지:** 같은 날 두 번 호출해도 streak 1만 증가 (lastCompletedDate 체크)
- **incrementStreak 15회 milestone:** 15번째 호출 시 `freezeAcquired: true` + `freezesRemaining +1` 확인
- **isTodayDue — rest cycle:** active 구간에서 true, rest 구간에서 false, cycleStartDate=null에서 false
- **useAppInit 5-step 순서:** checkFreezeEligibility가 resetStreaks 이전에 실행됨을 확인 (streak>0 조건이 유효한 시점)
- **backfillAndGenerateDoseRecords 중복 방지:** 같은 날짜 두 번 backfill 호출 시 중복 레코드 없음
- **deleteMedication 파일 정리:** FileSystem.deleteAsync가 db.delete 이전에 호출됨 확인
- **insertTimeslot MAX_TIMESLOTS:** 10개 이후 insert 시 에러 throw 확인
