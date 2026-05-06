import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@/components/AppIcon'
import { WheelColumn } from '@/components/WheelColumn'
import { Card, SecondaryButton, ui } from '@/components/ui/ProductUI'
import {
  DEFAULT_EXTERNAL_APP_LABEL,
} from '@/constants/appIdentity'
import {
  createMedicationWithTimes,
  getMedicationWithTimes,
  getMedicationWithTimesByReminder,
  updateMedicationWithTimes,
  type MedicationWithTimesInput,
  type ReminderTimeInput,
} from '@/domain/medicationSchedule/repository'
import { getSettings, notificationDefaultsForLanguage } from '@/domain/settings/repository'
import type { CycleConfig, LockScreenVisibility, ReminderIntensity, ReminderMode, ReminderPrivacyLevel, WidgetDisplayMode } from '@/db/schema'
import { getLocalDateKey } from '@/utils/dateUtils'
import { fmtTime } from '@/utils/timeUtils'
import { publishToast } from '@/utils/uiEvents'

const STEPS = ['name', 'time', 'alert', 'review'] as const
type StepKey = typeof STEPS[number]
type PrivacyMode = 'private' | 'aliasOnly' | 'visible'
type SectionKey = 'aliasName' | 'quantity' | 'times' | 'notificationTitle' | 'notificationBody'

type DraftTime = ReminderTimeInput & {
  localKey: string
  reminderMode: ReminderMode
  isEnabled: boolean
}

type Draft = {
  medicationId?: string
  aliasName: string
  actualName: string
  quantityTrackingEnabled: boolean
  remainingQuantity: string
  dosePerIntake: string
  times: DraftTime[]
  notificationTitle: string
  notificationBody: string
  language: string
  privacyMode: PrivacyMode
  reminderStrength: ReminderIntensity
  widgetDisplayMode: WidgetDisplayMode
  lockScreenVisibility: LockScreenVisibility
  badgeEnabled: boolean
  isActive: boolean
  cycleConfig: CycleConfig
}

type ValidationState = {
  aliasName?: string
  actualName?: string
  remainingQuantity?: string
  dosePerIntake?: string
  times?: string
  notificationTitle?: string
  notificationBody?: string
}

const HOURS = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'))
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'))
const PERIODS = ['오전', '오후']
const ACTION_BAR_HEIGHT = 124

const PRIVACY_OPTIONS: Array<{ value: PrivacyMode; label: string }> = [
  { value: 'private', label: '비공개' },
  { value: 'aliasOnly', label: '별칭' },
  { value: 'visible', label: '표시' },
]

const STRENGTH_OPTIONS: Array<{ value: ReminderIntensity; label: string }> = [
  { value: 'light', label: '약하게' },
  { value: 'normal', label: '보통' },
  { value: 'strong', label: '강하게' },
]

const WIDGET_OPTIONS: Array<{ value: WidgetDisplayMode; label: string }> = [
  { value: 'hidden', label: '숨김' },
  { value: 'aliasOnly', label: '별칭' },
  { value: 'timeOnly', label: '시간' },
  { value: 'full', label: '전체' },
]

const REMINDER_MODE_OPTIONS: Array<{ value: ReminderMode; label: string }> = [
  { value: 'off', label: '끔' },
  { value: 'notify', label: '알림만' },
  { value: 'scan', label: '스캔까지' },
]

function makeLocalKey() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function normalizeHour(periodIndex: number, hourIndex: number) {
  const hour12 = hourIndex + 1
  if (periodIndex === 0) return hour12 === 12 ? 0 : hour12
  return hour12 === 12 ? 12 : hour12 + 12
}

function hourToWheel(hour: number) {
  const periodIndex = hour < 12 ? 0 : 1
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return { periodIndex, hourIndex: hour12 - 1 }
}

function defaultTime() {
  const now = new Date()
  const hour = now.getMinutes() === 0 ? now.getHours() : (now.getHours() + 1) % 24
  return { hour, minute: 0 }
}

function sortTimes(times: DraftTime[]) {
  return [...times]
    .sort((left, right) => (left.hour * 60 + left.minute) - (right.hour * 60 + right.minute))
    .map((time, index) => ({ ...time, orderIndex: index }))
}

function formatTime(hour: number, minute: number) {
  return fmtTime(hour, minute, { am: '오전', pm: '오후' })
}

function toDigits(value: string) {
  return value.replace(/[^0-9]/g, '')
}

function parsePositiveNumber(value: string) {
  const digits = toDigits(value)
  if (!digits) return null
  return Number(digits)
}

function privacyLevel(mode: PrivacyMode): ReminderPrivacyLevel {
  if (mode === 'visible') return 'public'
  if (mode === 'aliasOnly') return 'custom'
  return 'hideMedicationName'
}

function privacyMode(level?: string | null): PrivacyMode {
  if (level === 'public') return 'visible'
  if (level === 'custom') return 'aliasOnly'
  return 'private'
}

function normalizeReminderStrength(value?: string | null): ReminderIntensity {
  if (value === 'light') return 'light'
  if (value === 'strong' || value === 'strict') return 'strong'
  return 'normal'
}

function normalizeReminderMode(mode?: string | null, enabled?: boolean | null): ReminderMode {
  if (mode === 'off' || mode === 'notify' || mode === 'scan') return mode
  return enabled === false ? 'off' : 'notify'
}

function normalizeWidgetDisplay(value?: string | null): WidgetDisplayMode {
  if (value === 'hidden' || value === 'timeOnly' || value === 'full') return value
  return 'aliasOnly'
}

function modeLabel(mode: ReminderMode) {
  return REMINDER_MODE_OPTIONS.find(option => option.value === mode)?.label ?? '알림만'
}

function defaultDraft(settings: Awaited<ReturnType<typeof getSettings>>): Draft {
  const defaults = notificationDefaultsForLanguage(settings.language)
  return {
    aliasName: '',
    actualName: '',
    quantityTrackingEnabled: false,
    remainingQuantity: '',
    dosePerIntake: '1',
    times: [],
    notificationTitle: localizedExistingCopy(settings.privateNotificationTitle, defaults.privateNotificationTitle, settings.language),
    notificationBody: localizedExistingCopy(settings.privateNotificationBody, defaults.privateNotificationBody, settings.language),
    language: settings.language,
    privacyMode: privacyMode(settings.defaultPrivacyLevel),
    reminderStrength: normalizeReminderStrength(settings.defaultReminderIntensity),
    widgetDisplayMode: normalizeWidgetDisplay(settings.defaultWidgetVisibility),
    lockScreenVisibility: (settings.defaultLockScreenVisibility as LockScreenVisibility) ?? 'neutral',
    badgeEnabled: settings.badgeEnabled === 1,
    isActive: true,
    cycleConfig: { type: 'daily', startDate: getLocalDateKey(), endDate: null },
  }
}

function hasJapaneseText(value?: string | null) {
  return /[\u3040-\u30ff]/.test(value ?? '')
}

function localizedExistingCopy(value: string | null | undefined, fallback: string, language?: string | null) {
  if (language !== 'ja' && hasJapaneseText(value)) return fallback
  return value ?? fallback
}

function resolvePreviewName(draft: Draft) {
  const alias = draft.aliasName.trim() || DEFAULT_EXTERNAL_APP_LABEL
  if (draft.privacyMode === 'visible') {
    return draft.actualName.trim() || alias
  }
  return alias
}

function resolveWidgetPreview(draft: Draft) {
  const previewTime = draft.times[0] ? formatTime(draft.times[0].hour, draft.times[0].minute) : '시간 미정'
  const previewName = resolvePreviewName(draft)

  if (draft.widgetDisplayMode === 'hidden') return '표시하지 않음'
  if (draft.widgetDisplayMode === 'timeOnly') return previewTime
  if (draft.widgetDisplayMode === 'aliasOnly') return draft.aliasName.trim() || DEFAULT_EXTERNAL_APP_LABEL
  return `${previewName} · ${previewTime}`
}

function draftToInput(draft: Draft): MedicationWithTimesInput {
  const aliasName = draft.aliasName.trim()
  const actualName = draft.actualName.trim() || null
  const remainingQuantity = parsePositiveNumber(draft.remainingQuantity) ?? 0
  const dosePerIntake = parsePositiveNumber(draft.dosePerIntake) ?? 1
  return {
    aliasName,
    actualName,
    quantityTrackingEnabled: draft.quantityTrackingEnabled,
    remainingQuantity: draft.quantityTrackingEnabled ? Math.max(0, remainingQuantity) : 0,
    dosePerIntake: draft.quantityTrackingEnabled ? Math.max(1, dosePerIntake) : 1,
    cycleConfig: draft.cycleConfig,
    privacyLevel: privacyLevel(draft.privacyMode),
    notificationTitle: draft.notificationTitle.trim(),
    notificationBody: draft.notificationBody.trim(),
    reminderIntensity: draft.reminderStrength,
    widgetDisplayMode: draft.widgetDisplayMode,
    lockScreenVisibility: draft.lockScreenVisibility,
    badgeEnabled: draft.badgeEnabled,
    isActive: draft.isActive,
    times: sortTimes(draft.times).map(time => ({
      id: time.id,
      hour: time.hour,
      minute: time.minute,
      isEnabled: time.reminderMode !== 'off',
      reminderMode: time.reminderMode,
      orderIndex: time.orderIndex,
    })),
  }
}

function validateDraft(draft: Draft): ValidationState {
  const validation: ValidationState = {}
  const aliasLength = draft.aliasName.trim().length
  const actualLength = draft.actualName.trim().length
  const remainingQuantity = parsePositiveNumber(draft.remainingQuantity)
  const dosePerIntake = parsePositiveNumber(draft.dosePerIntake)

  if (aliasLength === 0) {
    validation.aliasName = '이름을 입력해주세요'
  } else if (aliasLength > 16) {
    validation.aliasName = '이름은 16자 이하로 입력해주세요'
  }

  if (actualLength > 32) {
    validation.actualName = '실제 이름은 32자 이하로 입력해주세요'
  }

  if (draft.quantityTrackingEnabled) {
    if (remainingQuantity == null) {
      validation.remainingQuantity = '남은 수량을 입력해주세요'
    } else if (remainingQuantity <= 0) {
      validation.remainingQuantity = '남은 수량은 1 이상이어야 해요'
    }

    if (dosePerIntake == null) {
      validation.dosePerIntake = '1회 복용량을 입력해주세요'
    } else if (dosePerIntake <= 0) {
      validation.dosePerIntake = '1회 복용량은 1 이상이어야 해요'
    }
  }

  if (draft.times.length === 0) {
    validation.times = '시간을 하나 이상 추가해주세요'
  }

  if (draft.notificationTitle.trim().length === 0) {
    validation.notificationTitle = '알림 제목을 입력해주세요'
  }

  if (draft.notificationBody.trim().length === 0) {
    validation.notificationBody = '알림 문구를 입력해주세요'
  }

  return validation
}

function StepHeader({ step }: { step: StepKey }) {
  const title = step === 'name' ? '이름' : step === 'time' ? '시간' : step === 'alert' ? '알림' : '확인'
  return <Text style={styles.stepTitle}>{title}</Text>
}

function FieldLabel({ label, required = false }: { label: string; required?: boolean }) {
  return (
    <Text style={styles.fieldLabel}>
      {label}
      {required ? <Text style={styles.requiredMark}> *</Text> : null}
    </Text>
  )
}

function Segment<T extends string>({ value, options, onChange }: { value: T; options: Array<{ value: T; label: string }>; onChange: (value: T) => void }) {
  return (
    <View style={styles.segment}>
      {options.map(option => {
        const selected = option.value === value
        return (
          <TouchableOpacity key={option.value} style={[styles.segmentButton, selected && styles.segmentButtonOn]} onPress={() => onChange(option.value)}>
            <Text style={[styles.segmentText, selected && styles.segmentTextOn]}>{option.label}</Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

function ReminderModeSelector({ value, onChange }: { value: ReminderMode; onChange: (value: ReminderMode) => void }) {
  return (
    <View style={styles.modeSelector}>
      {REMINDER_MODE_OPTIONS.map(option => {
        const selected = option.value === value
        return (
          <TouchableOpacity
            key={option.value}
            style={[
              styles.modeOption,
              option.value === 'off' && selected && styles.modeOptionOff,
              option.value === 'notify' && selected && styles.modeOptionNotify,
              option.value === 'scan' && selected && styles.modeOptionScan,
            ]}
            onPress={() => onChange(option.value)}
          >
            <Text style={[styles.modeOptionText, selected && styles.modeOptionTextSelected]}>{option.label}</Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

export default function CheckItemScreen() {
  const { slotId, medicationId } = useLocalSearchParams<{ slotId?: string; medicationId?: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const scrollRef = useRef<ScrollView>(null)
  const sectionOffsetsRef = useRef<Record<SectionKey, number>>({
    aliasName: 0,
    quantity: 0,
    times: 0,
    notificationTitle: 0,
    notificationBody: 0,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [attemptedAdvance, setAttemptedAdvance] = useState(false)
  const [wheelInteracting, setWheelInteracting] = useState(false)
  const [timeActionError, setTimeActionError] = useState<string | null>(null)
  const initial = useMemo(() => defaultTime(), [])
  const initialWheel = hourToWheel(initial.hour)
  const [periodIndex, setPeriodIndex] = useState(initialWheel.periodIndex)
  const [hourIndex, setHourIndex] = useState(initialWheel.hourIndex)
  const [minuteIndex, setMinuteIndex] = useState(initial.minute)

  const recordSectionOffset = useCallback((key: SectionKey) => (event: LayoutChangeEvent) => {
    sectionOffsetsRef.current[key] = event.nativeEvent.layout.y
  }, [])

  const scrollToSection = useCallback((key: SectionKey) => {
    scrollRef.current?.scrollTo({ y: Math.max(0, sectionOffsetsRef.current[key] - 18), animated: true })
  }, [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      const settings = await getSettings()
      const baseDraft = defaultDraft(settings)
      const target = medicationId
        ? await getMedicationWithTimes(medicationId)
        : slotId
          ? await getMedicationWithTimesByReminder(slotId)
          : null

      if (!target) {
        if (!cancelled) {
          setDraft(baseDraft)
          setLoading(false)
        }
        return
      }

      const firstReminder = target.reminders[0]
      const loadedTimes = sortTimes(target.reminders.map(reminder => ({
        id: reminder.id,
        hour: reminder.hour,
        minute: reminder.minute,
        isEnabled: reminder.isEnabled !== 0,
        reminderMode: normalizeReminderMode(reminder.reminderMode, reminder.isEnabled !== 0),
        orderIndex: reminder.orderIndex,
        localKey: reminder.id,
      })))
      const wheelSource = loadedTimes[0] ?? defaultTime()
      const wheel = hourToWheel(wheelSource.hour)
      const nextDraft: Draft = {
        ...baseDraft,
        medicationId: target.medication.id,
        aliasName: target.medication.aliasName || target.medication.name,
        actualName: target.medication.actualName ?? '',
        quantityTrackingEnabled: target.medication.quantityTrackingEnabled === 1,
        remainingQuantity: target.medication.quantityTrackingEnabled === 1
          ? String(target.medication.remainingQuantity ?? target.medication.currentQuantity ?? '')
          : '',
        dosePerIntake: String(target.medication.dosePerIntake ?? firstReminder?.doseCountPerIntake ?? 1),
        times: loadedTimes,
        notificationTitle: localizedExistingCopy(firstReminder?.notificationTitle, baseDraft.notificationTitle, settings.language),
        notificationBody: localizedExistingCopy(firstReminder?.notificationBody, baseDraft.notificationBody, settings.language),
        privacyMode: privacyMode(target.medication.privacyLevel ?? firstReminder?.privacyLevel),
        reminderStrength: normalizeReminderStrength(target.medication.reminderIntensity ?? firstReminder?.reminderIntensity),
        widgetDisplayMode: normalizeWidgetDisplay(target.medication.widgetDisplayMode ?? firstReminder?.widgetVisibility),
        lockScreenVisibility: (firstReminder?.lockScreenVisibility as LockScreenVisibility) ?? baseDraft.lockScreenVisibility,
        badgeEnabled: firstReminder ? firstReminder.badgeEnabled === 1 : baseDraft.badgeEnabled,
        isActive: target.medication.isActive === 1,
        cycleConfig: firstReminder ? JSON.parse(firstReminder.cycleConfig) as CycleConfig : baseDraft.cycleConfig,
      }

      if (!cancelled) {
        setDraft(nextDraft)
        setPeriodIndex(wheel.periodIndex)
        setHourIndex(wheel.hourIndex)
        setMinuteIndex(wheelSource.minute)
        setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [medicationId, slotId])

  const activeStep = STEPS[stepIndex]
  const sortedTimes = useMemo(() => draft ? sortTimes(draft.times) : [], [draft])
  const validation = useMemo(() => draft ? validateDraft(draft) : {}, [draft])
  const allValid = useMemo(() => Object.values(validation).every(value => !value), [validation])

  const currentStepValid = useMemo(() => {
    if (!draft) return false
    if (activeStep === 'name') {
      return !validation.aliasName && !validation.actualName && !validation.remainingQuantity && !validation.dosePerIntake
    }
    if (activeStep === 'time') {
      return !validation.times && !timeActionError
    }
    if (activeStep === 'alert') {
      return !validation.notificationTitle && !validation.notificationBody
    }
    return allValid
  }, [activeStep, allValid, draft, timeActionError, validation])

  const updateDraft = useCallback((patch: Partial<Draft>) => {
    setDraft(current => current ? { ...current, ...patch } : current)
  }, [])

  const updateTime = useCallback((localKey: string, patch: Partial<DraftTime>) => {
    setTimeActionError(null)
    setDraft(current => current ? {
      ...current,
      times: sortTimes(current.times.map(time => {
        if (time.localKey !== localKey) return time
        const reminderMode = patch.reminderMode ?? time.reminderMode
        return {
          ...time,
          ...patch,
          reminderMode,
          isEnabled: reminderMode !== 'off',
        }
      })),
    } : current)
  }, [])

  const addSelectedTime = useCallback(() => {
    if (!draft) return

    const hour = normalizeHour(periodIndex, hourIndex)
    const minute = minuteIndex
    const exists = draft.times.some(time => time.hour === hour && time.minute === minute)
    if (exists) {
      setTimeActionError('이미 추가된 시간이에요')
      setAttemptedAdvance(true)
      scrollToSection('times')
      return
    }

    setTimeActionError(null)
    updateDraft({
      times: sortTimes([
        ...draft.times,
        {
          hour,
          minute,
          isEnabled: true,
          reminderMode: 'notify',
          orderIndex: draft.times.length,
          localKey: makeLocalKey(),
        },
      ]),
    })
  }, [draft, hourIndex, minuteIndex, periodIndex, scrollToSection, updateDraft])

  const deleteTime = useCallback((localKey: string) => {
    setTimeActionError(null)
    setDraft(current => current ? {
      ...current,
      times: sortTimes(current.times.filter(time => time.localKey !== localKey)),
    } : current)
  }, [])

  const goBack = useCallback(() => {
    if (saving) return
    if (stepIndex === 0) {
      router.back()
      return
    }
    setAttemptedAdvance(false)
    setStepIndex(index => Math.max(0, index - 1))
  }, [router, saving, stepIndex])

  const invalidSectionForStep = useCallback((step: StepKey): SectionKey | null => {
    if (step === 'name') {
      if (validation.aliasName || validation.actualName) return 'aliasName'
      if (validation.remainingQuantity || validation.dosePerIntake) return 'quantity'
      return null
    }
    if (step === 'time') {
      return validation.times || timeActionError ? 'times' : null
    }
    if (step === 'alert') {
      if (validation.notificationTitle) return 'notificationTitle'
      if (validation.notificationBody) return 'notificationBody'
      return null
    }

    return invalidSectionForStep('name') ?? invalidSectionForStep('time') ?? invalidSectionForStep('alert')
  }, [timeActionError, validation])

  const handleInvalidAdvance = useCallback((step: StepKey) => {
    setAttemptedAdvance(true)
    const invalidSection = invalidSectionForStep(step)
    if (invalidSection) {
      scrollToSection(invalidSection)
    }
  }, [invalidSectionForStep, scrollToSection])

  const save = useCallback(async () => {
    if (!draft) return
    if (!allValid) {
      handleInvalidAdvance('review')
      return
    }

    setSaving(true)
    try {
      const input = draftToInput({ ...draft, times: sortedTimes })
      const toastMessage = draft.medicationId ? '수정했어요' : '저장했어요'
      if (draft.medicationId) {
        await updateMedicationWithTimes(draft.medicationId, input)
      } else {
        await createMedicationWithTimes(input)
      }
      router.back()
      setTimeout(() => publishToast(toastMessage), 140)
    } catch (error) {
      Alert.alert('저장 실패', error instanceof Error ? error.message : undefined)
    } finally {
      setSaving(false)
    }
  }, [allValid, draft, handleInvalidAdvance, router, sortedTimes])

  const goNext = useCallback(() => {
    if (saving) return
    if (activeStep === 'review') {
      void save()
      return
    }
    if (!currentStepValid) {
      handleInvalidAdvance(activeStep)
      return
    }
    setAttemptedAdvance(false)
    setStepIndex(index => Math.min(STEPS.length - 1, index + 1))
  }, [activeStep, currentStepValid, handleInvalidAdvance, save, saving])

  const leftButtonLabel = stepIndex === 0 ? '닫기' : '이전'
  const rightButtonLabel = activeStep === 'review' ? '저장하기' : '다음'

  if (loading || !draft) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator color={ui.color.orange} />
      </View>
    )
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.iconButton} onPress={goBack} disabled={saving}>
          <Ionicons name={stepIndex === 0 ? 'close' : 'chevron-back'} size={22} color={ui.color.textPrimary} />
        </TouchableOpacity>
        <View style={styles.progressRow}>
          {STEPS.map((step, index) => <View key={step} style={[styles.progressSegment, index <= stepIndex && styles.progressSegmentOn]} />)}
        </View>
        <View style={styles.iconButton} />
      </View>

      <ScrollView
        ref={scrollRef}
        scrollEnabled={!wheelInteracting}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.scroll, { paddingBottom: ACTION_BAR_HEIGHT + insets.bottom + 32 }]}
      >
        <StepHeader step={activeStep} />

        {activeStep === 'name' ? (
          <View style={styles.stack}>
            <View onLayout={recordSectionOffset('aliasName')}>
              <FieldLabel label="이름" required />
              <TextInput
                style={[styles.largeInput, validation.aliasName && styles.inputError]}
                placeholder="이름"
                placeholderTextColor={ui.color.textSecondary}
                value={draft.aliasName}
                onChangeText={aliasName => updateDraft({ aliasName })}
              />
              {validation.aliasName ? <Text style={styles.errorText}>{validation.aliasName}</Text> : null}
            </View>

            <View>
              <FieldLabel label="실제 이름" />
              <TextInput
                style={[styles.input, validation.actualName && styles.inputError]}
                placeholder="실제 이름"
                placeholderTextColor={ui.color.textSecondary}
                value={draft.actualName}
                onChangeText={actualName => updateDraft({ actualName })}
              />
              {validation.actualName ? <Text style={styles.errorText}>{validation.actualName}</Text> : null}
            </View>

            <Card style={styles.inventoryCard}>
              <View onLayout={recordSectionOffset('quantity')} style={styles.quantityHeader}>
                <FieldLabel label="수량 추적" />
                <Switch
                  value={draft.quantityTrackingEnabled}
                  onValueChange={value => updateDraft({ quantityTrackingEnabled: value, dosePerIntake: value ? (draft.dosePerIntake || '1') : '1' })}
                  trackColor={{ false: '#D8D8D8', true: '#FFD08A' }}
                  thumbColor={draft.quantityTrackingEnabled ? ui.color.orange : '#FFFFFF'}
                />
              </View>

              {draft.quantityTrackingEnabled ? (
                <View style={styles.metricGrid}>
                  <View style={styles.metricField}>
                    <FieldLabel label="남은 수량" required />
                    <TextInput
                      style={[styles.metricInput, validation.remainingQuantity && styles.metricInputError]}
                      keyboardType="number-pad"
                      value={draft.remainingQuantity}
                      onChangeText={value => updateDraft({ remainingQuantity: toDigits(value) })}
                    />
                    {validation.remainingQuantity ? <Text style={styles.errorText}>{validation.remainingQuantity}</Text> : null}
                  </View>
                  <View style={styles.metricField}>
                    <FieldLabel label="1회 복용량" required />
                    <TextInput
                      style={[styles.metricInput, validation.dosePerIntake && styles.metricInputError]}
                      keyboardType="number-pad"
                      value={draft.dosePerIntake}
                      onChangeText={value => updateDraft({ dosePerIntake: toDigits(value) })}
                    />
                    {validation.dosePerIntake ? <Text style={styles.errorText}>{validation.dosePerIntake}</Text> : null}
                  </View>
                </View>
              ) : (
                <View style={styles.quantityOffPill}>
                  <Text style={styles.quantityOffText}>꺼짐</Text>
                </View>
              )}
            </Card>
          </View>
        ) : null}

        {activeStep === 'time' ? (
          <View style={styles.stack} onLayout={recordSectionOffset('times')}>
            <FieldLabel label="추가된 시간" required />
            <Card style={styles.wheelCard}>
              <View style={styles.wheelRow}>
                <WheelColumn items={PERIODS} selectedIndex={periodIndex} onIndexChange={setPeriodIndex} width={72} onInteractionChange={setWheelInteracting} />
                <WheelColumn items={HOURS} selectedIndex={hourIndex} onIndexChange={setHourIndex} width={74} enableDirectInput numericInput onInteractionChange={setWheelInteracting} />
                <Text style={styles.colon}>:</Text>
                <WheelColumn items={MINUTES} selectedIndex={minuteIndex} onIndexChange={setMinuteIndex} width={74} enableDirectInput numericInput onInteractionChange={setWheelInteracting} />
              </View>
            </Card>
            <SecondaryButton label="시간 추가" icon="add" onPress={addSelectedTime} />
            {timeActionError ? <Text style={styles.errorText}>{timeActionError}</Text> : null}
            {!timeActionError && validation.times ? <Text style={styles.errorText}>{attemptedAdvance || draft.times.length === 0 ? validation.times : ''}</Text> : null}

            {sortedTimes.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>아직 추가된 시간이 없어요</Text>
              </View>
            ) : (
              <View style={styles.timeListBlock}>
                {sortedTimes.map(time => (
                  <View key={time.localKey} style={styles.reminderRow}>
                    <View style={styles.reminderRowCopy}>
                      <View style={[
                        styles.reminderDot,
                        time.reminderMode === 'off' ? styles.reminderDotOff : time.reminderMode === 'scan' ? styles.reminderDotScan : styles.reminderDotNotify,
                      ]} />
                      <Text style={styles.reminderTimeText}>{formatTime(time.hour, time.minute)}</Text>
                      <Text style={styles.reminderModeText}>{modeLabel(time.reminderMode)}</Text>
                    </View>
                    <View style={styles.reminderRowActions}>
                      <ReminderModeSelector
                        value={time.reminderMode}
                        onChange={reminderMode => updateTime(time.localKey, { reminderMode })}
                      />
                      <TouchableOpacity style={styles.deleteIconButton} onPress={() => deleteTime(time.localKey)} accessibilityLabel="삭제">
                        <Ionicons name="trash-outline" size={18} color={ui.color.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        ) : null}

        {activeStep === 'alert' ? (
          <View style={styles.stack}>
            <Card style={styles.previewCard}>
              <Text style={styles.cardTitle}>미리보기</Text>
              <View style={styles.previewRow}>
                <Text style={styles.previewLabel}>표시</Text>
                <Text style={styles.previewValue}>{resolvePreviewName(draft)}</Text>
              </View>
              <View style={styles.previewRow}>
                <Text style={styles.previewLabel}>위젯</Text>
                <Text style={styles.previewValue}>{resolveWidgetPreview(draft)}</Text>
              </View>
            </Card>

            <View onLayout={recordSectionOffset('notificationTitle')}>
              <FieldLabel label="알림 제목" required />
              <TextInput
                style={[styles.input, validation.notificationTitle && styles.inputError]}
                placeholder="알림 제목"
                placeholderTextColor={ui.color.textSecondary}
                value={draft.notificationTitle}
                onChangeText={notificationTitle => updateDraft({ notificationTitle })}
              />
              {validation.notificationTitle ? <Text style={styles.errorText}>{validation.notificationTitle}</Text> : null}
            </View>

            <View onLayout={recordSectionOffset('notificationBody')}>
              <FieldLabel label="알림 문구" required />
              <TextInput
                style={[styles.input, validation.notificationBody && styles.inputError]}
                placeholder="알림 문구"
                placeholderTextColor={ui.color.textSecondary}
                value={draft.notificationBody}
                onChangeText={notificationBody => updateDraft({ notificationBody })}
              />
              {validation.notificationBody ? <Text style={styles.errorText}>{validation.notificationBody}</Text> : null}
            </View>

            <View style={styles.optionBlock}>
              <FieldLabel label="공개 범위" />
              <Segment value={draft.privacyMode} options={PRIVACY_OPTIONS} onChange={privacyMode => updateDraft({ privacyMode })} />
            </View>

            <View style={styles.optionBlock}>
              <FieldLabel label="위젯" />
              <Segment value={draft.widgetDisplayMode} options={WIDGET_OPTIONS} onChange={widgetDisplayMode => updateDraft({ widgetDisplayMode })} />
              <View style={styles.previewMiniRow}>
                <Text style={styles.previewLabel}>미리보기</Text>
                <Text style={styles.previewValue}>{resolveWidgetPreview(draft)}</Text>
              </View>
            </View>

            <View style={styles.optionBlock}>
              <FieldLabel label="알림 강도" />
              <Segment value={draft.reminderStrength} options={STRENGTH_OPTIONS} onChange={reminderStrength => updateDraft({ reminderStrength })} />
            </View>
          </View>
        ) : null}

        {activeStep === 'review' ? (
          <View style={styles.stack}>
            <Card style={styles.reviewCard}>
              <Text style={styles.cardTitle}>이름</Text>
              <ReviewRow label="이름" value={draft.aliasName.trim() || '-'} />
              <ReviewRow label="실제 이름" value={draft.actualName.trim() || '-'} />
            </Card>

            <Card style={styles.reviewCard}>
              <Text style={styles.cardTitle}>수량 추적</Text>
              <ReviewRow label="수량 추적" value={draft.quantityTrackingEnabled ? '켜짐' : '꺼짐'} />
              {draft.quantityTrackingEnabled ? (
                <>
                  <ReviewRow label="남은 수량" value={draft.remainingQuantity || '0'} />
                  <ReviewRow label="1회 복용량" value={draft.dosePerIntake || '1'} />
                </>
              ) : null}
            </Card>

            <Card style={styles.reviewCard}>
              <Text style={styles.cardTitle}>시간 목록</Text>
              {sortedTimes.map(time => (
                <View key={time.localKey} style={styles.reviewTimeRow}>
                  <Text style={styles.reviewTimeText}>{formatTime(time.hour, time.minute)}</Text>
                  <Text style={styles.reviewTimeState}>{modeLabel(time.reminderMode)}</Text>
                </View>
              ))}
            </Card>

            <Card style={styles.reviewCard}>
              <Text style={styles.cardTitle}>알림</Text>
              <ReviewRow label="공개 범위" value={PRIVACY_OPTIONS.find(option => option.value === draft.privacyMode)?.label ?? '-'} />
              <ReviewRow label="위젯" value={WIDGET_OPTIONS.find(option => option.value === draft.widgetDisplayMode)?.label ?? '-'} />
              <ReviewRow label="알림 강도" value={STRENGTH_OPTIONS.find(option => option.value === draft.reminderStrength)?.label ?? '-'} />
              <ReviewRow label="알림 제목" value={draft.notificationTitle.trim() || '-'} />
              <ReviewRow label="알림 문구" value={draft.notificationBody.trim() || '-'} />
            </Card>
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity style={styles.footerSecondaryButton} onPress={goBack} disabled={saving}>
          <Text style={styles.footerSecondaryText}>{leftButtonLabel}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.footerPrimaryButton, (!currentStepValid || saving) && styles.footerPrimaryDisabled]}
          onPress={goNext}
          disabled={saving}
        >
          <Text style={styles.footerPrimaryText}>{saving ? '저장 중' : rightButtonLabel}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={styles.reviewValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: ui.color.background,
  },
  loadingState: {
    alignItems: 'center',
    backgroundColor: ui.color.background,
    flex: 1,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  iconButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  progressRow: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
  },
  progressSegment: {
    backgroundColor: '#E2E4E8',
    borderRadius: 999,
    flex: 1,
    height: 5,
  },
  progressSegmentOn: {
    backgroundColor: ui.color.textPrimary,
  },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 18,
  },
  stepTitle: {
    color: ui.color.textPrimary,
    fontSize: 48,
    fontWeight: '800',
    letterSpacing: 0,
    marginBottom: 24,
  },
  stack: {
    gap: 14,
  },
  fieldLabel: {
    color: ui.color.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 8,
  },
  requiredMark: {
    color: '#EF4444',
  },
  largeInput: {
    backgroundColor: ui.color.input,
    borderRadius: 16,
    color: ui.color.textPrimary,
    fontSize: 30,
    fontWeight: '800',
    minHeight: 70,
    paddingHorizontal: 18,
  },
  input: {
    backgroundColor: ui.color.input,
    borderRadius: 14,
    color: ui.color.textPrimary,
    fontSize: 17,
    fontWeight: '600',
    minHeight: 56,
    paddingHorizontal: 16,
  },
  inputError: {
    borderColor: '#F3A4A4',
    borderWidth: 1,
  },
  errorText: {
    color: '#B4532A',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 8,
  },
  inventoryCard: {
    gap: 14,
  },
  quantityHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  quantityOffPill: {
    alignSelf: 'flex-start',
    backgroundColor: ui.color.input,
    borderRadius: 999,
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  quantityOffText: {
    color: ui.color.textSecondary,
    fontSize: 13,
    fontWeight: '800',
  },
  cardTitle: {
    color: ui.color.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  metricGrid: {
    flexDirection: 'column',
    gap: 10,
  },
  metricField: {
    backgroundColor: ui.color.input,
    borderRadius: 12,
    gap: 8,
    padding: 12,
  },
  metricInput: {
    color: ui.color.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    padding: 0,
  },
  metricInputError: {
    color: ui.color.danger,
  },
  wheelCard: {
    paddingVertical: 18,
  },
  wheelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: 280,
  },
  colon: {
    color: ui.color.textPrimary,
    fontSize: 34,
    fontWeight: '800',
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: ui.color.softCard,
    borderRadius: 18,
    justifyContent: 'center',
    minHeight: 72,
    paddingHorizontal: 16,
  },
  emptyText: {
    color: ui.color.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  timeListBlock: {
    gap: 10,
  },
  reminderRow: {
    alignItems: 'center',
    backgroundColor: ui.color.input,
    borderRadius: 18,
    justifyContent: 'space-between',
    minHeight: 66,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  reminderRowCopy: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  reminderRowActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    width: '100%',
  },
  reminderDot: {
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  reminderDotNotify: {
    backgroundColor: ui.color.orange,
  },
  reminderDotScan: {
    backgroundColor: ui.color.textPrimary,
  },
  reminderDotOff: {
    backgroundColor: '#AEB4BE',
  },
  reminderTimeText: {
    color: ui.color.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  reminderModeText: {
    color: ui.color.textSecondary,
    fontSize: 13,
    fontWeight: '800',
  },
  modeSelector: {
    backgroundColor: '#FFFFFF',
    borderColor: ui.color.border,
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    minHeight: 40,
    padding: 3,
  },
  modeOption: {
    alignItems: 'center',
    borderRadius: 12,
    flex: 1,
    justifyContent: 'center',
    minHeight: 34,
  },
  modeOptionOff: {
    backgroundColor: '#ECEDEF',
  },
  modeOptionNotify: {
    backgroundColor: ui.color.orangeLight,
  },
  modeOptionScan: {
    backgroundColor: ui.color.textPrimary,
  },
  modeOptionText: {
    color: ui.color.textSecondary,
    fontSize: 12,
    fontWeight: '800',
  },
  modeOptionTextSelected: {
    color: '#FFFFFF',
  },
  deleteIconButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  previewCard: {
    backgroundColor: ui.color.softCard,
    gap: 10,
  },
  optionBlock: {
    gap: 8,
  },
  segment: {
    backgroundColor: ui.color.input,
    borderRadius: 14,
    flexDirection: 'row',
    padding: 4,
  },
  segmentButton: {
    alignItems: 'center',
    borderRadius: 11,
    flex: 1,
    minHeight: 42,
    justifyContent: 'center',
  },
  segmentButtonOn: {
    backgroundColor: ui.color.card,
    borderColor: ui.color.border,
    borderWidth: 1,
  },
  segmentText: {
    color: ui.color.textSecondary,
    fontSize: 14,
    fontWeight: '800',
  },
  segmentTextOn: {
    color: ui.color.textPrimary,
  },
  previewRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 40,
  },
  previewMiniRow: {
    alignItems: 'center',
    backgroundColor: ui.color.softCard,
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 46,
    paddingHorizontal: 14,
  },
  previewLabel: {
    color: ui.color.textSecondary,
    fontSize: 13,
    fontWeight: '800',
  },
  previewValue: {
    color: ui.color.textPrimary,
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'right',
  },
  reviewCard: {
    gap: 8,
  },
  reviewRow: {
    alignItems: 'center',
    borderBottomColor: ui.color.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  reviewLabel: {
    color: ui.color.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  reviewValue: {
    color: ui.color.textPrimary,
    flexShrink: 1,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'right',
  },
  reviewTimeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 38,
  },
  reviewTimeText: {
    color: ui.color.textPrimary,
    fontSize: 17,
    fontWeight: '800',
  },
  reviewTimeState: {
    color: ui.color.textSecondary,
    fontSize: 13,
    fontWeight: '800',
  },
  footer: {
    backgroundColor: '#FFFFFF',
    borderTopColor: ui.color.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  footerSecondaryButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D7DADF',
    borderRadius: 18,
    borderWidth: 1,
    flex: 40,
    height: 56,
    justifyContent: 'center',
  },
  footerSecondaryText: {
    color: ui.color.textPrimary,
    fontSize: 16,
    fontWeight: '800',
  },
  footerPrimaryButton: {
    alignItems: 'center',
    backgroundColor: ui.color.textPrimary,
    borderRadius: 18,
    flex: 60,
    height: 56,
    justifyContent: 'center',
  },
  footerPrimaryDisabled: {
    backgroundColor: '#D8D8D8',
  },
  footerPrimaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
})
