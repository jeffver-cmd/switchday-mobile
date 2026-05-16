import '../global.css'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { Slot } from 'expo-router'

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Slot />
    </SafeAreaProvider>
  )
}
