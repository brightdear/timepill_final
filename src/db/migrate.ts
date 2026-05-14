import { useEffect, useState } from 'react'
import type { SQLiteDatabase } from 'expo-sqlite'
import { sqlite } from './client'
import migrations from './migrations/migrations'

type MigrationEntry = {
  idx: number
  when: number
  tag: string
}

type MigrationConfig = {
  journal: {
    entries: MigrationEntry[]
  }
  migrations: Record<string, string>
}

type MigrationState = {
  success: boolean
  error?: Error
}

type MigrationHistoryRow = {
  hash: string | null
  created_at: number | string | null
}

const migrationConfig = migrations as MigrationConfig

function sqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

function migrationKey(idx: number) {
  return `m${idx.toString().padStart(4, '0')}`
}

function migrationHistoryHash(entry: MigrationEntry) {
  return `${migrationKey(entry.idx)}:${entry.tag}`
}

function migrationStatements(entry: MigrationEntry) {
  const sql = migrationConfig.migrations[migrationKey(entry.idx)]

  if (!sql) {
    throw new Error(`Missing migration: ${entry.tag}`)
  }

  return sql
    .split('--> statement-breakpoint')
    .map(statement => statement.trim())
    .filter(Boolean)
}

function makeIdempotentStatement(statement: string) {
  return statement
    .replace(/^CREATE TABLE\s+(?!IF NOT EXISTS\s+)/i, 'CREATE TABLE IF NOT EXISTS ')
    .replace(/^CREATE UNIQUE INDEX\s+(?!IF NOT EXISTS\s+)/i, 'CREATE UNIQUE INDEX IF NOT EXISTS ')
    .replace(/^CREATE INDEX\s+(?!IF NOT EXISTS\s+)/i, 'CREATE INDEX IF NOT EXISTS ')
}

function isIgnorableMigrationError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return (
    message.includes('already exists') ||
    message.includes('duplicate column name')
  )
}

function appliedMigrationIndexes(database: SQLiteDatabase) {
  const rows = database.getAllSync<MigrationHistoryRow>(
    'SELECT hash, created_at FROM __drizzle_migrations',
  )
  const entriesByWhen = new Map<number, number[]>()
  const applied = new Set<number>()

  for (const entry of migrationConfig.journal.entries) {
    const entries = entriesByWhen.get(entry.when) ?? []
    entries.push(entry.idx)
    entriesByWhen.set(entry.when, entries)
  }

  for (const row of rows) {
    const hash = row.hash ?? ''

    for (const entry of migrationConfig.journal.entries) {
      if (
        hash === migrationHistoryHash(entry) ||
        hash === migrationKey(entry.idx) ||
        hash === entry.tag
      ) {
        applied.add(entry.idx)
      }
    }

    const createdAt = row.created_at == null ? undefined : Number(row.created_at)
    if (createdAt == null || !Number.isFinite(createdAt)) continue

    for (const idx of entriesByWhen.get(createdAt) ?? []) {
      applied.add(idx)
    }
  }

  return applied
}

function columnExists(database: SQLiteDatabase, tableName: string, columnName: string) {
  const escapedTableName = tableName.replaceAll("'", "''")
  const rows = database.getAllSync<{ name: string }>(`PRAGMA table_info('${escapedTableName}')`)
  return rows.some(row => row.name === columnName)
}

function ensureColumn(database: SQLiteDatabase, tableName: string, columnName: string, columnSql: string) {
  if (columnExists(database, tableName, columnName)) return
  database.execSync(`ALTER TABLE \`${tableName}\` ADD ${columnSql}`)
}

function repairKnownLegacySchema(database: SQLiteDatabase) {
  database.execSync(`
    CREATE TABLE IF NOT EXISTS time_slot_streaks (
      time_slot_id TEXT PRIMARY KEY NOT NULL,
      current_streak INTEGER DEFAULT 0 NOT NULL,
      longest_streak INTEGER DEFAULT 0 NOT NULL,
      last_completed_date TEXT DEFAULT '' NOT NULL
    )
  `)

  database.execSync(`
    CREATE TABLE IF NOT EXISTS daycare (
      id INTEGER PRIMARY KEY DEFAULT 1,
      stage TEXT NOT NULL DEFAULT 'egg',
      jelly_balance INTEGER NOT NULL DEFAULT 0
    )
  `)

  database.execSync(`
    CREATE TABLE IF NOT EXISTS crane_machine_state (
      id INTEGER PRIMARY KEY DEFAULT 1,
      visible_prize_ids TEXT NOT NULL DEFAULT '[]',
      pool_seed TEXT NOT NULL DEFAULT '',
      last_won_prize_id TEXT,
      updated_at TEXT NOT NULL DEFAULT '',
      FOREIGN KEY (last_won_prize_id) REFERENCES crane_prizes(id) ON DELETE SET NULL
    )
  `)

  ensureColumn(database, 'settings', 'freezes_remaining', "`freezes_remaining` integer DEFAULT 0 NOT NULL")
  ensureColumn(database, 'settings', 'language', "`language` text DEFAULT 'ko' NOT NULL")
  ensureColumn(database, 'settings', 'dev_mode', "`dev_mode` integer DEFAULT 0 NOT NULL")
  ensureColumn(database, 'settings', 'default_privacy_level', "`default_privacy_level` text DEFAULT 'hideMedicationName' NOT NULL")
  ensureColumn(database, 'settings', 'default_reminder_intensity', "`default_reminder_intensity` text DEFAULT 'normal' NOT NULL")
  ensureColumn(database, 'settings', 'default_widget_visibility', "`default_widget_visibility` text DEFAULT 'aliasOnly' NOT NULL")
  ensureColumn(database, 'settings', 'default_lock_screen_visibility', "`default_lock_screen_visibility` text DEFAULT 'neutral' NOT NULL")
  ensureColumn(database, 'settings', 'badge_enabled', "`badge_enabled` integer DEFAULT 1 NOT NULL")
  ensureColumn(database, 'settings', 'allow_widget_direct_complete', "`allow_widget_direct_complete` integer DEFAULT 0 NOT NULL")
  ensureColumn(database, 'settings', 'complete_notification_enabled', "`complete_notification_enabled` integer DEFAULT 0 NOT NULL")
  ensureColumn(database, 'settings', 'app_lock_enabled', "`app_lock_enabled` integer DEFAULT 0 NOT NULL")
  ensureColumn(database, 'settings', 'screen_privacy_enabled', "`screen_privacy_enabled` integer DEFAULT 0 NOT NULL")
  ensureColumn(database, 'settings', 'external_app_label', "`external_app_label` text DEFAULT 'Daily Check' NOT NULL")
  ensureColumn(database, 'settings', 'private_notification_title', "`private_notification_title` text DEFAULT 'Daily Check' NOT NULL")
  ensureColumn(database, 'settings', 'private_notification_body', "`private_notification_body` text DEFAULT '체크할 시간이야' NOT NULL")

  ensureColumn(database, 'medications', 'alias_name', "`alias_name` text NOT NULL DEFAULT ''")
  ensureColumn(database, 'medications', 'actual_name', '`actual_name` text')
  ensureColumn(database, 'medications', 'total_quantity', '`total_quantity` integer DEFAULT 0 NOT NULL')
  ensureColumn(database, 'medications', 'current_quantity', '`current_quantity` integer DEFAULT 0 NOT NULL')
  ensureColumn(database, 'medications', 'remaining_quantity', '`remaining_quantity` integer DEFAULT 0 NOT NULL')
  ensureColumn(database, 'medications', 'quantity_tracking_enabled', '`quantity_tracking_enabled` integer DEFAULT 0 NOT NULL')
  ensureColumn(database, 'medications', 'dose_per_intake', '`dose_per_intake` integer NOT NULL DEFAULT 1')
  ensureColumn(database, 'medications', 'privacy_level', "`privacy_level` text DEFAULT 'hideMedicationName' NOT NULL")
  ensureColumn(database, 'medications', 'widget_display_mode', "`widget_display_mode` text DEFAULT 'aliasOnly' NOT NULL")
  ensureColumn(database, 'medications', 'reminder_intensity', "`reminder_intensity` text DEFAULT 'normal' NOT NULL")
  ensureColumn(database, 'medications', 'is_archived', '`is_archived` integer NOT NULL DEFAULT 0')
  ensureColumn(database, 'medications', 'updated_at', "`updated_at` text NOT NULL DEFAULT ''")

  ensureColumn(database, 'reminder_times', 'reminder_mode', "`reminder_mode` text DEFAULT 'notify' NOT NULL")

  ensureColumn(database, 'dose_records', 'reminder_time_id', '`reminder_time_id` text')
  ensureColumn(database, 'dose_records', 'scheduled_date', "`scheduled_date` text NOT NULL DEFAULT ''")
  ensureColumn(database, 'dose_records', 'scheduled_at', "`scheduled_at` text NOT NULL DEFAULT ''")
  ensureColumn(database, 'dose_records', 'checked_at', '`checked_at` text')
  ensureColumn(database, 'dose_records', 'verification_type', "`verification_type` text NOT NULL DEFAULT 'none'")
  ensureColumn(database, 'dose_records', 'jelly_reward_granted', '`jelly_reward_granted` integer NOT NULL DEFAULT 0')
  ensureColumn(database, 'dose_records', 'last_notification_sent_at', '`last_notification_sent_at` text')
  ensureColumn(database, 'dose_records', 'snoozed_until', '`snoozed_until` text')
  ensureColumn(database, 'dose_records', 'skip_reason', '`skip_reason` text')

  ensureColumn(database, 'state_logs', 'updated_at', "`updated_at` text NOT NULL DEFAULT ''")

  ensureColumn(database, 'crane_prizes', 'price_jelly', '`price_jelly` integer DEFAULT 10 NOT NULL')
  ensureColumn(database, 'crane_prizes', 'source_type', "`source_type` text DEFAULT 'shop' NOT NULL")
  ensureColumn(database, 'crane_prizes', 'asset_collection', "`asset_collection` text DEFAULT 'normal' NOT NULL")
  ensureColumn(database, 'crane_prizes', 'asset_key', "`asset_key` text DEFAULT '' NOT NULL")
  ensureColumn(database, 'crane_prizes', 'is_purchasable', '`is_purchasable` integer DEFAULT 1 NOT NULL')
  ensureColumn(database, 'crane_prizes', 'is_crane_available', '`is_crane_available` integer DEFAULT 1 NOT NULL')

  database.execSync(`
    UPDATE settings
    SET default_reminder_intensity = CASE
      WHEN default_reminder_intensity = 'standard' THEN 'normal'
      WHEN default_reminder_intensity = 'strict' THEN 'strong'
      WHEN default_reminder_intensity IS NULL OR default_reminder_intensity = '' THEN 'normal'
      ELSE default_reminder_intensity
    END
  `)

  database.execSync(`
    UPDATE reminder_times
    SET
      reminder_mode = CASE
        WHEN is_enabled = 0 THEN 'off'
        WHEN reminder_mode IS NULL OR reminder_mode = '' THEN 'notify'
        ELSE reminder_mode
      END,
      reminder_intensity = CASE
        WHEN reminder_intensity = 'standard' THEN 'normal'
        WHEN reminder_intensity = 'strict' THEN 'strong'
        WHEN reminder_intensity IS NULL OR reminder_intensity = '' THEN 'normal'
        ELSE reminder_intensity
      END,
      alarm_enabled = CASE WHEN is_enabled = 0 THEN 0 ELSE alarm_enabled END
  `)

  database.execSync(`
    UPDATE medications
    SET
      alias_name = COALESCE(alias_name, ''),
      total_quantity = COALESCE(total_quantity, 0),
      current_quantity = COALESCE(current_quantity, remaining_quantity, total_quantity, 0),
      remaining_quantity = COALESCE(remaining_quantity, current_quantity, total_quantity, 0),
      dose_per_intake = CASE
        WHEN dose_per_intake IS NULL OR dose_per_intake <= 0 THEN 1
        ELSE dose_per_intake
      END,
      quantity_tracking_enabled = CASE
        WHEN COALESCE(remaining_quantity, current_quantity, total_quantity, 0) > 0 OR COALESCE(total_quantity, 0) > 0 THEN 1
        ELSE COALESCE(quantity_tracking_enabled, 0)
      END,
      privacy_level = COALESCE((
        SELECT privacy_level
        FROM reminder_times
        WHERE medication_id = medications.id
        ORDER BY order_index, hour, minute, created_at
        LIMIT 1
      ), NULLIF(privacy_level, ''), 'hideMedicationName'),
      widget_display_mode = COALESCE((
        SELECT widget_visibility
        FROM reminder_times
        WHERE medication_id = medications.id
        ORDER BY order_index, hour, minute, created_at
        LIMIT 1
      ), NULLIF(widget_display_mode, ''), 'aliasOnly'),
      reminder_intensity = COALESCE((
        SELECT CASE
          WHEN reminder_intensity = 'standard' THEN 'normal'
          WHEN reminder_intensity = 'strict' THEN 'strong'
          WHEN reminder_intensity IS NULL OR reminder_intensity = '' THEN 'normal'
          ELSE reminder_intensity
        END
        FROM reminder_times
        WHERE medication_id = medications.id
        ORDER BY order_index, hour, minute, created_at
        LIMIT 1
      ), CASE
        WHEN reminder_intensity = 'standard' THEN 'normal'
        WHEN reminder_intensity = 'strict' THEN 'strong'
        WHEN reminder_intensity IS NULL OR reminder_intensity = '' THEN 'normal'
        ELSE reminder_intensity
      END),
      updated_at = COALESCE(NULLIF(updated_at, ''), created_at, '')
  `)

  database.execSync(`
    UPDATE crane_prizes
    SET
      price_jelly = CASE WHEN price_jelly IS NULL OR price_jelly <= 0 THEN 10 ELSE price_jelly END,
      source_type = COALESCE(NULLIF(source_type, ''), 'shop'),
      asset_collection = COALESCE(NULLIF(asset_collection, ''), 'normal'),
      asset_key = COALESCE(asset_key, ''),
      is_purchasable = COALESCE(is_purchasable, 1),
      is_crane_available = COALESCE(is_crane_available, 1)
  `)

  for (const statement of [
    'CREATE INDEX IF NOT EXISTS idx_dose_records_medication_date ON dose_records (medication_id, scheduled_time)',
    'CREATE INDEX IF NOT EXISTS idx_dose_records_status ON dose_records (status, scheduled_time)',
    'CREATE INDEX IF NOT EXISTS idx_reference_images_medication ON reference_images (medication_id)',
    'CREATE INDEX IF NOT EXISTS idx_reminder_times_mode ON reminder_times (medication_id, reminder_mode)',
    'CREATE INDEX IF NOT EXISTS idx_dose_records_day_key ON dose_records (day_key)',
    'CREATE INDEX IF NOT EXISTS idx_reward_transactions_day_created ON reward_transactions (day_key, created_at)',
    'CREATE INDEX IF NOT EXISTS idx_state_logs_day_created ON state_logs (day_key, created_at)',
    'CREATE INDEX IF NOT EXISTS idx_crane_plays_created ON crane_plays (created_at)',
  ]) {
    database.execSync(statement)
  }
}

export function runDatabaseMigrations(database: SQLiteDatabase = sqlite) {
  database.execSync(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash text NOT NULL,
      created_at numeric
    )
  `)

  const appliedMigrations = appliedMigrationIndexes(database)

  database.withTransactionSync(() => {
    for (const entry of migrationConfig.journal.entries) {
      if (appliedMigrations.has(entry.idx)) continue

      for (const statement of migrationStatements(entry)) {
        try {
          database.execSync(makeIdempotentStatement(statement))
        } catch (error) {
          if (!isIgnorableMigrationError(error)) throw error
          console.warn(`[db] Skipping already-applied migration statement: ${entry.tag}`)
        }
      }

      database.execSync(
        `INSERT INTO __drizzle_migrations (hash, created_at) VALUES (${sqlLiteral(migrationHistoryHash(entry))}, ${entry.when})`,
      )
      appliedMigrations.add(entry.idx)
    }

    repairKnownLegacySchema(database)
  })
}

export function useDatabaseMigrations(): MigrationState {
  const [state, setState] = useState<MigrationState>({ success: false })

  useEffect(() => {
    try {
      runDatabaseMigrations()
      setState({ success: true })
    } catch (error) {
      setState({
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      })
    }
  }, [])

  return state
}
