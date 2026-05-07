import {
  documentDirectory,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy'

const STORAGE_PATH = `${documentDirectory ?? ''}timepill_custom_mood_emojis.json`
const MAX_CUSTOM_MOOD_EMOJIS = 8

function uniqueEmojis(values: string[]) {
  return [...new Set(values)]
    .filter(Boolean)
    .slice(0, MAX_CUSTOM_MOOD_EMOJIS)
}

export function extractEmoji(value: string) {
  const match = value.trim().match(/\p{Extended_Pictographic}(?:\uFE0F|\u{1F3FB}|\u{1F3FC}|\u{1F3FD}|\u{1F3FE}|\u{1F3FF}|\u200D\p{Extended_Pictographic})*/u)
  return match?.[0] ?? null
}

export async function getCustomMoodEmojis() {
  if (!documentDirectory) return []

  try {
    const raw = await readAsStringAsync(STORAGE_PATH)
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? uniqueEmojis(parsed.filter(item => typeof item === 'string')) : []
  } catch {
    return []
  }
}

export async function saveCustomMoodEmojis(emojis: string[]) {
  if (!documentDirectory) return uniqueEmojis(emojis)

  const next = uniqueEmojis(emojis)
  await writeAsStringAsync(STORAGE_PATH, JSON.stringify(next))
  return next
}

export async function addCustomMoodEmoji(value: string) {
  const emoji = extractEmoji(value)
  if (!emoji) return { ok: false as const, emojis: await getCustomMoodEmojis() }

  const current = await getCustomMoodEmojis()
  const next = await saveCustomMoodEmojis([emoji, ...current.filter(item => item !== emoji)])
  return { ok: true as const, emoji, emojis: next }
}

export async function deleteCustomMoodEmoji(emoji: string) {
  const current = await getCustomMoodEmojis()
  return saveCustomMoodEmojis(current.filter(item => item !== emoji))
}
