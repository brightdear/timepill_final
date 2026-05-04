import { useCallback, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { getTodayMedicationGroups, type MedicationGroup } from '@/domain/medicationSchedule/repository'

export function useTodayMedicationGroups(enabled = true) {
  const [data, setData] = useState<MedicationGroup[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setData(await getTodayMedicationGroups())
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
