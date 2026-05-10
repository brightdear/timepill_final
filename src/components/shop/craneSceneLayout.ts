import { CRANE_MAIN_SOURCE_SIZE } from '@/components/shop/craneAssetManifest.generated'

export const MACHINE_SOURCE_WIDTH = CRANE_MAIN_SOURCE_SIZE.width
export const MACHINE_SOURCE_HEIGHT = CRANE_MAIN_SOURCE_SIZE.height
export const CRANE_MACHINE_ASPECT_RATIO = CRANE_MAIN_SOURCE_SIZE.width / CRANE_MAIN_SOURCE_SIZE.height
export const CRANE_STAGE_HORIZONTAL_MARGIN = 12
export const CRANE_STAGE_MAX_HEIGHT = 560
export const CRANE_DEBUG_LAYOUT = false

export type ContainedImageRect = {
  scale: number
  width: number
  height: number
  renderedWidth: number
  renderedHeight: number
  offsetX: number
  offsetY: number
  x: (logicalX: number) => number
  y: (logicalY: number) => number
  size: (logicalSize: number) => number
}

export type CraneStageSize = {
  width: number
  height: number
}

export const MACHINE_REGIONS = {
  rail: {
    xMin: 235,
    xMax: 850,
    y: 264,
  },
  claw: {
    idleY: 460,
    maxDropY: 1040,
    grabPointOffsetY: 96,
  },
  playfield: {
    left: 205,
    top: 315,
    right: 888,
    bottom: 1192,
  },
  itemField: {
    left: 170,
    top: 944,
    right: 704,
    bottom: 1195,
  },
  exit: {
    x: 715,
    y: 1000,
    width: 225,
    height: 230,
    holeX: 742,
    holeY: 1038,
    holeWidth: 168,
    holeHeight: 76,
  },
  outlet: {
    x: 648,
    y: 1266,
    width: 288,
    height: 78,
  },
} as const

export function makeCoordinateMapper(
  stageWidth: number,
  stageHeight: number,
  sourceWidth = MACHINE_SOURCE_WIDTH,
  sourceHeight = MACHINE_SOURCE_HEIGHT,
): ContainedImageRect {
  if (stageWidth <= 0 || stageHeight <= 0 || sourceWidth <= 0 || sourceHeight <= 0) {
    const zero = () => 0
    return {
      scale: 0,
      width: 0,
      height: 0,
      renderedWidth: 0,
      renderedHeight: 0,
      offsetX: 0,
      offsetY: 0,
      x: zero,
      y: zero,
      size: zero,
    }
  }

  const scale = Math.min(stageWidth / sourceWidth, stageHeight / sourceHeight)
  const renderedWidth = sourceWidth * scale
  const renderedHeight = sourceHeight * scale
  const offsetX = (stageWidth - renderedWidth) / 2
  const offsetY = (stageHeight - renderedHeight) / 2

  return {
    scale,
    width: renderedWidth,
    height: renderedHeight,
    renderedWidth,
    renderedHeight,
    offsetX,
    offsetY,
    x: (logicalX: number) => offsetX + logicalX * scale,
    y: (logicalY: number) => offsetY + logicalY * scale,
    size: (logicalSize: number) => logicalSize * scale,
  }
}

export function getContainedImageRect(
  containerWidth: number,
  containerHeight: number,
  sourceWidth = MACHINE_SOURCE_WIDTH,
  sourceHeight = MACHINE_SOURCE_HEIGHT,
): ContainedImageRect {
  return makeCoordinateMapper(containerWidth, containerHeight, sourceWidth, sourceHeight)
}

export function toScreenX(logicalX: number, imageRect: ContainedImageRect) {
  return imageRect.x(logicalX)
}

export function toScreenY(logicalY: number, imageRect: ContainedImageRect) {
  return imageRect.y(logicalY)
}

export function toScreenSize(logicalSize: number, imageRect: ContainedImageRect) {
  return imageRect.size(logicalSize)
}

export function resolveCraneStageSize(
  availableWidth: number,
  maxHeight = CRANE_STAGE_MAX_HEIGHT,
): CraneStageSize {
  if (availableWidth <= 0) return { width: 0, height: 0 }

  let width = availableWidth
  let height = width / CRANE_MACHINE_ASPECT_RATIO

  if (height > maxHeight) {
    height = maxHeight
    width = height * CRANE_MACHINE_ASPECT_RATIO
  }

  return {
    width: Math.round(width),
    height: Math.round(height),
  }
}

export function resolveCraneMachineHeight(width: number, fallback = 480) {
  if (width <= 0) return fallback
  return resolveCraneStageSize(width).height
}

export function resolveCraneSourceScale(height: number) {
  return height / CRANE_MAIN_SOURCE_SIZE.height
}
