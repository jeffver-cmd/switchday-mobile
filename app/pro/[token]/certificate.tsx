import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import { Ionicons } from '@expo/vector-icons'
import { useProPortal } from '@/lib/context/ProPortalContext'
import { font, radius } from '@/lib/theme'

const NAVY  = '#0F1B35'
const NAVY2 = '#1A2B47'
const AMBER = '#F59E0B'
const WHITE = '#FFFFFF'

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatRole(role: string) {
  switch (role) {
    case 'attorney': return 'Attorney'
    case 'mediator': return 'Mediator'
    case 'gal':      return 'Guardian ad Litem'
    default:         return role.charAt(0).toUpperCase() + role.slice(1)
  }
}

function formatExpiry(expiresAt: string | null) {
  if (!expiresAt) return 'No expiry'
  return new Date(expiresAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function CertRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.certRow, last && styles.certRowLast]}>
      <Text style={styles.certLabel}>{label}</Text>
      <Text style={styles.certValue}>{value}</Text>
    </View>
  )
}

// ─── main ─────────────────────────────────────────────────────────────────────

export default function CertificateScreen() {
  const { token } = useLocalSearchParams<{ token: string }>()
  const router    = useRouter()
  const { data }  = useProPortal()

  async function proceed() {
    if (!data) return
    await SecureStore.setItemAsync(`procert_${data.tokenId}`, 'true')
    router.replace(`/pro/${token}/portal`)
  }

  if (!data) return null

  // Record period: 180 days ago to today
  const recordSince = new Date()
  recordSince.setDate(recordSince.getDate() - 180)
  const recordPeriod = `${recordSince.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} – Today`

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <SafeAreaView edges={['top']} />

        {/* Shield icon */}
        <View style={styles.iconWrap}>
          <Ionicons name="shield-checkmark" size={64} color={AMBER} />
        </View>

        <Text style={styles.title}>Certified Records Access</Text>
        <Text style={styles.subtitle}>Switchday · Confidential</Text>

        {/* Cert table */}
        <View style={styles.certTable}>
          <CertRow
            label="Professional"
            value={`${data.professionalName} · ${formatRole(data.role)}`}
          />
          <CertRow
            label="Matter"
            value={`${data.parentA.display_name} & ${data.parentB.display_name}`}
          />
          <CertRow
            label="Record period"
            value={recordPeriod}
          />
          <CertRow
            label="Issued"
            value={new Date(data.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          />
          <CertRow
            label="Expiry"
            value={formatExpiry(data.expiresAt)}
            last
          />
        </View>

        {/* Integrity statement */}
        <Text style={styles.integrityText}>
          All records in this portal are protected by SHA-256 cryptographic hashing
          and RFC 3161 timestamp tokens. This portal is strictly read-only —
          no data can be added, edited, or deleted through this interface.
        </Text>

        {/* CTA */}
        <TouchableOpacity
          style={styles.cta}
          onPress={proceed}
          activeOpacity={0.85}
        >
          <Text style={styles.ctaText}>Proceed to Certified Records</Text>
        </TouchableOpacity>

        <SafeAreaView edges={['bottom']} />
      </ScrollView>
    </View>
  )
}

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: NAVY },
  scroll:       { padding: 28, alignItems: 'center', paddingBottom: 48 },

  iconWrap:     { marginTop: 16, marginBottom: 20, alignItems: 'center' },
  title:        { fontSize: 22, fontFamily: font.bold,    color: WHITE, textAlign: 'center', marginBottom: 4 },
  subtitle:     { fontSize: 12, fontFamily: font.regular, color: 'rgba(255,255,255,0.40)', textAlign: 'center', marginBottom: 28, letterSpacing: 0.5 },

  certTable:    {
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: 24,
    backgroundColor: NAVY2,
  },
  certRow:      {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    gap: 12,
  },
  certRowLast:  { borderBottomWidth: 0 },
  certLabel:    { fontSize: 12, fontFamily: font.medium, color: 'rgba(255,255,255,0.45)', flex: 1 },
  certValue:    { fontSize: 12, fontFamily: font.semibold, color: WHITE, flex: 2, textAlign: 'right' },

  integrityText:{ fontSize: 12, fontFamily: font.regular, color: 'rgba(255,255,255,0.45)', textAlign: 'center', lineHeight: 19, marginBottom: 32, paddingHorizontal: 4 },

  cta:          { backgroundColor: AMBER, borderRadius: radius.md, paddingVertical: 15, width: '100%', alignItems: 'center' },
  ctaText:      { fontSize: 15, fontFamily: font.bold, color: NAVY },
})
