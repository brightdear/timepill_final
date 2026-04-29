import { useState, useCallback } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { getDoseRecordsByMonth } from '@backend/doseRecord/repository'
import { getMedications } from '@backend/medication/repository'
import { getAllTimeslots } from '@backend/timeslot/repository'
import { db } from '@backend/db/client'
import {
  timeSlotStreaks,
  doseRecords as doseRecordsTable,
  medications as medsTable,
  timeSlots as timeSlotsTable,
} from '@backend/db/schema'

type DoseRecord = typeof doseRecordsTable.$inferSelect
type Medication = typeof medsTable.$inferSelect
type TimeSlot = typeof timeSlotsTable.$inferSelect
type Streak = typeof timeSlotStreaks.$inferSelect

export type { DoseRecord, Medication, TimeSlot, Streak }

export type MonthlyData = {
  records: DoseRecord[]
  medications: Medication[]
  timeslots: TimeSlot[]
  streaks: Streak[]
  loading: boolean
  reload: () => Promise<void>
}

export function useMonthlyRecords(year: number, month: number): MonthlyData {
  const [records, setRecords] = useState<DoseRecord[]>([])
  const [medications, setMedications] = useState<Medication[]>([])
  const [timeslots, setTimeslots] = useState<TimeSlot[]>([])
  const [streaks, setStreaks] = useState<Streak[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [recs, meds, slots, sks] = await Promise.all([
        getDoseRecordsByMonth(year, month),
        getMedications(),
        getAllTimeslots(),
        db.select().from(timeSlotStreaks),
      ])
      setRecords(recs)
      setMedications(meds)
      setTimeslots(slots)
      setStreaks(sks)
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  return { records, medications, timeslots, streaks, loading, reload: load }
}
