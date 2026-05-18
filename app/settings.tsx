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
import { colors, radius, shadow, font } from '@/lib/theme'

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
        <ActivityIndicator size="large" color={colors.accent} />
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
          <Ionicons name="chevron-back" size={22} color={colors.textSecondary} />
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
                { backgroundColor: myProfile.plan === 'pro' ? colors.accent : colors.surface2 },
              ]}>
                <Text style={[
                  styles.planBadgeText,
                  { color: myProfile.plan === 'pro' ? colors.white : colors.textMuted },
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
            <Ionicons name="time-outline" size={18} color={colors.textSubtle} style={styles.infoIcon} />
            <Text style={styles.infoLabel}>Switch time</Text>
            <Text style={styles.infoValue}>
              {switchTime ? formatTime(switchTime) : 'Not set'}
            </Text>
          </View>
          {switchTimezone && (
            <View style={[styles.infoRow, styles.infoRowBorderless]}>
              <Ionicons name="globe-outline" size={18} color={colors.textSubtle} style={styles.infoIcon} />
              <Text style={styles.infoLabel}>Timezone</Text>
              <Text style={styles.infoValue}>{switchTimezone}</Text>
            </View>
          )}
        </View>

        {/* ── Account ── */}
        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.actionRow} onPress={handleBilling}>
            <Ionicons name="card-outline" size={20} color={colors.textSecondary} style={styles.actionIcon} />
            <Text style={styles.actionText}>Manage Billing</Text>
            <Ionicons name="open-outline" size={16} color={colors.textSubtle} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionRow, styles.actionRowBorderless]}
            onPress={handleSignOut}
          >
            <Ionicons name="log-out-outline" size={20} color={colors.danger} style={styles.actionIcon} />
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
  container:  { flex: 1, backgroundColor: colors.bg },
  centered:   { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, paddingHorizontal: 24 },
  errorText:  { fontSize: 14, fontFamily: font.regular, color: colors.danger, textAlign: 'center' },

  // Header
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn:     { width: 32, alignItems: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', fontFamily: font.bold, color: colors.textPrimary },

  // Scroll
  scroll:        { paddingHorizontal: 16, paddingTop: 8 },
  sectionLabel:  {
    fontSize: 11, fontWeight: '700', fontFamily: font.bold, color: colors.textSubtle, letterSpacing: 0.8,
    marginTop: 20, marginBottom: 8, marginLeft: 4,
  },
  bottomPad: { height: 40 },

  // Card
  card: {
    backgroundColor: colors.surface, borderRadius: radius.md, overflow: 'hidden',
    ...shadow.sm,
  },

  // Profile row
  profileRow:  { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  avatarCircle: {
    width: 48, height: 48, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText:  { fontSize: 20, fontWeight: '700', fontFamily: font.bold, color: colors.white },
  profileInfo: { flex: 1, gap: 6 },
  profileName: { fontSize: 16, fontWeight: '600', fontFamily: font.semibold, color: colors.textPrimary },

  // Plan badge
  planBadge:     { alignSelf: 'flex-start', borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  planBadgeText: { fontSize: 11, fontWeight: '700', fontFamily: font.bold, letterSpacing: 0.5 },

  // Connected pill
  connectedPill: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start' },
  connectedDot:  { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success },
  connectedText: { fontSize: 12, fontFamily: font.semibold, color: colors.success, fontWeight: '600' },

  // Info rows
  infoRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: colors.borderHair,
  },
  infoRowBorderless: { borderBottomWidth: 0 },
  infoIcon:  { marginRight: 10 },
  infoLabel: { flex: 1, fontSize: 14, fontFamily: font.regular, color: colors.textSecondary },
  infoValue: { fontSize: 14, fontFamily: font.medium, color: colors.textMuted, fontWeight: '500' },

  // Action rows
  actionRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 15,
    borderBottomWidth: 1, borderBottomColor: colors.borderHair,
  },
  actionRowBorderless:  { borderBottomWidth: 0 },
  actionIcon:           { marginRight: 12 },
  actionText:           { flex: 1, fontSize: 15, fontFamily: font.regular, color: colors.textPrimary },
  actionTextDestructive:{ flex: 1, fontSize: 15, fontFamily: font.medium, color: colors.danger, fontWeight: '500' },
})
