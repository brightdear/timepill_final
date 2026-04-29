import type { CycleConfig } from '@backend/db/schema'

type SlotForCycle = {
  cycleConfig: string
  cycleStartDate: string | null
  isActive: number
}

// checkDate가 복용일인지 판단. 생략 시 오늘 기준 — backfill에서 과거 날짜 전달
export function isTodayDue(slot: SlotForCycle, checkDate = new Date()): boolean {
  if (slot.isActive === 0) return false

  // 시각 차이(오전/오후)로 인한 하루 오차 방지 — 항상 정오 기준으로 비교
  const d = new Date(checkDate)
  d.setHours(12, 0, 0, 0)

  const config = JSON.parse(slot.cycleConfig) as CycleConfig
  const dow = d.getDay()  // 0=일, 1=월, ..., 6=토

  switch (config.type) {
    case 'daily':
      return true

    case 'weekly':   // 주중 월~금
      return dow >= 1 && dow <= 5

    case 'weekends': // 주말 토~일
      return dow === 0 || dow === 6

    case 'specific_days':
      return config.days.includes(dow)

    case 'rest': {
      if (!slot.cycleStartDate) return false
      const start = new Date(`${slot.cycleStartDate}T12:00:00`)  // 로컬 시간으로 통일 — 'YYYY-MM-DD'만 넘기면 UTC midnight으로 파싱됨
      const unitDays = config.unit === 'week' ? 7 : 1
      const activeTotal = config.active_value * unitDays
      const restTotal   = config.rest_value * unitDays
      const cycleLen    = activeTotal + restTotal

      const diffDays = Math.floor((d.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
      const posInCycle = ((diffDays % cycleLen) + cycleLen) % cycleLen
      return posInCycle < activeTotal
    }

    default:
      return false
  }
}
