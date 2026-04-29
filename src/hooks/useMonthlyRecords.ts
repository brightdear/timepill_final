import { useState, useCallback } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { getDoseRecordsByMonth } from '@/domain/doseRecord/repository'
import { getMedications } from '@/domain/medication/repository'
import { getAllTimeslots } from '@/domain/timeslot/repository'
import { db } from '@/db/client'
import {
  timeSlotStreaks,
  doseRecords as doseRecordsTable,
  medications as medsTable,
  timeSlots as timeSlotsTable,
} from '@/db/schema'

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
    setLoading(false)
  }, [year, month])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  return { records, medications, timeslots, streaks, loading, reload: load }
}
