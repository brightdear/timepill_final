# Freeze Removal + Streak Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freeze 시스템(FreezePopup, FreezeAcquiredPopup, frozen status, freezesRemaining, timeSlotStreaks)을 완전 제거하고, 스트릭을 timeslot 단위에서 날짜 단위(하루 모든 복용 완료 = 1일)로 재설계한다.

**Architecture:** DB 마이그레이션으로 `time_slot_streaks` 테이블 삭제 + `frozen` 레코드를 `completed`로 변환하고, 새 `getDateStreak()` 함수는 `dose_records`를 직접 집계해 날짜 단위 streak을 계산한다. 홈 화면은 슬롯별 streak chip 대신 전역 날짜 streak 하나만 표시한다.

**Tech Stack:** Expo SQLite, Drizzle ORM, React Native, TypeScript

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/backend/db/migrations/0003_remove_freeze_system.sql` | DB 마이그레이션: frozen→completed, drop streak table, rebuild settings |
| Modify | `src/backend/db/migrations/meta/_journal.json` | 마이그레이션 인덱스에 0003 항목 추가 |
| Modify | `src/backend/db/schema.ts` | DoseStatus에서 `frozen` 제거, `timeSlotStreaks` 테이블 삭제, settings에서 `freezesRemaining` 제거 |
| Rewrite | `src/backend/streak/repository.ts` | 날짜 기준 `getDateStreak()` 전용 파일 |
| Modify | `src/backend/settings/repository.ts` | `incrementFreeze`, `applyFreezeToRecords` 제거 |
| Modify | `src/backend/doseRecord/repository.ts` | `updateDoseRecordStatus` 시그니처에서 `'frozen'` 제거 |
| Delete | `src/frontend/hooks/useFreezeEligibility.ts` | — |
| Delete | `src/frontend/components/FreezePopup.tsx` | — |
| Delete | `src/frontend/components/FreezeAcquiredPopup.tsx` | — |
| Rewrite | `src/frontend/hooks/useAppInit.ts` | freeze 로직 전체 제거, 단순 init만 유지 |
| Modify | `src/frontend/hooks/useTodayTimeslots.ts` | `timeSlotStreaks` 의존 제거, `dateStreak` 반환값 추가 |
| Rewrite | `src/frontend/hooks/useStreakUpdate.ts` | `completeVerification`에서 streak 호출 제거 |
| Modify | `app/(tabs)/index.tsx` | FreezePopup 제거, 전역 dateStreak 칩 표시 |
| Modify | `app/scan.tsx` | FreezeAcquiredPopup + freezePopup 상태 제거 |

---

### Task 1: DB 마이그레이션 파일 생성

**Files:**
- Create: `src/backend/db/migrations/0003_remove_freeze_system.sql`
- Modify: `src/backend/db/migrations/meta/_journal.json`

- [ ] **Step 1: 마이그레이션 SQL 파일 작성**

```sql
-- 1. frozen 레코드를 completed로 변환 (frozen 상태 완전 제거)
UPDATE `dose_records` SET `status` = 'completed' WHERE `status` = 'frozen';
--> statement-breakpoint

-- 2. time_slot_streaks 테이블 삭제
DROP TABLE IF EXISTS `time_slot_streaks`;
--> statement-breakpoint

-- 3. settings 테이블에서 freezes_remaining 제거 (SQLite는 DROP COLUMN을 지원하지 않으므로 재생성)
CREATE TABLE `settings_new` (
	`id` integer PRIMARY KEY DEFAULT 1 NOT NULL,
	`private_mode` integer DEFAULT 0 NOT NULL,
	`language` text DEFAULT 'ko' NOT NULL,
	`dev_mode` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
INSERT INTO `settings_new` (`id`, `private_mode`, `language`, `dev_mode`)
SELECT `id`, `private_mode`, `language`, `dev_mode` FROM `settings`;
--> statement-breakpoint
DROP TABLE `settings`;
--> statement-breakpoint
ALTER TABLE `settings_new` RENAME TO `settings`;
```

파일 경로: `src/backend/db/migrations/0003_remove_freeze_system.sql`

- [ ] **Step 2: 마이그레이션 저널 업데이트**

`src/backend/db/migrations/meta/_journal.json`에서 `"entries"` 배열에 아래 항목을 추가한다:

```json
{
  "idx": 3,
  "version": "6",
  "when": 1745469600000,
  "tag": "0003_remove_freeze_system",
  "breakpoints": true
}
```

결과 파일 전체:

```json
{
  "version": "7",
  "dialect": "sqlite",
  "entries": [
    {
      "idx": 0,
      "version": "6",
      "when": 1776827971398,
      "tag": "0000_odd_the_twelve",
      "breakpoints": true
    },
    {
      "idx": 1,
      "version": "6",
      "when": 1745296800000,
      "tag": "0001_add_force_notification_ids",
      "breakpoints": true
    },
    {
      "idx": 2,
      "version": "6",
      "when": 1745383200000,
      "tag": "0002_add_indexes",
      "breakpoints": true
    },
    {
      "idx": 3,
      "version": "6",
      "when": 1745469600000,
      "tag": "0003_remove_freeze_system",
      "breakpoints": true
    }
  ]
}
```

- [ ] **Step 3: 커밋**

```bash
git add src/backend/db/migrations/0003_remove_freeze_system.sql
git add src/backend/db/migrations/meta/_journal.json
git commit -m "feat: add migration 0003 to remove freeze system and redesign streak"
```

---

### Task 2: 스키마 업데이트

**Files:**
- Modify: `src/backend/db/schema.ts`

- [ ] **Step 1: DoseStatus에서 `frozen` 제거, `timeSlotStreaks` 테이블 삭제, settings에서 `freezesRemaining` 제거**

`src/backend/db/schema.ts` 전체를 아래로 교체한다:

```typescript
import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core'

// ── CycleConfig 타입 ──────────────────────────────────────────────────────────
export type CycleConfig =
  | { type: 'daily' }
  | { type: 'weekly' }
  | { type: 'weekends' }
  | { type: 'specific_days'; days: number[] }   // 0=일,1=월,...,6=토
  | { type: 'rest'; active_value: number; rest_value: number; unit: 'day' | 'week' }

export type DoseStatus = 'pending' | 'completed' | 'missed'

// ── medications ───────────────────────────────────────────────────────────────
export const medications = sqliteTable('medications', {
  id:        text('id').primaryKey(),
  name:      text('name').notNull(),
  color:     text('color').notNull(),
  isActive:  integer('is_active').notNull().default(1),
  createdAt: text('created_at').notNull(),
})

// ── time_slots ────────────────────────────────────────────────────────────────
export const timeSlots = sqliteTable('time_slots', {
  id:                    text('id').primaryKey(),
  medicationId:          text('medication_id').notNull()
                           .references(() => medications.id, { onDelete: 'cascade' }),
  hour:                  integer('hour').notNull(),
  minute:                integer('minute').notNull(),
  doseCountPerIntake:    integer('dose_count_per_intake').notNull().default(1),
  cycleConfig:           text('cycle_config').notNull(),
  cycleStartDate:        text('cycle_start_date'),
  verificationWindowMin: integer('verification_window_min').notNull().default(60),
  alarmEnabled:          integer('alarm_enabled').notNull().default(1),
  forceAlarm:            integer('force_alarm').notNull().default(0),
  popupEnabled:          integer('popup_enabled').notNull().default(1),
  snoozeCount:           integer('snooze_count').notNull().default(0),
  snoozeIntervalMin:     integer('snooze_interval_min').notNull().default(5),
  alarmSound:            text('alarm_sound').notNull().default('default'),
  vibrationEnabled:      integer('vibration_enabled').notNull().default(1),
  skipUntil:             text('skip_until'),
  notificationIds:       text('notification_ids'),
  forceNotificationIds:  text('force_notification_ids'),
  isActive:              integer('is_active').notNull().default(1),
  createdAt:             text('created_at').notNull(),
})

// ── dose_records ──────────────────────────────────────────────────────────────
export const doseRecords = sqliteTable('dose_records', {
  id:              text('id').primaryKey(),
  medicationId:    text('medication_id')
                     .references(() => medications.id, { onDelete: 'set null' }),
  medicationName:  text('medication_name').notNull(),
  timeSlotId:      text('time_slot_id')
                     .references(() => timeSlots.id, { onDelete: 'set null' }),
  dayKey:          text('day_key').notNull(),           // 'YYYY-MM-DD'
  scheduledTime:   text('scheduled_time').notNull(),    // 로컬 ISO datetime (Z 없음)
  status:          text('status').notNull(),             // DoseStatus
  targetDoseCount: integer('target_dose_count').notNull().default(1),
  completedAt:     text('completed_at'),
  createdAt:       text('created_at').notNull(),
}, (table) => ({
  uniqSlotDay: uniqueIndex('uniq_dose_slot_day').on(table.timeSlotId, table.dayKey),
}))

// ── escape_records ────────────────────────────────────────────────────────────
export const escapeRecords = sqliteTable('escape_records', {
  id:           text('id').primaryKey(),
  medicationId: text('medication_id')
                  .references(() => medications.id, { onDelete: 'set null' }),
  timeSlotId:   text('time_slot_id')
                  .references(() => timeSlots.id, { onDelete: 'set null' }),
  doseRecordId: text('dose_record_id')
                  .references(() => doseRecords.id, { onDelete: 'set null' }),
  dayKey:       text('day_key').notNull(),
  reason:       text('reason'),
  isUserFault:  integer('is_user_fault').notNull().default(1),
  note:         text('note'),
  createdAt:    text('created_at').notNull(),
})

// ── reference_images ──────────────────────────────────────────────────────────
export const referenceImages = sqliteTable('reference_images', {
  id:           text('id').primaryKey(),
  medicationId: text('medication_id').notNull()
                  .references(() => medications.id, { onDelete: 'cascade' }),
  originalUri:  text('original_uri').notNull(),
  croppedUri:   text('cropped_uri').notNull(),
  embedding:    text('embedding').notNull(),   // JSON number[]
  createdAt:    text('created_at').notNull(),
})

// ── settings (단일 row, id=1) ─────────────────────────────────────────────────
export const settings = sqliteTable('settings', {
  id:          integer('id').primaryKey().default(1),
  privateMode: integer('private_mode').notNull().default(0),
  language:    text('language').notNull().default('ko'),
  devMode:     integer('dev_mode').notNull().default(0),
})
```

- [ ] **Step 2: 커밋**

```bash
git add src/backend/db/schema.ts
git commit -m "refactor: remove frozen DoseStatus, timeSlotStreaks table, and freezesRemaining from schema"
```

---

### Task 3: 백엔드 레포지토리 정리

**Files:**
- Rewrite: `src/backend/streak/repository.ts`
- Modify: `src/backend/settings/repository.ts`
- Modify: `src/backend/doseRecord/repository.ts`

- [ ] **Step 1: streak/repository.ts 전면 교체**

날짜 기준 streak 계산 전용으로 재작성한다.
`completed` 레코드가 해당 날짜의 전체 레코드와 같아야 "완료된 날" 로 인정한다.

`src/backend/streak/repository.ts` 전체를 아래로 교체한다:

```typescript
import { db } from '@backend/db/client'
import { doseRecords } from '@backend/db/schema'
import { count, sql } from 'drizzle-orm'
import { getLocalDateKey } from '@shared/utils/dateUtils'

// 날짜 기준 streak: 하루 모든 dose_records가 completed인 연속 일수
export async function getDateStreak(): Promise<{ current: number; longest: number }> {
  const today = getLocalDateKey()

  // 날짜별로 total / completed 집계
  const rows = await db.select({
    dayKey: doseRecords.dayKey,
    total: count(),
    completed: sql<number>`cast(sum(case when ${doseRecords.status} = 'completed' then 1 else 0 end) as integer)`,
  })
    .from(doseRecords)
    .groupBy(doseRecords.dayKey)

  // 하루 모든 레코드가 completed인 날짜만 추출
  const completeDays = new Set(
    rows
      .filter(r => r.total > 0 && r.completed === r.total)
      .map(r => r.dayKey),
  )

  function prevDay(key: string): string {
    const d = new Date(`${key}T12:00:00`)
    d.setDate(d.getDate() - 1)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }

  // current: 오늘부터 역순으로 연속된 complete 날수
  let current = 0
  let checkDay = today
  while (completeDays.has(checkDay)) {
    current++
    checkDay = prevDay(checkDay)
  }

  // longest: 전체 기록에서 최장 연속 complete 일수
  const allDays = [...completeDays].sort()
  let longest = 0
  let run = 0
  let prevKey: string | null = null

  for (const day of allDays) {
    if (prevKey === null) {
      run = 1
    } else {
      const prev = new Date(`${prevKey}T12:00:00`)
      const cur = new Date(`${day}T12:00:00`)
      const diff = Math.round((cur.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24))
      run = diff === 1 ? run + 1 : 1
    }
    prevKey = day
    longest = Math.max(longest, run)
  }

  return { current, longest }
}
```

- [ ] **Step 2: settings/repository.ts에서 freeze 함수 제거**

`src/backend/settings/repository.ts` 전체를 아래로 교체한다:

```typescript
import { db } from '@backend/db/client'
import { settings } from '@backend/db/schema'
import { eq } from 'drizzle-orm'

const SETTINGS_ID = 1

export async function getSettings() {
  await db.insert(settings).values({ id: SETTINGS_ID }).onConflictDoNothing()
  return (await db.select().from(settings).where(eq(settings.id, SETTINGS_ID)).get())!
}

export async function updateSettings(data: Partial<typeof settings.$inferInsert>) {
  await db.update(settings).set(data).where(eq(settings.id, SETTINGS_ID))
}
```

- [ ] **Step 3: doseRecord/repository.ts의 updateDoseRecordStatus 시그니처 수정**

`src/backend/doseRecord/repository.ts`에서 `updateDoseRecordStatus` 함수를 찾아 `'frozen'` 타입을 제거한다.

변경 전:
```typescript
export async function updateDoseRecordStatus(
  id: string,
  status: 'completed' | 'missed' | 'frozen',
  completedAt?: string
) {
```

변경 후:
```typescript
export async function updateDoseRecordStatus(
  id: string,
  status: 'completed' | 'missed',
  completedAt?: string
) {
```

또한 `checkMissedDoses` 함수의 주석에서 freeze 관련 내용을 제거한다.

변경 전 (line 69–70):
```typescript
// 오늘 이전 pending 조회만 — DB write 없음. freeze 팝업 결과 확정 후 markDosesMissed 호출할 것.
export async function checkMissedDoses(): Promise<{
```

변경 후:
```typescript
// 오늘 이전 pending 조회만 — DB write 없음. markDosesMissed 이전에 호출할 것.
export async function checkMissedDoses(): Promise<{
```

또한 `markDosesMissed` 함수의 주석도 수정한다.

변경 전 (line 93):
```typescript
// freeze 팝업 완료 후 호출 — frozen으로 처리된 레코드는 제외하고 missed 기록
export async function markDosesMissed(recordIds: string[]): Promise<void> {
```

변경 후:
```typescript
// 오늘 이전 pending 레코드를 missed로 기록
export async function markDosesMissed(recordIds: string[]): Promise<void> {
```

또한 `backfillAndGenerateDoseRecords`의 마지막 주석도 수정한다.

변경 전 (line 175–176):
```typescript
  return {
    // Return inserted missed rows so startup freeze/streak logic can process days created by backfill.
    insertedMissedRecords: toInsert
```

변경 후:
```typescript
  return {
    insertedMissedRecords: toInsert
```

- [ ] **Step 4: 커밋**

```bash
git add src/backend/streak/repository.ts
git add src/backend/settings/repository.ts
git add src/backend/doseRecord/repository.ts
git commit -m "refactor: replace timeslot streak with date-based getDateStreak, remove freeze repository functions"
```

---

### Task 4: Freeze UI 파일 삭제

**Files:**
- Delete: `src/frontend/hooks/useFreezeEligibility.ts`
- Delete: `src/frontend/components/FreezePopup.tsx`
- Delete: `src/frontend/components/FreezeAcquiredPopup.tsx`

- [ ] **Step 1: 3개 파일 삭제**

```bash
rm src/frontend/hooks/useFreezeEligibility.ts
rm src/frontend/components/FreezePopup.tsx
rm src/frontend/components/FreezeAcquiredPopup.tsx
```

- [ ] **Step 2: 커밋**

```bash
git add -u src/frontend/hooks/useFreezeEligibility.ts
git add -u src/frontend/components/FreezePopup.tsx
git add -u src/frontend/components/FreezeAcquiredPopup.tsx
git commit -m "feat: delete freeze UI components and eligibility hook"
```

---

### Task 5: useAppInit.ts 단순화

**Files:**
- Rewrite: `src/frontend/hooks/useAppInit.ts`

- [ ] **Step 1: freeze 로직 전체 제거**

`src/frontend/hooks/useAppInit.ts` 전체를 아래로 교체한다:

```typescript
import { useState, useEffect } from 'react'
import { restoreExpiredSkips } from '@backend/timeslot/repository'
import { checkMissedDoses, markDosesMissed, backfillAndGenerateDoseRecords } from '@backend/doseRecord/repository'

export function useAppInit() {
  const [isReady, setIsReady] = useState(false)
  const [isBackfilling, setIsBackfilling] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function init() {
      // 1. skip_until 지난 슬롯 활성화 복귀
      await restoreExpiredSkips()

      // 2. 앱 미실행 기간 backfill + 오늘 pending 생성
      if (!cancelled) setIsBackfilling(true)
      await backfillAndGenerateDoseRecords()

      // 3. 오늘 이전 pending → missed 처리
      const { records: overdueRecords } = await checkMissedDoses()
      await markDosesMissed(overdueRecords.map(r => r.id))

      if (!cancelled) {
        setIsBackfilling(false)
        setIsReady(true)
      }
    }

    init()
    return () => { cancelled = true }
  }, [])

  return { isReady, isBackfilling }
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/frontend/hooks/useAppInit.ts
git commit -m "refactor: simplify useAppInit by removing all freeze logic"
```

---

### Task 6: useTodayTimeslots + useStreakUpdate 업데이트

**Files:**
- Modify: `src/frontend/hooks/useTodayTimeslots.ts`
- Rewrite: `src/frontend/hooks/useStreakUpdate.ts`

- [ ] **Step 1: useTodayTimeslots.ts에서 timeSlotStreaks 의존 제거 + dateStreak 추가**

`src/frontend/hooks/useTodayTimeslots.ts` 전체를 아래로 교체한다:

```typescript
import { useState, useCallback } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { db } from '@backend/db/client'
import { doseRecords, timeSlots, medications } from '@backend/db/schema'
import { and, eq, isNotNull, ne, sql, count } from 'drizzle-orm'
import { getLocalDateKey } from '@shared/utils/dateUtils'
import { getDateStreak } from '@backend/streak/repository'

type Slot = typeof timeSlots.$inferSelect
type DoseRecord = typeof doseRecords.$inferSelect
type Medication = typeof medications.$inferSelect

export type TimeslotWithDose = {
  slot: Slot
  doseRecord: DoseRecord | null
  medication: Medication | null
  completionRate: number | null  // completed / total non-pending, null = 기록 없음
}

function slotMinutes(s: Slot) { return s.hour * 60 + s.minute }

async function fetchAll(): Promise<{
  items: TimeslotWithDose[]
  totalSlotCount: number
  dateStreak: { current: number; longest: number }
}> {
  const todayKey = getLocalDateKey()
  const allSlots = await db.select().from(timeSlots)
  if (allSlots.length === 0) {
    return { items: [], totalSlotCount: 0, dateStreak: { current: 0, longest: 0 } }
  }

  // 4개 테이블을 각 1번씩만 조회 — N+1 방지
  const [allMeds, todayRecords, medStats, dateStreak] = await Promise.all([
    db.select().from(medications),
    db.select().from(doseRecords).where(eq(doseRecords.dayKey, todayKey)),
    db.select({
      medicationId: doseRecords.medicationId,
      total: count(),
      completed: sql<number>`cast(sum(case when ${doseRecords.status} = 'completed' then 1 else 0 end) as integer)`,
    })
      .from(doseRecords)
      .where(and(isNotNull(doseRecords.medicationId), ne(doseRecords.status, 'pending')))
      .groupBy(doseRecords.medicationId),
    getDateStreak(),
  ])

  const medMap = new Map(allMeds.map(m => [m.id, m]))
  const recordMap = new Map(todayRecords.map(r => [r.timeSlotId, r]))
  const rateMap = new Map(
    medStats.map(s => [
      s.medicationId,
      s.total > 0 ? s.completed / s.total : null,
    ]),
  )

  const results = allSlots.map(slot => ({
    slot,
    doseRecord: recordMap.get(slot.id) ?? null,
    medication: medMap.get(slot.medicationId) ?? null,
    completionRate: rateMap.get(slot.medicationId) ?? null,
  }))

  // sort: active (time asc) → skip (skipUntil asc) → off (time asc)
  const active = results
    .filter(r => r.slot.isActive === 1 && r.doseRecord !== null)
    .sort((a, b) => slotMinutes(a.slot) - slotMinutes(b.slot))

  const skip = results
    .filter(r => r.slot.isActive === 0 && r.slot.skipUntil !== null)
    .sort((a, b) => (a.slot.skipUntil ?? '') < (b.slot.skipUntil ?? '') ? -1 : 1)

  const off = results
    .filter(r => r.slot.isActive === 0 && r.slot.skipUntil === null)
    .sort((a, b) => slotMinutes(a.slot) - slotMinutes(b.slot))

  return { items: [...active, ...skip, ...off], totalSlotCount: allSlots.length, dateStreak }
}

export function useTodayTimeslots() {
  const [data, setData] = useState<TimeslotWithDose[]>([])
  const [totalSlotCount, setTotalSlotCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [dateStreak, setDateStreak] = useState<{ current: number; longest: number }>({ current: 0, longest: 0 })

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const next = await fetchAll()
      setData(next.items)
      setTotalSlotCount(next.totalSlotCount)
      setDateStreak(next.dateStreak)
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      void refresh()
    }, [refresh]),
  )

  return { data, loading, refresh, totalSlotCount, dateStreak }
}

// Whether the user can verify this dose right now
export function isVerifiable(slot: Slot, doseRecord: DoseRecord | null): boolean {
  if (!doseRecord || doseRecord.status !== 'pending') return false
  const now = Date.now()
  const scheduled = new Date(doseRecord.scheduledTime).getTime()
  const halfWindow = (slot.verificationWindowMin / 2) * 60 * 1000
  const windowStart = scheduled - halfWindow
  const windowEnd   = scheduled + halfWindow
  return now >= windowStart && now <= windowEnd
}
```

- [ ] **Step 2: useStreakUpdate.ts 단순화**

`src/frontend/hooks/useStreakUpdate.ts` 전체를 아래로 교체한다:

```typescript
import { updateDoseRecordStatus } from '@backend/doseRecord/repository'
import { toLocalISOString } from '@shared/utils/dateUtils'

export async function completeVerification(doseRecordId: string): Promise<void> {
  const completedAt = toLocalISOString(new Date())
  await updateDoseRecordStatus(doseRecordId, 'completed', completedAt)
}
```

- [ ] **Step 3: 커밋**

```bash
git add src/frontend/hooks/useTodayTimeslots.ts
git add src/frontend/hooks/useStreakUpdate.ts
git commit -m "refactor: remove timeSlotStreaks from useTodayTimeslots, add dateStreak; simplify useStreakUpdate"
```

---

### Task 7: 홈 화면 업데이트 (index.tsx)

**Files:**
- Modify: `app/(tabs)/index.tsx`

- [ ] **Step 1: FreezePopup 제거 + 전역 dateStreak 칩 표시로 교체**

`app/(tabs)/index.tsx` 전체를 아래로 교체한다:

```typescript
import React, { useCallback, useRef, useState, useEffect } from 'react'
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useAppInit } from '@frontend/hooks/useAppInit'
import { useTodayTimeslots } from '@frontend/hooks/useTodayTimeslots'
import { getSettings } from '@backend/settings/repository'
import { TimeslotRow } from '@frontend/components/TimeslotRow'
import { displayMedicationName } from '@shared/utils/displayName'
import { useFocusEffect } from '@react-navigation/native'
import type { TimeslotWithDose } from '@frontend/hooks/useTodayTimeslots'

export default function HomeScreen() {
  const router = useRouter()
  const { isReady, isBackfilling } = useAppInit()
  const { data, loading, refresh, totalSlotCount, dateStreak } = useTodayTimeslots()
  const [privateMode, setPrivateMode] = useState(false)
  const listRef = useRef<FlatList<TimeslotWithDose>>(null)
  const [showScrollUp, setShowScrollUp] = useState(false)
  const [, setClockTick] = useState(0)

  useFocusEffect(
    useCallback(() => {
      getSettings().then(s => setPrivateMode(s.privateMode === 1))
    }, []),
  )

  const prevIsReady = useRef(false)
  useEffect(() => {
    if (isReady && !prevIsReady.current) refresh()
    prevIsReady.current = isReady
  }, [isReady, refresh])

  useEffect(() => {
    if (!isReady) return
    const id = setInterval(() => setClockTick(t => t + 1), 30 * 1000)
    return () => clearInterval(id)
  }, [isReady])

  // Private labels must be stable per medication, not per visible row order.
  const sortedMedicationIds = React.useMemo(() => {
    const seen = new Map<string, string>()
    data.forEach(r => {
      if (r.medication && !seen.has(r.medication.id)) {
        seen.set(r.medication.id, r.medication.createdAt)
      }
    })
    return [...seen.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id]) => id)
  }, [data])

  const getPrivateIndex = useCallback(
    (medicationId: string | undefined, fallback: number) => {
      const idx = sortedMedicationIds.indexOf(medicationId ?? '')
      return idx >= 0 ? idx : fallback
    },
    [sortedMedicationIds],
  )

  const handleVerify = useCallback((item: TimeslotWithDose) => {
    router.navigate(`/scan?slotId=${item.slot.id}`)
  }, [router])

  const handleEdit = useCallback(
    (slotId: string) => {
      const editLoadKey = Date.now().toString()
      router.navigate(`/(tabs)/register?slotId=${encodeURIComponent(slotId)}&editLoadKey=${editLoadKey}`)
    },
    [router],
  )

  if (!isReady || loading) {
    return (
      <View style={s.root}>
        <View style={s.center}>
          {isBackfilling ? (
            <>
              <ActivityIndicator size="large" color="#111" />
              <Text style={s.backfillTxt}>지난 날들의 내역을 불러오는 중입니다</Text>
            </>
          ) : (
            <ActivityIndicator size="large" color="#111" />
          )}
        </View>
      </View>
    )
  }

  return (
    <View style={s.root}>
      <FlatList
        ref={listRef}
        data={data}
        keyExtractor={item => item.slot.id}
        contentContainerStyle={s.list}
        onScroll={e => setShowScrollUp(e.nativeEvent.contentOffset.y > 60)}
        scrollEventThrottle={100}
        ListHeaderComponent={
          <View>
            <Text style={s.appName}>Timepill</Text>
            {dateStreak.current > 0 && (
              <View style={s.streakChip}>
                <Text style={s.streakChipTxt}>🔥 {dateStreak.current}일 연속</Text>
                {dateStreak.longest > 0 && (
                  <Text style={s.streakChipBest}>최고 {dateStreak.longest}일</Text>
                )}
              </View>
            )}
            <Text style={s.sectionTitle}>오늘 알람</Text>
          </View>
        }
        ListEmptyComponent={
          <View style={s.empty}>
            <Text style={s.emptyTxt}>
              {totalSlotCount === 0 ? '등록된 슬롯이 없습니다' : '오늘 복용할 약이 없습니다'}
            </Text>
            {totalSlotCount === 0 && (
              <TouchableOpacity
                style={s.addBtn}
                onPress={() => router.navigate('/(tabs)/register')}
              >
                <Text style={s.addBtnTxt}>약 등록하기</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        renderItem={({ item, index }) => (
          <TimeslotRow
            item={item}
            index={index}
            onRefresh={refresh}
            onEdit={handleEdit}
            onVerify={handleVerify}
            privateMode={privateMode}
            privateIndex={getPrivateIndex(item.medication?.id, index)}
          />
        )}
      />
      {showScrollUp && (
        <TouchableOpacity
          style={s.scrollUpBtn}
          onPress={() => listRef.current?.scrollToOffset({ offset: 0, animated: true })}
        >
          <Text style={s.scrollUpTxt}>↑</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f9f9f9' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  backfillTxt: { fontSize: 14, color: '#888', textAlign: 'center', marginTop: 8 },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  appName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111',
    paddingTop: 64,
    paddingBottom: 16,
  },
  streakChip: {
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    alignSelf: 'flex-start',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  streakChipTxt: { fontSize: 15, color: '#f59e0b', fontWeight: '700' },
  streakChipBest: { fontSize: 12, color: '#aaa' },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#aaa',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  empty: { alignItems: 'center', paddingTop: 60, gap: 16 },
  emptyTxt: { fontSize: 16, color: '#aaa' },
  addBtn: {
    backgroundColor: '#111',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  addBtnTxt: { fontSize: 15, fontWeight: '600', color: '#fff' },
  scrollUpBtn: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    backgroundColor: '#111',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  scrollUpTxt: { color: '#fff', fontSize: 18, fontWeight: '700' },
})
```

- [ ] **Step 2: 커밋**

```bash
git add app/(tabs)/index.tsx
git commit -m "feat: remove FreezePopup from home screen, show global dateStreak chip"
```

---

### Task 8: 스캔 화면 업데이트 (scan.tsx)

**Files:**
- Modify: `app/scan.tsx`

- [ ] **Step 1: FreezeAcquiredPopup + freezePopup 상태 제거, completeVerification 시그니처 맞추기**

`app/scan.tsx`에서 아래 변경 사항을 적용한다.

**1. import에서 FreezeAcquiredPopup 제거**

변경 전:
```typescript
import { FreezeAcquiredPopup } from '@frontend/components/FreezeAcquiredPopup'
```
→ 이 줄을 삭제한다.

**2. freezePopup 상태 선언 제거**

변경 전:
```typescript
  const [freezePopup, setFreezePopup] = useState<{ visible: boolean; streak: number }>({
    visible: false,
    streak: 0,
  })
```
→ 이 3줄을 삭제한다.

**3. completeScanResult 내부의 freeze 처리 교체**

변경 전:
```typescript
    const { freezeAcquired, currentStreak } = await completeVerification(
      item.doseRecordId,
      item.slotId,
    )
    if (freezeAcquired) {
      setFreezePopup({ visible: true, streak: currentStreak })
    }
```

변경 후:
```typescript
    await completeVerification(item.doseRecordId)
```

**4. FreezeAcquiredPopup JSX 제거**

변경 전:
```typescript
      <FreezeAcquiredPopup
        visible={freezePopup.visible}
        currentStreak={freezePopup.streak}
        onClose={() => setFreezePopup({ visible: false, streak: 0 })}
      />
```
→ 이 4줄을 삭제한다.

- [ ] **Step 2: 커밋**

```bash
git add app/scan.tsx
git commit -m "feat: remove FreezeAcquiredPopup and freeze state from scan screen"
```

---

## 완료 확인 체크리스트

- [ ] `frozen` 문자열이 코드베이스에 더 이상 없음: `grep -r "frozen\|freeze\|Freeze" src/ app/` 결과에 관련 코드 없음
- [ ] `timeSlotStreaks` import가 없음: `grep -r "timeSlotStreaks" src/ app/` 결과 없음
- [ ] `freezesRemaining` 참조 없음: `grep -r "freezesRemaining\|incrementFreeze\|applyFreeze" src/ app/` 결과 없음
- [ ] 앱이 정상 시동됨 (HomeScreen 렌더링, streak 칩 표시)
- [ ] 약 복용 scan 후 completed 처리 정상 동작
- [ ] 앱 재시동 시 missed 처리 + isReady 전환 정상 동작

---

## 다음 플랜

이 플랜 완료 후 `docs/superpowers/plans/2026-04-29-daycare-feature.md`를 실행한다.
데이키우기 플랜은 이 플랜에서 만든 날짜 기준 `getDateStreak()`를 직접 사용한다.
