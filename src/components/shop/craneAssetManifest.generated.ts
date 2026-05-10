import type { ImageSourcePropType } from 'react-native'

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
  width: 1086,
  height: 1448,
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
  bubbleMarlang: {
    source: require('../../../assets/crane/generated/rewards/bubbleMarlang.png'),
    width: 821,
    height: 836,
    sourceWidth: 1254,
    sourceHeight: 1254,
    trimLeft: 216,
    trimTop: 222,
    trimWidth: 821,
    trimHeight: 836,
    displayWidth: 138,
    displayHeight: 138,
    hitboxWidth: 105,
    hitboxHeight: 105,
  },
  catmarlang: {
    source: require('../../../assets/crane/generated/rewards/catmarlang.png'),
    width: 640,
    height: 953,
    sourceWidth: 1254,
    sourceHeight: 1254,
    trimLeft: 312,
    trimTop: 149,
    trimWidth: 640,
    trimHeight: 953,
    displayWidth: 111,
    displayHeight: 141,
    hitboxWidth: 84,
    hitboxHeight: 105,
  },
  chatgptImage202657031156: {
    source: require('../../../assets/crane/generated/rewards/chatgptImage202657031156.png'),
    width: 898,
    height: 1487,
    sourceWidth: 1024,
    sourceHeight: 1536,
    trimLeft: 89,
    trimTop: 40,
    trimWidth: 898,
    trimHeight: 1487,
    displayWidth: 138,
    displayHeight: 183,
    hitboxWidth: 102,
    hitboxHeight: 135,
  },
  cloudSun: {
    source: require('../../../assets/crane/generated/rewards/cloudSun.png'),
    width: 752,
    height: 815,
    sourceWidth: 1254,
    sourceHeight: 1254,
    trimLeft: 251,
    trimTop: 231,
    trimWidth: 752,
    trimHeight: 815,
    displayWidth: 156,
    displayHeight: 126,
    hitboxWidth: 123,
    hitboxHeight: 96,
  },
  heartKeyring: {
    source: require('../../../assets/crane/generated/rewards/heartKeyring.png'),
    width: 651,
    height: 927,
    sourceWidth: 1254,
    sourceHeight: 1254,
    trimLeft: 298,
    trimTop: 148,
    trimWidth: 651,
    trimHeight: 927,
    displayWidth: 111,
    displayHeight: 141,
    hitboxWidth: 84,
    hitboxHeight: 105,
  },
  keyboardMalrang: {
    source: require('../../../assets/crane/generated/rewards/keyboardMalrang.png'),
    width: 715,
    height: 730,
    sourceWidth: 1254,
    sourceHeight: 1254,
    trimLeft: 270,
    trimTop: 280,
    trimWidth: 715,
    trimHeight: 730,
    displayWidth: 156,
    displayHeight: 117,
    hitboxWidth: 123,
    hitboxHeight: 87,
  },
  starPulse: {
    source: require('../../../assets/crane/generated/rewards/starPulse.png'),
    width: 570,
    height: 767,
    sourceWidth: 1254,
    sourceHeight: 1254,
    trimLeft: 343,
    trimTop: 267,
    trimWidth: 570,
    trimHeight: 767,
    displayWidth: 117,
    displayHeight: 135,
    hitboxWidth: 87,
    hitboxHeight: 102,
  },
  starmarlang: {
    source: require('../../../assets/crane/generated/rewards/starmarlang.png'),
    width: 570,
    height: 767,
    sourceWidth: 1254,
    sourceHeight: 1254,
    trimLeft: 343,
    trimTop: 267,
    trimWidth: 570,
    trimHeight: 767,
    displayWidth: 117,
    displayHeight: 135,
    hitboxWidth: 87,
    hitboxHeight: 102,
  },
}
