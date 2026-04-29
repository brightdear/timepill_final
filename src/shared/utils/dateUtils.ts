// 모든 날짜/시간: 로컬 시간 기준 문자열. toISOString() 사용 금지 (UTC → KST 날짜 밀림)

export function getLocalDateKey(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// Z 없는 로컬 ISO 문자열 — DB scheduledTime / createdAt 저장 전용
export function toLocalISOString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.000`
  )
}

// dateKey 하루의 시작/끝 로컬 문자열 (DB 범위 쿼리용)
// end = 다음날 자정 — lt(scheduledTime, end) 패턴으로 사용
export function getLocalDayBounds(dateKey: string): { start: string; end: string } {
  const d = new Date(`${dateKey}T12:00:00`)
  d.setDate(d.getDate() + 1)
  const pad = (n: number) => String(n).padStart(2, '0')
  const nextDay = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return {
    start: `${dateKey}T00:00:00.000`,
    end:   `${nextDay}T00:00:00.000`,
  }
}

// fromKey ~ toKey 날짜 목록 생성 (양쪽 포함)
export function getDateRange(fromKey: string, toKey: string): string[] {
  const dates: string[] = []
  const cur = new Date(`${fromKey}T12:00:00`)
  const end = new Date(`${toKey}T12:00:00`)
  while (cur <= end) {
    dates.push(getLocalDateKey(cur))
    cur.setDate(cur.getDate() + 1)
  }
  return dates
}
