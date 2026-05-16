import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabase'
import type { Schedule } from '../api/schedules'

// ─── types ───────────────────────────────────────────────────────────────────

export interface Profile {
  id: string
  display_name: string
  initials: string
  color: string
}

export interface SchedulesData {
  userId: string
  connectionId: string
  myProfile: Profile
  coParentProfile: Profile | null
  schedules: Schedule[]
}

// ─── hook ────────────────────────────────────────────────────────────────────

export function useSchedules() {
  const [data, setData] = useState<SchedulesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // 1. Session
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError('not_signed_in'); setLoading(false); return }
      const userId = session.user.id

      // 2. Active connection
      const { data: connection } = await supabase
        .from('co_parent_connections')
        .select('id, user_a_id, user_b_id')
        .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
        .eq('status', 'active')
        .maybeSingle()

      if (!connection) { setError('no_connection'); setLoading(false); return }

      const coParentId = connection.user_a_id === userId
        ? connection.user_b_id
        : connection.user_a_id

      // 3. Profiles + schedules in parallel — query Supabase directly
      //    (web API uses cookie-based auth and cannot accept the mobile Bearer token)
      const [profilesResult, schedulesResult] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, display_name, initials, color')
          .in('id', [userId, coParentId].filter(Boolean) as string[]),
        supabase
          .from('parenting_schedules')
          .select('*')
          .eq('connection_id', connection.id)
          .order('created_at', { ascending: false }),
      ])

      const profiles = profilesResult.data ?? []
      const myProfile = profiles.find(p => p.id === userId)
      const coParentProfile = profiles.find(p => p.id === coParentId) ?? null

      if (!myProfile) { setError('profile_not_found'); setLoading(false); return }

      if (schedulesResult.error) { setError(schedulesResult.error.message); setLoading(false); return }

      setData({
        userId,
        connectionId: connection.id,
        myProfile: myProfile as Profile,
        coParentProfile,
        schedules: (schedulesResult.data ?? []) as unknown as Schedule[],
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
