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
  last_login_at: string | null
}

export interface SettingsData {
  userId: string
  myProfile: SettingsProfile
  coParentProfile: SettingsProfile | null
  switchTime: string | null   // HH:MM
  switchTimezone: string | null
  connectionId: string | null
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

      // Load profile and connection in parallel — profile always required,
      // connection is optional (new users may not have one yet)
      const [profileResult, connectionResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, display_name, initials, color, avatar_emoji, plan, last_login_at')
          .eq('id', userId)
          .maybeSingle(),

        supabase
          .from('co_parent_connections')
          .select('id, user_a_id, user_b_id, switch_time, switch_timezone')
          .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
          .eq('status', 'active')
          .maybeSingle(),
      ])

      const myProfile = profileResult.data
      if (!myProfile) { setError('profile_not_found'); setLoading(false); return }

      const connection = connectionResult.data ?? null
      let coParentProfile: SettingsProfile | null = null

      if (connection) {
        const coParentId = connection.user_a_id === userId
          ? connection.user_b_id
          : connection.user_a_id

        if (coParentId) {
          const { data: cpData } = await supabase
            .from('profiles')
            .select('id, display_name, initials, color, avatar_emoji, plan, last_login_at')
            .eq('id', coParentId)
            .maybeSingle()

          coParentProfile = (cpData as SettingsProfile | null) ?? null
        }
      }

      setData({
        userId,
        myProfile: myProfile as SettingsProfile,
        coParentProfile,
        switchTime:     connection?.switch_time
          ? String(connection.switch_time).slice(0, 5)
          : null,
        switchTimezone: connection?.switch_timezone ?? null,
        connectionId:   connection?.id ?? null,
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
