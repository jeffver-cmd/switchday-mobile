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

const COLOR_PALETTE = [
  '#5B6B8A', '#A0605A', '#3D8A6B', '#7B5EA7',
  '#A85E28', '#3D7FA8', '#B05A8A', '#4A7A3D',
  '#8A6530', '#2E8B8B', '#A05080', '#7A6030',
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
  const [selectedColor, setSelectedColor] = useState<string>(profile?.color ?? COLOR_PALETTE[0])
  const [nicknames,    setNicknames]      = useState<Record<string, string>>({})
  const [origNicknames, setOrigNicknames] = useState<Record<string, string>>({})
  const [parents,  setParents]  = useState<ParentRow[]>([])
  const [childId,  setChildId]  = useState<string | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [saving, setSaving] = useState(false)

  const isDirty =
    selectedTheme !== theme.key ||
    selectedEmoji !== profile?.avatarEmoji ||
    selectedColor !== profile?.color ||
    JSON.stringify(nicknames) !== JSON.stringify(origNicknames)

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

  // Keep local state in sync if context profile loads after mount
  useEffect(() => {
    if (profile) {
      setSelectedEmoji(profile.avatarEmoji)
      setSelectedColor(profile.color)
    }
    setSelectedTheme(theme.key)
  }, [profile?.id]) // only on first profile load, not on every theme change

  // ── save ──
  async function handleSave() {
    if (!isDirty || saving || !profile) return
    setSaving(true)
    try {
      const profileUpdates: Record<string, unknown> = {}
      if (selectedTheme !== theme.key)          profileUpdates.theme        = selectedTheme
      if (selectedEmoji !== profile.avatarEmoji) profileUpdates.avatar_emoji = selectedEmoji
      if (selectedColor !== profile.color)       profileUpdates.color        = selectedColor

      const nicknamesDirty =
        JSON.stringify(nicknames) !== JSON.stringify(origNicknames)

      const [profileRes, nickRes] = await Promise.all([
        Object.keys(profileUpdates).length > 0
          ? supabase.from('profiles').update(profileUpdates).eq('id', profile.id)
          : Promise.resolve({ error: null }),

        nicknamesDirty && childId
          ? supabase.from('children').update({ parent_nicknames: nicknames }).eq('id', childId)
          : Promise.resolve({ error: null }),
      ])

      if (profileRes.error || nickRes.error) {
        Alert.alert('Error', 'Could not save changes. Try again.')
        return
      }

      setOrigNicknames({ ...nicknames })
      if (selectedTheme !== theme.key) setThemeKey(selectedTheme)
      reload()
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
        <ActivityIndicator style={S.loader} size="large" color={theme.accent} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[S.container, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={S.scroll} showsVerticalScrollIndicator={false}>

        {/* ── My Profile ── */}
        <Text style={[S.sectionLabel, { color: theme.textMuted }]}>MY PROFILE</Text>
        <View style={[S.card, { backgroundColor: theme.surface }]}>
          {/* Avatar preview */}
          <View style={S.avatarRow}>
            <View style={[S.avatarCircle, { backgroundColor: selectedEmoji ? 'transparent' : selectedColor }]}>
              <Text style={[S.avatarEmoji, selectedEmoji ? { fontSize: 39 } : { fontSize: 26 }]}>
                {selectedEmoji ?? profile?.initials ?? '?'}
              </Text>
            </View>
            <Text style={[S.profileName, { color: theme.textPrimary }]}>{profile?.displayName}</Text>
          </View>

          {/* Color picker */}
          <View style={[S.divider, { backgroundColor: theme.border }]} />
          <Text style={[S.subLabel, { color: theme.textMuted }]}>Profile color</Text>
          <View style={S.colorRow}>
            {COLOR_PALETTE.map(hex => (
              <TouchableOpacity
                key={hex}
                style={[S.colorDot, { backgroundColor: hex },
                  selectedColor === hex && [S.colorDotSelected, { borderColor: hex }],
                ]}
                onPress={() => { setSelectedColor(hex); setSelectedEmoji(null) }}
                activeOpacity={0.7}
              />
            ))}
          </View>

          {/* Emoji picker */}
          <View style={[S.divider, { backgroundColor: theme.border }]} />
          <Text style={[S.subLabel, { color: theme.textMuted }]}>Avatar</Text>
          <View style={S.emojiGrid}>
            {EMOJI_GRID.map(em => (
              <TouchableOpacity
                key={em}
                style={[S.emojiCell, selectedEmoji === em && { backgroundColor: theme.accentSoft }]}
                onPress={() => setSelectedEmoji(em === selectedEmoji ? null : em)}
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
                  onPress={() => setSelectedTheme(key)}
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
                        <Ionicons name="checkmark" size={11} color="#fff" />
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
  loader:    { flex: 1 },
  scroll:    { paddingHorizontal: 16, paddingTop: 16 },
  bottomPad: { height: 40 },

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
  avatarCircle: { width: 52, height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  avatarEmoji:  { color: '#fff', backgroundColor: 'transparent' },
  profileName:  { fontSize: 16, fontWeight: '600', fontFamily: font.semibold },

  // Color picker
  subLabel:  { fontSize: 12, fontWeight: '600', fontFamily: font.semibold, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 },
  colorRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 16, paddingBottom: 16 },
  colorDot:  { width: 30, height: 30, borderRadius: 15 },
  colorDotSelected: { borderWidth: 3, transform: [{ scale: 1.15 }] },

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
  themeGrid:  { flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 16 },
  themeItem:  { alignItems: 'center', gap: 6, width: 72 },
  swatch: {
    width: 64, height: 64, borderRadius: 16, borderWidth: 1.5,
    overflow: 'hidden', justifyContent: 'flex-end', position: 'relative',
  },
  swatchAccent: { height: 20, width: '100%' },
  swatchCheck:  {
    position: 'absolute', top: 6, right: 6,
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },
  swatchLabel:  { fontSize: 12, fontFamily: font.regular, textAlign: 'center' },

  // Save
  saveBtn:         { marginTop: 16, paddingVertical: 14, borderRadius: radius.md, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText:     { color: '#fff', fontSize: 15, fontWeight: '600', fontFamily: font.semibold },

  // Account
  actionRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 15 },
  actionIcon:   { marginRight: 12 },
  signOutText:  { flex: 1, fontSize: 15, fontFamily: font.medium, color: '#ef4444', fontWeight: '500' },
})
