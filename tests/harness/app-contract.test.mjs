import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

function readProjectFile(relativePath) {
  return readFileSync(path.join(projectRoot, relativePath), 'utf8')
}

test('runtime scripts always execute the harness first', () => {
  const pkg = JSON.parse(readProjectFile('package.json'))

  assert.equal(pkg.scripts.prestart, 'npm run harness')
  assert.equal(pkg.scripts.preandroid, 'npm run harness')
  assert.equal(pkg.scripts.preios, 'npm run harness')
  assert.equal(pkg.scripts.preweb, 'npm run harness')
  assert.equal(pkg.scripts.harness, 'node scripts/harness/run-harness.mjs')
  assert.equal(pkg.scripts['test:harness'], 'node --test tests/harness/app-contract.test.mjs')
})

test('native unmatched-route safety files exist', () => {
  assert.equal(existsSync(path.join(projectRoot, 'app/+native-intent.tsx')), true)
  assert.equal(existsSync(path.join(projectRoot, 'app/+not-found.tsx')), true)
})

test('native intent rewrite protects the dev-client bootstrap path', () => {
  const nativeIntent = readProjectFile('app/+native-intent.tsx')

  assert.match(nativeIntent, /expo-development-client/)
  assert.match(nativeIntent, /return '\//)
})

test('expo-go guard exists for TFLite runtime and background fetch bootstrap', () => {
  const tfliteRuntime = readProjectFile('src/domain/scan/tfliteRuntime.ts')
  const mobilenetEmbedder = readProjectFile('src/domain/scan/mobilenetEmbedder.ts')
  const yoloDetector = readProjectFile('src/domain/scan/yoloPillDetector.ts')
  const alarmScheduler = readProjectFile('src/domain/alarm/alarmScheduler.ts')
  const rootLayout = readProjectFile('app/_layout.tsx')
  const nativeRootLayout = readProjectFile('src/components/NativeRootLayout.tsx')
  const appConfig = JSON.parse(readProjectFile('app.json'))

  assert.match(tfliteRuntime, /isRunningInExpoGo/)
  assert.match(tfliteRuntime, /react-native-fast-tflite/)
  assert.doesNotMatch(mobilenetEmbedder, /from 'react-native-fast-tflite'/)
  assert.doesNotMatch(yoloDetector, /from 'react-native-fast-tflite'/)
  assert.match(alarmScheduler, /canUseBackgroundAlarmRefresh/)
  assert.match(alarmScheduler, /isRunningInExpoGo\(\)/)
  assert.match(rootLayout, /isRunningInExpoGo\(\)/)
  assert.doesNotMatch(rootLayout, /from 'drizzle-orm\/expo-sqlite\/migrator'/)
  assert.match(nativeRootLayout, /useDatabaseMigrations/)
  assert.match(readProjectFile('src/db/migrate.ts'), /runDatabaseMigrations/)
  assert.deepEqual(appConfig.expo.ios.infoPlist.UIBackgroundModes, ['fetch'])
})

test('design harness is documented and imported by key visual surfaces', () => {
  const designHarness = readProjectFile('src/design/designHarness.ts')
  assert.match(designHarness, /DESIGN:/)
  assert.match(designHarness, /pageBackground/)
  assert.match(designHarness, /scanButtonSize/)
  assert.match(readProjectFile('src/components/ui/ProductUI.tsx'), /background: '#FAFAF8'/)

  const keyFiles = [
    'app/(tabs)/index.tsx',
    'app/check-item.tsx',
    'app/scan.tsx',
    'src/components/TimeslotRow.tsx',
    'src/components/FreezePopup.tsx',
    'src/components/FreezeAcquiredPopup.tsx',
    'src/components/ScanLoadingOverlay.tsx',
  ]

  for (const relativePath of keyFiles) {
    const file = readProjectFile(relativePath)
    assert.match(file, /designHarness|ProductUI|ui\.color/)
  }
})

function findForbiddenKoreanHeaders(source) {
  const forbiddenHeaders = [
    'REAL NAME',
    'TIME',
    'ALERT COPY',
    'PRIVACY',
    'REMINDER',
    'SUMMARY',
    'ADVANCED SCHEDULE',
    'ITEM SETTINGS',
    'Light',
    'Standard',
    'Strict',
  ]

  return forbiddenHeaders.filter((header) => {
    const escaped = header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp("[\"'`]" + escaped + "[\"'`]").test(source)
  })
}

test('active Korean-facing surfaces avoid legacy English section headers', () => {
  const files = [
    'app/check-item.tsx',
    'app/(tabs)/index.tsx',
    'app/(tabs)/settings.tsx',
  ]

  for (const relativePath of files) {
    const source = readProjectFile(relativePath)
    assert.deepEqual(findForbiddenKoreanHeaders(source), [], `${relativePath} still contains legacy English headers`)
  }
})

test('crane shop uses interactive game contract', () => {
  const componentFiles = [
    'src/components/shop/CraneGame.tsx',
    'src/components/shop/CraneMachine.tsx',
    'src/components/shop/Claw.tsx',
    'src/components/shop/Capsule.tsx',
    'src/components/shop/CraneResultModal.tsx',
    'src/components/shop/useCraneGame.ts',
  ]

  for (const relativePath of componentFiles) {
    assert.equal(existsSync(path.join(projectRoot, relativePath)), true, `${relativePath} is missing`)
  }

  const shop = readProjectFile('app/(tabs)/crane.tsx')
  assert.match(shop, /<CraneGame/)
  assert.match(shop, /startCranePlay/)
  assert.match(shop, /completeCranePlay/)
  assert.doesNotMatch(shop, /playCraneGame/)
  assert.doesNotMatch(shop, /뽑기|뽑는 중/)

  const hook = readProjectFile('src/components/shop/useCraneGame.ts')
  for (const state of ['idle', 'moving', 'dropping', 'grabbing', 'lifting', 'carrying', 'droppingToGoal', 'success', 'fail']) {
    assert.match(hook, new RegExp(`'${state}'`))
  }
  assert.match(hook, /CLAW_GRAB_WIDTH/)
  assert.match(hook, /carryDropChance/)

  const repository = readProjectFile('src/domain/reward/repository.ts')
  assert.match(repository, /export async function startCranePlay/)
  assert.match(repository, /export async function completeCranePlay/)
})
