import { useCallback, useEffect, useState } from 'react'
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

type CalendarHubCacheEntry = {
  records: DoseRecord[]
  medications: Medication[]
  timeslots: TimeSlot[]
  stateLogs: StateLog[]
  rewardTransactions: RewardTransaction[]
  wallet: WalletRow | null
  streak: StreakStateRow | null
}

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

const calendarHubCache = new Map<string, CalendarHubCacheEntry>()

export function useCalendarHub(year: number, month: number): CalendarHubData {
  const cacheKey = `${year}-${month}`
  const cached = calendarHubCache.get(cacheKey)
  const [records, setRecords] = useState<DoseRecord[]>(cached?.records ?? [])
  const [medications, setMedications] = useState<Medication[]>(cached?.medications ?? [])
  const [timeslots, setTimeslots] = useState<TimeSlot[]>(cached?.timeslots ?? [])
  const [stateLogs, setStateLogs] = useState<StateLog[]>(cached?.stateLogs ?? [])
  const [rewardTransactions, setRewardTransactions] = useState<RewardTransaction[]>(cached?.rewardTransactions ?? [])
  const [wallet, setWallet] = useState<WalletRow | null>(cached?.wallet ?? null)
  const [streak, setStreak] = useState<StreakStateRow | null>(cached?.streak ?? null)
  const [loading, setLoading] = useState(!cached)

  const applyCache = useCallback((entry: CalendarHubCacheEntry) => {
    setRecords(entry.records)
    setMedications(entry.medications)
    setTimeslots(entry.timeslots)
    setStateLogs(entry.stateLogs)
    setRewardTransactions(entry.rewardTransactions)
    setWallet(entry.wallet)
    setStreak(entry.streak)
  }, [])

  const load = useCallback(async () => {
    const currentCache = calendarHubCache.get(cacheKey)
    if (currentCache) {
      applyCache(currentCache)
      setLoading(false)
    } else {
      setLoading(true)
    }

    try {
      const [
        monthlyRecords,
        meds,
        slots,
        monthlyStateLogs,
        monthlyTransactions,
        walletSummary,
        streakSummary,
      ] = await Promise.all([
        getDoseRecordsByMonth(year, month),
        getMedications(),
        getAllTimeslots(),
        getStateLogsByMonth(year, month),
        getRewardTransactionsByMonth(year, month),
        getWalletSummary(),
        syncStreakState(),
      ])

      const nextCache = {
        records: monthlyRecords,
        medications: meds,
        timeslots: slots,
        stateLogs: monthlyStateLogs,
        rewardTransactions: monthlyTransactions,
        wallet: walletSummary,
        streak: streakSummary ?? null,
      }

      calendarHubCache.set(cacheKey, nextCache)
      applyCache(nextCache)
    } finally {
      setLoading(false)
    }
  }, [applyCache, cacheKey, month, year])

  useEffect(() => {
    const nextCache = calendarHubCache.get(cacheKey)
    if (nextCache) {
      applyCache(nextCache)
      setLoading(false)
    } else {
      setLoading(true)
    }
  }, [applyCache, cacheKey])

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
