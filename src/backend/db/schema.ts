import { sqliteTable, text, integer, uniqueIndex } from 'drizzle-orm/sqlite-core'

// ── CycleConfig 타입 ──────────────────────────────────────────────────────────
export type CycleConfig =
  | { type: 'daily' }
  | { type: 'weekly' }
  | { type: 'weekends' }
  | { type: 'specific_days'; days: number[] }   // 0=일,1=월,...,6=토
  | { type: 'rest'; active_value: number; rest_value: number; unit: 'day' | 'week' }

export type DoseStatus = 'pending' | 'completed' | 'missed' | 'frozen'

// ── medications ───────────────────────────────────────────────────────────────
export const medications = sqliteTable('medications', {
  id:        text('id').primaryKey(),
  name:      text('name').notNull(),
  color:     text('color').notNull(),
  isActive:  integer('is_active').notNull().default(1),
  createdAt: text('created_at').notNull(),
})

// ── time_slots ────────────────────────────────────────────────────────────────
export const timeSlots = sqliteTable('time_slots', {
  id:                    text('id').primaryKey(),
  medicationId:          text('medication_id').notNull()
                           .references(() => medications.id, { onDelete: 'cascade' }),
  hour:                  integer('hour').notNull(),
  minute:                integer('minute').notNull(),
  doseCountPerIntake:    integer('dose_count_per_intake').notNull().default(1),
  // CHECK(dose_count_per_intake BETWEEN 1 AND 10) — 마이그레이션 파일에 수동 추가
  cycleConfig:           text('cycle_config').notNull(),
  // JSON.stringify(CycleConfig) — single source of truth. cycle_type 컬럼 없음
  cycleStartDate:        text('cycle_start_date'),      // rest 타입만 사용
  verificationWindowMin: integer('verification_window_min').notNull().default(60),
  alarmEnabled:          integer('alarm_enabled').notNull().default(1),
  forceAlarm:            integer('force_alarm').notNull().default(0),
  popupEnabled:          integer('popup_enabled').notNull().default(1),
  snoozeCount:           integer('snooze_count').notNull().default(0),
  // CHECK(snooze_count BETWEEN 0 AND 3) — 마이그레이션 파일에 수동 추가
  snoozeIntervalMin:     integer('snooze_interval_min').notNull().default(5),
  alarmSound:            text('alarm_sound').notNull().default('default'),
  vibrationEnabled:      integer('vibration_enabled').notNull().default(1),
  skipUntil:             text('skip_until'),
  notificationIds:       text('notification_ids'),       // JSON string[] — 일반 알람 ID
  forceNotificationIds:  text('force_notification_ids'), // JSON string[] — 강제 알람 ID (별도 관리)
  isActive:              integer('is_active').notNull().default(1),
  createdAt:             text('created_at').notNull(),
})

// ── dose_records ──────────────────────────────────────────────────────────────
export const doseRecords = sqliteTable('dose_records', {
  id:              text('id').primaryKey(),
  medicationId:    text('medication_id')
                     .references(() => medications.id, { onDelete: 'set null' }),
  medicationName:  text('medication_name').notNull(),
  timeSlotId:      text('time_slot_id')
                     .references(() => timeSlots.id, { onDelete: 'set null' }),
  dayKey:          text('day_key').notNull(),           // 'YYYY-MM-DD'
  scheduledTime:   text('scheduled_time').notNull(),    // 로컬 ISO datetime (Z 없음)
  status:          text('status').notNull(),             // DoseStatus
  targetDoseCount: integer('target_dose_count').notNull().default(1),
  completedAt:     text('completed_at'),
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

// ── settings (단일 row, id=1) ─────────────────────────────────────────────────
export const settings = sqliteTable('settings', {
  id:               integer('id').primaryKey().default(1),
  privateMode:      integer('private_mode').notNull().default(0),
  freezesRemaining: integer('freezes_remaining').notNull().default(0),
  language:         text('language').notNull().default('ko'),
  devMode:          integer('dev_mode').notNull().default(0),
})
