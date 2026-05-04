import { useState, useEffect, useCallback } from 'react'
import { checkAndAdvanceStage, getJellyBalance } from '@/domain/daycare/repository'
import { GROWTH_CONDITIONS, STAGE_LABEL } from '@/constants/daycareConfig'
import type { DaycareStage } from '@/constants/daycareConfig'

export type DaycareState = {
  stage: DaycareStage
  stageLabel: string
  streak: number
  complianceRate: number
  jellyBalance: number
  nextStreakTarget: number | null
  nextComplianceTarget: number | null
  nextComplianceDays: number | null
  loading: boolean
}

export function useDaycare(): DaycareState & { refresh: () => void } {
  const [state, setState] = useState<DaycareState>({
    stage: 'egg',
    stageLabel: '알',
    streak: 0,
    complianceRate: 100,
    jellyBalance: 0,
    nextStreakTarget: 3,
    nextComplianceTarget: 70,
    nextComplianceDays: 7,
    loading: true,
  })

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true }))
    const [{ stage, streak, complianceRate }, jellyBalance] = await Promise.all([
      checkAndAdvanceStage(),
      getJellyBalance(),
    ])
    const next = GROWTH_CONDITIONS[stage]
    setState({
      stage,
      stageLabel: STAGE_LABEL[stage],
      streak,
      complianceRate,
      jellyBalance,
      nextStreakTarget: next?.streakDays ?? null,
      nextComplianceTarget: next?.complianceMin ?? null,
      nextComplianceDays: next?.complianceDays ?? null,
      loading: false,
    })
  }, [])

  useEffect(() => { load() }, [load])

  return { ...state, refresh: load }
}
