import '../global.css'
import { useEffect } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Stack, useRouter } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import * as Linking from 'expo-linking'
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'

SplashScreen.preventAutoHideAsync()

/**
 * Handle an incoming auth callback URL from Supabase email confirmation.
 * Supports both PKCE (code=...) and implicit (#access_token=...) flows.
 *
 * Prerequisites (one-time Supabase setup):
 *   Auth → URL Configuration → Redirect URLs → add "switchday://auth/callback"
 */
async function handleAuthCallbackUrl(url: string): Promise<boolean> {
  if (!url.includes('auth/callback')) return false

  // PKCE flow: ?code=...
  const codeMatch = url.match(/[?&]code=([^&#]+)/)
  if (codeMatch) {
    const { error } = await supabase.auth.exchangeCodeForSession(decodeURIComponent(codeMatch[1]))
    return !error
  }

  // Implicit flow: #access_token=...&refresh_token=...
  const hash = url.split('#')[1]
  if (hash) {
    const params = new URLSearchParams(hash)
    const accessToken  = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    if (accessToken && refreshToken) {
      const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      return !error
    }
  }

  return false
}

export default function RootLayout() {
  const router = useRouter()
  const url = Linking.useURL()

  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    // Ensure Ionicons font is loaded before any tab bar renders (iOS timing fix)
    ...Ionicons.font,
  })

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync()
    }
  }, [fontsLoaded, fontError])

  // ── Deep-link auth callback (email confirmation) ───────────────────────────
  useEffect(() => {
    if (!url) return
    handleAuthCallbackUrl(url).then(async (handled) => {
      if (!handled) return
      // Session is now set — figure out which screen to navigate to
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { data: childRow } = await supabase
        .from('children')
        .select('id')
        .eq('auth_user_id', session.user.id)
        .maybeSingle()
      if (childRow) {
        router.replace('/(portal)/home')
      } else {
        router.replace('/(tabs)/dashboard')
      }
    })
  }, [url, router])

  if (!fontsLoaded && !fontError) return null

  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(portal)" options={{ headerShown: false }} />
        <Stack.Screen name="messages/[threadId]" options={{ headerShown: false, presentation: 'card' }} />
        <Stack.Screen name="schedule/new" options={{ headerShown: false, presentation: 'card' }} />
        <Stack.Screen name="pro" options={{ headerShown: false }} />
      </Stack>
    </SafeAreaProvider>
  )
}
