import type {
  LockScreenVisibility,
  ReminderMode,
  ReminderIntensity,
  ReminderPrivacyLevel,
  WidgetVisibility,
} from '@/db/schema'
import {
  DEFAULT_EXTERNAL_APP_LABEL as EXTERNAL_APP_LABEL_DEFAULT,
  DEFAULT_PRIVATE_NOTIFICATION_BODY as PRIVATE_BODY_DEFAULT,
  DEFAULT_PRIVATE_NOTIFICATION_TITLE as PRIVATE_TITLE_DEFAULT,
} from '@/constants/appIdentity'
import { translate, type Lang } from '@/constants/translations'
type SlotLike = {
  hour: number
  minute: number
  displayAlias: string | null
  reminderMode?: string | null
  privacyLevel: string
  notificationTitle: string | null
  notificationBody: string | null
  preReminderBody: string | null
  overdueReminderBody: string | null
  preReminderEnabled: number
  preReminderMinutes: number
  reminderIntensity: string
  repeatRemindersEnabled: number
  repeatSchedule: string | null
  maxRepeatDurationMinutes: number
  snoozeMinutes: number
  widgetVisibility: string
  lockScreenVisibility: string
}

type SettingsLike = {
  language?: string | null
  externalAppLabel?: string | null
  privateNotificationTitle?: string | null
  privateNotificationBody?: string | null
}

export type ReminderPhase = 'pre' | 'due' | 'late' | 'overdue' | 'urgent' | 'snooze' | 'completed'

export const DEFAULT_EXTERNAL_APP_LABEL = EXTERNAL_APP_LABEL_DEFAULT
export const DEFAULT_PRIVATE_TITLE = PRIVATE_TITLE_DEFAULT
export const DEFAULT_PRIVATE_BODY = PRIVATE_BODY_DEFAULT
export const DEFAULT_DUE_BODY = '체크할 시간이야'
export const DEFAULT_LATE_BODY = '아직 완료되지 않았어요'
export const DEFAULT_OVERDUE_BODY = '오늘 확인이 지연되고 있어요'
export const DEFAULT_URGENT_BODY = '지금 확인하거나 나중으로 미뤄주세요'
export const DEFAULT_PRE_BODY = '곧 체크할 시간이야'
export const DEFAULT_COMPLETED_BODY = '오늘 체크가 완료됐어요'

export const REMINDER_INTENSITY_PRESETS: Record<ReminderIntensity, number[]> = {
  light: [0],
  normal: [0, 10, 30],
  strong: [0, 5, 15, 30, 60],
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function normalizeLanguage(value?: string | null): Lang {
  if (value === 'en' || value === 'ja') return value
  return 'ko'
}

export function resolveExternalAppLabel(settings?: SettingsLike | null): string {
  return clean(settings?.externalAppLabel) ?? DEFAULT_EXTERNAL_APP_LABEL
}

export function resolvePrivateTitle(settings?: SettingsLike | null, slot?: Partial<SlotLike> | null): string {
  return clean(slot?.notificationTitle) ?? clean(settings?.privateNotificationTitle) ?? DEFAULT_PRIVATE_TITLE
}

export function resolvePrivateBody(settings?: SettingsLike | null, slot?: Partial<SlotLike> | null): string {
  return clean(slot?.notificationBody) ?? clean(settings?.privateNotificationBody) ?? DEFAULT_PRIVATE_BODY
}

export function inferRoutineAlias(hour: number, minute: number, language: Lang = 'ko'): string {
  const slotTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  if (hour < 10) return translate(language, 'notificationAliasMorning', { time: slotTime })
  if (hour < 14) return translate(language, 'notificationAliasMidday', { time: slotTime })
  if (hour < 18) return translate(language, 'notificationAliasAfternoon', { time: slotTime })
  if (hour < 22) return translate(language, 'notificationAliasEvening', { time: slotTime })
  return translate(language, 'notificationAliasNight', { time: slotTime })
}

export function resolveSlotAlias(
  slot: Pick<SlotLike, 'displayAlias' | 'hour' | 'minute'>,
  language?: string | null,
): string {
  return clean(slot.displayAlias) ?? inferRoutineAlias(slot.hour, slot.minute, normalizeLanguage(language))
}

export function classifyReminderPhase(offsetMinutes: number): ReminderPhase {
  if (offsetMinutes < 0) return 'pre'
  if (offsetMinutes === 0) return 'due'
  if (offsetMinutes >= 60) return 'urgent'
  if (offsetMinutes >= 30) return 'overdue'
  return 'late'
}

function defaultNeutralBody(phase: ReminderPhase): string {
  switch (phase) {
    case 'pre':
      return DEFAULT_PRE_BODY
    case 'due':
    case 'snooze':
      return DEFAULT_DUE_BODY
    case 'late':
      return DEFAULT_LATE_BODY
    case 'overdue':
      return DEFAULT_OVERDUE_BODY
    case 'urgent':
      return DEFAULT_URGENT_BODY
    case 'completed':
      return DEFAULT_COMPLETED_BODY
  }
}

function defaultPublicBody(phase: ReminderPhase, label: string): string {
  switch (phase) {
    case 'pre':
      return `${label} 복용 시간이 곧 시작됩니다`
    case 'due':
    case 'snooze':
      return `${label} 복용 시간입니다`
    case 'late':
      return `${label} 확인이 아직 완료되지 않았습니다`
    case 'overdue':
      return `${label} 확인이 지연되고 있습니다`
    case 'urgent':
      return `${label} 지금 확인하거나 나중으로 미뤄주세요`
    case 'completed':
      return `${label} 오늘 확인이 완료됐어요`
  }
}

function resolveCustomBody(slot: Pick<SlotLike, 'notificationBody' | 'preReminderBody' | 'overdueReminderBody'>, phase: ReminderPhase): string | null {
  if (phase === 'pre') return clean(slot.preReminderBody)
  if (phase === 'overdue' || phase === 'urgent') return clean(slot.overdueReminderBody) ?? clean(slot.notificationBody)
  return clean(slot.notificationBody)
}

export function resolveNotificationCopy(args: {
  slot: SlotLike
  medicationName: string
  settings?: SettingsLike | null
  phase: ReminderPhase
}): { title: string; body: string } {
  const { slot, medicationName, settings, phase } = args
  const privacyLevel = (slot.privacyLevel as ReminderPrivacyLevel) ?? 'hideMedicationName'
  const externalLabel = resolveExternalAppLabel(settings)
  const lockScreenVisibility = (slot.lockScreenVisibility as LockScreenVisibility) ?? 'neutral'

  if (lockScreenVisibility === 'hidden') {
    return { title: externalLabel, body: '' }
  }

  if (privacyLevel === 'public' && lockScreenVisibility === 'full') {
    const label = clean(slot.displayAlias) ?? medicationName
    return { title: externalLabel, body: defaultPublicBody(phase, label) }
  }

  if (privacyLevel === 'custom') {
    return {
      title: clean(slot.notificationTitle) ?? externalLabel,
      body: resolveCustomBody(slot, phase) ?? defaultNeutralBody(phase),
    }
  }

  if (privacyLevel === 'private') {
    const title = resolvePrivateTitle(settings, slot)
    const body = resolveCustomBody(slot, phase) ?? resolvePrivateBody(settings, slot)
    return { title, body: body || defaultNeutralBody(phase) }
  }

  return {
    title: externalLabel,
    body: defaultNeutralBody(phase),
  }
}

export function resolveReminderMode(slot: Pick<SlotLike, 'reminderMode'>): ReminderMode {
  const value = slot.reminderMode as ReminderMode | undefined
  if (value === 'off' || value === 'scan') return value
  return 'notify'
}

export function resolveReminderOffsets(slot: Pick<
  SlotLike,
  'preReminderEnabled' | 'preReminderMinutes' | 'reminderIntensity' | 'repeatRemindersEnabled' | 'repeatSchedule' | 'maxRepeatDurationMinutes' | 'reminderMode'
>): number[] {
  if (resolveReminderMode(slot) === 'off') {
    return []
  }

  const intensity = (slot.reminderIntensity as ReminderIntensity) ?? 'normal'
  const offsets = REMINDER_INTENSITY_PRESETS[intensity] ?? REMINDER_INTENSITY_PRESETS.normal
  const maxDuration = Math.max(0, slot.maxRepeatDurationMinutes ?? 60)
  return [...new Set(offsets)].filter(offset => offset <= maxDuration).sort((a, b) => a - b)
}

export function buildCustomRepeatSchedule(preReminderMinutes: number, repeatIntervalMinutes: number, maxDurationMinutes: number): number[] {
  const offsets: number[] = [0]
  const interval = Math.max(5, repeatIntervalMinutes)
  const maxDuration = Math.max(interval, maxDurationMinutes)

  for (let current = interval; current <= maxDuration; current += interval) {
    offsets.push(current)
  }

  if (preReminderMinutes > 0) {
    offsets.unshift(-preReminderMinutes)
  }

  return offsets
}

export function resolveWidgetVisibility(slot: Pick<SlotLike, 'widgetVisibility'>): WidgetVisibility {
  const value = slot.widgetVisibility as WidgetVisibility
  return value ?? 'aliasOnly'
}

export function resolveLockScreenVisibility(slot: Pick<SlotLike, 'lockScreenVisibility'>): LockScreenVisibility {
  const value = slot.lockScreenVisibility as LockScreenVisibility
  return value ?? 'neutral'
}
