import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useState, useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { radius, font } from '@/lib/theme'
import { usePortal } from '@/lib/context/PortalContext'
import * as SecureStore from 'expo-secure-store'

// ─── types ───────────────────────────────────────────────────────────────────

interface ParentInfo { id: string; display_name: string; initials: string; color: string }

interface HomeData {
  todayOwner:     ParentInfo | null
  isTodaySwitch:  boolean
  nextSwitchDate: string | null   // ISO YYYY-MM-DD
  checklistItems: string[]
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function todayStr() { return new Date().toISOString().split('T')[0] }

function formatDate(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}

function diffDays(a: string, b: string) {
  return Math.round((new Date(a + 'T12:00:00').getTime() - new Date(b + 'T12:00:00').getTime()) / 86_400_000)
}

// ─── hook ────────────────────────────────────────────────────────────────────

function usePortalHome() {
  const [data, setData]       = useState<HomeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError('not_signed_in'); setLoading(false); return }
      const userId = session.user.id

      // 1. Get child row (connection + nicknames)
      const { data: childRow } = await supabase
        .from('children')
        .select('id, connection_id, parent_nicknames')
        .eq('auth_user_id', userId)
        .maybeSingle()

      if (!childRow?.connection_id) { setError('no_child_record'); setLoading(false); return }
      const connectionId = childRow.connection_id
      const nicknames    = (childRow.parent_nicknames ?? {}) as Record<string, string>

      const today = todayStr()
      // Look 14 days ahead to find the next switch date
      const twoWeeks = new Date(today)
      twoWeeks.setDate(twoWeeks.getDate() + 14)
      const aheadEnd = twoWeeks.toISOString().split('T')[0]

      // 2. Parallel fetch: schedule, parents, checklist
      const [schedResult, profResult, checklistResult] = await Promise.all([
        supabase
          .from('custody_schedule_current')
          .select('date, owner_id, is_switch')
          .eq('connection_id', connectionId)
          .gte('date', today)
          .lte('date', aheadEnd)
          .order('date', { ascending: true }),

        supabase
          .from('profiles')
          .select('id, display_name, initials, color')
          .neq('id', userId),

        supabase
          .from('switch_checklist_items')
          .select('item_text')
          .eq('connection_id', connectionId)
          .eq('active', true)
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: true }),
      ])

      // Build nickname-resolved parent map
      const parentMap: Record<string, ParentInfo> = {}
      for (const p of (profResult.data ?? [])) {
        parentMap[p.id] = {
          ...p,
          display_name: nicknames[p.id]?.trim() || p.display_name,
        }
      }

      // Today's schedule entry
      const schedRows  = schedResult.data ?? []
      const todayEntry = schedRows.find(r => r.date === today)
      const todayOwner = todayEntry ? (parentMap[todayEntry.owner_id] ?? null) : null

      // Next switch date (today or future)
      const nextSwitch = schedRows.find(r => r.is_switch && r.date >= today)

      const checklistItems = (checklistResult.data ?? []).map(r => r.item_text as string)

      setData({
        todayOwner,
        isTodaySwitch:  todayEntry?.is_switch ?? false,
        nextSwitchDate: nextSwitch?.date ?? null,
        checklistItems,
      })
    } catch { setError('load_failed') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // iOS Keychain is async — getSession() can return null on first render before
  // SecureStore has finished reading the token. Subscribe to onAuthStateChange
  // so that when INITIAL_SESSION fires with a real session we retry the load.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'INITIAL_SESSION' || event === 'SIGNED_IN') && session) {
        load()
      }
    })
    return () => subscription.unsubscribe()
  }, [load])

  return { data, loading, error, refresh: load }
}

// ─── child avatar ─────────────────────────────────────────────────────────────

function ChildAvatar({ size, color, emoji, initials }: { size: number; color: string; emoji: string | null; initials: string }) {
  return (
    <View style={{
      width: size, height: size,
      borderRadius: Math.round(size * 0.28),
      backgroundColor: emoji ? 'transparent' : color,
      alignItems: 'center', justifyContent: 'center',
    }}>
      {emoji
        ? <Text style={{ fontSize: Math.round(size * 0.56) }}>{emoji}</Text>
        : <Text style={{ fontSize: Math.round(size * 0.38), fontWeight: '700', fontFamily: font.bold, color: '#fff' }}>
            {initials.slice(0, 1)}
          </Text>
      }
    </View>
  )
}

// ─── parent avatar ────────────────────────────────────────────────────────────

function ParentAvatar({ size, color, initials }: { size: number; color: string; initials: string }) {
  return (
    <View style={{
      width: size, height: size,
      borderRadius: radius.md,
      backgroundColor: color,
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ fontSize: Math.round(size * 0.38), fontWeight: '700', fontFamily: font.bold, color: '#fff' }}>
        {initials.slice(0, 2)}
      </Text>
    </View>
  )
}

// ─── packing list card ────────────────────────────────────────────────────────

function PackingCard({ items, isApproaching, accentColor, theme }: {
  items: string[]
  isApproaching: boolean
  accentColor: string
  theme: ReturnType<typeof usePortal>['theme']
}) {
  const storeKey = `packing-list-${todayStr()}`
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const allPacked = items.length > 0 && checked.size === items.length

  // Load persisted state on mount
  useEffect(() => {
    SecureStore.getItemAsync(storeKey).then(val => {
      if (val) {
        try { setChecked(new Set(JSON.parse(val))) } catch { /* ignore */ }
      }
    }).catch(() => {})
  }, [storeKey])

  function persist(next: Set<string>) {
    SecureStore.setItemAsync(storeKey, JSON.stringify([...next])).catch(() => {})
  }

  function toggle(item: string) {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(item)) next.delete(item); else next.add(item)
      persist(next)
      return next
    })
  }

  function toggleAll() {
    const next = allPacked ? new Set<string>() : new Set(items)
    persist(next)
    setChecked(next)
  }

  return (
    <View style={[S.card, { backgroundColor: theme.surface, borderColor: isApproaching ? accentColor : theme.border, borderWidth: isApproaching ? 2 : 1 }]}>
      {/* Accent bar when switch approaching */}
      {isApproaching && <View style={[S.accentBar, { backgroundColor: accentColor }]} />}
      <View style={S.cardInner}>
        <View style={S.cardHeader}>
          <Text style={[S.sectionLabel, { color: isApproaching ? accentColor : theme.textMuted }]}>
            {allPacked ? '✓ ALL PACKED!' : 'WHAT TO PACK'}
          </Text>
          {isApproaching && (
            <View style={[S.badge, { backgroundColor: accentColor + '20' }]}>
              <Text style={[S.badgeText, { color: accentColor }]}>Switch coming up</Text>
            </View>
          )}
        </View>

        {/* "All packed!" row — hidden once everything is checked */}
        {!allPacked && <TouchableOpacity style={[S.checkRow, S.checkAllRow, { borderBottomColor: theme.border }]} onPress={toggleAll} activeOpacity={0.7}>
          <View
            style={[
              S.checkbox,
              { borderColor: allPacked ? accentColor : theme.border },
              allPacked && { backgroundColor: accentColor },
            ]}
          >
            {allPacked && <Text style={S.checkmark}>✓</Text>}
          </View>
          <Text style={[S.checkLabel, S.checkAllLabel, { color: allPacked ? theme.textMuted : theme.textPrimary }]}>
            All packed!
          </Text>
        </TouchableOpacity>}

        {items.map(item => (
          <TouchableOpacity key={item} style={S.checkRow} onPress={() => toggle(item)} activeOpacity={0.7}>
            <View
              style={[
                S.checkbox,
                { borderColor: checked.has(item) ? accentColor : theme.border },
                checked.has(item) && { backgroundColor: accentColor },
              ]}
            >
              {checked.has(item) && <Text style={S.checkmark}>✓</Text>}
            </View>
            <Text style={[S.checkLabel, { color: checked.has(item) ? theme.textMuted : theme.textPrimary }]}>
              {item}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )
}

// ─── screen ───────────────────────────────────────────────────────────────────

export default function PortalHomeScreen() {
  const { theme, profile } = usePortal()
  const { data, loading, error, refresh } = usePortalHome()
  const [refreshing, setRefreshing] = useState(false)

  async function onRefresh() {
    setRefreshing(true)
    await refresh()
    setRefreshing(false)
  }

  const firstName  = profile?.displayName?.split(' ')[0] ?? 'Hi'
  const today      = todayStr()

  // Is there a switch today or tomorrow?
  const isApproaching = !!data?.nextSwitchDate &&
    diffDays(data.nextSwitchDate, today) >= 0 &&
    diffDays(data.nextSwitchDate, today) <= 1

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
        <ScrollView
          contentContainerStyle={S.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
          showsVerticalScrollIndicator={false}
        >

          {/* ── Greeting ─────────────────────────────────────────────── */}
          <View style={S.greetRow}>
            {profile && (
              <ChildAvatar
                size={52}
                color={theme.accent}
                emoji={profile.avatarEmoji}
                initials={profile.initials}
              />
            )}
            <View style={{ flex: 1 }}>
              <Text style={[S.greetName, { color: theme.textPrimary }]}>Hi, {firstName}!</Text>
              <Text style={[S.greetSub, { color: theme.textMuted }]}>
                {formatDate(today)}
              </Text>
            </View>
          </View>

          {/* ── Loading / Error ────────────────────────────────────────── */}
          {loading && !data && (
            <View style={S.center}>
              <ActivityIndicator color={theme.accent} />
            </View>
          )}
          {error && !loading && (
            <View style={S.center}>
              <Text style={[S.errorText, { color: theme.textMuted }]}>Couldn't load schedule.</Text>
            </View>
          )}

          {/* ── Today card ─────────────────────────────────────────────── */}
          {data && (
            <View style={[S.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={[S.accentBar, { backgroundColor: data.todayOwner?.color ?? theme.accent }]} />
              <View style={S.cardInner}>
                <Text style={[S.sectionLabel, { color: theme.textMuted }]}>TODAY</Text>
                {data.todayOwner ? (
                  <View style={S.todayRow}>
                    <ParentAvatar size={44} color={data.todayOwner.color} initials={data.todayOwner.initials} />
                    <View style={{ flex: 1 }}>
                      <Text style={[S.withLabel, { color: theme.textPrimary }]}>
                        You're with {data.todayOwner.display_name}
                      </Text>
                      {data.isTodaySwitch && (
                        <View style={[S.badge, { backgroundColor: (data.todayOwner.color) + '20', marginTop: 4, alignSelf: 'flex-start' }]}>
                          <Text style={[S.badgeText, { color: data.todayOwner.color }]}>Switch day</Text>
                        </View>
                      )}
                    </View>
                  </View>
                ) : (
                  <Text style={[S.withLabel, { color: theme.textMuted }]}>No schedule for today.</Text>
                )}
              </View>
            </View>
          )}

          {/* ── Packing list ──────────────────────────────────────────── */}
          {data && data.checklistItems.length > 0 && (
            <PackingCard
              items={data.checklistItems}
              isApproaching={isApproaching}
              accentColor={theme.accent}
              theme={theme}
            />
          )}

          <View style={{ height: 32 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  )
}

// ─── styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  scroll: {
    padding: 20,
    paddingTop: 12,
  },

  greetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 20,
  },
  greetName: {
    fontSize: 26,
    fontWeight: '700',
    fontFamily: font.bold,
    letterSpacing: -0.4,
  },
  greetSub: {
    fontSize: 13,
    marginTop: 2,
    fontFamily: font.regular,
  },

  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 14,
  },
  accentBar: {
    height: 4,
  },
  cardInner: {
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },

  sectionLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.6,
    fontFamily: font.medium,
    textTransform: 'uppercase',
  },

  todayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
  },
  withLabel: {
    fontSize: 17,
    fontWeight: '600',
    fontFamily: font.semibold,
  },

  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: font.medium,
  },

  // packing list
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
  },
  checkAllRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
    paddingBottom: 10,
  },
  checkAllLabel: {
    fontFamily: font.medium,
    fontWeight: '600',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    fontSize: 11,
    color: '#fff',
    fontWeight: '700',
  },
  checkLabel: {
    fontSize: 15,
    flex: 1,
    fontFamily: font.regular,
  },

  center: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
    fontFamily: font.regular,
  },
})
