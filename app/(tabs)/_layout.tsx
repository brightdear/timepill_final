import { Tabs } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons, type AppIconName } from '@/components/AppIcon'
import { TAB_BAR_BASE_HEIGHT } from '@/components/layout/FloatingBottom'
import { designHarness } from '@/design/designHarness'

function TabIcon({
  focused,
  activeName,
  inactiveName,
  color,
}: {
  focused: boolean
  activeName: AppIconName
  inactiveName: AppIconName
  color: string
}) {
  return (
    <Ionicons
      name={focused ? activeName : inactiveName}
      size={24}
      color={color}
    />
  )
}

export default function TabLayout() {
  const insets = useSafeAreaInsets()

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: designHarness.colors.warning,
        tabBarInactiveTintColor: '#8A8F98',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#EDEDED',
          borderTopWidth: 1,
          elevation: 10,
          height: TAB_BAR_BASE_HEIGHT + insets.bottom,
          paddingBottom: Math.max(insets.bottom, 8),
          paddingTop: 8,
          position: 'absolute',
          zIndex: 80,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 4,
        },
        tabBarItemStyle: {
          paddingTop: 4,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '홈',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon focused={focused} activeName="home" inactiveName="home-outline" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: '기록',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon focused={focused} activeName="calendar" inactiveName="calendar-outline" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="shop"
        options={{
          title: '상점',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon focused={focused} activeName="gift" inactiveName="gift-outline" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="register"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="state"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="calendar"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '설정',
          tabBarIcon: ({ focused, color }) => (
            <TabIcon focused={focused} activeName="settings" inactiveName="settings-outline" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="daycare"
        options={{ href: null }}
      />
    </Tabs>
  )
}
