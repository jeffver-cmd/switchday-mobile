import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabase'

// ─── types ───────────────────────────────────────────────────────────────────

export interface ThreadSummary {
  id: string
  connectionId: string
  topic: string
  threadType: string
  lastMessageAt: string | null
  lastMessageBody: string | null
  lastMessageSenderId: string | null
  unreadCount: number
}

export interface ThreadsData {
  userId: string
  connectionId: string
  threads: ThreadSummary[]
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

      // Get threads the user participates in (for this connection)
      const { data: participantRows } = await supabase
        .from('thread_participants')
        .select('thread_id')
        .eq('user_id', userId)

      const threadIds = (participantRows ?? []).map(r => r.thread_id)

      if (threadIds.length === 0) {
        setData({ userId, connectionId: connection.id, threads: [] })
        setLoading(false)
        return
      }

      // Get thread details
      const { data: threadRows } = await supabase
        .from('message_threads')
        .select('id, connection_id, topic, thread_type, last_message_at')
        .in('id', threadIds)
        .eq('connection_id', connection.id)
        .order('last_message_at', { ascending: false, nullsFirst: false })

      const threads = threadRows ?? []

      // Get last message body per thread + unread counts
      const [lastMsgResults, unreadResults] = await Promise.all([
        // Last message for each thread — fetch the latest one per thread
        supabase
          .from('messages')
          .select('thread_id, body, sender_id, sent_at')
          .in('thread_id', threadIds)
          .order('sent_at', { ascending: false })
          .limit(threadIds.length * 1),  // at least 1 per thread — we'll dedupe below

        // Unread counts per thread
        supabase
          .from('messages')
          .select('thread_id, id', { count: 'exact' })
          .in('thread_id', threadIds)
          .neq('sender_id', userId)
          .is('read_at', null),
      ])

      // Build last message map (first occurrence per thread_id in desc order = latest)
      const lastMsgMap: Record<string, { body: string; senderId: string }> = {}
      for (const msg of (lastMsgResults.data ?? [])) {
        if (!lastMsgMap[msg.thread_id]) {
          lastMsgMap[msg.thread_id] = { body: msg.body, senderId: msg.sender_id }
        }
      }

      // Build unread count map
      const unreadMap: Record<string, number> = {}
      for (const msg of (unreadResults.data ?? [])) {
        unreadMap[msg.thread_id] = (unreadMap[msg.thread_id] ?? 0) + 1
      }

      const summaries: ThreadSummary[] = threads.map(t => ({
        id: t.id,
        connectionId: t.connection_id,
        topic: t.topic ?? 'Conversation',
        threadType: t.thread_type ?? 'co_parent',
        lastMessageAt: t.last_message_at,
        lastMessageBody: lastMsgMap[t.id]?.body ?? null,
        lastMessageSenderId: lastMsgMap[t.id]?.senderId ?? null,
        unreadCount: unreadMap[t.id] ?? 0,
      }))

      setData({ userId, connectionId: connection.id, threads: summaries })
    } catch (e) {
      setError('load_failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return { data, loading, error, refresh: load }
}
