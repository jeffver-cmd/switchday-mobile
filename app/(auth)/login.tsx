import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native'
import { Link, useRouter, useLocalSearchParams } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { loadMedicalKey } from '@/lib/utils/medicalCrypto'
import { colors, radius, font } from '@/lib/theme'
import SwitchdayLogo from '@/components/SwitchdayLogo'

export default function LoginScreen() {
  const router = useRouter()
  const { reason } = useLocalSearchParams<{ reason?: string }>()
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

    // Fetch medical encryption key and store in device keychain (fire-and-forget)
    loadMedicalKey().catch(() => {})

    setLoading(false)
    if (childRow) {
      router.replace('/(portal)/home')
    } else {
      router.replace('/(tabs)/dashboard')
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.inner}
        keyboardShouldPersistTaps="handled"
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        <SwitchdayLogo size={44} />
        <Text style={styles.subtitle}>Sign in to your account</Text>

        {reason === 'inactivity' && (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>You were signed out due to inactivity.</Text>
          </View>
        )}

        {/* Email — wrapped so label + input move as one unit */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor={colors.textSubtle}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="username"
            returnKeyType="next"
            value={email}
            onChangeText={setEmail}
          />
        </View>

        {/* Password — wrapped so label + input move as one unit */}
        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={[styles.input, styles.inputSpacingBottom]}
            placeholder="••••••••"
            placeholderTextColor={colors.textSubtle}
            secureTextEntry
            autoComplete="password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={handleLogin}
            value={password}
            onChangeText={setPassword}
          />
        </View>

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

        <Link href="/(auth)/forgot-password" asChild>
          <TouchableOpacity style={styles.forgotRow}>
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>
        </Link>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account? </Text>
          <Link href="/(auth)/signup" asChild>
            <TouchableOpacity>
              <Text style={styles.footerLink}>Sign up</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  inner: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 },
  subtitle: { fontSize: 16, fontFamily: font.regular, color: colors.textMuted, marginBottom: 40, marginTop: 8 },

  // Each label+input pair is a single layout unit — prevents drift during keyboard animation
  fieldGroup: { marginBottom: 0 },
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
  forgotRow: { alignItems: 'center', marginTop: 16 },
  forgotText: { fontSize: 14, fontFamily: font.regular, color: colors.accent },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  footerText: { fontSize: 14, fontFamily: font.regular, color: colors.textMuted },
  footerLink: { fontSize: 14, fontWeight: '500', fontFamily: font.medium, color: colors.accent },
  notice: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 20,
  },
  noticeText: { fontSize: 13, fontFamily: font.regular, color: colors.textSecondary },
})
