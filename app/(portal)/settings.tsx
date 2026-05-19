import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useState, useEffect, useCallback } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { usePortal } from '@/lib/context/PortalContext'
import { THEME_KEYS, PORTAL_THEMES, ThemeKey } from '@/lib/childThemes'
import { font, radius, shadow } from '@/lib/theme'

// ─── constants ───────────────────────────────────────────────────────────────

const EMOJI_GRID = [
  '🦁','🐯','🦊','🐺','🐻','🐼','🐨','🦝',
  '🦄','🐉','🦋','🐬','🐳','🦈','🦅','🦜',
  '😂','😍','🥺','😎','🥰','🤩','😅','🫠',
  '💀','👻','✨','🫶','👀','💅','🤡','🙏',
  '🌟','⭐','🌈','☀️','🌙','🔥','❄️','⚡',
  '⚽','🏀','🎾','🏈','⚾','🥊','🎮','🎸',
  '🍕','🍦','🧁','🍓','🧋','🍔','🌮','🍜',
  '🚀','🛸','🌍','🪐','🌌','🎯','🎨','🎬',
]

// ─── types ───────────────────────────────────────────────────────────────────

interface ParentRow { id: string; display_name: string; color: string }

// ─── screen ──────────────────────────────────────────────────────────────────

export default function PortalSettingsScreen() {
  const router = useRouter()
  const { theme, profile, setThemeKey, reload } = usePortal()

  // Local editable state — initialised from context/DB on load
  const [selectedTheme, setSelectedTheme] = useState<ThemeKey>(theme.key)
  const [selectedEmoji, setSelectedEmoji] = useState<string | null>(profile?.avatarEmoji ?? null)
  const [nicknames,    setNicknames]      = useState<Record<string, string>>({})
  const [origNicknames, setOrigNicknames] = useState<Record<string, string>>({})
  const [parents,  setParents]  = useState<ParentRow[]>([])
  const [childId,  setChildId]  = useState<string | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [saving, setSaving] = useState(false)

  // Only nicknames still need an explicit save — theme + emoji auto-save on tap
  const isDirty = JSON.stringify(nicknames) !== JSON.stringify(origNicknames)

  // ── load parents + nicknames ──
  const loadData = useCallback(async () => {
    setLoadingData(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const userId = session.user.id

      const { data: childRow } = await supabase
        .from('children')
        .select('id, connection_id, parent_nicknames')
        .eq('auth_user_id', userId)
        .maybeSingle()

      if (!childRow) return
      setChildId(childRow.id)

      const nickMap = (childRow.parent_nicknames ?? {}) as Record<string, string>
      setNicknames(nickMap)
      setOrigNicknames(nickMap)

      const { data: conn } = await supabase
        .from('co_parent_connections')
        .select('user_a_id, user_b_id')
        .eq('id', childRow.connection_id)
        .maybeSingle()

      if (!conn) return

      const { data: profs } = await supabase
        .from('profiles')
        .select('id, display_name, color')
        .in('id', [conn.user_a_id, conn.user_b_id])

      setParents((profs ?? []) as ParentRow[])
    } finally {
      setLoadingData(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN') && session) loadData()
    })
    return () => subscription.unsubscribe()
  }, [loadData])

  // Keep local state in sync if context profile loads after mount
  useEffect(() => {
    if (profile) {
      setSelectedEmoji(profile.avatarEmoji)
    }
    setSelectedTheme(theme.key)
  }, [profile?.id]) // only on first profile load, not on every theme change

  // ── theme: preview + auto-save on tap ──
  async function handleThemeSelect(key: ThemeKey) {
    setSelectedTheme(key)
    setThemeKey(key) // immediate visual preview
    if (!profile) return
    supabase.from('profiles').update({ theme: key }).eq('id', profile.id).then(() => {})
  }

  // ── emoji: auto-save on tap (null = remove) ──
  async function handleEmojiSelect(em: string | null) {
    setSelectedEmoji(em)
    if (!profile) return
    supabase.from('profiles').update({ avatar_emoji: em }).eq('id', profile.id).then(() => {
      reload() // sync context so home screen avatar updates
    })
  }

  // ── nicknames: still need explicit save ──
  async function handleSave() {
    if (!isDirty || saving || !childId) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('children')
        .update({ parent_nicknames: nicknames })
        .eq('id', childId)
      if (error) Alert.alert('Error', 'Could not save. Try again.')
      else setOrigNicknames({ ...nicknames })
    } finally {
      setSaving(false)
    }
  }

  async function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out', style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut()
          router.replace('/(auth)/login')
        },
      },
    ])
  }

  if (loadingData) {
    return (
      <SafeAreaView style={[S.container, { backgroundColor: theme.bg }]}>
        <View style={[S.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
          <View style={S.headerLeft} />
          <Text style={[S.headerTitle, { color: theme.textPrimary }]}>Settings</Text>
          <View style={S.headerRight} />
        </View>
        <ActivityIndicator style={S.loader} size="large" color={theme.accent} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[S.container, { backgroundColor: theme.bg }]}>
      {/* Header with sign-out always visible */}
      <View style={[S.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <View style={S.headerLeft} />
        <Text style={[S.headerTitle, { color: theme.textPrimary }]}>Settings</Text>
        <TouchableOpacity style={S.headerRight} onPress={handleSignOut} hitSlop={12} activeOpacity={0.7}>
          <Ionicons name="log-out-outline" size={22} color="#ef4444" />
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={S.scroll} showsVerticalScrollIndicator={false}>

        {/* ── My Profile ── */}
        <Text style={[S.sectionLabel, { color: theme.textMuted }]}>MY PROFILE</Text>
        <View style={[S.card, { backgroundColor: theme.surface }]}>
          <View style={S.avatarRow}>
            <View style={[S.avatarCircle, { backgroundColor: selectedEmoji ? 'transparent' : theme.accent }]}>
              <Text style={[S.avatarEmoji, selectedEmoji ? { fontSize: 39 } : { fontSize: 22, color: '#fff' }]}>
                {selectedEmoji ?? profile?.displayName?.[0]?.toUpperCase() ?? '?'}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[S.profileName, { color: theme.textPrimary }]}>{profile?.displayName}</Text>
              {selectedEmoji && (
                <TouchableOpacity
                  onPress={() => handleEmojiSelect(null)}
                  activeOpacity={0.7}
                  style={[S.removeEmojiBtn, { borderColor: theme.border }]}
                >
                  <Text style={[S.removeEmojiText, { color: theme.textMuted }]}>Remove emoji</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {/* ── Theme ── */}
        <Text style={[S.sectionLabel, { color: theme.textMuted }]}>THEME</Text>
        <View style={[S.card, { backgroundColor: theme.surface }]}>
          <View style={S.themeGrid}>
            {THEME_KEYS.map(key => {
              const t = PORTAL_THEMES[key]
              const isSelected = selectedTheme === key
              return (
                <TouchableOpacity
                  key={key}
                  style={S.themeItem}
                  onPress={() => handleThemeSelect(key)}
                  activeOpacity={0.7}
                >
                  <View style={[
                    S.swatch,
                    { backgroundColor: t.bg, borderColor: t.border },
                    isSelected && { borderColor: t.accent, borderWidth: 2.5 },
                  ]}>
                    <View style={[S.swatchAccent, { backgroundColor: t.accent }]} />
                    {isSelected && (
                      <View style={[S.swatchCheck, { backgroundColor: t.accent }]}>
                        <Ionicons name="checkmark" size={9} color="#fff" />
                      </View>
                    )}
                  </View>
                  <Text style={[
                    S.swatchLabel,
                    { color: isSelected ? theme.accent : theme.textMuted },
                    isSelected && { fontFamily: font.semibold },
                  ]}>
                    {t.label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        {/* ── Avatar emoji ── */}
        <Text style={[S.sectionLabel, { color: theme.textMuted }]}>AVATAR</Text>
        <View style={[S.card, { backgroundColor: theme.surface }]}>
          <View style={S.emojiGrid}>
            {EMOJI_GRID.map(em => (
              <TouchableOpacity
                key={em}
                style={[S.emojiCell, selectedEmoji === em && { backgroundColor: theme.accentSoft }]}
                onPress={() => handleEmojiSelect(em === selectedEmoji ? null : em)}
                activeOpacity={0.7}
              >
                <Text style={S.emojiText}>{em}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Parent Names ── */}
        {parents.length > 0 && (
          <>
            <Text style={[S.sectionLabel, { color: theme.textMuted }]}>PARENT NAMES</Text>
            <Text style={[S.sectionHint, { color: theme.textSubtle }]}>
              Only you can see these — pick what you want to call each parent.
            </Text>
            <View style={[S.card, { backgroundColor: theme.surface }]}>
              {parents.map((p, idx) => (
                <View key={p.id} style={[
                  S.nicknameRow,
                  idx < parents.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border },
                ]}>
                  <View style={[S.parentDot, { backgroundColor: p.color }]} />
                  <Text style={[S.parentName, { color: theme.textSecondary }]}>{p.display_name}</Text>
                  <TextInput
                    style={[S.nicknameInput, { color: theme.textPrimary, borderColor: theme.border, backgroundColor: theme.surface2 }]}
                    value={nicknames[p.id] ?? ''}
                    onChangeText={val => setNicknames(prev => ({ ...prev, [p.id]: val }))}
                    placeholder="Nickname…"
                    placeholderTextColor={theme.textSubtle}
                    maxLength={30}
                  />
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Save button ── */}
        {isDirty && (
          <TouchableOpacity
            style={[S.saveBtn, { backgroundColor: theme.accent }, saving && S.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.8}
          >
            <Text style={S.saveBtnText}>{saving ? 'Saving…' : 'Save Changes'}</Text>
          </TouchableOpacity>
        )}

        {/* ── Account ── */}
        <Text style={[S.sectionLabel, { color: theme.textMuted }]}>ACCOUNT</Text>
        <View style={[S.card, { backgroundColor: theme.surface }]}>
          <TouchableOpacity style={S.actionRow} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={20} color="#ef4444" style={S.actionIcon} />
            <Text style={S.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        <View style={S.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  )
}

// ─── styles ──────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  container: { flex: 1 },
  loader:    { flex: 1, justifyContent: 'center' },
  scroll:    { paddingHorizontal: 16, paddingTop: 16 },
  bottomPad: { height: 40 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft:  { width: 44, alignItems: 'flex-start', paddingLeft: 8 },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '600', fontFamily: font.semibold, textAlign: 'center' },
  headerRight: { width: 44, alignItems: 'flex-end', paddingRight: 8 },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', fontFamily: font.bold, letterSpacing: 0.8,
    marginTop: 20, marginBottom: 6, marginLeft: 4,
  },
  sectionHint: {
    fontSize: 12, fontFamily: font.regular, marginBottom: 8, marginLeft: 4,
  },

  card: { borderRadius: radius.md, overflow: 'hidden', ...shadow.sm, marginBottom: 4 },
  divider: { height: 1, marginHorizontal: 16 },

  // Profile
  avatarRow:    { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  avatarCircle: { width: 52, height: 52, borderRadius: radius.md, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarEmoji:  { backgroundColor: 'transparent' },
  profileName:  { fontSize: 16, fontWeight: '600', fontFamily: font.semibold, marginBottom: 6 },
  removeEmojiBtn: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  removeEmojiText: { fontSize: 12, fontFamily: font.medium },

  // Emoji grid
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, paddingBottom: 12 },
  emojiCell: { width: '12.5%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  emojiText: { fontSize: 22 },

  // Parent nicknames
  nicknameRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 10 },
  parentDot:   { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  parentName:  { fontSize: 13, fontFamily: font.medium, fontWeight: '500', width: 80, flexShrink: 0 },
  nicknameInput: {
    flex: 1, borderWidth: 1, borderRadius: radius.sm,
    paddingHorizontal: 10, paddingVertical: 7,
    fontSize: 14, fontFamily: font.regular,
  },

  // Theme picker
  themeGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12 },
  themeItem:  { alignItems: 'center', gap: 5, width: 58 },
  swatch: {
    width: 50, height: 50, borderRadius: 13, borderWidth: 1.5,
    position: 'relative',
  },
  // bottom radius slightly less than swatch (13 outer − 1.5 border ≈ 11) so it
  // conforms to the inner curve without relying on overflow:hidden
  swatchAccent: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 18,
    borderBottomLeftRadius: 11, borderBottomRightRadius: 11,
  },
  swatchCheck:  {
    position: 'absolute', top: 4, right: 4,
    width: 14, height: 14, borderRadius: 7,
    alignItems: 'center', justifyContent: 'center',
  },
  swatchLabel:  { fontSize: 11, fontFamily: font.regular, textAlign: 'center' },

  // Save
  saveBtn:         { marginTop: 16, paddingVertical: 14, borderRadius: radius.md, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText:     { color: '#fff', fontSize: 15, fontWeight: '600', fontFamily: font.semibold },

  // Account
  actionRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 15 },
  actionIcon:   { marginRight: 12 },
  signOutText:  { flex: 1, fontSize: 15, fontFamily: font.medium, color: '#ef4444', fontWeight: '500' },
})
