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
} from 'react-native'
import { Link, useRouter } from 'expo-router'
import { supabase } from '@/lib/supabase'

export default function LoginScreen() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    if (!email || !password) return
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (error) {
      Alert.alert('Sign in failed', error.message)
    } else {
      router.replace('/(tabs)/dashboard')
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-white"
    >
      <View className="flex-1 justify-center px-6">
        {/* Logo / wordmark */}
        <Text className="mb-2 text-3xl font-bold tracking-tight text-gray-900">
          Switchday
        </Text>
        <Text className="mb-10 text-base text-gray-500">
          Sign in to your account
        </Text>

        {/* Email */}
        <Text className="mb-1 text-sm font-medium text-gray-700">Email</Text>
        <TextInput
          className="mb-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
          placeholder="you@example.com"
          placeholderTextColor="#9ca3af"
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
        />

        {/* Password */}
        <Text className="mb-1 text-sm font-medium text-gray-700">Password</Text>
        <TextInput
          className="mb-6 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-base text-gray-900"
          placeholder="••••••••"
          placeholderTextColor="#9ca3af"
          secureTextEntry
          autoComplete="password"
          value={password}
          onChangeText={setPassword}
        />

        {/* Sign in button */}
        <TouchableOpacity
          onPress={handleLogin}
          disabled={loading || !email || !password}
          className="items-center rounded-xl bg-gray-800 py-4 disabled:opacity-50"
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text className="text-base font-semibold text-white">Sign in</Text>
          )}
        </TouchableOpacity>

        {/* Sign up link */}
        <View className="mt-6 flex-row justify-center">
          <Text className="text-sm text-gray-500">Don&apos;t have an account? </Text>
          <Link href="/(auth)/signup" asChild>
            <TouchableOpacity>
              <Text className="text-sm font-medium text-gray-900">Sign up</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}
