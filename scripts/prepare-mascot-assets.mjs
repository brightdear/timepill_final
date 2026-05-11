import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

const rootDir = process.cwd()
const sourceDir = path.join(rootDir, 'assets', 'days')
const outputDir = path.join(sourceDir, 'transparent')

const assets = [
  { input: 'day_happy.png', output: 'day_happy.png', threshold: 74, feather: 18 },
  { input: 'day_jelly.png', output: 'day_jelly.png', threshold: 74, feather: 18 },
  { input: 'day_normal.png', output: 'day_normal.png', threshold: 74, feather: 18 },
  { input: 'day_pointing.png', output: 'day_pointing.png', threshold: 74, feather: 18 },
  { input: 'day_proud_of.png', output: 'day_proud_of.png', threshold: 74, feather: 18 },
  { input: 'day_sad.png', output: 'day_sad.png', threshold: 74, feather: 18 },
  { input: 'day_suprised.png', output: 'day_suprised.png', threshold: 74, feather: 18 },
  { input: 'day_soso.jpeg', output: 'day_soso.png', threshold: 28, feather: 18 },
]

function sampleBackground(data, info) {
  const width = info.width
  const height = info.height
  const channels = info.channels
  const positions = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
    [Math.floor(width / 2), 0],
    [Math.floor(width / 2), height - 1],
    [0, Math.floor(height / 2)],
    [width - 1, Math.floor(height / 2)],
  ]

  const totals = positions.reduce((acc, [x, y]) => {
    const offset = (y * width + x) * channels
    acc.r += data[offset]
    acc.g += data[offset + 1]
    acc.b += data[offset + 2]
    return acc
  }, { r: 0, g: 0, b: 0 })

  return {
    r: totals.r / positions.length,
    g: totals.g / positions.length,
    b: totals.b / positions.length,
  }
}

function colorDistance(r, g, b, background) {
  return Math.sqrt(
    ((r - background.r) ** 2) +
    ((g - background.g) ** 2) +
    ((b - background.b) ** 2),
  )
}

async function processAsset({ input, output, threshold, feather }) {
  const inputPath = path.join(sourceDir, input)
  const outputPath = path.join(outputDir, output)
  const image = sharp(inputPath).ensureAlpha()
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true })
  const background = sampleBackground(data, info)
  const rgba = Buffer.from(data)

  for (let index = 0; index < rgba.length; index += info.channels) {
    const distance = colorDistance(rgba[index], rgba[index + 1], rgba[index + 2], background)
    if (distance <= threshold) {
      rgba[index + 3] = 0
      continue
    }

    if (distance <= threshold + feather) {
      const nextAlpha = ((distance - threshold) / feather) * rgba[index + 3]
      rgba[index + 3] = Math.max(0, Math.min(255, Math.round(nextAlpha)))
    }
  }

  await sharp(rgba, {
    raw: {
      width: info.width,
      height: info.height,
      channels: info.channels,
    },
  })
    .png()
    .toFile(outputPath)

  return path.relative(rootDir, outputPath)
}

await fs.mkdir(outputDir, { recursive: true })

for (const asset of assets) {
  const relativePath = await processAsset(asset)
  console.log(`generated ${relativePath}`)
}