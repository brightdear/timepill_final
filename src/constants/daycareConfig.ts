export type DaycareStage = 'egg' | 'baby' | 'child' | 'adult'

export const STAGE_ORDER: DaycareStage[] = ['egg', 'baby', 'child', 'adult']

export type GrowthCondition = {
  streakDays: number
  complianceDays: number
  complianceMin: number
}

// 각 단계에서 다음 단계로 성장하기 위한 조건. adult는 최종 단계라 null.
export const GROWTH_CONDITIONS: Record<DaycareStage, GrowthCondition | null> = {
  egg:   { streakDays: 3,  complianceDays: 7,  complianceMin: 70 },
  baby:  { streakDays: 14, complianceDays: 30, complianceMin: 80 },
  child: { streakDays: 60, complianceDays: 60, complianceMin: 90 },
  adult: null,
}

export const STAGE_LABEL: Record<DaycareStage, string> = {
  egg:   '알',
  baby:  '아기',
  child: '어린이',
  adult: '성체',
}

export const JELLY_PER_DOSE = 1
export const JELLY_PER_MILESTONE = 10
export const JELLY_MILESTONE_INTERVAL = 7
