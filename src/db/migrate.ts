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

function latestAppliedMigration(database: SQLiteDatabase) {
  const rows = database.getAllSync<{ created_at: number | string | null }>(
    'SELECT created_at FROM __drizzle_migrations ORDER BY created_at DESC LIMIT 1',
  )
  const latest = rows[0]?.created_at

  return latest == null ? undefined : Number(latest)
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
        database.execSync(statement)
      }

      database.execSync(
        `INSERT INTO __drizzle_migrations (hash, created_at) VALUES (${sqlLiteral('')}, ${entry.when})`,
      )
    }
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
