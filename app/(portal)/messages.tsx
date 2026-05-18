import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useState, useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { colors, radius, font } from '@/lib/theme'
import { usePortal } from '@/lib/context/PortalContext'

// ─── types ───────────────────────────────────────────────────────────────────

interface ThreadSummary {
  id: string
  connectionId: string
  topic: string          // already nickname-resolved for co_parent threads
  threadType: string
  lastMessageAt: string | null
  lastMessageBody: string | null
  lastMessageSenderId: string | null
  unreadCount: number
}

// ─── hook ────────────────────────────────────────────────────────────────────

function usePortalThreads() {
  const [threads, setThreads] = useState<ThreadSummary[]>([])
  const [userId, setUserId]   = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError('not_signed_in'); setLoading(false); return }
      const uid = session.user.id
      setUserId(uid)

      const { data: childRow } = await supabase
        .from('children').select('connection_id, parent_nicknames')
        .eq('auth_user_id', uid).maybeSingle()

      if (!childRow?.connection_id) { setError('no_child_record'); setLoading(false); return }
      const connectionId = childRow.connection_id
      const nicknames    = (childRow.parent_nicknames ?? {}) as Record<string, string>

      // Parallel: thread memberships + parent profiles
      const [participantRows, profResult] = await Promise.all([
        supabase.from('thread_participants').select('thread_id').eq('user_id', uid),
        supabase.from('profiles').select('id, display_name').neq('id', uid),
      ])

      // Build nickname-resolved first-name label for co-parent thread
      const parentFirstNames = (profResult.data ?? []).map(p => {
        const resolved = nicknames[p.id]?.trim() || p.display_name
        return resolved.split(' ')[0]   // first name / nickname
      })
      const coParentLabel = parentFirstNames.length > 0
        ? parentFirstNames.join(' & ')
        : 'Co-parents'

      const threadIds = (participantRows.data ?? []).map(r => r.thread_id)

      if (threadIds.length === 0) {
        setThreads([])
        setLoading(false)
        return
      }

      const [threadRows, lastMsgResult, unreadResult] = await Promise.all([
        supabase
          .from('message_threads')
          .select('id, connection_id, topic, thread_type, last_message_at')
          .in('id', threadIds)
          .eq('connection_id', connectionId)
          .order('last_message_at', { ascending: false, nullsFirst: false }),

        supabase
          .from('messages').select('thread_id, body, sender_id, sent_at')
          .in('thread_id', threadIds)
          .order('sent_at', { ascending: false })
          .limit(threadIds.length),

        supabase
          .from('messages').select('thread_id, id', { count: 'exact' })
          .in('thread_id', threadIds)
          .neq('sender_id', uid)
          .is('read_at', null),
      ])

      const lastMsgMap: Record<string, { body: string; senderId: string }> = {}
      for (const msg of (lastMsgResult.data ?? [])) {
        if (!lastMsgMap[msg.thread_id])
          lastMsgMap[msg.thread_id] = { body: msg.body, senderId: msg.sender_id }
      }

      const unreadMap: Record<string, number> = {}
      for (const msg of (unreadResult.data ?? []))
        unreadMap[msg.thread_id] = (unreadMap[msg.thread_id] ?? 0) + 1

      const summaries: ThreadSummary[] = (threadRows.data ?? []).map(t => {
        // Co-parent threads: use resolved parent nicknames instead of DB topic
        const topic = t.thread_type === 'co_parent'
          ? coParentLabel
          : (t.topic ?? 'Conversation')
        return {
          id: t.id,
          connectionId: t.connection_id,
          topic,
          threadType: t.thread_type ?? 'co_parent',
          lastMessageAt: t.last_message_at,
          lastMessageBody: lastMsgMap[t.id]?.body ?? null,
          lastMessageSenderId: lastMsgMap[t.id]?.senderId ?? null,
          unreadCount: unreadMap[t.id] ?? 0,
        }
      })

      setThreads(summaries)
    } catch { setError('load_failed') }
    finally   { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])
  return { threads, userId, loading, error, refresh: load }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

const THREAD_TYPE_LABELS: Record<string, string> = {
  co_parent:    'Co-parents',
  family:       'Family',
  with_child:   'With child',
}

function formatRelTime(iso: string | null): string {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60000)
  if (mins < 1)   return 'now'
  if (mins < 60)  return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs  < 24)  return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

// ─── screen ──────────────────────────────────────────────────────────────────

export default function PortalMessagesScreen() {
  const router = useRouter()
  const { theme } = usePortal()
  const { threads, loading, error, refresh } = usePortalThreads()

  if (loading) {
    return (
      <SafeAreaView style={[S.centered, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </SafeAreaView>
    )
  }

  if (error) {
    return (
      <SafeAreaView style={[S.centered, { backgroundColor: theme.bg }]}>
        <Text style={[S.errorText, { color: colors.danger }]}>Could not load messages</Text>
        <TouchableOpacity onPress={refresh} style={[S.retryBtn, { backgroundColor: theme.accent }]}>
          <Text style={S.retryText}>Try again</Text>
        </TouchableOpacity>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[S.container, { backgroundColor: theme.bg }]}>
      <View style={S.headerRow}>
        <Text style={[S.headerTitle, { color: theme.textPrimary }]}>Messages</Text>
      </View>
      {threads.length === 0 ? (
        <View style={S.emptyBox}>
          <Text style={[S.emptyTitle, { color: theme.textPrimary }]}>No messages</Text>
          <Text style={[S.emptySubtitle, { color: theme.textMuted }]}>Your conversations will appear here.</Text>
        </View>
      ) : (
        <FlatList
          data={threads}
          keyExtractor={t => t.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={theme.accent} />}
          renderItem={({ item: t }) => {
            const isUnread = t.unreadCount > 0
            return (
              <TouchableOpacity
                style={[S.threadRow, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}
                onPress={() => router.push(`/messages/${t.id}?connectionId=${t.connectionId}&topic=${encodeURIComponent(t.topic)}`)}
                activeOpacity={0.7}
              >
                <View style={[S.threadIcon, { backgroundColor: theme.surface2 }]}>
                  <Text style={S.threadIconText}>
                    {t.threadType === 'with_child' ? '👤' : t.threadType === 'family' ? '👨‍👩‍👧' : '💬'}
                  </Text>
                </View>
                <View style={S.threadBody}>
                  <View style={S.threadTopRow}>
                    <Text style={[S.threadTopic, { color: theme.textPrimary }, isUnread && S.threadTopicUnread]} numberOfLines={1}>
                      {t.topic}
                    </Text>
                    <Text style={[S.threadTime, { color: theme.textSubtle }]}>{formatRelTime(t.lastMessageAt)}</Text>
                  </View>
                  <View style={S.threadBottomRow}>
                    <Text style={[S.threadPreview, { color: theme.textMuted }, isUnread && { color: theme.textSecondary, fontWeight: '500', fontFamily: font.medium }]} numberOfLines={1}>
                      {t.lastMessageBody ?? THREAD_TYPE_LABELS[t.threadType] ?? 'Conversation'}
                    </Text>
                    {isUnread && (
                      <View style={[S.unreadBadge, { backgroundColor: theme.accent }]}>
                        <Text style={S.unreadBadgeText}>{t.unreadCount}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            )
          }}
        />
      )}
    </SafeAreaView>
  )
}

// ─── styles ──────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  container:  { flex: 1 },
  centered:   { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  errorText:  { fontSize: 14, fontFamily: font.regular, textAlign: 'center', marginBottom: 12 },
  retryBtn:   { paddingHorizontal: 20, paddingVertical: 10, borderRadius: radius.md },
  retryText:  { color: '#fff', fontWeight: '600', fontFamily: font.semibold, fontSize: 14 },

  headerRow:  { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  headerTitle:{ fontSize: 22, fontWeight: '700', fontFamily: font.bold },

  emptyBox:   { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '600', fontFamily: font.semibold, marginBottom: 8 },
  emptySubtitle: { fontSize: 13, fontFamily: font.regular, textAlign: 'center' },

  threadRow:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, gap: 12 },
  threadIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  threadIconText: { fontSize: 20 },
  threadBody: { flex: 1 },
  threadTopRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 },
  threadTopic:     { flex: 1, fontSize: 15, fontWeight: '500', fontFamily: font.medium, marginRight: 8 },
  threadTopicUnread: { fontWeight: '700', fontFamily: font.bold },
  threadTime:      { fontSize: 12, fontFamily: font.regular },
  threadBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  threadPreview:   { flex: 1, fontSize: 13, fontFamily: font.regular, marginRight: 8 },
  unreadBadge:     { minWidth: 20, height: 20, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  unreadBadgeText: { fontSize: 11, fontWeight: '700', fontFamily: font.bold, color: '#fff' },
})
