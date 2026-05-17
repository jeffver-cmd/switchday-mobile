import { useEffect, useRef } from 'react'
import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Notifications from 'expo-notifications'
import { type EventSubscription } from 'expo-modules-core'
import { useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { registerForPushNotificationsAsync } from '@/lib/notifications'
import { colors, font } from '@/lib/theme'

type IoniconsName = React.ComponentProps<typeof Ionicons>['name']

function tabIcon(active: IoniconsName, inactive: IoniconsName) {
  return ({ color, focused }: { color: string; focused: boolean }) => (
    <Ionicons name={focused ? active : inactive} size={22} color={color} />
  )
}

export default function TabsLayout() {
  const router = useRouter()
  const notifListenerRef = useRef<EventSubscription | null>(null)

  useEffect(() => {
    // Register push token after the tab bar mounts (user is authenticated)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) {
        void registerForPushNotificationsAsync(session.user.id)
      }
    })

    // Handle notification taps — navigate to relevant screen
    notifListenerRef.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as Record<string, unknown>
      if (data?.screen === 'messages') {
        router.push('/(tabs)/messages')
      }
    })

    return () => {
      notifListenerRef.current?.remove()
    }
  }, [router])

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
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
          fontFamily: font.medium,
        },
      }}
    >
      <Tabs.Screen
        name="dashboard"
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
        name="schedule"
        options={{ title: 'Schedule', tabBarIcon: tabIcon('calendar-number', 'calendar-number-outline') }}
      />
      <Tabs.Screen
        name="vault"
        options={{ href: null }}
      />
    </Tabs>
  )
}
