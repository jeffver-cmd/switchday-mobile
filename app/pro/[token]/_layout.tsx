import { Stack } from 'expo-router'
import { ProPortalProvider } from '@/lib/context/ProPortalContext'

export default function ProTokenLayout() {
  return (
    <ProPortalProvider>
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />
    </ProPortalProvider>
  )
}
