import { useState, useEffect, useRef, useCallback } from 'react'
import { restoreExpiredSkips } from '@/domain/timeslot/repository'
import { checkMissedDoses, markDosesMissed } from '@/domain/doseRecord/repository'
import { resetStreaks } from '@/domain/streak/repository'
import { applyFreezeToRecords } from '@/domain/settings/repository'
import { checkFreezeEligibility } from '@/hooks/useFreezeEligibility'
import { backfillAndGenerateDoseRecords } from '@/domain/doseRecord/repository'
import type { FreezeEligibleSlot } from '@/hooks/useFreezeEligibility'

export type { FreezeEligibleSlot }

export function useAppInit() {
  const [isReady, setIsReady] = useState(false)
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
    let cancelled = false

    async function init() {
      // 1. skip_until 지난 슬롯 활성화 복귀
      await restoreExpiredSkips()

      // 2. 앱 미실행 기간 backfill + 오늘 pending 생성
      if (!cancelled) setIsBackfilling(true)
      const { insertedMissedRecords } = await backfillAndGenerateDoseRecords()

      // 3. 오늘 이전 pending 조회 (DB write 없음 — freeze 결과 확정 후 기록)
      const { records: overdueRecords } = await checkMissedDoses()

      // 4. freeze 팝업 체크 — streak 리셋 전에 반드시 먼저 실행
      const frozenRecordIds = new Set<string>()
      const missedRecords = [...overdueRecords, ...insertedMissedRecords]

      if (missedRecords.length > 0) {
        const eligible = await checkFreezeEligibility(missedRecords)
        if (eligible.length > 0 && !cancelled) {
          // Map by record id so selecting a slot freezes the exact eligible missed record.
          const eligibleRecordBySlot = new Map(eligible.map(slot => [slot.slotId, slot.doseRecordId]))
          // Pause init and wait for user to respond to popup
          const selectedSlotIds = await new Promise<string[]>(resolve => {
            setFreezeEligibleSlots(eligible)
            resolveFreeze.current = resolve
          })

          // 선택된 슬롯을 단일 트랜잭션으로 일괄 freeze 처리
          const toFreezeRecords = selectedSlotIds
            .map(slotId => missedRecords.find(r => r.id === eligibleRecordBySlot.get(slotId)))
            .filter((r): r is NonNullable<typeof r> => r !== undefined)
          await applyFreezeToRecords(toFreezeRecords.map(r => r.id))
          for (const record of toFreezeRecords) {
            frozenRecordIds.add(record.id)
          }
        }
      }

      // freeze 팝업 완료 후 — frozen 제외한 나머지만 missed로 기록
      const missedRecordIds = overdueRecords.filter(r => !frozenRecordIds.has(r.id)).map(r => r.id)
      await markDosesMissed(missedRecordIds)

      // 5. streak 리셋 — frozen 처리된 레코드만 제외. 같은 슬롯에 더 오래된 missed가 있으면 리셋되어야 함.
      const slotsToReset = Array.from(new Set(
        missedRecords
          .filter(r => !frozenRecordIds.has(r.id))
          .map(r => r.timeSlotId)
          .filter((id): id is string => id !== null && id !== undefined),
      ))
      if (slotsToReset.length > 0) {
        await resetStreaks(slotsToReset)
      }

      if (!cancelled) {
        setIsBackfilling(false)
        setIsReady(true)
      }
    }

    init()
    return () => { cancelled = true }
  }, [])

  return { isReady, isBackfilling, freezeEligibleSlots, confirmFreeze }
}
