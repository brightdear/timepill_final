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

const migrationConfig = migrations as MigrationConfig

function sqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

function migrationKey(idx: number) {
  return `m${idx.toString().padStart(4, '0')}`
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

function latestAppliedMigration(database: SQLiteDatabase) {
  const rows = database.getAllSync<{ created_at: number | string | null }>(
    'SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1',
  )
  const latest = rows[0]?.created_at

  return latest == null ? undefined : Number(latest)
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

  ensureColumn(database, 'settings', 'freezes_remaining', "`freezes_remaining` integer DEFAULT 0 NOT NULL")
  ensureColumn(database, 'settings', 'language', "`language` text DEFAULT 'ko' NOT NULL")
  ensureColumn(database, 'settings', 'dev_mode', "`dev_mode` integer DEFAULT 0 NOT NULL")
  ensureColumn(database, 'settings', 'default_privacy_level', "`default_privacy_level` text DEFAULT 'hideMedicationName' NOT NULL")
  ensureColumn(database, 'settings', 'default_reminder_intensity', "`default_reminder_intensity` text DEFAULT 'standard' NOT NULL")
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
  ensureColumn(database, 'medications', 'remaining_quantity', '`remaining_quantity` integer')
  ensureColumn(database, 'medications', 'dose_per_intake', '`dose_per_intake` integer NOT NULL DEFAULT 1')
  ensureColumn(database, 'medications', 'is_archived', '`is_archived` integer NOT NULL DEFAULT 0')
  ensureColumn(database, 'medications', 'updated_at', "`updated_at` text NOT NULL DEFAULT ''")

  ensureColumn(database, 'dose_records', 'reminder_time_id', '`reminder_time_id` text')
  ensureColumn(database, 'dose_records', 'scheduled_date', "`scheduled_date` text NOT NULL DEFAULT ''")
  ensureColumn(database, 'dose_records', 'scheduled_at', "`scheduled_at` text NOT NULL DEFAULT ''")
  ensureColumn(database, 'dose_records', 'checked_at', '`checked_at` text')
  ensureColumn(database, 'dose_records', 'verification_type', "`verification_type` text NOT NULL DEFAULT 'none'")
  ensureColumn(database, 'dose_records', 'jelly_reward_granted', '`jelly_reward_granted` integer NOT NULL DEFAULT 0')
  ensureColumn(database, 'dose_records', 'last_notification_sent_at', '`last_notification_sent_at` text')
  ensureColumn(database, 'dose_records', 'snoozed_until', '`snoozed_until` text')
  ensureColumn(database, 'dose_records', 'skip_reason', '`skip_reason` text')
}

export function runDatabaseMigrations(database: SQLiteDatabase = sqlite) {
  database.execSync(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash text NOT NULL,
      created_at numeric
    )
  `)

  const latest = latestAppliedMigration(database)

  database.withTransactionSync(() => {
    for (const entry of migrationConfig.journal.entries) {
      if (latest != null && latest >= entry.when) continue

      for (const statement of migrationStatements(entry)) {
        try {
          database.execSync(makeIdempotentStatement(statement))
        } catch (error) {
          if (!isIgnorableMigrationError(error)) throw error
          console.warn(`[db] Skipping already-applied migration statement: ${entry.tag}`)
        }
      }

      database.execSync(
        `INSERT INTO __drizzle_migrations (hash, created_at) VALUES (${sqlLiteral('')}, ${entry.when})`,
      )
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
