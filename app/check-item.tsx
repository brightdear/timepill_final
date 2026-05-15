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
import { designHarness } from '@/design/designHarness'
import { useI18n } from '@/hooks/useI18n'
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
import type { Lang } from '@/constants/translations'
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
const ACTION_BAR_HEIGHT = 92

const CHECK_ITEM_COPY = {
  ko: {
    periods: ['오전', '오후'],
    stepCount: '{current} / 4',
    stepTitle: {
      name: '약 이름',
      time: '복용 시간',
      alert: '표시 설정',
      review: '저장 전 확인',
    },
    stepSubtitle: {
      name: '',
      time: '',
      alert: '',
      review: '',
    },
    buttons: {
      close: '닫기',
      back: '이전',
      next: '다음',
      save: '저장하기',
      saving: '저장 중',
      addTime: '시간 추가',
    },
    field: {
      aliasName: '이름 (필수)',
      aliasPlaceholder: '예 : 아침 약, 저녁 약, 식후 30분',
      actualName: '실제 이름 (선택)',
      actualPlaceholder: '실제 이름',
      quantityTracking: '수량 추적',
      remainingQuantity: '남은 수량',
      dosePerIntake: '1회 복용량',
      addedTimes: '추가된 시간',
      noTimes: '아직 추가된 시간이 없어요',
      notificationText: '알림 문구',
      notificationTitle: '알림 제목',
      notificationTitlePlaceholder: '예: 마 복용 시간',
      notificationBody: '알림 문구',
      notificationBodyPlaceholder: '예: 오후 12:00 · 스캔 필요',
      privacy: '공개 범위',
      widget: '위젯 표시',
      summary: '설정 요약',
      quantityOff: '꺼짐',
      previewNotification: '알림',
      previewWidget: '위젯',
      previewBadge: '미리보기',
    },
    privacy: {
      private: '비공개',
      aliasOnly: '별칭',
      visible: '표시',
    },
    widget: {
      hidden: '숨김',
      aliasOnly: '별칭',
      timeOnly: '시간',
      full: '전체',
    },
    reminderMode: {
      off: '끔',
      notify: '알림',
      scan: '스캔까지',
    },
    preview: {
      timeUnknown: '시간 미정',
      lockHint: '잠금화면',
      widgetHint: '홈 위젯',
      hiddenWidget: '위젯에서 숨김',
      neutralTitle: 'Daily Check',
      neutralBody: '확인이 필요해요',
      aliasFallbackBody: '체크할 시간이에요',
      visibleTitleSuffix: '복용 시간',
      nextCheck: '다음 체크',
      pending: '대기',
      openScan: '스캔 열기',
      openCheck: '체크 열기',
      openDetail: '상세 열기',
      saveThenOpen: '저장 후 열기',
    },
    review: {
      medicationCard: '약 정보',
      aliasName: '이름',
      actualName: '실제 이름',
      timeList: '복용 시간',
      displayCard: '표시 설정',
      privacy: '공개 범위',
      widget: '위젯 표시',
      quantityTracking: '수량 추적',
      remainingQuantity: '남은 수량',
      dosePerIntake: '1회 복용량',
      notificationTitle: '알림 제목',
      notificationBody: '알림 문구',
      on: '켜짐',
      off: '꺼짐',
    },
  },
  en: {
    periods: ['AM', 'PM'],
    stepCount: 'STEP {current}',
    stepTitle: {
      name: 'Medication name',
      time: 'Dose times',
      alert: 'Display settings',
      review: 'Review before save',
    },
    stepSubtitle: {
      name: '',
      time: '',
      alert: '',
      review: '',
    },
    buttons: {
      close: 'Close',
      back: 'Back',
      next: 'Next',
      save: 'Save',
      saving: 'Saving',
      addTime: 'Add time',
    },
    field: {
      aliasName: 'Name',
      aliasPlaceholder: 'Ex: M, Morning routine, Focus',
      actualName: 'Real name',
      actualPlaceholder: 'Real name',
      quantityTracking: 'Track quantity',
      remainingQuantity: 'Remaining',
      dosePerIntake: 'Dose',
      addedTimes: 'Added times',
      noTimes: 'No times added yet',
      notificationText: 'Notification copy',
      notificationTitle: 'Notification title',
      notificationTitlePlaceholder: 'Ex: M reminder',
      notificationBody: 'Notification body',
      notificationBodyPlaceholder: 'Ex: 12:00 PM · Scan required',
      privacy: 'Privacy',
      widget: 'Widget',
      summary: 'Summary',
      quantityOff: 'Off',
      previewNotification: 'Notification',
      previewWidget: 'Widget',
      previewBadge: 'Preview',
    },
    privacy: {
      private: 'Private',
      aliasOnly: 'Alias',
      visible: 'Visible',
    },
    widget: {
      hidden: 'Hidden',
      aliasOnly: 'Alias',
      timeOnly: 'Time',
      full: 'Full',
    },
    reminderMode: {
      off: 'Off',
      notify: 'Notify',
      scan: 'Scan',
    },
    preview: {
      timeUnknown: 'Time TBD',
      lockHint: 'Lock screen',
      widgetHint: 'Home widget',
      hiddenWidget: 'Hidden from widget',
      neutralTitle: 'Daily Check',
      neutralBody: 'Needs your attention',
      aliasFallbackBody: 'It is time to check in.',
      visibleTitleSuffix: 'Reminder',
      nextCheck: 'Next check',
      pending: 'Pending',
      openScan: 'Open scan',
      openCheck: 'Open check',
      openDetail: 'Open details',
      saveThenOpen: 'Open after saving',
    },
    review: {
      medicationCard: 'Medication',
      aliasName: 'Name',
      actualName: 'Real name',
      timeList: 'Dose times',
      displayCard: 'Display settings',
      privacy: 'Privacy',
      widget: 'Widget',
      quantityTracking: 'Track quantity',
      remainingQuantity: 'Remaining',
      dosePerIntake: 'Dose',
      notificationTitle: 'Notification title',
      notificationBody: 'Notification body',
      on: 'On',
      off: 'Off',
    },
  },
  ja: {
    periods: ['午前', '午後'],
    stepCount: 'STEP {current}',
    stepTitle: {
      name: '薬の名前',
      time: '服用時間',
      alert: '表示設定',
      review: '保存前に確認',
    },
    stepSubtitle: {
      name: '',
      time: '',
      alert: '',
      review: '',
    },
    buttons: {
      close: '閉じる',
      back: '前へ',
      next: '次へ',
      save: '保存',
      saving: '保存中',
      addTime: '時間を追加',
    },
    field: {
      aliasName: '名前',
      aliasPlaceholder: '例: M, 朝ルーティン, Focus',
      actualName: '実際の名前',
      actualPlaceholder: '実際の名前',
      quantityTracking: '数量管理',
      remainingQuantity: '残量',
      dosePerIntake: '1回量',
      addedTimes: '追加した時間',
      noTimes: 'まだ時間がありません',
      notificationText: '通知文言',
      notificationTitle: '通知タイトル',
      notificationTitlePlaceholder: '例: M 服用時間',
      notificationBody: '通知本文',
      notificationBodyPlaceholder: '例: 午後 12:00 · スキャン必要',
      privacy: '公開範囲',
      widget: 'ウィジェット表示',
      summary: '設定の要約',
      quantityOff: 'オフ',
      previewNotification: '通知',
      previewWidget: 'ウィジェット',
      previewBadge: 'プレビュー',
    },
    privacy: {
      private: '非公開',
      aliasOnly: '別名',
      visible: '表示',
    },
    widget: {
      hidden: '非表示',
      aliasOnly: '別名',
      timeOnly: '時間',
      full: '全体',
    },
    reminderMode: {
      off: 'オフ',
      notify: '通知のみ',
      scan: 'スキャンまで',
    },
    preview: {
      timeUnknown: '時間未定',
      lockHint: 'ロック画面',
      widgetHint: 'ホームウィジェット',
      hiddenWidget: 'ウィジェットで非表示',
      neutralTitle: 'Daily Check',
      neutralBody: '確認が必要です',
      aliasFallbackBody: 'チェックの時間です。',
      visibleTitleSuffix: '服用時間',
      nextCheck: '次のチェック',
      pending: '待機中',
      openScan: 'スキャンを開く',
      openCheck: 'チェックを開く',
      openDetail: '詳細を開く',
      saveThenOpen: '保存後に開く',
    },
    review: {
      medicationCard: '薬情報',
      aliasName: '名前',
      actualName: '実際の名前',
      timeList: '服用時間',
      displayCard: '表示設定',
      privacy: '公開範囲',
      widget: 'ウィジェット表示',
      quantityTracking: '数量管理',
      remainingQuantity: '残量',
      dosePerIntake: '1回量',
      notificationTitle: '通知タイトル',
      notificationBody: '通知本文',
      on: 'オン',
      off: 'オフ',
    },
  },
} as const

function replaceTokens(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replace(`{${key}}`, String(value)),
    template,
  )
}

function formatLocalizedTime(hour: number, minute: number, lang: Lang) {
  const periods = CHECK_ITEM_COPY[lang].periods
  return fmtTime(hour, minute, { am: periods[0], pm: periods[1] })
}

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

function formatTime(hour: number, minute: number, lang: Lang = 'ko') {
  return formatLocalizedTime(hour, minute, lang)
}

function toDigits(value: string) {
  return value.replace(/[^0-9]/g, '')
}

function parsePositiveNumber(value: string) {
  const digits = toDigits(value)
  if (!digits) return null
  return Number(digits)
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function clampDosePerIntake(value: string | number | null | undefined) {
  const numeric = typeof value === 'number'
    ? value
    : typeof value === 'string'
      ? parsePositiveNumber(value)
      : null
  return clampNumber(numeric ?? 1, 1, 9)
}

function sanitizeRemainingQuantityInput(value: string) {
  const numeric = parsePositiveNumber(value)
  if (numeric == null) return ''
  return String(clampNumber(numeric, 1, 999))
}

function sanitizeLoadedQuantity(value: number | null | undefined) {
  if (value == null || value <= 0) return ''
  return String(clampNumber(value, 1, 999))
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
  return enabled === false ? 'off' : 'scan'
}

function normalizeWidgetDisplay(value?: string | null): WidgetDisplayMode {
  if (value === 'hidden' || value === 'timeOnly' || value === 'full') return value
  return 'aliasOnly'
}

function modeLabel(mode: ReminderMode, lang: Lang) {
  return CHECK_ITEM_COPY[lang].reminderMode[mode]
}

function privacyOptions(lang: Lang) {
  const copy = CHECK_ITEM_COPY[lang]
  return [
    { value: 'private' as const, label: copy.privacy.private },
    { value: 'aliasOnly' as const, label: copy.privacy.aliasOnly },
    { value: 'visible' as const, label: copy.privacy.visible },
  ]
}

function widgetOptions(lang: Lang) {
  const copy = CHECK_ITEM_COPY[lang]
  return [
    { value: 'hidden' as const, label: copy.widget.hidden },
    { value: 'aliasOnly' as const, label: copy.widget.aliasOnly },
    { value: 'timeOnly' as const, label: copy.widget.timeOnly },
    { value: 'full' as const, label: copy.widget.full },
  ]
}

function reminderModeOptions(lang: Lang) {
  const copy = CHECK_ITEM_COPY[lang]
  return [
    { value: 'off' as const, label: copy.reminderMode.off },
    { value: 'notify' as const, label: copy.reminderMode.notify },
    { value: 'scan' as const, label: copy.reminderMode.scan },
  ]
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

function previewLeadTime(draft: Draft) {
  return sortTimes(draft.times)[0] ?? null
}

function resolveNotificationPreviewContent(draft: Draft, lang: Lang) {
  const copy = CHECK_ITEM_COPY[lang]
  const leadTime = previewLeadTime(draft)
  const previewTime = leadTime ? formatTime(leadTime.hour, leadTime.minute, lang) : copy.preview.timeUnknown
  const alias = draft.aliasName.trim() || DEFAULT_EXTERNAL_APP_LABEL
  const displayName = draft.actualName.trim() || alias
  const mode = modeLabel(leadTime?.reminderMode ?? 'scan', lang)
  const titleInput = draft.notificationTitle.trim()
  const bodyInput = draft.notificationBody.trim()

  if (draft.privacyMode === 'private') {
    return {
      title: copy.preview.neutralTitle,
      body: copy.preview.neutralBody,
      caption: DEFAULT_EXTERNAL_APP_LABEL,
    }
  }

  if (draft.privacyMode === 'aliasOnly') {
    return {
      title: titleInput || alias,
      body: bodyInput || copy.preview.aliasFallbackBody,
      caption: alias,
    }
  }

  return {
    title: titleInput || `${displayName} ${copy.preview.visibleTitleSuffix}`,
    body: bodyInput || `${previewTime} · ${mode}`,
    caption: displayName,
  }
}

function resolveWidgetPreview(draft: Draft, lang: Lang) {
  const widget = resolveWidgetPreviewContent(draft, lang)
  return widget.muted ? widget.title : `${widget.title}${widget.detail ? ` · ${widget.detail}` : ''}`
}

function resolveWidgetPreviewContent(draft: Draft, lang: Lang) {
  const copy = CHECK_ITEM_COPY[lang]
  const leadTime = previewLeadTime(draft)
  const previewTime = leadTime ? formatTime(leadTime.hour, leadTime.minute, lang) : copy.preview.timeUnknown
  const alias = draft.aliasName.trim() || DEFAULT_EXTERNAL_APP_LABEL
  const displayName = resolvePreviewName(draft)
  const mode = modeLabel(leadTime?.reminderMode ?? 'scan', lang)

  if (draft.widgetDisplayMode === 'hidden') {
    return {
      badge: copy.widget.hidden,
      header: copy.preview.widgetHint,
      title: copy.preview.hiddenWidget,
      detail: previewTime,
      muted: true,
    }
  }

  if (draft.widgetDisplayMode === 'timeOnly') {
    return {
      badge: copy.widget.timeOnly,
      header: copy.preview.widgetHint,
      title: `${copy.preview.nextCheck} ${previewTime}`,
      detail: mode,
      muted: false,
    }
  }

  if (draft.widgetDisplayMode === 'aliasOnly') {
    return {
      badge: copy.widget.aliasOnly,
      header: alias,
      title: `${alias} · ${previewTime}`,
      detail: copy.preview.pending,
      muted: false,
    }
  }

  return {
    badge: copy.widget.full,
    header: displayName,
    title: `${displayName} · ${previewTime}`,
    detail: mode,
    muted: false,
  }
}

function draftToInput(draft: Draft): MedicationWithTimesInput {
  const aliasName = draft.aliasName.trim()
  const actualName = draft.actualName.trim() || null
  const remainingQuantity = clampNumber(parsePositiveNumber(draft.remainingQuantity) ?? 1, 1, 999)
  const dosePerIntake = clampDosePerIntake(draft.dosePerIntake)
  return {
    aliasName,
    actualName,
    quantityTrackingEnabled: draft.quantityTrackingEnabled,
    remainingQuantity: draft.quantityTrackingEnabled ? remainingQuantity : 0,
    dosePerIntake: draft.quantityTrackingEnabled ? dosePerIntake : 1,
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

function validateDraft(draft: Draft, lang: Lang): ValidationState {
  const validation: ValidationState = {}
  const aliasLength = draft.aliasName.trim().length
  const actualLength = draft.actualName.trim().length
  const remainingQuantity = parsePositiveNumber(draft.remainingQuantity)
  const dosePerIntake = parsePositiveNumber(draft.dosePerIntake)

  const messages = {
    ko: {
      aliasRequired: '이름을 입력해주세요',
      aliasMax: '이름은 16자 이하로 입력해주세요',
      actualMax: '실제 이름은 32자 이하로 입력해주세요',
      remainingRequired: '남은 수량을 입력해주세요',
      remainingMin: '남은 수량은 1 이상이어야 해요',
      doseRequired: '1회 복용량을 입력해주세요',
      doseMin: '1회 복용량은 1 이상이어야 해요',
      timeRequired: '시간을 하나 이상 추가해주세요',
      titleRequired: '알림 제목을 입력해주세요',
      bodyRequired: '알림 문구를 입력해주세요',
    },
    en: {
      aliasRequired: 'Enter a name.',
      aliasMax: 'Use 16 characters or fewer.',
      actualMax: 'Use 32 characters or fewer.',
      remainingRequired: 'Enter the remaining quantity.',
      remainingMin: 'Remaining quantity must be at least 1.',
      doseRequired: 'Enter the dose amount.',
      doseMin: 'Dose must be at least 1.',
      timeRequired: 'Add at least one time.',
      titleRequired: 'Enter a notification title.',
      bodyRequired: 'Enter a notification body.',
    },
    ja: {
      aliasRequired: '名前を入力してください',
      aliasMax: '名前は16文字以内で入力してください',
      actualMax: '実際の名前は32文字以内で入力してください',
      remainingRequired: '残量を入力してください',
      remainingMin: '残量は1以上で入力してください',
      doseRequired: '1回量を入力してください',
      doseMin: '1回量は1以上で入力してください',
      timeRequired: '時間を1つ以上追加してください',
      titleRequired: '通知タイトルを入力してください',
      bodyRequired: '通知本文を入力してください',
    },
  }[lang]

  if (aliasLength === 0) {
    validation.aliasName = messages.aliasRequired
  } else if (aliasLength > 16) {
    validation.aliasName = messages.aliasMax
  }

  if (actualLength > 32) {
    validation.actualName = messages.actualMax
  }

  if (draft.quantityTrackingEnabled) {
    if (remainingQuantity == null) {
      validation.remainingQuantity = messages.remainingRequired
    } else if (remainingQuantity <= 0) {
      validation.remainingQuantity = messages.remainingMin
    }

    if (dosePerIntake == null) {
      validation.dosePerIntake = messages.doseRequired
    } else if (dosePerIntake <= 0) {
      validation.dosePerIntake = messages.doseMin
    }
  }

  if (draft.times.length === 0) {
    validation.times = messages.timeRequired
  }

  if (draft.notificationTitle.trim().length === 0) {
    validation.notificationTitle = messages.titleRequired
  }

  if (draft.notificationBody.trim().length === 0) {
    validation.notificationBody = messages.bodyRequired
  }

  return validation
}

function StepHeader({ step, lang, stepIndex }: { step: StepKey; lang: Lang; stepIndex: number }) {
  const copy = CHECK_ITEM_COPY[lang]
  const subtitle = copy.stepSubtitle[step].trim()

  return (
    <View style={styles.stepHeaderBlock}>
      <Text style={styles.stepCaption}>{replaceTokens(copy.stepCount, { current: stepIndex + 1 })}</Text>
      <Text style={styles.stepTitle}>{copy.stepTitle[step]}</Text>
      {subtitle ? <Text style={styles.stepSubtitle}>{subtitle}</Text> : null}
    </View>
  )
}

function FieldLabel({ label, required = false }: { label: string; required?: boolean }) {
  return (
    <Text style={styles.fieldLabel} numberOfLines={1} ellipsizeMode="tail">
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
            <Text style={[styles.segmentText, selected && styles.segmentTextOn]} numberOfLines={1} ellipsizeMode="tail">{option.label}</Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

function NumberStepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (value: number) => void }) {
  const decreaseDisabled = value <= min
  const increaseDisabled = value >= max

  return (
    <View style={styles.stepper}>
      <TouchableOpacity
        style={[styles.stepperButton, decreaseDisabled && styles.stepperButtonDisabled]}
        onPress={() => onChange(clampNumber(value - 1, min, max))}
        disabled={decreaseDisabled}
      >
        <Ionicons name="remove" size={16} color={decreaseDisabled ? '#AEB4BE' : ui.color.textPrimary} />
      </TouchableOpacity>
      <Text style={styles.stepperValue}>{value}</Text>
      <TouchableOpacity
        style={[styles.stepperButton, increaseDisabled && styles.stepperButtonDisabled]}
        onPress={() => onChange(clampNumber(value + 1, min, max))}
        disabled={increaseDisabled}
      >
        <Ionicons name="add" size={16} color={increaseDisabled ? '#AEB4BE' : ui.color.textPrimary} />
      </TouchableOpacity>
    </View>
  )
}

function PhonePreviewCard({
  draft,
  lang,
  onWidgetPress,
  canOpenWidget,
}: {
  draft: Draft
  lang: Lang
  onWidgetPress: () => void
  canOpenWidget: boolean
}) {
  const copy = CHECK_ITEM_COPY[lang]
  const notification = resolveNotificationPreviewContent(draft, lang)
  const widget = resolveWidgetPreviewContent(draft, lang)
  const leadTime = previewLeadTime(draft)
  const widgetActionLabel = draft.widgetDisplayMode === 'hidden'
    ? copy.widget.hidden
    : !canOpenWidget
      ? copy.preview.saveThenOpen
      : leadTime?.reminderMode === 'scan'
        ? copy.preview.openScan
        : leadTime?.reminderMode === 'notify'
          ? copy.preview.openCheck
          : copy.preview.openDetail

  return (
    <View style={styles.phonePreviewCard}>
      <View style={styles.previewCardHeader}>
        <Text style={styles.previewCardLabel}>{copy.field.previewBadge}</Text>
      </View>

      <View style={styles.notificationPreviewShell}>
        <View style={styles.previewSectionHeader}>
          <Text style={styles.previewSectionLabel}>{copy.field.previewNotification}</Text>
          <Text style={styles.previewSectionCaption}>{notification.caption}</Text>
        </View>

        <View style={styles.notificationAppRow}>
          <View style={styles.notificationAppIcon}>
            <Text style={styles.notificationAppIconText}>T</Text>
          </View>
          <Text style={styles.notificationAppName}>Timepill</Text>
        </View>
        <Text style={styles.notificationPreviewTitle}>{notification.title}</Text>
        <Text style={styles.notificationPreviewBody}>{notification.body}</Text>
      </View>

      <TouchableOpacity
        style={[
          styles.widgetPreviewCard,
          widget.muted && styles.widgetPreviewCardMuted,
          !canOpenWidget && styles.widgetPreviewCardDisabled,
        ]}
        onPress={onWidgetPress}
        disabled={!canOpenWidget}
        activeOpacity={0.86}
      >
        <View style={styles.widgetPreviewTopRow}>
          <Text style={styles.previewSectionLabel}>{copy.field.previewWidget}</Text>
          <View style={[styles.widgetPreviewBadge, widget.muted && styles.widgetPreviewBadgeMuted]}>
            <Text style={[styles.widgetPreviewBadgeText, widget.muted && styles.widgetPreviewBadgeTextMuted]}>{widget.badge}</Text>
          </View>
        </View>

        <Text style={[styles.widgetPreviewHeader, widget.muted && styles.widgetPreviewHeaderMuted]}>{widget.header}</Text>
        <Text style={[styles.widgetPreviewTitle, widget.muted && styles.widgetPreviewTitleMuted]}>{widget.title}</Text>
        <Text style={[styles.widgetPreviewDetail, widget.muted && styles.widgetPreviewDetailMuted]}>{widget.detail}</Text>

        <View style={styles.widgetPreviewActionRow}>
          <Text style={[styles.widgetPreviewActionText, !canOpenWidget && styles.widgetPreviewActionTextMuted]}>{widgetActionLabel}</Text>
          {canOpenWidget ? <Ionicons name="arrow-forward" size={16} color={ui.color.textPrimary} /> : null}
        </View>
      </TouchableOpacity>
    </View>
  )
}

function SummaryModeBadge({ mode, lang }: { mode: ReminderMode; lang: Lang }) {
  const label = modeLabel(mode, lang)

  return (
    <View style={[
      styles.summaryModeBadge,
      mode === 'notify' && styles.summaryModeBadgeNotify,
      mode === 'scan' && styles.summaryModeBadgeScan,
      mode === 'off' && styles.summaryModeBadgeOff,
    ]}>
      <Text style={[
        styles.summaryModeBadgeText,
        mode === 'notify' && styles.summaryModeBadgeTextNotify,
        mode === 'scan' && styles.summaryModeBadgeTextScan,
        mode === 'off' && styles.summaryModeBadgeTextOff,
      ]}>
        {label}
      </Text>
    </View>
  )
}

function ReminderModeSelector({ value, onChange }: { value: ReminderMode; lang: Lang; onChange: (value: ReminderMode) => void }) {
  const isOn = value !== 'off'
  return (
    <Switch
      value={isOn}
      onValueChange={v => onChange(v ? 'notify' : 'off')}
      trackColor={{ false: '#DADDE3', true: '#22C55E' }}
      thumbColor="#FFFFFF"
      ios_backgroundColor="#DADDE3"
      style={{ transform: [{ scale: 1.2 }] }}
    />
  )
}

export default function CheckItemScreen() {
  const { slotId, medicationId } = useLocalSearchParams<{ slotId?: string; medicationId?: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { lang } = useI18n()
  const copy = CHECK_ITEM_COPY[lang]
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
  const periodOptions = [...copy.periods]

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
          ? sanitizeLoadedQuantity(target.medication.remainingQuantity ?? target.medication.currentQuantity)
          : '',
        dosePerIntake: String(clampDosePerIntake(target.medication.dosePerIntake ?? firstReminder?.doseCountPerIntake ?? 1)),
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
  const previewLead = sortedTimes[0] ?? null
  const widgetDisplayMode = draft?.widgetDisplayMode ?? 'hidden'
  const validation = useMemo(() => draft ? validateDraft(draft, lang) : {}, [draft, lang])
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

  const canOpenWidgetPreview = widgetDisplayMode !== 'hidden' && Boolean(previewLead && (previewLead.id || previewLead.reminderMode === 'scan'))

  const openWidgetPreview = useCallback(() => {
    if (!previewLead || widgetDisplayMode === 'hidden') return

    if (previewLead.id) {
      if (previewLead.reminderMode === 'scan') {
        router.navigate(`/scan?slotId=${previewLead.id}`)
        return
      }

      if (previewLead.reminderMode === 'notify') {
        router.navigate(`/alarm?slotId=${previewLead.id}`)
        return
      }

      router.push({ pathname: '/check-item', params: { slotId: previewLead.id } })
      return
    }

    if (previewLead.reminderMode === 'scan') {
      router.navigate('/scan?test=1')
    }
  }, [previewLead, router, widgetDisplayMode])

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
      setTimeActionError(lang === 'en' ? 'That time is already added.' : lang === 'ja' ? 'すでに追加された時間です' : '이미 추가된 시간이에요')
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
          reminderMode: 'scan',
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
      const toastMessage = draft.medicationId
        ? (lang === 'en' ? 'Updated.' : lang === 'ja' ? '更新しました' : '수정했어요')
        : (lang === 'en' ? 'Saved.' : lang === 'ja' ? '保存しました' : '저장했어요')
      if (draft.medicationId) {
        await updateMedicationWithTimes(draft.medicationId, input)
      } else {
        await createMedicationWithTimes(input)
      }
      router.back()
      setTimeout(() => publishToast(toastMessage), 140)
    } catch (error) {
      Alert.alert(lang === 'en' ? 'Save failed' : lang === 'ja' ? '保存に失敗しました' : '저장 실패', error instanceof Error ? error.message : undefined)
    } finally {
      setSaving(false)
    }
  }, [allValid, draft, handleInvalidAdvance, lang, router, sortedTimes])

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

  const leftButtonLabel = stepIndex === 0 ? copy.buttons.close : copy.buttons.back
  const rightButtonLabel = activeStep === 'review' ? copy.buttons.save : copy.buttons.next
  const bottomScrollPadding = ACTION_BAR_HEIGHT + insets.bottom + 24

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
        <View style={styles.headerSpacer} />
      </View>

      {activeStep === 'alert' ? (
        <>
          <View style={styles.alertTopArea}>
            <StepHeader step={activeStep} lang={lang} stepIndex={stepIndex} />
            <PhonePreviewCard
              draft={draft}
              lang={lang}
              onWidgetPress={openWidgetPreview}
              canOpenWidget={canOpenWidgetPreview}
            />
          </View>

          <ScrollView
            ref={scrollRef}
            style={styles.flexScroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={[styles.scroll, styles.alertScroll, { paddingBottom: bottomScrollPadding }]}
          >
            <View style={styles.stack}>
              <Card style={styles.formCard}>
                <Text style={styles.sectionMiniTitle}>{copy.field.notificationText}</Text>
                <View onLayout={recordSectionOffset('notificationTitle')}>
                  <FieldLabel label={copy.field.notificationTitle} required />
                  <TextInput
                    style={[styles.input, validation.notificationTitle && styles.inputError]}
                    placeholder={copy.field.notificationTitlePlaceholder}
                    placeholderTextColor={ui.color.textSecondary}
                    value={draft.notificationTitle}
                    onChangeText={notificationTitle => updateDraft({ notificationTitle })}
                  />
                  {validation.notificationTitle ? <Text style={styles.errorText}>{validation.notificationTitle}</Text> : null}
                </View>

                <View style={styles.formSectionGap} onLayout={recordSectionOffset('notificationBody')}>
                  <FieldLabel label={copy.field.notificationBody} required />
                  <TextInput
                    style={[styles.input, validation.notificationBody && styles.inputError]}
                    placeholder={copy.field.notificationBodyPlaceholder}
                    placeholderTextColor={ui.color.textSecondary}
                    value={draft.notificationBody}
                    onChangeText={notificationBody => updateDraft({ notificationBody })}
                  />
                  {validation.notificationBody ? <Text style={styles.errorText}>{validation.notificationBody}</Text> : null}
                </View>
              </Card>

              <Card style={styles.formCard}>
                <Text style={styles.sectionMiniTitle}>{copy.field.privacy}</Text>
                <Segment value={draft.privacyMode} options={privacyOptions(lang)} onChange={privacyMode => updateDraft({ privacyMode })} />
              </Card>

              <Card style={styles.formCard}>
                <Text style={styles.sectionMiniTitle}>{copy.field.widget}</Text>
                <Segment value={draft.widgetDisplayMode} options={widgetOptions(lang)} onChange={widgetDisplayMode => updateDraft({ widgetDisplayMode })} />
              </Card>
            </View>
          </ScrollView>
        </>
      ) : (
        <ScrollView
          ref={scrollRef}
          style={styles.flexScroll}
          scrollEnabled={!wheelInteracting}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.scroll, { paddingBottom: bottomScrollPadding }]}
        >
          <StepHeader step={activeStep} lang={lang} stepIndex={stepIndex} />

          {activeStep === 'name' ? (
            <View style={styles.stack}>
              <Card style={styles.formCard}>
                <View onLayout={recordSectionOffset('aliasName')}>
                  <FieldLabel label={copy.field.aliasName} />
                  <TextInput
                    style={[styles.input, validation.aliasName && styles.inputError]}
                    placeholder={copy.field.aliasPlaceholder}
                    placeholderTextColor={ui.color.textSecondary}
                    value={draft.aliasName}
                    maxLength={16}
                    onChangeText={aliasName => updateDraft({ aliasName })}
                  />
                  {validation.aliasName ? <Text style={styles.errorText}>{validation.aliasName}</Text> : null}
                </View>

                <View style={styles.formSectionGap}>
                  <FieldLabel label={copy.field.actualName} />
                  <TextInput
                    style={[styles.input, validation.actualName && styles.inputError]}
                    placeholder={copy.field.actualPlaceholder}
                    placeholderTextColor={ui.color.textSecondary}
                    value={draft.actualName}
                    maxLength={32}
                    onChangeText={actualName => updateDraft({ actualName })}
                  />
                  {validation.actualName ? <Text style={styles.errorText}>{validation.actualName}</Text> : null}
                </View>
              </Card>

              <Card style={styles.formCard}>
                <View onLayout={recordSectionOffset('quantity')} style={styles.quantityHeader}>
                  <FieldLabel label={copy.field.quantityTracking} />
                  <Switch
                    value={draft.quantityTrackingEnabled}
                    onValueChange={value => updateDraft({
                      quantityTrackingEnabled: value,
                      remainingQuantity: value ? draft.remainingQuantity : '',
                      dosePerIntake: value ? String(clampDosePerIntake(draft.dosePerIntake)) : '1',
                    })}
                    trackColor={{ false: '#D8D8D8', true: '#FFD08A' }}
                    thumbColor={draft.quantityTrackingEnabled ? ui.color.orange : '#FFFFFF'}
                  />
                </View>

                {draft.quantityTrackingEnabled ? (
                  <View style={styles.metricGrid}>
                    <View style={styles.metricField}>
                      <FieldLabel label={copy.field.remainingQuantity} required />
                      <TextInput
                        style={[styles.metricInput, validation.remainingQuantity && styles.metricInputError]}
                        keyboardType="number-pad"
                        value={draft.remainingQuantity}
                        onChangeText={value => updateDraft({ remainingQuantity: sanitizeRemainingQuantityInput(value) })}
                      />
                      {validation.remainingQuantity ? <Text style={styles.errorText}>{validation.remainingQuantity}</Text> : null}
                    </View>
                    <View style={styles.metricField}>
                      <FieldLabel label={copy.field.dosePerIntake} required />
                      <NumberStepper
                        value={clampDosePerIntake(draft.dosePerIntake)}
                        min={1}
                        max={9}
                        onChange={value => updateDraft({ dosePerIntake: String(value) })}
                      />
                      {validation.dosePerIntake ? <Text style={styles.errorText}>{validation.dosePerIntake}</Text> : null}
                    </View>
                  </View>
                ) : null}
              </Card>
            </View>
          ) : null}

          {activeStep === 'time' ? (
            <View style={styles.stack} onLayout={recordSectionOffset('times')}>
              <Card style={styles.formCard}>
                <FieldLabel label={copy.field.addedTimes} required />
                <View style={styles.wheelRow}>
                  <WheelColumn items={periodOptions} selectedIndex={periodIndex} onIndexChange={setPeriodIndex} width={72} onInteractionChange={setWheelInteracting} />
                  <WheelColumn items={HOURS} selectedIndex={hourIndex} onIndexChange={setHourIndex} width={74} enableDirectInput numericInput onInteractionChange={setWheelInteracting} />
                  <Text style={styles.colon}>:</Text>
                  <WheelColumn items={MINUTES} selectedIndex={minuteIndex} onIndexChange={setMinuteIndex} width={74} enableDirectInput numericInput onInteractionChange={setWheelInteracting} />
                </View>
                <SecondaryButton label={copy.buttons.addTime} icon="add" onPress={addSelectedTime} />
              </Card>
              {timeActionError ? <Text style={styles.errorText}>{timeActionError}</Text> : null}
              {!timeActionError && validation.times ? <Text style={styles.errorText}>{attemptedAdvance || draft.times.length === 0 ? validation.times : ''}</Text> : null}

              {sortedTimes.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>{copy.field.noTimes}</Text>
                </View>
              ) : (
                <View style={styles.timeListBlock}>
                  {sortedTimes.map(time => (
                    <View key={time.localKey} style={styles.reminderRow}>
                      <View style={styles.reminderRowMain}>
                        <Text style={styles.reminderTimeText}>{formatTime(time.hour, time.minute, lang)}</Text>
                        <View style={styles.reminderModeMeta}>
                          <View style={[
                            styles.reminderDot,
                            time.reminderMode === 'off' ? styles.reminderDotOff : styles.reminderDotNotify,
                          ]} />
                          <Text style={styles.reminderModeText}>{time.reminderMode === 'off' ? 'OFF' : 'ON'}</Text>
                        </View>
                      </View>
                      <View style={styles.reminderRowActions}>
                        <ReminderModeSelector
                          value={time.reminderMode}
                          lang={lang}
                          onChange={reminderMode => updateTime(time.localKey, { reminderMode })}
                        />
                        <TouchableOpacity style={styles.deleteIconButton} onPress={() => deleteTime(time.localKey)} accessibilityLabel={lang === 'en' ? 'Delete' : lang === 'ja' ? '削除' : '삭제'}>
                          <Ionicons name="trash-outline" size={18} color={ui.color.danger} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ) : null}

          {activeStep === 'review' ? (
            <View style={styles.stack}>
              <Card style={styles.reviewCard}>
                <Text style={styles.reviewCardTitle}>{copy.review.medicationCard}</Text>
                <ReviewRow label={copy.review.aliasName} value={draft.aliasName.trim() || '-'} />
                <ReviewRow label={copy.review.actualName} value={draft.actualName.trim() || '-'} />
                <ReviewRow label={copy.review.quantityTracking} value={draft.quantityTrackingEnabled ? copy.review.on : copy.review.off} />
                {draft.quantityTrackingEnabled ? (
                  <>
                    <ReviewRow label={copy.review.remainingQuantity} value={draft.remainingQuantity || '1'} />
                    <ReviewRow label={copy.review.dosePerIntake} value={String(clampDosePerIntake(draft.dosePerIntake))} />
                  </>
                ) : null}
              </Card>

              <Card style={styles.reviewCard}>
                <Text style={styles.reviewCardTitle}>{copy.review.timeList}</Text>
                {sortedTimes.map(time => (
                  <View key={time.localKey} style={styles.reviewTimeRow}>
                    <Text style={styles.reviewTimeText}>{formatTime(time.hour, time.minute, lang)}</Text>
                    <SummaryModeBadge mode={time.reminderMode} lang={lang} />
                  </View>
                ))}
              </Card>

              <Card style={styles.reviewCard}>
                <Text style={styles.reviewCardTitle}>{copy.review.displayCard}</Text>
                <ReviewRow label={copy.review.notificationTitle} value={draft.notificationTitle.trim() || '-'} />
                <ReviewRow label={copy.review.notificationBody} value={draft.notificationBody.trim() || '-'} />
                <ReviewRow label={copy.review.privacy} value={privacyOptions(lang).find(option => option.value === draft.privacyMode)?.label ?? '-'} />
                <ReviewRow label={copy.review.widget} value={widgetOptions(lang).find(option => option.value === draft.widgetDisplayMode)?.label ?? '-'} />
              </Card>
            </View>
          ) : null}
        </ScrollView>
      )}

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity style={styles.footerSecondaryButton} onPress={goBack} disabled={saving}>
          <Text style={styles.footerSecondaryText}>{leftButtonLabel}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.footerPrimaryButton, (!currentStepValid || saving) && styles.footerPrimaryDisabled]}
          onPress={goNext}
          disabled={saving || !currentStepValid}
        >
          <Text style={styles.footerPrimaryText}>{saving ? copy.buttons.saving : rightButtonLabel}</Text>
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
    gap: 12,
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: ui.color.border,
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  headerSpacer: {
    height: 44,
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
  flexScroll: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: 24,
    paddingTop: 6,
  },
  alertTopArea: {
    backgroundColor: ui.color.background,
    paddingHorizontal: 24,
    paddingTop: 4,
    paddingBottom: 12,
  },
  alertScroll: {
    paddingTop: 4,
  },
  stepHeaderBlock: {
    gap: 4,
    marginBottom: 14,
  },
  stepCaption: {
    color: ui.color.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  stepTitle: {
    color: ui.color.textPrimary,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 0,
    lineHeight: 34,
  },
  stepSubtitle: {
    color: ui.color.textSecondary,
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
  },
  stack: {
    gap: 10,
    paddingBottom: 0,
  },
  formCard: {
    gap: 10,
  },
  formSectionGap: {
    gap: 8,
  },
  sectionMiniTitle: {
    color: ui.color.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  fieldLabel: {
    color: ui.color.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  requiredMark: {
    color: '#EF4444',
  },
  largeInput: {
    backgroundColor: ui.color.input,
    borderRadius: 18,
    color: ui.color.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    minHeight: 56,
    paddingHorizontal: 18,
  },
  input: {
    backgroundColor: ui.color.input,
    borderRadius: 18,
    color: ui.color.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    minHeight: 52,
    paddingHorizontal: 16,
  },
  inputError: {
    borderColor: '#F3A4A4',
    borderWidth: 1,
  },
  errorText: {
    color: '#B4532A',
    fontSize: 13,
    fontWeight: '600',
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
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  quantityOffText: {
    color: ui.color.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  cardTitle: {
    color: ui.color.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  metricGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  metricField: {
    backgroundColor: ui.color.input,
    borderRadius: 16,
    flex: 1,
    gap: 10,
    padding: 14,
  },
  metricInput: {
    color: ui.color.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    padding: 0,
  },
  metricInputError: {
    color: ui.color.danger,
  },
  stepper: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stepperButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  stepperButtonDisabled: {
    backgroundColor: '#F2F4F7',
  },
  stepperValue: {
    color: ui.color.textPrimary,
    fontSize: 22,
    fontWeight: '700',
  },
  wheelCard: {
    paddingVertical: 18,
  },
  wheelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    minHeight: 216,
  },
  colon: {
    color: ui.color.textPrimary,
    fontSize: 30,
    fontWeight: '700',
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
    fontWeight: '500',
  },
  timeListBlock: {
    gap: 10,
  },
  reminderRow: {
    alignItems: 'center',
    backgroundColor: ui.color.input,
    borderRadius: 20,
    flexDirection: 'row',
    gap: 12,
    minHeight: 76,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  reminderRowMain: {
    flex: 1,
    gap: 5,
    paddingLeft: 6,
  },
  reminderModeMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  reminderRowActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  reminderDot: {
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  reminderDotNotify: {
    backgroundColor: '#22C55E',
  },
  reminderDotScan: {
    backgroundColor: '#4ade80',
  },
  reminderDotOff: {
    backgroundColor: '#AEB4BE',
  },
  reminderTimeText: {
    color: ui.color.textPrimary,
    fontSize: 21,
    fontWeight: '700',
  },
  reminderModeText: {
    color: ui.color.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  deleteIconButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  previewCard: {
    backgroundColor: ui.color.softCard,
    gap: 10,
  },
  optionBlock: {
    gap: 8,
  },
  helperText: {
    color: ui.color.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  segment: {
    backgroundColor: ui.color.input,
    borderRadius: 16,
    flexDirection: 'row',
    padding: 4,
  },
  segmentButton: {
    alignItems: 'center',
    borderRadius: 12,
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
  },
  segmentButtonOn: {
    backgroundColor: ui.color.textPrimary,
  },
  segmentText: {
    color: ui.color.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  segmentTextOn: {
    color: '#FFFFFF',
  },
  phonePreviewCard: {
    backgroundColor: '#F6F3EE',
    borderColor: '#E7E0D6',
    borderRadius: 28,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  previewCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  previewCardLabel: {
    color: ui.color.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  previewSectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  previewSectionLabel: {
    color: ui.color.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  previewSectionCaption: {
    color: ui.color.textSecondary,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'right',
  },
  notificationPreviewShell: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E8E5DF',
    borderRadius: 22,
    borderWidth: 1,
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  notificationAppRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  notificationAppIcon: {
    alignItems: 'center',
    backgroundColor: ui.color.orange,
    borderRadius: 10,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  notificationAppIconText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  notificationAppName: {
    color: '#101319',
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  notificationPreviewTitle: {
    color: '#101319',
    fontSize: 16,
    fontWeight: '700',
  },
  notificationPreviewBody: {
    color: '#454B57',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  widgetPreviewTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  widgetPreviewBadge: {
    alignItems: 'center',
    backgroundColor: ui.color.orangeLight,
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 28,
    paddingHorizontal: 10,
  },
  widgetPreviewBadgeMuted: {
    backgroundColor: '#E4E7EC',
  },
  widgetPreviewBadgeText: {
    color: ui.color.textPrimary,
    fontSize: 12,
    fontWeight: '700',
  },
  widgetPreviewBadgeTextMuted: {
    color: designHarness.colors.textSecondary,
  },
  widgetPreviewCard: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E8E5DF',
    borderRadius: 24,
    borderWidth: 1,
    gap: 6,
    minHeight: 108,
    padding: 16,
  },
  widgetPreviewCardMuted: {
    backgroundColor: '#ECEEF2',
  },
  widgetPreviewCardDisabled: {
    opacity: 0.82,
  },
  widgetPreviewHeader: {
    color: ui.color.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  widgetPreviewHeaderMuted: {
    color: designHarness.colors.textSecondary,
  },
  widgetPreviewTitle: {
    color: ui.color.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  widgetPreviewTitleMuted: {
    color: '#4B5563',
  },
  widgetPreviewDetail: {
    color: ui.color.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  widgetPreviewDetailMuted: {
    color: designHarness.colors.textSecondary,
  },
  widgetPreviewActionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  widgetPreviewActionText: {
    color: ui.color.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  widgetPreviewActionTextMuted: {
    color: ui.color.textSecondary,
  },
  reviewCard: {
    gap: 10,
  },
  reviewCardTitle: {
    color: ui.color.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
  reviewRow: {
    alignItems: 'center',
    borderBottomColor: ui.color.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 42,
  },
  reviewLabel: {
    color: ui.color.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  reviewValue: {
    color: ui.color.textPrimary,
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
  },
  reviewTimeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 40,
  },
  reviewTimeText: {
    color: ui.color.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  summaryModeBadge: {
    alignItems: 'center',
    borderRadius: 999,
    justifyContent: 'center',
    minHeight: 28,
    paddingHorizontal: 10,
  },
  summaryModeBadgeNotify: {
    backgroundColor: '#FFF3CC',
  },
  summaryModeBadgeScan: {
    backgroundColor: ui.color.textPrimary,
  },
  summaryModeBadgeOff: {
    backgroundColor: '#ECEDEF',
  },
  summaryModeBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  summaryModeBadgeTextNotify: {
    color: '#D97904',
  },
  summaryModeBadgeTextScan: {
    color: '#FFFFFF',
  },
  summaryModeBadgeTextOff: {
    color: designHarness.colors.textSecondary,
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
    height: 54,
    justifyContent: 'center',
  },
  footerSecondaryText: {
    color: ui.color.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  footerPrimaryButton: {
    alignItems: 'center',
    backgroundColor: ui.color.textPrimary,
    borderRadius: 18,
    flex: 60,
    height: 54,
    justifyContent: 'center',
  },
  footerPrimaryDisabled: {
    backgroundColor: '#C8CDD4',
  },
  footerPrimaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
})
