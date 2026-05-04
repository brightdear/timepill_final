import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CRANE_PLAY_COST } from '@/constants/rewards'
import type { CranePrize } from '@/domain/reward/repository'

export type CraneGameState =
  | 'idle'
  | 'moving'
  | 'dropping'
  | 'grabbing'
  | 'lifting'
  | 'carrying'
  | 'droppingToGoal'
  | 'success'
  | 'fail'

export type CraneRarity = 'common' | 'rare' | 'special'

export type CraneCapsule = {
  id: string
  prize: CranePrize
  prizeId: string
  x: number
  y: number
  radius: number
  color: string
  rarity: CraneRarity
}

export type CranePlayStart = {
  playId: string
  walletBalance: number
  isDevMode: boolean
  cost: number
}

export type CranePrizeWonInput = {
  playId: string
  prizeId: string
  prize: CranePrize
}

export type CraneResult = {
  status: 'success' | 'fail'
  prize?: CranePrize
}

type UseCraneGameParams = {
  jellyBalance: number
  devMode: boolean
  machineWidth: number
  prizePool: CranePrize[]
  onSpendJelly: () => Promise<CranePlayStart>
  onPrizeWon: (input: CranePrizeWonInput) => Promise<void>
}

const MACHINE_HEIGHT = 300
const TOP_Y = 28
const CLAW_GRAB_WIDTH = 22
const MOVE_SPEED = 104
const CAPSULE_COLORS = ['#F8C8C8', '#CFE8D6', '#C9DDF7', '#F8E2A8', '#D8CDF6', '#F7CFD8', '#BFE5E0', '#E8DCC8']

function normalizeRarity(value: string): CraneRarity {
  if (value === 'rare' || value === 'special') return value
  return 'common'
}

function baseGrabChance(rarity: CraneRarity) {
  if (rarity === 'special') return 0.45
  if (rarity === 'rare') return 0.65
  return 0.85
}

function carryDropChance(rarity: CraneRarity) {
  if (rarity === 'special') return 0.2
  if (rarity === 'rare') return 0.12
  return 0.05
}

function seededRandom(seed: string) {
  let hash = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return () => {
    hash += hash << 13
    hash ^= hash >>> 7
    hash += hash << 3
    hash ^= hash >>> 17
    hash += hash << 5
    return ((hash >>> 0) % 10000) / 10000
  }
}

function pickPrize(prizes: CranePrize[], random: () => number) {
  const weighted = prizes.filter(prize => prize.weight > 0)
  const candidates = weighted.length > 0 ? weighted : prizes
  const totalWeight = candidates.reduce((sum, prize) => sum + Math.max(prize.weight, 1), 0)
  let cursor = random() * totalWeight

  for (const prize of candidates) {
    cursor -= Math.max(prize.weight, 1)
    if (cursor <= 0) return prize
  }

  return candidates[0]
}

function buildCapsules(width: number, prizes: CranePrize[], seed: string): CraneCapsule[] {
  if (width <= 0 || prizes.length === 0) return []

  const random = seededRandom(seed)
  const count = 8 + Math.floor(random() * 5)
  const capsules: CraneCapsule[] = []
  const left = 34
  const right = Math.max(left, width - 34)
  const top = MACHINE_HEIGHT * 0.54
  const bottom = MACHINE_HEIGHT - 38

  for (let index = 0; index < count; index += 1) {
    const prize = pickPrize(prizes, random)
    const radius = 13 + Math.floor(random() * 4)
    let x = left + random() * (right - left)
    let y = top + random() * (bottom - top)

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const overlaps = capsules.some(capsule => {
        const distance = Math.hypot(capsule.x - x, capsule.y - y)
        return distance < capsule.radius + radius + 5
      })
      if (!overlaps) break
      x = left + random() * (right - left)
      y = top + random() * (bottom - top)
    }

    capsules.push({
      id: `${seed}-${index}`,
      prize,
      prizeId: prize.id,
      x,
      y,
      radius,
      color: CAPSULE_COLORS[index % CAPSULE_COLORS.length],
      rarity: normalizeRarity(prize.rarity),
    })
  }

  return capsules
}

export function useCraneGame({
  jellyBalance,
  devMode,
  machineWidth,
  prizePool,
  onSpendJelly,
  onPrizeWon,
}: UseCraneGameParams) {
  const [stateValue, setStateValue] = useState<CraneGameState>('idle')
  const [timerValue, setTimerValue] = useState(10)
  const [clawXValue, setClawXValue] = useState(24)
  const [clawYValue, setClawYValue] = useState(TOP_Y)
  const [capsules, setCapsules] = useState<CraneCapsule[]>([])
  const [attachedCapsuleId, setAttachedCapsuleId] = useState<string | null>(null)
  const [result, setResult] = useState<CraneResult | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const stateRef = useRef<CraneGameState>('idle')
  const timerRef = useRef(10)
  const clawXRef = useRef(24)
  const clawYRef = useRef(TOP_Y)
  const directionRef = useRef(1)
  const playIdRef = useRef<string | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const motionFrameRef = useRef<number | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const awardingRef = useRef(false)

  const leftBound = 24
  const rightBound = Math.max(leftBound, machineWidth - 24)
  const bottomY = MACHINE_HEIGHT - 92
  const goalX = Math.max(leftBound, machineWidth - 48)

  const setState = useCallback((nextState: CraneGameState) => {
    stateRef.current = nextState
    setStateValue(nextState)
  }, [])

  const setTimer = useCallback((nextTimer: number) => {
    timerRef.current = nextTimer
    setTimerValue(nextTimer)
  }, [])

  const setClawX = useCallback((nextX: number) => {
    clawXRef.current = nextX
    setClawXValue(nextX)
  }, [])

  const setClawY = useCallback((nextY: number) => {
    clawYRef.current = nextY
    setClawYValue(nextY)
  }, [])

  const clearPendingTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const runProgress = useCallback((durationMs: number, onProgress: (progress: number) => void, onDone: () => void) => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
    }

    let startTime: number | null = null
    const tick = (time: number) => {
      if (startTime === null) startTime = time
      const progress = Math.min(1, (time - startTime) / durationMs)
      const eased = 1 - Math.pow(1 - progress, 3)
      onProgress(eased)

      if (progress >= 1) {
        animationFrameRef.current = null
        onDone()
        return
      }

      animationFrameRef.current = requestAnimationFrame(tick)
    }

    animationFrameRef.current = requestAnimationFrame(tick)
  }, [])

  const finishFail = useCallback(() => {
    setAttachedCapsuleId(null)
    setState('fail')
    setResult({ status: 'fail' })
  }, [setState])

  const finishSuccess = useCallback(async (capsule: CraneCapsule) => {
    if (!playIdRef.current || awardingRef.current) return
    awardingRef.current = true

    try {
      await onPrizeWon({
        playId: playIdRef.current,
        prizeId: capsule.prizeId,
        prize: capsule.prize,
      })
      setAttachedCapsuleId(null)
      setState('success')
      setResult({ status: 'success', prize: capsule.prize })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '보상을 저장하지 못했어요')
      finishFail()
    } finally {
      awardingRef.current = false
    }
  }, [finishFail, onPrizeWon, setState])

  const carryCapsule = useCallback((capsule: CraneCapsule) => {
    setState('carrying')
    const fromX = clawXRef.current
    const shouldDrop = Math.random() < carryDropChance(capsule.rarity)
    const dropAt = 0.28 + Math.random() * 0.44
    let dropped = false

    runProgress(920, progress => {
      const nextX = fromX + (goalX - fromX) * progress
      setClawX(nextX)

      if (shouldDrop && !dropped && progress >= dropAt) {
        dropped = true
        setAttachedCapsuleId(null)
        setCapsules(previous => previous.map(item => (
          item.id === capsule.id
            ? { ...item, x: nextX, y: MACHINE_HEIGHT - 42 }
            : item
        )))
      }
    }, () => {
      if (dropped) {
        finishFail()
        return
      }

      setState('droppingToGoal')
      const releaseStartY = clawYRef.current
      runProgress(440, releaseProgress => {
        setClawY(releaseStartY + 42 * releaseProgress)
      }, () => {
        void finishSuccess(capsule)
      })
    })
  }, [finishFail, finishSuccess, goalX, runProgress, setClawX, setClawY, setState])

  const liftClaw = useCallback((capsule: CraneCapsule | null) => {
    setState('lifting')
    const fromY = clawYRef.current
    runProgress(560, progress => {
      setClawY(fromY + (TOP_Y - fromY) * progress)
    }, () => {
      if (!capsule) {
        finishFail()
        return
      }

      carryCapsule(capsule)
    })
  }, [carryCapsule, finishFail, runProgress, setClawY, setState])

  const calculateGrab = useCallback(() => {
    setState('grabbing')
    const candidates = capsules
      .map(capsule => ({ capsule, distance: Math.abs(capsule.x - clawXRef.current) }))
      .filter(item => item.distance <= CLAW_GRAB_WIDTH + item.capsule.radius)
      .sort((left, right) => left.distance - right.distance)

    const selected = candidates[0]
    if (!selected) {
      timeoutRef.current = setTimeout(() => liftClaw(null), 220)
      return
    }

    const distanceRatio = selected.distance / (CLAW_GRAB_WIDTH + selected.capsule.radius)
    const grabChance = baseGrabChance(selected.capsule.rarity) * (1 - distanceRatio * 0.45)
    const grabbed = Math.random() < grabChance

    if (!grabbed) {
      timeoutRef.current = setTimeout(() => liftClaw(null), 220)
      return
    }

    setAttachedCapsuleId(selected.capsule.id)
    timeoutRef.current = setTimeout(() => liftClaw(selected.capsule), 220)
  }, [capsules, liftClaw, setState])

  const dropClaw = useCallback(() => {
    if (stateRef.current !== 'moving') return

    clearPendingTimeout()
    setState('dropping')
    const fromY = clawYRef.current
    runProgress(560, progress => {
      setClawY(fromY + (bottomY - fromY) * progress)
    }, calculateGrab)
  }, [bottomY, calculateGrab, clearPendingTimeout, runProgress, setClawY, setState])

  const startGame = useCallback(async () => {
    const currentState = stateRef.current
    if (currentState === 'moving' || currentState === 'dropping' || currentState === 'grabbing' || currentState === 'lifting' || currentState === 'carrying' || currentState === 'droppingToGoal') {
      return
    }

    if (!devMode && jellyBalance < CRANE_PLAY_COST) {
      setErrorMessage('젤리가 부족해요')
      return
    }

    if (machineWidth <= 0 || prizePool.length === 0) {
      setErrorMessage('보상 정보가 없습니다')
      return
    }

    setErrorMessage(null)
    setResult(null)
    setAttachedCapsuleId(null)
    awardingRef.current = false

    try {
      const play = await onSpendJelly()
      playIdRef.current = play.playId
      const nextCapsules = buildCapsules(machineWidth, prizePool, play.playId)
      setCapsules(nextCapsules)
      directionRef.current = 1
      setTimer(10)
      setClawX(leftBound)
      setClawY(TOP_Y)
      setState('moving')
    } catch (error) {
      const message = error instanceof Error ? error.message : '크레인을 시작하지 못했어요'
      setErrorMessage(message.includes('부족') ? '젤리가 부족해요' : message)
    }
  }, [devMode, jellyBalance, leftBound, machineWidth, onSpendJelly, prizePool, setClawX, setClawY, setState, setTimer])

  const closeResult = useCallback(() => {
    setResult(null)
    setAttachedCapsuleId(null)
    setClawY(TOP_Y)
    setTimer(10)
    setState('idle')
  }, [setClawY, setState, setTimer])

  const retry = useCallback(() => {
    closeResult()
    timeoutRef.current = setTimeout(() => {
      void startGame()
    }, 80)
  }, [closeResult, startGame])

  useEffect(() => {
    if ((stateValue === 'idle' || stateValue === 'success' || stateValue === 'fail') && machineWidth > 0 && prizePool.length > 0) {
      setCapsules(buildCapsules(machineWidth, prizePool, 'idle'))
      setClawX(leftBound)
      setClawY(TOP_Y)
    }
  }, [leftBound, machineWidth, prizePool, setClawX, setClawY, stateValue])

  useEffect(() => {
    if (stateValue !== 'moving') return undefined

    let lastTime: number | null = null
    const tick = (time: number) => {
      if (lastTime === null) lastTime = time
      const deltaSeconds = Math.min(0.05, (time - lastTime) / 1000)
      lastTime = time

      let nextX = clawXRef.current + directionRef.current * MOVE_SPEED * deltaSeconds
      if (nextX >= rightBound) {
        nextX = rightBound
        directionRef.current = -1
      } else if (nextX <= leftBound) {
        nextX = leftBound
        directionRef.current = 1
      }
      setClawX(nextX)

      const nextTimer = Math.max(0, timerRef.current - deltaSeconds)
      setTimer(nextTimer)

      if (nextTimer <= 0) {
        motionFrameRef.current = null
        dropClaw()
        return
      }

      motionFrameRef.current = requestAnimationFrame(tick)
    }

    motionFrameRef.current = requestAnimationFrame(tick)

    return () => {
      if (motionFrameRef.current !== null) {
        cancelAnimationFrame(motionFrameRef.current)
        motionFrameRef.current = null
      }
    }
  }, [dropClaw, leftBound, rightBound, setClawX, setTimer, stateValue])

  useEffect(() => () => {
    clearPendingTimeout()
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current)
    if (motionFrameRef.current !== null) cancelAnimationFrame(motionFrameRef.current)
  }, [clearPendingTimeout])

  const canStart = useMemo(
    () => (devMode || jellyBalance >= CRANE_PLAY_COST) && prizePool.length > 0 && machineWidth > 0,
    [devMode, jellyBalance, machineWidth, prizePool.length],
  )

  const canDrop = stateValue === 'moving'
  const resolving = stateValue === 'dropping' || stateValue === 'grabbing' || stateValue === 'lifting' || stateValue === 'carrying' || stateValue === 'droppingToGoal'

  return {
    state: stateValue,
    timer: timerValue,
    clawX: clawXValue,
    clawY: clawYValue,
    capsules,
    attachedCapsuleId,
    result,
    errorMessage,
    machineHeight: MACHINE_HEIGHT,
    goalX,
    canStart,
    canDrop,
    resolving,
    startGame,
    dropClaw,
    closeResult,
    retry,
  }
}