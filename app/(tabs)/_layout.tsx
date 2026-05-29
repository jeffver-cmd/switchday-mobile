import { useEffect, useRef } from 'react'
import { AppState, type AppStateStatus } from 'react-native'
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

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

export default function TabsLayout() {
  const router = useRouter()
  const notifListenerRef = useRef<EventSubscription | null>(null)
  // Timestamp (ms) when the app was last backgrounded; null if currently active.
  const backgroundedAtRef = useRef<number | null>(null)
  // Flag so the SIGNED_OUT handler can append ?reason=inactivity on the redirect.
  const inactivityLogoutRef = useRef(false)

  useEffect(() => {
    // Register push token after the tab bar mounts (user is authenticated)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) {
        void registerForPushNotificationsAsync(session.user.id)
      }
    })

    // Pause Supabase token auto-refresh when app is backgrounded to prevent
    // "Auto refresh tick failed" errors on weak signal / background fetch failures.
    // Resume when app comes back to foreground.
    // Also enforce inactivity logout: if the app was backgrounded for longer than
    // INACTIVITY_TIMEOUT_MS, sign the user out when they return.
    const handleAppStateChange = (state: AppStateStatus) => {
      if (state === 'active') {
        supabase.auth.startAutoRefresh()
        const backgroundedAt = backgroundedAtRef.current
        backgroundedAtRef.current = null
        if (backgroundedAt !== null && Date.now() - backgroundedAt >= INACTIVITY_TIMEOUT_MS) {
          inactivityLogoutRef.current = true
          supabase.auth.signOut().catch(() => {})
        }
      } else {
        supabase.auth.stopAutoRefresh()
        // Record when we went to background (only on first transition per session)
        if (backgroundedAtRef.current === null) {
          backgroundedAtRef.current = Date.now()
        }
      }
    }
    const appStateSub = AppState.addEventListener('change', handleAppStateChange)

    // Handle session expiry — redirect to login when signed out.
    // If the sign-out was triggered by inactivity, pass reason so the login
    // screen can show an explanatory notice.
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        if (inactivityLogoutRef.current) {
          inactivityLogoutRef.current = false
          router.replace('/(auth)/login?reason=inactivity' as any)
        } else {
          router.replace('/(auth)/login')
        }
      }
    })

    // Handle notification taps — navigate to relevant screen
    notifListenerRef.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as Record<string, unknown>
      const screen = data?.screen as string | undefined
      if (screen === 'messages') {
        const threadId    = data?.threadId    as string | undefined
        const connectionId = data?.connectionId as string | undefined
        if (threadId && connectionId) {
          // Navigate directly to the specific thread
          router.push(`/messages/${threadId}?connectionId=${connectionId}&topic=${encodeURIComponent('Conversation')}` as any)
        } else {
          router.push('/(tabs)/messages')
        }
      } else if (screen === 'expenses') {
        router.push('/(tabs)/expenses')
      } else if (screen === 'schedule') {
        router.push('/(tabs)/schedule')
      } else if (screen === 'calendar') {
        router.push('/(tabs)/calendar')
      }
    })

    return () => {
      appStateSub.remove()
      notifListenerRef.current?.remove()
      authSub.unsubscribe()
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
        name="journal"
        options={{ title: 'Journal', tabBarIcon: tabIcon('journal', 'journal-outline') }}
      />
      <Tabs.Screen
        name="vault"
        options={{ title: 'Vault', tabBarIcon: tabIcon('folder', 'folder-outline') }}
      />
    </Tabs>
  )
}
