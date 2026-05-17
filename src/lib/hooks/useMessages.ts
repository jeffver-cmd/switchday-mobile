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
  messages: Message[]
}

// ─── api helper ──────────────────────────────────────────────────────────────

const API_BASE = 'https://switchday.app'

export async function sendMessage(
  threadId: string,
  connectionId: string,
  body: string,
): Promise<{ error: string | null }> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { error: 'not_signed_in' }

    const hash = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      body,
    )

    const res = await fetch(`${API_BASE}/api/messages/send`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        threadId,
        connectionId,
        message: body,
        sha256Hash: hash,
      }),
    })

    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      return { error: (json as { error?: string }).error ?? `HTTP ${res.status}` }
    }

    return { error: null }
  } catch (e) {
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

export function useMessages(threadId: string) {
  const [data, setData] = useState<MessagesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const userIdRef = useRef<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError('not_signed_in'); setLoading(false); return }
      const userId = session.user.id
      userIdRef.current = userId

      const [{ data: rows, error: err }, { data: profileRow }] = await Promise.all([
        supabase
          .from('messages')
          .select('id, thread_id, connection_id, sender_id, body, sent_at, read_at')
          .eq('thread_id', threadId)
          .order('sent_at', { ascending: true })
          .limit(200),
        supabase
          .from('profiles')
          .select('color')
          .eq('id', userId)
          .maybeSingle(),
      ])

      if (err) { setError(err.message); setLoading(false); return }

      const myColor = (profileRow as { color?: string } | null)?.color ?? '#5B6B8A'

      const messages: Message[] = (rows ?? []).map(r => ({
        id: r.id,
        threadId: r.thread_id,
        connectionId: r.connection_id,
        senderId: r.sender_id,
        body: r.body,
        sentAt: r.sent_at,
        readAt: r.read_at,
      }))

      setData({ userId, myColor, messages })

      // Mark unread messages as read
      await markThreadRead(threadId, userId)
    } catch (e) {
      setError('load_failed')
    } finally {
      setLoading(false)
    }
  }, [threadId])

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

  return { data, loading, error, refresh: load }
}
