import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
  Alert,
  TextInput,
  Modal,
  Platform,
} from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useEffect, useState } from 'react'
import * as Notifications from 'expo-notifications'
import Constants from 'expo-constants'
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

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0'

export default function SettingsScreen() {
  const router = useRouter()
  const { data, loading, error } = useSettings()
  const [notifEnabled, setNotifEnabled] = useState<boolean | null>(null)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteSent, setInviteSent] = useState(false)

  async function handleSendInvite() {
    const email = inviteEmail.trim().toLowerCase()
    if (!email || !email.includes('@')) { Alert.alert('Enter a valid email address'); return }
    setInviting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { Alert.alert('Not signed in'); setInviting(false); return }

      // Check if already connected
      const { data: existing } = await supabase
        .from('co_parent_connections')
        .select('id, status')
        .or(`user_a_id.eq.${session.user.id},user_b_id.eq.${session.user.id}`)
        .maybeSingle()

      if (existing?.status === 'active') {
        Alert.alert('Already connected', 'You already have an active co-parent connection.')
        setInviting(false)
        return
      }

      if (existing?.status === 'pending') {
        Alert.alert('Invite pending', 'You already have a pending co-parent invite. Ask your co-parent to check their email and sign up at switchday.app.')
        setInviting(false)
        return
      }

      // Insert connection row with invited_email
      const { error: insertErr } = await supabase
        .from('co_parent_connections')
        .insert({ user_a_id: session.user.id, invited_email: email, status: 'pending' })

      if (insertErr) {
        Alert.alert('Error', insertErr.message)
        return
      }

      setInviteSent(true)
    } finally {
      setInviting(false)
    }
  }

  useEffect(() => {
    Notifications.getPermissionsAsync().then(({ status }) => {
      setNotifEnabled(status === 'granted')
    })
  }, [])

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

  // ── Switch time editing ──────────────────────────────────────────────────
  const [showSwitchTimeEdit, setShowSwitchTimeEdit] = useState(false)
  const [editSwitchTimeDt, setEditSwitchTimeDt] = useState<Date>(() => {
    const d = new Date()
    if (switchTime) {
      const [h, m] = switchTime.split(':').map(Number)
      d.setHours(h, m, 0, 0)
    } else {
      d.setHours(15, 0, 0, 0)
    }
    return d
  })
  const [showSwitchTimePicker, setShowSwitchTimePicker] = useState(false)
  const [switchTimeSaving, setSwitchTimeSaving] = useState(false)

  async function handleProposeSwitchTime() {
    if (!data?.connectionId) return
    setSwitchTimeSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const hhmm = `${String(editSwitchTimeDt.getHours()).padStart(2,'0')}:${String(editSwitchTimeDt.getMinutes()).padStart(2,'0')}:00`
      const { error: err } = await supabase
        .from('co_parent_connections')
        .update({
          pending_switch_time: hhmm,
          pending_switch_time_proposed_by: session.user.id,
          pending_switch_time_proposed_at: new Date().toISOString(),
        })
        .eq('id', data?.connectionId ?? '')
      if (err) { Alert.alert('Error', err.message); return }
      setShowSwitchTimeEdit(false)
      Alert.alert('Proposal sent', 'Your co-parent can approve the new switch time in their settings on the web app.')
    } finally {
      setSwitchTimeSaving(false)
    }
  }

  // ── Profile editing ──────────────────────────────────────────────────────
  const [showEditProfile, setShowEditProfile] = useState(false)
  const [editName, setEditName] = useState(myProfile.display_name)
  const [editColor, setEditColor] = useState(myProfile.color)
  const [editSaving, setEditSaving] = useState(false)

  const PROFILE_COLORS = [
    '#2B3A5C', '#5B6B8A', '#3D6B8A', '#3D8C6A', '#6B8A3D',
    '#8A5B3D', '#8A3D6B', '#6B3D8A', '#C4882A', '#C04848',
    '#4A7C6B', '#7B5EA7', '#6B7535', '#5A4A7A', '#A05080',
  ]

  async function handleSaveProfile() {
    if (!editName.trim()) { Alert.alert('Name required'); return }
    setEditSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const { error: err } = await supabase
        .from('profiles')
        .update({ display_name: editName.trim(), color: editColor })
        .eq('id', session.user.id)
      if (err) { Alert.alert('Error', err.message); return }
      setShowEditProfile(false)
    } finally {
      setEditSaving(false)
    }
  }

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
        <TouchableOpacity
          style={styles.card}
          onPress={() => { setEditName(myProfile.display_name); setEditColor(myProfile.color); setShowEditProfile(true) }}
          activeOpacity={0.75}
        >
          <View style={styles.profileRow}>
            <View style={[styles.avatarCircle, { backgroundColor: editColor === myProfile.color ? myProfile.color : editColor }]}>
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
            <Ionicons name="pencil" size={15} color={colors.textSubtle} />
          </View>
        </TouchableOpacity>

        {/* Profile edit modal */}
        <Modal visible={showEditProfile} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowEditProfile(false)}>
          <View style={{ flex: 1, backgroundColor: colors.bg, padding: 24, paddingTop: 48 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
              <TouchableOpacity onPress={() => setShowEditProfile(false)}>
                <Text style={{ color: colors.textMuted, fontSize: 16 }}>Cancel</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 17, fontWeight: '600', fontFamily: font.semibold, color: colors.textPrimary }}>Edit Profile</Text>
              <TouchableOpacity onPress={handleSaveProfile} disabled={editSaving}>
                {editSaving
                  ? <ActivityIndicator size="small" color={colors.accent} />
                  : <Text style={{ color: colors.accent, fontSize: 16, fontWeight: '600', fontFamily: font.semibold }}>Save</Text>}
              </TouchableOpacity>
            </View>

            {/* Name */}
            <Text style={{ fontSize: 12, fontWeight: '600', fontFamily: font.semibold, color: colors.textSubtle, letterSpacing: 0.8, marginBottom: 6 }}>
              DISPLAY NAME
            </Text>
            <TextInput
              style={{
                backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
                borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 13,
                fontSize: 16, fontFamily: font.regular, color: colors.textPrimary, marginBottom: 28,
              }}
              value={editName}
              onChangeText={setEditName}
              maxLength={80}
              autoFocus
            />

            {/* Color */}
            <Text style={{ fontSize: 12, fontWeight: '600', fontFamily: font.semibold, color: colors.textSubtle, letterSpacing: 0.8, marginBottom: 12 }}>
              ACCENT COLOR
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {PROFILE_COLORS.map(c => (
                <TouchableOpacity
                  key={c}
                  onPress={() => setEditColor(c)}
                  style={{
                    width: 40, height: 40, borderRadius: 20, backgroundColor: c,
                    borderWidth: editColor === c ? 3 : 0,
                    borderColor: colors.textPrimary,
                  }}
                />
              ))}
            </View>

            {/* Preview */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 28, padding: 16, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border }}>
              <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: editColor, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '700', fontFamily: font.bold, fontSize: 16 }}>
                  {editName.trim().charAt(0).toUpperCase() || myProfile.initials}
                </Text>
              </View>
              <Text style={{ fontSize: 16, fontWeight: '600', fontFamily: font.semibold, color: colors.textPrimary }}>
                {editName.trim() || myProfile.display_name}
              </Text>
            </View>
          </View>
        </Modal>

        {/* ── Co-parent ── */}
        {coParentProfile ? (
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
        ) : (
          <>
            <Text style={styles.sectionLabel}>CO-PARENT</Text>
            <View style={styles.card}>
              <Text style={{ fontSize: 13, color: colors.textMuted, marginBottom: 12, lineHeight: 18 }}>
                Invite your co-parent to share your custody calendar, messages, and expenses.
              </Text>
              <TouchableOpacity
                style={{ backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 12, alignItems: 'center' }}
                onPress={() => { setShowInvite(true); setInviteSent(false); setInviteEmail('') }}
              >
                <Text style={{ color: colors.white, fontWeight: '600', fontFamily: font.semibold, fontSize: 15 }}>
                  Invite co-parent
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Invite modal */}
        <Modal visible={showInvite} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowInvite(false)}>
          <View style={{ flex: 1, backgroundColor: colors.bg, padding: 24, paddingTop: 48 }}>
            <TouchableOpacity onPress={() => setShowInvite(false)} style={{ marginBottom: 24, alignSelf: 'flex-start' }}>
              <Text style={{ fontSize: 16, color: colors.textMuted }}>Cancel</Text>
            </TouchableOpacity>
            {inviteSent ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>
                <Text style={{ fontSize: 48, marginBottom: 16 }}>✉️</Text>
                <Text style={{ fontSize: 20, fontWeight: '700', fontFamily: font.bold, color: colors.textPrimary, marginBottom: 8, textAlign: 'center' }}>
                  Invite sent!
                </Text>
                <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 32 }}>
                  Ask your co-parent to sign up at switchday.app using the email address you entered. You'll be connected automatically.
                </Text>
                <TouchableOpacity
                  style={{ backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: 32 }}
                  onPress={() => setShowInvite(false)}
                >
                  <Text style={{ color: colors.white, fontWeight: '600', fontFamily: font.semibold, fontSize: 15 }}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={{ fontSize: 24, fontWeight: '700', fontFamily: font.bold, color: colors.textPrimary, marginBottom: 8 }}>
                  Invite your co-parent
                </Text>
                <Text style={{ fontSize: 14, color: colors.textMuted, marginBottom: 32, lineHeight: 20 }}>
                  Enter their email address. They'll receive a link to create their account and will be automatically connected to you.
                </Text>
                <Text style={{ fontSize: 12, fontWeight: '600', fontFamily: font.semibold, color: colors.textSecondary, marginBottom: 6 }}>
                  CO-PARENT'S EMAIL
                </Text>
                <TextInput
                  style={{
                    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
                    borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 14,
                    fontSize: 16, fontFamily: font.regular, color: colors.textPrimary, marginBottom: 24,
                  }}
                  value={inviteEmail}
                  onChangeText={setInviteEmail}
                  placeholder="email@example.com"
                  placeholderTextColor={colors.textSubtle}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoFocus
                />
                <TouchableOpacity
                  style={[
                    { backgroundColor: colors.accent, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center' },
                    (inviting || !inviteEmail.trim()) && { opacity: 0.5 },
                  ]}
                  onPress={handleSendInvite}
                  disabled={inviting || !inviteEmail.trim()}
                >
                  {inviting
                    ? <ActivityIndicator color={colors.white} />
                    : <Text style={{ color: colors.white, fontWeight: '600', fontFamily: font.semibold, fontSize: 15 }}>Send invite</Text>
                  }
                </TouchableOpacity>
              </>
            )}
          </View>
        </Modal>

        {/* ── Switch Defaults ── */}
        <Text style={styles.sectionLabel}>SWITCH DEFAULTS</Text>
        <View style={styles.card}>
          <View style={styles.infoRow}>
            <Ionicons name="time-outline" size={18} color={colors.textSubtle} style={styles.infoIcon} />
            <Text style={styles.infoLabel}>Switch time</Text>
            <Text style={styles.infoValue}>
              {switchTime ? formatTime(switchTime) : 'Not set'}
            </Text>
            {data.connectionId && (
              <TouchableOpacity
                onPress={() => { setShowSwitchTimeEdit(true); setShowSwitchTimePicker(false) }}
                style={{ marginLeft: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: colors.accentSoft }}
              >
                <Text style={{ fontSize: 12, color: colors.accent, fontFamily: font.semibold }}>Propose</Text>
              </TouchableOpacity>
            )}
          </View>
          {switchTimezone && (
            <View style={[styles.infoRow, styles.infoRowBorderless]}>
              <Ionicons name="globe-outline" size={18} color={colors.textSubtle} style={styles.infoIcon} />
              <Text style={styles.infoLabel}>Timezone</Text>
              <Text style={styles.infoValue}>{switchTimezone}</Text>
            </View>
          )}
        </View>

        {/* Switch time edit modal */}
        <Modal visible={showSwitchTimeEdit} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowSwitchTimeEdit(false)}>
          <View style={{ flex: 1, backgroundColor: colors.bg, padding: 24, paddingTop: 48 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <TouchableOpacity onPress={() => setShowSwitchTimeEdit(false)}>
                <Text style={{ color: colors.textMuted, fontSize: 16 }}>Cancel</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 17, fontWeight: '600', fontFamily: font.semibold, color: colors.textPrimary }}>Propose switch time</Text>
              <TouchableOpacity onPress={handleProposeSwitchTime} disabled={switchTimeSaving}>
                {switchTimeSaving
                  ? <ActivityIndicator size="small" color={colors.accent} />
                  : <Text style={{ color: colors.accent, fontSize: 16, fontWeight: '600', fontFamily: font.semibold }}>Propose</Text>}
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 13, color: colors.textMuted, marginBottom: 24, lineHeight: 18 }}>
              Your co-parent will receive a notification and can approve the new time in their settings.
            </Text>
            <TouchableOpacity
              style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center', marginBottom: 12 }}
              onPress={() => setShowSwitchTimePicker(p => !p)}
            >
              <Text style={{ fontSize: 24, fontWeight: '700', fontFamily: font.bold, color: colors.textPrimary }}>
                {editSwitchTimeDt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </Text>
              <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 4 }}>Tap to change</Text>
            </TouchableOpacity>
            {showSwitchTimePicker && (
              <>
                <DateTimePicker
                  value={editSwitchTimeDt}
                  mode="time"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(_e, d) => { if (d) setEditSwitchTimeDt(d); if (Platform.OS !== 'ios') setShowSwitchTimePicker(false) }}
                />
                {Platform.OS === 'ios' && (
                  <TouchableOpacity onPress={() => setShowSwitchTimePicker(false)} style={{ alignItems: 'center', paddingVertical: 8 }}>
                    <Text style={{ color: colors.accent, fontFamily: font.medium, fontSize: 15 }}>Done</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        </Modal>

        {/* ── Notifications ── */}
        <Text style={styles.sectionLabel}>NOTIFICATIONS</Text>
        <View style={styles.card}>
          <TouchableOpacity
            style={[styles.actionRow, styles.actionRowBorderless]}
            onPress={() => Linking.openSettings()}
          >
            <Ionicons name="notifications-outline" size={20} color={colors.textSecondary} style={styles.actionIcon} />
            <View style={{ flex: 1 }}>
              <Text style={styles.actionText}>Push notifications</Text>
              {notifEnabled !== null && (
                <Text style={[styles.notifStatus, { color: notifEnabled ? colors.success : colors.textSubtle }]}>
                  {notifEnabled ? 'Enabled' : 'Disabled — tap to open Settings'}
                </Text>
              )}
            </View>
            <Ionicons name="open-outline" size={16} color={colors.textSubtle} />
          </TouchableOpacity>
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
            style={styles.actionRow}
            onPress={() => Linking.openURL('https://switchday.app/privacy')}
          >
            <Ionicons name="shield-checkmark-outline" size={20} color={colors.textSecondary} style={styles.actionIcon} />
            <Text style={styles.actionText}>Privacy Policy</Text>
            <Ionicons name="open-outline" size={16} color={colors.textSubtle} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => Linking.openURL('https://switchday.app/terms')}
          >
            <Ionicons name="document-text-outline" size={20} color={colors.textSecondary} style={styles.actionIcon} />
            <Text style={styles.actionText}>Terms of Service</Text>
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

        {/* ── App info ── */}
        <Text style={styles.versionText}>Switchday v{APP_VERSION}</Text>

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

  // Notification status
  notifStatus: { fontSize: 12, fontFamily: font.regular, marginTop: 1 },

  // App version
  versionText: {
    textAlign: 'center', fontSize: 12, fontFamily: font.regular,
    color: colors.textSubtle, marginTop: 24,
  },
})
