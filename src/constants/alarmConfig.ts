export const MAX_TIMESLOTS = 10
// 슬롯 10개 × 5일 = 50 notifications (expo 상한 64 이내)

export const ALARM_SCHEDULE_DAYS = 5
// 6시간마다 background refresh → 최소 커버리지 ≈ 4.75일

export const ALARM_REFRESH_TASK_NAME = 'ALARM_REFRESH_TASK'
