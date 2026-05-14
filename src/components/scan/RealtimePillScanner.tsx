import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Animated, Dimensions, Image, Pressable, SafeAreaView, StyleSheet, Text, Vibration, View } from 'react-native'
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useFrameProcessor,
} from 'react-native-vision-camera'
import { useTensorflowModel } from 'react-native-fast-tflite'
import { NitroModules } from 'react-native-nitro-modules'
import { Worklets, useSharedValue } from 'react-native-worklets-core'
import { useResizePlugin } from 'vision-camera-resize-plugin'
import { Svg, Rect, Ellipse } from 'react-native-svg'
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator'
import { SCAN_CONFIG } from '@/constants/scanConfig'

const CONFIDENCE_THRESHOLD = 0.65
const REQUIRED_STABLE_DETECTIONS = 6
const PROCESS_EVERY_N_FRAMES = 4
const NUM_ANCHORS = 8400
const DEBUG_PREVIEW_SIZE = 160
const ENABLE_DEBUG_PREVIEW = false

const { width: SCREEN_W } = Dimensions.get('window')
const GUIDE_SIZE = Math.round(SCREEN_W * 0.74)
const GUIDE_RADIUS = GUIDE_SIZE / 2
const STROKE_WIDTH = 4
const PERIMETER = 4 * (GUIDE_SIZE - STROKE_WIDTH)
const PILL_RX = Math.round(GUIDE_SIZE * 0.22)
const PILL_RY = Math.round(GUIDE_SIZE * 0.12)

type TorchMode = 'on' | 'off'

interface DebugBbox {
  cx: number
  cy: number
  w: number
  h: number
  conf: number
}

interface Props {
  medicationName: string
  onClose: () => void
  onVerified: (confidence: number) => void
}

export function RealtimePillScanner({ medicationName, onClose, onVerified }: Props) {
  const device = useCameraDevice('back')
  const { hasPermission, requestPermission } = useCameraPermission()
  const cameraRef = useRef<Camera>(null)
  const plugin = useTensorflowModel(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../../../assets/models/real_float32.tflite'),
    [],
  )
  const { resize } = useResizePlugin()
  const model = plugin.state === 'loaded' ? plugin.model : undefined
  const boxedModel = useMemo(
    () => (model != null ? NitroModules.box(model) : undefined),
    [model],
  )

  const frameCounter = useSharedValue(0)
  const stableDetectionCount = useSharedValue(0)
  const verifiedOnce = useSharedValue(false)

  const [label, setLabel] = useState('알약을 가이드 안에 올려주세요')
  const [torchMode, setTorchMode] = useState<TorchMode>('off')
  const [progress, setProgress] = useState(0)
  const [showLightHint, setShowLightHint] = useState(false)
  const noDetectionSinceRef = useRef<number>(Date.now())
  const [showVerifiedOverlay, setShowVerifiedOverlay] = useState(false)
  const [cameraActive, setCameraActive] = useState(true)
  const [cameraErrorMessage, setCameraErrorMessage] = useState<string | null>(null)

  const checkAnim = useRef(new Animated.Value(0)).current
  const checkSlideY = useRef(new Animated.Value(-50)).current
  const ringAnim = useRef(new Animated.Value(0)).current
  const overlayOpacity = useRef(new Animated.Value(1)).current
  const PARTICLE_COUNT = 8
  const particleAnims = useRef(
    Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      opacity: new Animated.Value(0),
      scale: new Animated.Value(0),
      color: i % 2 === 0 ? '#4ade80' : '#fbbf24',
      size: ([12, 8, 14, 7, 10, 8, 13, 7] as number[])[i],
      isSquare: i % 3 === 0,
    }))
  ).current
  const [debugPreviewUri, setDebugPreviewUri] = useState<string | null>(null)
  const [debugBbox, setDebugBbox] = useState<DebugBbox | null>(null)
  const vibrationFiredRef = useRef(false)
  const captureInProgressRef = useRef(false)
  const scanCompletedRef = useRef(false)

  useEffect(() => {
    if (!hasPermission) requestPermission()
  }, [hasPermission, requestPermission])

  useEffect(() => {
    if (plugin.state === 'loading') {
      setLabel('스캔 모델을 불러오는 중입니다')
    } else if (plugin.state === 'error') {
      setLabel('스캔 모델을 불러오지 못했습니다')
    } else {
      setLabel('알약을 가이드 안에 올려주세요')
    }
  }, [plugin.state])

  // 500ms마다 스냅샷 캡처 → YOLO와 동일한 중심 크롭 → 프리뷰 표시
  useEffect(() => {
    if (!ENABLE_DEBUG_PREVIEW || !cameraActive) return

    const interval = setInterval(async () => {
      if (!cameraRef.current || captureInProgressRef.current || scanCompletedRef.current) return
      captureInProgressRef.current = true
      try {
        const snapshot = await cameraRef.current.takeSnapshot({ quality: 40 })
        const snapW = snapshot.width
        const snapH = snapshot.height
        const cropSize = Math.min(snapW, snapH)
        const cropX = (snapW - cropSize) / 2
        const cropY = (snapH - cropSize) / 2
        const result = await manipulateAsync(
          snapshot.path,
          [{ crop: { originX: cropX, originY: cropY, width: cropSize, height: cropSize } }],
          { compress: 0.4, format: SaveFormat.JPEG },
        )
        setDebugPreviewUri(result.uri)
      } catch {
        // 캡처 실패 무시
      } finally {
        captureInProgressRef.current = false
      }
    }, 500)
    return () => clearInterval(interval)
  }, [cameraActive])

  const handleClose = useCallback(() => {
    scanCompletedRef.current = true
    setCameraActive(false)
    setTorchMode('off')
    onClose()
  }, [onClose])

  const handleCameraError = useCallback((error: { code?: string; message?: string }) => {
    console.warn('[scan] Camera session error:', error)
    setCameraErrorMessage(error.message ?? error.code ?? 'Camera session error')
    setCameraActive(false)
    setTorchMode('off')
  }, [])

  const handleResult = useCallback((
    detected: boolean,
    verified: boolean,
    confidence: number,
    stableCount: number,
    bboxCx: number,
    bboxCy: number,
    bboxW: number,
    bboxH: number,
    bboxConf: number,
  ) => {
    console.log(`[YOLO] conf=${(confidence * 100).toFixed(1)}% detected=${detected} stable=${stableCount}/${REQUIRED_STABLE_DETECTIONS} bbox=(${bboxCx.toFixed(2)},${bboxCy.toFixed(2)},${bboxW.toFixed(2)}x${bboxH.toFixed(2)})`)

    if (detected) {
      noDetectionSinceRef.current = Date.now()
      setShowLightHint(false)
    } else {
      const elapsed = Date.now() - noDetectionSinceRef.current
      setShowLightHint(elapsed > 8000)
    }
    const newProgress = detected ? stableCount / REQUIRED_STABLE_DETECTIONS : 0
    setProgress(newProgress)

    if (bboxConf > 0.1) {
      setDebugBbox({ cx: bboxCx, cy: bboxCy, w: bboxW, h: bboxH, conf: bboxConf })
    } else {
      setDebugBbox(null)
    }

    if (detected && !vibrationFiredRef.current) {
      Vibration.vibrate(50)
      vibrationFiredRef.current = true
    } else if (!detected) {
      vibrationFiredRef.current = false
    }

    if (verified) {
      if (scanCompletedRef.current) return
      scanCompletedRef.current = true
      setCameraActive(false)
      setTorchMode('off')
      setShowLightHint(false)

      // 게이지 100% 채운 상태를 잠깐 보여준 뒤 오버레이 등장
      setTimeout(() => {
        setShowVerifiedOverlay(true)
        Vibration.vibrate([0, 60, 40, 100, 40, 160])

        checkAnim.setValue(0)
        checkSlideY.setValue(-50)
        ringAnim.setValue(0)
        overlayOpacity.setValue(1)
        particleAnims.forEach(p => {
          p.x.setValue(0); p.y.setValue(0)
          p.opacity.setValue(0); p.scale.setValue(0)
        })

        Animated.parallel([
          Animated.spring(checkAnim, { toValue: 1, friction: 4, tension: 65, useNativeDriver: true }),
          Animated.spring(checkSlideY, { toValue: 0, friction: 5, tension: 70, useNativeDriver: true }),
          Animated.timing(ringAnim, { toValue: 1, duration: 750, useNativeDriver: true }),
        ]).start()

        particleAnims.forEach((p, i) => {
          const angle = (i / PARTICLE_COUNT) * Math.PI * 2 - Math.PI / 2
          const radius = 90 + (i % 3) * 22
          Animated.sequence([
            Animated.delay(i * 35),
            Animated.parallel([
              Animated.timing(p.opacity, { toValue: 1, duration: 80, useNativeDriver: true }),
              Animated.spring(p.scale, { toValue: 1, friction: 4, tension: 100, useNativeDriver: true }),
              Animated.timing(p.x, { toValue: Math.cos(angle) * radius, duration: 650, useNativeDriver: true }),
              Animated.timing(p.y, { toValue: Math.sin(angle) * radius, duration: 650, useNativeDriver: true }),
            ]),
            Animated.timing(p.opacity, { toValue: 0, duration: 350, useNativeDriver: true }),
          ]).start()
        })

        // 애니메이션 완료 후 오버레이 페이드아웃 → onVerified
        setTimeout(() => {
          Animated.timing(overlayOpacity, {
            toValue: 0,
            duration: 400,
            useNativeDriver: true,
          }).start(() => {
            setShowVerifiedOverlay(false)
            overlayOpacity.setValue(1)
            onVerified(confidence)
          })
        }, 1100)
      }, 350)
      return
    }

    setLabel(
      detected
        ? `알약을 확인하는 중입니다 (${(confidence * 100).toFixed(0)}%)`
        : '알약을 가이드 안에 올려주세요',
    )
  }, [onVerified])

  const reportResult = useMemo(() => Worklets.createRunOnJS(handleResult), [handleResult])

  const frameProcessor = useFrameProcessor(
    (frame) => {
      'worklet'

      if (verifiedOnce.value) return

      frameCounter.value = (frameCounter.value + 1) % PROCESS_EVERY_N_FRAMES
      if (frameCounter.value !== 0) return
      if (boxedModel == null) return

      try {
        const tflite = boxedModel.unbox()
        const shortSide = Math.min(frame.width, frame.height)
        const cropSize = shortSide / 2
        const cropX = (frame.width - cropSize) / 2
        const cropY = (frame.height - cropSize) / 2
        const resized = resize(frame, {
          crop: { x: cropX, y: cropY, width: cropSize, height: cropSize },
          scale: {
            width: SCAN_CONFIG.YOLO_INPUT_SIZE,
            height: SCAN_CONFIG.YOLO_INPUT_SIZE,
          },
          pixelFormat: 'rgb',
          dataType: 'float32',
        })

        const inputBuffer = resized.buffer.slice(
          resized.byteOffset,
          resized.byteOffset + resized.byteLength,
        ) as ArrayBuffer

        const rawOutput = tflite.runSync([inputBuffer])[0] as unknown
        if (!rawOutput) return

        const output =
          rawOutput instanceof Float32Array
            ? rawOutput
            : rawOutput instanceof ArrayBuffer
              ? new Float32Array(rawOutput)
              : new Float32Array(
                  (rawOutput as Float32Array).buffer,
                  (rawOutput as Float32Array).byteOffset,
                  Math.floor((rawOutput as Float32Array).byteLength / 4),
                )

        // 가장 높은 confidence 앵커 추출 (bbox 포함)
        let maxConfidence = 0
        let bestIdx = 0
        for (let i = 0; i < NUM_ANCHORS; i += 1) {
          const score = output[4 * NUM_ANCHORS + i] ?? 0
          if (score > maxConfidence) {
            maxConfidence = score
            bestIdx = i
          }
        }

        // bbox 좌표 0-1 정규화 (YOLO 출력은 640×640 픽셀 기준)
        const bboxCx = (output[0 * NUM_ANCHORS + bestIdx] ?? 0) / SCAN_CONFIG.YOLO_INPUT_SIZE
        const bboxCy = (output[1 * NUM_ANCHORS + bestIdx] ?? 0) / SCAN_CONFIG.YOLO_INPUT_SIZE
        const bboxW  = (output[2 * NUM_ANCHORS + bestIdx] ?? 0) / SCAN_CONFIG.YOLO_INPUT_SIZE
        const bboxH  = (output[3 * NUM_ANCHORS + bestIdx] ?? 0) / SCAN_CONFIG.YOLO_INPUT_SIZE

        const detected = maxConfidence >= CONFIDENCE_THRESHOLD
        stableDetectionCount.value = detected ? stableDetectionCount.value + 1 : 0
        const verified = stableDetectionCount.value >= REQUIRED_STABLE_DETECTIONS

        if (verified) verifiedOnce.value = true
        reportResult(detected, verified, maxConfidence, stableDetectionCount.value, bboxCx, bboxCy, bboxW, bboxH, maxConfidence)
      } catch {
        stableDetectionCount.value = 0
      }
    },
    [boxedModel, resize, reportResult, frameCounter, stableDetectionCount, verifiedOnce],
  )

  const toggleTorch = useCallback(() => {
    setTorchMode(current => (current === 'on' ? 'off' : 'on'))
  }, [])

  const rectInset = STROKE_WIDTH / 2
  const dashOffset = PERIMETER * (1 - progress)

  if (!hasPermission) {
    return (
      <View style={s.center}>
        <Text style={s.message}>카메라 권한이 필요합니다</Text>
      </View>
    )
  }

  if (!device) {
    return (
      <View style={s.center}>
        <Text style={s.message}>사용 가능한 후면 카메라를 찾지 못했습니다</Text>
      </View>
    )
  }

  if (cameraErrorMessage) {
    return (
      <View style={s.center}>
        <Text style={s.message}>Camera session error</Text>
        <Text style={s.errorDetail}>{cameraErrorMessage}</Text>
        <Pressable accessibilityRole="button" onPress={handleClose} style={s.errorButton}>
          <Text style={s.errorButtonText}>Close</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={s.root}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={cameraActive}
        frameProcessor={cameraActive ? frameProcessor : undefined}
        resizeMode="cover"
        torch={torchMode}
        zoom={2}
        onError={handleCameraError}
      />

      <SafeAreaView style={s.chrome}>
        <View style={s.topBar}>
          <Pressable accessibilityRole="button" onPress={handleClose} style={s.iconButton}>
            <Text style={s.closeText}>x</Text>
          </Pressable>
          <Text style={s.title} numberOfLines={1}>{medicationName}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="플래시 전환"
            onPress={toggleTorch}
            style={[s.flashButton, torchMode === 'on' && s.flashButtonActive]}
          >
            <Text style={[s.flashText, torchMode === 'on' && s.flashTextActive]}>
              {torchMode === 'on' ? 'ON' : 'FLASH'}
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>

      {showLightHint && (
        <View style={s.darkWarning} pointerEvents="none">
          <Text style={s.darkWarningText}>조금 더 밝은 곳에서 찍어주세요</Text>
        </View>
      )}

      {/* 가이드 사각형 + 초록 게이지 + 타원형 알약 가이드 */}
      <View style={s.guideWrapper} pointerEvents="none">
        <Svg width={GUIDE_SIZE} height={GUIDE_SIZE}>
          <Rect
            x={rectInset}
            y={rectInset}
            width={GUIDE_SIZE - STROKE_WIDTH}
            height={GUIDE_SIZE - STROKE_WIDTH}
            stroke="rgba(255,255,255,0.45)"
            strokeWidth={STROKE_WIDTH}
            fill="none"
          />
          {progress > 0 && (
            <Rect
              x={rectInset}
              y={rectInset}
              width={GUIDE_SIZE - STROKE_WIDTH}
              height={GUIDE_SIZE - STROKE_WIDTH}
              stroke="#4ade80"
              strokeWidth={STROKE_WIDTH}
              fill="none"
              strokeDasharray={`${PERIMETER}`}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
            />
          )}
          <Ellipse
            cx={GUIDE_RADIUS}
            cy={GUIDE_RADIUS}
            rx={PILL_RX}
            ry={PILL_RY}
            stroke="rgba(255,255,255,0.55)"
            strokeWidth={2}
            strokeDasharray="8 5"
            fill="none"
          />
        </Svg>
      </View>

      {/* 디버그 오버레이: YOLO 입력 이미지 + bbox */}
      {ENABLE_DEBUG_PREVIEW && (
      <View style={s.debugPanel}>
        <Text style={s.debugLabel}>YOLO 입력 ({SCAN_CONFIG.YOLO_INPUT_SIZE}×{SCAN_CONFIG.YOLO_INPUT_SIZE})</Text>
        <View style={s.debugPreviewBox}>
          {debugPreviewUri ? (
            <Image
              source={{ uri: debugPreviewUri }}
              style={s.debugPreviewImage}
              resizeMode="stretch"
            />
          ) : (
            <View style={s.debugPreviewPlaceholder} />
          )}
          {/* bbox 오버레이 */}
          {debugBbox && (
            <View
              pointerEvents="none"
              style={[
                s.bboxRect,
                {
                  left:   (debugBbox.cx - debugBbox.w / 2) * DEBUG_PREVIEW_SIZE,
                  top:    (debugBbox.cy - debugBbox.h / 2) * DEBUG_PREVIEW_SIZE,
                  width:  debugBbox.w * DEBUG_PREVIEW_SIZE,
                  height: debugBbox.h * DEBUG_PREVIEW_SIZE,
                },
              ]}
            />
          )}
        </View>
        {debugBbox && (
          <Text style={s.debugBboxText}>
            {`conf ${(debugBbox.conf * 100).toFixed(1)}%  cx ${debugBbox.cx.toFixed(2)}  cy ${debugBbox.cy.toFixed(2)}\nw ${debugBbox.w.toFixed(2)}  h ${debugBbox.h.toFixed(2)}`}
          </Text>
        )}
      </View>
      )}

      <View style={s.badge}>
        <Text style={s.badgeText}>{label}</Text>
      </View>

      {showVerifiedOverlay && (
        <Animated.View style={[StyleSheet.absoluteFill, s.verifiedOverlay, { opacity: overlayOpacity }]} pointerEvents="none">
          <Animated.View
            style={[s.verifiedRing, {
              opacity: ringAnim.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.9, 0.4, 0] }),
              transform: [{ scale: ringAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 3.0] }) }],
            }]}
          />
          {particleAnims.map((p, i) => (
            <Animated.View
              key={i}
              style={[
                s.particle,
                {
                  backgroundColor: p.color,
                  width: p.size,
                  height: p.size,
                  borderRadius: p.isSquare ? 2 : p.size / 2,
                  opacity: p.opacity,
                  transform: [
                    { translateX: p.x },
                    { translateY: p.y },
                    { scale: p.scale },
                    ...(p.isSquare ? [{ rotate: '45deg' as const }] : []),
                  ],
                },
              ]}
            />
          ))}
          <Animated.View
            style={[s.verifiedCircle, {
              transform: [{ scale: checkAnim }, { translateY: checkSlideY }],
            }]}
          >
            <Text style={s.checkText}>✓</Text>
          </Animated.View>
        </Animated.View>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
    padding: 24,
  },
  message: { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  errorDetail: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 10,
    textAlign: 'center',
  },
  errorButton: {
    marginTop: 18,
    borderRadius: 999,
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  errorButtonText: {
    color: '#111',
    fontSize: 14,
    fontWeight: '800',
  },
  chrome: { position: 'absolute', top: 0, left: 0, right: 0 },
  topBar: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 44,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  closeText: { color: '#fff', fontSize: 24, fontWeight: '700', lineHeight: 28 },
  title: {
    flex: 1,
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
    marginHorizontal: 12,
  },
  flashButton: {
    minWidth: 62,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.48)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    paddingHorizontal: 10,
  },
  flashButtonActive: {
    backgroundColor: 'rgba(255,218,102,0.96)',
    borderColor: 'rgba(255,255,255,0.85)',
  },
  flashText: { color: '#fff', fontSize: 11, fontWeight: '900' },
  flashTextActive: { color: '#111827' },
  guideWrapper: {
    position: 'absolute',
    top: '35%',
    left: '13%',
    width: GUIDE_SIZE,
    height: GUIDE_SIZE,
  },
  // 디버그 패널 (왼쪽 상단, 가이드 위에 겹침)
  debugPanel: {
    position: 'absolute',
    top: 70,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderRadius: 8,
    padding: 6,
    gap: 4,
  },
  debugLabel: {
    color: '#facc15',
    fontSize: 9,
    fontWeight: '800',
    fontFamily: 'monospace',
  },
  debugPreviewBox: {
    width: DEBUG_PREVIEW_SIZE,
    height: DEBUG_PREVIEW_SIZE,
    backgroundColor: '#111',
    borderRadius: 4,
    overflow: 'hidden',
  },
  debugPreviewImage: {
    width: DEBUG_PREVIEW_SIZE,
    height: DEBUG_PREVIEW_SIZE,
  },
  debugPreviewPlaceholder: {
    width: DEBUG_PREVIEW_SIZE,
    height: DEBUG_PREVIEW_SIZE,
    backgroundColor: '#222',
  },
  bboxRect: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#ef4444',
    backgroundColor: 'transparent',
  },
  debugBboxText: {
    color: '#ef4444',
    fontSize: 9,
    fontFamily: 'monospace',
    lineHeight: 13,
  },
  badge: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 52,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.66)',
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderRadius: 18,
  },
  badgeText: { color: '#fff', fontSize: 16, fontWeight: '800', textAlign: 'center' },
  darkWarning: {
    position: 'absolute',
    top: '31%',
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  darkWarningText: {
    color: '#fbbf24',
    fontSize: 13,
    fontWeight: '700',
  },
  verifiedOverlay: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  verifiedRing: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    borderColor: '#4ade80',
  },
  particle: {
    position: 'absolute',
  },
  verifiedCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 16,
    shadowColor: '#4ade80',
    shadowOpacity: 0.9,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 0 },
  },
  checkText: {
    color: '#fff',
    fontSize: 56,
    fontWeight: '900',
    lineHeight: 66,
    includeFontPadding: false,
  },
})
