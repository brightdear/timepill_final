import { promises as fs } from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const ROOT = process.cwd()
const CRANE_DIR = path.join(ROOT, 'assets', 'crane')
const GENERATED_DIR = path.join(CRANE_DIR, 'generated')
const GENERATED_REWARD_DIR = path.join(GENERATED_DIR, 'rewards')
const MACHINE_SOURCE = path.join(CRANE_DIR, 'crane_main.png')
const MACHINE_BASE_OUTPUT = path.join(GENERATED_DIR, 'machine_base.png')
const CLAW_CARRIAGE_OUTPUT = path.join(GENERATED_DIR, 'claw_carriage.png')
const CLAW_HEAD_OUTPUT = path.join(GENERATED_DIR, 'claw_head.png')
const MANIFEST_OUTPUT = path.join(ROOT, 'src', 'components', 'shop', 'craneAssetManifest.generated.ts')
const ALPHA_THRESHOLD = 18
const SVG_RENDER_DENSITY = 216
const BORDER_SAMPLE_STEP = 12
const MIN_BACKGROUND_TOLERANCE = 18
const MAX_BACKGROUND_TOLERANCE = 52
const MIN_LOCAL_TOLERANCE = 12
const MAX_LOCAL_TOLERANCE = 28
const HALO_PASSES = 2

const ITEM_SOURCE_DIRS = [
  {
    sourceType: 'normal',
    dirPath: path.join(CRANE_DIR, 'items'),
  },
  {
    sourceType: 'day',
    dirPath: path.join(CRANE_DIR, 'items_day'),
  },
]

const DISPLAY_OVERRIDES = {
  bubbleMarlang: { displayWidth: 138, displayHeight: 138, hitboxWidth: 105, hitboxHeight: 105 },
  catmarlang: { displayWidth: 111, displayHeight: 141, hitboxWidth: 84, hitboxHeight: 105 },
  cloudSun: { displayWidth: 148, displayHeight: 120, hitboxWidth: 114, hitboxHeight: 92 },
  heartKeyring: { displayWidth: 111, displayHeight: 141, hitboxWidth: 84, hitboxHeight: 105 },
  keyboardMalrang: { displayWidth: 156, displayHeight: 117, hitboxWidth: 123, hitboxHeight: 87 },
  starmarlang: { displayWidth: 117, displayHeight: 135, hitboxWidth: 87, hitboxHeight: 102 },
}

const EXTRACTION_OVERRIDES = {
  'cloud_sun.png': {
    removeLargestBluePlate: true,
  },
}

const MACHINE_DERIVATION = {
  eraseRail: { left: 196, top: 180, width: 164, height: 120 },
  eraseClaw: { left: 224, top: 268, width: 124, height: 372 },
  clearGlassInterior: { left: 208, top: 300, width: 668, height: 690 },
  railPatchSource: { left: 348, top: 180, width: 164, height: 120 },
  railPatchDestination: { left: 196, top: 180 },
  clawShadowCleanup: { left: 196, top: 248, width: 168, height: 392 },
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function isCheckerboardPixel(red, green, blue, alpha) {
  if (alpha <= 4) return true
  const max = Math.max(red, green, blue)
  const min = Math.min(red, green, blue)
  return max - min <= 4 && max >= 236
}

function colorDistance(red, green, blue, target) {
  const dr = red - target.red
  const dg = green - target.green
  const db = blue - target.blue
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

function collectBorderSamples(data, width, height, channels) {
  const samples = []
  const push = (x, y) => {
    const offset = (y * width + x) * channels
    const alpha = data[offset + 3]
    if (alpha <= 4) return
    samples.push({
      red: data[offset],
      green: data[offset + 1],
      blue: data[offset + 2],
    })
  }

  for (let x = 0; x < width; x += BORDER_SAMPLE_STEP) {
    push(x, 0)
    push(x, height - 1)
  }

  for (let y = 0; y < height; y += BORDER_SAMPLE_STEP) {
    push(0, y)
    push(width - 1, y)
  }

  push(0, 0)
  push(width - 1, 0)
  push(0, height - 1)
  push(width - 1, height - 1)

  return samples
}

function buildBackgroundModel(data, width, height, channels) {
  const samples = collectBorderSamples(data, width, height, channels)
  if (samples.length === 0) {
    return {
      mean: { red: 255, green: 255, blue: 255 },
      tolerance: 24,
      localTolerance: 14,
      haloTolerance: 30,
    }
  }

  const mean = samples.reduce((accumulator, sample) => ({
    red: accumulator.red + sample.red,
    green: accumulator.green + sample.green,
    blue: accumulator.blue + sample.blue,
  }), { red: 0, green: 0, blue: 0 })

  mean.red /= samples.length
  mean.green /= samples.length
  mean.blue /= samples.length

  const maxSampleDistance = samples.reduce((maxDistance, sample) => (
    Math.max(maxDistance, colorDistance(sample.red, sample.green, sample.blue, mean))
  ), 0)

  const tolerance = clamp(maxSampleDistance + 12, MIN_BACKGROUND_TOLERANCE, MAX_BACKGROUND_TOLERANCE)
  const localTolerance = clamp(Math.round(tolerance * 0.58), MIN_LOCAL_TOLERANCE, MAX_LOCAL_TOLERANCE)

  return {
    mean,
    tolerance,
    localTolerance,
    haloTolerance: clamp(tolerance + 6, tolerance, MAX_BACKGROUND_TOLERANCE + 10),
  }
}

function shouldStripBackgroundPixel(data, channels, index, parentIndex, model) {
  const offset = index * channels
  const alpha = data[offset + 3]
  if (alpha <= 4) return true

  const red = data[offset]
  const green = data[offset + 1]
  const blue = data[offset + 2]
  if (colorDistance(red, green, blue, model.mean) > model.tolerance) {
    return false
  }

  if (parentIndex >= 0) {
    const parentOffset = parentIndex * channels
    const localDistance = colorDistance(
      red,
      green,
      blue,
      {
        red: data[parentOffset],
        green: data[parentOffset + 1],
        blue: data[parentOffset + 2],
      },
    )
    if (localDistance > model.localTolerance) {
      return false
    }
  }

  return true
}

function stripBackgroundHalo(data, width, height, channels, model) {
  for (let pass = 0; pass < HALO_PASSES; pass += 1) {
    const indicesToClear = []

    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const index = y * width + x
        const offset = index * channels
        if (data[offset + 3] <= ALPHA_THRESHOLD) continue

        const red = data[offset]
        const green = data[offset + 1]
        const blue = data[offset + 2]
        if (colorDistance(red, green, blue, model.mean) > model.haloTolerance) continue

        let transparentNeighbors = 0
        const neighbors = [
          index - 1,
          index + 1,
          index - width,
          index + width,
          index - width - 1,
          index - width + 1,
          index + width - 1,
          index + width + 1,
        ]

        for (const neighborIndex of neighbors) {
          if (data[neighborIndex * channels + 3] <= 4) {
            transparentNeighbors += 1
          }
        }

        if (transparentNeighbors >= 3) {
          indicesToClear.push(index)
        }
      }
    }

    if (indicesToClear.length === 0) {
      return
    }

    for (const index of indicesToClear) {
      data[index * channels + 3] = 0
    }
  }
}

function stripEdgeBackground(data, width, height, channels) {
  const model = buildBackgroundModel(data, width, height, channels)
  const visited = new Uint8Array(width * height)
  const queue = new Int32Array(width * height)
  let head = 0
  let tail = 0

  const push = (x, y, parentIndex = -1) => {
    const index = y * width + x
    if (visited[index]) return
    visited[index] = 1

    if (!shouldStripBackgroundPixel(data, channels, index, parentIndex, model)) {
      return
    }

    queue[tail] = index
    tail += 1
  }

  for (let x = 0; x < width; x += 1) {
    push(x, 0)
    push(x, height - 1)
  }

  for (let y = 1; y < height - 1; y += 1) {
    push(0, y)
    push(width - 1, y)
  }

  while (head < tail) {
    const index = queue[head]
    head += 1

    const x = index % width
    const y = Math.floor(index / width)
    if (x > 0) push(x - 1, y, index)
    if (x < width - 1) push(x + 1, y, index)
    if (y > 0) push(x, y - 1, index)
    if (y < height - 1) push(x, y + 1, index)
  }

  for (let index = 0; index < visited.length; index += 1) {
    if (!visited[index]) continue
    const offset = index * channels
    if (shouldStripBackgroundPixel(data, channels, index, -1, model)) {
      data[offset + 3] = 0
    }
  }

  stripBackgroundHalo(data, width, height, channels, model)
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

function findLargestConnectedComponent(mask, width, height) {
  const visited = new Uint8Array(mask.length)
  const queue = new Int32Array(mask.length)
  let largestComponent = []

  for (let startIndex = 0; startIndex < mask.length; startIndex += 1) {
    if (!mask[startIndex] || visited[startIndex]) continue

    let head = 0
    let tail = 0
    const component = []
    visited[startIndex] = 1
    queue[tail] = startIndex
    tail += 1

    while (head < tail) {
      const index = queue[head]
      head += 1
      component.push(index)

      const x = index % width
      const y = Math.floor(index / width)
      const neighbors = []

      if (x > 0) neighbors.push(index - 1)
      if (x < width - 1) neighbors.push(index + 1)
      if (y > 0) neighbors.push(index - width)
      if (y < height - 1) neighbors.push(index + width)

      for (const neighborIndex of neighbors) {
        if (!mask[neighborIndex] || visited[neighborIndex]) continue
        visited[neighborIndex] = 1
        queue[tail] = neighborIndex
        tail += 1
      }
    }

    if (component.length > largestComponent.length) {
      largestComponent = component
    }
  }

  return largestComponent
}

function stripLargestBluePlate(data, width, height, channels) {
  const mask = new Uint8Array(width * height)

  for (let index = 0; index < width * height; index += 1) {
    const offset = index * channels
    const alpha = data[offset + 3]
    if (alpha <= ALPHA_THRESHOLD) continue

    const red = data[offset]
    const green = data[offset + 1]
    const blue = data[offset + 2]
    const max = Math.max(red, green, blue)
    const min = Math.min(red, green, blue)
    const saturation = max === 0 ? 0 : (max - min) / max
    const luminance = (red + green + blue) / 3

    const isBackingBlue = (
      blue >= red + 12 &&
      blue >= green + 4 &&
      saturation >= 0.1 &&
      luminance >= 105 &&
      luminance <= 245
    )

    if (isBackingBlue) {
      mask[index] = 1
    }
  }

  const largestComponent = findLargestConnectedComponent(mask, width, height)
  if (largestComponent.length < width * height * 0.035) {
    return
  }

  for (const index of largestComponent) {
    data[index * channels + 3] = 0
  }
}

function applyExtractionOverride(sourceFileName, data, width, height, channels) {
  const override = EXTRACTION_OVERRIDES[sourceFileName]
  if (!override) return

  if (override.removeLargestBluePlate) {
    stripLargestBluePlate(data, width, height, channels)
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

function resolveAlphaTrim(data, info) {
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
    return null
  }

  return {
    left,
    top,
    width: right - left + 1,
    height: bottom - top + 1,
  }
}

async function trimToAlpha(sourcePath, destinationPath) {
  const source = sharp(sourcePath).ensureAlpha()
  const { data, info } = await source.raw().toBuffer({ resolveWithObject: true })

  stripEdgeBackground(data, info.width, info.height, info.channels)
  applyExtractionOverride(path.basename(sourcePath), data, info.width, info.height, info.channels)

  const trim = resolveAlphaTrim(data, info)
  if (!trim) {
    throw new Error(`No opaque pixels found in ${path.basename(sourcePath)}`)
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
    sourceFileName: path.basename(sourcePath),
    width: trim.width,
    height: trim.height,
    sourceWidth: info.width,
    sourceHeight: info.height,
    trimLeft: trim.left,
    trimTop: trim.top,
  }
}

function resolveDisplayMetrics(asset) {
  const override = DISPLAY_OVERRIDES[asset.key]
  if (override) return override

  const targetLongSide = asset.sourceType === 'day' ? 152 : 144
  const currentLongSide = Math.max(asset.width, asset.height)
  const scale = targetLongSide / Math.max(1, currentLongSide)
  const displayWidth = Math.max(58, Math.round(asset.width * scale))
  const displayHeight = Math.max(58, Math.round(asset.height * scale))

  return {
    displayWidth,
    displayHeight,
    hitboxWidth: Math.max(42, Math.round(displayWidth * 0.76)),
    hitboxHeight: Math.max(42, Math.round(displayHeight * 0.76)),
  }
}

async function renderSvgAsset(svg, destinationPath) {
  const source = sharp(Buffer.from(svg), { density: SVG_RENDER_DENSITY }).ensureAlpha()
  const { data, info } = await source.raw().toBuffer({ resolveWithObject: true })
  const trim = resolveAlphaTrim(data, info)

  if (!trim) {
    throw new Error(`No opaque pixels found while rendering ${path.basename(destinationPath)}`)
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
}

function buildClawCarriageSvg() {
  return `
<svg width="248" height="156" viewBox="0 0 248 156" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="carriageShell" x1="34" y1="20" x2="207" y2="148" gradientUnits="userSpaceOnUse">
      <stop stop-color="#3A4048"/>
      <stop offset="0.36" stop-color="#252A31"/>
      <stop offset="1" stop-color="#121519"/>
    </linearGradient>
    <linearGradient id="carriageTop" x1="50" y1="28" x2="184" y2="54" gradientUnits="userSpaceOnUse">
      <stop stop-color="#5E6670"/>
      <stop offset="1" stop-color="#394047"/>
    </linearGradient>
    <linearGradient id="carriageWindow" x1="61" y1="68" x2="188" y2="91" gradientUnits="userSpaceOnUse">
      <stop stop-color="#15191E"/>
      <stop offset="1" stop-color="#090B0E"/>
    </linearGradient>
    <linearGradient id="attachmentShell" x1="112" y1="109" x2="132" y2="148" gradientUnits="userSpaceOnUse">
      <stop stop-color="#2B3138"/>
      <stop offset="1" stop-color="#101317"/>
    </linearGradient>
  </defs>

  <rect x="20" y="18" width="208" height="98" rx="30" fill="url(#carriageShell)"/>
  <rect x="20.75" y="18.75" width="206.5" height="96.5" rx="29.25" stroke="#F3F5F6" stroke-opacity="0.08" stroke-width="1.5"/>
  <path d="M42 36C42 29.3726 47.3726 24 54 24H194C200.627 24 206 29.3726 206 36V52H42V36Z" fill="url(#carriageTop)"/>
  <path d="M60 37C60 33.134 63.134 30 67 30H115C118.866 30 122 33.134 122 37V43C122 46.866 118.866 50 115 50H67C63.134 50 60 46.866 60 43V37Z" fill="#FFFFFF" fill-opacity="0.12"/>
  <circle cx="52" cy="42" r="8" fill="#7A828C"/>
  <circle cx="196" cy="42" r="8" fill="#7A828C"/>
  <circle cx="52" cy="42" r="4" fill="#ADB4BD" fill-opacity="0.55"/>
  <circle cx="196" cy="42" r="4" fill="#ADB4BD" fill-opacity="0.55"/>
  <rect x="52" y="64" width="144" height="28" rx="14" fill="url(#carriageWindow)"/>
  <path d="M64 70C64 66.6863 66.6863 64 70 64H178C181.314 64 184 66.6863 184 70V74H64V70Z" fill="#FFFFFF" fill-opacity="0.06"/>
  <path d="M103 116H145C151.627 116 157 121.373 157 128V131C157 142.046 148.046 151 137 151H111C99.9543 151 91 142.046 91 131V128C91 121.373 96.3726 116 103 116Z" fill="url(#attachmentShell)"/>
  <path d="M108 123H140C145.523 123 150 127.477 150 133V135C150 142.18 144.18 148 137 148H111C103.82 148 98 142.18 98 135V133C98 127.477 102.477 123 108 123Z" stroke="#F3F5F6" stroke-opacity="0.06" stroke-width="1.5"/>
  <rect x="111" y="126" width="26" height="10" rx="5" fill="#0B0E12"/>
  <path d="M109 132C109 128.686 111.686 126 115 126H125V136H115C111.686 136 109 133.314 109 130V132Z" fill="#FFFFFF" fill-opacity="0.08"/>
</svg>`
}

function buildClawHeadSvg() {
  return `
<svg width="248" height="278" viewBox="0 0 248 278" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="connectorShell" x1="96" y1="10" x2="152" y2="34" gradientUnits="userSpaceOnUse">
      <stop stop-color="#4D545D"/>
      <stop offset="1" stop-color="#242A31"/>
    </linearGradient>
    <linearGradient id="neckShell" x1="106" y1="28" x2="142" y2="78" gradientUnits="userSpaceOnUse">
      <stop stop-color="#59616A"/>
      <stop offset="1" stop-color="#1D2229"/>
    </linearGradient>
    <linearGradient id="bodyShell" x1="74" y1="64" x2="173" y2="150" gradientUnits="userSpaceOnUse">
      <stop stop-color="#343A42"/>
      <stop offset="0.4" stop-color="#242A31"/>
      <stop offset="1" stop-color="#13171C"/>
    </linearGradient>
    <linearGradient id="jointShell" x1="88" y1="107" x2="153" y2="145" gradientUnits="userSpaceOnUse">
      <stop stop-color="#7A828C"/>
      <stop offset="1" stop-color="#4F565E"/>
    </linearGradient>
    <linearGradient id="armShell" x1="62" y1="111" x2="184" y2="237" gradientUnits="userSpaceOnUse">
      <stop stop-color="#707881"/>
      <stop offset="0.4" stop-color="#565D66"/>
      <stop offset="1" stop-color="#3B4148"/>
    </linearGradient>
    <linearGradient id="armHighlight" x1="78" y1="115" x2="161" y2="206" gradientUnits="userSpaceOnUse">
      <stop stop-color="#D1D5DA" stop-opacity="0.34"/>
      <stop offset="1" stop-color="#D1D5DA" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <path d="M102 115C96 137 87 158 73 177C61 194 52 209 46 223" stroke="url(#armShell)" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M146 115C152 137 161 158 175 177C187 194 196 209 202 223" stroke="url(#armShell)" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M102 115C97 133 90 151 79 169C68 187 59 201 54 214" stroke="url(#armHighlight)" stroke-width="5" stroke-linecap="round"/>
  <path d="M146 115C151 133 158 151 169 169C180 187 189 201 194 214" stroke="url(#armHighlight)" stroke-width="5" stroke-linecap="round"/>
  <circle cx="44" cy="226" r="11" fill="#3A4149"/>
  <circle cx="204" cy="226" r="11" fill="#3A4149"/>
  <circle cx="44" cy="226" r="4" fill="#9AA2AC" fill-opacity="0.38"/>
  <circle cx="204" cy="226" r="4" fill="#9AA2AC" fill-opacity="0.38"/>

  <rect x="96" y="10" width="56" height="20" rx="10" fill="url(#connectorShell)"/>
  <rect x="96.75" y="10.75" width="54.5" height="18.5" rx="9.25" stroke="#F3F5F6" stroke-opacity="0.08" stroke-width="1.5"/>
  <path d="M106 16C106 14.3431 107.343 13 109 13H124C125.657 13 127 14.3431 127 16V18C127 19.6569 125.657 21 124 21H109C107.343 21 106 19.6569 106 18V16Z" fill="#FFFFFF" fill-opacity="0.12"/>
  <rect x="104" y="26" width="40" height="40" rx="16" fill="url(#neckShell)"/>
  <rect x="104.75" y="26.75" width="38.5" height="38.5" rx="15.25" stroke="#F3F5F6" stroke-opacity="0.08" stroke-width="1.5"/>
  <ellipse cx="124" cy="68" rx="28" ry="14" fill="#5A626A"/>
  <ellipse cx="124" cy="68" rx="16" ry="6" fill="#2F353C"/>
  <rect x="70" y="64" width="108" height="62" rx="22" fill="url(#bodyShell)"/>
  <rect x="70.75" y="64.75" width="106.5" height="60.5" rx="21.25" stroke="#F3F5F6" stroke-opacity="0.08" stroke-width="1.5"/>
  <rect x="86" y="82" width="76" height="20" rx="10" fill="#13171C"/>
  <path d="M96 74C96 70.6863 98.6863 68 102 68H136C139.314 68 142 70.6863 142 74V78C142 81.3137 139.314 84 136 84H102C98.6863 84 96 81.3137 96 78V74Z" fill="#FFFFFF" fill-opacity="0.12"/>
  <circle cx="92" cy="115" r="12" fill="url(#jointShell)"/>
  <circle cx="156" cy="115" r="12" fill="url(#jointShell)"/>
  <circle cx="124" cy="129" r="16" fill="url(#jointShell)"/>
  <circle cx="124" cy="129" r="7" fill="#31373D"/>

  <path d="M124 139C124 160 124 185 124 218" stroke="url(#armShell)" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M124 139C124 159 123 181 123 208" stroke="url(#armHighlight)" stroke-width="5" stroke-linecap="round"/>
  <circle cx="124" cy="228" r="12" fill="#3A4149"/>
  <circle cx="124" cy="228" r="4" fill="#9AA2AC" fill-opacity="0.38"/>
</svg>`
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

  await Promise.all([
    renderSvgAsset(buildClawCarriageSvg(), CLAW_CARRIAGE_OUTPUT),
    renderSvgAsset(buildClawHeadSvg(), CLAW_HEAD_OUTPUT),
  ])

  return {
    sourceWidth: info.width,
    sourceHeight: info.height,
  }
}

function buildManifest({ rewards, machine }) {
  const rewardEntries = [...rewards]
    .sort((left, right) => left.key.localeCompare(right.key))
    .map(asset => {
      const display = resolveDisplayMetrics(asset)

      return `  ${asset.key}: {
    source: require('../../../assets/crane/generated/rewards/${asset.fileName}'),
    sourceType: '${asset.sourceType}',
    sourceFileName: '${asset.sourceFileName}',
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
  sourceType: 'normal' | 'day'
  sourceFileName: string
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
  await fs.rm(GENERATED_REWARD_DIR, { recursive: true, force: true })
  await ensureDir(GENERATED_REWARD_DIR)

  const rewardAssets = []
  const seenKeys = new Set()

  for (const sourceDir of ITEM_SOURCE_DIRS) {
    const itemFiles = (await fs.readdir(sourceDir.dirPath))
      .filter(fileName => fileName.toLowerCase().endsWith('.png'))
      .sort((left, right) => left.localeCompare(right))

    for (const fileName of itemFiles) {
      const key = sanitizeKey(fileName)
      if (seenKeys.has(key)) {
        throw new Error(`Duplicate crane reward key generated for ${fileName}: ${key}`)
      }

      seenKeys.add(key)

      const sourcePath = path.join(sourceDir.dirPath, fileName)
      const outputFileName = `${key}.png`
      const destinationPath = path.join(GENERATED_REWARD_DIR, outputFileName)
      rewardAssets.push({
        ...(await trimToAlpha(sourcePath, destinationPath)),
        sourceType: sourceDir.sourceType,
      })
    }
  }

  const machine = await deriveMachineAssets()
  const manifest = buildManifest({ rewards: rewardAssets, machine })
  await fs.writeFile(MANIFEST_OUTPUT, manifest, 'utf8')

  console.log(`Prepared ${rewardAssets.length} reward assets from items + items_day and crane machine derivatives.`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
