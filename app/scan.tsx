import React, { useRef, useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Dimensions,
  FlatList,
  ActivityIndicator,
  Image,
  ScrollView,
} from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as MediaLibrary from 'expo-media-library'
import { writeAsStringAsync, documentDirectory } from 'expo-file-system/legacy'
import { db } from '@/db/client'
import { doseRecords, timeSlots, medications } from '@/db/schema'
import { eq } from 'drizzle-orm'
import { runBurstScanInference, type ScanResult, type ScanDebugInfo } from '@/domain/scan/runScanInference'
import { completeVerification } from '@/hooks/useStreakUpdate'
import { getSettings } from '@/domain/settings/repository'
import { ScanLoadingOverlay } from '@/components/ScanLoadingOverlay'
import { FreezeAcquiredPopup } from '@/components/FreezeAcquiredPopup'
import { getLocalDateKey } from '@/utils/dateUtils'
import { SCAN_CONFIG } from '@/constants/scanConfig'
import { isVerifiable } from '@/hooks/useTodayTimeslots'
import { designHarness } from '@/design/designHarness'

type FlashMode = 'off' | 'on' | 'auto'

interface VerifiableItem {
  slotId: string
  medicationId: string
  doseRecordId: string
  medName: string
  doseCount: number
  color: string
  reminderMode: 'off' | 'notify' | 'scan'
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window')
const STAGE_SIZE = SCREEN_W                                          // 정사각형 카메라 스테이지
const GUIDE_SIZE = Math.floor(STAGE_SIZE * SCAN_CONFIG.CROP_RATIO)  // 가이드 = 스테이지의 75%
const STAGE_TOP  = Math.max(0, Math.round((SCREEN_H - STAGE_SIZE) * designHarness.scan.stageTopRatio))
const DEV_IMG_H = designHarness.scan.devPreviewHeight

export default function ScanScreen() {
  const { slotId: forcedSlotId, test } = useLocalSearchParams<{ slotId?: string; test?: string }>()
  const router = useRouter()
  const cameraRef = useRef<CameraView>(null)
  const [permission, requestPermission] = useCameraPermissions()
  const [flash, setFlash] = useState<FlashMode>('off')
  const [scanning, setScanning] = useState(false)
  const [items, setItems] = useState<VerifiableItem[]>([])
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null)
  const [freezePopup, setFreezePopup] = useState<{ visible: boolean; streak: number }>({
    visible: false,
    streak: 0,
  })
  const [devMode, setDevMode] = useState(false)
  const [highDoseWarning, setHighDoseWarning] = useState(false)
  const [devFeedback, setDevFeedback] = useState<{
    photoUri: string
    result: ScanResult
    item: VerifiableItem | null
    testOnly?: boolean
  } | null>(null)
  const [devDebugInfo, setDevDebugInfo] = useState<ScanDebugInfo | null>(null)
  const [devSaving, setDevSaving] = useState(false)
  const scanningRef = useRef(false)
  const requestedScanTest = test === '1' || test === 'true'

  const loadVerifiableItems = useCallback(async (): Promise<VerifiableItem[]> => {
    const todayKey = getLocalDateKey()
    const [allSlots, todayRecords, allMedications] = await Promise.all([
      db.select().from(timeSlots),
      db.select().from(doseRecords).where(eq(doseRecords.dayKey, todayKey)),
      db.select().from(medications),
    ])
    const todayRecordMap = new Map(
      todayRecords
        .map(record => [record.reminderTimeId ?? record.timeSlotId ?? '', record]),
    )
    const medicationMap = new Map(allMedications.map(medication => [medication.id, medication]))
    const results: VerifiableItem[] = []
    let hasHighDoseWarning = false

    for (const slot of allSlots) {
      if (forcedSlotId && slot.id !== forcedSlotId) continue
      if (slot.isActive === 0) continue

      const dr = todayRecordMap.get(slot.id) ?? null
      if (!isVerifiable(slot, dr ?? null)) continue

      const med = medicationMap.get(slot.medicationId)

      results.push({
        slotId: slot.id,
        medicationId: med?.id ?? '',
        doseRecordId: dr!.id,
        medName: med?.name ?? '?',
        doseCount: slot.doseCountPerIntake,
        color: med?.color ?? '#888',
        reminderMode: slot.reminderMode === 'off' || slot.reminderMode === 'scan' ? slot.reminderMode : 'notify',
      })

      if (slot.doseCountPerIntake >= SCAN_CONFIG.HIGH_DOSE_WARNING_COUNT) {
        hasHighDoseWarning = true
      }
    }

    setItems(results)
    setHighDoseWarning(hasHighDoseWarning)
    setSelectedSlotId(prev => {
      if (results.length === 0) return null
      return prev && results.some(item => item.slotId === prev) ? prev : results[0].slotId
    })
    return results
  }, [forcedSlotId])

  useEffect(() => {
    scanningRef.current = scanning
  }, [scanning])

  useEffect(() => {
    loadVerifiableItems()
    getSettings().then(s => setDevMode(s.devMode === 1))
  }, [loadVerifiableItems])

  const offerFallbackActions = useCallback((item: VerifiableItem, title: string, body: string) => {
    const canDirectComplete = item.reminderMode !== 'scan' || devMode
    const actions: Parameters<typeof Alert.alert>[2] = [
      { text: '다시 시도' },
      {
        text: '사유 선택',
        onPress: () => router.navigate(`/alarm?slotId=${item.slotId}`),
      },
    ]

    if (canDirectComplete) {
      actions.splice(1, 0, {
        text: item.reminderMode === 'scan' ? '개발자 직접 완료' : '직접 완료',
        onPress: async () => {
          await completeVerification(
            item.doseRecordId,
            item.slotId,
            'manual',
            item.reminderMode === 'scan' ? 'devManual' : undefined,
          )
          router.navigate('/(tabs)/')
        },
      })
    }

    Alert.alert(title, body, actions)
  }, [devMode, router])

  const completeScanResult = useCallback(async (result: ScanResult, item: VerifiableItem) => {
    if (result.type === 'no_pill') {
      offerFallbackActions(
        item,
        '체크 대상을 감지하지 못했어요',
        item.reminderMode === 'scan' && !devMode
          ? '가이드 안에서 다시 시도하거나 사유 선택으로 넘어가 주세요.'
          : '가이드 안에서 다시 시도하거나 직접 완료를 선택해 주세요.',
      )
      return
    }
    if (result.type === 'pill_too_small') {
      offerFallbackActions(
        item,
        '대상이 너무 작게 보여요',
        item.reminderMode === 'scan' && !devMode
          ? '더 가까이서 다시 시도하거나 사유 선택으로 넘어갈 수 있어요.'
          : '더 가까이서 다시 시도하거나 직접 완료할 수 있어요.',
      )
      return
    }
    if (result.type === 'unmatched') {
      offerFallbackActions(
        item,
        '확인에 실패했어요',
        item.reminderMode === 'scan' && !devMode
          ? '다시 스캔하거나 사유 선택으로 넘어갈 수 있어요.'
          : '다시 스캔하거나 직접 완료, 사유 선택으로 넘어갈 수 있어요.',
      )
      return
    }

    const { freezeAcquired, currentStreak } = await completeVerification(
      item.doseRecordId,
      item.slotId,
      'scan',
    )
    if (freezeAcquired) {
      setFreezePopup({ visible: true, streak: currentStreak })
    }

    const freshItems = await loadVerifiableItems()
    const remaining = freshItems.filter(i => i.slotId !== item.slotId)
    if (remaining.length === 0) {
      Alert.alert('현재 모든 알약을 인증하셨습니다!', '', [
        { text: '확인', onPress: () => router.navigate('/(tabs)/') },
      ])
    } else {
      Alert.alert(
        `${item.medName} 인증 완료!`,
        '더 인증할 약이 있습니다. 계속하시겠어요?',
        [
          { text: '예' },
          { text: '아니요', onPress: () => router.navigate('/(tabs)/') },
        ],
      )
    }
  }, [devMode, loadVerifiableItems, offerFallbackActions, router])

  const handleDevFeedback = useCallback(async (type: 'correct' | 'fp' | 'fn') => {
    if (!devFeedback) return
    const { photoUri, result, item, testOnly } = devFeedback
    setDevFeedback(null)
    setDevDebugInfo(null)

    if (type !== 'correct' && photoUri) {
      setDevSaving(true)
      try {
        const { status } = await MediaLibrary.requestPermissionsAsync()
        if (status === 'granted') {
          const folder = type === 'fp' ? 'FP' : 'FN'
          const albumName = `TimepillDev/${folder}`
          const asset = await MediaLibrary.createAssetAsync(photoUri)
          const album = await MediaLibrary.getAlbumAsync(albumName)
          if (album) {
            await MediaLibrary.addAssetsToAlbumAsync([asset], album, false)
          } else {
            await MediaLibrary.createAlbumAsync(albumName, asset, false)
          }
        }
        // Save score log alongside image
        const score = (result as { score?: number }).score ?? 0
        const log = JSON.stringify({
          feedback: type,
          resultType: result.type,
          score: Math.round(score * 1000) / 1000,
          medicationId: result.type === 'matched' ? result.medicationId : undefined,
          ts: new Date().toISOString(),
        })
        const logPath = `${documentDirectory ?? ''}timepill_dev_${Date.now()}.json`
        await writeAsStringAsync(logPath, log)
      } catch {
        // non-critical — ignore save errors
      } finally {
        setDevSaving(false)
      }
    }

    if (testOnly || !item) return
    await completeScanResult(result, item)
  }, [devFeedback, completeScanResult])

  const handleScan = async () => {
    if (!cameraRef.current || scanning) return
    const currentDevMode = (await getSettings()).devMode === 1
    const testOnly = requestedScanTest && currentDevMode
    if (currentDevMode !== devMode) setDevMode(currentDevMode)
    if (requestedScanTest && !currentDevMode) {
      Alert.alert('개발 모드가 필요합니다', '설정에서 개발 모드를 켠 뒤 스캔 테스트를 실행해 주세요.')
      return
    }

    // 스캔 직전 윈도우 유효성 재확인 — 화면을 열어둔 채 윈도우가 만료될 수 있음
    const freshItems = await loadVerifiableItems()
    const item = freshItems.find(i => i.slotId === selectedSlotId) ?? freshItems[0]
    if (!item && !testOnly) {
      Alert.alert('인증 시간이 지났습니다', '복용 인증 가능 시간이 지났습니다')
      return
    }

    setScanning(true)
    setDevFeedback(null)
    setDevDebugInfo(null)
    let bestPhotoUri: string | null = null
    try {
      const camera = cameraRef.current
      const result = await runBurstScanInference({
        takePicture: async () => {
          const photo = await camera.takePictureAsync({ base64: false })
          return photo ?? null
        },
        candidates: item ? [{ medicationId: item.medicationId, doseCount: item.doseCount }] : [],
        onBestPhotoUri: currentDevMode ? (uri) => { bestPhotoUri = uri } : undefined,
        onDebugInfo: currentDevMode ? setDevDebugInfo : undefined,
      })

      if (currentDevMode) {
        setDevFeedback({ photoUri: bestPhotoUri ?? '', result, item: item ?? null, testOnly })
        return
      }

      if (!item) return
      await completeScanResult(result, item)
    } catch (e) {
      Alert.alert('오류', e instanceof Error ? e.message : '스캔 중 오류가 발생했습니다')
    } finally {
      setScanning(false)
    }
  }

  if (!permission) {
    return <View style={s.center}><Text>권한 확인 중...</Text></View>
  }

  if (!permission.granted) {
    return (
      <View style={s.center}>
        <Text style={s.permTxt}>카메라 권한이 필요합니다</Text>
        <TouchableOpacity style={s.permBtn} onPress={requestPermission}>
          <Text style={s.permBtnTxt}>권한 허용</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={s.root}>
      {/* 정사각형 카메라 스테이지 */}
      <View style={[s.cameraStage, { width: STAGE_SIZE, height: STAGE_SIZE, top: STAGE_TOP }]}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          flash={flash}
          zoom={SCAN_CONFIG.CAMERA_ZOOM}
        />

        {/* 가이드 박스 — 스테이지 정중앙 */}
        <View
          style={[
            s.guide,
            {
              width: GUIDE_SIZE,
              height: GUIDE_SIZE,
              top: (STAGE_SIZE - GUIDE_SIZE) / 2,
              left: (STAGE_SIZE - GUIDE_SIZE) / 2,
            },
          ]}
          pointerEvents="none"
        />

      </View>

      {/* Top bar */}
      <View style={s.topBar}>
        <TouchableOpacity style={s.closeBtn} onPress={() => router.back()}>
          <Text style={s.iconTxt}>✕</Text>
        </TouchableOpacity>
        {requestedScanTest && devMode ? (
          <View style={s.devTestBadge}>
            <Text style={s.devTestBadgeText}>DEV TEST</Text>
          </View>
        ) : highDoseWarning ? (
          <Text style={s.warnTxt}>스캔 정확도가 낮아질 수 있습니다</Text>
        ) : <View style={s.topBarSpacer} />}
        <TouchableOpacity
          style={s.flashBtn}
          onPress={() =>
            setFlash(f => (f === 'off' ? 'on' : f === 'on' ? 'auto' : 'off'))
          }
        >
          <Text style={s.iconTxt}>
            {flash === 'off' ? '⚡' : flash === 'on' ? '⚡ON' : '⚡A'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Right side: medication chips */}
      <View style={s.chipList}>
        <FlatList
          data={items}
          keyExtractor={i => i.slotId}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                s.chip,
                { borderColor: item.color },
                item.slotId === selectedSlotId && { backgroundColor: item.color },
              ]}
              onPress={() => setSelectedSlotId(item.slotId)}
            >
              <Text style={[s.chipTxt, item.slotId === selectedSlotId && { color: '#fff' }]}>
                💊
              </Text>
              <Text
                style={[s.chipName, item.slotId === selectedSlotId && { color: '#fff' }]}
                numberOfLines={2}
              >
                {item.medName}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Bottom scan button */}
      <View style={s.bottomBar}>
        <TouchableOpacity style={[s.scanBtn, scanning && s.scanBtnDisabled]} onPress={handleScan} disabled={scanning}>
          <Text style={s.scanBtnTxt}>{requestedScanTest ? 'TEST' : 'SCAN'}</Text>
        </TouchableOpacity>
      </View>

      <ScanLoadingOverlay visible={scanning} />

      <FreezeAcquiredPopup
        visible={freezePopup.visible}
        currentStreak={freezePopup.streak}
        onClose={() => setFreezePopup({ visible: false, streak: 0 })}
      />

      {devFeedback && (
        <View style={s.devPanel}>
          {devDebugInfo && (
            <ScrollView style={s.devScroll} contentContainerStyle={s.devScrollContent}>
              {/* Photo with guide rect + bbox overlays */}
              <View style={s.devImgWrap}>
                <Image
                  source={{ uri: devDebugInfo.photoUri }}
                  style={s.devImg}
                  resizeMode="contain"
                />
                {(() => {
                  const dispW = SCREEN_W - 48
                  const scale = Math.min(dispW / devDebugInfo.actualW, DEV_IMG_H / devDebugInfo.actualH)
                  const offX = (dispW - devDebugInfo.actualW * scale) / 2
                  const offY = (DEV_IMG_H - devDebugInfo.actualH * scale) / 2
                  const px = (v: number) => v * scale
                  return (
                    <>
                      {/* bboxes — red */}
                      {devDebugInfo.bboxes.map((b, i) => (
                        <View key={i} style={[s.devRect, {
                          left: offX + px(b.x),
                          top: offY + px(b.y),
                          width: px(b.width),
                          height: px(b.height),
                          borderColor: '#ef4444',
                        }]} pointerEvents="none">
                          <Text style={s.devBboxConf}>{(b.confidence * 100).toFixed(0)}%</Text>
                        </View>
                      ))}
                    </>
                  )
                })()}
              </View>
              {/* Dimension info */}
              <Text style={s.devInfo}>
                {`photo: ${devDebugInfo.actualW}×${devDebugInfo.actualH}\nbbox count: ${devDebugInfo.bboxes.length}`}
              </Text>
            </ScrollView>
          )}
          <Text style={s.devPanelTitle}>{devFeedback.testOnly ? '스캔 테스트 결과' : '이 결과가 정확했나요?'}</Text>
          <Text style={s.devPanelSub}>
            {devFeedback.result.type === 'matched'
              ? `✅ 매칭됨 (score: ${(devFeedback.result.score * 100).toFixed(1)}%)`
              : devFeedback.result.type === 'no_pill'
              ? '❌ 약 없음'
              : devFeedback.result.type === 'pill_too_small'
              ? '⚠️ bbox 너무 작음'
              : `❌ 미매칭 (score: ${((devFeedback.result as { score: number }).score * 100).toFixed(1)}%)`}
          </Text>
          {devSaving ? (
            <ActivityIndicator color="#fff" style={{ marginTop: 12 }} />
          ) : (
            <View style={s.devBtns}>
              <TouchableOpacity style={[s.devBtn, s.devBtnCorrect]} onPress={() => handleDevFeedback('correct')}>
                <Text style={s.devBtnTxt}>{devFeedback.testOnly ? '닫기' : '정확함'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.devBtn, s.devBtnFP]} onPress={() => handleDevFeedback('fp')}>
                <Text style={s.devBtnTxt}>FP</Text>
                <Text style={s.devBtnSub}>없는데 감지</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.devBtn, s.devBtnFN]} onPress={() => handleDevFeedback('fn')}>
                <Text style={s.devBtnTxt}>FN</Text>
                <Text style={s.devBtnSub}>있는데 미감지</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  root: {
    // DESIGN: scan screen backdrop. Edit `designHarness.colors.black`.
    flex: 1,
    backgroundColor: designHarness.colors.black,
  },
  cameraStage: { position: 'absolute', left: 0, overflow: 'hidden', backgroundColor: designHarness.colors.black },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: designHarness.colors.black, gap: 16 },
  permTxt: { color: designHarness.colors.white, fontSize: 16 },
  permBtn: { backgroundColor: designHarness.colors.white, paddingHorizontal: 24, paddingVertical: 12, borderRadius: designHarness.radius.button },
  permBtnTxt: { fontSize: designHarness.typography.actionSize, fontWeight: '600', color: designHarness.colors.textStrong },
  guide: {
    // DESIGN: scan guide border. Edit `designHarness.scan.guideBorderColor`.
    position: 'absolute',
    borderWidth: 2,
    borderColor: designHarness.scan.guideBorderColor,
    borderRadius: designHarness.radius.input,
  },
  topBar: {
    position: 'absolute',
    top: 56,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: designHarness.radius.roundButton,
    backgroundColor: designHarness.colors.overlaySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warnTxt: {
    flex: 1,
    textAlign: 'center',
    color: designHarness.colors.warningBright,
    fontSize: designHarness.typography.captionSize,
    fontWeight: '600',
  },
  topBarSpacer: {
    flex: 1,
  },
  devTestBadge: {
    alignItems: 'center',
    backgroundColor: designHarness.colors.overlaySoft,
    borderRadius: 999,
    flex: 1,
    justifyContent: 'center',
    marginHorizontal: 12,
    minHeight: 34,
  },
  devTestBadgeText: {
    color: designHarness.colors.white,
    fontSize: 12,
    fontWeight: '800',
  },
  flashBtn: {
    width: 40,
    height: 40,
    borderRadius: designHarness.radius.roundButton,
    backgroundColor: designHarness.colors.overlaySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconTxt: { color: designHarness.colors.white, fontSize: 16 },
  chipList: {
    position: 'absolute',
    right: 12,
    top: SCREEN_H * designHarness.scan.sideRailTopRatio,
    bottom: SCREEN_H * designHarness.scan.sideRailBottomRatio,
    width: 72,
  },
  chip: {
    // DESIGN: medicine chip border radius and spacing. Edit `designHarness.radius.chip`.
    borderWidth: 2,
    borderRadius: designHarness.radius.chip,
    padding: 8,
    marginBottom: 8,
    alignItems: 'center',
    gap: 4,
  },
  chipTxt: { fontSize: 18, color: designHarness.colors.white },
  chipName: { fontSize: 10, color: designHarness.colors.borderMuted, textAlign: 'center' },
  bottomBar: {
    position: 'absolute',
    bottom: designHarness.scan.bottomBarOffset,
    alignSelf: 'center',
  },
  scanBtn: {
    // DESIGN: main scan CTA size and fill. Edit `designHarness.scan.scanButtonSize` and `designHarness.colors.white`.
    width: designHarness.scan.scanButtonSize,
    height: designHarness.scan.scanButtonSize,
    borderRadius: designHarness.radius.scanButton,
    backgroundColor: designHarness.colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: designHarness.shadow.glowColor,
    shadowOpacity: designHarness.shadow.glowOpacity,
    shadowRadius: designHarness.shadow.glowRadius,
    elevation: 6,
  },
  scanBtnDisabled: { opacity: 0.5 },
  scanBtnTxt: { fontSize: designHarness.typography.scanButtonLabelSize, fontWeight: '800', color: designHarness.colors.textStrong, letterSpacing: 1 },
  devPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: designHarness.colors.overlayPanel,
    paddingHorizontal: designHarness.spacing.overlayPadding,
    paddingTop: 16,
    paddingBottom: 48,
    borderTopLeftRadius: designHarness.radius.modal,
    borderTopRightRadius: designHarness.radius.modal,
    maxHeight: SCREEN_H * designHarness.scan.devPanelMaxHeightRatio,
  },
  devScroll: { marginBottom: 12 },
  devScrollContent: { paddingBottom: 4 },
  devImgWrap: {
    width: SCREEN_W - 48,
    height: DEV_IMG_H,
    backgroundColor: designHarness.colors.textStrong,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 8,
  },
  devImg: { width: '100%', height: '100%' },
  devRect: {
    position: 'absolute',
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  devBboxConf: {
    position: 'absolute',
    top: 0,
    left: 0,
    color: designHarness.colors.danger,
    fontSize: 9,
    fontWeight: '700',
    backgroundColor: designHarness.colors.overlayMedium,
    paddingHorizontal: 2,
  },
  devSectionLabel: {
    color: designHarness.colors.textMuted,
    fontSize: 10,
    fontFamily: 'monospace',
    marginBottom: 4,
    marginTop: 4,
  },
  devInfo: {
    color: designHarness.colors.textSoft,
    fontSize: 11,
    fontFamily: 'monospace',
    marginBottom: 8,
    lineHeight: 16,
  },
  devPanelTitle: { color: designHarness.colors.white, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  devPanelSub: { color: designHarness.colors.textSoft, fontSize: designHarness.typography.labelSize, textAlign: 'center', marginTop: 6, marginBottom: 16 },
  devBtns: { flexDirection: 'row', gap: 10 },
  devBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: designHarness.radius.button,
    alignItems: 'center',
  },
  devBtnCorrect: { backgroundColor: designHarness.colors.success },
  devBtnFP: { backgroundColor: designHarness.colors.warning },
  devBtnFN: { backgroundColor: designHarness.colors.danger },
  devBtnTxt: { color: designHarness.colors.white, fontSize: designHarness.typography.secondaryBodySize, fontWeight: '700' },
  devBtnSub: { color: 'rgba(255,255,255,0.7)', fontSize: designHarness.typography.microCopySize, marginTop: 2 },
})
