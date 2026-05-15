import { useState, useEffect, useRef, useCallback } from 'react'
import { restoreExpiredSkips } from '@/domain/timeslot/repository'
import { checkMissedDoses, markDosesMissed } from '@/domain/doseRecord/repository'
import { resetStreaks } from '@/domain/streak/repository'
import { applyFreezeToRecords } from '@/domain/settings/repository'
import { checkFreezeEligibility } from '@/hooks/useFreezeEligibility'
import { backfillAndGenerateDoseRecords } from '@/domain/doseRecord/repository'
import { resyncAlarmState } from '@/domain/alarm/alarmScheduler'
import type { FreezeEligibleSlot } from '@/hooks/useFreezeEligibility'
import { getLocalDateKey } from '@/utils/dateUtils'

export type { FreezeEligibleSlot }

let appInitCompletedDayKey: string | null = null

export function useAppInit() {
  const todayKey = getLocalDateKey()
  const [isReady, setIsReady] = useState(appInitCompletedDayKey === todayKey)
  const [isBackfilling, setIsBackfilling] = useState(false)
  const [freezeEligibleSlots, setFreezeEligibleSlots] = useState<FreezeEligibleSlot[]>([])
  const resolveFreeze = useRef<((selected: string[]) => void) | null>(null)

  // Called by home screen when user closes the freeze popup
  const confirmFreeze = useCallback((selectedSlotIds: string[]) => {
    setFreezeEligibleSlots([])
    resolveFreeze.current?.(selectedSlotIds)
    resolveFreeze.current = null
  }, [])

  useEffect(() => {
    if (appInitCompletedDayKey === todayKey) {
      setIsReady(true)
      return
    }

    let cancelled = false

    async function init() {
      // 1. skip_until 지난 슬롯 활성화 복귀
      await restoreExpiredSkips()

      // 2. 오늘 이전 pending 조회 (DB write 없음 — freeze 결과 확정 후 기록)
      const { timeSlotIds: missedSlotIds, records: overdueRecords } = await checkMissedDoses()

      // 3. freeze 팝업 체크 — streak 리셋 전에 반드시 먼저 실행
      const frozenSlotIds = new Set<string>()
      const frozenRecordIds = new Set<string>()

      if (overdueRecords.length > 0) {
        const eligible = await checkFreezeEligibility(overdueRecords)
        if (eligible.length > 0 && !cancelled) {
          // Pause init and wait for user to respond to popup
          const selectedSlotIds = await new Promise<string[]>(resolve => {
            setFreezeEligibleSlots(eligible)
            resolveFreeze.current = resolve
          })

          // 선택된 슬롯을 단일 트랜잭션으로 일괄 freeze 처리
          const toFreezeRecords = selectedSlotIds
            .map(slotId => overdueRecords.find(r => r.timeSlotId === slotId))
            .filter((r): r is NonNullable<typeof r> => r !== undefined)
          await applyFreezeToRecords(toFreezeRecords.map(r => r.id))
          for (const record of toFreezeRecords) {
            frozenSlotIds.add(record.timeSlotId ?? '')
            frozenRecordIds.add(record.id)
          }
        }
      }

      // freeze 팝업 완료 후 — frozen 제외한 나머지만 missed로 기록
      const missedRecordIds = overdueRecords.filter(r => !frozenRecordIds.has(r.id)).map(r => r.id)
      await markDosesMissed(missedRecordIds)

      // 4. streak 리셋 — freeze 적용된 슬롯은 제외
      const slotsToReset = missedSlotIds.filter(id => !frozenSlotIds.has(id))
      if (slotsToReset.length > 0) {
        await resetStreaks(slotsToReset)
      }

      // 5. backfill + 오늘 pending 생성
      if (!cancelled) setIsBackfilling(true)
      await backfillAndGenerateDoseRecords()
      await resyncAlarmState()
      if (!cancelled) {
        appInitCompletedDayKey = getLocalDateKey()
        setIsBackfilling(false)
        setIsReady(true)
      }
    }

    init()
    return () => { cancelled = true }
  }, [todayKey])

  return { isReady, isBackfilling, freezeEligibleSlots, confirmFreeze }
}
