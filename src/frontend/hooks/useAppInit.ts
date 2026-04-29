import { useState, useEffect } from 'react'
import { restoreExpiredSkips } from '@backend/timeslot/repository'
import { checkMissedDoses, markDosesMissed, backfillAndGenerateDoseRecords } from '@backend/doseRecord/repository'

export function useAppInit() {
  const [isReady, setIsReady] = useState(false)
  const [isBackfilling, setIsBackfilling] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function init() {
      // 1. skip_until 지난 슬롯 활성화 복귀
      await restoreExpiredSkips()

      // 2. 앱 미실행 기간 backfill + 오늘 pending 생성
      if (!cancelled) setIsBackfilling(true)
      await backfillAndGenerateDoseRecords()

      // 3. 오늘 이전 pending → missed 처리
      const { records: overdueRecords } = await checkMissedDoses()
      await markDosesMissed(overdueRecords.map(r => r.id))

      if (!cancelled) {
        setIsBackfilling(false)
        setIsReady(true)
      }
    }

    init()
    return () => { cancelled = true }
  }, [])

  return { isReady, isBackfilling }
}
