import '../global.css'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Stack } from 'expo-router'

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(portal)" options={{ headerShown: false }} />
        <Stack.Screen name="messages/[threadId]" options={{ headerShown: false, presentation: 'card' }} />
        <Stack.Screen name="schedule/new" options={{ headerShown: false, presentation: 'card' }} />
        <Stack.Screen name="settings" options={{ headerShown: false, presentation: 'card' }} />
      </Stack>
    </SafeAreaProvider>
  )
}
