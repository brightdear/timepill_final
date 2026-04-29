import { Alert } from 'react-native'
import { Tabs } from 'expo-router'
import { isRegisterDirty, setRegisterDirty, scheduleRegisterReset } from '@shared/utils/registerGuard'

type TabNav = { navigate: (name: string) => void }

function guardedTabListeners(screenName: string) {
  return ({ navigation }: { navigation: TabNav }) => ({
    tabPress: (e: { preventDefault: () => void }) => {
      if (!isRegisterDirty()) return
      e.preventDefault()
      Alert.alert('저장하지 않고 나가시겠습니까?', '', [
        { text: '취소', style: 'cancel' },
        {
          text: '나가기',
          style: 'destructive',
          onPress: () => {
            scheduleRegisterReset()
            setRegisterDirty(false)
            navigation.navigate(screenName)
          },
        },
      ])
    },
  })
}

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen
        name="index"
        options={{ title: '홈' }}
        listeners={guardedTabListeners('index')}
      />
      <Tabs.Screen
        name="register"
        options={{ title: '등록' }}
      />
      <Tabs.Screen
        name="history"
        options={{ title: '기록' }}
        listeners={guardedTabListeners('history')}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: '설정' }}
        listeners={guardedTabListeners('settings')}
      />
      <Tabs.Screen
        name="daycare"
        options={{ title: '데이' }}
        listeners={guardedTabListeners('daycare')}
      />
    </Tabs>
  )
}
