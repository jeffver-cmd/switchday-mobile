import { View, Text, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function PortalEntryScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.inner}>
        <Text style={styles.heading}>Child Portal</Text>
        <Text style={styles.sub}>Token-based access — coming soon</Text>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  inner: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  heading: { fontSize: 20, fontWeight: '700', color: '#111827' },
  sub: { marginTop: 8, fontSize: 14, color: '#6b7280', textAlign: 'center' },
})
