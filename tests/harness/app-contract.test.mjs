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
  const homeScreen = readProjectFile('src/screens/tabs/HomeTabScreen.tsx')
  assert.match(designHarness, /DESIGN:/)
  assert.match(designHarness, /pageBackground/)
  assert.match(designHarness, /scanButtonSize/)
  assert.match(readProjectFile('src/components/ui/ProductUI.tsx'), /background: '#FAFAF8'/)

  const keyFiles = [
    'app/check-item.tsx',
    'app/scan.tsx',
    'src/components/TimeslotRow.tsx',
    'src/components/FreezePopup.tsx',
    'src/components/FreezeAcquiredPopup.tsx',
    'src/components/ScanLoadingOverlay.tsx',
  ]

  assert.match(homeScreen, /AppToast|JellyBalanceChip|StatusMascot/)

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
  const home = readProjectFile('src/screens/tabs/HomeTabScreen.tsx')
  const shop = readProjectFile('src/screens/tabs/ShopTabScreen.tsx')
  const componentFiles = [
    'src/components/shop/CraneGame.tsx',
    'src/components/shop/CraneMachine2_5D.tsx',
    'src/components/shop/CraneClawSprite.tsx',
    'src/components/shop/PrizeObjectView.tsx',
    'src/components/shop/RewardSpriteView.tsx',
    'src/components/shop/prizeObjectModel.ts',
    'src/components/shop/CraneResultModal.tsx',
    'src/components/shop/craneAssetManifest.generated.ts',
    'src/hooks/useCraneGameMachine.ts',
  ]

  for (const relativePath of componentFiles) {
    assert.equal(existsSync(path.join(projectRoot, relativePath)), true, `${relativePath} is missing`)
  }
  for (const relativePath of [
    'src/components/shop/Capsule.tsx',
    'src/components/shop/CraneMachine.tsx',
    'src/components/shop/Claw.tsx',
    'src/components/shop/Claw2_5D.tsx',
    'src/components/shop/ExitChute.tsx',
    'src/components/shop/useCraneGame.ts',
  ]) {
    assert.equal(existsSync(path.join(projectRoot, relativePath)), false, `${relativePath} should be removed`)
  }

  assert.match(home, /formatHomeDateTitle/)
  assert.match(home, /WEEKDAY_LABELS/)
  assert.doesNotMatch(home, /<Text style=\{styles\.homeTitle\}>오늘 체크<\/Text>/)
  assert.doesNotMatch(home, /homeSubtitle|<Text style=\{styles\.homeSubtitle\}>Timepill<\/Text>/)

  assert.equal(existsSync(path.join(projectRoot, 'app/(tabs)/crane.tsx')), false, 'Crane should not be a bottom tab route')
  assert.equal(existsSync(path.join(projectRoot, 'app/crane-game.tsx')), false, 'Legacy crane-game route should be removed')

  const tabLayout = readProjectFile('app/(tabs)/_layout.tsx')
  assert.match(tabLayout, /name="shop"/)
  assert.doesNotMatch(tabLayout, /name="crane"/)

  assert.doesNotMatch(shop, /<CraneGame/)
  assert.doesNotMatch(shop, /startCranePlay/)
  assert.doesNotMatch(shop, /completeCranePlay/)
  assert.doesNotMatch(shop, /playCraneGame/)
  assert.doesNotMatch(shop, /뽑는 중/)
  assert.match(shop, /openingCrane/)
  assert.match(shop, /router\.push\('\/crane'\)/)

  const gameScreen = readProjectFile('app/crane.tsx')
  assert.match(gameScreen, /<CraneGame/)
  assert.match(gameScreen, /startCranePlay/)
  assert.match(gameScreen, /completeCranePlay/)
  assert.doesNotMatch(gameScreen, /\/crane-game/)

  const hook = readProjectFile('src/hooks/useCraneGameMachine.ts')
  for (const state of ['idle', 'moving', 'dropping', 'closing', 'grabbing', 'lifting', 'carrying', 'droppingToExit', 'dispensing', 'success']) {
    assert.match(hook, new RegExp(`'${state}'`))
  }
  assert.doesNotMatch(hook, /CraneCapsule|buildCapsules|capsules|capsuleColors|movingX|movingY|autoMoving|targeting|touching|droppingIntoHole|beginDepthSelection|canLockX|canDrop|selectTargetPrizeObject|targetPrizeObjectId|runAutoMoveToTarget/)
  assert.doesNotMatch(hook, /setResult\(\{\s*status:\s*'fail'/)
  assert.match(hook, /holePrizeObjectId/)
  assert.match(hook, /outletPrizeObjectId/)
  assert.match(hook, /findReachedPrize/)
  assert.match(hook, /hasGrabContact/)
  assert.match(hook, /prizeHitboxSize/)
  assert.match(hook, /calculateGrabChance/)
  assert.match(hook, /carrySuccessChance/)
  assert.match(hook, /slipRisk/)
  assert.match(hook, /rewardGrantedRef/)
  assert.match(hook, /const MOVE_PASS_MS = \d+/)
  assert.match(hook, /EMPTY_MISS_LIFT_MS/)
  assert.match(hook, /FAILED_GRAB_NUDGE_MS/)
  assert.match(hook, /finishFailAfterSettle/)
  assert.match(hook, /attachedPrizeOffsetX/)
  assert.match(hook, /dismissResult/)
  assert.match(hook, /prizeSpacing/)
  assert.match(hook, /stopHorizontalMotion/)
  assert.match(hook, /resetHorizontalMotion/)
  assert.match(hook, /dropClaw/)
  assert.match(hook, /const LIFT_MS = \d+/)
  assert.match(hook, /const DISPENSE_MS = \d+/)
  assert.match(hook, /MACHINE_REGIONS/)
  assert.match(hook, /MACHINE_REGIONS\.rail\.xMin/)
  assert.match(hook, /MACHINE_REGIONS\.claw\.idleY/)
  assert.doesNotMatch(hook, /machineWidth \* CRANE_SCENE_LAYOUT|machineHeight \* CRANE_SCENE_LAYOUT|leftBoundRatio|rightBoundRatio/)

  const sceneLayout = readProjectFile('src/components/shop/craneSceneLayout.ts')
  assert.match(sceneLayout, /MACHINE_SOURCE_WIDTH/)
  assert.match(sceneLayout, /MACHINE_SOURCE_HEIGHT/)
  assert.match(sceneLayout, /MACHINE_REGIONS/)
  assert.match(sceneLayout, /getContainedImageRect/)
  assert.match(sceneLayout, /toScreenX/)
  assert.match(sceneLayout, /toScreenY/)
  assert.match(sceneLayout, /toScreenSize/)

  const assetManifest = readProjectFile('src/components/shop/craneAssetManifest.generated.ts')
  assert.match(assetManifest, /displayWidth/)
  assert.match(assetManifest, /displayHeight/)
  assert.match(assetManifest, /hitboxWidth/)
  assert.match(assetManifest, /hitboxHeight/)

  const model = readProjectFile('src/components/shop/prizeObjectModel.ts')
  for (const category of ['keyring', 'keycap', 'squishy', 'sticker', 'badge', 'theme']) {
    assert.match(model, new RegExp(category))
  }
  assert.match(model, /gripDifficulty/)
  assert.match(model, /slipChance/)
  assert.match(model, /assetKey/)
  assert.match(model, /hitboxWidth/)
  assert.match(model, /hitboxHeight/)
  assert.match(model, /displayWidth/)
  assert.match(model, /displayHeight/)
  assert.match(model, /resolvePrizeAssetKey/)
  assert.match(model, /CRANE_REWARD_ASSETS/)
  assert.doesNotMatch(model, /capsule/i)

  const game = readProjectFile('src/components/shop/CraneGame.tsx')
  assert.match(game, /const CRANE_COPY =/)
  assert.match(game, /function stateLabel/)
  assert.match(game, /function buttonLabel/)
  assert.match(game, /copy\.drop/)
  assert.match(game, /copy\.resolving/)
  assert.doesNotMatch(game, /정지/)

  const machine = readProjectFile('src/components/shop/CraneMachine2_5D.tsx')
  assert.match(machine, /CRANE_MACHINE_ASSETS\.base/)
  assert.match(machine, /resizeMode="contain"/)
  assert.match(machine, /CraneClawSprite/)
  assert.match(machine, /RewardSpriteView/)
  assert.match(machine, /getContainedImageRect/)
  assert.match(machine, /toScreenObject/)
  assert.match(machine, /toScreenX/)
  assert.match(machine, /toScreenY/)
  assert.match(machine, /toScreenSize/)
  assert.match(machine, /imageRect\.scale/)
  assert.match(machine, /holePrizeObjectId/)
  assert.match(machine, /outletPrizeObjectId/)
  assert.doesNotMatch(machine, /machineBackdrop|backWall|innerWall|railDeck|railDeckShadow|track|trackInset|trackCap|sideWall|floorPlane|floorInnerShadow|floorGlow|floorSheen|frontLip|ExitChute|PrizeOutlet|Claw2_5D/)

  const clawSprite = readProjectFile('src/components/shop/CraneClawSprite.tsx')
  assert.match(clawSprite, /CARRIAGE_LOGICAL_WIDTH/)
  assert.match(clawSprite, /CLAW_BODY_LOGICAL_WIDTH/)
  assert.match(clawSprite, /ROPE_LOGICAL_WIDTH/)
  assert.match(clawSprite, /sourceScale/)
  assert.match(clawSprite, /sway/)
  assert.doesNotMatch(clawSprite, /CRANE_MACHINE_ASSETS|claw_carriage|claw_head/)

  const prizeObjectView = readProjectFile('src/components/shop/PrizeObjectView.tsx')
  assert.match(prizeObjectView, /RewardSpriteView/)
  assert.doesNotMatch(prizeObjectView, /<Text|emoji|shape/)

  const rewardSprite = readProjectFile('src/components/shop/RewardSpriteView.tsx')
  assert.match(rewardSprite, /CRANE_REWARD_ASSETS\[object\.assetKey\]/)
  assert.match(rewardSprite, /<Image/)
  assert.match(rewardSprite, /resizeMode="contain"/)
  assert.match(rewardSprite, /trimWidth/)
  assert.match(rewardSprite, /trimHeight/)
  assert.doesNotMatch(rewardSprite, /<Text/)

  const resultModal = readProjectFile('src/components/shop/CraneResultModal.tsx')
  assert.doesNotMatch(resultModal, /아쉽게|Almost got|failCopy|status === 'fail'/)

  const history = readProjectFile('src/screens/tabs/RecordsTabScreen.tsx')
  assert.match(history, /stateLogs/)
  assert.match(history, /dayMoodMarker/)
  assert.match(history, /useCalendarHub/)
  assert.match(history, /isQuickPanelOpen/)
  assert.match(history, /quickDraft/)
  assert.match(history, /StatusMascot/)

  const stateSheet = readProjectFile('src/components/StateCheckInSheet.tsx')
  assert.match(stateSheet, /STATE_TAG_OPTIONS/)
  for (const tag of ['평소와 같음', '안정됨', '집중 잘됨', '피곤', '불안', '졸림', 'Refreshed', 'Calm', 'Focused']) {
    assert.match(stateSheet, new RegExp(tag))
  }

  const customEmojiRepository = readProjectFile('src/domain/stateLog/customMoodEmojiRepository.ts')
  assert.match(customEmojiRepository, /timepill_custom_mood_emojis/)
  assert.match(customEmojiRepository, /extractEmoji/)
  assert.match(customEmojiRepository, /MAX_CUSTOM_MOOD_EMOJIS = 8/)

  const repository = readProjectFile('src/domain/reward/repository.ts')
  assert.match(repository, /export async function startCranePlay/)
  assert.match(repository, /export async function completeCranePlay/)
})
