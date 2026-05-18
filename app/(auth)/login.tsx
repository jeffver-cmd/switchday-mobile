import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native'
import { Link, useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { colors, radius, font } from '@/lib/theme'

export default function LoginScreen() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    if (!email || !password) return
    setLoading(true)
    const { data: { session }, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setLoading(false)
      Alert.alert('Sign in failed', error.message)
      return
    }

    // Check if this user is a child — route to portal if so
    const { data: childRow } = await supabase
      .from('children')
      .select('id')
      .eq('auth_user_id', session!.user.id)
      .maybeSingle()

    setLoading(false)
    if (childRow) {
      router.replace('/(portal)/calendar')
    } else {
      router.replace('/(tabs)/dashboard')
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.inner}>
        <Text style={styles.logo}>Switchday</Text>
        <Text style={styles.subtitle}>Sign in to your account</Text>

        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          placeholder="you@example.com"
          placeholderTextColor={colors.textSubtle}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={[styles.input, styles.inputSpacingBottom]}
          placeholder="••••••••"
          placeholderTextColor={colors.textSubtle}
          secureTextEntry
          autoComplete="password"
          value={password}
          onChangeText={setPassword}
        />

        <TouchableOpacity
          onPress={handleLogin}
          disabled={loading || !email || !password}
          style={[styles.button, (loading || !email || !password) && styles.buttonDisabled]}
        >
          {loading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.buttonText}>Sign in</Text>
          )}
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account? </Text>
          <Link href="/(auth)/signup" asChild>
            <TouchableOpacity>
              <Text style={styles.footerLink}>Sign up</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  logo: { fontSize: 30, fontWeight: '700', fontFamily: font.bold, color: colors.textPrimary, marginBottom: 8 },
  subtitle: { fontSize: 16, fontFamily: font.regular, color: colors.textMuted, marginBottom: 40 },
  label: { fontSize: 14, fontWeight: '500', fontFamily: font.medium, color: colors.textSecondary, marginBottom: 4 },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: font.regular,
    color: colors.textPrimary,
    marginBottom: 16,
  },
  inputSpacingBottom: { marginBottom: 24 },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: '600', fontFamily: font.semibold },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  footerText: { fontSize: 14, fontFamily: font.regular, color: colors.textMuted },
  footerLink: { fontSize: 14, fontWeight: '500', fontFamily: font.medium, color: colors.accent },
})
