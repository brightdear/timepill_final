import { useCallback, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { getTodayMedicationGroups, type MedicationGroup } from '@/domain/medicationSchedule/repository'

let cachedTodayMedicationGroups: MedicationGroup[] | null = null

export function useTodayMedicationGroups(enabled = true) {
  const [data, setData] = useState<MedicationGroup[]>(cachedTodayMedicationGroups ?? [])
  const [loading, setLoading] = useState(enabled && !cachedTodayMedicationGroups)

  const refresh = useCallback(async () => {
    if (!cachedTodayMedicationGroups) {
      setLoading(true)
    }

    try {
      const groups = await getTodayMedicationGroups()
      cachedTodayMedicationGroups = groups
      setData(groups)
    } finally {
      setLoading(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      if (!enabled) {
        setLoading(false)
        return
      }
      void refresh()
    }, [enabled, refresh]),
  )

  return { data, loading, refresh }
}
