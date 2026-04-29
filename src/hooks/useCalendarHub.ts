import { useCallback, useState } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { getDoseRecordsByMonth } from '@/domain/doseRecord/repository'
import { getMedications } from '@/domain/medication/repository'
import { getRewardTransactionsByMonth, getWalletSummary, syncStreakState } from '@/domain/reward/repository'
import { getStateLogsByMonth } from '@/domain/stateLog/repository'
import { getAllTimeslots } from '@/domain/timeslot/repository'
import {
  doseRecords as doseRecordsTable,
  medications as medicationsTable,
  rewardTransactions as rewardTransactionsTable,
  stateLogs as stateLogsTable,
  streakState as streakStateTable,
  timeSlots as timeSlotsTable,
  wallet as walletTable,
} from '@/db/schema'

type DoseRecord = typeof doseRecordsTable.$inferSelect
type Medication = typeof medicationsTable.$inferSelect
type TimeSlot = typeof timeSlotsTable.$inferSelect
type StateLog = typeof stateLogsTable.$inferSelect
type RewardTransaction = typeof rewardTransactionsTable.$inferSelect
type WalletRow = typeof walletTable.$inferSelect
type StreakStateRow = typeof streakStateTable.$inferSelect

export type CalendarHubData = {
  records: DoseRecord[]
  medications: Medication[]
  timeslots: TimeSlot[]
  stateLogs: StateLog[]
  rewardTransactions: RewardTransaction[]
  wallet: WalletRow | null
  streak: StreakStateRow | null
  loading: boolean
  reload: () => Promise<void>
}

export function useCalendarHub(year: number, month: number): CalendarHubData {
  const [records, setRecords] = useState<DoseRecord[]>([])
  const [medications, setMedications] = useState<Medication[]>([])
  const [timeslots, setTimeslots] = useState<TimeSlot[]>([])
  const [stateLogs, setStateLogs] = useState<StateLog[]>([])
  const [rewardTransactions, setRewardTransactions] = useState<RewardTransaction[]>([])
  const [wallet, setWallet] = useState<WalletRow | null>(null)
  const [streak, setStreak] = useState<StreakStateRow | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const monthlyRecords = await getDoseRecordsByMonth(year, month)
      const meds = await getMedications()
      const slots = await getAllTimeslots()
      const monthlyStateLogs = await getStateLogsByMonth(year, month)
      const monthlyTransactions = await getRewardTransactionsByMonth(year, month)
      const walletSummary = await getWalletSummary()
      const streakSummary = await syncStreakState()

      setRecords(monthlyRecords)
      setMedications(meds)
      setTimeslots(slots)
      setStateLogs(monthlyStateLogs)
      setRewardTransactions(monthlyTransactions)
      setWallet(walletSummary)
      setStreak(streakSummary ?? null)
    } finally {
      setLoading(false)
    }
  }, [month, year])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  return {
    records,
    medications,
    timeslots,
    stateLogs,
    rewardTransactions,
    wallet,
    streak,
    loading,
    reload: load,
  }
}