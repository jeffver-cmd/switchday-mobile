import { Stack } from 'expo-router'

export default function PortalLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="calendar" />
      <Stack.Screen name="messages" />
      <Stack.Screen name="expenses" />
    </Stack>
  )
}
