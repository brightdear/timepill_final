import { db } from '@/db/client'
import { settings, doseRecords } from '@/db/schema'
import {
  DEFAULT_EXTERNAL_APP_LABEL,
  DEFAULT_PRIVATE_NOTIFICATION_BODY,
  DEFAULT_PRIVATE_NOTIFICATION_TITLE,
  LEGACY_PRIVATE_NOTIFICATION_BODY,
  LEGACY_PRIVATE_NOTIFICATION_TITLE,
} from '@/constants/appIdentity'
import { eq } from 'drizzle-orm'

const SETTINGS_ID = 1
type SupportedLanguage = 'ko' | 'en' | 'ja'
type SettingsRow = typeof settings.$inferSelect

let settingsLoadPromise: Promise<SettingsRow> | null = null

const DEFAULT_NOTIFICATION_COPY_BY_LANGUAGE: Record<SupportedLanguage, {
  externalAppLabel: string
  privateNotificationTitle: string
  privateNotificationBody: string
}> = {
  ko: {
    externalAppLabel: DEFAULT_EXTERNAL_APP_LABEL,
    privateNotificationTitle: DEFAULT_PRIVATE_NOTIFICATION_TITLE,
    privateNotificationBody: '체크할 시간이에요',
  },
  en: {
    externalAppLabel: DEFAULT_EXTERNAL_APP_LABEL,
    privateNotificationTitle: DEFAULT_PRIVATE_NOTIFICATION_TITLE,
    privateNotificationBody: 'Time to check',
  },
  ja: {
    externalAppLabel: DEFAULT_EXTERNAL_APP_LABEL,
    privateNotificationTitle: DEFAULT_PRIVATE_NOTIFICATION_TITLE,
    privateNotificationBody: 'チェックの時間です',
  },
}

const SYSTEM_EXTERNAL_APP_LABELS = new Set(
  [
    ...Object.values(DEFAULT_NOTIFICATION_COPY_BY_LANGUAGE).map(value => value.externalAppLabel),
    '오늘 체크',
    '今日のチェック',
  ],
)

const SYSTEM_PRIVATE_TITLES = new Set([
  ...Object.values(DEFAULT_NOTIFICATION_COPY_BY_LANGUAGE).map(value => value.privateNotificationTitle),
  '오늘 체크',
  '今日のチェック',
  LEGACY_PRIVATE_NOTIFICATION_TITLE,
])

const SYSTEM_PRIVATE_BODIES = new Set([
  ...Object.values(DEFAULT_NOTIFICATION_COPY_BY_LANGUAGE).map(value => value.privateNotificationBody),
  '체크할 시간이야',
  LEGACY_PRIVATE_NOTIFICATION_BODY,
])

function normalizeLanguage(value?: string | null): SupportedLanguage {
  if (value === 'en' || value === 'ja') return value
  return 'ko'
}

export function notificationDefaultsForLanguage(language?: string | null) {
  return DEFAULT_NOTIFICATION_COPY_BY_LANGUAGE[normalizeLanguage(language)]
}

function buildDefaultSettingsInsert(language: SupportedLanguage = 'ko'): Omit<typeof settings.$inferInsert, 'id'> {
  const notificationDefaults = notificationDefaultsForLanguage(language)

  return {
    privateMode: 0,
    freezesRemaining: 0,
    language,
    devMode: 0,
    defaultPrivacyLevel: 'hideMedicationName',
    defaultReminderIntensity: 'normal',
    defaultWidgetVisibility: 'aliasOnly',
    defaultLockScreenVisibility: 'neutral',
    badgeEnabled: 1,
    allowWidgetDirectComplete: 0,
    completeNotificationEnabled: 0,
    appLockEnabled: 0,
    screenPrivacyEnabled: 0,
    externalAppLabel: notificationDefaults.externalAppLabel,
    privateNotificationTitle: notificationDefaults.privateNotificationTitle,
    privateNotificationBody: notificationDefaults.privateNotificationBody,
  }
}

const DEFAULT_SETTINGS_INSERT = buildDefaultSettingsInsert()

async function loadSettings(): Promise<SettingsRow> {
  await db.insert(settings).values({ id: SETTINGS_ID, ...DEFAULT_SETTINGS_INSERT }).onConflictDoNothing()
  const current = (await db.select().from(settings).where(eq(settings.id, SETTINGS_ID)).get())!
  const localizedDefaults = notificationDefaultsForLanguage(current.language)

  const patch: Partial<typeof settings.$inferInsert> = {}
  if (!current.externalAppLabel?.trim() || SYSTEM_EXTERNAL_APP_LABELS.has(current.externalAppLabel.trim())) {
    patch.externalAppLabel = localizedDefaults.externalAppLabel
  }
  if (!current.privateNotificationTitle?.trim() || SYSTEM_PRIVATE_TITLES.has(current.privateNotificationTitle.trim())) {
    patch.privateNotificationTitle = localizedDefaults.privateNotificationTitle
  }
  if (!current.privateNotificationBody?.trim() || SYSTEM_PRIVATE_BODIES.has(current.privateNotificationBody.trim())) {
    patch.privateNotificationBody = localizedDefaults.privateNotificationBody
  }

  if (Object.keys(patch).length > 0) {
    await updateSettings(patch)
    return { ...current, ...patch }
  }

  return current
}

export async function getSettings() {
  if (settingsLoadPromise) {
    return settingsLoadPromise
  }

  settingsLoadPromise = loadSettings()

  try {
    return await settingsLoadPromise
  } finally {
    settingsLoadPromise = null
  }
}

export async function updateSettings(data: Partial<typeof settings.$inferInsert>) {
  await db.update(settings).set(data).where(eq(settings.id, SETTINGS_ID))
}

export async function decrementFreeze() {
  const s = await getSettings()
  if (s.freezesRemaining <= 0) return
  await db.update(settings)
    .set({ freezesRemaining: s.freezesRemaining - 1 })
    .where(eq(settings.id, SETTINGS_ID))
}

// 여러 dose_record를 frozen으로 바꾸고 freeze를 일괄 차감하는 작업을 단일 트랜잭션으로 실행.
// 앱 종료 등으로 일부만 적용되는 데이터 불일치 방지.
export async function applyFreezeToRecords(recordIds: string[]): Promise<void> {
  if (recordIds.length === 0) return
  await db.transaction(async (tx) => {
    const s = await tx.select({ freezesRemaining: settings.freezesRemaining })
      .from(settings).where(eq(settings.id, SETTINGS_ID)).get()
    if (!s) return
    const toFreeze = Math.min(recordIds.length, s.freezesRemaining)
    if (toFreeze === 0) return
    await tx.update(settings)
      .set({ freezesRemaining: s.freezesRemaining - toFreeze })
      .where(eq(settings.id, SETTINGS_ID))
    for (const recordId of recordIds.slice(0, toFreeze)) {
      await tx.update(doseRecords)
        .set({ status: 'frozen' })
        .where(eq(doseRecords.id, recordId))
    }
  })
}

export async function incrementFreeze() {
  const s = await getSettings()
  if (s.freezesRemaining >= 3) return
  await db.update(settings)
    .set({ freezesRemaining: s.freezesRemaining + 1 })
    .where(eq(settings.id, SETTINGS_ID))
}
