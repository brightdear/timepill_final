import { useEffect } from 'react'
import { Stack } from 'expo-router'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { View, ActivityIndicator } from 'react-native'
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator'
import { db } from '@backend/db/client'
import migrations from '@backend/db/migrations/migrations'
import {
  setupNotificationHandler,
  registerAlarmRefreshTask,
  startAlarmRefreshTask,
  requestNotificationPermissions,
} from '@backend/alarm/alarmScheduler'
import { useNotificationHandler } from '@frontend/hooks/useNotificationHandler'

function AppCore() {
  useNotificationHandler()

  useEffect(() => {
    registerAlarmRefreshTask()
    void requestNotificationPermissions().then(granted => {
      if (granted) void startAlarmRefreshTask()
    })
  }, [])

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
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
