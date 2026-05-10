import { promises as fs } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const ROOT = process.cwd()
const CRANE_DIR = path.join(ROOT, 'assets', 'crane')
const ITEM_SOURCE_DIR = path.join(CRANE_DIR, 'items')
const GENERATED_DIR = path.join(CRANE_DIR, 'generated')
const GENERATED_REWARD_DIR = path.join(GENERATED_DIR, 'rewards')
const MACHINE_SOURCE = path.join(CRANE_DIR, 'crane_main.png')
const MACHINE_BASE_OUTPUT = path.join(GENERATED_DIR, 'machine_base.png')
const CLAW_CARRIAGE_OUTPUT = path.join(GENERATED_DIR, 'claw_carriage.png')
const CLAW_HEAD_OUTPUT = path.join(GENERATED_DIR, 'claw_head.png')
const MANIFEST_OUTPUT = path.join(ROOT, 'src', 'components', 'shop', 'craneAssetManifest.generated.ts')
const ALPHA_THRESHOLD = 18
const DISPLAY_OVERRIDES = {
  bubbleMarlang: { displayWidth: 138, displayHeight: 138, hitboxWidth: 105, hitboxHeight: 105 },
  catmarlang: { displayWidth: 111, displayHeight: 141, hitboxWidth: 84, hitboxHeight: 105 },
  chatgptImage202657031156: { displayWidth: 138, displayHeight: 183, hitboxWidth: 102, hitboxHeight: 135 },
  cloudSun: { displayWidth: 156, displayHeight: 126, hitboxWidth: 123, hitboxHeight: 96 },
  heartKeyring: { displayWidth: 111, displayHeight: 141, hitboxWidth: 84, hitboxHeight: 105 },
  keyboardMalrang: { displayWidth: 156, displayHeight: 117, hitboxWidth: 123, hitboxHeight: 87 },
  starPulse: { displayWidth: 117, displayHeight: 135, hitboxWidth: 87, hitboxHeight: 102 },
  starmarlang: { displayWidth: 117, displayHeight: 135, hitboxWidth: 87, hitboxHeight: 102 },
}

const MACHINE_DERIVATION = {
  eraseRail: { left: 196, top: 180, width: 164, height: 120 },
  eraseClaw: { left: 224, top: 268, width: 124, height: 372 },
  clearGlassInterior: { left: 208, top: 300, width: 668, height: 690 },
  railPatchSource: { left: 348, top: 180, width: 164, height: 120 },
  railPatchDestination: { left: 196, top: 180 },
  carriageCrop: { left: 180, top: 182, width: 154, height: 104 },
  clawHeadCrop: { left: 205, top: 364, width: 104, height: 148 },
  clawShadowCleanup: { left: 196, top: 248, width: 168, height: 392 },
}

function isCheckerboardPixel(red, green, blue, alpha) {
  if (alpha <= 4) return true
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  return max - min <= 4 && max >= 236
}

function isBackgroundCandidate(red, green, blue, alpha) {
  if (alpha <= 4) return true
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  const luminance = (red + green + blue) / 3
  const saturation = max === 0 ? 0 : (max - min) / max
  return luminance >= 228 && saturation <= 0.16
}

function stripEdgeBackground(data, width, height, channels) {
  const visited = new Uint8Array(width * height)
  const queue = []

  const push = (x, y) => {
    const index = y * width + x
    if (visited[index]) return

    const offset = index * channels
    if (!isBackgroundCandidate(data[offset], data[offset + 1], data[offset + 2], data[offset + 3])) {
      visited[index] = 1
      return
    }

    visited[index] = 1
    queue.push(index)
  }

  for (let x = 0; x < width; x += 1) {
    push(x, 0)
    push(x, height - 1)
  }

  for (let y = 1; y < height - 1; y += 1) {
    push(0, y)
    push(width - 1, y)
  }

  while (queue.length > 0) {
    const index = queue.shift()
    const x = index % width
    const y = Math.floor(index / width)
    const neighbors = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ]

    for (const [nextX, nextY] of neighbors) {
      if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue
      push(nextX, nextY)
    }
  }

  for (let index = 0; index < visited.length; index += 1) {
    if (!visited[index]) continue
    const offset = index * channels
    data[offset + 3] = 0
  }
}

function stripCheckerboardPixels(data, width, height, channels) {
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * channels
    if (isCheckerboardPixel(data[offset], data[offset + 1], data[offset + 2], data[offset + 3])) {
      data[offset + 3] = 0
    }
  }
}

function eraseRect(data, width, height, channels, rect) {
  const left = Math.max(0, rect.left)
  const top = Math.max(0, rect.top)
  const right = Math.min(width, rect.left + rect.width)
  const bottom = Math.min(height, rect.top + rect.height)

  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      data[(y * width + x) * channels + 3] = 0
    }
  }
}

function eraseDarkRect(data, width, height, channels, rect) {
  const left = Math.max(0, rect.left)
  const top = Math.max(0, rect.top)
  const right = Math.min(width, rect.left + rect.width)
  const bottom = Math.min(height, rect.top + rect.height)

  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const offset = (y * width + x) * channels
      const alpha = data[offset + 3]
      if (alpha <= 4) continue

      const red = data[offset]
      const green = data[offset + 1]
      const blue = data[offset + 2]
      const max = Math.max(red, green, blue)
      const min = Math.min(red, green, blue)
      const luminance = (red + green + blue) / 3
      const neutral = max - min <= 56

      if (luminance < 186 || (neutral && luminance < 224)) {
        data[offset + 3] = 0
      }
    }
  }
}

function copyRect(data, width, height, channels, sourceRect, destination) {
  const copy = Buffer.alloc(sourceRect.width * sourceRect.height * channels)

  for (let y = 0; y < sourceRect.height; y += 1) {
    for (let x = 0; x < sourceRect.width; x += 1) {
      const sourceX = sourceRect.left + x
      const sourceY = sourceRect.top + y
      if (sourceX < 0 || sourceX >= width || sourceY < 0 || sourceY >= height) continue

      const sourceOffset = (sourceY * width + sourceX) * channels
      const copyOffset = (y * sourceRect.width + x) * channels
      for (let channel = 0; channel < channels; channel += 1) {
        copy[copyOffset + channel] = data[sourceOffset + channel]
      }
    }
  }

  for (let y = 0; y < sourceRect.height; y += 1) {
    for (let x = 0; x < sourceRect.width; x += 1) {
      const destX = destination.left + x
      const destY = destination.top + y
      if (destX < 0 || destX >= width || destY < 0 || destY >= height) continue

      const copyOffset = (y * sourceRect.width + x) * channels
      const destOffset = (destY * width + destX) * channels
      for (let channel = 0; channel < channels; channel += 1) {
        data[destOffset + channel] = copy[copyOffset + channel]
      }
    }
  }
}

function sanitizeKey(fileName) {
  const stem = path.basename(fileName, path.extname(fileName))
  const collapsed = stem
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()

  const tokens = collapsed.split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return 'asset'

  return tokens
    .map((token, index) => {
      const lower = token.toLowerCase()
      if (index === 0) return lower
      return lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join('')
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true })
}

async function trimToAlpha(sourcePath, destinationPath) {
  const source = sharp(sourcePath).ensureAlpha()
  const { data, info } = await source.raw().toBuffer({ resolveWithObject: true })

  stripEdgeBackground(data, info.width, info.height, info.channels)

  let left = info.width
  let top = info.height
  let right = -1
  let bottom = -1

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * info.channels + 3]
      if (alpha <= ALPHA_THRESHOLD) continue
      if (x < left) left = x
      if (y < top) top = y
      if (x > right) right = x
      if (y > bottom) bottom = y
    }
  }

  if (right < left || bottom < top) {
    throw new Error(`No opaque pixels found in ${path.basename(sourcePath)}`)
  }

  const trim = {
    left,
    top,
    width: right - left + 1,
    height: bottom - top + 1,
  }

  await sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels,
    },
  })
    .extract(trim)
    .png()
    .toFile(destinationPath)

  return {
    key: sanitizeKey(path.basename(sourcePath)),
    fileName: path.basename(destinationPath),
    width: trim.width,
    height: trim.height,
    sourceWidth: info.width,
    sourceHeight: info.height,
    trimLeft: trim.left,
    trimTop: trim.top,
  }
}

async function deriveMachineAssets() {
  const source = sharp(MACHINE_SOURCE).ensureAlpha()
  const { data, info } = await source.raw().toBuffer({ resolveWithObject: true })

  stripCheckerboardPixels(data, info.width, info.height, info.channels)
  eraseDarkRect(data, info.width, info.height, info.channels, MACHINE_DERIVATION.eraseRail)
  copyRect(
    data,
    info.width,
    info.height,
    info.channels,
    MACHINE_DERIVATION.railPatchSource,
    MACHINE_DERIVATION.railPatchDestination,
  )
  eraseRect(data, info.width, info.height, info.channels, MACHINE_DERIVATION.eraseClaw)
  eraseDarkRect(data, info.width, info.height, info.channels, MACHINE_DERIVATION.clawShadowCleanup)
  eraseRect(data, info.width, info.height, info.channels, MACHINE_DERIVATION.clearGlassInterior)

  await sharp(data, {
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels,
    },
  })
    .png()
    .toFile(MACHINE_BASE_OUTPUT)

  await source.clone().extract(MACHINE_DERIVATION.carriageCrop).png().toFile(CLAW_CARRIAGE_OUTPUT)
  await source.clone().extract(MACHINE_DERIVATION.clawHeadCrop).png().toFile(CLAW_HEAD_OUTPUT)

  return {
    sourceWidth: info.width,
    sourceHeight: info.height,
  }
}

function buildManifest({ rewards, machine }) {
  const rewardEntries = rewards
    .map(asset => {
      const display = DISPLAY_OVERRIDES[asset.key] ?? {
        displayWidth: 86,
        displayHeight: 86,
        hitboxWidth: 64,
        hitboxHeight: 64,
      }

      return `  ${asset.key}: {
    source: require('../../../assets/crane/generated/rewards/${asset.fileName}'),
    width: ${asset.width},
    height: ${asset.height},
    sourceWidth: ${asset.sourceWidth},
    sourceHeight: ${asset.sourceHeight},
    trimLeft: ${asset.trimLeft},
    trimTop: ${asset.trimTop},
    trimWidth: ${asset.width},
    trimHeight: ${asset.height},
    displayWidth: ${display.displayWidth},
    displayHeight: ${display.displayHeight},
    hitboxWidth: ${display.hitboxWidth},
    hitboxHeight: ${display.hitboxHeight},
  },`
    })
    .join('\n')

  return `import type { ImageSourcePropType } from 'react-native'

export type CraneRewardAsset = {
  source: ImageSourcePropType
  width: number
  height: number
  sourceWidth: number
  sourceHeight: number
  trimLeft: number
  trimTop: number
  trimWidth: number
  trimHeight: number
  displayWidth: number
  displayHeight: number
  hitboxWidth: number
  hitboxHeight: number
}

export const CRANE_MAIN_SOURCE_SIZE = {
  width: ${machine.sourceWidth},
  height: ${machine.sourceHeight},
} as const

export const CRANE_MACHINE_SOURCE_SIZE = CRANE_MAIN_SOURCE_SIZE

export const CRANE_IMAGE_FIT_MODE = 'contain' as const

export const CRANE_MACHINE_ASSETS = {
  main: require('../../../assets/crane/crane_main.png'),
  base: require('../../../assets/crane/generated/machine_base.png'),
  carriage: require('../../../assets/crane/generated/claw_carriage.png'),
  clawHead: require('../../../assets/crane/generated/claw_head.png'),
} as const

export const CRANE_REWARD_ASSETS: Record<string, CraneRewardAsset> = {
${rewardEntries}
}
`
}

async function main() {
  await ensureDir(GENERATED_REWARD_DIR)

  const itemFiles = (await fs.readdir(ITEM_SOURCE_DIR))
    .filter(fileName => fileName.toLowerCase().endsWith('.png'))
    .sort((left, right) => left.localeCompare(right))

  const rewardAssets = []
  for (const fileName of itemFiles) {
    const sourcePath = path.join(ITEM_SOURCE_DIR, fileName)
    const outputFileName = `${sanitizeKey(fileName)}.png`
    const destinationPath = path.join(GENERATED_REWARD_DIR, outputFileName)
    rewardAssets.push(await trimToAlpha(sourcePath, destinationPath))
  }

  const machine = await deriveMachineAssets()
  const manifest = buildManifest({ rewards: rewardAssets, machine })
  await fs.writeFile(MANIFEST_OUTPUT, manifest, 'utf8')

  console.log(`Prepared ${rewardAssets.length} reward assets and crane machine derivatives.`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
