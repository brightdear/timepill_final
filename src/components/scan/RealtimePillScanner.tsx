import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native'
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
import { SCAN_CONFIG } from '@/constants/scanConfig'

const CONFIDENCE_THRESHOLD = 0.55
const REQUIRED_STABLE_DETECTIONS = 2
const PROCESS_EVERY_N_FRAMES = 4
const NUM_ANCHORS = 8400

type TorchMode = 'on' | 'off'

interface Props {
  medicationName: string
  onClose: () => void
  onVerified: (confidence: number) => void
}

export function RealtimePillScanner({ medicationName, onClose, onVerified }: Props) {
  const device = useCameraDevice('back')
  const { hasPermission, requestPermission } = useCameraPermission()
  const plugin = useTensorflowModel(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../../../assets/models/best_int8.tflite'),
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

  const handleResult = useCallback((detected: boolean, verified: boolean, confidence: number) => {
    if (verified) {
      setLabel(`복용 인증 완료! (${(confidence * 100).toFixed(0)}%)`)
      onVerified(confidence)
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
        const resized = resize(frame, {
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

        let maxConfidence = 0
        for (let i = 0; i < NUM_ANCHORS; i += 1) {
          const score = output[4 * NUM_ANCHORS + i] ?? 0
          if (score > maxConfidence) maxConfidence = score
        }

        const detected = maxConfidence >= CONFIDENCE_THRESHOLD
        stableDetectionCount.value = detected ? stableDetectionCount.value + 1 : 0
        const verified = stableDetectionCount.value >= REQUIRED_STABLE_DETECTIONS

        if (verified) verifiedOnce.value = true
        reportResult(detected, verified, maxConfidence)
      } catch {
        stableDetectionCount.value = 0
      }
    },
    [boxedModel, resize, reportResult, frameCounter, stableDetectionCount, verifiedOnce],
  )

  const toggleTorch = useCallback(() => {
    setTorchMode(current => (current === 'on' ? 'off' : 'on'))
  }, [])

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

  return (
    <View style={s.root}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        frameProcessor={frameProcessor}
        pixelFormat="rgb"
        resizeMode="cover"
        torch={torchMode}
      />

      <SafeAreaView style={s.chrome}>
        <View style={s.topBar}>
          <Pressable accessibilityRole="button" onPress={onClose} style={s.iconButton}>
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

      <View style={s.guide} pointerEvents="none" />

      <View style={s.badge}>
        <Text style={s.badgeText}>{label}</Text>
      </View>
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
  chrome: { position: 'absolute', top: 0, left: 0, right: 0 },
  topBar: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
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
  guide: {
    position: 'absolute',
    top: '28%',
    left: '13%',
    right: '13%',
    aspectRatio: 1,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.72)',
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
})
