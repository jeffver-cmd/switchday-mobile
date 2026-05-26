import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../supabase'

// ─── types ───────────────────────────────────────────────────────────────────

export interface LastViewedInfo {
  userId: string
  displayName: string
  lastViewedAt: string
}

export interface ThreadSummary {
  id: string
  connectionId: string
  topic: string
  threadType: string
  lastMessageAt: string | null
  unreadCount: number
  lastViewedByOther: LastViewedInfo | null
}

export interface ThreadsData {
  userId: string
  connectionId: string
  threads: ThreadSummary[]
}

// ─── upsert thread_last_viewed ────────────────────────────────────────────────

export async function upsertThreadLastViewed(
  threadId: string,
  userId: string,
): Promise<void> {
  await supabase
    .from('thread_last_viewed')
    .upsert(
      { thread_id: threadId, user_id: userId, last_viewed_at: new Date().toISOString() },
      { onConflict: 'thread_id,user_id' },
    )
}

// ─── hook ────────────────────────────────────────────────────────────────────

export function useThreads() {
  const [data, setData] = useState<ThreadsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError('not_signed_in'); setLoading(false); return }
      const userId = session.user.id

      // Active connection
      const { data: connection } = await supabase
        .from('co_parent_connections')
        .select('id')
        .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
        .eq('status', 'active')
        .maybeSingle()

      if (!connection) { setError('no_connection'); setLoading(false); return }

      // Query message_threads directly by connection_id.
      // RLS handles access: co_parent threads are visible via is_connection_member;
      // family/child_parent threads are visible via thread_participants participant policy.
      // This avoids a thread_participants lookup that would miss co_parent threads
      // (which often have no participant rows).
      const { data: threadRows } = await supabase
        .from('message_threads')
        .select('id, connection_id, topic, thread_type, last_message_at')
        .eq('connection_id', connection.id)
        .neq('thread_type', 'archived' as never)
        .order('last_message_at', { ascending: false, nullsFirst: false })

      const threadIds = (threadRows ?? []).map(r => r.id)

      if (threadIds.length === 0) {
        setData({ userId, connectionId: connection.id, threads: [] })
        setLoading(false)
        return
      }

      const threads = threadRows ?? []

      // Unread counts + last viewed by other — run in parallel
      const [unreadResults, lastViewedResults] = await Promise.all([
        // Unread counts per thread
        supabase
          .from('messages')
          .select('thread_id, id', { count: 'exact' })
          .in('thread_id', threadIds)
          .neq('sender_id', userId)
          .is('read_at', null),

        // Who else has viewed each thread (excludes current user)
        supabase
          .from('thread_last_viewed')
          .select('thread_id, user_id, last_viewed_at')
          .in('thread_id', threadIds)
          .neq('user_id', userId),
      ])

      // Build unread count map
      const unreadMap: Record<string, number> = {}
      for (const msg of (unreadResults.data ?? [])) {
        unreadMap[msg.thread_id] = (unreadMap[msg.thread_id] ?? 0) + 1
      }

      // Fetch display names for all unique viewer IDs
      const viewedRows = lastViewedResults.data ?? []
      const viewerIds = [...new Set(viewedRows.map(r => r.user_id))]
      let profileMap: Record<string, string> = {}
      if (viewerIds.length > 0) {
        const { data: profileRows } = await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', viewerIds)
        for (const p of (profileRows ?? [])) {
          profileMap[p.id] = p.display_name ?? 'Co-parent'
        }
      }

      // Build last viewed map — most recent viewer per thread
      const lastViewedMap: Record<string, LastViewedInfo> = {}
      for (const row of viewedRows) {
        const existing = lastViewedMap[row.thread_id]
        if (!existing || row.last_viewed_at > existing.lastViewedAt) {
          lastViewedMap[row.thread_id] = {
            userId: row.user_id,
            displayName: profileMap[row.user_id] ?? 'Co-parent',
            lastViewedAt: row.last_viewed_at,
          }
        }
      }

      const summaries: ThreadSummary[] = threads.map(t => ({
        id: t.id,
        connectionId: t.connection_id,
        topic: t.topic ?? 'Conversation',
        threadType: t.thread_type ?? 'co_parent',
        lastMessageAt: t.last_message_at,
        unreadCount: unreadMap[t.id] ?? 0,
        lastViewedByOther: lastViewedMap[t.id] ?? null,
      }))

      setData({ userId, connectionId: connection.id, threads: summaries })
    } catch (e) {
      setError('load_failed')
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load + auth-state listener (handles token expiry / sign-in)
  const connectionIdRef = useRef<string | null>(null)
  const userIdRef = useRef<string | null>(null)
  useEffect(() => {
    load()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') load()
    })
    return () => subscription.unsubscribe()
  }, [load])

  useEffect(() => {
    connectionIdRef.current = data?.connectionId ?? null
    userIdRef.current = data?.userId ?? null
  }, [data?.connectionId, data?.userId])

  // Realtime — refresh thread list when a new message arrives or
  // when any other user's thread_last_viewed record changes
  useEffect(() => {
    if (!data?.connectionId) return
    const connectionId = data.connectionId
    const userId = data.userId

    const channel = supabase
      .channel(`threads-list:${connectionId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `connection_id=eq.${connectionId}`,
      }, () => {
        load()
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'thread_last_viewed',
      }, (payload: any) => {
        // Only refresh when someone else updates their view — ignore our own upserts
        const row = payload.new as { user_id?: string } | null
        if (!row || row.user_id === userId) return
        load()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [data?.connectionId, data?.userId, load])

  return { data, loading, error, refresh: load }
}

// ─── archive / unarchive ──────────────────────────────────────────────────────

export async function archiveThread(threadId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('message_threads')
    .update({ thread_type: 'archived' })
    .eq('id', threadId)
  return { error: error?.message ?? null }
}

export async function unarchiveThread(threadId: string, originalType: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('message_threads')
    .update({ thread_type: originalType as never })
    .eq('id', threadId)
  return { error: error?.message ?? null }
}
