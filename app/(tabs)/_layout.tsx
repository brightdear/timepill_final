import { Tabs } from 'expo-router'
import { Ionicons, type AppIconName } from '@/components/AppIcon'
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
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: designHarness.colors.warning,
        tabBarInactiveTintColor: '#8A8F98',
        tabBarStyle: {
          height: 82,
          paddingTop: 8,
          paddingBottom: 10,
          backgroundColor: designHarness.colors.surface,
          borderTopColor: '#EDEDED',
          borderTopWidth: 1,
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
        name="crane"
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
