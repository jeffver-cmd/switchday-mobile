import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabase'

// ─── types ───────────────────────────────────────────────────────────────────

export interface SettingsProfile {
  id: string
  display_name: string
  initials: string
  color: string
  avatar_emoji: string | null
  plan: string | null
}

export interface SettingsData {
  userId: string
  myProfile: SettingsProfile
  coParentProfile: SettingsProfile | null
  switchTime: string | null   // HH:MM
  switchTimezone: string | null
  connectionId: string
}

// ─── hook ────────────────────────────────────────────────────────────────────

export function useSettings() {
  const [data, setData]       = useState<SettingsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

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
        .select('id, user_a_id, user_b_id, switch_time, switch_timezone')
        .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
        .eq('status', 'active')
        .maybeSingle()

      if (!connection) { setError('no_connection'); setLoading(false); return }

      const coParentId = connection.user_a_id === userId
        ? connection.user_b_id
        : connection.user_a_id

      const profileIds = [userId, coParentId].filter(Boolean) as string[]

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, initials, color, avatar_emoji, plan')
        .in('id', profileIds)

      const myProfile     = (profiles ?? []).find(p => p.id === userId)
      const coParentProfile = (profiles ?? []).find(p => p.id === coParentId) ?? null

      if (!myProfile) { setError('profile_not_found'); setLoading(false); return }

      setData({
        userId,
        myProfile: myProfile as SettingsProfile,
        coParentProfile: coParentProfile as SettingsProfile | null,
        switchTime:     connection.switch_time
          ? String(connection.switch_time).slice(0, 5)
          : null,
        switchTimezone: connection.switch_timezone ?? null,
        connectionId:   connection.id,
      })
    } catch {
      setError('load_failed')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return { data, loading, error, refresh: load }
}
