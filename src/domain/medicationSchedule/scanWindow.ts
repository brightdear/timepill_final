export const SCAN_VERIFICATION_WINDOW_MINUTES = 60

export type ScanVerificationWindowState = 'upcoming' | 'open' | 'expired' | 'invalid'

type ScanWindowInput = {
  scheduledDate?: string | null
  scheduledTime?: string | null
  now?: Date | number
}

function nowToMs(now: Date | number | undefined) {
  if (typeof now === 'number') return now
  return (now ?? new Date()).getTime()
}

export function resolveScanScheduledAtMs({
  scheduledDate,
  scheduledTime,
}: Pick<ScanWindowInput, 'scheduledDate' | 'scheduledTime'>) {
  if (!scheduledTime) return Number.NaN

  if (scheduledTime.includes('T')) {
    return new Date(scheduledTime).getTime()
  }

  const timeMatch = scheduledTime.match(/^(\d{1,2}):(\d{2})/)
  const dayKey = scheduledDate?.slice(0, 10)
  if (!timeMatch || !dayKey) return Number.NaN

  const baseDate = new Date(`${dayKey}T12:00:00`)
  const hour = Number(timeMatch[1])
  const minute = Number(timeMatch[2])
  if (!Number.isFinite(baseDate.getTime()) || !Number.isFinite(hour) || !Number.isFinite(minute)) {
    return Number.NaN
  }

  return new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate(),
    hour,
    minute,
    0,
    0,
  ).getTime()
}

export function getScanVerificationWindowState(input: ScanWindowInput): ScanVerificationWindowState {
  const scheduledAtMs = resolveScanScheduledAtMs(input)
  if (!Number.isFinite(scheduledAtMs)) return 'invalid'

  const nowMs = nowToMs(input.now)
  const windowEndMs = scheduledAtMs + SCAN_VERIFICATION_WINDOW_MINUTES * 60 * 1000

  if (nowMs < scheduledAtMs) return 'upcoming'
  if (nowMs >= windowEndMs) return 'expired'
  return 'open'
}

export function isScanVerificationWindowOpen(input: ScanWindowInput) {
  return getScanVerificationWindowState(input) === 'open'
}
