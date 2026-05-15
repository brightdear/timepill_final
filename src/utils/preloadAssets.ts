import { Asset } from 'expo-asset'
import {
  CRANE_MACHINE_ASSETS,
  CRANE_REWARD_ASSETS,
} from '@/components/shop/craneAssetManifest.generated'
import { MASCOT_STATUS_ASSETS } from '@/constants/mascotStatus'

const CABINET_ASSET = require('../../assets/bookshelf.png')

let preloadPromise: Promise<void> | null = null

export function preloadCoreAssets() {
  if (preloadPromise) return preloadPromise

  const sources = [
    CABINET_ASSET,
    ...Object.values(MASCOT_STATUS_ASSETS),
    ...Object.values(CRANE_MACHINE_ASSETS),
    ...Object.values(CRANE_REWARD_ASSETS).map(asset => asset.source),
  ] as Array<number | string>
  const moduleSources = sources.filter((source): source is number => typeof source === 'number')
  const uriSources = sources.filter((source): source is string => typeof source === 'string')

  preloadPromise = Promise.all([
    moduleSources.length > 0 ? Asset.loadAsync(moduleSources) : Promise.resolve([]),
    uriSources.length > 0 ? Asset.loadAsync(uriSources) : Promise.resolve([]),
  ])
    .then(() => undefined)
    .catch(error => {
      preloadPromise = null
      if (__DEV__) {
        console.warn('[assets] preload failed', error)
      }
    })

  return preloadPromise
}
