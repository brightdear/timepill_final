import { isRunningInExpoGo } from 'expo'
import { NativeModules, Platform } from 'react-native'
import { buildRoutineWidgetSnapshot } from '@/domain/alarm/widgetState'

type WidgetSyncNativeModule = {
  setRoutineWidgetSnapshot: (snapshotJson: string) => Promise<void>
  reloadRoutineWidgetTimelines: () => Promise<void>
}

function getWidgetSyncModule(): WidgetSyncNativeModule | null {
  if (Platform.OS !== 'ios' || isRunningInExpoGo()) return null
  const nativeModule = NativeModules.WidgetSyncModule as Partial<WidgetSyncNativeModule> | undefined
  if (!nativeModule?.setRoutineWidgetSnapshot || !nativeModule?.reloadRoutineWidgetTimelines) {
    return null
  }
  return nativeModule as WidgetSyncNativeModule
}

export async function syncRoutineWidget(): Promise<void> {
  const nativeModule = getWidgetSyncModule()
  if (!nativeModule) return

  try {
    const snapshot = await buildRoutineWidgetSnapshot()
    await nativeModule.setRoutineWidgetSnapshot(JSON.stringify(snapshot))
    await nativeModule.reloadRoutineWidgetTimelines()
  } catch (error) {
    if (__DEV__) {
      console.warn('[widgetSync] failed to sync widget state:', error)
    }
  }
}
