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
import { useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { colors, radius, font } from '@/lib/theme'
import { Ionicons } from '@expo/vector-icons'

export default function ForgotPasswordScreen() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleReset() {
    if (!email) return
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://switchday.app/app/reset-password',
    })
    setLoading(false)
    if (error) {
      Alert.alert('Error', error.message)
    } else {
      setSent(true)
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.inner}>
        {/* Back button */}
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={colors.textSecondary} />
          <Text style={styles.backText}>Back to sign in</Text>
        </TouchableOpacity>

        <Text style={styles.heading}>Reset password</Text>

        {sent ? (
          <View style={styles.successBox}>
            <Ionicons name="checkmark-circle" size={40} color={colors.success} style={{ marginBottom: 12 }} />
            <Text style={styles.successTitle}>Check your email</Text>
            <Text style={styles.successBody}>
              We sent a password reset link to {email}. Tap it to choose a new password.
            </Text>
            <TouchableOpacity
              style={styles.button}
              onPress={() => router.replace('/(auth)/login')}
            >
              <Text style={styles.buttonText}>Back to sign in</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.subtitle}>
              Enter the email address associated with your account and we'll send you a reset link.
            </Text>

            <Text style={styles.label}>Email</Text>
            <TextInput
              style={[styles.input, styles.inputSpacingBottom]}
              placeholder="you@example.com"
              placeholderTextColor={colors.textSubtle}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              autoFocus
              value={email}
              onChangeText={setEmail}
              onSubmitEditing={handleReset}
              returnKeyType="send"
            />

            <TouchableOpacity
              onPress={handleReset}
              disabled={loading || !email}
              style={[styles.button, (loading || !email) && styles.buttonDisabled]}
            >
              {loading ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.buttonText}>Send reset link</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  inner: { flex: 1, paddingHorizontal: 24, paddingTop: 60 },

  backBtn: { flexDirection: 'row', alignItems: 'center', marginBottom: 32, alignSelf: 'flex-start' },
  backText: { fontSize: 15, fontFamily: font.regular, color: colors.textSecondary, marginLeft: 2 },

  heading: { fontSize: 28, fontWeight: '700', fontFamily: font.bold, color: colors.textPrimary, marginBottom: 12 },
  subtitle: { fontSize: 15, fontFamily: font.regular, color: colors.textMuted, marginBottom: 32, lineHeight: 22 },

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

  successBox: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 8 },
  successTitle: { fontSize: 20, fontWeight: '700', fontFamily: font.bold, color: colors.textPrimary, marginBottom: 12 },
  successBody: { fontSize: 15, fontFamily: font.regular, color: colors.textMuted, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
})
