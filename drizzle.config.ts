import type { Config } from 'drizzle-kit'

export default {
  schema: './src/backend/db/schema.ts',
  out: './src/backend/db/migrations',
  dialect: 'sqlite',
  driver: 'expo',
} satisfies Config
