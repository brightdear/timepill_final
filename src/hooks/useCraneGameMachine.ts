import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CRANE_PLAY_COST } from '@/constants/rewards'
import { seededCraneRandom } from '@/domain/reward/craneRewards'
import type { CranePrize } from '@/domain/reward/repository'
import {
  MACHINE_REGIONS,
  MACHINE_SOURCE_HEIGHT,
} from '@/components/shop/craneSceneLayout'
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
  status: 'success'
  prize: CranePrize
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
  poolSeed: string
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

const DEFAULT_MACHINE_HEIGHT = MACHINE_SOURCE_HEIGHT
const ROUND_TIME_SECONDS = 6.8
const CLAW_ATTACHED_OFFSET_SOURCE_Y = 104
const CLAW_GRAB_RADIUS = 32
const CLAW_CONTACT_OFFSET_SOURCE_Y = MACHINE_REGIONS.claw.grabPointOffsetY
const MOVE_PASS_MS = 2800
const DROP_MS = 620
const CLOSE_MS = 250
const LIFT_MS = 760
const CARRY_MS = 1160
const HOLE_DROP_MS = 520
const DISPENSE_MS = 420
const RESULT_DELAY_MS = 240
const FAIL_SETTLE_DELAY_MS = 280
const EMPTY_MISS_LIFT_MS = 420
const FAILED_GRAB_NUDGE_MS = 480

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

function makePlaySeed() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function buildGoalFrame(): CraneGoalFrame {
  const exit = MACHINE_REGIONS.exit
  const outlet = MACHINE_REGIONS.outlet
  const x = exit.x
  const y = exit.y
  const width = exit.width
  const height = exit.height
  const slotX = exit.holeX
  const slotY = exit.holeY
  const slotWidth = exit.holeWidth
  const slotHeight = exit.holeHeight
  const outletX = outlet.x
  const outletY = outlet.y
  const outletWidth = outlet.width
  const outletHeight = outlet.height

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
      left: slotX - 16,
      right: slotX + slotWidth + 16,
      top: slotY - 12,
      bottom: slotY + slotHeight + 36,
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
  const largeObjectBonus = Math.max(0, Math.max(leftSize, rightSize) - 130) * 0.18
  return (leftSize + rightSize) * 0.34 + largeObjectBonus
}

function clampPrizeToField(object: PrizeObject, bounds: { left: number; right: number; top: number; bottom: number }) {
  return {
    ...object,
    x: clamp(object.x, bounds.left + object.width / 2, bounds.right - object.width / 2),
    y: clamp(object.y, bounds.top + object.height / 2, bounds.bottom - object.height / 2),
  }
}

function clonePrizeObjects(objects: PrizeObject[]) {
  return objects.map(object => ({ ...object }))
}

const DEFAULT_PRIZE_LAYOUT = [
  { x: 252, y: 1118, rotation: -7, jitterX: 20, jitterY: 12 },
  { x: 430, y: 1102, rotation: 6, jitterX: 18, jitterY: 10 },
  { x: 604, y: 1126, rotation: -6, jitterX: 16, jitterY: 12 },
  { x: 292, y: 1006, rotation: 8, jitterX: 16, jitterY: 10 },
  { x: 468, y: 988, rotation: -10, jitterX: 14, jitterY: 10 },
  { x: 630, y: 1014, rotation: 7, jitterX: 12, jitterY: 8 },
] as const

function buildPrizeObjects(
  prizes: CranePrize[],
  seed: string,
  goalFrame: CraneGoalFrame,
): PrizeObject[] {
  if (prizes.length === 0) return []

  const random = seededCraneRandom(seed)
  const bounds = {
    left: MACHINE_REGIONS.itemField.left,
    right: MACHINE_REGIONS.itemField.right,
    top: MACHINE_REGIONS.itemField.top,
    bottom: MACHINE_REGIONS.itemField.bottom,
  }

  return prizes.slice(0, DEFAULT_PRIZE_LAYOUT.length).map((prize, index) => {
    const layout = DEFAULT_PRIZE_LAYOUT[index] ?? DEFAULT_PRIZE_LAYOUT[DEFAULT_PRIZE_LAYOUT.length - 1]
    const jitterX = mix(-layout.jitterX, layout.jitterX, random())
    const jitterY = mix(-layout.jitterY, layout.jitterY, random())
    const randomValue = random()
    let object = clampPrizeToField(
      createPrizeObject({
        prize,
        id: `${seed}-${prize.id}-${index}`,
        x: layout.x + jitterX,
        y: layout.y + jitterY,
        rotation: layout.rotation + mix(-4, 4, random()),
        randomValue,
      }),
      bounds,
    )

    if (overlapsExitZone(object.x, object.y, object.width, object.height, goalFrame, 20)) {
      object = clampPrizeToField({ ...object, x: object.x - object.width * 0.9 }, bounds)
    }

    return object
  }).sort((leftObject, rightObject) => leftObject.y - rightObject.y)
}

function calculateGrabChance(object: PrizeObject, clawPointX: number, clawPointY: number) {
  const hitbox = prizeHitboxSize(object)
  const dx = Math.abs(clawPointX - object.x)
  const dy = Math.abs(clawPointY - object.y)
  const distance = Math.sqrt(dx * dx + dy * dy)
  const maxGrabDistance = Math.max(hitbox.width, hitbox.height) * 0.55 + CLAW_GRAB_RADIUS
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

function prizeHitboxSize(object: PrizeObject) {
  return {
    width: object.hitboxWidth,
    height: object.hitboxHeight,
  }
}

function hasGrabContact(object: PrizeObject, clawPointX: number, clawPointY: number) {
  const hitbox = prizeHitboxSize(object)
  const hitRadius = Math.max(hitbox.width, hitbox.height) * 0.55 + CLAW_GRAB_RADIUS
  const dx = clawPointX - object.x
  const dy = clawPointY - object.y
  const distance = Math.sqrt(dx * dx + dy * dy)
  const overlapsHitbox =
    clawPointX >= object.x - hitbox.width / 2 - CLAW_GRAB_RADIUS * 0.35 &&
    clawPointX <= object.x + hitbox.width / 2 + CLAW_GRAB_RADIUS * 0.35 &&
    clawPointY >= object.y - hitbox.height / 2 - CLAW_GRAB_RADIUS * 0.35 &&
    clawPointY <= object.y + hitbox.height / 2 + CLAW_GRAB_RADIUS * 0.35

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
  poolSeed,
  prizePool,
  onSpendJelly,
  onPrizeWon,
}: UseCraneGameMachineParams) {
  const [stateValue, setStateValue] = useState<CraneGameState>('idle')
  const [timerValue, setTimerValue] = useState(ROUND_TIME_SECONDS)
  const [clawXValue, setClawXValue] = useState(0)
  const [clawDepthYValue, setClawDepthYValue] = useState(0)
  const [clawDropOffsetValue, setClawDropOffsetValue] = useState(0)
  const [clawOpenValue, setClawOpenValue] = useState(1)
  const [attachedPrizeRotationValue, setAttachedPrizeRotationValue] = useState(0)
  const [attachedPrizeOffsetYValue, setAttachedPrizeOffsetYValue] = useState(0)
  const [attachedPrizeOffsetXValue, setAttachedPrizeOffsetXValue] = useState(0)
  const [prizeObjects, setPrizeObjects] = useState<PrizeObject[]>([])
  const [attachedPrizeObjectId, setAttachedPrizeObjectId] = useState<string | null>(null)
  const [holePrizeObjectId, setHolePrizeObjectId] = useState<string | null>(null)
  const [outletPrizeObjectId, setOutletPrizeObjectId] = useState<string | null>(null)
  const [result, setResult] = useState<CraneResult | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const stateRef = useRef<CraneGameState>('idle')
  const timerRef = useRef(ROUND_TIME_SECONDS)
  const clawXRef = useRef(0)
  const clawDepthYRef = useRef(0)
  const clawDropOffsetRef = useRef(0)
  const clawOpenRef = useRef(1)
  const attachedPrizeOffsetYRef = useRef(0)
  const attachedPrizeOffsetXRef = useRef(0)
  const animationFrameRef = useRef<number | null>(null)
  const motionFrameRef = useRef<number | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const playIdRef = useRef<string | null>(null)
  const rewardGrantedRef = useRef(false)
  const startingRef = useRef(false)
  const prizeObjectsRef = useRef<PrizeObject[]>([])
  const baselinePrizeObjectsRef = useRef<PrizeObject[]>([])
  const motionDirectionRef = useRef<1 | -1>(1)
  const motionProgressRef = useRef(0)
  const movingClockRef = useRef(0)

  const railY = MACHINE_REGIONS.rail.y
  const depthTop = MACHINE_REGIONS.claw.idleY
  const floorTop = MACHINE_REGIONS.itemField.top
  const floorBottom = MACHINE_REGIONS.itemField.bottom
  const leftBound = MACHINE_REGIONS.rail.xMin
  const rightBound = MACHINE_REGIONS.rail.xMax
  const depthBottom = MACHINE_REGIONS.claw.maxDropY
  const goalFrame = useMemo(() => buildGoalFrame(), [])
  const goalX = goalFrame.slotX + goalFrame.slotWidth / 2
  const exitApproachY = goalFrame.y - 18
  const attachedPrizeRestOffset = CLAW_ATTACHED_OFFSET_SOURCE_Y
  const clawContactOffset = CLAW_CONTACT_OFFSET_SOURCE_Y
  const playRightBound = rightBound

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

  const setAttachedPrizeOffsetX = useCallback((nextOffset: number) => {
    attachedPrizeOffsetXRef.current = nextOffset
    setAttachedPrizeOffsetXValue(nextOffset)
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
    setAttachedPrizeOffsetY(attachedPrizeRestOffset)
    setAttachedPrizeOffsetX(0)
  }, [attachedPrizeRestOffset, depthTop, setAttachedPrizeOffsetX, setAttachedPrizeOffsetY, setClawDepthY, setClawDropOffset, setClawOpen])

  const buildBaselineBoard = useCallback(() => {
    if (machineWidth <= 0 || prizePool.length === 0) return []

    const nextObjects = buildPrizeObjects(prizePool, poolSeed || makePlaySeed(), goalFrame)
    baselinePrizeObjectsRef.current = clonePrizeObjects(nextObjects)
    return nextObjects
  }, [goalFrame, machineWidth, poolSeed, prizePool])

  const ensureBaselineBoard = useCallback(() => {
    if (baselinePrizeObjectsRef.current.length > 0) return baselinePrizeObjectsRef.current
    return buildBaselineBoard()
  }, [buildBaselineBoard])

  const restoreRound = useCallback((nextState: CraneGameState) => {
    const baselineObjects = ensureBaselineBoard()
    playIdRef.current = null
    rewardGrantedRef.current = false
    setAttachedPrizeObjectId(null)
    setHolePrizeObjectId(null)
    setOutletPrizeObjectId(null)
    setPrizeObjectList(clonePrizeObjects(baselineObjects))
    setTimer(ROUND_TIME_SECONDS)
    setClawX(leftBound)
    resetClawPose()
    resetHorizontalMotion()
    setState(nextState)
  }, [ensureBaselineBoard, leftBound, resetClawPose, resetHorizontalMotion, setClawX, setPrizeObjectList, setState, setTimer])

  const finishFail = useCallback(() => {
    setResult(null)
    restoreRound('idle')
  }, [restoreRound])

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
      setResult({ status: 'success', prize: object.prize })
      restoreRound('success')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '보상을 저장하지 못했어요')
      finishFail()
    }
  }, [finishFail, onPrizeWon, restoreRound])

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
    const startX = clawXRef.current + attachedPrizeOffsetXRef.current
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
    const failedFloorY = clamp(fromDepthY + attachedPrizeRestOffset + 10, floorTop + 30, floorBottom - 12)
    let dropped = false

    runProgress(CARRY_MS, (progress, rawProgress) => {
      const nextX = mix(fromX, goalX, progress)
      const nextDepthY = mix(fromDepthY, exitApproachY, progress) - Math.sin(rawProgress * Math.PI) * 18

      const carrySway = Math.sin(rawProgress * Math.PI * 7) * mix(14, 4, progress)
      const carryLiftBob = Math.abs(Math.sin(rawProgress * Math.PI * 5)) * mix(6, 2, progress)

      setClawX(nextX)
      setClawDepthY(nextDepthY)

      if (!shouldDrop || rawProgress < dropAt) {
        setAttachedPrizeOffsetX(carrySway)
        setAttachedPrizeRotationValue(carrySway * 0.54 + Math.sin(rawProgress * Math.PI * 4.4) * 2.6)
        setAttachedPrizeOffsetY(attachedPrizeRestOffset + carryLiftBob)
        return
      }

      if (!dropped) {
        dropped = true
        setAttachedPrizeObjectId(null)
        setAttachedPrizeRotationValue(0)
        setAttachedPrizeOffsetY(attachedPrizeRestOffset)
        setAttachedPrizeOffsetX(0)
      }

      const slipProgress = clamp((rawProgress - dropAt) / (1 - dropAt), 0, 1)
      const bounce = slipProgress > 0.8
        ? Math.sin(((slipProgress - 0.8) / 0.2) * Math.PI) * (1 - slipProgress) * 10
        : 0

      updatePrizeObject(object.id, item => ({
        ...item,
        x: mix(nextX, nextX + 14, slipProgress),
        y: mix(nextDepthY + attachedPrizeRestOffset, failedFloorY, easeInQuad(slipProgress)) - bounce,
        rotation: item.rotation + slipProgress * 28,
        visualScale: 1,
        opacity: 1,
      }))
    }, () => {
      setAttachedPrizeRotationValue(0)
      setAttachedPrizeOffsetY(attachedPrizeRestOffset)
      setAttachedPrizeOffsetX(0)

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
  }, [animatePrizeIntoHole, attachedPrizeRestOffset, exitApproachY, finishFailAfterSettle, floorBottom, floorTop, goalX, runProgress, setAttachedPrizeOffsetX, setAttachedPrizeOffsetY, setClawDepthY, setClawDropOffset, setClawOpen, setClawX, setState, updatePrizeObject])

  const animateEmptyMiss = useCallback(() => {
    const fromOffset = clawDropOffsetRef.current
    setAttachedPrizeOffsetX(0)
    runProgress(EMPTY_MISS_LIFT_MS, (progress) => {
      setClawDropOffset(mix(fromOffset, Math.max(0, fromOffset - 26), progress))
      setClawOpen(progress)
    }, () => {
      finishFailAfterSettle()
    }, easeInOutSine)
  }, [finishFailAfterSettle, runProgress, setAttachedPrizeOffsetX, setClawDropOffset, setClawOpen])

  const animateFailedGrab = useCallback((object: PrizeObject) => {
    const startX = object.x
    setAttachedPrizeOffsetX(0)
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
  }, [finishFailAfterSettle, runProgress, setAttachedPrizeOffsetX, setClawOpen, updatePrizeObject])

  const liftClaw = useCallback((object: PrizeObject) => {
    setState('lifting')
    const fromOffset = clawDropOffsetRef.current
    const slipsOnLift = Math.random() < slipRisk(object) * 0.35
    const slipAt = 0.42 + Math.random() * 0.32
    const failedFloorY = clamp(clawDepthYRef.current + fromOffset + attachedPrizeRestOffset + 16, floorTop + 36, floorBottom - 10)
    let slipped = false

    runProgress(LIFT_MS, (progress, rawProgress) => {
      setClawDropOffset(mix(fromOffset, 0, progress))
      if (slipsOnLift && rawProgress >= slipAt) {
        if (!slipped) {
          slipped = true
          setAttachedPrizeObjectId(null)
          setAttachedPrizeRotationValue(0)
          setAttachedPrizeOffsetY(attachedPrizeRestOffset)
          setAttachedPrizeOffsetX(0)
          setClawOpen(0.65)
        }

        const slipProgress = clamp((rawProgress - slipAt) / Math.max(0.01, 1 - slipAt), 0, 1)
        updatePrizeObject(object.id, item => ({
          ...item,
          x: clawXRef.current + slipProgress * 10,
          y: mix(clawDepthYRef.current + clawDropOffsetRef.current + attachedPrizeRestOffset, failedFloorY, easeInQuad(slipProgress)),
          rotation: item.rotation + slipProgress * 24,
          visualScale: 1,
          opacity: 1,
        }))
        return
      }

      const liftSway = Math.sin(rawProgress * Math.PI * 5.4) * mix(13, 4, progress)
      const liftBob = Math.abs(Math.sin(rawProgress * Math.PI * 3.2)) * mix(5, 2, progress)
      setAttachedPrizeOffsetX(liftSway)
      setAttachedPrizeRotationValue(liftSway * 0.5 + Math.sin(rawProgress * Math.PI * 3.8) * 2)
      setAttachedPrizeOffsetY(attachedPrizeRestOffset + liftBob)
    }, () => {
      if (slipped) {
        setAttachedPrizeOffsetX(0)
        finishFailAfterSettle(440)
        return
      }

      carryPrizeObject(object)
    }, easeInOutSine)
  }, [attachedPrizeRestOffset, carryPrizeObject, finishFailAfterSettle, floorBottom, floorTop, runProgress, setAttachedPrizeOffsetX, setAttachedPrizeOffsetY, setClawDropOffset, setClawOpen, setState, updatePrizeObject])

  const findReachedPrize = useCallback((maxDropReach: number, preferredObjectId?: string | null): ReachedPrize | null => {
    const startY = clawDepthYRef.current + clawContactOffset
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
  }, [clawContactOffset])

  const resolveGrab = useCallback((candidate: ReachedPrize) => {
    setState('grabbing')
    const clawPoint = {
      x: clawXRef.current,
      y: clawDepthYRef.current + clawDropOffsetRef.current + clawContactOffset,
    }
    const selected = {
      object: candidate.object,
      metrics: calculateGrabChance(candidate.object, clawPoint.x, clawPoint.y),
    }

    if (Math.random() >= selected.metrics.grabChance) {
      timeoutRef.current = setTimeout(() => animateFailedGrab(selected.object), 110)
      return
    }

    setAttachedPrizeOffsetX(0)
    setAttachedPrizeObjectId(selected.object.id)
    timeoutRef.current = setTimeout(() => liftClaw(selected.object), 110)
  }, [animateFailedGrab, clawContactOffset, liftClaw, setAttachedPrizeOffsetX, setState])

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
    const maxDropReach = clamp(
      floorBottom - clawDepthYRef.current - clawContactOffset,
      120,
      depthBottom - clawDepthYRef.current,
    )
    const reachedPrize = findReachedPrize(maxDropReach)
    const dropReach = reachedPrize
      ? clamp(reachedPrize.object.y - clawDepthYRef.current - clawContactOffset, 34, maxDropReach)
      : maxDropReach

    runProgress(DROP_MS, (progress) => {
      setClawDropOffset(mix(fromOffset, dropReach, progress))
    }, () => closeClaw(reachedPrize), easeInOutSine)
  }, [clawContactOffset, clearPendingTimeout, closeClaw, depthBottom, findReachedPrize, floorBottom, runProgress, setClawDropOffset, setState, stopHorizontalMotion])

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
    rewardGrantedRef.current = false
    startingRef.current = true

    try {
      const play = await onSpendJelly()
      playIdRef.current = play.playId
      const nextObjects = ensureBaselineBoard()

      setPrizeObjectList(clonePrizeObjects(nextObjects))
      setTimer(ROUND_TIME_SECONDS)
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
  }, [clearPendingTimeout, devMode, ensureBaselineBoard, jellyBalance, leftBound, machineWidth, onSpendJelly, prizePool.length, resetClawPose, resetHorizontalMotion, setClawX, setPrizeObjectList, setState, setTimer])

  const closeResult = useCallback(() => {
    setResult(null)
    restoreRound('idle')
  }, [restoreRound])

  const dismissResult = useCallback(() => {
    setResult(null)
    restoreRound('idle')
  }, [restoreRound])

  const retry = useCallback(() => {
    clearPendingTimeout()
    setResult(null)
    setErrorMessage(null)
    restoreRound('idle')
  }, [clearPendingTimeout, restoreRound])

  useEffect(() => {
    if ((stateValue !== 'idle' && stateValue !== 'success') || machineWidth <= 0 || prizePool.length <= 0) return undefined

    const nextBaseline = buildBaselineBoard()
    setPrizeObjectList(clonePrizeObjects(nextBaseline))
    setClawX(leftBound)
    resetClawPose()

    return undefined
  }, [buildBaselineBoard, leftBound, machineWidth, prizePool.length, resetClawPose, setClawX, setPrizeObjectList, stateValue])

  useEffect(() => {
    if (stateValue !== 'moving') return undefined

    let lastTime: number | null = null

    const tick = (time: number) => {
      if (lastTime === null) lastTime = time
      const deltaMs = Math.min(50, time - lastTime)
      lastTime = time
      movingClockRef.current += deltaMs
      const nextTimer = Math.max(0, ROUND_TIME_SECONDS - movingClockRef.current / 1000)
      motionProgressRef.current = clamp(motionProgressRef.current + deltaMs / MOVE_PASS_MS, 0, 1)

      const progress = easeInOutSine(motionProgressRef.current)
      const fromX = motionDirectionRef.current === 1 ? leftBound : playRightBound
      const toX = motionDirectionRef.current === 1 ? playRightBound : leftBound
      const bob = Math.sin(movingClockRef.current * 0.0046) * 2

      setTimer(Math.round(nextTimer * 10) / 10)
      setClawX(mix(fromX, toX, progress))
      setClawDepthY(clamp(depthTop + bob, depthTop - 2, depthTop + 5))
      setClawDropOffset(0)
      setClawOpen(1)

      if (nextTimer <= 0) {
        dropClaw()
        return
      }

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
  }, [depthTop, dropClaw, leftBound, playRightBound, setClawDepthY, setClawDropOffset, setClawOpen, setClawX, setTimer, stateValue, stopHorizontalMotion])

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
    const depthRatio = clamp((clawDepthYValue + clawDropOffsetValue - depthTop) / Math.max(1, depthBottom - depthTop), 0, 1)
    const dropRatio = clamp(clawDropOffsetValue / Math.max(1, depthBottom - depthTop), 0, 1)

    return {
      x: clawXValue + (((clawXValue - leftBound) / Math.max(1, rightBound - leftBound)) - 0.5) * mix(8, 22, depthRatio),
      y: mix(floorTop + 24, floorBottom - 64, depthRatio) + dropRatio * 12,
      scale: mix(0.58, 0.94, depthRatio) + dropRatio * 0.22,
      opacity: clamp(mix(0.08, 0.16, depthRatio) + dropRatio * 0.08, 0.08, 0.28),
    }
  }, [clawDepthYValue, clawDropOffsetValue, clawXValue, depthBottom, depthTop, floorBottom, floorTop, leftBound, rightBound])

  const clawScale = useMemo(() => {
    const depthRatio = clamp((clawDepthYValue + clawDropOffsetValue - depthTop) / Math.max(1, depthBottom - depthTop), 0, 1)
    const dropRatio = clamp(clawDropOffsetValue / Math.max(1, depthBottom - depthTop), 0, 1)
    return mix(0.94, 1.04, depthRatio) + dropRatio * 0.03
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
    attachedPrizeOffsetX: attachedPrizeOffsetXValue,
    prizeObjects,
    attachedPrizeObjectId,
    holePrizeObjectId,
    outletPrizeObjectId,
    result,
    errorMessage,
    machineHeight,
    floorTop,
    floorBottom,
    railY,
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
