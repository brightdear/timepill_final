import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { View, ActivityIndicator, AppState } from 'react-native'
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator'
import { db } from '@/db/client'
import migrations from '@/db/migrations/migrations'
import {
  ensureInitialNotificationAccess,
  registerNotificationCategories,
  setupNotificationHandler,
  registerAlarmRefreshTask,
  resyncAlarmState,
  startAlarmRefreshTask,
} from '@/domain/alarm/alarmScheduler'
import { useNotificationHandler } from '@/hooks/useNotificationHandler'

function AppCore() {
  useNotificationHandler()

  useEffect(() => {
    void (async () => {
      await registerNotificationCategories()
      registerAlarmRefreshTask()
      await resyncAlarmState()

      const status = await ensureInitialNotificationAccess()
      if (status === 'granted') {
        await startAlarmRefreshTask()
      }
    })()

    const appStateSub = AppState.addEventListener('change', state => {
      if (state === 'active') {
        void resyncAlarmState()
      }
    })

    return () => appStateSub.remove()
  }, [])

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="rewards" options={{ presentation: 'card' }} />
      <Stack.Screen name="check-item" options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="scan" options={{ presentation: 'modal' }} />
      <Stack.Screen name="alarm" options={{ presentation: 'modal' }} />
      <Stack.Screen name="force-alarm" options={{ presentation: 'modal' }} />
    </Stack>
  )
}

export default function RootLayout() {
  const { success, error } = useMigrations(db, migrations)

  useEffect(() => {
    setupNotificationHandler()
  }, [])

  if (error) throw error

  if (!success) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    )
  }

  return (
    <SafeAreaProvider>
      <AppCore />
    </SafeAreaProvider>
  )
}
