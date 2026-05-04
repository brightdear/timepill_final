# 데이키우기 (Daycare) 기능 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** streak과 복용률 조건을 충족하면 "데이" 캐릭터가 알→아기→어린이→성체로 성장하는 탭을 구현하고, 복용 완료 및 streak 마일스톤마다 "젤리" 재화를 지급한다.

**Architecture:** `daycare` 전용 테이블(단일 row)을 새로 만들어 `stage`와 `jelly_balance`를 저장한다. settings 테이블은 건드리지 않는다. 단계는 전진만 가능(streak 끊겨도 유지). 전체 streak은 `time_slot_streaks`의 활성 timeslot 중 최솟값, 전체 복용률은 `dose_records`에서 최근 N일 completed+frozen 비율로 on-the-fly 계산한다. 젤리는 복용 1회마다 + 매 7 streak마다 지급된다. DaycareView는 배경→캐릭터→소품 레이어 구조로 설계해 향후 상점 아이템을 쉽게 얹을 수 있게 한다.

**Tech Stack:** Expo SDK 54, React Native, Drizzle ORM (SQLite), TypeScript 5.9, expo-router

---

## 파일 구조

| 파일 | 역할 |
|---|---|
| `src/backend/db/migrations/0003_add_daycare.sql` | daycare 전용 테이블 생성 |
| `src/backend/db/migrations/meta/_journal.json` | 마이그레이션 메타 업데이트 |
| `src/backend/db/migrations/migrations.js` | 번들 마이그레이션 파일 업데이트 |
| `src/backend/db/schema.ts` | daycare 테이블 정의 추가 |
| `src/shared/constants/daycareConfig.ts` | DaycareStage 타입 + 성장 조건 + 젤리 상수 |
| `src/backend/daycare/repository.ts` | streak/복용률 계산 + 단계 전진 로직 |
| `src/backend/settings/repository.ts` | awardJelly, getJellyBalance 함수 추가 |
| `src/backend/streak/repository.ts` | incrementStreak에 milestone 젤리 지급 추가 |
| `src/frontend/hooks/useStreakUpdate.ts` | completeVerification에 복용 젤리 지급 추가 |
| `src/frontend/hooks/useDaycare.ts` | 단계·streak·복용률·젤리잔액 상태 훅 |
| `src/frontend/components/DaycareView.tsx` | 레이어 구조 캐릭터 뷰 + 수치 표시 |
| `app/(tabs)/daycare.tsx` | 새 탭 화면 |
| `app/(tabs)/_layout.tsx` | 탭 레이아웃에 데이키우기 탭 추가 |
| `assets/daycare/egg.png` 외 3개 | 캐릭터 이미지 (직접 배치 필요) |

---

### Task 1: DB 마이그레이션 — daycare 전용 테이블 생성

**Files:**
- Create: `src/backend/db/migrations/0003_add_daycare.sql`
- Modify: `src/backend/db/migrations/meta/_journal.json`
- Modify: `src/backend/db/migrations/migrations.js`
- Modify: `src/backend/db/schema.ts`

`settings` 테이블은 건드리지 않는다. `daycare` 테이블은 단일 row(id=1)로 운용한다.

- [ ] **Step 1: SQL 마이그레이션 파일 생성**

```bash
cat > /c/timepill_final/src/backend/db/migrations/0003_add_daycare.sql << 'EOF'
CREATE TABLE daycare (
  id INTEGER PRIMARY KEY DEFAULT 1,
  stage TEXT NOT NULL DEFAULT 'egg',
  jelly_balance INTEGER NOT NULL DEFAULT 0
);
EOF
```

- [ ] **Step 2: _journal.json 업데이트**

`src/backend/db/migrations/meta/_journal.json` 전체를 아래로 교체:

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
      "when": 1746000000000,
      "tag": "0003_add_daycare",
      "breakpoints": true
    }
  ]
}
```

- [ ] **Step 3: migrations.js 업데이트**

`src/backend/db/migrations/migrations.js` 전체를 아래로 교체:

```js
// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

import journal from './meta/_journal.json';
import m0000 from './0000_odd_the_twelve.sql';
import m0001 from './0001_add_force_notification_ids.sql';
import m0002 from './0002_add_indexes.sql';
import m0003 from './0003_add_daycare.sql';

  export default {
    journal,
    migrations: {
      m0000,
      m0001,
      m0002,
      m0003,
    }
  }
```

- [ ] **Step 4: schema.ts에 daycare 테이블 추가**

`src/backend/db/schema.ts` 끝에 아래를 추가 (settings 테이블은 수정 없음):

```typescript
// ── daycare (단일 row, id=1) ──────────────────────────────────────────────────
export const daycare = sqliteTable('daycare', {
  id:           integer('id').primaryKey().default(1),
  stage:        text('stage').notNull().default('egg'),
  jellyBalance: integer('jelly_balance').notNull().default(0),
})
```

- [ ] **Step 5: TypeScript 타입 체크**

```bash
cd /c/timepill_final && npx tsc --noEmit 2>&1 | head -20
# 출력 없으면 통과
```

- [ ] **Step 6: Commit**

```bash
cd /c/timepill_final
git add src/backend/db/
git commit -m "feat: add daycare table (stage + jelly_balance)"
```

---

### Task 2: 공유 상수 — daycareConfig.ts

**Files:**
- Create: `src/shared/constants/daycareConfig.ts`

- [ ] **Step 1: daycareConfig.ts 생성**

```typescript
// src/shared/constants/daycareConfig.ts

export type DaycareStage = 'egg' | 'baby' | 'child' | 'adult'

export const STAGE_ORDER: DaycareStage[] = ['egg', 'baby', 'child', 'adult']

export type GrowthCondition = {
  streakDays: number
  complianceDays: number
  complianceMin: number
}

// 각 단계에서 다음 단계로 성장하기 위한 조건. adult는 최종 단계라 null.
export const GROWTH_CONDITIONS: Record<DaycareStage, GrowthCondition | null> = {
  egg:   { streakDays: 3,  complianceDays: 7,  complianceMin: 70 },
  baby:  { streakDays: 14, complianceDays: 30, complianceMin: 80 },
  child: { streakDays: 60, complianceDays: 60, complianceMin: 90 },
  adult: null,
}

export const STAGE_LABEL: Record<DaycareStage, string> = {
  egg:   '알',
  baby:  '아기',
  child: '어린이',
  adult: '성체',
}

// 젤리 지급 상수 — 출시 전 수치 튜닝 필요
export const JELLY_PER_DOSE = 1
export const JELLY_PER_MILESTONE = 10
export const JELLY_MILESTONE_INTERVAL = 7  // 매 N streak마다 마일스톤 젤리 지급
```

- [ ] **Step 2: TypeScript 타입 체크**

```bash
cd /c/timepill_final && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
cd /c/timepill_final
git add src/shared/constants/daycareConfig.ts
git commit -m "feat: add daycare stage config and jelly constants"
```

---

### Task 3: Backend — daycare/repository.ts

**Files:**
- Create: `src/backend/daycare/repository.ts`

- [ ] **Step 1: repository.ts 생성**

```typescript
// src/backend/daycare/repository.ts
import { db } from '@backend/db/client'
import { doseRecords, timeSlots, timeSlotStreaks, daycare } from '@backend/db/schema'
import { eq, gte, lte, and, inArray } from 'drizzle-orm'
import { getLocalDateKey } from '@shared/utils/dateUtils'
import { STAGE_ORDER, GROWTH_CONDITIONS } from '@shared/constants/daycareConfig'
import type { DaycareStage } from '@shared/constants/daycareConfig'

const DAYCARE_ID = 1

async function ensureRow() {
  await db.insert(daycare).values({ id: DAYCARE_ID }).onConflictDoNothing()
}

export async function getOverallStreak(): Promise<number> {
  const activeSlots = await db
    .select({ id: timeSlots.id })
    .from(timeSlots)
    .where(eq(timeSlots.isActive, 1))

  if (activeSlots.length === 0) return 0

  const slotIds = activeSlots.map(s => s.id)
  const streaks = await db
    .select({ currentStreak: timeSlotStreaks.currentStreak })
    .from(timeSlotStreaks)
    .where(inArray(timeSlotStreaks.timeSlotId, slotIds))

  if (streaks.length === 0) return 0

  return Math.min(...streaks.map(s => s.currentStreak))
}

export async function getRecentComplianceRate(days: number): Promise<number> {
  const today = new Date()
  const start = new Date(today)
  start.setDate(today.getDate() - (days - 1))

  const pad = (n: number) => String(n).padStart(2, '0')
  const startKey = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`
  const endKey = getLocalDateKey()

  const records = await db
    .select({ status: doseRecords.status })
    .from(doseRecords)
    .where(
      and(
        gte(doseRecords.dayKey, startKey),
        lte(doseRecords.dayKey, endKey)
      )
    )

  const nonPending = records.filter(r => r.status !== 'pending')
  if (nonPending.length === 0) return 100

  const done = nonPending.filter(r => r.status === 'completed' || r.status === 'frozen').length
  return Math.round((done / nonPending.length) * 100)
}

export async function getDaycareStage(): Promise<DaycareStage> {
  await ensureRow()
  const row = await db
    .select({ stage: daycare.stage })
    .from(daycare)
    .where(eq(daycare.id, DAYCARE_ID))
    .get()
  return (row?.stage ?? 'egg') as DaycareStage
}

export async function checkAndAdvanceStage(): Promise<{
  stage: DaycareStage
  streak: number
  complianceRate: number
}> {
  let stage = await getDaycareStage()

  let advanced = true
  while (advanced) {
    advanced = false
    const conditions = GROWTH_CONDITIONS[stage]
    if (!conditions) break

    const streak = await getOverallStreak()
    const compliance = await getRecentComplianceRate(conditions.complianceDays)

    if (streak >= conditions.streakDays && compliance >= conditions.complianceMin) {
      const nextIndex = STAGE_ORDER.indexOf(stage) + 1
      stage = STAGE_ORDER[nextIndex]
      await db
        .update(daycare)
        .set({ stage })
        .where(eq(daycare.id, DAYCARE_ID))
      advanced = true
    }
  }

  const currentConditions = GROWTH_CONDITIONS[stage]
  const complianceDays = currentConditions?.complianceDays ?? 60
  const streak = await getOverallStreak()
  const complianceRate = await getRecentComplianceRate(complianceDays)

  return { stage, streak, complianceRate }
}
```

- [ ] **Step 2: TypeScript 타입 체크**

```bash
cd /c/timepill_final && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
cd /c/timepill_final
git add src/backend/daycare/
git commit -m "feat: add daycare repository (streak, compliance, stage logic)"
```

---

### Task 4: Jelly — daycare/repository.ts에 awardJelly, getJellyBalance 추가

**Files:**
- Modify: `src/backend/daycare/repository.ts`

- [ ] **Step 1: awardJelly, getJellyBalance 함수 추가**

`src/backend/daycare/repository.ts` 끝에 아래 두 함수를 추가:

```typescript
export async function getJellyBalance(): Promise<number> {
  await ensureRow()
  const row = await db
    .select({ jellyBalance: daycare.jellyBalance })
    .from(daycare)
    .where(eq(daycare.id, DAYCARE_ID))
    .get()
  return row?.jellyBalance ?? 0
}

export async function awardJelly(amount: number): Promise<void> {
  await ensureRow()
  const row = await db
    .select({ jellyBalance: daycare.jellyBalance })
    .from(daycare)
    .where(eq(daycare.id, DAYCARE_ID))
    .get()
  await db
    .update(daycare)
    .set({ jellyBalance: (row?.jellyBalance ?? 0) + amount })
    .where(eq(daycare.id, DAYCARE_ID))
}
```

- [ ] **Step 2: TypeScript 타입 체크**

```bash
cd /c/timepill_final && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
cd /c/timepill_final
git add src/backend/settings/repository.ts
git commit -m "feat: add awardJelly and getJellyBalance to settings repository"
```

---

### Task 5: Jelly — streak 마일스톤마다 지급 (매 7 streak)

**Files:**
- Modify: `src/backend/streak/repository.ts`

기존 `incrementStreak` 함수에서 `if (current % 15 === 0)` freeze 체크 바로 뒤에 jelly 마일스톤 체크를 추가한다.

- [ ] **Step 1: incrementStreak 수정**

`src/backend/streak/repository.ts` 의 `incrementStreak` 함수 전체를 아래로 교체:

```typescript
export async function incrementStreak(timeSlotId: string) {
  const streak = await getStreakByTimeslot(timeSlotId)
  const today = getLocalDateKey()

  if (streak?.lastCompletedDate === today) {
    return { freezeAcquired: false, currentStreak: streak.currentStreak }
  }

  const current = (streak?.currentStreak ?? 0) + 1
  const longest = Math.max(current, streak?.longestStreak ?? 0)

  await upsertStreak(timeSlotId, { currentStreak: current, longestStreak: longest, lastCompletedDate: today })

  let freezeAcquired = false
  if (current % 15 === 0) {
    await incrementFreeze()
    freezeAcquired = true
  }

  if (current % JELLY_MILESTONE_INTERVAL === 0) {
    await awardJelly(JELLY_PER_MILESTONE)
  }

  return { freezeAcquired, currentStreak: current }
}
```

그리고 파일 상단 import에 추가:

```typescript
import { awardJelly } from '@backend/daycare/repository'
import { JELLY_MILESTONE_INTERVAL, JELLY_PER_MILESTONE } from '@shared/constants/daycareConfig'
```

- [ ] **Step 2: TypeScript 타입 체크**

```bash
cd /c/timepill_final && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
cd /c/timepill_final
git add src/backend/streak/repository.ts
git commit -m "feat: award jelly on every 7-streak milestone"
```

---

### Task 6: Jelly — 복용 완료마다 지급

**Files:**
- Modify: `src/frontend/hooks/useStreakUpdate.ts`

- [ ] **Step 1: completeVerification에 복용 젤리 지급 추가**

`src/frontend/hooks/useStreakUpdate.ts` 전체를 아래로 교체:

```typescript
import { updateDoseRecordStatus } from '@backend/doseRecord/repository'
import { incrementStreak } from '@backend/streak/repository'
import { awardJelly } from '@backend/daycare/repository'
import { toLocalISOString } from '@shared/utils/dateUtils'
import { JELLY_PER_DOSE } from '@shared/constants/daycareConfig'

export async function completeVerification(
  doseRecordId: string,
  timeSlotId: string,
): Promise<{ freezeAcquired: boolean; currentStreak: number }> {
  const completedAt = toLocalISOString(new Date())
  await updateDoseRecordStatus(doseRecordId, 'completed', completedAt)
  await awardJelly(JELLY_PER_DOSE)
  return incrementStreak(timeSlotId)
}
```

- [ ] **Step 2: TypeScript 타입 체크**

```bash
cd /c/timepill_final && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
cd /c/timepill_final
git add src/frontend/hooks/useStreakUpdate.ts
git commit -m "feat: award jelly on every dose completion"
```

---

### Task 7: 이미지 에셋 배치

**Files:**
- Create: `assets/daycare/egg.png`
- Create: `assets/daycare/baby.png`
- Create: `assets/daycare/child.png`
- Create: `assets/daycare/adult.png`

- [ ] **Step 1: daycare 폴더 생성**

```bash
mkdir -p /c/timepill_final/assets/daycare
```

- [ ] **Step 2: 이미지 파일 직접 배치**

아래 경로에 4장 저장:
- `assets/daycare/egg.png` — 알 단계
- `assets/daycare/baby.png` — 아기 단계
- `assets/daycare/child.png` — 어린이 단계 (머리에 알 껍데기 조각)
- `assets/daycare/adult.png` — 성체 단계 (알 껍데기 안에서 나오는 모습)

- [ ] **Step 3: 배치 확인**

```bash
ls /c/timepill_final/assets/daycare/
# 예상: adult.png  baby.png  child.png  egg.png
```

- [ ] **Step 4: Commit**

```bash
cd /c/timepill_final
git add assets/daycare/
git commit -m "feat: add daycare character image assets"
```

---

### Task 8: Frontend Hook — useDaycare.ts

**Files:**
- Create: `src/frontend/hooks/useDaycare.ts`

- [ ] **Step 1: useDaycare.ts 생성**

```typescript
// src/frontend/hooks/useDaycare.ts
import { useState, useEffect, useCallback } from 'react'
import { checkAndAdvanceStage, getJellyBalance } from '@backend/daycare/repository'
import { GROWTH_CONDITIONS, STAGE_LABEL } from '@shared/constants/daycareConfig'
import type { DaycareStage } from '@shared/constants/daycareConfig'

export type DaycareState = {
  stage: DaycareStage
  stageLabel: string
  streak: number
  complianceRate: number
  jellyBalance: number
  nextStreakTarget: number | null
  nextComplianceTarget: number | null
  nextComplianceDays: number | null
  loading: boolean
}

export function useDaycare(): DaycareState & { refresh: () => void } {
  const [state, setState] = useState<DaycareState>({
    stage: 'egg',
    stageLabel: '알',
    streak: 0,
    complianceRate: 100,
    jellyBalance: 0,
    nextStreakTarget: 3,
    nextComplianceTarget: 70,
    nextComplianceDays: 7,
    loading: true,
  })

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true }))
    const [{ stage, streak, complianceRate }, jellyBalance] = await Promise.all([
      checkAndAdvanceStage(),
      getJellyBalance(),
    ])
    const next = GROWTH_CONDITIONS[stage]
    setState({
      stage,
      stageLabel: STAGE_LABEL[stage],
      streak,
      complianceRate,
      jellyBalance,
      nextStreakTarget: next?.streakDays ?? null,
      nextComplianceTarget: next?.complianceMin ?? null,
      nextComplianceDays: next?.complianceDays ?? null,
      loading: false,
    })
  }, [])

  useEffect(() => { load() }, [load])

  return { ...state, refresh: load }
}
```

- [ ] **Step 2: TypeScript 타입 체크**

```bash
cd /c/timepill_final && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
cd /c/timepill_final
git add src/frontend/hooks/useDaycare.ts
git commit -m "feat: add useDaycare hook with jelly balance"
```

---

### Task 9: Frontend Component — DaycareView.tsx (레이어 구조)

**Files:**
- Create: `src/frontend/components/DaycareView.tsx`

레이어 구조: 배경(background) → 캐릭터 → 소품(accessory). 배경/소품은 optional이며 현재는 null로 전달한다. 향후 상점 아이템이 생기면 해당 prop만 채우면 된다.

- [ ] **Step 1: DaycareView.tsx 생성**

```typescript
// src/frontend/components/DaycareView.tsx
import React from 'react'
import {
  View, Text, Image, StyleSheet,
  ActivityIndicator, ImageSourcePropType,
} from 'react-native'
import type { DaycareStage } from '@shared/constants/daycareConfig'
import type { DaycareState } from '@frontend/hooks/useDaycare'

const STAGE_IMAGES: Record<DaycareStage, ReturnType<typeof require>> = {
  egg:   require('../../../assets/daycare/egg.png'),
  baby:  require('../../../assets/daycare/baby.png'),
  child: require('../../../assets/daycare/child.png'),
  adult: require('../../../assets/daycare/adult.png'),
}

type Props = Pick<DaycareState,
  | 'stage' | 'stageLabel' | 'streak' | 'complianceRate' | 'jellyBalance'
  | 'nextStreakTarget' | 'nextComplianceTarget' | 'nextComplianceDays' | 'loading'
> & {
  background?: ImageSourcePropType | null
  accessory?: ImageSourcePropType | null
}

export function DaycareView({
  stage,
  stageLabel,
  streak,
  complianceRate,
  jellyBalance,
  nextStreakTarget,
  nextComplianceTarget,
  nextComplianceDays,
  loading,
  background = null,
  accessory = null,
}: Props) {
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4A90D9" />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* Layer 1: 배경 */}
      {background && (
        <Image source={background} style={StyleSheet.absoluteFill} resizeMode="cover" />
      )}

      <Text style={styles.stageLabel}>{stageLabel}</Text>

      {/* Layer 2: 캐릭터 */}
      <View style={styles.characterWrapper}>
        <Image
          source={STAGE_IMAGES[stage]}
          style={styles.character}
          resizeMode="contain"
        />
        {/* Layer 3: 소품 */}
        {accessory && (
          <Image source={accessory} style={styles.accessory} resizeMode="contain" />
        )}
      </View>

      {/* 젤리 잔액 */}
      <View style={styles.jellyRow}>
        <Text style={styles.jellyText}>🍬 {jellyBalance}</Text>
      </View>

      {/* 성장 수치 */}
      <View style={styles.statsBox}>
        <StatRow label="연속 복용" value={`${streak}일`} />
        <StatRow label="복용률" value={`${complianceRate}%`} />
      </View>

      {/* 다음 성장 목표 */}
      {nextStreakTarget !== null && (
        <View style={styles.nextBox}>
          <Text style={styles.nextTitle}>다음 성장까지</Text>
          <Text style={styles.nextItem}>
            연속 복용 {streak} / {nextStreakTarget}일
          </Text>
          <Text style={styles.nextItem}>
            최근 {nextComplianceDays}일 복용률 {complianceRate}% / {nextComplianceTarget}%
          </Text>
        </View>
      )}

      {nextStreakTarget === null && (
        <Text style={styles.maxStage}>최고 단계 달성!</Text>
      )}
    </View>
  )
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 40,
    backgroundColor: '#BDD9EF',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#BDD9EF',
  },
  stageLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C4A6B',
    marginBottom: 16,
  },
  characterWrapper: {
    width: 220,
    height: 220,
    marginBottom: 16,
  },
  character: {
    width: '100%',
    height: '100%',
  },
  accessory: {
    ...StyleSheet.absoluteFillObject,
  },
  jellyRow: {
    marginBottom: 16,
  },
  jellyText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2C4A6B',
  },
  statsBox: {
    width: '80%',
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    gap: 8,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statLabel: {
    fontSize: 15,
    color: '#2C4A6B',
  },
  statValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2C4A6B',
  },
  nextBox: {
    width: '80%',
    backgroundColor: 'rgba(255,255,255,0.4)',
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  nextTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4A7A9B',
    marginBottom: 4,
  },
  nextItem: {
    fontSize: 13,
    color: '#4A7A9B',
  },
  maxStage: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2C4A6B',
    marginTop: 8,
  },
})
```

- [ ] **Step 2: TypeScript 타입 체크**

```bash
cd /c/timepill_final && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Commit**

```bash
cd /c/timepill_final
git add src/frontend/components/DaycareView.tsx
git commit -m "feat: add layered DaycareView component with jelly display"
```

---

### Task 10: 탭 화면 + 레이아웃 추가

**Files:**
- Create: `app/(tabs)/daycare.tsx`
- Modify: `app/(tabs)/_layout.tsx`

- [ ] **Step 1: daycare.tsx 생성**

```typescript
// app/(tabs)/daycare.tsx
import React from 'react'
import { SafeAreaView, StyleSheet } from 'react-native'
import { useDaycare } from '@frontend/hooks/useDaycare'
import { DaycareView } from '@frontend/components/DaycareView'

export default function DaycareScreen() {
  const daycare = useDaycare()
  return (
    <SafeAreaView style={styles.safe}>
      <DaycareView {...daycare} />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#BDD9EF',
  },
})
```

- [ ] **Step 2: _layout.tsx에 데이 탭 추가**

`app/(tabs)/_layout.tsx` 전체를 아래로 교체:

```typescript
import { Alert } from 'react-native'
import { Tabs } from 'expo-router'
import { isRegisterDirty, setRegisterDirty, scheduleRegisterReset } from '@shared/utils/registerGuard'

type TabNav = { navigate: (name: string) => void }

function guardedTabListeners(screenName: string) {
  return ({ navigation }: { navigation: TabNav }) => ({
    tabPress: (e: { preventDefault: () => void }) => {
      if (!isRegisterDirty()) return
      e.preventDefault()
      Alert.alert('저장하지 않고 나가시겠습니까?', '', [
        { text: '취소', style: 'cancel' },
        {
          text: '나가기',
          style: 'destructive',
          onPress: () => {
            scheduleRegisterReset()
            setRegisterDirty(false)
            navigation.navigate(screenName)
          },
        },
      ])
    },
  })
}

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen
        name="index"
        options={{ title: '홈' }}
        listeners={guardedTabListeners('index')}
      />
      <Tabs.Screen
        name="register"
        options={{ title: '등록' }}
      />
      <Tabs.Screen
        name="history"
        options={{ title: '기록' }}
        listeners={guardedTabListeners('history')}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: '설정' }}
        listeners={guardedTabListeners('settings')}
      />
      <Tabs.Screen
        name="daycare"
        options={{ title: '데이' }}
        listeners={guardedTabListeners('daycare')}
      />
    </Tabs>
  )
}
```

- [ ] **Step 3: TypeScript 타입 체크**

```bash
cd /c/timepill_final && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
cd /c/timepill_final
git add app/(tabs)/daycare.tsx app/(tabs)/_layout.tsx
git commit -m "feat: add 데이키우기 tab screen and register to layout"
```
