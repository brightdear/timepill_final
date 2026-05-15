import type { ImageSourcePropType } from 'react-native'
import type { Lang } from '@/constants/translations'

export type MascotStatusKey = 'sad' | 'soso' | 'normal' | 'surprised' | 'proud' | 'happy'

type MascotStatusDetails = {
  surface: string
  border: string
  accent: string
}

type MascotImageTuning = {
  scale: number
  translateX: number
  translateY: number
}

const MASCOT_LABELS: Record<MascotStatusKey, Record<Lang, string>> = {
  sad: {
    ko: '놓친 날',
    en: 'Missed Day',
    ja: '逃した日',
  },
  soso: {
    ko: '시작 중',
    en: 'Getting Started',
    ja: 'はじめの流れ',
  },
  normal: {
    ko: '안정적',
    en: 'Normal Day',
    ja: '安定した日',
  },
  surprised: {
    ko: '보너스',
    en: 'Surprise Day',
    ja: 'ボーナス',
  },
  proud: {
    ko: '잘 이어가는 중',
    en: 'Proud Day',
    ja: 'よく続いています',
  },
  happy: {
    ko: '좋은 흐름',
    en: 'Happy Day',
    ja: '良い流れ',
  },
}

export const MASCOT_STATUS_ASSETS: Record<MascotStatusKey, ImageSourcePropType> = {
  sad: require('../../assets/days/transparent/day_sad.png'),
  soso: require('../../assets/days/transparent/day_soso.png'),
  normal: require('../../assets/days/transparent/day_normal.png'),
  surprised: require('../../assets/days/transparent/day_suprised.png'),
  proud: require('../../assets/days/transparent/day_proud_of.png'),
  happy: require('../../assets/days/transparent/day_happy.png'),
}

export const MASCOT_STATUS_DETAILS: Record<MascotStatusKey, MascotStatusDetails> = {
  sad: {
    surface: '#FBF0EB',
    border: '#E8C7BE',
    accent: '#C66843',
  },
  soso: {
    surface: '#F5F1EA',
    border: '#DDD5C9',
    accent: '#7E848E',
  },
  normal: {
    surface: '#EEF3FA',
    border: '#D9E4F1',
    accent: '#597FB1',
  },
  surprised: {
    surface: '#FFF3E6',
    border: '#F2D0A5',
    accent: '#C8892D',
  },
  proud: {
    surface: '#F7F2E9',
    border: '#E4D7BE',
    accent: '#B28235',
  },
  happy: {
    surface: '#EEF8F2',
    border: '#CFE2D6',
    accent: '#3E8E6A',
  },
}

export const MASCOT_STATUS_IMAGE_TUNING: Record<MascotStatusKey, MascotImageTuning> = {
  happy: {
    scale: 1.12,
    translateX: 0,
    translateY: -0.01,
  },
  normal: {
    scale: 1.03,
    translateX: 0,
    translateY: 0.01,
  },
  proud: {
    scale: 1.04,
    translateX: 0,
    translateY: 0,
  },
  sad: {
    scale: 1.05,
    translateX: 0.01,
    translateY: 0,
  },
  soso: {
    scale: 1.08,
    translateX: -0.02,
    translateY: -0.04,
  },
  surprised: {
    scale: 1.08,
    translateX: 0.01,
    translateY: 0,
  },
}

export function getMascotLabel(statusKey: MascotStatusKey, lang: Lang) {
  return MASCOT_LABELS[statusKey][lang]
}

export function formatStreakTitle(streak: number, lang: Lang) {
  if (lang === 'en') return `${streak}-day streak`
  if (lang === 'ja') return `${streak}日連続服用`
  return `${streak}일 연속 복용`
}

export function resolveMascotStatus(args: {
  currentStreak: number
  hasMissedToday?: boolean
  surprise?: boolean
}) {
  const { currentStreak, hasMissedToday = false, surprise = false } = args

  if (surprise) return 'surprised' as const
  if (hasMissedToday || currentStreak === 0) return 'sad' as const
  if (currentStreak >= 7) return 'happy' as const
  if (currentStreak >= 5) return 'proud' as const
  if (currentStreak >= 3) return 'normal' as const
  return 'soso' as const
}
