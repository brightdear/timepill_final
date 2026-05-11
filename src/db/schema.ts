import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core'

// ── CycleConfig 타입 ──────────────────────────────────────────────────────────
type CycleDateWindow = {
  startDate?: string
  endDate?: string | null
}

export type CycleConfig =
  | ({ type: 'daily' } & CycleDateWindow)
  | ({ type: 'weekly' } & CycleDateWindow)
  | ({ type: 'weekends' } & CycleDateWindow)
  | ({ type: 'specific_days'; days: number[] } & CycleDateWindow)   // 0=일,1=월,...,6=토
  | { type: 'date_range'; startDate: string; endDate?: string | null }
  | { type: 'rest'; active_value: number; rest_value: number; unit: 'day' | 'week' }

export type DoseStatus = 'pending' | 'completed' | 'missed' | 'frozen' | 'skipped'
export type CheckLogStatus = DoseStatus | 'delayed'
export type VerificationType = 'manual' | 'scan' | 'devManual' | 'none'
export type ReminderMode = 'off' | 'notify' | 'scan'
export type ReminderPrivacyLevel = 'public' | 'hideMedicationName' | 'private' | 'custom'
export type ReminderIntensity = 'light' | 'normal' | 'strong'
export type WidgetDisplayMode = 'full' | 'aliasOnly' | 'timeOnly' | 'hidden'
export type WidgetVisibility = WidgetDisplayMode
export type LockScreenVisibility = 'full' | 'neutral' | 'hidden'
export type RewardTransactionKind = 'check_complete' | 'state_log' | 'streak_bonus' | 'on_time_bonus' | 'daily_complete' | 'crane_play'

// ── medications ───────────────────────────────────────────────────────────────
export const medications = sqliteTable('medications', {
  id:        text('id').primaryKey(),
  name:      text('name').notNull(),
  aliasName: text('alias_name').notNull().default(''),
  actualName: text('actual_name'),
  color:     text('color').notNull(),
  totalQuantity: integer('total_quantity').notNull().default(0),
  currentQuantity: integer('current_quantity').notNull().default(0),
  remainingQuantity: integer('remaining_quantity').notNull().default(0),
  quantityTrackingEnabled: integer('quantity_tracking_enabled').notNull().default(0),
  dosePerIntake: integer('dose_per_intake').notNull().default(1),
  privacyLevel: text('privacy_level').notNull().default('hideMedicationName'),
  widgetDisplayMode: text('widget_display_mode').notNull().default('aliasOnly'),
  reminderIntensity: text('reminder_intensity').notNull().default('normal'),
  isActive:  integer('is_active').notNull().default(1),
  isArchived: integer('is_archived').notNull().default(0),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull().default(''),
})

// ── reminder_times ────────────────────────────────────────────────────────────
// Kept exported as timeSlots so existing notification/deep-link code continues to work.
export const reminderTimes = sqliteTable('reminder_times', {
  id:                    text('id').primaryKey(),
  medicationId:          text('medication_id').notNull()
                           .references(() => medications.id, { onDelete: 'cascade' }),
  displayAlias:          text('display_alias'),
  hour:                  integer('hour').notNull(),
  minute:                integer('minute').notNull(),
  isEnabled:             integer('is_enabled').notNull().default(1),
  reminderMode:          text('reminder_mode').notNull().default('notify'),
  orderIndex:            integer('order_index').notNull().default(0),
  doseCountPerIntake:    integer('dose_count_per_intake').notNull().default(1),
  // CHECK(dose_count_per_intake BETWEEN 1 AND 10) — 마이그레이션 파일에 수동 추가
  cycleConfig:           text('cycle_config').notNull(),
  // JSON.stringify(CycleConfig) — single source of truth. cycle_type 컬럼 없음
  cycleStartDate:        text('cycle_start_date'),      // rest 타입만 사용
  verificationWindowMin: integer('verification_window_min').notNull().default(60),
  alarmEnabled:          integer('alarm_enabled').notNull().default(1),
  privacyLevel:          text('privacy_level').notNull().default('hideMedicationName'),
  notificationTitle:     text('notification_title'),
  notificationBody:      text('notification_body'),
  preReminderEnabled:    integer('pre_reminder_enabled').notNull().default(1),
  preReminderMinutes:    integer('pre_reminder_minutes').notNull().default(15),
  preReminderBody:       text('pre_reminder_body'),
  overdueReminderBody:   text('overdue_reminder_body'),
  reminderIntensity:     text('reminder_intensity').notNull().default('normal'),
  repeatRemindersEnabled: integer('repeat_reminders_enabled').notNull().default(1),
  repeatSchedule:        text('repeat_schedule'),
  maxRepeatDurationMinutes: integer('max_repeat_duration_minutes').notNull().default(180),
  snoozeMinutes:         integer('snooze_minutes').notNull().default(10),
  forceAlarm:            integer('force_alarm').notNull().default(0),
  popupEnabled:          integer('popup_enabled').notNull().default(1),
  snoozeCount:           integer('snooze_count').notNull().default(0),
  // CHECK(snooze_count BETWEEN 0 AND 3) — 마이그레이션 파일에 수동 추가
  snoozeIntervalMin:     integer('snooze_interval_min').notNull().default(5),
  alarmSound:            text('alarm_sound').notNull().default('default'),
  vibrationEnabled:      integer('vibration_enabled').notNull().default(1),
  widgetVisibility:      text('widget_visibility').notNull().default('aliasOnly'),
  lockScreenVisibility:  text('lock_screen_visibility').notNull().default('neutral'),
  badgeEnabled:          integer('badge_enabled').notNull().default(1),
  skipUntil:             text('skip_until'),
  notificationIds:       text('notification_ids'),       // JSON string[] — 일반 알람 ID
  forceNotificationIds:  text('force_notification_ids'), // JSON string[] — 강제 알람 ID (별도 관리)
  isActive:              integer('is_active').notNull().default(1),
  createdAt:             text('created_at').notNull(),
  updatedAt:             text('updated_at').notNull().default(''),
})

export const timeSlots = reminderTimes

// ── dose_records ──────────────────────────────────────────────────────────────
export const doseRecords = sqliteTable('dose_records', {
  id:              text('id').primaryKey(),
  medicationId:    text('medication_id')
                     .references(() => medications.id, { onDelete: 'set null' }),
  medicationName:  text('medication_name').notNull(),
  timeSlotId:      text('time_slot_id')
                     .references(() => timeSlots.id, { onDelete: 'set null' }),
  reminderTimeId:  text('reminder_time_id')
                     .references(() => reminderTimes.id, { onDelete: 'set null' }),
  dayKey:          text('day_key').notNull(),           // 'YYYY-MM-DD'
  scheduledDate:   text('scheduled_date').notNull().default(''),
  scheduledTime:   text('scheduled_time').notNull(),    // 로컬 ISO datetime (Z 없음)
  scheduledAt:     text('scheduled_at').notNull().default(''),
  status:          text('status').notNull(),             // DoseStatus
  verificationType: text('verification_type').notNull().default('none'),
  jellyRewardGranted: integer('jelly_reward_granted').notNull().default(0),
  targetDoseCount: integer('target_dose_count').notNull().default(1),
  completedAt:     text('completed_at'),
  checkedAt:       text('checked_at'),
  lastNotificationSentAt: text('last_notification_sent_at'),
  snoozedUntil:    text('snoozed_until'),
  skipReason:      text('skip_reason'),
  createdAt:       text('created_at').notNull(),
}, (table) => ({
  uniqSlotDay: uniqueIndex('uniq_dose_slot_day').on(table.timeSlotId, table.dayKey),
}))

// ── escape_records ────────────────────────────────────────────────────────────
export const escapeRecords = sqliteTable('escape_records', {
  id:           text('id').primaryKey(),
  medicationId: text('medication_id')
                  .references(() => medications.id, { onDelete: 'set null' }),
  timeSlotId:   text('time_slot_id')
                  .references(() => timeSlots.id, { onDelete: 'set null' }),
  doseRecordId: text('dose_record_id')
                  .references(() => doseRecords.id, { onDelete: 'set null' }),
  dayKey:       text('day_key').notNull(),
  reason:       text('reason'),
  isUserFault:  integer('is_user_fault').notNull().default(1),
  note:         text('note'),
  createdAt:    text('created_at').notNull(),
})

// ── time_slot_streaks ─────────────────────────────────────────────────────────
export const timeSlotStreaks = sqliteTable('time_slot_streaks', {
  timeSlotId:        text('time_slot_id').primaryKey()
                       .references(() => timeSlots.id, { onDelete: 'cascade' }),
  currentStreak:     integer('current_streak').notNull().default(0),
  longestStreak:     integer('longest_streak').notNull().default(0),
  lastCompletedDate: text('last_completed_date').notNull().default(''),
})

// ── reference_images ──────────────────────────────────────────────────────────
export const referenceImages = sqliteTable('reference_images', {
  id:           text('id').primaryKey(),
  medicationId: text('medication_id').notNull()
                  .references(() => medications.id, { onDelete: 'cascade' }),
  originalUri:  text('original_uri').notNull(),
  croppedUri:   text('cropped_uri').notNull(),
  embedding:    text('embedding').notNull(),   // JSON number[]
  createdAt:    text('created_at').notNull(),
})

// ── state_logs ───────────────────────────────────────────────────────────────
export const stateLogs = sqliteTable('state_logs', {
  id:           text('id').primaryKey(),
  dayKey:       text('day_key').notNull(),
  mood:         text('mood').notNull(),
  condition:    text('condition').notNull(),
  focus:        text('focus').notNull(),
  tags:         text('tags').notNull().default('[]'),
  memo:         text('memo'),
  rewardGranted: integer('reward_granted').notNull().default(0),
  createdAt:    text('created_at').notNull(),
  updatedAt:    text('updated_at').notNull().default(''),
})

// ── wallet (단일 row, id=1) ──────────────────────────────────────────────────
export const wallet = sqliteTable('wallet', {
  id:                  integer('id').primaryKey().default(1),
  balance:             integer('balance').notNull().default(0),
  todayEarned:         integer('today_earned').notNull().default(0),
  totalEarned:         integer('total_earned').notNull().default(0),
  lastEarnedDate:      text('last_earned_date').notNull().default(''),
  dailyStateRewardCount: integer('daily_state_reward_count').notNull().default(0),
  updatedAt:           text('updated_at').notNull().default(''),
})

// ── reward_transactions ──────────────────────────────────────────────────────
export const rewardTransactions = sqliteTable('reward_transactions', {
  id:           text('id').primaryKey(),
  dayKey:       text('day_key').notNull(),
  amount:       integer('amount').notNull(),
  kind:         text('kind').notNull(),
  label:        text('label').notNull(),
  referenceId:  text('reference_id'),
  isDevMode:    integer('is_dev_mode').notNull().default(0),
  createdAt:    text('created_at').notNull(),
})

// ── streak_state (단일 row, id=1) ────────────────────────────────────────────
export const streakState = sqliteTable('streak_state', {
  id:           integer('id').primaryKey().default(1),
  currentStreak: integer('current_streak').notNull().default(0),
  longestStreak: integer('longest_streak').notNull().default(0),
  lastCheckDate: text('last_check_date').notNull().default(''),
  freezeCount:  integer('freeze_count').notNull().default(0),
  updatedAt:    text('updated_at').notNull().default(''),
})

// ── daycare (단일 row, id=1) ────────────────────────────────────────────────
export const daycare = sqliteTable('daycare', {
  id:           integer('id').primaryKey().default(1),
  stage:        text('stage').notNull().default('egg'),
  jellyBalance: integer('jelly_balance').notNull().default(0),
})

// ── crane_prizes ─────────────────────────────────────────────────────────────
export const cranePrizes = sqliteTable('crane_prizes', {
  id:           text('id').primaryKey(),
  name:         text('name').notNull(),
  category:     text('category').notNull(),
  rarity:       text('rarity').notNull(),
  emoji:        text('emoji').notNull(),
  weight:       integer('weight').notNull(),
  sortOrder:    integer('sort_order').notNull().default(0),
  isActive:     integer('is_active').notNull().default(1),
  createdAt:    text('created_at').notNull(),
})

// ── inventory_items ──────────────────────────────────────────────────────────
export const inventoryItems = sqliteTable('inventory_items', {
  id:           text('id').primaryKey(),
  prizeId:      text('prize_id').notNull()
                  .references(() => cranePrizes.id, { onDelete: 'cascade' }),
  quantity:     integer('quantity').notNull().default(0),
  lastAcquiredAt: text('last_acquired_at').notNull(),
  createdAt:    text('created_at').notNull(),
}, (table) => ({
  uniqPrize: uniqueIndex('uniq_inventory_prize').on(table.prizeId),
}))

// ── crane_plays ──────────────────────────────────────────────────────────────
export const cranePlays = sqliteTable('crane_plays', {
  id:           text('id').primaryKey(),
  prizeId:      text('prize_id')
                  .references(() => cranePrizes.id, { onDelete: 'set null' }),
  cost:         integer('cost').notNull(),
  rewardTransactionId: text('reward_transaction_id')
                        .references(() => rewardTransactions.id, { onDelete: 'set null' }),
  isDevMode:    integer('is_dev_mode').notNull().default(0),
  createdAt:    text('created_at').notNull(),
})

// ── crane_machine_state (단일 row, id=1) ─────────────────────────────────────
export const craneMachineState = sqliteTable('crane_machine_state', {
  id:           integer('id').primaryKey().default(1),
  visiblePrizeIds: text('visible_prize_ids').notNull().default('[]'),
  poolSeed:     text('pool_seed').notNull().default(''),
  lastWonPrizeId: text('last_won_prize_id')
                  .references(() => cranePrizes.id, { onDelete: 'set null' }),
  updatedAt:    text('updated_at').notNull().default(''),
})

// ── settings (단일 row, id=1) ─────────────────────────────────────────────────
export const settings = sqliteTable('settings', {
  id:                        integer('id').primaryKey().default(1),
  privateMode:               integer('private_mode').notNull().default(0),
  freezesRemaining:          integer('freezes_remaining').notNull().default(0),
  language:                  text('language').notNull().default('ko'),
  devMode:                   integer('dev_mode').notNull().default(0),
  defaultPrivacyLevel:       text('default_privacy_level').notNull().default('hideMedicationName'),
  defaultReminderIntensity:  text('default_reminder_intensity').notNull().default('normal'),
  defaultWidgetVisibility:   text('default_widget_visibility').notNull().default('aliasOnly'),
  defaultLockScreenVisibility: text('default_lock_screen_visibility').notNull().default('neutral'),
  badgeEnabled:              integer('badge_enabled').notNull().default(1),
  allowWidgetDirectComplete: integer('allow_widget_direct_complete').notNull().default(0),
  completeNotificationEnabled: integer('complete_notification_enabled').notNull().default(0),
  appLockEnabled:            integer('app_lock_enabled').notNull().default(0),
  screenPrivacyEnabled:      integer('screen_privacy_enabled').notNull().default(0),
  externalAppLabel:          text('external_app_label').notNull().default('Daily Check'),
  privateNotificationTitle:  text('private_notification_title').notNull().default('Daily Check'),
  privateNotificationBody:   text('private_notification_body').notNull().default('체크할 시간이야'),
})
