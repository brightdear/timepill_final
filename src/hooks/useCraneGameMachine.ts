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
  | 'moving'
  | 'dropping'
  | 'closing'
  | 'grabbing'
  | 'lifting'
  | 'carrying'
  | 'droppingToExit'
  | 'dispensing'
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
  outletX: number
  outletY: number
  outletWidth: number
  outletHeight: number
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

type GrabMetrics = ReturnType<typeof calculateGrabChance>
type ReachedPrize = {
  object: PrizeObject
  metrics: GrabMetrics
  pathDistance: number
}

const DEFAULT_MACHINE_HEIGHT = 400
const RAIL_Y = 32
const TOP_Y = 42
const FRONT_LIP_HEIGHT = 44
const CLAW_ATTACHED_OFFSET_Y = 58
const CLAW_GRAB_RADIUS = 34
const CLAW_CONTACT_OFFSET = 62
const MOVE_PASS_MS = 3800
const DROP_MS = 940
const CLOSE_MS = 420
const LIFT_MS = 1050
const CARRY_MS = 1450
const HOLE_DROP_MS = 650
const DISPENSE_MS = 540
const RESULT_DELAY_MS = 360
const FAIL_SETTLE_DELAY_MS = 380
const EMPTY_MISS_LIFT_MS = 560
const FAILED_GRAB_NUDGE_MS = 660

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
  const width = clamp(Math.round(boardWidth * 0.27), 92, 112)
  const height = clamp(Math.round(boardHeight * 0.2), 72, 90)
  const x = Math.max(18, boardWidth - width - 20)
  const y = Math.max(18, boardHeight - height - FRONT_LIP_HEIGHT - 18)
  const slotWidth = clamp(Math.round(width * 0.68), 64, 78)
  const slotHeight = 14
  const slotX = x + (width - slotWidth) / 2
  const slotY = y + 18
  const outletWidth = clamp(Math.round(boardWidth * 0.28), 96, 116)
  const outletHeight = 32
  const outletX = Math.max(22, boardWidth - outletWidth - 24)
  const outletY = boardHeight - FRONT_LIP_HEIGHT + 7

  return {
    x,
    y,
    width,
    height,
    slotX,
    slotY,
    slotWidth,
    slotHeight,
    outletX,
    outletY,
    outletWidth,
    outletHeight,
    hitbox: {
      left: slotX - 8,
      right: slotX + slotWidth + 8,
      top: slotY - 10,
      bottom: slotY + slotHeight + 22,
    },
  }
}

function overlapsExitZone(
  x: number,
  y: number,
  width: number,
  height: number,
  goalFrame: CraneGoalFrame,
  margin = 24,
) {
  return (
    x + width / 2 > goalFrame.x - margin &&
    x - width / 2 < goalFrame.x + goalFrame.width + margin &&
    y + height / 2 > goalFrame.y - margin &&
    y - height / 2 < goalFrame.y + goalFrame.height + margin
  )
}

function prizeSpacing(left: PrizeObject, right: PrizeObject) {
  const leftSize = Math.max(left.width, left.height)
  const rightSize = Math.max(right.width, right.height)
  const largeObjectBonus = Math.max(0, Math.max(leftSize, rightSize) - 48) * 0.18
  return (leftSize + rightSize) * 0.38 + largeObjectBonus
}

function clampPrizeToField(object: PrizeObject, bounds: { left: number; right: number; top: number; bottom: number }) {
  return {
    ...object,
    x: clamp(object.x, bounds.left + object.width / 2, bounds.right - object.width / 2),
    y: clamp(object.y, bounds.top + object.height / 2, bounds.bottom - object.height / 2),
  }
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
  const count = 7 + Math.floor(random() * 3)
  const left = width * 0.12
  const right = Math.max(left + 136, Math.min(width * 0.76, goalFrame.x - 34))
  const top = Math.max(142, height * 0.48)
  const bottom = Math.min(height - FRONT_LIP_HEIGHT - 42, height * 0.82)
  const bounds = { left, right, top, bottom }
  const anchors = [
    { x: 0.10, y: 0.42 },
    { x: 0.34, y: 0.30 },
    { x: 0.60, y: 0.36 },
    { x: 0.82, y: 0.30 },
    { x: 0.20, y: 0.64 },
    { x: 0.48, y: 0.56 },
    { x: 0.74, y: 0.66 },
    { x: 0.12, y: 0.84 },
    { x: 0.42, y: 0.86 },
    { x: 0.70, y: 0.82 },
  ]
  const objects: PrizeObject[] = []

  for (let index = 0; index < count; index += 1) {
    const prize = pickPrize(prizes, random)
    const objectSeed = `${seed}-${index}`
    const anchor = anchors[index % anchors.length]
    let randomValue = random()
    let x = mix(left, right, anchor.x) + (random() - 0.5) * 34
    let y = mix(top, bottom, anchor.y) + (random() - 0.5) * 26
    let rotation = -15 + random() * 30
    let object = clampPrizeToField(
      createPrizeObject({ prize, id: objectSeed, x, y, rotation, randomValue }),
      bounds,
    )

    for (let attempt = 0; attempt < 12; attempt += 1) {
      const severeOverlap = objects.some(item => {
        const distance = Math.hypot(item.x - object.x, item.y - object.y)
        const minDistance = prizeSpacing(item, object)
        return distance < minDistance
      })
      const blockedExit = overlapsExitZone(object.x, object.y, object.width, object.height, goalFrame, 28)

      if (!severeOverlap && !blockedExit) break

      const jitter = 34 + attempt * 6
      randomValue = random()
      x = mix(left, right, anchor.x) + (random() - 0.5) * jitter
      y = mix(top, bottom, anchor.y) + (random() - 0.5) * jitter
      rotation = -15 + random() * 30
      object = clampPrizeToField(
        createPrizeObject({ prize, id: objectSeed, x, y, rotation, randomValue }),
        bounds,
      )
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

function hasGrabContact(object: PrizeObject, clawPointX: number, clawPointY: number) {
  const hitRadius = Math.max(object.width, object.height) * 0.55 + CLAW_GRAB_RADIUS
  const dx = clawPointX - object.x
  const dy = clawPointY - object.y
  const distance = Math.sqrt(dx * dx + dy * dy)
  const overlapsHitbox =
    clawPointX >= object.x - object.width / 2 - CLAW_GRAB_RADIUS * 0.35 &&
    clawPointX <= object.x + object.width / 2 + CLAW_GRAB_RADIUS * 0.35 &&
    clawPointY >= object.y - object.height / 2 - CLAW_GRAB_RADIUS * 0.35 &&
    clawPointY <= object.y + object.height / 2 + CLAW_GRAB_RADIUS * 0.35

  return { reached: overlapsHitbox && distance <= hitRadius, distance, hitRadius }
}

function carrySuccessChance(object: PrizeObject) {
  return clamp(1 - slipRisk(object), 0.18, 0.96)
}

function slipRisk(object: PrizeObject) {
  return clamp(
    object.slipChance + object.weight * 0.08 + rarityModifier(object.rarity) * 0.15,
    0.04,
    0.54,
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
  const [holePrizeObjectId, setHolePrizeObjectId] = useState<string | null>(null)
  const [outletPrizeObjectId, setOutletPrizeObjectId] = useState<string | null>(null)
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
  const rewardGrantedRef = useRef(false)
  const startingRef = useRef(false)
  const prizeObjectsRef = useRef<PrizeObject[]>([])
  const motionDirectionRef = useRef<1 | -1>(1)
  const motionProgressRef = useRef(0)
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

  const setPrizeObjectList = useCallback((nextObjects: PrizeObject[]) => {
    prizeObjectsRef.current = nextObjects
    setPrizeObjects(nextObjects)
  }, [])

  const clearPendingTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  const stopHorizontalMotion = useCallback(() => {
    if (motionFrameRef.current !== null) {
      cancelAnimationFrame(motionFrameRef.current)
      motionFrameRef.current = null
    }
  }, [])

  const resetHorizontalMotion = useCallback(() => {
    motionDirectionRef.current = 1
    motionProgressRef.current = 0
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
    setPrizeObjects(previous => {
      const nextObjects = previous.map(item => (
        item.id === objectId ? updater(item) : item
      ))
      prizeObjectsRef.current = nextObjects
      return nextObjects
    })
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

  const finishFailAfterSettle = useCallback((delayMs = FAIL_SETTLE_DELAY_MS) => {
    timeoutRef.current = setTimeout(finishFail, delayMs)
  }, [finishFail])

  const finishSuccess = useCallback(async (object: PrizeObject) => {
    if (!playIdRef.current || rewardGrantedRef.current || stateRef.current !== 'dispensing') return
    rewardGrantedRef.current = true

    try {
      await onPrizeWon({
        playId: playIdRef.current,
        prizeId: object.prizeId,
        prize: object.prize,
      })
      setPrizeObjectList(prizeObjectsRef.current.filter(item => item.id !== object.id))
      setAttachedPrizeObjectId(null)
      setHolePrizeObjectId(null)
      setOutletPrizeObjectId(null)
      setAttachedPrizeRotationValue(0)
      setAttachedPrizeOffsetY(CLAW_ATTACHED_OFFSET_Y)
      setClawOpen(1)
      setState('success')
      setResult({ status: 'success', prize: object.prize })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '보상을 저장하지 못했어요')
      finishFail()
    }
  }, [finishFail, onPrizeWon, setAttachedPrizeOffsetY, setClawOpen, setPrizeObjectList, setState])

  const finishDispense = useCallback((object: PrizeObject) => {
    timeoutRef.current = setTimeout(() => {
      void finishSuccess(object)
    }, RESULT_DELAY_MS)
  }, [finishSuccess])

  const animatePrizeFromOutlet = useCallback((object: PrizeObject) => {
    setState('dispensing')
    setHolePrizeObjectId(null)
    setOutletPrizeObjectId(object.id)

    const outletCenterX = goalFrame.outletX + goalFrame.outletWidth / 2
    const outletInsideY = goalFrame.outletY + goalFrame.outletHeight + 6
    const outletVisibleY = goalFrame.outletY + 7

    updatePrizeObject(object.id, item => ({
      ...item,
      x: outletCenterX,
      y: outletInsideY,
      rotation: 0,
      visualScale: 0.72,
      opacity: 0,
    }))

    runProgress(DISPENSE_MS, (progress, rawProgress) => {
      updatePrizeObject(object.id, item => ({
        ...item,
        x: outletCenterX,
        y: mix(outletInsideY, outletVisibleY, easeOutCubic(rawProgress)),
        rotation: Math.sin(rawProgress * Math.PI) * 5,
        visualScale: mix(0.72, 0.96, progress),
        opacity: mix(0, 1, progress),
      }))
    }, () => {
      finishDispense(object)
    }, easeInOutSine)
  }, [finishDispense, goalFrame.outletHeight, goalFrame.outletWidth, goalFrame.outletX, goalFrame.outletY, runProgress, setState, updatePrizeObject])

  const animatePrizeIntoHole = useCallback((object: PrizeObject) => {
    const startX = clawXRef.current
    const startY = clawDepthYRef.current + clawDropOffsetRef.current + attachedPrizeOffsetYRef.current - 8
    const targetX = goalFrame.slotX + goalFrame.slotWidth / 2
    const targetY = goalFrame.slotY + goalFrame.slotHeight / 2 + 14

    setAttachedPrizeObjectId(null)
    setHolePrizeObjectId(object.id)
    setOutletPrizeObjectId(null)
    updatePrizeObject(object.id, item => ({
      ...item,
      x: startX,
      y: startY,
      rotation: item.rotation,
      visualScale: 1,
      opacity: 1,
    }))

    runProgress(HOLE_DROP_MS, (progress, rawProgress) => {
      updatePrizeObject(object.id, item => ({
        ...item,
        x: mix(startX, targetX, progress),
        y: mix(startY, targetY, easeInQuad(rawProgress)),
        rotation: item.rotation + progress * 18,
        visualScale: mix(1, 0.45, progress),
        opacity: mix(1, 0, progress),
      }))
    }, () => {
      animatePrizeFromOutlet(object)
    }, easeInQuad)
  }, [animatePrizeFromOutlet, goalFrame.slotHeight, goalFrame.slotWidth, goalFrame.slotX, goalFrame.slotY, runProgress, updatePrizeObject])

  const carryPrizeObject = useCallback((object: PrizeObject) => {
    setState('carrying')
    setClawDropOffset(0)

    const fromX = clawXRef.current
    const fromDepthY = clawDepthYRef.current
    const shouldDrop = Math.random() > carrySuccessChance(object)
    const dropAt = 0.3 + Math.random() * 0.3
    const failedFloorY = clamp(fromDepthY + 54, floorTop + 30, floorBottom - 12)
    let dropped = false

    runProgress(CARRY_MS, (progress, rawProgress) => {
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
        finishFailAfterSettle(440)
        return
      }

      setState('droppingToExit')
      runProgress(420, (progress) => {
        setClawDropOffset(mix(0, 20, progress))
        setClawOpen(progress)
      }, () => {
        animatePrizeIntoHole(object)
      }, easeInOutSine)
    }, easeInOutSine)
  }, [animatePrizeIntoHole, exitApproachY, finishFailAfterSettle, floorBottom, floorTop, goalX, runProgress, setAttachedPrizeOffsetY, setClawDepthY, setClawDropOffset, setClawOpen, setClawX, setState, updatePrizeObject])

  const animateEmptyMiss = useCallback(() => {
    const fromOffset = clawDropOffsetRef.current
    runProgress(EMPTY_MISS_LIFT_MS, (progress) => {
      setClawDropOffset(mix(fromOffset, Math.max(0, fromOffset - 26), progress))
      setClawOpen(progress)
    }, () => {
      finishFailAfterSettle()
    }, easeInOutSine)
  }, [finishFailAfterSettle, runProgress, setClawDropOffset, setClawOpen])

  const animateFailedGrab = useCallback((object: PrizeObject) => {
    const startX = object.x
    const startY = object.y
    const drift = object.category === 'badge' ? 14 : object.category === 'sticker' ? 8 : 10
    const bounceHeight = object.category === 'squishy' ? 12 : 7

    runProgress(FAILED_GRAB_NUDGE_MS, (progress, rawProgress) => {
      const settle = Math.sin(rawProgress * Math.PI)
      setClawOpen(progress)
      updatePrizeObject(object.id, item => ({
        ...item,
        x: startX + drift * progress,
        y: startY - bounceHeight * settle + progress * 3,
        rotation: item.rotation + Math.sin(rawProgress * Math.PI * 2) * 5 + progress * 8,
        visualScale: 1,
        opacity: 1,
      }))
    }, () => {
      finishFailAfterSettle()
    }, easeInOutSine)
  }, [finishFailAfterSettle, runProgress, setClawOpen, updatePrizeObject])

  const liftClaw = useCallback((object: PrizeObject) => {
    setState('lifting')
    const fromOffset = clawDropOffsetRef.current
    const slipsOnLift = Math.random() < slipRisk(object) * 0.35
    const slipAt = 0.42 + Math.random() * 0.32
    const failedFloorY = clamp(clawDepthYRef.current + fromOffset + 74, floorTop + 36, floorBottom - 10)
    let slipped = false

    runProgress(LIFT_MS, (progress, rawProgress) => {
      setClawDropOffset(mix(fromOffset, 0, progress))
      if (slipsOnLift && rawProgress >= slipAt) {
        if (!slipped) {
          slipped = true
          setAttachedPrizeObjectId(null)
          setAttachedPrizeRotationValue(0)
          setAttachedPrizeOffsetY(CLAW_ATTACHED_OFFSET_Y)
          setClawOpen(0.65)
        }

        const slipProgress = clamp((rawProgress - slipAt) / Math.max(0.01, 1 - slipAt), 0, 1)
        updatePrizeObject(object.id, item => ({
          ...item,
          x: clawXRef.current + slipProgress * 10,
          y: mix(clawDepthYRef.current + clawDropOffsetRef.current + CLAW_ATTACHED_OFFSET_Y, failedFloorY, easeInQuad(slipProgress)),
          rotation: item.rotation + slipProgress * 24,
          visualScale: 1,
          opacity: 1,
        }))
        return
      }

      setAttachedPrizeRotationValue(Math.sin(rawProgress * Math.PI * 3.5) * 3)
      setAttachedPrizeOffsetY(CLAW_ATTACHED_OFFSET_Y + Math.abs(Math.sin(rawProgress * Math.PI * 2.5)) * 2)
    }, () => {
      if (slipped) {
        finishFailAfterSettle(440)
        return
      }

      carryPrizeObject(object)
    }, easeInOutSine)
  }, [carryPrizeObject, finishFailAfterSettle, floorBottom, floorTop, runProgress, setAttachedPrizeOffsetY, setClawDropOffset, setClawOpen, setState, updatePrizeObject])

  const findReachedPrize = useCallback((maxDropReach: number, preferredObjectId?: string | null): ReachedPrize | null => {
    const startY = clawDepthYRef.current + CLAW_CONTACT_OFFSET
    const endY = startY + maxDropReach
    const clawPointX = clawXRef.current

    return prizeObjectsRef.current
      .map(object => {
        const contactY = clamp(object.y, startY, endY)
        const contact = hasGrabContact(object, clawPointX, contactY)
        const hitRadius = contact.hitRadius
        const inDropPath = object.y >= startY - hitRadius * 0.25 && object.y <= endY + hitRadius * 0.35
        const metrics = calculateGrabChance(object, clawPointX, contactY)

        return {
          object,
          metrics,
          pathDistance: Math.max(0, object.y - startY),
          reached: inDropPath && contact.reached,
          preferred: preferredObjectId === object.id,
        }
      })
      .filter(candidate => candidate.reached)
      .sort((left, right) => (
        Number(right.preferred) - Number(left.preferred) ||
        left.metrics.distance - right.metrics.distance ||
        left.pathDistance - right.pathDistance
      ))[0] ?? null
  }, [])

  const resolveGrab = useCallback((candidate: ReachedPrize) => {
    setState('grabbing')
    const clawPoint = {
      x: clawXRef.current,
      y: clawDepthYRef.current + clawDropOffsetRef.current + CLAW_CONTACT_OFFSET,
    }
    const selected = {
      object: candidate.object,
      metrics: calculateGrabChance(candidate.object, clawPoint.x, clawPoint.y),
    }

    if (Math.random() >= selected.metrics.grabChance) {
      timeoutRef.current = setTimeout(() => animateFailedGrab(selected.object), 110)
      return
    }

    setAttachedPrizeObjectId(selected.object.id)
    timeoutRef.current = setTimeout(() => liftClaw(selected.object), 110)
  }, [animateFailedGrab, liftClaw, setState])

  const closeClaw = useCallback((candidate: ReachedPrize | null) => {
    setState('closing')
    runProgress(CLOSE_MS, (progress) => {
      setClawOpen(1 - progress)
    }, () => {
      if (!candidate) {
        timeoutRef.current = setTimeout(animateEmptyMiss, 120)
        return
      }

      resolveGrab(candidate)
    }, easeInOutSine)
  }, [animateEmptyMiss, resolveGrab, runProgress, setClawOpen, setState])

  const dropClaw = useCallback(() => {
    if (stateRef.current !== 'moving') return

    stopHorizontalMotion()
    clearPendingTimeout()
    setState('dropping')
    const fromOffset = clawDropOffsetRef.current
    const maxDropReach = clamp(floorBottom - clawDepthYRef.current - CLAW_CONTACT_OFFSET, 72, 172)
    const reachedPrize = findReachedPrize(maxDropReach)
    const dropReach = reachedPrize
      ? clamp(reachedPrize.object.y - clawDepthYRef.current - CLAW_CONTACT_OFFSET, 34, maxDropReach)
      : maxDropReach

    runProgress(DROP_MS, (progress) => {
      setClawDropOffset(mix(fromOffset, dropReach, progress))
    }, () => closeClaw(reachedPrize), easeInOutSine)
  }, [clearPendingTimeout, closeClaw, findReachedPrize, floorBottom, runProgress, setClawDropOffset, setState, stopHorizontalMotion])

  const startGame = useCallback(async () => {
    const currentState = stateRef.current
    if (startingRef.current) return
    if (
      currentState === 'moving' ||
      currentState === 'dropping' ||
      currentState === 'closing' ||
      currentState === 'grabbing' ||
      currentState === 'lifting' ||
      currentState === 'carrying' ||
      currentState === 'droppingToExit' ||
      currentState === 'dispensing'
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

    clearPendingTimeout()
    setErrorMessage(null)
    setResult(null)
    setAttachedPrizeObjectId(null)
    setHolePrizeObjectId(null)
    setOutletPrizeObjectId(null)
    setAttachedPrizeRotationValue(0)
    setAttachedPrizeOffsetY(CLAW_ATTACHED_OFFSET_Y)
    setClawOpen(1)
    rewardGrantedRef.current = false
    startingRef.current = true

    try {
      const play = await onSpendJelly()
      playIdRef.current = play.playId
      const nextObjects = buildPrizeObjects(machineWidth, machineHeight, prizePool, play.playId, goalFrame)

      setPrizeObjectList(nextObjects)
      setTimer(10)
      setClawX(leftBound)
      resetClawPose()
      resetHorizontalMotion()
      setState('moving')
    } catch (error) {
      const message = error instanceof Error ? error.message : '크레인을 시작하지 못했어요'
      setErrorMessage(message.includes('부족') ? '젤리가 부족해요' : message)
    } finally {
      startingRef.current = false
    }
  }, [clearPendingTimeout, devMode, goalFrame, jellyBalance, leftBound, machineHeight, machineWidth, onSpendJelly, prizePool, resetClawPose, resetHorizontalMotion, setAttachedPrizeOffsetY, setClawOpen, setClawX, setPrizeObjectList, setState, setTimer])

  const closeResult = useCallback(() => {
    clearPendingTimeout()
    playIdRef.current = null
    setResult(null)
    setAttachedPrizeObjectId(null)
    setHolePrizeObjectId(null)
    setOutletPrizeObjectId(null)
    setAttachedPrizeRotationValue(0)
    setAttachedPrizeOffsetY(CLAW_ATTACHED_OFFSET_Y)
    setClawX(leftBound)
    resetClawPose()
    setTimer(10)
    setState('idle')
  }, [clearPendingTimeout, leftBound, resetClawPose, setAttachedPrizeOffsetY, setClawX, setState, setTimer])

  const dismissResult = useCallback(() => {
    setResult(null)
  }, [])

  const retry = useCallback(() => {
    closeResult()
  }, [closeResult])

  useEffect(() => {
    if (stateValue !== 'idle' || machineWidth <= 0 || prizePool.length <= 0) return undefined

    setPrizeObjectList(buildPrizeObjects(machineWidth, machineHeight, prizePool, 'idle', goalFrame))
    setClawX(leftBound)
    resetClawPose()

    return undefined
  }, [goalFrame, leftBound, machineHeight, machineWidth, prizePool, resetClawPose, setClawX, setPrizeObjectList, stateValue])

  useEffect(() => {
    if (stateValue !== 'moving') return undefined

    let lastTime: number | null = null

    const tick = (time: number) => {
      if (lastTime === null) lastTime = time
      const deltaMs = Math.min(50, time - lastTime)
      lastTime = time
      movingClockRef.current += deltaMs
      motionProgressRef.current = clamp(motionProgressRef.current + deltaMs / MOVE_PASS_MS, 0, 1)

      const progress = easeInOutSine(motionProgressRef.current)
      const fromX = motionDirectionRef.current === 1 ? leftBound : playRightBound
      const toX = motionDirectionRef.current === 1 ? playRightBound : leftBound
      const bob = Math.sin(movingClockRef.current * 0.0046) * 2

      setClawX(mix(fromX, toX, progress))
      setClawDepthY(clamp(depthTop + bob, depthTop - 2, depthTop + 5))
      setClawDropOffset(0)
      setClawOpen(1)

      if (motionProgressRef.current >= 1) {
        motionDirectionRef.current = motionDirectionRef.current === 1 ? -1 : 1
        motionProgressRef.current = 0
      }

      motionFrameRef.current = requestAnimationFrame(tick)
    }

    motionFrameRef.current = requestAnimationFrame(tick)
    return () => {
      stopHorizontalMotion()
    }
  }, [depthTop, leftBound, playRightBound, setClawDepthY, setClawDropOffset, setClawOpen, setClawX, stateValue, stopHorizontalMotion])

  useEffect(() => () => {
    clearPendingTimeout()
    stopHorizontalMotion()
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current)
  }, [clearPendingTimeout, stopHorizontalMotion])

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
  const resolving =
    stateValue === 'dropping' ||
    stateValue === 'closing' ||
    stateValue === 'grabbing' ||
    stateValue === 'lifting' ||
    stateValue === 'carrying' ||
    stateValue === 'droppingToExit' ||
    stateValue === 'dispensing'

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
    holePrizeObjectId,
    outletPrizeObjectId,
    result,
    errorMessage,
    machineHeight,
    floorTop,
    floorBottom,
    railY: RAIL_Y,
    goalX,
    goalFrame,
    canStart,
    resolving,
    startGame,
    dropClaw,
    dismissResult,
    closeResult,
    retry,
  }
}
