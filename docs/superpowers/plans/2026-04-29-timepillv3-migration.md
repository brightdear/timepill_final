# timepillv3 → timepill_final Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** timepillv3의 모든 소스를 timepill_final의 3인 협업 폴더 구조(`backend/`, `frontend/`, `scan/`, `shared/`)로 이전하고, import 경로를 도메인별 alias로 전면 교체한다.

**Architecture:** `@/` 단일 alias를 `@backend/`, `@frontend/`, `@scan/`, `@shared/` 4개로 분리한다. 파일을 새 폴더로 복사한 뒤, TypeScript paths + Metro resolver가 이를 인식하도록 tsconfig.json을 교체한다. import 경로는 sed로 일괄 치환한다.

**Tech Stack:** Expo SDK 54, React Native 0.81, Expo Router 6, Drizzle ORM (SQLite), TypeScript 5.9, react-native-fast-tflite

---

## 파일 매핑표

| 원본 (timepillv3) | 대상 (timepill_final) |
|---|---|
| `src/db/` | `src/backend/db/` |
| `src/domain/alarm/` | `src/backend/alarm/` |
| `src/domain/doseRecord/` | `src/backend/doseRecord/` |
| `src/domain/escapeRecord/` | `src/backend/escapeRecord/` |
| `src/domain/medication/` | `src/backend/medication/` |
| `src/domain/referenceImage/` | `src/backend/referenceImage/` |
| `src/domain/settings/` | `src/backend/settings/` |
| `src/domain/streak/` | `src/backend/streak/` |
| `src/domain/timeslot/` | `src/backend/timeslot/` |
| `src/components/` | `src/frontend/components/` |
| `src/hooks/` | `src/frontend/hooks/` |
| `src/domain/scan/` | `src/scan/` |
| `src/constants/` | `src/shared/constants/` |
| `src/utils/` | `src/shared/utils/` |
| `app/` | `app/` |
| `assets/` | `assets/` |

## Import alias 치환표

| 기존 `@/...` | 새 alias |
|---|---|
| `@/db/` | `@backend/db/` |
| `@/domain/alarm/` | `@backend/alarm/` |
| `@/domain/doseRecord/` | `@backend/doseRecord/` |
| `@/domain/escapeRecord/` | `@backend/escapeRecord/` |
| `@/domain/medication/` | `@backend/medication/` |
| `@/domain/referenceImage/` | `@backend/referenceImage/` |
| `@/domain/settings/` | `@backend/settings/` |
| `@/domain/streak/` | `@backend/streak/` |
| `@/domain/timeslot/` | `@backend/timeslot/` |
| `@/domain/scan/` | `@scan/` |
| `@/components/` | `@frontend/components/` |
| `@/hooks/` | `@frontend/hooks/` |
| `@/constants/` | `@shared/constants/` |
| `@/utils/` | `@shared/utils/` |

---

### Task 1: Root 설정 파일 복사

**Files:**
- Create: `package.json`
- Create: `app.json`
- Create: `eas.json`
- Create: `babel.config.js`
- Create: `metro.config.js`
- Create: `App.tsx`
- Create: `index.ts`
- Create: `.gitignore`

- [ ] **Step 1: 설정 파일들을 timepill_final 루트로 복사**

```bash
SRC=/c/timepillv3
DST=/c/timepill_final

cp "$SRC/babel.config.js"  "$DST/babel.config.js"
cp "$SRC/metro.config.js"  "$DST/metro.config.js"
cp "$SRC/App.tsx"          "$DST/App.tsx"
cp "$SRC/index.ts"         "$DST/index.ts"
cp "$SRC/eas.json"         "$DST/eas.json"
cp "$SRC/.gitignore"       "$DST/.gitignore"
```

- [ ] **Step 2: package.json 복사 후 name 변경**

```bash
cp /c/timepillv3/package.json /c/timepill_final/package.json
# name 필드를 timepill_final 로 변경
sed -i 's/"name": "timepillv3"/"name": "timepill_final"/' /c/timepill_final/package.json
```

- [ ] **Step 3: app.json 복사 후 slug/name 변경**

```bash
cp /c/timepillv3/app.json /c/timepill_final/app.json
sed -i 's/"name": "timepillv3"/"name": "timepill_final"/g' /c/timepill_final/app.json
sed -i 's/"slug": "timepillv3"/"slug": "timepill_final"/g' /c/timepill_final/app.json
sed -i 's/"scheme": "timepillv3"/"scheme": "timepill_final"/g' /c/timepill_final/app.json
sed -i 's/"package": "com.bgl0819.timepillv3"/"package": "com.bgl0819.timepillfinal"/g' /c/timepill_final/app.json
```

- [ ] **Step 4: assets 복사**

```bash
cp -r /c/timepillv3/assets/. /c/timepill_final/assets/
```

- [ ] **Step 5: 복사 확인**

```bash
ls /c/timepill_final/
# 예상 출력: App.tsx  app.json  assets/  babel.config.js  docs/  eas.json  index.ts  metro.config.js  package.json  README.md  src/  .gitignore
```

- [ ] **Step 6: Commit**

```bash
cd /c/timepill_final
git add package.json app.json eas.json babel.config.js metro.config.js App.tsx index.ts .gitignore assets/
git commit -m "chore: copy root config and assets from timepillv3"
```

---

### Task 2: backend 파일 복사

**Files:**
- Create: `src/backend/db/client.ts`
- Create: `src/backend/db/schema.ts`
- Create: `src/backend/db/migrations/` (전체)
- Create: `src/backend/alarm/alarmScheduler.ts`
- Create: `src/backend/alarm/forceAlarmScheduler.ts`
- Create: `src/backend/doseRecord/repository.ts`
- Create: `src/backend/escapeRecord/repository.ts`
- Create: `src/backend/medication/repository.ts`
- Create: `src/backend/referenceImage/repository.ts`
- Create: `src/backend/settings/repository.ts`
- Create: `src/backend/streak/repository.ts`
- Create: `src/backend/timeslot/repository.ts`

- [ ] **Step 1: 디렉토리 생성 및 DB 파일 복사**

```bash
SRC=/c/timepillv3/src
DST=/c/timepill_final/src/backend

mkdir -p "$DST/db"
cp "$SRC/db/client.ts"  "$DST/db/client.ts"
cp "$SRC/db/schema.ts"  "$DST/db/schema.ts"
cp -r "$SRC/db/migrations" "$DST/db/migrations"
```

- [ ] **Step 2: domain 파일들 복사**

```bash
SRC=/c/timepillv3/src
DST=/c/timepill_final/src/backend

for domain in alarm doseRecord escapeRecord medication referenceImage settings streak timeslot; do
  mkdir -p "$DST/$domain"
  cp -r "$SRC/domain/$domain/." "$DST/$domain/"
done
```

- [ ] **Step 3: 복사 확인**

```bash
find /c/timepill_final/src/backend -type f | sort
# 예상: client.ts, schema.ts, migrations/*, alarm/*.ts, doseRecord/*.ts, ...
```

- [ ] **Step 4: Commit**

```bash
cd /c/timepill_final
git add src/backend/
git commit -m "chore: copy backend files (db + domain repositories)"
```

---

### Task 3: scan 파일 복사

**Files:**
- Create: `src/scan/mobilenetEmbedder.ts`
- Create: `src/scan/runScanInference.ts`
- Create: `src/scan/scanInferenceBridge.ts`
- Create: `src/scan/yoloPillDetector.ts`

- [ ] **Step 1: scan 파일 복사**

```bash
SRC=/c/timepillv3/src/domain/scan
DST=/c/timepill_final/src/scan

mkdir -p "$DST"
cp "$SRC/mobilenetEmbedder.ts"   "$DST/mobilenetEmbedder.ts"
cp "$SRC/runScanInference.ts"    "$DST/runScanInference.ts"
cp "$SRC/scanInferenceBridge.ts" "$DST/scanInferenceBridge.ts"
cp "$SRC/yoloPillDetector.ts"    "$DST/yoloPillDetector.ts"
```

- [ ] **Step 2: 복사 확인**

```bash
ls /c/timepill_final/src/scan/
# 예상: mobilenetEmbedder.ts  runScanInference.ts  scanInferenceBridge.ts  yoloPillDetector.ts
```

- [ ] **Step 3: Commit**

```bash
cd /c/timepill_final
git add src/scan/
git commit -m "chore: copy scan inference files"
```

---

### Task 4: frontend 파일 복사

**Files:**
- Create: `src/frontend/components/*.tsx` (8개)
- Create: `src/frontend/hooks/*.ts` (8개)

- [ ] **Step 1: frontend 파일 복사**

```bash
SRC=/c/timepillv3/src
DST=/c/timepill_final/src/frontend

mkdir -p "$DST/components" "$DST/hooks"
cp -r "$SRC/components/." "$DST/components/"
cp -r "$SRC/hooks/."      "$DST/hooks/"
```

- [ ] **Step 2: 복사 확인**

```bash
ls /c/timepill_final/src/frontend/components/
# 예상: CalendarView.tsx CyclePicker.tsx FreezeAcquiredPopup.tsx FreezePopup.tsx ScanLoadingOverlay.tsx TimePickerModal.tsx TimeslotRow.tsx WheelColumn.tsx

ls /c/timepill_final/src/frontend/hooks/
# 예상: useAppInit.ts useFreezeEligibility.ts useI18n.ts useMonthlyRecords.ts useNotificationHandler.ts useSettings.ts useStreakUpdate.ts useTodayTimeslots.ts
```

- [ ] **Step 3: Commit**

```bash
cd /c/timepill_final
git add src/frontend/
git commit -m "chore: copy frontend components and hooks"
```

---

### Task 5: shared 파일 복사

**Files:**
- Create: `src/shared/constants/alarmConfig.ts`
- Create: `src/shared/constants/medicationColors.ts`
- Create: `src/shared/constants/scanConfig.ts`
- Create: `src/shared/constants/translations.ts`
- Create: `src/shared/utils/cycleUtils.ts`
- Create: `src/shared/utils/dateUtils.ts`
- Create: `src/shared/utils/displayName.ts`
- Create: `src/shared/utils/forceAlarmBus.ts`
- Create: `src/shared/utils/imageUtils.ts`
- Create: `src/shared/utils/registerGuard.ts`
- Create: `src/shared/utils/safeJson.ts`
- Create: `src/shared/utils/similarity.ts`
- Create: `src/shared/utils/timeUtils.ts`

- [ ] **Step 1: shared 파일 복사**

```bash
SRC=/c/timepillv3/src
DST=/c/timepill_final/src/shared

mkdir -p "$DST/constants" "$DST/utils"
cp -r "$SRC/constants/." "$DST/constants/"
cp -r "$SRC/utils/."     "$DST/utils/"
```

- [ ] **Step 2: 복사 확인**

```bash
ls /c/timepill_final/src/shared/constants/
ls /c/timepill_final/src/shared/utils/
```

- [ ] **Step 3: Commit**

```bash
cd /c/timepill_final
git add src/shared/
git commit -m "chore: copy shared constants and utils"
```

---

### Task 6: app 화면 복사

**Files:**
- Create: `app/_layout.tsx`
- Create: `app/(tabs)/_layout.tsx`
- Create: `app/(tabs)/index.tsx`
- Create: `app/(tabs)/history.tsx`
- Create: `app/(tabs)/register.tsx`
- Create: `app/(tabs)/settings.tsx`
- Create: `app/alarm.tsx`
- Create: `app/force-alarm.tsx`
- Create: `app/scan.tsx`

- [ ] **Step 1: app 폴더 복사**

```bash
cp -r /c/timepillv3/app/. /c/timepill_final/app/
```

- [ ] **Step 2: 복사 확인**

```bash
find /c/timepill_final/app -type f | sort
# 예상: app/_layout.tsx  app/(tabs)/_layout.tsx  app/(tabs)/index.tsx  ...
```

- [ ] **Step 3: Commit**

```bash
cd /c/timepill_final
git add app/
git commit -m "chore: copy app screens (Expo Router)"
```

---

### Task 7: tsconfig.json 교체

**Files:**
- Modify: `tsconfig.json`

- [ ] **Step 1: 새 tsconfig.json 작성**

```bash
cat > /c/timepill_final/tsconfig.json << 'EOF'
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "baseUrl": ".",
    "paths": {
      "@backend/*": ["src/backend/*"],
      "@frontend/*": ["src/frontend/*"],
      "@scan/*": ["src/scan/*"],
      "@shared/*": ["src/shared/*"]
    }
  }
}
EOF
```

- [ ] **Step 2: drizzle.config.ts 업데이트**

```bash
cat > /c/timepill_final/drizzle.config.ts << 'EOF'
import type { Config } from 'drizzle-kit'

export default {
  schema: './src/backend/db/schema.ts',
  out: './src/backend/db/migrations',
  dialect: 'sqlite',
  driver: 'expo',
} satisfies Config
EOF
```

- [ ] **Step 3: Commit**

```bash
cd /c/timepill_final
git add tsconfig.json drizzle.config.ts
git commit -m "chore: configure path aliases for 3-way team split"
```

---

### Task 8: import 경로 일괄 치환

모든 `.ts` / `.tsx` 파일에서 `@/` prefix를 도메인별 alias로 치환한다.

**Files:**
- Modify: `src/backend/**/*.ts`
- Modify: `src/frontend/**/*.ts` / `.tsx`
- Modify: `src/scan/**/*.ts`
- Modify: `app/**/*.tsx`

- [ ] **Step 1: db → @backend/db**

```bash
find /c/timepill_final/src /c/timepill_final/app -type f \( -name "*.ts" -o -name "*.tsx" \) \
  -exec sed -i "s|from '@/db/|from '@backend/db/|g" {} +
```

- [ ] **Step 2: domain/alarm → @backend/alarm**

```bash
find /c/timepill_final/src /c/timepill_final/app -type f \( -name "*.ts" -o -name "*.tsx" \) \
  -exec sed -i "s|from '@/domain/alarm/|from '@backend/alarm/|g" {} +
```

- [ ] **Step 3: domain/doseRecord → @backend/doseRecord**

```bash
find /c/timepill_final/src /c/timepill_final/app -type f \( -name "*.ts" -o -name "*.tsx" \) \
  -exec sed -i "s|from '@/domain/doseRecord/|from '@backend/doseRecord/|g" {} +
```

- [ ] **Step 4: domain/escapeRecord → @backend/escapeRecord**

```bash
find /c/timepill_final/src /c/timepill_final/app -type f \( -name "*.ts" -o -name "*.tsx" \) \
  -exec sed -i "s|from '@/domain/escapeRecord/|from '@backend/escapeRecord/|g" {} +
```

- [ ] **Step 5: domain/medication → @backend/medication**

```bash
find /c/timepill_final/src /c/timepill_final/app -type f \( -name "*.ts" -o -name "*.tsx" \) \
  -exec sed -i "s|from '@/domain/medication/|from '@backend/medication/|g" {} +
```

- [ ] **Step 6: domain/referenceImage → @backend/referenceImage**

```bash
find /c/timepill_final/src /c/timepill_final/app -type f \( -name "*.ts" -o -name "*.tsx" \) \
  -exec sed -i "s|from '@/domain/referenceImage/|from '@backend/referenceImage/|g" {} +
```

- [ ] **Step 7: domain/settings → @backend/settings**

```bash
find /c/timepill_final/src /c/timepill_final/app -type f \( -name "*.ts" -o -name "*.tsx" \) \
  -exec sed -i "s|from '@/domain/settings/|from '@backend/settings/|g" {} +
```

- [ ] **Step 8: domain/streak → @backend/streak**

```bash
find /c/timepill_final/src /c/timepill_final/app -type f \( -name "*.ts" -o -name "*.tsx" \) \
  -exec sed -i "s|from '@/domain/streak/|from '@backend/streak/|g" {} +
```

- [ ] **Step 9: domain/timeslot → @backend/timeslot**

```bash
find /c/timepill_final/src /c/timepill_final/app -type f \( -name "*.ts" -o -name "*.tsx" \) \
  -exec sed -i "s|from '@/domain/timeslot/|from '@backend/timeslot/|g" {} +
```

- [ ] **Step 10: domain/scan → @scan**

```bash
find /c/timepill_final/src /c/timepill_final/app -type f \( -name "*.ts" -o -name "*.tsx" \) \
  -exec sed -i "s|from '@/domain/scan/|from '@scan/|g" {} +
```

- [ ] **Step 11: components → @frontend/components**

```bash
find /c/timepill_final/src /c/timepill_final/app -type f \( -name "*.ts" -o -name "*.tsx" \) \
  -exec sed -i "s|from '@/components/|from '@frontend/components/|g" {} +
```

- [ ] **Step 12: hooks → @frontend/hooks**

```bash
find /c/timepill_final/src /c/timepill_final/app -type f \( -name "*.ts" -o -name "*.tsx" \) \
  -exec sed -i "s|from '@/hooks/|from '@frontend/hooks/|g" {} +
```

- [ ] **Step 13: constants → @shared/constants**

```bash
find /c/timepill_final/src /c/timepill_final/app -type f \( -name "*.ts" -o -name "*.tsx" \) \
  -exec sed -i "s|from '@/constants/|from '@shared/constants/|g" {} +
```

- [ ] **Step 14: utils → @shared/utils**

```bash
find /c/timepill_final/src /c/timepill_final/app -type f \( -name "*.ts" -o -name "*.tsx" \) \
  -exec sed -i "s|from '@/utils/|from '@shared/utils/|g" {} +
```

- [ ] **Step 15: 잔여 `@/` import가 없는지 확인**

```bash
grep -rn "from '@/" /c/timepill_final/src /c/timepill_final/app 2>/dev/null
# 출력이 없어야 한다
```

- [ ] **Step 16: Commit**

```bash
cd /c/timepill_final
git add src/ app/
git commit -m "refactor: replace @/ alias with @backend/@frontend/@scan/@shared"
```

---

### Task 9: npm install 및 TypeScript 검증

- [ ] **Step 1: 의존성 설치**

```bash
cd /c/timepill_final
npm install
```

- [ ] **Step 2: TypeScript 타입 체크 실행**

```bash
cd /c/timepill_final
npx tsc --noEmit 2>&1 | head -50
# 목표: 오류 0개
```

- [ ] **Step 3: 오류가 있으면 원인 분석 후 수정**

TypeScript 오류가 나올 경우:
- `Cannot find module '@backend/...'` → tsconfig.json paths 설정 확인
- `Cannot find module '@scan/...'` → src/scan/ 경로 존재 여부 확인
- 남은 `@/` prefix → grep으로 찾아 수동 치환
- relative import (`../`) 가 남아 있어도 정상 (domain 내부 파일 간 참조)

- [ ] **Step 4: 최종 Commit**

```bash
cd /c/timepill_final
git add -A
git commit -m "fix: resolve TypeScript errors after migration"
```
