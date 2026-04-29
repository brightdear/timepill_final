import { useState, useCallback } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { getSettings, updateSettings } from '@/domain/settings/repository'
import type { settings } from '@/db/schema'
import { publishLanguageChange } from '@/utils/languageEvents'

type Settings = typeof settings.$inferSelect

export function useSettings() {
  const [data, setData] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const s = await getSettings()
    setData(s)
    setLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  const update = useCallback(async (patch: Partial<typeof settings.$inferInsert>) => {
    await updateSettings(patch)
    if (patch.language === 'ko' || patch.language === 'en' || patch.language === 'ja') {
      publishLanguageChange(patch.language)
    }
    setData(prev => prev ? { ...prev, ...patch } : prev)
  }, [])

  return { data, loading, update, reload: load }
}
