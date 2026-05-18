import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { PortalProvider, usePortal } from '@/lib/context/PortalContext'
import { font } from '@/lib/theme'

type IoniconsName = React.ComponentProps<typeof Ionicons>['name']

function tabIcon(active: IoniconsName, inactive: IoniconsName) {
  return ({ color, focused }: { color: string; focused: boolean }) => (
    <Ionicons name={focused ? active : inactive} size={22} color={color} />
  )
}

// ─── inner tabs — rendered inside PortalProvider so usePortal() works ─────────

function PortalTabs() {
  const { theme } = usePortal()

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
          borderTopWidth: 1,
        },
        tabBarActiveTintColor:   theme.accent,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500', fontFamily: font.medium },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{ title: 'Home', tabBarIcon: tabIcon('home', 'home-outline') }}
      />
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
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarIcon: tabIcon('settings', 'settings-outline') }}
      />
      <Tabs.Screen name="index" options={{ href: null }} />
    </Tabs>
  )
}

// ─── layout root — provides context ──────────────────────────────────────────

export default function PortalLayout() {
  return (
    <PortalProvider>
      <PortalTabs />
    </PortalProvider>
  )
}
