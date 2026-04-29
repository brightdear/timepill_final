import { useState, useEffect } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { useCallback } from 'react'
import { getSettings } from '@/domain/settings/repository'
import { translate, translations, type Lang, type TranslationCopy, type TranslationKey } from '@/constants/translations'
import { subscribeLanguageChange } from '@/utils/languageEvents'

type TranslationParams = Record<string, string | number | null | undefined>

export function useI18n(preferredLang?: Lang, enabled = true) {
  const [lang, setLang] = useState<Lang>(preferredLang ?? 'ko')
  const shouldLoad = enabled && preferredLang === undefined

  const load = useCallback(async () => {
    if (!shouldLoad) return
    const s = await getSettings()
    const l = s.language as Lang
    if (l in translations) setLang(l)
  }, [shouldLoad])

  useEffect(() => {
    if (!shouldLoad) return
    void load()
  }, [load, shouldLoad])

  useFocusEffect(useCallback(() => {
    if (!shouldLoad) return
    void load()
  }, [load, shouldLoad]))

  useEffect(() => {
    if (!preferredLang) return
    setLang(preferredLang)
  }, [preferredLang])

  useEffect(() => subscribeLanguageChange(nextLang => setLang(nextLang)), [])

  const activeLang = preferredLang ?? lang

  const copy: TranslationCopy = translations[activeLang]
  const t = useCallback(
    (key: TranslationKey, params?: TranslationParams) => translate(activeLang, key, params),
    [activeLang],
  )

  return { lang: activeLang, copy, t }
}
