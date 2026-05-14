import {
  createAudioPlayer,
  setIsAudioActiveAsync,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioSource,
} from 'expo-audio'

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
  start: 0.54,
  moveTick: 0.22,
  drop: 0.42,
  close: 0.36,
  grab: 0.44,
  slip: 0.38,
  win: 0.58,
  reroll: 0.42,
  buttonTap: 0.28,
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

function syncPlayerSettings(player: AudioPlayer, key: CraneSfxKey) {
  player.volume = CRANE_SFX_VOLUMES[key]
  player.muted = !craneSoundEnabled
}

function getOrCreatePlayer(key: CraneSfxKey) {
  const existing = sfxPlayers.get(key)
  if (existing) {
    syncPlayerSettings(existing, key)
    return existing
  }

  try {
    const player = createAudioPlayer(CRANE_SFX_SOURCES[key], {
      downloadFirst: true,
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
    try {
      await setIsAudioActiveAsync(true)
      await setAudioModeAsync({
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
