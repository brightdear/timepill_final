import { useState, useCallback } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { getDoseRecordsByMonth } from '@backend/doseRecord/repository'
import { getMedications } from '@backend/medication/repository'
import {
  doseRecords as doseRecordsTable,
  medications as medsTable,
} from '@backend/db/schema'

type DoseRecord = typeof doseRecordsTable.$inferSelect
type Medication = typeof medsTable.$inferSelect

export type { DoseRecord, Medication }

export type MonthlyData = {
  records: DoseRecord[]
  medications: Medication[]
  loading: boolean
  reload: () => Promise<void>
}

export function useMonthlyRecords(year: number, month: number): MonthlyData {
  const [records, setRecords] = useState<DoseRecord[]>([])
  const [medications, setMedications] = useState<Medication[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [recs, meds] = await Promise.all([
        getDoseRecordsByMonth(year, month),
        getMedications(),
      ])
      setRecords(recs)
      setMedications(meds)
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  return { records, medications, loading, reload: load }
}
