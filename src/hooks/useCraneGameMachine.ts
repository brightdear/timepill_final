import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CRANE_PLAY_COST } from '@/constants/rewards'
import type { CranePrize } from '@/domain/reward/repository'
import {
  createPrizeObject,
  rarityModifier,
  type CraneRarity,
  type PrizeObject,
} from '@/components/shop/prizeObjectModel'

export type CraneGameState =
  | 'idle'
  | 'movingX'
  | 'movingY'
  | 'dropping'
  | 'grabbing'
  | 'lifting'
  | 'carrying'
  | 'droppingToExit'
  | 'success'
  | 'fail'

export type { CraneRarity, PrizeObject }

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

export type CraneShadowMetrics = {
  x: number
  y: number
  scale: number
  opacity: number
}

export type CraneGoalFrame = {
  x: number
  y: number
  width: number
  height: number
  slotX: number
  slotY: number
  slotWidth: number
  slotHeight: number
  hitbox: {
    left: number
    right: number
    top: number
    bottom: number
  }
}

type UseCraneGameMachineParams = {
  jellyBalance: number
  devMode: boolean
  machineWidth: number
  machineHeight?: number
  prizePool: CranePrize[]
  onSpendJelly: () => Promise<CranePlayStart>
  onPrizeWon: (input: CranePrizeWonInput) => Promise<void>
}

const DEFAULT_MACHINE_HEIGHT = 400
const RAIL_Y = 32
const TOP_Y = 42
const FRONT_LIP_HEIGHT = 44
const CLAW_ATTACHED_OFFSET_Y = 82
const CLAW_GRAB_RADIUS = 34
const CLAW_CONTACT_OFFSET = 18
const MOVE_SEGMENT_MS = 1500
const EDGE_PAUSE_MS = 150
const AUTO_DEPTH_TIME = 5

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function mix(from: number, to: number, progress: number) {
  return from + (to - from) * progress
}

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3)
}

function easeInQuad(value: number) {
  return value * value
}

function easeInOutSine(value: number) {
  return -(Math.cos(Math.PI * value) - 1) / 2
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

function buildGoalFrame(boardWidth: number, boardHeight: number): CraneGoalFrame {
  const width = clamp(Math.round(boardWidth * 0.28), 100, 112)
  const height = clamp(Math.round(boardHeight * 0.24), 92, 104)
  const x = Math.max(18, boardWidth - width - 20)
  const y = Math.max(18, boardHeight - height - FRONT_LIP_HEIGHT - 18)
  const slotWidth = clamp(Math.round(width * 0.62), 60, 72)
  const slotHeight = 12
  const slotX = x + (width - slotWidth) / 2
  const slotY = y + 14
  const hitInset = 14

  return {
    x,
    y,
    width,
    height,
    slotX,
    slotY,
    slotWidth,
    slotHeight,
    hitbox: {
      left: x + hitInset,
      right: x + width - hitInset,
      top: y + 24,
      bottom: y + height - hitInset,
    },
  }
}

function overlapsExitZone(
  x: number,
  y: number,
  width: number,
  height: number,
  goalFrame: CraneGoalFrame,
) {
  return (
    x + width / 2 > goalFrame.x - 4 &&
    x - width / 2 < goalFrame.x + goalFrame.width + 4 &&
    y + height / 2 > goalFrame.y - 4 &&
    y - height / 2 < goalFrame.y + goalFrame.height + 4
  )
}

function buildPrizeObjects(
  width: number,
  height: number,
  prizes: CranePrize[],
  seed: string,
  goalFrame: CraneGoalFrame,
): PrizeObject[] {
  if (width <= 0 || prizes.length === 0) return []

  const random = seededRandom(seed)
  const count = 8 + Math.floor(random() * 5)
  const objects: PrizeObject[] = []
  const left = 44
  const right = Math.max(left, width - 48)
  const top = Math.max(148, height * 0.42)
  const bottom = height - FRONT_LIP_HEIGHT - 28

  for (let index = 0; index < count; index += 1) {
    const prize = pickPrize(prizes, random)
    const objectSeed = `${seed}-${index}`
    let randomValue = random()
    let x = left + random() * (right - left)
    let y = top + random() * (bottom - top)
    let rotation = -16 + random() * 32
    let object = createPrizeObject({ prize, id: objectSeed, x, y, rotation, randomValue })

    for (let attempt = 0; attempt < 14; attempt += 1) {
      const severeOverlap = objects.some(item => {
        const distance = Math.hypot(item.x - object.x, item.y - object.y)
        const minDistance = Math.max(item.width, item.height, object.width, object.height) * 0.5
        return distance < minDistance
      })
      const blockedExit = overlapsExitZone(object.x, object.y, object.width, object.height, goalFrame)

      if (!severeOverlap && !blockedExit) break

      randomValue = random()
      x = left + random() * (right - left)
      y = top + random() * (bottom - top)
      rotation = -16 + random() * 32
      object = createPrizeObject({ prize, id: objectSeed, x, y, rotation, randomValue })
    }

    objects.push(object)
  }

  return objects
}

function calculateGrabChance(object: PrizeObject, clawPointX: number, clawPointY: number) {
  const dx = Math.abs(clawPointX - object.x)
  const dy = Math.abs(clawPointY - object.y)
  const distance = Math.sqrt(dx * dx + dy * dy)
  const maxGrabDistance = Math.max(object.width, object.height) * 0.55 + CLAW_GRAB_RADIUS
  const alignmentScore = clamp(1 - distance / maxGrabDistance, 0, 1)
  const baseChance = 0.88 * alignmentScore
  const difficultyPenalty = object.gripDifficulty + rarityModifier(object.rarity)

  return {
    dx,
    dy,
    distance,
    maxGrabDistance,
    alignmentScore,
    grabChance: clamp(baseChance - difficultyPenalty * 0.45, 0.08, 0.92),
  }
}

function carrySuccessChance(object: PrizeObject) {
  return clamp(
    1 - object.slipChance - object.weight * 0.12 - rarityModifier(object.rarity) * 0.25,
    0.18,
    0.96,
  )
}

export function useCraneGameMachine({
  jellyBalance,
  devMode,
  machineWidth,
  machineHeight = DEFAULT_MACHINE_HEIGHT,
  prizePool,
  onSpendJelly,
  onPrizeWon,
}: UseCraneGameMachineParams) {
  const [stateValue, setStateValue] = useState<CraneGameState>('idle')
  const [timerValue, setTimerValue] = useState(10)
  const [clawXValue, setClawXValue] = useState(24)
  const [clawDepthYValue, setClawDepthYValue] = useState(TOP_Y)
  const [clawDropOffsetValue, setClawDropOffsetValue] = useState(0)
  const [clawOpenValue, setClawOpenValue] = useState(1)
  const [attachedPrizeRotationValue, setAttachedPrizeRotationValue] = useState(0)
  const [attachedPrizeOffsetYValue, setAttachedPrizeOffsetYValue] = useState(CLAW_ATTACHED_OFFSET_Y)
  const [prizeObjects, setPrizeObjects] = useState<PrizeObject[]>([])
  const [attachedPrizeObjectId, setAttachedPrizeObjectId] = useState<string | null>(null)
  const [result, setResult] = useState<CraneResult | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const stateRef = useRef<CraneGameState>('idle')
  const timerRef = useRef(10)
  const clawXRef = useRef(24)
  const clawDepthYRef = useRef(TOP_Y)
  const clawDropOffsetRef = useRef(0)
  const clawOpenRef = useRef(1)
  const attachedPrizeOffsetYRef = useRef(CLAW_ATTACHED_OFFSET_Y)
  const animationFrameRef = useRef<number | null>(null)
  const motionFrameRef = useRef<number | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const playIdRef = useRef<string | null>(null)
  const awardingRef = useRef(false)
  const axisDirectionRef = useRef<1 | -1>(1)
  const axisProgressRef = useRef(0)
  const edgePauseRef = useRef(0)
  const movingClockRef = useRef(0)

  const floorTop = Math.max(110, machineHeight * 0.36)
  const floorBottom = machineHeight - FRONT_LIP_HEIGHT - 18
  const leftBound = 38
  const rightBound = Math.max(leftBound, machineWidth - 40)
  const depthTop = Math.max(RAIL_Y + 28, floorTop - 30)
  const depthBottom = Math.max(depthTop + 56, floorBottom - 110)
  const goalFrame = useMemo(() => buildGoalFrame(machineWidth, machineHeight), [machineHeight, machineWidth])
  const goalX = goalFrame.slotX + goalFrame.slotWidth / 2
  const exitApproachY = goalFrame.y - 8
  const playRightBound = Math.max(leftBound, Math.min(rightBound - 18, goalFrame.x - 16))

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

  const setClawDepthY = useCallback((nextY: number) => {
    clawDepthYRef.current = nextY
    setClawDepthYValue(nextY)
  }, [])

  const setClawDropOffset = useCallback((nextOffset: number) => {
    clawDropOffsetRef.current = nextOffset
    setClawDropOffsetValue(nextOffset)
  }, [])

  const setClawOpen = useCallback((nextOpen: number) => {
    const value = clamp(nextOpen, 0, 1)
    clawOpenRef.current = value
    setClawOpenValue(value)
  }, [])

  const setAttachedPrizeOffsetY = useCallback((nextOffset: number) => {
    attachedPrizeOffsetYRef.current = nextOffset
    setAttachedPrizeOffsetYValue(nextOffset)
  }, [])

  const clearPendingTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const resetAxisMotion = useCallback(() => {
    axisDirectionRef.current = 1
    axisProgressRef.current = 0
    edgePauseRef.current = 0
    movingClockRef.current = 0
  }, [])

  const runProgress = useCallback((
    durationMs: number,
    onProgress: (progress: number, rawProgress: number) => void,
    onDone: () => void,
    easing: (value: number) => number = easeOutCubic,
  ) => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current)
    }

    let startTime: number | null = null
    const tick = (time: number) => {
      if (startTime === null) startTime = time
      const rawProgress = Math.min(1, (time - startTime) / durationMs)
      const progress = easing(rawProgress)
      onProgress(progress, rawProgress)

      if (rawProgress >= 1) {
        animationFrameRef.current = null
        onDone()
        return
      }

      animationFrameRef.current = requestAnimationFrame(tick)
    }

    animationFrameRef.current = requestAnimationFrame(tick)
  }, [])

  const updatePrizeObject = useCallback((objectId: string, updater: (object: PrizeObject) => PrizeObject) => {
    setPrizeObjects(previous => previous.map(item => (
      item.id === objectId ? updater(item) : item
    )))
  }, [])

  const resetClawPose = useCallback(() => {
    setClawDepthY(depthTop)
    setClawDropOffset(0)
    setClawOpen(1)
    setAttachedPrizeRotationValue(0)
    setAttachedPrizeOffsetY(CLAW_ATTACHED_OFFSET_Y)
  }, [depthTop, setAttachedPrizeOffsetY, setClawDepthY, setClawDropOffset, setClawOpen])

  const finishFail = useCallback(() => {
    setAttachedPrizeObjectId(null)
    setAttachedPrizeRotationValue(0)
    setAttachedPrizeOffsetY(CLAW_ATTACHED_OFFSET_Y)
    setClawOpen(1)
    setState('fail')
    setResult({ status: 'fail' })
  }, [setAttachedPrizeOffsetY, setClawOpen, setState])

  const finishSuccess = useCallback(async (object: PrizeObject) => {
    if (!playIdRef.current || awardingRef.current) return
    awardingRef.current = true

    try {
      await onPrizeWon({
        playId: playIdRef.current,
        prizeId: object.prizeId,
        prize: object.prize,
      })
      setAttachedPrizeObjectId(null)
      setAttachedPrizeRotationValue(0)
      setAttachedPrizeOffsetY(CLAW_ATTACHED_OFFSET_Y)
      setClawOpen(1)
      setState('success')
      setResult({ status: 'success', prize: object.prize })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '보상을 저장하지 못했어요')
      finishFail()
    } finally {
      awardingRef.current = false
    }
  }, [finishFail, onPrizeWon, setAttachedPrizeOffsetY, setClawOpen, setState])

  const animatePrizeIntoGoal = useCallback((object: PrizeObject) => {
    const startX = clawXRef.current
    const startY = clawDepthYRef.current + clawDropOffsetRef.current + attachedPrizeOffsetYRef.current - 8
    const targetX = goalFrame.slotX + goalFrame.slotWidth / 2
    const targetY = goalFrame.slotY + goalFrame.slotHeight / 2 + 10

    setAttachedPrizeObjectId(null)
    updatePrizeObject(object.id, item => ({
      ...item,
      x: startX,
      y: startY,
      rotation: item.rotation,
      visualScale: 1,
      opacity: 1,
    }))

    runProgress(380, (progress, rawProgress) => {
      updatePrizeObject(object.id, item => ({
        ...item,
        x: mix(startX, targetX, progress),
        y: mix(startY, targetY, easeInQuad(rawProgress)),
        rotation: item.rotation + progress * 18,
        visualScale: mix(1, 0.58, progress),
        opacity: mix(1, 0.72, progress),
      }))
    }, () => {
      void finishSuccess(object)
    }, easeInQuad)
  }, [finishSuccess, goalFrame.slotHeight, goalFrame.slotWidth, goalFrame.slotX, goalFrame.slotY, runProgress, updatePrizeObject])

  const carryPrizeObject = useCallback((object: PrizeObject) => {
    setState('carrying')
    setClawDropOffset(0)

    const fromX = clawXRef.current
    const fromDepthY = clawDepthYRef.current
    const shouldDrop = Math.random() > carrySuccessChance(object)
    const dropAt = 0.3 + Math.random() * 0.3
    const failedFloorY = clamp(fromDepthY + 54, floorTop + 30, floorBottom - 12)
    let dropped = false

    runProgress(1020, (progress, rawProgress) => {
      const nextX = mix(fromX, goalX, progress)
      const nextDepthY = mix(fromDepthY, exitApproachY, progress) - Math.sin(rawProgress * Math.PI) * 18

      setClawX(nextX)
      setClawDepthY(nextDepthY)

      if (!shouldDrop || rawProgress < dropAt) {
        setAttachedPrizeRotationValue(Math.sin(rawProgress * Math.PI * 4) * 5)
        setAttachedPrizeOffsetY(CLAW_ATTACHED_OFFSET_Y + Math.abs(Math.sin(rawProgress * Math.PI * 3)) * 3)
        return
      }

      if (!dropped) {
        dropped = true
        setAttachedPrizeObjectId(null)
        setAttachedPrizeRotationValue(0)
        setAttachedPrizeOffsetY(CLAW_ATTACHED_OFFSET_Y)
      }

      const slipProgress = clamp((rawProgress - dropAt) / (1 - dropAt), 0, 1)
      const bounce = slipProgress > 0.8
        ? Math.sin(((slipProgress - 0.8) / 0.2) * Math.PI) * (1 - slipProgress) * 10
        : 0

      updatePrizeObject(object.id, item => ({
        ...item,
        x: mix(nextX, nextX + 14, slipProgress),
        y: mix(nextDepthY + CLAW_ATTACHED_OFFSET_Y, failedFloorY, easeInQuad(slipProgress)) - bounce,
        rotation: item.rotation + slipProgress * 28,
        visualScale: 1,
        opacity: 1,
      }))
    }, () => {
      setAttachedPrizeRotationValue(0)
      setAttachedPrizeOffsetY(CLAW_ATTACHED_OFFSET_Y)

      if (dropped) {
        finishFail()
        return
      }

      setState('droppingToExit')
      runProgress(320, (progress) => {
        setClawDropOffset(mix(0, 20, progress))
        setClawOpen(progress)
      }, () => {
        animatePrizeIntoGoal(object)
      }, easeInOutSine)
    }, easeInOutSine)
  }, [animatePrizeIntoGoal, exitApproachY, finishFail, floorBottom, floorTop, goalX, runProgress, setAttachedPrizeOffsetY, setClawDepthY, setClawDropOffset, setClawOpen, setClawX, setState, updatePrizeObject])

  const liftClaw = useCallback((object: PrizeObject | null) => {
    setState('lifting')
    const fromOffset = clawDropOffsetRef.current

    runProgress(620, (progress, rawProgress) => {
      setClawDropOffset(mix(fromOffset, 0, progress))
      if (object) {
        setAttachedPrizeRotationValue(Math.sin(rawProgress * Math.PI * 3.5) * 3)
        setAttachedPrizeOffsetY(CLAW_ATTACHED_OFFSET_Y + Math.abs(Math.sin(rawProgress * Math.PI * 2.5)) * 2)
      }
    }, () => {
      if (!object) {
        setClawOpen(1)
        finishFail()
        return
      }

      carryPrizeObject(object)
    }, easeInOutSine)
  }, [carryPrizeObject, finishFail, runProgress, setAttachedPrizeOffsetY, setClawDropOffset, setClawOpen, setState])

  const findReachedPrize = useCallback((maxDropReach: number) => {
    const startY = clawDepthYRef.current + CLAW_CONTACT_OFFSET
    const endY = startY + maxDropReach
    const clawPointX = clawXRef.current

    return prizeObjects
      .map(object => {
        const hitRadius = Math.max(object.width, object.height) * 0.55 + CLAW_GRAB_RADIUS
        const inDropPath = object.y >= startY - hitRadius * 0.2 && object.y <= endY + hitRadius * 0.35
        const dx = Math.abs(clawPointX - object.x)
        const pathDistance = Math.max(0, object.y - startY)
        const contactY = clamp(object.y, startY, endY)
        const metrics = calculateGrabChance(object, clawPointX, contactY)

        return {
          object,
          metrics,
          pathDistance,
          reached: inDropPath && dx <= hitRadius,
        }
      })
      .filter(candidate => candidate.reached)
      .sort((left, right) => left.pathDistance - right.pathDistance || left.metrics.distance - right.metrics.distance)[0] ?? null
  }, [prizeObjects])

  const calculateGrab = useCallback((candidate: ReturnType<typeof findReachedPrize>) => {
    setState('grabbing')
    const clawPoint = {
      x: clawXRef.current,
      y: clawDepthYRef.current + clawDropOffsetRef.current + CLAW_CONTACT_OFFSET,
    }

    runProgress(220, (progress) => {
      setClawOpen(1 - progress)
    }, () => {
      const selected = candidate
        ? {
            object: candidate.object,
            metrics: calculateGrabChance(candidate.object, clawPoint.x, clawPoint.y),
          }
        : null
      if (!selected || Math.random() >= selected.metrics.grabChance) {
        timeoutRef.current = setTimeout(() => liftClaw(null), 110)
        return
      }

      setAttachedPrizeObjectId(selected.object.id)
      timeoutRef.current = setTimeout(() => liftClaw(selected.object), 110)
    }, easeInOutSine)
  }, [liftClaw, runProgress, setClawOpen, setState])

  const dropClaw = useCallback(() => {
    if (stateRef.current !== 'movingY') return

    clearPendingTimeout()
    setState('dropping')
    const fromOffset = clawDropOffsetRef.current
    const maxDropReach = clamp(floorBottom - clawDepthYRef.current - CLAW_CONTACT_OFFSET, 72, 172)
    const reachedPrize = findReachedPrize(maxDropReach)
    const dropReach = reachedPrize
      ? clamp(reachedPrize.object.y - clawDepthYRef.current - CLAW_CONTACT_OFFSET, 34, maxDropReach)
      : maxDropReach

    runProgress(620, (progress) => {
      setClawDropOffset(mix(fromOffset, dropReach, progress))
    }, () => calculateGrab(reachedPrize), easeInOutSine)
  }, [calculateGrab, clearPendingTimeout, findReachedPrize, floorBottom, runProgress, setClawDropOffset, setState])

  const beginDepthSelection = useCallback((autoAdvance = false) => {
    if (stateRef.current !== 'movingX') return

    resetAxisMotion()
    setClawDepthY(depthTop)
    setClawDropOffset(0)
    if (autoAdvance && timerRef.current < AUTO_DEPTH_TIME) {
      setTimer(AUTO_DEPTH_TIME)
    }
    setState('movingY')
  }, [depthTop, resetAxisMotion, setClawDepthY, setClawDropOffset, setState, setTimer])

  const startGame = useCallback(async () => {
    const currentState = stateRef.current
    if (
      currentState === 'movingX' ||
      currentState === 'movingY' ||
      currentState === 'dropping' ||
      currentState === 'grabbing' ||
      currentState === 'lifting' ||
      currentState === 'carrying' ||
      currentState === 'droppingToExit'
    ) {
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
    setAttachedPrizeObjectId(null)
    setAttachedPrizeRotationValue(0)
    setAttachedPrizeOffsetY(CLAW_ATTACHED_OFFSET_Y)
    awardingRef.current = false

    try {
      const play = await onSpendJelly()
      playIdRef.current = play.playId
      setPrizeObjects(buildPrizeObjects(machineWidth, machineHeight, prizePool, play.playId, goalFrame))
      resetAxisMotion()
      setTimer(10)
      setClawX(leftBound)
      resetClawPose()
      setState('movingX')
    } catch (error) {
      const message = error instanceof Error ? error.message : '크레인을 시작하지 못했어요'
      setErrorMessage(message.includes('부족') ? '젤리가 부족해요' : message)
    }
  }, [devMode, goalFrame, jellyBalance, leftBound, machineHeight, machineWidth, onSpendJelly, prizePool, resetAxisMotion, resetClawPose, setAttachedPrizeOffsetY, setClawX, setState, setTimer])

  const closeResult = useCallback(() => {
    playIdRef.current = null
    setResult(null)
    setAttachedPrizeObjectId(null)
    setAttachedPrizeRotationValue(0)
    setAttachedPrizeOffsetY(CLAW_ATTACHED_OFFSET_Y)
    setClawX(leftBound)
    resetClawPose()
    setTimer(10)
    setState('idle')
  }, [leftBound, resetClawPose, setAttachedPrizeOffsetY, setClawX, setState, setTimer])

  const retry = useCallback(() => {
    closeResult()
    timeoutRef.current = setTimeout(() => {
      void startGame()
    }, 80)
  }, [closeResult, startGame])

  useEffect(() => {
    if (stateValue !== 'idle' || machineWidth <= 0 || prizePool.length <= 0) return undefined

    setPrizeObjects(buildPrizeObjects(machineWidth, machineHeight, prizePool, 'idle', goalFrame))
    setClawX(leftBound)
    resetClawPose()

    return undefined
  }, [goalFrame, leftBound, machineHeight, machineWidth, prizePool, resetClawPose, setClawX, stateValue])

  useEffect(() => {
    if (stateValue !== 'movingX') return undefined

    let lastTime: number | null = null
    const tick = (time: number) => {
      if (lastTime === null) lastTime = time
      const deltaMs = Math.min(50, time - lastTime)
      lastTime = time
      movingClockRef.current += deltaMs

      if (edgePauseRef.current > 0) {
        edgePauseRef.current = Math.max(0, edgePauseRef.current - deltaMs)
      } else {
        axisProgressRef.current = clamp(axisProgressRef.current + deltaMs / MOVE_SEGMENT_MS, 0, 1)
        const easedProgress = easeInOutSine(axisProgressRef.current)
        const fromX = axisDirectionRef.current === 1 ? leftBound : playRightBound
        const toX = axisDirectionRef.current === 1 ? playRightBound : leftBound
        setClawX(mix(fromX, toX, easedProgress))

        if (axisProgressRef.current >= 1) {
          axisDirectionRef.current = axisDirectionRef.current === 1 ? -1 : 1
          axisProgressRef.current = 0
          edgePauseRef.current = EDGE_PAUSE_MS
        }
      }

      const bob = Math.sin(movingClockRef.current * 0.0064) * 2.2
      setClawDepthY(clamp(depthTop + bob, depthTop - 3, depthTop + 7))
      setClawDropOffset(0)

      const nextTimer = Math.max(0, timerRef.current - deltaMs / 1000)
      setTimer(nextTimer)

      if (nextTimer <= 0) {
        motionFrameRef.current = null
        beginDepthSelection(true)
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
  }, [beginDepthSelection, depthTop, leftBound, playRightBound, setClawDepthY, setClawDropOffset, setClawX, setTimer, stateValue])

  useEffect(() => {
    if (stateValue !== 'movingY') return undefined

    let lastTime: number | null = null
    const tick = (time: number) => {
      if (lastTime === null) lastTime = time
      const deltaMs = Math.min(50, time - lastTime)
      lastTime = time
      movingClockRef.current += deltaMs

      if (edgePauseRef.current > 0) {
        edgePauseRef.current = Math.max(0, edgePauseRef.current - deltaMs)
      } else {
        axisProgressRef.current = clamp(axisProgressRef.current + deltaMs / MOVE_SEGMENT_MS, 0, 1)
        const easedProgress = easeInOutSine(axisProgressRef.current)
        const fromY = axisDirectionRef.current === 1 ? depthTop : depthBottom
        const toY = axisDirectionRef.current === 1 ? depthBottom : depthTop
        setClawDepthY(mix(fromY, toY, easedProgress))

        if (axisProgressRef.current >= 1) {
          axisDirectionRef.current = axisDirectionRef.current === 1 ? -1 : 1
          axisProgressRef.current = 0
          edgePauseRef.current = EDGE_PAUSE_MS
        }
      }

      setClawDropOffset(0)

      const nextTimer = Math.max(0, timerRef.current - deltaMs / 1000)
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
  }, [depthBottom, depthTop, dropClaw, setClawDepthY, setClawDropOffset, setTimer, stateValue])

  useEffect(() => () => {
    clearPendingTimeout()
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current)
    if (motionFrameRef.current !== null) cancelAnimationFrame(motionFrameRef.current)
  }, [clearPendingTimeout])

  const canStart = useMemo(
    () => (devMode || jellyBalance >= CRANE_PLAY_COST) && prizePool.length > 0 && machineWidth > 0,
    [devMode, jellyBalance, machineWidth, prizePool.length],
  )

  const clawShadow = useMemo<CraneShadowMetrics>(() => {
    const depthRatio = clamp((clawDepthYValue - depthTop) / Math.max(1, depthBottom - depthTop), 0, 1)
    const dropRatio = clamp(clawDropOffsetValue / 84, 0, 1)

    return {
      x: clawXValue + ((clawXValue / Math.max(machineWidth, 1)) - 0.5) * mix(2, 8, depthRatio),
      y: mix(floorTop + 24, floorBottom - 64, depthRatio) + dropRatio * 12,
      scale: mix(0.58, 0.94, depthRatio) + dropRatio * 0.22,
      opacity: clamp(mix(0.08, 0.16, depthRatio) + dropRatio * 0.08, 0.08, 0.28),
    }
  }, [clawDepthYValue, clawDropOffsetValue, clawXValue, depthBottom, depthTop, floorBottom, floorTop, machineWidth])

  const clawScale = useMemo(() => {
    const depthRatio = clamp((clawDepthYValue - depthTop) / Math.max(1, depthBottom - depthTop), 0, 1)
    const dropRatio = clamp(clawDropOffsetValue / 84, 0, 1)
    return mix(0.92, 1.06, depthRatio) + dropRatio * 0.04
  }, [clawDepthYValue, clawDropOffsetValue, depthBottom, depthTop])

  const clawY = clawDepthYValue + clawDropOffsetValue
  const canLockX = stateValue === 'movingX'
  const canDrop = stateValue === 'movingY'
  const resolving =
    stateValue === 'dropping' ||
    stateValue === 'grabbing' ||
    stateValue === 'lifting' ||
    stateValue === 'carrying' ||
    stateValue === 'droppingToExit'

  return {
    state: stateValue,
    timer: timerValue,
    clawX: clawXValue,
    clawY,
    clawDepthY: clawDepthYValue,
    clawDropOffset: clawDropOffsetValue,
    clawOpen: clawOpenValue,
    clawScale,
    clawShadow,
    attachedPrizeRotation: attachedPrizeRotationValue,
    attachedPrizeOffsetY: attachedPrizeOffsetYValue,
    prizeObjects,
    attachedPrizeObjectId,
    result,
    errorMessage,
    machineHeight,
    floorTop,
    floorBottom,
    railY: RAIL_Y,
    goalX,
    goalFrame,
    canStart,
    canLockX,
    canDrop,
    resolving,
    startGame,
    beginDepthSelection,
    dropClaw,
    closeResult,
    retry,
  }
}
