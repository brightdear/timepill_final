import type { AudioPlayer, AudioSource } from 'expo-audio'

export type CraneSfxKey =
  | 'start'
  | 'moveTick'
  | 'drop'
  | 'close'
  | 'grab'
  | 'slip'
  | 'win'
  | 'reroll'
  | 'buttonTap'

const CRANE_SFX_SOURCES: Record<CraneSfxKey, AudioSource> = {
  start: require('../../../../assets/audio/crane/crane_start.wav'),
  moveTick: require('../../../../assets/audio/crane/crane_move_tick.wav'),
  drop: require('../../../../assets/audio/crane/crane_drop.wav'),
  close: require('../../../../assets/audio/crane/claw_close.wav'),
  grab: require('../../../../assets/audio/crane/item_grab.wav'),
  slip: require('../../../../assets/audio/crane/item_slip.wav'),
  win: require('../../../../assets/audio/crane/prize_win.wav'),
  reroll: require('../../../../assets/audio/crane/reroll.wav'),
  buttonTap: require('../../../../assets/audio/crane/button_tap.wav'),
}

const CRANE_SFX_VOLUMES: Record<CraneSfxKey, number> = {
  start: 0.38,
  moveTick: 0.16,
  drop: 0.26,
  close: 0.22,
  grab: 0.28,
  slip: 0.24,
  win: 0.34,
  reroll: 0.26,
  buttonTap: 0.18,
}

const CRANE_SFX_COOLDOWNS_MS: Record<CraneSfxKey, number> = {
  start: 80,
  moveTick: 220,
  drop: 120,
  close: 120,
  grab: 120,
  slip: 160,
  win: 260,
  reroll: 220,
  buttonTap: 100,
}

const sfxPlayers = new Map<CraneSfxKey, AudioPlayer>()
const lastPlaybackAt = new Map<CraneSfxKey, number>()
let audioReadyPromise: Promise<void> | null = null
let craneSoundEnabled = true
let expoAudioModule: Pick<typeof import('expo-audio'), 'createAudioPlayer' | 'setAudioModeAsync'> | null | undefined
let audioUnavailableWarningLogged = false

function getExpoAudioModule() {
  if (expoAudioModule !== undefined) return expoAudioModule

  try {
    // Load lazily so Expo Go or stale native builds without ExpoAudio do not crash at route import time.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const module = require('expo-audio') as typeof import('expo-audio')
    expoAudioModule = {
      createAudioPlayer: module.createAudioPlayer,
      setAudioModeAsync: module.setAudioModeAsync,
    }
  } catch (error) {
    expoAudioModule = null
    if (__DEV__ && !audioUnavailableWarningLogged) {
      audioUnavailableWarningLogged = true
      console.warn('[crane] Sound effects disabled because expo-audio native module is unavailable.', error)
    }
  }

  return expoAudioModule
}

function syncPlayerSettings(player: AudioPlayer, key: CraneSfxKey) {
  player.volume = CRANE_SFX_VOLUMES[key]
  player.muted = !craneSoundEnabled
}

function getOrCreatePlayer(key: CraneSfxKey) {
  const audioModule = getExpoAudioModule()
  if (!audioModule) return null

  const existing = sfxPlayers.get(key)
  if (existing) {
    syncPlayerSettings(existing, key)
    return existing
  }

  try {
    const player = audioModule.createAudioPlayer(CRANE_SFX_SOURCES[key], {
      keepAudioSessionActive: true,
      updateInterval: 1000,
    })
    syncPlayerSettings(player, key)
    sfxPlayers.set(key, player)
    return player
  } catch {
    return null
  }
}

export function setCraneSoundEnabled(enabled: boolean) {
  craneSoundEnabled = enabled

  for (const [key, player] of sfxPlayers.entries()) {
    try {
      syncPlayerSettings(player, key)
    } catch {
      continue
    }
  }
}

export function isCraneSoundEnabled() {
  return craneSoundEnabled
}

export function prepareCraneSfx() {
  if (audioReadyPromise) return audioReadyPromise

  audioReadyPromise = (async () => {
    const audioModule = getExpoAudioModule()
    if (!audioModule) return

    try {
      await audioModule.setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: false,
        interruptionMode: 'mixWithOthers',
      })
    } catch {
      return
    }
  })()

  return audioReadyPromise
}

async function replayPlayer(player: AudioPlayer) {
  try {
    if (player.playing) {
      player.pause()
    }
  } catch {
    // Ignore replay preparation failures.
  }

  try {
    await player.seekTo(0)
  } catch {
    // Ignore seek failures and try playback anyway.
  }

  try {
    player.play()
  } catch {
    // Fail silently if the player is unavailable.
  }
}

export function playCraneSfx(key: CraneSfxKey) {
  if (!craneSoundEnabled) return

  const now = Date.now()
  const cooldownMs = CRANE_SFX_COOLDOWNS_MS[key]
  const lastPlayedAt = lastPlaybackAt.get(key) ?? 0
  if (now - lastPlayedAt < cooldownMs) return
  lastPlaybackAt.set(key, now)

  void (async () => {
    await prepareCraneSfx()
    const player = getOrCreatePlayer(key)
    if (!player) return
    await replayPlayer(player)
  })()
}
