import { useEffect } from 'react'
import { View, ActivityIndicator, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'

export default function Index() {
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace('/(auth)/login')
        return
      }

      // Check if this user is a child — route to portal if so
      const { data: childRow } = await supabase
        .from('children')
        .select('id')
        .eq('auth_user_id', session.user.id)
        .maybeSingle()

      if (childRow) {
        router.replace('/(portal)/calendar')
      } else {
        router.replace('/(tabs)/dashboard')
      }
    })
  }, [])

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#374151" />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff' },
})
