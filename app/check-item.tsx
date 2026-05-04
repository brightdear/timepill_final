import React, { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@/components/AppIcon'
import { WheelColumn } from '@/components/WheelColumn'
import { Card, SecondaryButton, TimeRow, ui } from '@/components/ui/ProductUI'
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
import type { CycleConfig, LockScreenVisibility, ReminderIntensity, ReminderPrivacyLevel, WidgetVisibility } from '@/db/schema'
import { getLocalDateKey } from '@/utils/dateUtils'
import { fmtTime } from '@/utils/timeUtils'
import { publishToast } from '@/utils/uiEvents'

const STEPS = ['name', 'time', 'alert', 'review'] as const
type StepKey = typeof STEPS[number]
type ReminderStrength = Exclude<ReminderIntensity, 'custom'>
type PrivacyMode = 'private' | 'aliasOnly' | 'visible'

type DraftTime = ReminderTimeInput & {
  localKey: string
}

type Draft = {
  medicationId?: string
  aliasName: string
  actualName: string
  totalQuantity: number
  remainingQuantity: number
  dosePerIntake: number
  times: DraftTime[]
  notificationTitle: string
  notificationBody: string
  language: string
  privacyMode: PrivacyMode
  reminderStrength: ReminderStrength
  widgetVisibility: WidgetVisibility
  lockScreenVisibility: LockScreenVisibility
  badgeEnabled: boolean
  isActive: boolean
  cycleConfig: CycleConfig
}

const HOURS = Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, '0'))
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'))
const PERIODS = ['오전', '오후']

const PRIVACY_OPTIONS: Array<{ value: PrivacyMode; label: string }> = [
  { value: 'private', label: '비공개' },
  { value: 'aliasOnly', label: '별칭' },
  { value: 'visible', label: '표시' },
]

const STRENGTH_OPTIONS: Array<{ value: ReminderStrength; label: string }> = [
  { value: 'light', label: '약하게' },
  { value: 'standard', label: '보통' },
  { value: 'strict', label: '강하게' },
]

const WIDGET_OPTIONS: Array<{ value: WidgetVisibility; label: string }> = [
  { value: 'aliasOnly', label: '별칭' },
  { value: 'timeOnly', label: '시간' },
  { value: 'full', label: '전체' },
  { value: 'hidden', label: '숨김' },
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
  const seen = new Set<string>()
  return [...times]
    .sort((left, right) => (left.hour * 60 + left.minute) - (right.hour * 60 + right.minute))
    .filter(time => {
      const key = `${time.hour}:${time.minute}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map((time, index) => ({ ...time, orderIndex: index }))
}

function formatTime(hour: number, minute: number) {
  return fmtTime(hour, minute, { am: '오전', pm: '오후' })
}

function countInput(value: string, minimum = 0) {
  const digits = value.replace(/[^0-9]/g, '')
  if (!digits) return minimum
  return Math.max(minimum, Number(digits))
}

function privacyLevel(mode: PrivacyMode): ReminderPrivacyLevel {
  if (mode === 'visible') return 'public'
  if (mode === 'aliasOnly') return 'custom'
  return 'private'
}

function privacyMode(level?: string | null): PrivacyMode {
  if (level === 'public') return 'visible'
  if (level === 'custom') return 'aliasOnly'
  return 'private'
}

function defaultDraft(settings: Awaited<ReturnType<typeof getSettings>>): Draft {
  const time = defaultTime()
  const defaults = notificationDefaultsForLanguage(settings.language)
  return {
    aliasName: '',
    actualName: '',
    totalQuantity: 0,
    remainingQuantity: 0,
    dosePerIntake: 1,
    times: [{ ...time, isEnabled: true, orderIndex: 0, localKey: makeLocalKey() }],
    notificationTitle: localizedExistingCopy(settings.privateNotificationTitle, defaults.privateNotificationTitle, settings.language),
    notificationBody: localizedExistingCopy(settings.privateNotificationBody, defaults.privateNotificationBody, settings.language),
    language: settings.language,
    privacyMode: privacyMode(settings.defaultPrivacyLevel),
    reminderStrength: settings.defaultReminderIntensity === 'light' || settings.defaultReminderIntensity === 'strict'
      ? settings.defaultReminderIntensity
      : 'standard',
    widgetVisibility: (settings.defaultWidgetVisibility as WidgetVisibility) ?? 'aliasOnly',
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

function draftToInput(draft: Draft): MedicationWithTimesInput {
  const aliasName = draft.aliasName.trim()
  const actualName = draft.actualName.trim() || null
  const defaults = notificationDefaultsForLanguage(draft.language)
  return {
    aliasName,
    actualName,
    totalQuantity: Number.isFinite(draft.totalQuantity) ? Math.max(0, draft.totalQuantity) : 0,
    remainingQuantity: Number.isFinite(draft.remainingQuantity)
      ? Math.max(0, draft.remainingQuantity)
      : Math.max(0, draft.totalQuantity || 0),
    dosePerIntake: Number.isFinite(draft.dosePerIntake) ? Math.max(1, draft.dosePerIntake) : 1,
    cycleConfig: draft.cycleConfig,
    privacyLevel: privacyLevel(draft.privacyMode),
    notificationTitle: draft.privacyMode === 'aliasOnly'
      ? (aliasName || DEFAULT_EXTERNAL_APP_LABEL)
      : (draft.notificationTitle.trim() || defaults.privateNotificationTitle),
    notificationBody: draft.notificationBody.trim() || defaults.privateNotificationBody,
    reminderIntensity: draft.reminderStrength,
    widgetVisibility: draft.widgetVisibility,
    lockScreenVisibility: draft.lockScreenVisibility,
    badgeEnabled: draft.badgeEnabled,
    isActive: draft.isActive,
    times: sortTimes(draft.times).map(time => ({
      id: time.id,
      hour: time.hour,
      minute: time.minute,
      isEnabled: time.isEnabled,
      orderIndex: time.orderIndex,
    })),
  }
}

function StepHeader({ step }: { step: StepKey }) {
  const title = step === 'name' ? '이름' : step === 'time' ? '시간' : step === 'alert' ? '알림' : '확인'
  return <Text style={styles.stepTitle}>{title}</Text>
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

export default function CheckItemScreen() {
  const { slotId, medicationId } = useLocalSearchParams<{ slotId?: string; medicationId?: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [draft, setDraft] = useState<Draft | null>(null)
  const initial = useMemo(() => defaultTime(), [])
  const initialWheel = hourToWheel(initial.hour)
  const [periodIndex, setPeriodIndex] = useState(initialWheel.periodIndex)
  const [hourIndex, setHourIndex] = useState(initialWheel.hourIndex)
  const [minuteIndex, setMinuteIndex] = useState(initial.minute)

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
      const nextDraft: Draft = {
        ...baseDraft,
        medicationId: target.medication.id,
        aliasName: target.medication.aliasName || target.medication.name,
        actualName: target.medication.actualName ?? '',
        totalQuantity: target.medication.totalQuantity ?? 0,
        remainingQuantity: target.medication.remainingQuantity ?? target.medication.currentQuantity ?? 0,
        dosePerIntake: target.medication.dosePerIntake ?? firstReminder?.doseCountPerIntake ?? 1,
        times: target.reminders.map(reminder => ({
          id: reminder.id,
          hour: reminder.hour,
          minute: reminder.minute,
          isEnabled: reminder.isEnabled !== 0,
          orderIndex: reminder.orderIndex,
          localKey: reminder.id,
        })),
        notificationTitle: localizedExistingCopy(firstReminder?.notificationTitle, baseDraft.notificationTitle, settings.language),
        notificationBody: localizedExistingCopy(firstReminder?.notificationBody, baseDraft.notificationBody, settings.language),
        privacyMode: privacyMode(firstReminder?.privacyLevel),
        reminderStrength: firstReminder?.reminderIntensity === 'light' || firstReminder?.reminderIntensity === 'strict'
          ? firstReminder.reminderIntensity
          : 'standard',
        widgetVisibility: (firstReminder?.widgetVisibility as WidgetVisibility) ?? baseDraft.widgetVisibility,
        lockScreenVisibility: (firstReminder?.lockScreenVisibility as LockScreenVisibility) ?? baseDraft.lockScreenVisibility,
        badgeEnabled: firstReminder ? firstReminder.badgeEnabled === 1 : baseDraft.badgeEnabled,
        isActive: target.medication.isActive === 1,
        cycleConfig: firstReminder ? JSON.parse(firstReminder.cycleConfig) as CycleConfig : baseDraft.cycleConfig,
      }

      const wheelSource = nextDraft.times[0] ?? baseDraft.times[0]
      const wheel = hourToWheel(wheelSource.hour)
      if (!cancelled) {
        setDraft(nextDraft)
        setPeriodIndex(wheel.periodIndex)
        setHourIndex(wheel.hourIndex)
        setMinuteIndex(wheelSource.minute)
        setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [medicationId, slotId])

  const activeStep = STEPS[stepIndex]
  const canContinue = draft ? draft.aliasName.trim().length > 0 && draft.times.length > 0 : false

  const updateDraft = (patch: Partial<Draft>) => {
    setDraft(current => current ? { ...current, ...patch } : current)
  }

  const updateTime = (localKey: string, patch: Partial<DraftTime>) => {
    setDraft(current => current ? {
      ...current,
      times: sortTimes(current.times.map(time => time.localKey === localKey ? { ...time, ...patch } : time)),
    } : current)
  }

  const addSelectedTime = () => {
    if (!draft) return
    const hour = normalizeHour(periodIndex, hourIndex)
    const minute = minuteIndex
    const next = sortTimes([
      ...draft.times,
      { hour, minute, isEnabled: true, localKey: makeLocalKey() },
    ])
    updateDraft({ times: next })
  }

  const deleteTime = (localKey: string) => {
    if (!draft || draft.times.length <= 1) return
    updateDraft({ times: sortTimes(draft.times.filter(time => time.localKey !== localKey)) })
  }

  const goBack = () => {
    if (stepIndex === 0) router.back()
    else setStepIndex(index => Math.max(0, index - 1))
  }

  const leftButtonLabel = stepIndex === 0 ? '닫기' : '이전'
  const rightButtonLabel = activeStep === 'review' ? (draft?.medicationId ? '저장하기' : '추가하기') : '다음'

  const goNext = () => {
    if (!canContinue) return
    if (activeStep === 'review') {
      void save()
      return
    }
    setStepIndex(index => Math.min(STEPS.length - 1, index + 1))
  }

  const save = async () => {
    if (!draft) return
    setSaving(true)
    try {
      const input = draftToInput(draft)
      if (draft.medicationId) {
        await updateMedicationWithTimes(draft.medicationId, input)
        publishToast('수정했습니다')
      } else {
        await createMedicationWithTimes(input)
        publishToast('추가했습니다')
      }
      router.back()
    } catch (error) {
      Alert.alert('저장 실패', error instanceof Error ? error.message : undefined)
    } finally {
      setSaving(false)
    }
  }

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
        <TouchableOpacity style={styles.iconButton} onPress={goBack}>
          <Ionicons name={stepIndex === 0 ? 'close' : 'chevron-back'} size={22} color={ui.color.textPrimary} />
        </TouchableOpacity>
        <View style={styles.progressRow}>
          {STEPS.map((step, index) => <View key={step} style={[styles.progressSegment, index <= stepIndex && styles.progressSegmentOn]} />)}
        </View>
        <View style={styles.iconButton} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 112 }]}> 
        <StepHeader step={activeStep} />

        {activeStep === 'name' ? (
          <View style={styles.stack}>
            <TextInput
              style={styles.largeInput}
              placeholder="별칭"
              placeholderTextColor={ui.color.textSecondary}
              value={draft.aliasName}
              onChangeText={aliasName => updateDraft({ aliasName })}
            />
            <TextInput
              style={styles.input}
              placeholder="실제 이름"
              placeholderTextColor={ui.color.textSecondary}
              value={draft.actualName}
              onChangeText={actualName => updateDraft({ actualName })}
            />
            <Card style={styles.inventoryCard}>
              <Text style={styles.cardTitle}>수량</Text>
              <View style={styles.metricGrid}>
                <View style={styles.metricField}>
                  <Text style={styles.metricLabel}>남은 수량</Text>
                  <TextInput style={styles.metricInput} keyboardType="number-pad" value={String(draft.remainingQuantity)} onChangeText={value => updateDraft({ remainingQuantity: countInput(value) })} />
                </View>
                <View style={styles.metricField}>
                  <Text style={styles.metricLabel}>전체 수량</Text>
                  <TextInput style={styles.metricInput} keyboardType="number-pad" value={String(draft.totalQuantity)} onChangeText={value => updateDraft({ totalQuantity: countInput(value) })} />
                </View>
                <View style={styles.metricField}>
                  <Text style={styles.metricLabel}>1회 용량</Text>
                  <TextInput style={styles.metricInput} keyboardType="number-pad" value={String(draft.dosePerIntake)} onChangeText={value => updateDraft({ dosePerIntake: countInput(value, 1) })} />
                </View>
              </View>
            </Card>
          </View>
        ) : null}

        {activeStep === 'time' ? (
          <View style={styles.stack}>
            <Card style={styles.wheelCard}>
              <View style={styles.wheelRow}>
                <WheelColumn items={PERIODS} selectedIndex={periodIndex} onIndexChange={setPeriodIndex} width={72} />
                <WheelColumn items={HOURS} selectedIndex={hourIndex} onIndexChange={setHourIndex} width={74} enableDirectInput numericInput />
                <Text style={styles.colon}>:</Text>
                <WheelColumn items={MINUTES} selectedIndex={minuteIndex} onIndexChange={setMinuteIndex} width={74} enableDirectInput numericInput />
              </View>
            </Card>
            <SecondaryButton label="시간 추가" icon="add" onPress={addSelectedTime} />
            <View style={styles.listBlock}>
              <Text style={styles.cardTitle}>추가된 시간</Text>
              {draft.times.map(time => (
                <TimeRow
                  key={time.localKey}
                  timeLabel={formatTime(time.hour, time.minute)}
                  enabled={time.isEnabled}
                  status={time.isEnabled ? 'ON' : 'OFF'}
                  onToggle={isEnabled => updateTime(time.localKey, { isEnabled })}
                  onDelete={() => deleteTime(time.localKey)}
                />
              ))}
            </View>
          </View>
        ) : null}

        {activeStep === 'alert' ? (
          <View style={styles.stack}>
            <Card style={styles.previewCard}>
              <Text style={styles.previewTitle}>{draft.privacyMode === 'aliasOnly' ? (draft.aliasName || DEFAULT_EXTERNAL_APP_LABEL) : draft.notificationTitle}</Text>
              <Text style={styles.previewBody}>{draft.notificationBody || notificationDefaultsForLanguage(draft.language).privateNotificationBody}</Text>
            </Card>
            <TextInput style={styles.input} placeholder="제목" placeholderTextColor={ui.color.textSecondary} value={draft.notificationTitle} onChangeText={notificationTitle => updateDraft({ notificationTitle })} />
            <TextInput style={styles.input} placeholder="문구" placeholderTextColor={ui.color.textSecondary} value={draft.notificationBody} onChangeText={notificationBody => updateDraft({ notificationBody })} />
            <View style={styles.optionBlock}>
              <Text style={styles.optionTitle}>공개 범위</Text>
              <Segment value={draft.privacyMode} options={PRIVACY_OPTIONS} onChange={privacyMode => updateDraft({ privacyMode })} />
            </View>
            <View style={styles.optionBlock}>
              <Text style={styles.optionTitle}>위젯</Text>
              <Segment value={draft.widgetVisibility} options={WIDGET_OPTIONS} onChange={widgetVisibility => updateDraft({ widgetVisibility })} />
            </View>
            <View style={styles.optionBlock}>
              <Text style={styles.optionTitle}>알림 강도</Text>
              <Segment value={draft.reminderStrength} options={STRENGTH_OPTIONS} onChange={reminderStrength => updateDraft({ reminderStrength })} />
            </View>
          </View>
        ) : null}

        {activeStep === 'review' ? (
          <View style={styles.stack}>
            <Card style={styles.reviewCard}>
              <ReviewRow label="이름" value={draft.aliasName || '-'} />
              <ReviewRow label="실제 이름" value={draft.actualName || '-'} />
              <ReviewRow label="공개 범위" value={PRIVACY_OPTIONS.find(option => option.value === draft.privacyMode)?.label ?? '-'} />
              <ReviewRow label="위젯" value={WIDGET_OPTIONS.find(option => option.value === draft.widgetVisibility)?.label ?? '-'} />
              <ReviewRow label="알림 강도" value={STRENGTH_OPTIONS.find(option => option.value === draft.reminderStrength)?.label ?? '-'} />
            </Card>
            <Card style={styles.reviewCard}>
              <Text style={styles.cardTitle}>시간 목록</Text>
              {draft.times.map(time => (
                <View key={time.localKey} style={styles.reviewTimeRow}>
                  <Text style={styles.reviewTimeText}>{formatTime(time.hour, time.minute)}</Text>
                  <Text style={styles.reviewTimeState}>{time.isEnabled ? 'ON' : 'OFF'}</Text>
                </View>
              ))}
            </Card>
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}> 
        <TouchableOpacity style={styles.footerSecondaryButton} onPress={goBack} disabled={saving}>
          <Text style={styles.footerSecondaryText}>{leftButtonLabel}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.footerPrimaryButton, (!canContinue || saving) && styles.footerPrimaryDisabled]} onPress={goNext} disabled={!canContinue || saving}>
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
  inventoryCard: {
    gap: 14,
  },
  cardTitle: {
    color: ui.color.textPrimary,
    fontSize: 20,
    fontWeight: '800',
  },
  metricGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  metricField: {
    backgroundColor: ui.color.input,
    borderRadius: 12,
    flex: 1,
    gap: 8,
    padding: 12,
  },
  metricLabel: {
    color: ui.color.textSecondary,
    fontSize: 12,
    fontWeight: '800',
  },
  metricInput: {
    color: ui.color.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    padding: 0,
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
  listBlock: {
    gap: 10,
  },
  previewCard: {
    backgroundColor: ui.color.softCard,
    gap: 6,
  },
  previewTitle: {
    color: ui.color.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  previewBody: {
    color: ui.color.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  optionBlock: {
    gap: 8,
  },
  optionTitle: {
    color: ui.color.textPrimary,
    fontSize: 15,
    fontWeight: '800',
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
    backgroundColor: ui.color.background,
    borderTopColor: ui.color.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 14,
  },
  footerSecondaryButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D7DADF',
    borderRadius: 18,
    borderWidth: 1,
    flex: 4,
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
    flex: 6,
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
