import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabase'

// ─── types ───────────────────────────────────────────────────────────────────

export interface ChildProfile {
  id: string
  display_name: string
  initials: string
  color: string
}

export interface ChildData {
  userId: string
  childId: string
  childName: string
  connectionId: string
  parentProfiles: ChildProfile[]
}

// ─── hook ────────────────────────────────────────────────────────────────────

export function useChild() {
  const [data, setData]       = useState<ChildData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError('not_signed_in'); setLoading(false); return }
      const userId = session.user.id

      // Lookup child row — links this user to a connection
      const { data: childRow } = await supabase
        .from('children')
        .select('id, name, connection_id')
        .eq('auth_user_id', userId)
        .maybeSingle()

      if (!childRow?.connection_id) {
        setError('no_child_record')
        setLoading(false)
        return
      }

      // Read parent profiles via updated can_read_profile function
      // We don't have direct co_parent_connections access as a child,
      // so we use the children table to get parent IDs indirectly via profiles RLS
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, initials, color')
        .neq('id', userId)

      // Filter to profiles that are in the connection — the RLS policy
      // (can_read_profile) now allows children to read their parents, so any
      // non-self profiles returned here ARE the parents.
      const parentProfiles = (profiles ?? []).map(p => ({
        id:           p.id,
        display_name: p.display_name ?? 'Parent',
        initials:     p.initials ?? '?',
        color:        p.color ?? '#6b7280',
      }))

      setData({
        userId,
        childId:        childRow.id,
        childName:      childRow.name ?? 'Child',
        connectionId:   childRow.connection_id,
        parentProfiles,
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
