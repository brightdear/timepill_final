import React, { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
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
import { TimePickerModal } from '@/components/TimePickerModal'
import {
  DEFAULT_EXTERNAL_APP_LABEL,
  DEFAULT_PRIVATE_NOTIFICATION_BODY,
  DEFAULT_PRIVATE_NOTIFICATION_TITLE,
} from '@/constants/appIdentity'
import { designHarness } from '@/design/designHarness'
import { scheduleAlarmsForAllSlots } from '@/domain/alarm/alarmScheduler'
import { getTodayDoseRecordBySlotId, insertDoseRecord } from '@/domain/doseRecord/repository'
import { getMedicationById, getMedicationByName, insertMedication, updateMedication } from '@/domain/medication/repository'
import { getSettings } from '@/domain/settings/repository'
import { upsertStreak } from '@/domain/streak/repository'
import { deleteTimeslot, getTimeslotById, insertTimeslot, updateTimeslot } from '@/domain/timeslot/repository'
import type {
  CycleConfig,
  LockScreenVisibility,
  ReminderIntensity,
  ReminderPrivacyLevel,
  WidgetVisibility,
} from '@/db/schema'
import { useI18n } from '@/hooks/useI18n'
import { isTodayDue } from '@/utils/cycleUtils'
import { getLocalDateKey, toLocalISOString } from '@/utils/dateUtils'
import { fmtTime } from '@/utils/timeUtils'
import { publishToast } from '@/utils/uiEvents'

type ReminderStrength = Exclude<ReminderIntensity, 'custom'>
type PrivacyMode = 'private' | 'aliasOnly' | 'visible'
type ScheduleMode = 'daily' | 'specificDays' | 'dateRange'
type StepKey = 'name' | 'time' | 'alert' | 'review'

type Draft = {
  displayAlias: string
  realMedicationName: string
  currentQuantity: number
  totalQuantity: number
  doseCountPerIntake: number
  reminderTimes: string[]
  notificationTitle: string
  notificationBody: string
  privacyMode: PrivacyMode
  reminderStrength: ReminderStrength
  widgetVisibility: WidgetVisibility
  lockScreenVisibility: LockScreenVisibility
  scheduleMode: ScheduleMode
  selectedWeekdays: number[]
  startDate: string
  endDate: string | null
  isActive: boolean
  badgeEnabled: boolean
}

type SettingsRow = Awaited<ReturnType<typeof getSettings>>

const STEPS: StepKey[] = ['name', 'time', 'alert', 'review']

const STEP_COPY = {
  name: {
    title: '이름',
    subtitle: '표시 이름을 입력하세요.',
  },
  time: {
    title: '시간',
    subtitle: '한 번의 시간을 정하세요.',
  },
  alert: {
    title: '알림',
    subtitle: '노출 방식과 강도를 정하세요.',
  },
  review: {
    title: '확인',
    subtitle: '저장 전 내용을 확인하세요.',
  },
} as const

const WEEKDAYS = [
  { value: 1, label: '월' },
  { value: 2, label: '화' },
  { value: 3, label: '수' },
  { value: 4, label: '목' },
  { value: 5, label: '금' },
  { value: 6, label: '토' },
  { value: 0, label: '일' },
]

const PRIVACY_OPTIONS = [
  { value: 'private', title: 'checkPrivacyPrivateTitle', subtitle: 'checkPrivacyPrivateBody' },
  { value: 'aliasOnly', title: 'checkPrivacyAliasTitle', subtitle: 'checkPrivacyAliasBody' },
  { value: 'visible', title: 'checkPrivacyVisibleTitle', subtitle: 'checkPrivacyVisibleBody' },
] as const

const STRENGTH_OPTIONS = [
  { value: 'light', title: 'settingsIntensityLight' },
  { value: 'standard', title: 'settingsIntensityStandard' },
  { value: 'strict', title: 'settingsIntensityStrict' },
] as const

const LOCK_OPTIONS = [
  { value: 'neutral', title: 'checkLockNeutral' },
  { value: 'full', title: 'checkLockFull' },
  { value: 'hidden', title: 'checkLockHidden' },
] as const

const WIDGET_OPTIONS = [
  { value: 'full', title: 'settingsWidgetFull' },
  { value: 'aliasOnly', title: 'settingsWidgetAliasOnly' },
  { value: 'timeOnly', title: 'settingsWidgetTimeOnly' },
  { value: 'hidden', title: 'settingsWidgetHidden' },
] as const

const SCHEDULE_OPTIONS = [
  { value: 'daily', title: 'checkScheduleDaily' },
  { value: 'specificDays', title: 'checkScheduleSpecificDays' },
  { value: 'dateRange', title: 'checkScheduleDateRange' },
] as const

function toTimeString(hour: number, minute: number) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

function parseTime(value: string) {
  const [hourRaw, minuteRaw] = value.split(':')
  return {
    hour: Number(hourRaw ?? 0),
    minute: Number(minuteRaw ?? 0),
  }
}

function sortTimes(values: string[]) {
  return [...new Set(values)].sort((left, right) => {
    const a = parseTime(left)
    const b = parseTime(right)
    return a.hour * 60 + a.minute - (b.hour * 60 + b.minute)
  })
}

function parseCountInput(value: string, minimum = 0) {
  const digits = value.replace(/[^0-9]/g, '')
  if (!digits) return minimum
  return Math.max(minimum, Number(digits))
}

function defaultReminderTime() {
  const now = new Date()
  const hour = now.getMinutes() === 0 ? now.getHours() : (now.getHours() + 1) % 24
  return toTimeString(hour, 0)
}

function formatTimeValue(value: string, labels: { amLabel: string; pmLabel: string }) {
  const time = parseTime(value)
  return fmtTime(time.hour, time.minute, { am: labels.amLabel, pm: labels.pmLabel })
}

function addDays(dateKey: string, amount: number) {
  const date = new Date(`${dateKey}T12:00:00`)
  date.setDate(date.getDate() + amount)
  return getLocalDateKey(date)
}

function formatDate(dateKey: string | null) {
  if (!dateKey) return ''
  const date = new Date(`${dateKey}T12:00:00`)
  return `${date.getMonth() + 1}.${date.getDate()}`
}

function mapSettingsPrivacy(level: string): PrivacyMode {
  if (level === 'public') return 'visible'
  if (level === 'custom') return 'aliasOnly'
  return 'private'
}

function mapSlotPrivacy(level: ReminderPrivacyLevel): PrivacyMode {
  if (level === 'public') return 'visible'
  if (level === 'custom') return 'aliasOnly'
  return 'private'
}

function normalizeWidgetVisibility(value: string): WidgetVisibility {
  if (value === 'full' || value === 'aliasOnly' || value === 'timeOnly' || value === 'hidden') {
    return value
  }
  return 'aliasOnly'
}

function normalizeLockScreenVisibility(value: string): LockScreenVisibility {
  if (value === 'full' || value === 'neutral' || value === 'hidden') {
    return value
  }
  return 'neutral'
}

function mapCycleToDraft(config: CycleConfig): Pick<Draft, 'scheduleMode' | 'selectedWeekdays' | 'startDate' | 'endDate'> {
  if (config.type === 'specific_days') {
    return {
      scheduleMode: 'specificDays',
      selectedWeekdays: config.days,
      startDate: config.startDate ?? getLocalDateKey(),
      endDate: config.endDate ?? null,
    }
  }

  if (config.type === 'date_range') {
    return {
      scheduleMode: 'dateRange',
      selectedWeekdays: [1, 2, 3, 4, 5],
      startDate: config.startDate,
      endDate: config.endDate ?? null,
    }
  }

  return {
    scheduleMode: 'daily',
    selectedWeekdays: [1, 2, 3, 4, 5],
    startDate: 'startDate' in config && config.startDate ? config.startDate : getLocalDateKey(),
    endDate: 'endDate' in config ? config.endDate ?? null : null,
  }
}

function buildCycleConfig(draft: Draft): CycleConfig {
  if (draft.scheduleMode === 'specificDays') {
    return {
      type: 'specific_days',
      days: [...new Set(draft.selectedWeekdays)].sort((a, b) => a - b),
      startDate: draft.startDate,
      endDate: draft.endDate,
    }
  }

  if (draft.scheduleMode === 'dateRange') {
    return {
      type: 'date_range',
      startDate: draft.startDate,
      endDate: draft.endDate,
    }
  }

  return {
    type: 'daily',
    startDate: draft.startDate,
    endDate: draft.endDate,
  }
}

function defaultDraftFromSettings(settings: SettingsRow): Draft {
  return {
    displayAlias: '',
    realMedicationName: '',
    currentQuantity: 0,
    totalQuantity: 0,
    doseCountPerIntake: 1,
    reminderTimes: [defaultReminderTime()],
    notificationTitle: settings.privateNotificationTitle ?? DEFAULT_PRIVATE_NOTIFICATION_TITLE,
    notificationBody: settings.privateNotificationBody ?? DEFAULT_PRIVATE_NOTIFICATION_BODY,
    privacyMode: mapSettingsPrivacy(settings.defaultPrivacyLevel),
    reminderStrength: settings.defaultReminderIntensity === 'light' || settings.defaultReminderIntensity === 'strict'
      ? settings.defaultReminderIntensity
      : 'standard',
    widgetVisibility: normalizeWidgetVisibility(settings.defaultWidgetVisibility),
    lockScreenVisibility: normalizeLockScreenVisibility(settings.defaultLockScreenVisibility),
    scheduleMode: 'daily',
    selectedWeekdays: [1, 2, 3, 4, 5],
    startDate: getLocalDateKey(),
    endDate: null,
    isActive: true,
    badgeEnabled: settings.badgeEnabled === 1,
  }
}

function previewTitleForDraft(draft: Draft) {
  if (draft.privacyMode === 'aliasOnly') {
    return draft.displayAlias.trim() || DEFAULT_EXTERNAL_APP_LABEL
  }
  return draft.notificationTitle.trim() || DEFAULT_PRIVATE_NOTIFICATION_TITLE
}

function previewBodyForDraft(draft: Draft) {
  return draft.notificationBody.trim() || DEFAULT_PRIVATE_NOTIFICATION_BODY
}

function scheduleSummary(draft: Draft, t: ReturnType<typeof useI18n>['t']) {
  if (draft.scheduleMode === 'specificDays') {
    const labels = WEEKDAYS
      .filter(day => draft.selectedWeekdays.includes(day.value))
      .map(day => day.label)
      .join(' ')
    return labels || t('checkScheduleNeedDays')
  }

  if (draft.scheduleMode === 'dateRange') {
    return `${formatDate(draft.startDate)} - ${draft.endDate ? formatDate(draft.endDate) : t('checkScheduleContinue')}`
  }

  return draft.endDate ? `${t('checkScheduleDaily')} · ${formatDate(draft.endDate)}` : t('checkScheduleDaily')
}

function summaryLabelForPrivacy(mode: PrivacyMode, t: ReturnType<typeof useI18n>['t']) {
  switch (mode) {
    case 'private':
      return t('checkPrivacyPrivateTitle')
    case 'aliasOnly':
      return t('checkPrivacyAliasTitle')
    case 'visible':
      return t('checkPrivacyVisibleTitle')
  }
}

function isStepValid(step: StepKey, draft: Draft) {
  if (step === 'name') return draft.displayAlias.trim().length > 0
  if (step === 'time') return draft.reminderTimes.length > 0
  return true
}

export default function CheckItemScreen() {
  const { slotId } = useLocalSearchParams<{ slotId?: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { copy, t } = useI18n()
  const isEdit = Boolean(slotId)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [timePickerVisible, setTimePickerVisible] = useState(false)
  const [showRealNameInput, setShowRealNameInput] = useState(false)
  const [initialMedicationName, setInitialMedicationName] = useState('')
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const settings = await getSettings()
      if (!slotId) {
        if (!cancelled) {
          setShowRealNameInput(false)
          setDraft(defaultDraftFromSettings(settings))
          setLoading(false)
        }
        return
      }

      const slot = await getTimeslotById(slotId)
      if (!slot) {
        if (!cancelled) {
          Alert.alert(t('checkNotFound'))
          router.back()
        }
        return
      }

      const medication = await getMedicationById(slot.medicationId)
      const cycleConfig = JSON.parse(slot.cycleConfig) as CycleConfig
      const cycleDraft = mapCycleToDraft(cycleConfig)
      const nextDraft: Draft = {
        displayAlias: slot.displayAlias ?? medication?.name ?? '',
        realMedicationName: medication?.name ?? '',
        currentQuantity: medication?.currentQuantity ?? 0,
        totalQuantity: medication?.totalQuantity ?? 0,
        doseCountPerIntake: slot.doseCountPerIntake ?? 1,
        reminderTimes: [toTimeString(slot.hour, slot.minute)],
        notificationTitle: slot.notificationTitle ?? settings.privateNotificationTitle ?? DEFAULT_PRIVATE_NOTIFICATION_TITLE,
        notificationBody: slot.notificationBody ?? settings.privateNotificationBody ?? DEFAULT_PRIVATE_NOTIFICATION_BODY,
        privacyMode: mapSlotPrivacy(slot.privacyLevel as ReminderPrivacyLevel),
        reminderStrength: slot.reminderIntensity === 'light' || slot.reminderIntensity === 'strict'
          ? slot.reminderIntensity
          : 'standard',
        widgetVisibility: slot.widgetVisibility as WidgetVisibility,
        lockScreenVisibility: slot.lockScreenVisibility as LockScreenVisibility,
        scheduleMode: cycleDraft.scheduleMode,
        selectedWeekdays: cycleDraft.selectedWeekdays,
        startDate: cycleDraft.startDate,
        endDate: cycleDraft.endDate,
        isActive: slot.isActive === 1,
        badgeEnabled: slot.badgeEnabled === 1,
      }

      if (!cancelled) {
        setInitialMedicationName(medication?.name ?? '')
        setShowRealNameInput(Boolean(medication?.name && medication.name !== nextDraft.displayAlias))
        setDraft(nextDraft)
        setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [router, slotId, t])

  const activeStep = STEPS[stepIndex]
  const canContinue = draft ? isStepValid(activeStep, draft) : false
  const progressCount = STEPS.length

  const updateDraft = (patch: Partial<Draft>) => {
    setDraft(current => current ? { ...current, ...patch } : current)
    setDirty(true)
  }

  const updateCountField = (field: 'currentQuantity' | 'totalQuantity' | 'doseCountPerIntake', text: string) => {
    setDraft(current => {
      if (!current) return current

      const nextValue = parseCountInput(text, field === 'doseCountPerIntake' ? 1 : 0)
      const nextDraft = { ...current, [field]: nextValue }

      if (field === 'totalQuantity' && nextDraft.totalQuantity > 0 && nextDraft.currentQuantity > nextDraft.totalQuantity) {
        nextDraft.currentQuantity = nextDraft.totalQuantity
      }

      if (field === 'currentQuantity' && nextDraft.totalQuantity > 0) {
        nextDraft.currentQuantity = Math.min(nextDraft.currentQuantity, nextDraft.totalQuantity)
      }

      return nextDraft
    })
    setDirty(true)
  }

  const handleClose = () => {
    if (!dirty || saving) {
      router.back()
      return
    }

    Alert.alert(t('checkDiscardTitle'), '', [
      { text: t('cancel'), style: 'cancel' },
      { text: t('checkCloseButton'), style: 'destructive', onPress: () => router.back() },
    ])
  }

  const goBack = () => {
    if (stepIndex === 0) {
      handleClose()
      return
    }
    setStepIndex(current => Math.max(0, current - 1))
  }

  const goNext = () => {
    if (!canContinue) return
    if (stepIndex === STEPS.length - 1) {
      void handleSave()
      return
    }
    setStepIndex(current => Math.min(STEPS.length - 1, current + 1))
  }

  const handleTimeConfirm = (hour: number, minute: number) => {
    const next = toTimeString(hour, minute)
    if (draft) {
      updateDraft({ reminderTimes: [next], scheduleMode: 'daily', endDate: null })
    }
    setTimePickerVisible(false)
  }

  const handleDelete = async () => {
    if (!slotId) return
    Alert.alert(t('checkDeleteConfirmTitle'), '', [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: async () => {
          await deleteTimeslot(slotId)
          await scheduleAlarmsForAllSlots()
          publishToast(t('checkDeleteDone'))
          router.back()
        },
      },
    ])
  }

  const handleSave = async () => {
    if (!draft) return
    if (draft.scheduleMode === 'specificDays' && draft.selectedWeekdays.length === 0) {
      Alert.alert(t('checkScheduleNeedDays'))
      return
    }

    if (draft.endDate && draft.endDate < draft.startDate) {
      Alert.alert(t('checkEndDateError'))
      return
    }

    const alias = draft.displayAlias.trim()
    const medicationName = draft.realMedicationName.trim() || alias
    const cycleConfig = buildCycleConfig(draft)
    const notificationTitle = draft.privacyMode === 'aliasOnly'
      ? (alias || DEFAULT_EXTERNAL_APP_LABEL)
      : (draft.notificationTitle.trim() || DEFAULT_PRIVATE_NOTIFICATION_TITLE)
    const notificationBody = draft.notificationBody.trim() || DEFAULT_PRIVATE_NOTIFICATION_BODY
    const privacyLevel: ReminderPrivacyLevel = draft.privacyMode === 'visible'
      ? 'public'
      : draft.privacyMode === 'aliasOnly'
        ? 'custom'
        : 'private'
    const firstTime = parseTime(draft.reminderTimes[0])
    const timeSlotPayload = {
      displayAlias: alias,
      hour: firstTime.hour,
      minute: firstTime.minute,
      doseCountPerIntake: draft.doseCountPerIntake,
      cycleConfig: JSON.stringify(cycleConfig),
      cycleStartDate: null,
      verificationWindowMin: 60,
      alarmEnabled: 1,
      privacyLevel,
      notificationTitle,
      notificationBody,
      preReminderEnabled: draft.reminderStrength === 'light' ? 0 : 1,
      preReminderMinutes: 15,
      preReminderBody: '곧 체크할 시간이야',
      overdueReminderBody: '오늘 확인이 지연되고 있어요',
      reminderIntensity: draft.reminderStrength,
      repeatRemindersEnabled: 1,
      repeatSchedule: null,
      maxRepeatDurationMinutes: 180,
      snoozeMinutes: 10,
      forceAlarm: 0,
      popupEnabled: 1,
      snoozeCount: 0,
      snoozeIntervalMin: 10,
      alarmSound: 'default',
      vibrationEnabled: 1,
      widgetVisibility: draft.widgetVisibility,
      lockScreenVisibility: draft.lockScreenVisibility,
      badgeEnabled: draft.badgeEnabled ? 1 : 0,
      isActive: draft.isActive ? 1 : 0,
    } as const

    setSaving(true)
    try {
      if (slotId) {
        const slot = await getTimeslotById(slotId)
        if (!slot) throw new Error(t('checkNotFound'))
        await updateMedication(slot.medicationId, {
          name: medicationName,
          totalQuantity: draft.totalQuantity,
          currentQuantity: draft.currentQuantity,
        })

        await updateTimeslot(slotId, timeSlotPayload)

        const todayRecord = await getTodayDoseRecordBySlotId(slotId)
        if (!todayRecord && isTodayDue({ ...slot, cycleConfig: JSON.stringify(cycleConfig), isActive: draft.isActive ? 1 : 0 })) {
          const scheduledTime = toLocalISOString(
            new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate(), firstTime.hour, firstTime.minute),
          )
          await insertDoseRecord({
            medicationId: slot.medicationId,
            medicationName,
            timeSlotId: slotId,
            dayKey: getLocalDateKey(),
            scheduledTime,
            targetDoseCount: draft.doseCountPerIntake,
          })
        }

        publishToast(t('checkUpdated'))
      } else {
        const medication = await getMedicationByName(medicationName)
        const medicationId = medication?.id ?? await insertMedication({
          name: medicationName,
          totalQuantity: draft.totalQuantity,
          currentQuantity: draft.currentQuantity,
        })

        if (medication) {
          await updateMedication(medication.id, {
            totalQuantity: draft.totalQuantity,
            currentQuantity: draft.currentQuantity,
          })
        }

        const time = parseTime(draft.reminderTimes[0])
        const newSlotId = await insertTimeslot({
          medicationId,
          ...timeSlotPayload,
          hour: time.hour,
          minute: time.minute,
          skipUntil: null,
          notificationIds: null,
          forceNotificationIds: null,
        })
        await upsertStreak(newSlotId, {})

        if (draft.isActive && isTodayDue({ ...timeSlotPayload, cycleConfig: JSON.stringify(cycleConfig), isActive: 1 })) {
          const now = new Date()
          const scheduledTime = toLocalISOString(new Date(now.getFullYear(), now.getMonth(), now.getDate(), time.hour, time.minute))
          await insertDoseRecord({
            medicationId,
            medicationName,
            timeSlotId: newSlotId,
            dayKey: getLocalDateKey(),
            scheduledTime,
            targetDoseCount: draft.doseCountPerIntake,
          })
        }

        publishToast(t('checkAdded'))
      }

      await scheduleAlarmsForAllSlots()
      router.back()
    } catch (error) {
      Alert.alert(t('checkSaveFailedTitle'), error instanceof Error ? error.message : undefined)
    } finally {
      setSaving(false)
    }
  }

  if (loading || !draft) {
    return (
      <View style={styles.loadingState}>
        <ActivityIndicator color={designHarness.colors.warning} />
      </View>
    )
  }

  const stepCopy = STEP_COPY[activeStep]
  const previewTitle = previewTitleForDraft(draft)
  const previewBody = previewBodyForDraft(draft)
  const reminderStrengthTitle = t(STRENGTH_OPTIONS.find(item => item.value === draft.reminderStrength)?.title ?? 'settingsIntensityStandard')
  const widgetVisibilityTitle = t(WIDGET_OPTIONS.find(item => item.value === draft.widgetVisibility)?.title ?? 'settingsWidgetAliasOnly')

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}> 
        <TouchableOpacity style={styles.iconButton} onPress={goBack}>
          <Ionicons name={stepIndex === 0 ? 'close' : 'chevron-back'} size={22} color={designHarness.colors.textStrong} />
        </TouchableOpacity>
        <View style={styles.progressRow}>
          {STEPS.map((step, index) => (
            <View
              key={step}
              style={[styles.progressSegment, index <= stepIndex && styles.progressSegmentActive]}
            />
          ))}
        </View>
        <View style={styles.iconButton} />
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 120 }]} showsVerticalScrollIndicator={false}>
        <Text style={styles.stepTitle}>{stepCopy.title}</Text>
        <Text style={styles.stepSubtitle}>{stepCopy.subtitle}</Text>

        {activeStep === 'name' && (
          <View style={styles.stack}>
            <TextInput
              style={styles.largeInput}
              placeholder={t('checkAliasPlaceholder')}
              placeholderTextColor={designHarness.colors.textSoft}
              value={draft.displayAlias}
              onChangeText={text => updateDraft({ displayAlias: text })}
            />
            {showRealNameInput ? (
              <View style={styles.card}>
                <Text style={styles.sectionEyebrow}>{t('medicationName')}</Text>
                <Text style={styles.cardTitle}>{t('checkRealNameTitle')}</Text>
                <Text style={styles.cardBody}>{t('checkRealNameBody')}</Text>
                <TextInput
                  style={styles.input}
                  placeholder={t('checkRealNamePlaceholder')}
                  placeholderTextColor={designHarness.colors.textSoft}
                  value={draft.realMedicationName}
                  onChangeText={text => updateDraft({ realMedicationName: text })}
                />
              </View>
            ) : (
              <TouchableOpacity style={styles.inlineLink} onPress={() => setShowRealNameInput(true)}>
                <Ionicons name="add" size={16} color={designHarness.colors.warning} />
                <Text style={styles.inlineLinkText}>{t('checkAddRealName')}</Text>
              </TouchableOpacity>
            )}

            <View style={styles.card}>
              <Text style={styles.sectionEyebrow}>{t('checkInventoryTitle')}</Text>
              <Text style={styles.cardTitle}>{t('checkInventoryTitle')}</Text>
              <View style={styles.metricGrid}>
                <View style={styles.metricField}>
                  <Text style={styles.metricLabel}>{t('checkInventoryCurrent')}</Text>
                  <TextInput
                    style={styles.metricInput}
                    keyboardType="number-pad"
                    value={String(draft.currentQuantity)}
                    onChangeText={text => updateCountField('currentQuantity', text)}
                  />
                </View>
                <View style={styles.metricField}>
                  <Text style={styles.metricLabel}>{t('checkInventoryTotal')}</Text>
                  <TextInput
                    style={styles.metricInput}
                    keyboardType="number-pad"
                    value={String(draft.totalQuantity)}
                    onChangeText={text => updateCountField('totalQuantity', text)}
                  />
                </View>
                <View style={styles.metricField}>
                  <Text style={styles.metricLabel}>{t('checkInventoryDose')}</Text>
                  <TextInput
                    style={styles.metricInput}
                    keyboardType="number-pad"
                    value={String(draft.doseCountPerIntake)}
                    onChangeText={text => updateCountField('doseCountPerIntake', text)}
                  />
                </View>
              </View>
              <Text style={styles.inlineNote}>{t('checkInventorySummary', { times: draft.reminderTimes.length, dose: draft.doseCountPerIntake })}</Text>
            </View>
          </View>
        )}

        {activeStep === 'time' && (
          <View style={styles.stack}>
            <View style={styles.card}>
              <Text style={styles.sectionEyebrow}>시간</Text>
              <Text style={styles.cardTitle}>복용 시간</Text>
              <View style={styles.timeList}>
                <View style={styles.timeChip}>
                  <Text style={styles.timeChipText}>{formatTimeValue(draft.reminderTimes[0], copy)}</Text>
                </View>
                <TouchableOpacity style={styles.addTimeChip} onPress={() => setTimePickerVisible(true)}>
                  <Ionicons name="add" size={18} color={designHarness.colors.white} />
                  <Text style={styles.addTimeChipText}>{draft.reminderTimes[0] ? '시간 변경' : '시간 선택'}</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.inlineNote}>하루 한 번 체크 기준으로 등록됩니다.</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionEyebrow}>일정</Text>
              <View style={styles.staticRow}>
                <Text style={styles.staticRowLabel}>매일</Text>
                <Ionicons name="chevron-forward" size={16} color={designHarness.colors.textSoft} />
              </View>
              <Text style={styles.inlineNote}>기본 일정은 매일입니다.</Text>
            </View>
          </View>
        )}

        {activeStep === 'alert' && (
          <View style={styles.stack}>
            <View style={styles.previewCard}>
              <View style={styles.previewIcon}>
                <Ionicons name="notifications-outline" size={20} color={designHarness.colors.textStrong} />
              </View>
              <View style={styles.previewContent}>
                <View style={styles.previewHeaderRow}>
                  <Text style={styles.previewTitle}>{previewTitle}</Text>
                  <Text style={styles.previewNow}>{t('checkPreviewNow')}</Text>
                </View>
                <Text style={styles.previewBody}>{previewBody}</Text>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionEyebrow}>{t('settingsNotificationsMessage')}</Text>
              <Text style={styles.cardTitle}>{t('checkAlertTitle')}</Text>
              <TextInput
                style={styles.input}
                placeholder={t('checkAlertTitlePlaceholder')}
                placeholderTextColor={designHarness.colors.textSoft}
                value={draft.notificationTitle}
                onChangeText={text => updateDraft({ notificationTitle: text })}
              />
              <TextInput
                style={styles.input}
                placeholder={t('checkAlertBodyPlaceholder')}
                placeholderTextColor={designHarness.colors.textSoft}
                value={draft.notificationBody}
                onChangeText={text => updateDraft({ notificationBody: text })}
              />
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionEyebrow}>{t('settingsPrivacyHeader')}</Text>
              <Text style={styles.cardTitle}>{t('checkPrivacyTitle')}</Text>
              <View style={styles.optionStack}>
                {PRIVACY_OPTIONS.map(option => (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.optionCard, draft.privacyMode === option.value && styles.optionCardActive]}
                    onPress={() => updateDraft({
                      privacyMode: option.value,
                      lockScreenVisibility: option.value === 'private' ? 'neutral' : 'full',
                      widgetVisibility: option.value === 'visible' ? 'full' : option.value === 'aliasOnly' ? 'aliasOnly' : 'timeOnly',
                    })}
                  >
                    <Text style={[styles.optionTitle, draft.privacyMode === option.value && styles.optionTitleActive]}>{t(option.title)}</Text>
                    <Text style={[styles.optionSubtitle, draft.privacyMode === option.value && styles.optionSubtitleActive]}>{t(option.subtitle)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.sectionEyebrow}>{t('settingsNotificationsStrength')}</Text>
              <Text style={styles.cardTitle}>{t('checkReminderTitle')}</Text>
              <View style={styles.segmentWrap}>
                {STRENGTH_OPTIONS.map(option => (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.segmentPill, draft.reminderStrength === option.value && styles.segmentPillActive]}
                    onPress={() => updateDraft({ reminderStrength: option.value })}
                  >
                    <Text style={[styles.segmentPillText, draft.reminderStrength === option.value && styles.segmentPillTextActive]}>{t(option.title)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.subSectionLabel}>{t('checkLockScreenLabel')}</Text>
              <View style={styles.segmentWrap}>
                {LOCK_OPTIONS.map(option => (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.segmentPill, draft.lockScreenVisibility === option.value && styles.segmentPillActive]}
                    onPress={() => updateDraft({ lockScreenVisibility: option.value })}
                  >
                    <Text style={[styles.segmentPillText, draft.lockScreenVisibility === option.value && styles.segmentPillTextActive]}>{t(option.title)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.subSectionLabel}>{t('checkWidgetLabel')}</Text>
              <View style={styles.segmentWrap}>
                {WIDGET_OPTIONS.map(option => (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.segmentPill, draft.widgetVisibility === option.value && styles.segmentPillActive]}
                    onPress={() => updateDraft({ widgetVisibility: option.value })}
                  >
                    <Text style={[styles.segmentPillText, draft.widgetVisibility === option.value && styles.segmentPillTextActive]}>{t(option.title)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        )}

        {activeStep === 'review' && (
          <View style={styles.stack}>
            <View style={styles.card}>
              <Text style={styles.sectionEyebrow}>{t('checkReviewTitle')}</Text>
              <SummaryRow label={t('checkReviewName')} value={draft.displayAlias} />
              <SummaryRow label={t('checkReviewTime')} value={draft.reminderTimes.map(time => formatTimeValue(time, copy)).join(', ') || '-'} />
              <SummaryRow label={t('checkScheduleTitle')} value={scheduleSummary(draft, t)} />
              <SummaryRow
                label={t('checkInventoryTitle')}
                value={draft.totalQuantity > 0
                  ? `${draft.currentQuantity}/${draft.totalQuantity} · ${t('checkInventorySummary', { times: draft.reminderTimes.length, dose: draft.doseCountPerIntake })}`
                  : t('checkInventorySummary', { times: draft.reminderTimes.length, dose: draft.doseCountPerIntake })}
              />
              <SummaryRow label={t('checkReviewAlert')} value={`${previewTitle} / ${previewBody}`} />
              <SummaryRow label={t('checkReviewPrivacy')} value={summaryLabelForPrivacy(draft.privacyMode, t)} />
              <SummaryRow label={t('checkReviewReminder')} value={reminderStrengthTitle} />
              <SummaryRow label={t('checkReviewWidget')} value={widgetVisibilityTitle} />
            </View>

            {isEdit && (
              <View style={styles.card}>
                <Text style={styles.sectionEyebrow}>{t('checkStateTitle')}</Text>
                <View style={styles.switchRow}>
                  <View style={styles.switchInfo}>
                    <Text style={styles.cardTitle}>{t('checkStateTitle')}</Text>
                    <Text style={styles.cardBody}>{t('checkStateBody')}</Text>
                  </View>
                  <Switch
                    value={draft.isActive}
                    onValueChange={value => updateDraft({ isActive: value })}
                    trackColor={{ false: '#D7DADF', true: '#FFD08A' }}
                    thumbColor={draft.isActive ? designHarness.colors.warning : '#FFFFFF'}
                  />
                </View>
                <TouchableOpacity style={styles.deleteButton} onPress={() => void handleDelete()}>
                  <Ionicons name="trash-outline" size={18} color={designHarness.colors.danger} />
                  <Text style={styles.deleteButtonText}>{t('checkDeleteItem')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}> 
        <TouchableOpacity style={styles.secondaryButton} onPress={goBack}>
          <Text style={styles.secondaryButtonText}>{stepIndex === 0 ? t('checkCloseButton') : t('checkBackButton')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryButton, !canContinue && styles.primaryButtonDisabled]}
          onPress={goNext}
          disabled={!canContinue || saving}
        >
          <Text style={styles.primaryButtonText}>
            {saving ? t('saving') : stepIndex === progressCount - 1 ? (isEdit ? t('checkUpdateButton') : t('checkCreateButton')) : t('checkNextButton')}
          </Text>
        </TouchableOpacity>
      </View>

      <TimePickerModal
        visible={timePickerVisible}
        initialHour={draft.reminderTimes[0] ? parseTime(draft.reminderTimes[0]).hour : new Date().getHours()}
        initialMinute={draft.reminderTimes[0] ? parseTime(draft.reminderTimes[0]).minute : new Date().getMinutes()}
        title={t('checkTimeTitle')}
        amLabel={copy.amLabel}
        pmLabel={copy.pmLabel}
        cancelLabel={t('cancel')}
        confirmLabel={t('save')}
        onConfirm={handleTimeConfirm}
        onClose={() => setTimePickerVisible(false)}
      />
    </KeyboardAvoidingView>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: designHarness.colors.pageBackground,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: designHarness.colors.pageBackground,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressSegment: {
    width: 16,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E4E6EA',
  },
  progressSegmentActive: {
    backgroundColor: designHarness.colors.warning,
  },
  scroll: {
    paddingHorizontal: 24,
    gap: 24,
  },
  stepTitle: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
    color: designHarness.colors.textStrong,
    marginTop: 8,
  },
  stepSubtitle: {
    marginTop: 10,
    fontSize: 16,
    lineHeight: 24,
    color: designHarness.colors.textMuted,
  },
  stack: {
    gap: 18,
    marginTop: 8,
  },
  largeInput: {
    minHeight: 72,
    borderRadius: 22,
    backgroundColor: designHarness.colors.surface,
    paddingHorizontal: 22,
    paddingVertical: 18,
    fontSize: 22,
    color: designHarness.colors.textStrong,
  },
  input: {
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: designHarness.colors.surfaceSoft,
    paddingHorizontal: 18,
    paddingVertical: 14,
    fontSize: 17,
    color: designHarness.colors.textStrong,
    marginTop: 12,
  },
  card: {
    borderRadius: 30,
    backgroundColor: designHarness.colors.surface,
    padding: 24,
    gap: 12,
  },
  previewCard: {
    borderRadius: 28,
    backgroundColor: '#F3F4F6',
    padding: 20,
    minHeight: 112,
    flexDirection: 'row',
    gap: 16,
    alignItems: 'flex-start',
  },
  previewIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewContent: {
    flex: 1,
    gap: 6,
  },
  previewHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  previewTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: designHarness.colors.textStrong,
  },
  previewNow: {
    fontSize: 13,
    color: designHarness.colors.textMuted,
  },
  previewBody: {
    fontSize: 16,
    color: designHarness.colors.textBody,
  },
  sectionEyebrow: {
    fontSize: 13,
    fontWeight: '700',
    color: designHarness.colors.textMuted,
    letterSpacing: 0.4,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: designHarness.colors.textStrong,
  },
  cardBody: {
    fontSize: 15,
    lineHeight: 22,
    color: designHarness.colors.textMuted,
  },
  metricGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  metricField: {
    flex: 1,
    gap: 8,
  },
  metricLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: designHarness.colors.textMuted,
  },
  metricInput: {
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: designHarness.colors.surfaceSoft,
    paddingHorizontal: 16,
    fontSize: 18,
    fontWeight: '700',
    color: designHarness.colors.textStrong,
  },
  inlineLink: {
    minHeight: 48,
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF6EC',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  inlineLinkText: {
    fontSize: 15,
    fontWeight: '700',
    color: designHarness.colors.warning,
  },
  timeList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  timeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: designHarness.colors.surfaceSoft,
  },
  timeChipText: {
    fontSize: 16,
    fontWeight: '700',
    color: designHarness.colors.textStrong,
  },
  addTimeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: designHarness.colors.black,
  },
  addTimeChipText: {
    fontSize: 15,
    fontWeight: '700',
    color: designHarness.colors.white,
  },
  staticRow: {
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: designHarness.colors.surfaceSoft,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  staticRowLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: designHarness.colors.textStrong,
  },
  inlineNote: {
    fontSize: 14,
    lineHeight: 20,
    color: designHarness.colors.textMuted,
  },
  presetWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  presetChip: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: designHarness.colors.surfaceSoft,
  },
  presetChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: designHarness.colors.textStrong,
  },
  optionStack: {
    gap: 10,
  },
  optionCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: designHarness.colors.borderMuted,
    backgroundColor: designHarness.colors.surface,
    padding: 18,
    gap: 6,
  },
  optionCardActive: {
    borderColor: '#FFD08A',
    backgroundColor: '#FFF6EC',
  },
  optionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: designHarness.colors.textStrong,
  },
  optionTitleActive: {
    color: designHarness.colors.warning,
  },
  optionSubtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: designHarness.colors.textMuted,
  },
  optionSubtitleActive: {
    color: designHarness.colors.textBody,
  },
  segmentWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  segmentPill: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: designHarness.colors.surfaceSoft,
  },
  segmentPillActive: {
    backgroundColor: designHarness.colors.warning,
  },
  segmentPillText: {
    fontSize: 14,
    fontWeight: '600',
    color: designHarness.colors.textStrong,
  },
  segmentPillTextActive: {
    color: designHarness.colors.white,
  },
  subSectionLabel: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: '700',
    color: designHarness.colors.textStrong,
  },
  summaryRow: {
    gap: 6,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EEF0F3',
  },
  summaryLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: designHarness.colors.textMuted,
  },
  summaryValue: {
    fontSize: 16,
    lineHeight: 22,
    color: designHarness.colors.textStrong,
  },
  advancedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  advancedBody: {
    gap: 16,
    paddingTop: 4,
  },
  weekdayWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  weekdayChip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: designHarness.colors.surfaceSoft,
  },
  weekdayChipActive: {
    backgroundColor: designHarness.colors.warning,
  },
  weekdayChipText: {
    fontSize: 15,
    fontWeight: '700',
    color: designHarness.colors.textStrong,
  },
  weekdayChipTextActive: {
    color: designHarness.colors.white,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  switchInfo: {
    flex: 1,
    gap: 6,
  },
  deleteButton: {
    marginTop: 6,
    minHeight: 54,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#F1C1AE',
    backgroundColor: '#FFF4EE',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: designHarness.colors.danger,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 24,
    paddingTop: 14,
    flexDirection: 'row',
    gap: 12,
    backgroundColor: 'rgba(250,250,248,0.96)',
    borderTopWidth: 1,
    borderTopColor: '#EFEFEA',
  },
  secondaryButton: {
    flex: 1,
    minHeight: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: designHarness.colors.surface,
    borderWidth: 1,
    borderColor: designHarness.colors.borderMuted,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: designHarness.colors.textStrong,
  },
  primaryButton: {
    flex: 1.4,
    minHeight: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: designHarness.colors.warning,
  },
  primaryButtonDisabled: {
    backgroundColor: '#FFDDAA',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '800',
    color: designHarness.colors.white,
  },
})
