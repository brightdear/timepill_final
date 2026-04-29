import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Switch,
  Image,
  Dimensions,
} from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useFocusEffect, useNavigation } from '@react-navigation/native'
import { WheelColumn } from '@frontend/components/WheelColumn'
import { CyclePicker } from '@frontend/components/CyclePicker'
import { getMedications, getMedicationByName, getMedicationById, insertMedication, deleteMedication } from '@backend/medication/repository'
import { insertTimeslot, getTimeslotById, updateTimeslot, deleteTimeslot } from '@backend/timeslot/repository'
import { insertDoseRecord, deleteDoseRecord, getTodayDoseRecordForSlot, updateDoseRecordScheduledTimeForSlot } from '@backend/doseRecord/repository'
import { upsertStreak } from '@backend/streak/repository'
import { scheduleAlarmsForSlot } from '@backend/alarm/alarmScheduler'
import { scheduleForceAlarmsForSlot } from '@backend/alarm/forceAlarmScheduler'
import { captureReferenceImage, type ScanDebugInfo } from '@scan/runScanInference'
import { getReferenceImages, insertReferenceImage, deleteReferenceImage } from '@backend/referenceImage/repository'

import { isTodayDue } from '@shared/utils/cycleUtils'
import { getLocalDateKey, toLocalISOString } from '@shared/utils/dateUtils'
import { deleteAsync } from 'expo-file-system/legacy'
import { setRegisterDirty, consumeRegisterReset } from '@shared/utils/registerGuard'
import { safeParseJson } from '@shared/utils/safeJson'
import type { CycleConfig } from '@backend/db/schema'

import { SCAN_CONFIG } from '@shared/constants/scanConfig'

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window')
const REG_STAGE_SIZE  = SCREEN_W
// The visible guide is intentionally stricter than the full center-square crop used for inference.
const REG_GUIDE_SIZE  = Math.floor(REG_STAGE_SIZE * SCAN_CONFIG.CROP_RATIO)
const DEV_IMG_H = 220
const MIN_PHOTOS = SCAN_CONFIG.MIN_REFERENCE_IMAGES
const MAX_PHOTOS = SCAN_CONFIG.MAX_REFERENCE_IMAGES

type RefPhotoEntry = {
  id?: string          // set for existing DB photos
  originalUri?: string
  croppedUri: string
  embeddings: number[][]
  isNew: boolean
  toDelete?: boolean
}

const DOSE_ITEMS = Array.from({ length: 10 }, (_, i) => String(i + 1))
const AMPM_ITEMS = ['오전', '오후']
const HOUR_ITEMS = Array.from({ length: 12 }, (_, i) => String(i + 1))
const MINUTE_ITEMS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'))
const SNOOZE_COUNT_ITEMS = ['1', '2', '3']
const VERIFICATION_WINDOWS = [30, 60, 120] as const
const ALARM_SOUNDS = ['default', 'bell', 'chime'] as const

type AlarmSound = typeof ALARM_SOUNDS[number]
type VerificationWindow = typeof VERIFICATION_WINDOWS[number]


function soundLabel(s: AlarmSound) {
  switch (s) {
    case 'default': return '기본'
    case 'bell': return '벨'
    case 'chime': return '차임'
  }
}

export default function RegisterScreen() {
  const params = useLocalSearchParams<{ slotId?: string; editLoadKey?: string }>()
  const router = useRouter()
  const navigation = useNavigation()
  // useLocalSearchParams는 탭 URL에 캐시된 값을 반환할 수 있으므로
  // 실제 현재 route params로 재확인
  const slotId = params.slotId
  const editLoadKey = params.editLoadKey ?? ''
  const isEdit = Boolean(slotId)
  const scrollRef = useRef<ScrollView>(null)

  const now = new Date()
  const [medName, setMedName] = useState('')
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [doseIdx, setDoseIdx] = useState(0)
  const [hour, setHour] = useState(now.getHours())
  const [minute, setMinute] = useState(now.getMinutes())
  const [cycleConfig, setCycleConfig] = useState<CycleConfig>({ type: 'daily' })
  const [cycleStartDate, setCycleStartDate] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  // Reference photos
  const [refPhotos, setRefPhotos] = useState<RefPhotoEntry[]>([])
  const refPhotosRef = useRef<RefPhotoEntry[]>([])
  const [cameraOpen, setCameraOpen] = useState(false)
  const [refCapturing, setRefCapturing] = useState(false)
  const [debugInfo, setDebugInfo] = useState<ScanDebugInfo | null>(null)
  const [devCropUris, setDevCropUris] = useState<string[]>([])
  const refCameraRef = useRef<CameraView>(null)
  const [refPermission, requestRefPermission] = useCameraPermissions()

  // Alarm settings
  const [popupEnabled, setPopupEnabled] = useState(true)
  const [alarmEnabled, setAlarmEnabled] = useState(true)
  const [forceAlarm, setForceAlarm] = useState(false)
  const [alarmSound, setAlarmSound] = useState<AlarmSound>('default')
  const [vibrationEnabled, setVibrationEnabled] = useState(true)
  const [snoozeEnabled, setSnoozeEnabled] = useState(false)
  const [snoozeCountIdx, setSnoozeCountIdx] = useState(0) // 1 snooze by default when enabled
  const [verificationWindow, setVerificationWindow] = useState<VerificationWindow>(60)

  const allMedNamesRef = useRef<string[]>([])
  const slotIdRef = useRef(slotId)
  const editLoadKeyRef = useRef(editLoadKey)
  const lastFocusedEditKeyRef = useRef(editLoadKey)

  useEffect(() => {
    getMedications().then(meds => {
      allMedNamesRef.current = meds.map(m => m.name)
    })
  }, [])

  useEffect(() => {
    slotIdRef.current = slotId
    editLoadKeyRef.current = editLoadKey
  }, [slotId, editLoadKey])

  useEffect(() => {
    if (!slotId) return
    let cancelled = false
    getTimeslotById(slotId).then(async slot => {
      if (!slot || cancelled) return
      const med = await getMedicationById(slot.medicationId)
      // Load existing reference photos
      const existing = await getReferenceImages(slot.medicationId)
      if (cancelled) return
      setHour(slot.hour)
      setMinute(slot.minute)
      if (med) setMedName(med.name)
      setRefPhotos(existing.flatMap(p => {
        const parsed = safeParseJson<number[] | number[][]>(p.embedding)
        if (!Array.isArray(parsed)) return []
        const embeddings: number[][] = (parsed.length === 0 || typeof parsed[0] === 'number')
          ? [parsed as number[]]
          : parsed as number[][]
        return [{ id: p.id, originalUri: p.originalUri, croppedUri: p.croppedUri, embeddings, isNew: false }]
      }))
      setDoseIdx(slot.doseCountPerIntake - 1)
      setCycleConfig(safeParseJson<CycleConfig>(slot.cycleConfig) ?? { type: 'daily' })
      setCycleStartDate(slot.cycleStartDate)
      setPopupEnabled(slot.popupEnabled === 1)
      setAlarmEnabled(slot.alarmEnabled === 1)
      setForceAlarm(slot.forceAlarm === 1)
      setAlarmSound((slot.alarmSound ?? 'default') as AlarmSound)
      setVibrationEnabled(slot.vibrationEnabled === 1)
      const sc = slot.snoozeCount ?? 0
      setSnoozeEnabled(sc > 0)
      setSnoozeCountIdx(Math.max(0, sc - 1))
      const vw = slot.verificationWindowMin as VerificationWindow
      setVerificationWindow(VERIFICATION_WINDOWS.includes(vw) ? vw : 60)
    })
    return () => { cancelled = true }
  }, [slotId, editLoadKey])

  useEffect(() => {
    setRegisterDirty(isDirty || isEdit)
  }, [isDirty, isEdit])

  useEffect(() => {
    refPhotosRef.current = refPhotos
  }, [refPhotos])

  // Hide bottom tab bar while camera overlay is open
  useEffect(() => {
    navigation.setOptions({
      tabBarStyle: cameraOpen ? { display: 'none' } : undefined,
    })
    return () => navigation.setOptions({ tabBarStyle: undefined })
  }, [cameraOpen, navigation])

  useFocusEffect(
    useCallback(() => {
      // "나가기" 확정 후 re-focus 시에만 폼 초기화
      if (consumeRegisterReset()) {
        const hasFreshEditNavigation =
          Boolean(slotIdRef.current) &&
          editLoadKeyRef.current !== lastFocusedEditKeyRef.current

        if (!hasFreshEditNavigation) {
          const resetNow = new Date()
          setMedName('')
          setDoseIdx(0)
          setHour(resetNow.getHours())
          setMinute(resetNow.getMinutes())
          setCycleConfig({ type: 'daily' })
          setCycleStartDate(null)
          setRefPhotos([])
          setIsDirty(false)
          setPopupEnabled(true)
          setAlarmEnabled(true)
          setForceAlarm(false)
          setAlarmSound('default')
          setVibrationEnabled(true)
          setSnoozeEnabled(false)
          setSnoozeCountIdx(0)
          setVerificationWindow(60)
          slotIdRef.current = ''
          editLoadKeyRef.current = ''
          router.setParams({ slotId: '', editLoadKey: '' })
        }
      }
      lastFocusedEditKeyRef.current = editLoadKeyRef.current

      return () => {
        setCameraOpen(false)
        scrollRef.current?.scrollTo({ y: 0, animated: false })
        setRegisterDirty(false)
        // 저장 없이 이탈 시 추가했던 isNew 사진 파일 정리 (save 성공 시 ref가 [] 로 초기화됨)
        for (const p of refPhotosRef.current.filter(p => p.isNew)) {
          deleteAsync(p.croppedUri, { idempotent: true }).catch(() => {})
          if (p.originalUri) deleteAsync(p.originalUri, { idempotent: true }).catch(() => {})
        }
        refPhotosRef.current = []
      }
    }, [router]),
  )

  const markDirty = useCallback(() => {
    setIsDirty(true)
  }, [])

  const handleMedNameChange = useCallback(
    (text: string) => {
      setMedName(text)
      markDirty()
      setSuggestions(
        text.length > 0
          ? allMedNamesRef.current.filter(n =>
              n.toLowerCase().includes(text.toLowerCase()),
            )
          : [],
      )
    },
    [markDirty],
  )

  const handleAlarmToggle = useCallback((val: boolean) => {
    setAlarmEnabled(val)
    if (!val) {
      setForceAlarm(false)
      setSnoozeEnabled(false)
    }
    markDirty()
  }, [markDirty])

  const resolvedSnoozeCount = snoozeEnabled
    ? parseInt(SNOOZE_COUNT_ITEMS[snoozeCountIdx] ?? '1', 10)
    : 0
  const resolvedSnoozeIntervalMin = 5

  const openCamera = useCallback(async () => {
    if (!refPermission?.granted) {
      const res = await requestRefPermission()
      if (!res.granted) {
        Alert.alert('카메라 권한이 필요합니다')
        return
      }
    }
    setCameraOpen(true)
  }, [refPermission, requestRefPermission])

  const handleOpenCamera = useCallback(() => {
    const activePhotos = refPhotos.filter(p => !p.toDelete)
    if (activePhotos.length >= MAX_PHOTOS) {
      Alert.alert(`최대 ${MAX_PHOTOS}장까지 등록 가능합니다`)
      return
    }
    openCamera()
  }, [refPhotos, openCamera])

  const handleRefCapture = useCallback(async () => {
    if (!refCameraRef.current || refCapturing) return
    setRefCapturing(true)
    try {
      const photo = await refCameraRef.current.takePictureAsync({ base64: false })
      if (!photo) throw new Error('촬영 실패')
      const result = await captureReferenceImage({
        imageUri: photo.uri,
        frameWidth: photo.width,
        frameHeight: photo.height,
        doseCount: doseIdx + 1,
        onDebugInfo: setDebugInfo,
      })
      if (!result.ok) {
        if (__DEV__) setCameraOpen(false)
        if (result.reason === 'too_small') {
          Alert.alert('알약이 너무 작습니다', '더 가까이서 촬영해주세요')
        } else {
          Alert.alert('알약이 감지되지 않았습니다', '가이드 네모 안에 알약이 보이도록 다시 시도해주세요')
        }
        return
      }
      setRefPhotos(prev => [...prev, { originalUri: result.originalUri, croppedUri: result.croppedUri, embeddings: result.embeddings, isNew: true }])
      if (__DEV__ && result.devCroppedUris) setDevCropUris(result.devCroppedUris)
      markDirty()
      setCameraOpen(false)
    } catch (e) {
      Alert.alert('오류', e instanceof Error ? e.message : '촬영 중 오류가 발생했습니다')
    } finally {
      setRefCapturing(false)
    }
  }, [refCapturing, markDirty, doseIdx])

  const handleRemovePhoto = useCallback((index: number) => {
    setRefPhotos(prev => {
      const next = prev.map((p, i) => {
        if (i !== index) return p
        if (p.isNew) {
          deleteAsync(p.croppedUri, { idempotent: true }).catch(() => {})
          if (p.originalUri) deleteAsync(p.originalUri, { idempotent: true }).catch(() => {})
          return null
        }
        return { ...p, toDelete: true }
      })
      return next.filter((p): p is RefPhotoEntry => p !== null)
    })
    markDirty()
  }, [markDirty])

  const saveRefPhotos = async (medicationId: string) => {
    const insertedIds: string[] = []
    try {
      // Insert first so existing references are not lost if a new reference fails to persist.
      for (const p of refPhotos) {
        if (p.isNew && !p.toDelete) {
          const id = await insertReferenceImage({
            medicationId,
            originalUri: p.originalUri ?? p.croppedUri,
            croppedUri: p.croppedUri,
            embeddings: p.embeddings,
          })
          insertedIds.push(id)
        }
      }

      // Delete removed photos only after new refs are safely persisted.
      for (const p of refPhotos) {
        if (p.toDelete && p.id) {
          await deleteReferenceImage(p.id)
        }
      }
    } catch (e) {
      await Promise.all(insertedIds.map(id => deleteReferenceImage(id).catch(() => {})))
      throw e
    }
  }

  const handleSave = async () => {
    if (saving) return
    const name = medName.trim()
    if (!isEdit && !name) {
      Alert.alert('약 이름을 입력해 주세요')
      return
    }
    const activePhotos = refPhotos.filter(p => !p.toDelete)
    if (activePhotos.length < MIN_PHOTOS) {
      Alert.alert(`사진 등록 필요`, `최소 ${MIN_PHOTOS}장의 사진을 등록해주세요 (현재 ${activePhotos.length}장)`)
      return
    }
    setSaving(true)
    let createdSlotId: string | null = null
    let createdMedicationId: string | null = null
    let createdDoseRecordId: string | null = null
    try {
      if (isEdit && slotId) {
        const todayKey = getLocalDateKey()
        await updateTimeslot(slotId, {
          hour,
          minute,
          doseCountPerIntake: doseIdx + 1,
          cycleConfig: JSON.stringify(cycleConfig),
          cycleStartDate:
            cycleConfig.type === 'rest' ? (cycleStartDate ?? todayKey) : null,
          popupEnabled: popupEnabled ? 1 : 0,
          alarmEnabled: alarmEnabled ? 1 : 0,
          forceAlarm: forceAlarm ? 1 : 0,
          alarmSound,
          vibrationEnabled: vibrationEnabled ? 1 : 0,
          snoozeCount: resolvedSnoozeCount,
          snoozeIntervalMin: resolvedSnoozeIntervalMin,
          verificationWindowMin: verificationWindow,
        })
        const updatedSlot = await getTimeslotById(slotId)
        if (updatedSlot) {
          const updatedMed = await getMedicationById(updatedSlot.medicationId)
          const slotMedName = updatedMed?.name ?? ''
          // 오늘 복용 여부를 DB 기준으로 재조정
          const today = new Date()
          const newScheduledTime = toLocalISOString(
            new Date(today.getFullYear(), today.getMonth(), today.getDate(), hour, minute),
          )
          const todayDue = isTodayDue(updatedSlot, today)
          const existingRecord = await getTodayDoseRecordForSlot(slotId, todayKey)
          if (todayDue) {
            if (existingRecord) {
              // 이미 레코드 있음 → scheduledTime만 업데이트 (시간 변경 대응)
              await updateDoseRecordScheduledTimeForSlot(slotId, todayKey, newScheduledTime)
            } else {
              // 오늘이 새로 복용일 → pending 레코드 생성
              await insertDoseRecord({
                medicationId: updatedSlot.medicationId,
                medicationName: slotMedName,
                timeSlotId: slotId,
                dayKey: todayKey,
                scheduledTime: newScheduledTime,
                targetDoseCount: doseIdx + 1,
                status: 'pending',
              })
            }
          } else if (existingRecord?.status === 'pending') {
            // 오늘이 더 이상 복용일 아님 + pending → 삭제 (completed/missed/frozen은 유지)
            await deleteDoseRecord(existingRecord.id)
          }
          await scheduleAlarmsForSlot(updatedSlot, slotMedName)
          await scheduleForceAlarmsForSlot(updatedSlot, slotMedName)
          await saveRefPhotos(updatedSlot.medicationId)
        }
      } else {
        const existing = await getMedicationByName(name)
        const medicationId = existing?.id ?? (await insertMedication({ name }))
        if (!existing) createdMedicationId = medicationId

        const now = new Date()  // 저장 시점 기준 — render 시점 now와 다를 수 있음
        const todayKey = getLocalDateKey()
        const slotData = {
          medicationId,
          hour,
          minute,
          doseCountPerIntake: doseIdx + 1,
          cycleConfig: JSON.stringify(cycleConfig),
          cycleStartDate: cycleConfig.type === 'rest' ? todayKey : null,
          verificationWindowMin: verificationWindow,
          alarmEnabled: alarmEnabled ? 1 : 0,
          forceAlarm: forceAlarm ? 1 : 0,
          popupEnabled: popupEnabled ? 1 : 0,
          snoozeCount: resolvedSnoozeCount,
          snoozeIntervalMin: resolvedSnoozeIntervalMin,
          alarmSound,
          vibrationEnabled: vibrationEnabled ? 1 : 0,
          skipUntil: null,
          notificationIds: null,
          isActive: 1,
        }

        const newSlotId = await insertTimeslot(slotData)
        createdSlotId = newSlotId
        await upsertStreak(newSlotId, {})

        const newSlot = await getTimeslotById(newSlotId)
        if (newSlot) {
          await scheduleAlarmsForSlot(newSlot, name)
          await scheduleForceAlarmsForSlot(newSlot, name)
        }

        const slotForCycle = {
          cycleConfig: JSON.stringify(cycleConfig),
          cycleStartDate: slotData.cycleStartDate,
          isActive: 1,
        }
        if (isTodayDue(slotForCycle)) {
          const scheduledTime = toLocalISOString(
            new Date(
              now.getFullYear(),
              now.getMonth(),
              now.getDate(),
              hour,
              minute,
            ),
          )
          createdDoseRecordId = await insertDoseRecord({
            medicationId,
            medicationName: name,
            timeSlotId: newSlotId,
            dayKey: todayKey,
            scheduledTime,
            targetDoseCount: doseIdx + 1,
            status: 'pending',
          })
        }
        await saveRefPhotos(medicationId)
      }

      refPhotosRef.current = []  // cleanup이 저장된 파일을 삭제하지 않도록
      setRegisterDirty(false)
      setIsDirty(false)
      // 탭 URL에 캐시된 slotId를 초기화해 다음 방문 시 수정 모드가 잔존하지 않도록
      slotIdRef.current = ''
      editLoadKeyRef.current = ''
      lastFocusedEditKeyRef.current = ''
      router.setParams({ slotId: '', editLoadKey: '' })
      const resetNow = new Date()
      setMedName('')
      setDoseIdx(0)
      setHour(resetNow.getHours())
      setMinute(resetNow.getMinutes())
      setCycleConfig({ type: 'daily' })
      setCycleStartDate(null)
      setRefPhotos([])
      setPopupEnabled(true)
      setAlarmEnabled(true)
      setForceAlarm(false)
      setAlarmSound('default')
      setVibrationEnabled(true)
      setSnoozeEnabled(false)
      setSnoozeCountIdx(0)
      setVerificationWindow(60)
      router.navigate('/(tabs)/')
    } catch (e) {
      // Best-effort rollback for side effects that cannot share a DB transaction with files/notifications.
      if (createdDoseRecordId) {
        await deleteDoseRecord(createdDoseRecordId).catch(() => {})
      }
      if (createdSlotId) {
        await deleteTimeslot(createdSlotId).catch(() => {})
      }
      if (createdMedicationId) {
        await deleteMedication(createdMedicationId).catch(() => {})
      }
      Alert.alert('저장 실패', e instanceof Error ? e.message : '알 수 없는 오류')
    } finally {
      setSaving(false)
    }
  }

  return (
    <View style={s.root}>
      <ScrollView ref={scrollRef} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <Text style={s.title}>{isEdit ? '슬롯 수정' : '약 등록'}</Text>

        <View style={s.section}>
          <Text style={s.label}>약 이름</Text>
          {isEdit ? (
            <View style={s.readOnlyBox}>
              <Text style={s.readOnlyTxt}>{medName}</Text>
            </View>
          ) : (
            <>
              <TextInput
                style={s.input}
                placeholder="약 이름 입력"
                value={medName}
                onChangeText={handleMedNameChange}
                autoCorrect={false}
              />
              {suggestions.length > 0 && (
                <View style={s.suggestionBox}>
                  {suggestions.map(item => (
                    <TouchableOpacity
                      key={item}
                      style={s.suggestion}
                      onPress={() => {
                        setMedName(item)
                        setSuggestions([])
                        markDirty()
                      }}
                    >
                      <Text style={s.suggestionTxt}>{item}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}
        </View>

        <View style={s.section}>
          <Text style={s.label}>복용 수</Text>
          <View style={s.wheelRow}>
            <WheelColumn
              items={DOSE_ITEMS}
              selectedIndex={doseIdx}
              onIndexChange={i => { setDoseIdx(i); markDirty() }}
              width={80}
            />
            <Text style={s.unitTxt}>정</Text>
          </View>
          {doseIdx + 1 >= 5 && (
            <Text style={s.warn}>복용 수가 많으면 스캔 정확도가 낮아질 수 있습니다</Text>
          )}
        </View>

        <View style={s.section}>
          <Text style={s.label}>시간</Text>
          <View style={s.wheelRow}>
            <WheelColumn
              items={AMPM_ITEMS}
              selectedIndex={hour >= 12 ? 1 : 0}
              onIndexChange={i => {
                const h12 = hour % 12 === 0 ? 12 : hour % 12
                setHour(i === 0 ? (h12 === 12 ? 0 : h12) : (h12 === 12 ? 12 : h12 + 12))
                markDirty()
              }}
              width={64}
            />
            <WheelColumn
              items={HOUR_ITEMS}
              selectedIndex={(hour % 12 === 0 ? 12 : hour % 12) - 1}
              onIndexChange={i => {
                const h12 = i + 1
                const ampm = hour >= 12 ? 1 : 0
                setHour(ampm === 0 ? (h12 === 12 ? 0 : h12) : (h12 === 12 ? 12 : h12 + 12))
                markDirty()
              }}
              width={56}
              enableDirectInput
              numericInput
            />
            <Text style={[s.unitTxt, { alignSelf: 'center' }]}>:</Text>
            <WheelColumn
              items={MINUTE_ITEMS}
              selectedIndex={minute}
              onIndexChange={i => { setMinute(i); markDirty() }}
              width={56}
              enableDirectInput
              numericInput
            />
          </View>
        </View>

        <View style={s.section}>
          <Text style={s.label}>주기</Text>
          <CyclePicker
            value={cycleConfig}
            onChange={c => {
              setCycleConfig(c)
              if (c.type === 'rest' && cycleConfig.type !== 'rest') {
                setCycleStartDate(getLocalDateKey())
              } else if (c.type !== 'rest') {
                setCycleStartDate(null)
              }
              markDirty()
            }}
          />
        </View>

        {/* Verification window */}
        <View style={s.section}>
          <Text style={s.label}>인증 가능 시간</Text>
          <View style={s.segRow}>
            {VERIFICATION_WINDOWS.map(w => (
              <TouchableOpacity
                key={w}
                style={[s.seg, verificationWindow === w && s.segActive]}
                onPress={() => { setVerificationWindow(w); markDirty() }}
              >
                <Text style={[s.segTxt, verificationWindow === w && s.segTxtActive]}>
                  {w}분
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Alarm settings */}
        <View style={s.section}>
          <Text style={s.label}>알람 설정</Text>

          <ToggleRow
            label="팝업 알림"
            value={popupEnabled}
            onToggle={v => { setPopupEnabled(v); markDirty() }}
          />

          <ToggleRow
            label="알람"
            value={alarmEnabled}
            onToggle={handleAlarmToggle}
          />

          {alarmEnabled && (
            <View style={s.subSection}>
              <ToggleRow
                label="강제 알람"
                value={forceAlarm}
                onToggle={v => { setForceAlarm(v); markDirty() }}
              />

              <View style={s.rowSpread}>
                <Text style={s.rowLabel}>알람 소리</Text>
                <View style={s.segRow}>
                  {ALARM_SOUNDS.map(sound => (
                    <TouchableOpacity
                      key={sound}
                      style={[s.seg, alarmSound === sound && s.segActive]}
                      onPress={() => { setAlarmSound(sound); markDirty() }}
                    >
                      <Text style={[s.segTxt, alarmSound === sound && s.segTxtActive]}>
                        {soundLabel(sound)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <ToggleRow
                label="진동"
                value={vibrationEnabled}
                onToggle={v => { setVibrationEnabled(v); markDirty() }}
              />

              <ToggleRow
                label="스누즈"
                value={snoozeEnabled}
                onToggle={v => { setSnoozeEnabled(v); markDirty() }}
              />

              {snoozeEnabled && (
                <View style={s.snoozeBlock}>
                  <View style={s.snoozeRow}>
                    <Text style={s.snoozeLabel}>횟수</Text>
                    <WheelColumn
                      items={SNOOZE_COUNT_ITEMS}
                      selectedIndex={snoozeCountIdx}
                      onIndexChange={i => { setSnoozeCountIdx(i); markDirty() }}
                      width={64}
                    />
                    <Text style={s.unitTxt}>회</Text>
                  </View>
                </View>
              )}
            </View>
          )}
        </View>

        <View style={s.section}>
          <Text style={s.label}>사진 등록</Text>
          <Text style={s.photoHint}>
            최소 {MIN_PHOTOS}장 이상 등록해주세요 ({refPhotos.filter(p => !p.toDelete).length}/{MAX_PHOTOS})
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.photoRow}
            contentContainerStyle={{ gap: 8 }}>
            {refPhotos.map((photo, index) => {
              if (photo.toDelete) return null
              return (
                <View key={`${photo.id ?? 'new'}-${index}`} style={s.photoThumb}>
                  <Image source={{ uri: photo.croppedUri }} style={s.thumbImg} />
                  <TouchableOpacity style={s.thumbDelete} onPress={() => handleRemovePhoto(index)}>
                    <Text style={s.thumbDeleteTxt}>✕</Text>
                  </TouchableOpacity>
                </View>
              )
            })}
            {refPhotos.filter(p => !p.toDelete).length < MAX_PHOTOS && (
              <TouchableOpacity style={s.photoAddBtn} onPress={handleOpenCamera}>
                <Text style={s.photoAddTxt}>+</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      <View style={s.footer}>
        <TouchableOpacity
          style={[s.saveBtn, saving && s.saveBtnDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={s.saveBtnTxt}>{saving ? '저장 중...' : '저장'}</Text>
        </TouchableOpacity>
      </View>

      {/* Camera overlay for reference photo capture */}
      {cameraOpen && (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#000' }]}>
          {/* 정사각형 카메라 스테이지 — 화면 중앙 정렬 */}
          <View style={[s.camStage, { width: REG_STAGE_SIZE, height: REG_STAGE_SIZE, top: Math.round((SCREEN_H - REG_STAGE_SIZE) / 2) }]}>
            <CameraView ref={refCameraRef} style={StyleSheet.absoluteFill} facing="back" zoom={0.2} />
            <View style={s.camGuide} pointerEvents="none" />
          </View>
          <View style={s.camTopBar}>
            <TouchableOpacity style={s.camCloseBtn} onPress={() => setCameraOpen(false)}>
              <Text style={s.camCloseTxt}>✕</Text>
            </TouchableOpacity>
            <Text style={s.camHint}>알약이 가이드 안에 오도록 맞춰주세요</Text>
          </View>
          <View style={s.camBottom}>
            {refCapturing ? (
              <View style={s.camCaptureBtn}>
                <Text style={s.camCaptureTxt}>처리 중...</Text>
              </View>
            ) : (
              <TouchableOpacity style={s.camCaptureBtn} onPress={handleRefCapture}>
                <Text style={s.camCaptureTxt}>촬영</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Dev debug overlay — shown after reference capture */}
      {__DEV__ && debugInfo && (
        <View style={s.devOverlay}>
          <ScrollView style={{ width: '100%' }} contentContainerStyle={{ alignItems: 'center', paddingVertical: 16, gap: 12 }}>
            {/* Full photo with guide rect + bboxes */}
            <Text style={s.devSectionLabel}>전체 사진</Text>
            <View style={s.devImgWrap}>
              <Image source={{ uri: debugInfo.photoUri }} style={s.devImg} resizeMode="contain" />
              {(() => {
                const dispW = SCREEN_W - 48
                const scale = Math.min(dispW / debugInfo.actualW, DEV_IMG_H / debugInfo.actualH)
                const offX = (dispW - debugInfo.actualW * scale) / 2
                const offY = (DEV_IMG_H - debugInfo.actualH * scale) / 2
                const px = (v: number) => v * scale
                return (
                  <>
                    <View style={[s.devRect, {
                      left: offX + px(debugInfo.cropStartX),
                      top: offY + px(debugInfo.cropStartY),
                      width: px(debugInfo.cropSize),
                      height: px(debugInfo.cropSize),
                      borderColor: 'rgba(255,255,255,0.8)',
                    }]} pointerEvents="none" />
                    {debugInfo.bboxes.map((b, i) => (
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

            {debugInfo.guideUri && (
              <>
                <Text style={s.devSectionLabel}>YOLO 입력 이미지 (가이드 CROP)</Text>
                <View style={[s.devImgWrap, { marginBottom: 0 }]}>
                  <Image source={{ uri: debugInfo.guideUri }} style={s.devImg} resizeMode="contain" />
                  {(() => {
                    const dispW = SCREEN_W - 48
                    const cs = debugInfo.cropSize
                    const scale = Math.min(dispW / cs, DEV_IMG_H / cs)
                    const offX = (dispW - cs * scale) / 2
                    const offY = (DEV_IMG_H - cs * scale) / 2
                    const px = (v: number) => v * scale
                    return debugInfo.bboxes.map((b, i) => (
                      <View key={i} style={[s.devRect, {
                        left: offX + px(b.x - debugInfo.cropStartX),
                        top: offY + px(b.y - debugInfo.cropStartY),
                        width: px(b.width),
                        height: px(b.height),
                        borderColor: '#ef4444',
                      }]} pointerEvents="none">
                        <Text style={s.devBboxConf}>{(b.confidence * 100).toFixed(0)}%</Text>
                      </View>
                    ))
                  })()}
                </View>
              </>
            )}

            <Text style={s.devInfo}>
              {`photo: ${debugInfo.actualW}×${debugInfo.actualH}\ncrop: ${debugInfo.cropSize}px @ (${debugInfo.cropStartX}, ${debugInfo.cropStartY})\nbbox count: ${debugInfo.bboxes.length}`}
            </Text>
            {devCropUris.length > 0 && (
              <>
                <Text style={s.devSectionLabel}>bbox crop 결과 ({devCropUris.length}개)</Text>
                {devCropUris.map((uri, i) => (
                  <View key={i} style={{ alignItems: 'flex-start', width: '100%' }}>
                    <Text style={s.devInfo}>{`[${i}] ${i === 0 ? '저장됨' : '임시'}`}</Text>
                    <View style={s.devImgWrap}>
                      <Image source={{ uri }} style={s.devImg} resizeMode="contain" />
                    </View>
                  </View>
                ))}
              </>
            )}
            <TouchableOpacity style={s.devDismiss} onPress={() => {
              // index 0 은 croppedUri로 refPhotos가 관리하므로 1+만 삭제
              devCropUris.slice(1).forEach(u => deleteAsync(u, { idempotent: true }).catch(() => {}))
              setDevCropUris([])
              setDebugInfo(null)
            }}>
              <Text style={s.devDismissTxt}>닫기</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}
    </View>
  )
}

function ToggleRow({
  label,
  value,
  onToggle,
}: {
  label: string
  value: boolean
  onToggle: (v: boolean) => void
}) {
  return (
    <View style={s.rowSpread}>
      <Text style={s.rowLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: '#ddd', true: '#111' }}
        thumbColor="#fff"
      />
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  scroll: { paddingHorizontal: 24, paddingTop: 60 },
  title: { fontSize: 26, fontWeight: '700', color: '#111', marginBottom: 32 },
  section: { marginBottom: 28 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    height: 48,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#111',
  },
  readOnlyBox: {
    height: 48,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  readOnlyTxt: { fontSize: 16, color: '#555' },

  suggestionBox: {
    maxHeight: 160,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eee',
    marginTop: 4,
  },
  suggestion: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  suggestionTxt: { fontSize: 16, color: '#111' },
  wheelRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  unitTxt: { fontSize: 18, color: '#444', fontWeight: '500' },
  warn: { fontSize: 12, color: '#f59e0b', marginTop: 6 },
  timeBtn: {
    height: 52,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  timeTxt: { fontSize: 20, fontWeight: '600', color: '#111' },
  segRow: { flexDirection: 'row', gap: 6 },
  seg: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
  },
  segActive: { backgroundColor: '#111' },
  segTxt: { fontSize: 14, color: '#666', fontWeight: '500' },
  segTxtActive: { color: '#fff' },
  rowSpread: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  rowLabel: { fontSize: 15, color: '#222', fontWeight: '500' },
  subSection: {
    marginLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: '#eee',
    paddingLeft: 12,
    marginTop: 4,
  },
  snoozeBlock: { paddingVertical: 8, gap: 8 },
  snoozeRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  snoozeLabel: { fontSize: 14, color: '#666', width: 36 },
  stub: {
    height: 80,
    borderRadius: 12,
    backgroundColor: '#f5f5f5',
    alignItems: 'center',
    justifyContent: 'center',
    borderStyle: 'dashed',
    borderWidth: 1.5,
    borderColor: '#ddd',
  },
  stubTxt: { fontSize: 14, color: '#bbb' },
  photoHint: { fontSize: 12, color: '#999', marginBottom: 10 },
  photoRow: { marginBottom: 4 },
  photoThumb: {
    width: 80,
    height: 80,
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  thumbImg: { width: 80, height: 80 },
  thumbDelete: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbDeleteTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },
  photoAddBtn: {
    width: 80,
    height: 80,
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
    borderWidth: 1.5,
    borderColor: '#ddd',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoAddTxt: { fontSize: 28, color: '#bbb', lineHeight: 32 },
  // Camera overlay
  camTopBar: {
    position: 'absolute',
    top: 56,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  camCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  camCloseTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  camHint: {
    flex: 1,
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  camStage: {
    position: 'absolute',
    left: 0,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  camGuide: {
    position: 'absolute',
    width: REG_GUIDE_SIZE,
    height: REG_GUIDE_SIZE,
    left: (REG_STAGE_SIZE - REG_GUIDE_SIZE) / 2,
    top: (REG_STAGE_SIZE - REG_GUIDE_SIZE) / 2,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
    borderRadius: 12,
  },
  camBottom: {
    position: 'absolute',
    bottom: 80,
    alignSelf: 'center',
  },
  camCaptureBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  camCaptureTxt: { fontSize: 14, fontWeight: '700', color: '#111' },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingBottom: 40,
    paddingTop: 16,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eee',
  },
  saveBtn: {
    height: 54,
    borderRadius: 14,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnTxt: { fontSize: 17, fontWeight: '700', color: '#fff' },
  // Dev debug overlay
  devOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    zIndex: 99,
  },
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
  devInfo: {
    color: '#aaa',
    fontSize: 11,
    fontFamily: 'monospace',
    marginBottom: 16,
    lineHeight: 16,
    alignSelf: 'flex-start',
  },
  devDismiss: {
    paddingVertical: 12,
    paddingHorizontal: 40,
    borderRadius: 10,
    backgroundColor: '#fff',
  },
  devDismissTxt: { fontSize: 15, fontWeight: '700', color: '#111' },
  devSectionLabel: {
    color: '#aaa',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    alignSelf: 'flex-start',
    letterSpacing: 0.5,
  },
})
