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
  bubbleMarlang: { displayWidth: 92, displayHeight: 92, hitboxWidth: 70, hitboxHeight: 70 },
  catmarlang: { displayWidth: 74, displayHeight: 94, hitboxWidth: 56, hitboxHeight: 70 },
  chatgptImage202657031156: { displayWidth: 92, displayHeight: 122, hitboxWidth: 68, hitboxHeight: 90 },
  cloudSun: { displayWidth: 104, displayHeight: 84, hitboxWidth: 82, hitboxHeight: 64 },
  heartKeyring: { displayWidth: 74, displayHeight: 94, hitboxWidth: 56, hitboxHeight: 70 },
  keyboardMalrang: { displayWidth: 104, displayHeight: 78, hitboxWidth: 82, hitboxHeight: 58 },
  starPulse: { displayWidth: 78, displayHeight: 90, hitboxWidth: 58, hitboxHeight: 68 },
  starmarlang: { displayWidth: 78, displayHeight: 90, hitboxWidth: 58, hitboxHeight: 68 },
}

const MACHINE_DERIVATION = {
  eraseRail: { left: 188, top: 182, width: 152, height: 94 },
  eraseClaw: { left: 190, top: 242, width: 146, height: 384 },
  railPatchSource: { left: 478, top: 182, width: 152, height: 94 },
  railPatchDestination: { left: 188, top: 182 },
  carriageCrop: { left: 180, top: 182, width: 154, height: 104 },
  clawHeadCrop: { left: 205, top: 364, width: 104, height: 148 },
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
  const { width = 0, height = 0 } = await source.metadata()

  const eraseOverlay = await sharp({
    create: {
      width: MACHINE_DERIVATION.eraseRail.width,
      height: MACHINE_DERIVATION.eraseRail.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).png().toBuffer()

  const eraseClawOverlay = await sharp({
    create: {
      width: MACHINE_DERIVATION.eraseClaw.width,
      height: MACHINE_DERIVATION.eraseClaw.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).png().toBuffer()

  const railPatch = await source
    .clone()
    .extract(MACHINE_DERIVATION.railPatchSource)
    .png()
    .toBuffer()

  await source
    .clone()
    .composite([
      {
        input: eraseOverlay,
        left: MACHINE_DERIVATION.eraseRail.left,
        top: MACHINE_DERIVATION.eraseRail.top,
      },
      {
        input: eraseClawOverlay,
        left: MACHINE_DERIVATION.eraseClaw.left,
        top: MACHINE_DERIVATION.eraseClaw.top,
      },
      {
        input: railPatch,
        left: MACHINE_DERIVATION.railPatchDestination.left,
        top: MACHINE_DERIVATION.railPatchDestination.top,
      },
    ])
    .png()
    .toFile(MACHINE_BASE_OUTPUT)

  await source.clone().extract(MACHINE_DERIVATION.carriageCrop).png().toFile(CLAW_CARRIAGE_OUTPUT)
  await source.clone().extract(MACHINE_DERIVATION.clawHeadCrop).png().toFile(CLAW_HEAD_OUTPUT)

  return {
    sourceWidth: width,
    sourceHeight: height,
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
