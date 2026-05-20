import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useState } from 'react'
import * as SecureStore from 'expo-secure-store'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { useProPortal } from '@/lib/context/ProPortalContext'
import { font, radius } from '@/lib/theme'
import type { ProPortalData } from '@/lib/context/ProPortalContext'

const NAVY  = '#0F1B35'
const AMBER = '#F59E0B'
const WHITE = '#FFFFFF'

type ErrorType = 'revoked' | 'expired' | 'not_found' | 'internal_error'

interface ErrorState {
  type: ErrorType
  professionalName?: string
  expiresAt?: string
}

// ─── error screens ────────────────────────────────────────────────────────────

const ERROR_CONFIG: Record<ErrorType, { icon: string; title: string; body: (s: ErrorState) => string }> = {
  revoked: {
    icon:  'lock-closed',
    title: 'Access Revoked',
    body:  (s) => s.professionalName
      ? `Access for ${s.professionalName} has been revoked by the co-parents. Contact them to request a new link.`
      : 'This access link has been revoked. Contact the co-parents to request a new link.',
  },
  expired: {
    icon:  'time',
    title: 'Access Expired',
    body:  (s) => s.expiresAt
      ? `This access link expired on ${new Date(s.expiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}. Contact a co-parent to generate a new link.`
      : 'This access link has expired. Contact a co-parent to generate a new link.',
  },
  not_found: {
    icon:  'close-circle',
    title: 'Invalid Link',
    body:  () => 'This access link was not found. Make sure you opened the correct link from your email.',
  },
  internal_error: {
    icon:  'warning',
    title: 'Something Went Wrong',
    body:  () => 'Could not verify your access. Please check your connection and try again.',
  },
}

function ErrorScreen({ error, onRetry }: { error: ErrorState; onRetry?: () => void }) {
  const cfg = ERROR_CONFIG[error.type]
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.errorCard}>
        <Ionicons name={cfg.icon as any} size={48} color={AMBER} style={{ marginBottom: 16 }} />
        <Text style={styles.errorTitle}>{cfg.title}</Text>
        <Text style={styles.errorBody}>{cfg.body(error)}</Text>
        {error.type === 'internal_error' && onRetry && (
          <TouchableOpacity style={styles.retryBtn} onPress={onRetry} activeOpacity={0.80}>
            <Text style={styles.retryText}>Try Again</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  )
}

// ─── main ─────────────────────────────────────────────────────────────────────

export default function ProTokenEntry() {
  const { token } = useLocalSearchParams<{ token: string }>()
  const router    = useRouter()
  const { setData } = useProPortal()

  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<ErrorState | null>(null)

  useEffect(() => {
    if (!token) { setError({ type: 'not_found' }); setLoading(false); return }
    fetchPortalData()
  }, [token])

  async function fetchPortalData() {
    setLoading(true)
    setError(null)
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('pro-portal-data', {
        body: { token },
      })

      if (fnErr || !data) {
        setError({ type: 'internal_error' })
        setLoading(false)
        return
      }

      if (data.error) {
        setError({
          type:             data.error as ErrorType,
          professionalName: data.professionalName,
          expiresAt:        data.expiresAt,
        })
        setLoading(false)
        return
      }

      setData(data as ProPortalData)

      // procert_ prefix + tokenId (no colons — SecureStore key requirement)
      const certKey = `procert_${data.tokenId}`
      const seen    = await SecureStore.getItemAsync(certKey)

      router.replace(seen ? `/pro/${token}/portal` : `/pro/${token}/certificate`)
    } catch {
      setError({ type: 'internal_error' })
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={WHITE} />
        <Text style={styles.loadingText}>Verifying access…</Text>
      </View>
    )
  }

  if (error) {
    return (
      <ErrorScreen
        error={error}
        onRetry={error.type === 'internal_error' ? fetchPortalData : undefined}
      />
    )
  }

  return null
}

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: NAVY, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText:  { marginTop: 16, fontSize: 14, fontFamily: font.medium, color: 'rgba(255,255,255,0.60)' },

  errorCard:    { alignItems: 'center', maxWidth: 340 },
  errorTitle:   { fontSize: 20, fontFamily: font.bold,    color: WHITE, textAlign: 'center', marginBottom: 12 },
  errorBody:    { fontSize: 14, fontFamily: font.regular, color: 'rgba(255,255,255,0.60)', textAlign: 'center', lineHeight: 21 },

  retryBtn:     { marginTop: 24, backgroundColor: AMBER, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 28 },
  retryText:    { fontSize: 14, fontFamily: font.bold, color: NAVY },
})
