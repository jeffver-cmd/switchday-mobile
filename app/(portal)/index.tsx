import { View, Text, SafeAreaView } from 'react-native'

// Child portal entry point — token-based auth handled here in a future session
export default function PortalEntryScreen() {
  return (
    <SafeAreaView className="flex-1 bg-white">
      <View className="flex-1 items-center justify-center px-6">
        <Text className="text-xl font-bold text-gray-900">Child Portal</Text>
        <Text className="mt-2 text-sm text-center text-gray-500">
          Token-based access — coming soon
        </Text>
      </View>
    </SafeAreaView>
  )
}
