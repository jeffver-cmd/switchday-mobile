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
  ScrollView,
  StyleSheet,
  Linking,
} from 'react-native'
import { Link, useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { colors, radius, font } from '@/lib/theme'

export default function SignupScreen() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSignup() {
    if (!name || !email || !password) return
    setLoading(true)
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: name } },
    })
    setLoading(false)
    if (error) {
      Alert.alert('Sign up failed', error.message)
    } else {
      Alert.alert(
        'Check your email',
        'We sent you a confirmation link. Tap it to activate your account.',
        [{ text: 'OK', onPress: () => router.replace('/(auth)/login') }]
      )
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.logo}>Create account</Text>
        <Text style={styles.subtitle}>Get started with Switchday</Text>

        <Text style={styles.label}>Your name</Text>
        <TextInput
          style={styles.input}
          placeholder="Alex"
          placeholderTextColor={colors.textSubtle}
          autoCapitalize="words"
          autoComplete="name"
          value={name}
          onChangeText={setName}
        />

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
          placeholder="At least 8 characters"
          placeholderTextColor={colors.textSubtle}
          secureTextEntry
          autoComplete="new-password"
          value={password}
          onChangeText={setPassword}
        />

        <Text style={styles.legalNote}>
          By creating an account you agree to our{' '}
          <Text
            style={styles.legalLink}
            onPress={() => Linking.openURL('https://switchday.app/terms')}
          >
            Terms of Service
          </Text>
          {' '}and{' '}
          <Text
            style={styles.legalLink}
            onPress={() => Linking.openURL('https://switchday.app/privacy')}
          >
            Privacy Policy
          </Text>
          .
        </Text>

        <TouchableOpacity
          onPress={handleSignup}
          disabled={loading || !name || !email || !password}
          style={[styles.button, (loading || !name || !email || !password) && styles.buttonDisabled]}
        >
          {loading ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.buttonText}>Create account</Text>
          )}
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Already have an account? </Text>
          <Link href="/(auth)/login" asChild>
            <TouchableOpacity>
              <Text style={styles.footerLink}>Sign in</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 },
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
  legalNote: { fontSize: 12, fontFamily: font.regular, color: colors.textSubtle, textAlign: 'center', marginBottom: 16, lineHeight: 18 },
  legalLink: { color: colors.accent, fontFamily: font.medium, fontWeight: '500' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
  footerText: { fontSize: 14, fontFamily: font.regular, color: colors.textMuted },
  footerLink: { fontSize: 14, fontWeight: '500', fontFamily: font.medium, color: colors.accent },
})
