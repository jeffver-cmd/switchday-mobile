import { useEffect, useState, useCallback, useRef } from 'react'
import * as Crypto from 'expo-crypto'
import { supabase } from '../supabase'

// ─── types ───────────────────────────────────────────────────────────────────

export interface Message {
  id: string
  threadId: string
  connectionId: string
  senderId: string
  body: string
  sentAt: string
  readAt: string | null
}

export interface MessagesData {
  userId: string
  myColor: string   // current user's profile color — used to tint sent bubbles
  isPro: boolean    // whether the current user (or their connection) is on a Pro plan
  messages: Message[]
}

export interface ToneAnalysisResult {
  tone: 'calm' | 'neutral' | 'tense' | 'hostile'
  score: number
  flags: string[]
  rewrite: string | null
  coaching_note: string
  needs_intercept: boolean
}

export interface ToneMeta {
  score?: number
  flags?: string[]
  coachingOffered?: boolean
  coachingAccepted?: boolean
}

// ─── api helper ──────────────────────────────────────────────────────────────

/**
 * Call the analyze-tone Edge Function before sending a message.
 * Returns null on any failure — callers should treat null as "send without analysis".
 */
export async function analyzeTone(message: string): Promise<ToneAnalysisResult | null> {
  try {
    const { data, error } = await supabase.functions.invoke('analyze-tone', {
      body: { message },
    })
    if (error || !data) return null
    return data as ToneAnalysisResult
  } catch {
    return null
  }
}

export async function sendMessage(
  threadId: string,
  connectionId: string,
  body: string,
  toneMeta?: ToneMeta,
): Promise<{ error: string | null }> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { error: 'not_signed_in' }
    const userId = session.user.id

    // sha256 of the body — satisfies messages.sha256_hash NOT NULL constraint
    const sha256_hash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      body,
    )

    // Direct insert — messages_update_thread trigger handles thread.last_message_at
    // No .select() — avoids SELECT-RLS blocking the return row for some thread types
    const { error: insertErr } = await supabase
      .from('messages')
      .insert({
        thread_id:         threadId,
        connection_id:     connectionId,
        sender_id:         userId,
        body,
        sha256_hash,
        tone_score:        toneMeta?.score        ?? null,
        tone_flags:        toneMeta?.flags        ?? null,
        coaching_offered:  toneMeta?.coachingOffered  ?? null,
        coaching_accepted: toneMeta?.coachingAccepted ?? null,
      })

    if (insertErr) return { error: insertErr.message }

    // Audit log — fire and forget (use threadId as resource_id)
    const auditMeta = { thread_id: threadId, connection_id: connectionId, body_length: body.length }
    const auditPayload = { actor_id: userId, action: 'message.sent', resource_id: threadId, metadata: auditMeta }
    const auditHash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      JSON.stringify(auditPayload),
    )
    supabase.from('audit_log').insert({
      actor_id: userId, action: 'message.sent',
      resource_type: 'messages', resource_id: threadId,
      metadata: auditMeta, sha256_hash: auditHash,
    }).then(() => {})

    return { error: null }
  } catch {
    return { error: 'network_error' }
  }
}

// ─── mark read ───────────────────────────────────────────────────────────────

export async function markThreadRead(threadId: string, userId: string): Promise<void> {
  await supabase
    .from('messages')
    .update({ read_at: new Date().toISOString() })
    .eq('thread_id', threadId)
    .neq('sender_id', userId)
    .is('read_at', null)
}

// ─── hook ────────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50

export function useMessages(threadId: string) {
  const [data, setData] = useState<MessagesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const userIdRef = useRef<string | null>(null)
  const oldestIdRef = useRef<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError('not_signed_in'); setLoading(false); return }
      const userId = session.user.id
      userIdRef.current = userId

      const [{ data: rows, error: err }, { data: profileRow }] = await Promise.all([
        // Fetch newest PAGE_SIZE messages descending, then reverse for display
        supabase
          .from('messages')
          .select('id, thread_id, connection_id, sender_id, body, sent_at, read_at')
          .eq('thread_id', threadId)
          .order('sent_at', { ascending: false })
          .limit(PAGE_SIZE),
        supabase
          .from('profiles')
          .select('color, plan')
          .eq('id', userId)
          .maybeSingle(),
      ])

      if (err) { setError(err.message); setLoading(false); return }

      const profile = profileRow as { color?: string; plan?: string | null } | null
      const myColor = profile?.color ?? '#5B6B8A'
      const plan = profile?.plan ?? 'free'
      const isPro = plan === 'pro' || plan === 'standard' || plan === 'premium'

      const ascending = [...(rows ?? [])].reverse()
      const messages: Message[] = ascending.map(r => ({
        id: r.id,
        threadId: r.thread_id,
        connectionId: r.connection_id,
        senderId: r.sender_id,
        body: r.body,
        sentAt: r.sent_at,
        readAt: r.read_at,
      }))

      oldestIdRef.current = messages[0]?.id ?? null
      setHasMore((rows ?? []).length === PAGE_SIZE)
      setData({ userId, myColor, isPro, messages })

      // Mark unread messages as read
      await markThreadRead(threadId, userId)
    } catch {
      setError('load_failed')
    } finally {
      setLoading(false)
    }
  }, [threadId])

  const loadMore = useCallback(async () => {
    if (!data || loadingMore || !hasMore) return
    const oldest = data.messages[0]
    if (!oldest) return
    setLoadingMore(true)
    try {
      const { data: rows } = await supabase
        .from('messages')
        .select('id, thread_id, connection_id, sender_id, body, sent_at, read_at')
        .eq('thread_id', threadId)
        .lt('sent_at', oldest.sentAt)
        .order('sent_at', { ascending: false })
        .limit(PAGE_SIZE)

      const older: Message[] = [...(rows ?? [])].reverse().map(r => ({
        id: r.id,
        threadId: r.thread_id,
        connectionId: r.connection_id,
        senderId: r.sender_id,
        body: r.body,
        sentAt: r.sent_at,
        readAt: r.read_at,
      }))
      setHasMore((rows ?? []).length === PAGE_SIZE)
      setData(prev => prev ? { ...prev, messages: [...older, ...prev.messages] } : prev)
    } finally {
      setLoadingMore(false)
    }
  }, [data, loadingMore, hasMore, threadId])

  // Realtime subscription
  useEffect(() => {
    load()

    const channel = supabase
      .channel(`messages:${threadId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string
            thread_id: string
            connection_id: string
            sender_id: string
            body: string
            sent_at: string
            read_at: string | null
          }
          const newMsg: Message = {
            id: row.id,
            threadId: row.thread_id,
            connectionId: row.connection_id,
            senderId: row.sender_id,
            body: row.body,
            sentAt: row.sent_at,
            readAt: row.read_at,
          }
          setData(prev => {
            if (!prev) return prev
            // Avoid duplicates
            if (prev.messages.some(m => m.id === newMsg.id)) return prev
            const updated = [...prev.messages, newMsg]
            // Mark as read if it's from the other person
            if (newMsg.senderId !== userIdRef.current) {
              void markThreadRead(threadId, userIdRef.current!)
            }
            return { ...prev, messages: updated }
          })
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [load, threadId])

  return { data, loading, loadingMore, hasMore, loadMore, error, refresh: load }
}
