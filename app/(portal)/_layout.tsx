import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { colors, font } from '@/lib/theme'

type IoniconsName = React.ComponentProps<typeof Ionicons>['name']

function tabIcon(active: IoniconsName, inactive: IoniconsName) {
  return ({ color, focused }: { color: string; focused: boolean }) => (
    <Ionicons name={focused ? active : inactive} size={22} color={color} />
  )
}

export default function PortalLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.borderHair,
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSubtle,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500', fontFamily: font.medium },
      }}
    >
      <Tabs.Screen
        name="calendar"
        options={{ title: 'Calendar', tabBarIcon: tabIcon('calendar', 'calendar-outline') }}
      />
      <Tabs.Screen
        name="messages"
        options={{ title: 'Messages', tabBarIcon: tabIcon('chatbubble', 'chatbubble-outline') }}
      />
      <Tabs.Screen
        name="expenses"
        options={{ title: 'Expenses', tabBarIcon: tabIcon('receipt', 'receipt-outline') }}
      />
      <Tabs.Screen name="index" options={{ href: null }} />
    </Tabs>
  )
}
