import { useEffect, useRef, useState } from 'react'
import {
  Alert, AppState, Modal, StyleSheet, Text, TouchableOpacity, View,
  type AppStateStatus,
} from 'react-native'
import { Tabs } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import * as Notifications from 'expo-notifications'
import { type EventSubscription } from 'expo-modules-core'
import { useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { registerForPushNotificationsAsync } from '@/lib/notifications'
import { clearMedicalKey } from '@/lib/utils/medicalCrypto'
import { colors, radius, font } from '@/lib/theme'

type IoniconsName = React.ComponentProps<typeof Ionicons>['name']

function tabIcon(active: IoniconsName, inactive: IoniconsName) {
  return ({ color, focused }: { color: string; focused: boolean }) => (
    <Ionicons name={focused ? active : inactive} size={22} color={color} />
  )
}

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000 // 30 minutes

const MORE_ITEMS: { label: string; icon: IoniconsName; route: string }[] = [
  { label: 'Schedule', icon: 'calendar-number-outline', route: '/(tabs)/schedule' },
  { label: 'Journal',  icon: 'journal-outline',         route: '/(tabs)/journal'  },
  { label: 'Vault',    icon: 'folder-outline',           route: '/(tabs)/vault'    },
  { label: 'Settings', icon: 'settings-outline',         route: '/(tabs)/settings' },
]

export default function TabsLayout() {
  const router = useRouter()
  const notifListenerRef = useRef<EventSubscription | null>(null)
  const backgroundedAtRef = useRef<number | null>(null)
  const inactivityLogoutRef = useRef(false)
  const [showMore, setShowMore] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) {
        void registerForPushNotificationsAsync(session.user.id)
      }
    })

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
        if (backgroundedAtRef.current === null) {
          backgroundedAtRef.current = Date.now()
        }
      }
    }
    const appStateSub = AppState.addEventListener('change', handleAppStateChange)

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

    notifListenerRef.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data as Record<string, unknown>
      const screen = data?.screen as string | undefined
      if (screen === 'messages') {
        const threadId     = data?.threadId     as string | undefined
        const connectionId = data?.connectionId as string | undefined
        if (threadId && connectionId) {
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

  function navigate(route: string) {
    setShowMore(false)
    // Small delay so the sheet closes before the screen pushes
    setTimeout(() => router.push(route as any), 50)
  }

  function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          setShowMore(false)
          await clearMedicalKey()
          await supabase.auth.signOut()
        },
      },
    ])
  }

  return (
    <>
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
        {/* More tab — custom button that opens the bottom sheet */}
        <Tabs.Screen
          name="more"
          options={{
            title: 'More',
            tabBarIcon: ({ color }) => <Ionicons name="ellipsis-horizontal" size={22} color={color} />,
            tabBarButton: (props) => (
              <TouchableOpacity
                style={props.style}
                onPress={() => setShowMore(true)}
                activeOpacity={0.7}
              >
                {props.children}
              </TouchableOpacity>
            ),
          }}
        />
        {/* Hidden routes — accessible via the More sheet */}
        <Tabs.Screen name="schedule" options={{ href: null }} />
        <Tabs.Screen name="journal"  options={{ href: null }} />
        <Tabs.Screen name="vault"    options={{ href: null }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
      </Tabs>

      {/* ── More bottom sheet ──────────────────────────────────────────────── */}
      <Modal
        visible={showMore}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMore(false)}
      >
        <View style={sheet.overlay}>
          {/* Tap backdrop to dismiss */}
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            onPress={() => setShowMore(false)}
            activeOpacity={1}
          />
          <View style={sheet.container}>
            <View style={sheet.handle} />

            {MORE_ITEMS.map((item, i) => (
              <TouchableOpacity
                key={item.route}
                style={[sheet.row, sheet.rowBorder]}
                onPress={() => navigate(item.route)}
                activeOpacity={0.7}
              >
                <View style={sheet.iconWrap}>
                  <Ionicons name={item.icon} size={20} color={colors.accent} />
                </View>
                <Text style={sheet.rowLabel}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
              </TouchableOpacity>
            ))}

            {/* Sign out */}
            <TouchableOpacity
              style={[sheet.row, sheet.rowBorder]}
              onPress={handleSignOut}
              activeOpacity={0.7}
            >
              <View style={[sheet.iconWrap, sheet.iconWrapDanger]}>
                <Ionicons name="log-out-outline" size={20} color={colors.danger} />
              </View>
              <Text style={[sheet.rowLabel, sheet.rowLabelDanger]}>Sign Out</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={sheet.cancelBtn}
              onPress={() => setShowMore(false)}
              activeOpacity={0.7}
            >
              <Text style={sheet.cancelText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  )
}

const sheet = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  container: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 36,
    paddingHorizontal: 16,
  },
  handle: {
    width: 36, height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderHair,
    alignSelf: 'center',
    marginTop: 10, marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    gap: 14,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderHair,
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: radius.sm,
    backgroundColor: colors.accentSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  iconWrapDanger: {
    backgroundColor: 'rgba(192,72,72,0.10)',
  },
  rowLabel: {
    flex: 1,
    fontSize: 16, fontFamily: font.medium, color: colors.textPrimary,
  },
  rowLabelDanger: {
    color: colors.danger,
  },
  cancelBtn: {
    marginTop: 8,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.surface2,
  },
  cancelText: {
    fontSize: 15, fontFamily: font.medium, color: colors.textMuted,
  },
})
