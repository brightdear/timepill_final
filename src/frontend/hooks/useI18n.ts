import { useState, useEffect } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { useCallback } from 'react'
import { getSettings } from '@backend/settings/repository'
import { translations, type Lang } from '@shared/constants/translations'

export function useI18n() {
  const [lang, setLang] = useState<Lang>('ko')

  const load = useCallback(async () => {
    const s = await getSettings()
    const l = s.language as Lang
    if (l in translations) setLang(l)
  }, [])

  useEffect(() => { void load() }, [load])
  useFocusEffect(useCallback(() => { void load() }, [load]))

  return translations[lang]
}
