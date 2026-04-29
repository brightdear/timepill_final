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
import { db } from '@backend/db/client'
import { doseRecords, timeSlots, medications } from '@backend/db/schema'
import { eq, and } from 'drizzle-orm'
import { runBurstScanInference, type ScanResult, type ScanDebugInfo } from '@scan/runScanInference'
import { completeVerification } from '@frontend/hooks/useStreakUpdate'
import { getSettings } from '@backend/settings/repository'
import { ScanLoadingOverlay } from '@frontend/components/ScanLoadingOverlay'
import { FreezeAcquiredPopup } from '@frontend/components/FreezeAcquiredPopup'
import { getLocalDateKey } from '@shared/utils/dateUtils'
import { SCAN_CONFIG } from '@shared/constants/scanConfig'
import { isVerifiable } from '@frontend/hooks/useTodayTimeslots'

type FlashMode = 'off' | 'on' | 'auto'

interface VerifiableItem {
  slotId: string
  medicationId: string
  doseRecordId: string
  medName: string
  doseCount: number
  color: string
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window')
const STAGE_SIZE = SCREEN_W                                          // 정사각형 카메라 스테이지
const GUIDE_SIZE = Math.floor(STAGE_SIZE * SCAN_CONFIG.CROP_RATIO)  // 가이드 = 스테이지의 75%
const STAGE_TOP  = Math.max(0, Math.round((SCREEN_H - STAGE_SIZE) * 0.38)) // 화면 상단 38% 지점
const DEV_IMG_H = 220

export default function ScanScreen() {
  const { slotId: forcedSlotId } = useLocalSearchParams<{ slotId?: string }>()
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
    item: VerifiableItem
  } | null>(null)
  const [devDebugInfo, setDevDebugInfo] = useState<ScanDebugInfo | null>(null)
  const [devSaving, setDevSaving] = useState(false)
  const scanningRef = useRef(false)

  const loadVerifiableItems = useCallback(async (): Promise<VerifiableItem[]> => {
    const todayKey = getLocalDateKey()
    const allSlots = await db.select().from(timeSlots)
    const results: VerifiableItem[] = []

    for (const slot of allSlots) {
      if (forcedSlotId && slot.id !== forcedSlotId) continue
      if (slot.isActive === 0) continue

      const dr = await db.select().from(doseRecords)
        .where(and(eq(doseRecords.timeSlotId, slot.id), eq(doseRecords.dayKey, todayKey)))
        .get()
      if (!isVerifiable(slot, dr ?? null)) continue

      const med = await db.select().from(medications)
        .where(eq(medications.id, slot.medicationId))
        .get()

      results.push({
        slotId: slot.id,
        medicationId: med?.id ?? '',
        doseRecordId: dr!.id,
        medName: med?.name ?? '?',
        doseCount: slot.doseCountPerIntake,
        color: med?.color ?? '#888',
      })

      if (slot.doseCountPerIntake >= SCAN_CONFIG.HIGH_DOSE_WARNING_COUNT) {
        setHighDoseWarning(true)
      }
    }

    setItems(results)
    if (results.length > 0) setSelectedSlotId(prev => prev ?? results[0].slotId)
    return results
  }, [forcedSlotId])

  useEffect(() => {
    scanningRef.current = scanning
  }, [scanning])

  useEffect(() => {
    loadVerifiableItems()
    getSettings().then(s => setDevMode(s.devMode === 1))
  }, [loadVerifiableItems])

  const completeScanResult = useCallback(async (result: ScanResult, item: VerifiableItem) => {
    if (result.type === 'no_pill') {
      Alert.alert('알약이 감지되지 않았습니다', '가이드 네모 안에 알약이 보이도록 다시 스캔해주세요')
      return
    }
    if (result.type === 'pill_too_small') {
      Alert.alert('알약이 너무 작습니다', '더 가까이서 촬영해주세요')
      return
    }
    if (result.type === 'unmatched') {
      Alert.alert('알약을 확인할 수 없습니다', '다시 scan해주세요')
      return
    }

    const { freezeAcquired, currentStreak } = await completeVerification(
      item.doseRecordId,
      item.slotId,
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
  }, [loadVerifiableItems, router])

  const handleDevFeedback = useCallback(async (type: 'correct' | 'fp' | 'fn') => {
    if (!devFeedback) return
    const { photoUri, result, item } = devFeedback
    setDevFeedback(null)
    setDevDebugInfo(null)

    if (type !== 'correct') {
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

    await completeScanResult(result, item)
  }, [devFeedback, completeScanResult])

  const handleScan = async () => {
    if (!cameraRef.current || scanning) return
    // 스캔 직전 윈도우 유효성 재확인 — 화면을 열어둔 채 윈도우가 만료될 수 있음
    const freshItems = await loadVerifiableItems()
    const item = freshItems.find(i => i.slotId === selectedSlotId) ?? freshItems[0]
    if (!item) {
      Alert.alert('인증 시간이 지났습니다', '복용 인증 가능 시간이 지났습니다')
      return
    }

    setScanning(true)
    let bestPhotoUri: string | null = null
    try {
      const camera = cameraRef.current
      const currentDevMode = (await getSettings()).devMode === 1
      if (currentDevMode !== devMode) setDevMode(currentDevMode)
      const result = await runBurstScanInference({
        takePicture: async () => {
          const photo = await camera.takePictureAsync({ base64: false })
          return photo ?? null
        },
        candidates: [{ medicationId: item.medicationId, doseCount: item.doseCount }],
        onBestPhotoUri: currentDevMode ? (uri) => { bestPhotoUri = uri } : undefined,
        onDebugInfo: currentDevMode ? setDevDebugInfo : undefined,
      })

      if (currentDevMode) {
        setDevFeedback({ photoUri: bestPhotoUri ?? '', result, item })
        return
      }

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
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" flash={flash} zoom={0.2} />

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
        {highDoseWarning && (
          <Text style={s.warnTxt}>스캔 정확도가 낮아질 수 있습니다</Text>
        )}
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
          <Text style={s.scanBtnTxt}>SCAN</Text>
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
          <Text style={s.devPanelTitle}>이 결과가 정확했나요?</Text>
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
                <Text style={s.devBtnTxt}>정확함</Text>
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
  root: { flex: 1, backgroundColor: '#000' },
  cameraStage: { position: 'absolute', left: 0, overflow: 'hidden', backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#000', gap: 16 },
  permTxt: { color: '#fff', fontSize: 16 },
  permBtn: { backgroundColor: '#fff', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  permBtnTxt: { fontSize: 15, fontWeight: '600', color: '#111' },
  guide: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.7)',
    borderRadius: 12,
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
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  warnTxt: {
    flex: 1,
    textAlign: 'center',
    color: '#fbbf24',
    fontSize: 12,
    fontWeight: '600',
  },
  flashBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconTxt: { color: '#fff', fontSize: 16 },
  chipList: {
    position: 'absolute',
    right: 12,
    top: SCREEN_H * 0.25,
    bottom: SCREEN_H * 0.2,
    width: 72,
  },
  chip: {
    borderWidth: 2,
    borderRadius: 12,
    padding: 8,
    marginBottom: 8,
    alignItems: 'center',
    gap: 4,
  },
  chipTxt: { fontSize: 18, color: '#fff' },
  chipName: { fontSize: 10, color: '#ddd', textAlign: 'center' },
  bottomBar: {
    position: 'absolute',
    bottom: 60,
    alignSelf: 'center',
  },
  scanBtn: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#fff',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  scanBtnDisabled: { opacity: 0.5 },
  scanBtnTxt: { fontSize: 16, fontWeight: '800', color: '#111', letterSpacing: 1 },
  devPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.92)',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 48,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: SCREEN_H * 0.75,
  },
  devScroll: { marginBottom: 12 },
  devScrollContent: { paddingBottom: 4 },
  devImgWrap: {
    width: SCREEN_W - 48,
    height: DEV_IMG_H,
    backgroundColor: '#111',
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
    color: '#ef4444',
    fontSize: 9,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 2,
  },
  devSectionLabel: {
    color: '#888',
    fontSize: 10,
    fontFamily: 'monospace',
    marginBottom: 4,
    marginTop: 4,
  },
  devInfo: {
    color: '#aaa',
    fontSize: 11,
    fontFamily: 'monospace',
    marginBottom: 8,
    lineHeight: 16,
  },
  devPanelTitle: { color: '#fff', fontSize: 17, fontWeight: '700', textAlign: 'center' },
  devPanelSub: { color: '#aaa', fontSize: 13, textAlign: 'center', marginTop: 6, marginBottom: 16 },
  devBtns: { flexDirection: 'row', gap: 10 },
  devBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  devBtnCorrect: { backgroundColor: '#22c55e' },
  devBtnFP: { backgroundColor: '#f59e0b' },
  devBtnFN: { backgroundColor: '#ef4444' },
  devBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
  devBtnSub: { color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 },
})
