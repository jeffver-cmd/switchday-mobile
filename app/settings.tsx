import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { useSettings } from '@/lib/hooks/useSettings'

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}

// ─── screen ──────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const router = useRouter()
  const { data, loading, error } = useSettings()

  async function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut()
          router.replace('/(auth)/login')
        },
      },
    ])
  }

  function handleBilling() {
    Linking.openURL('https://switchday.app/app/settings')
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#374151" />
      </SafeAreaView>
    )
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.errorText}>{error ?? 'Could not load settings'}</Text>
      </SafeAreaView>
    )
  }

  const { myProfile, coParentProfile, switchTime, switchTimezone } = data

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── My Profile ── */}
        <Text style={styles.sectionLabel}>MY PROFILE</Text>
        <View style={styles.card}>
          <View style={styles.profileRow}>
            <View style={[styles.avatarCircle, { backgroundColor: myProfile.color }]}>
              <Text style={styles.avatarText}>
                {myProfile.avatar_emoji ?? myProfile.initials}
              </Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{myProfile.display_name}</Text>
              <View style={[
                styles.planBadge,
                { backgroundColor: myProfile.plan === 'pro' ? '#111827' : '#e5e7eb' },
              ]}>
                <Text style={[
                  styles.planBadgeText,
                  { color: myProfile.plan === 'pro' ? '#ffffff' : '#6b7280' },
                ]}>
                  {myProfile.plan === 'pro' ? 'Pro' : 'Free'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Co-parent ── */}
        {coParentProfile && (
          <>
            <Text style={styles.sectionLabel}>CO-PARENT</Text>
            <View style={styles.card}>
              <View style={styles.profileRow}>
                <View style={[styles.avatarCircle, { backgroundColor: coParentProfile.color }]}>
                  <Text style={styles.avatarText}>{coParentProfile.initials}</Text>
                </View>
                <View style={styles.profileInfo}>
                  <Text style={styles.profileName}>{coParentProfile.display_name}</Text>
                  <View style={styles.connectedPill}>
                    <View style={styles.connectedDot} />
                    <Text style={styles.connectedText}>Connected</Text>
                  </View>
                </View>
              </View>
            </View>
          </>
        )}

        {/* ── Switch Defaults ── */}
        <Text style={styles.sectionLabel}>SWITCH DEFAULTS</Text>
        <View style={styles.card}>
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={18} color="#9ca3af" style={styles.infoIcon} />
            <Text style={styles.infoLabel}>Switch time</Text>
            <Text style={styles.infoValue}>
              {switchTime ? formatTime(switchTime) : 'Not set'}
            </Text>
          </View>
          {switchTimezone && (
            <View style={[styles.infoRow, styles.infoRowBorderless]}>
              <Ionicons name="globe-outline" size={18} color="#9ca3af" style={styles.infoIcon} />
              <Text style={styles.infoLabel}>Timezone</Text>
              <Text style={styles.infoValue}>{switchTimezone}</Text>
            </View>
          )}
        </View>

        {/* ── Account ── */}
        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.actionRow} onPress={handleBilling}>
            <Ionicons name="card-outline" size={20} color="#374151" style={styles.actionIcon} />
            <Text style={styles.actionText}>Manage Billing</Text>
            <Ionicons name="open-outline" size={16} color="#9ca3af" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionRow, styles.actionRowBorderless, styles.actionRowDestructive]}
            onPress={handleSignOut}
          >
            <Ionicons name="log-out-outline" size={20} color="#ef4444" style={styles.actionIcon} />
            <Text style={styles.actionTextDestructive}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  )
}

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#f9fafb' },
  centered:   { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb', paddingHorizontal: 24 },
  errorText:  { fontSize: 14, color: '#ef4444', textAlign: 'center' },

  // Header
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn:     { width: 32, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },

  // Scroll
  scroll:        { paddingHorizontal: 16, paddingTop: 8 },
  sectionLabel:  {
    fontSize: 11, fontWeight: '700', color: '#9ca3af', letterSpacing: 0.8,
    marginTop: 20, marginBottom: 8, marginLeft: 4,
  },
  bottomPad: { height: 40 },

  // Card
  card: {
    backgroundColor: '#ffffff', borderRadius: 16, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 1,
  },

  // Profile row
  profileRow:  { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  avatarCircle: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText:  { fontSize: 20, fontWeight: '700', color: '#ffffff' },
  profileInfo: { flex: 1, gap: 6 },
  profileName: { fontSize: 16, fontWeight: '600', color: '#111827' },

  // Plan badge
  planBadge:     { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  planBadgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },

  // Connected pill
  connectedPill: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start' },
  connectedDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: '#10b981' },
  connectedText: { fontSize: 12, color: '#10b981', fontWeight: '600' },

  // Info rows
  infoRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  infoRowBorderless: { borderBottomWidth: 0 },
  infoIcon:  { marginRight: 10 },
  infoLabel: { flex: 1, fontSize: 14, color: '#374151' },
  infoValue: { fontSize: 14, color: '#6b7280', fontWeight: '500' },

  // Action rows
  actionRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 15,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  actionRowBorderless:  { borderBottomWidth: 0 },
  actionRowDestructive: { },
  actionIcon:           { marginRight: 12 },
  actionText:           { flex: 1, fontSize: 15, color: '#111827' },
  actionTextDestructive:{ flex: 1, fontSize: 15, color: '#ef4444', fontWeight: '500' },
})
