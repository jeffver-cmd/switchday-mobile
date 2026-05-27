import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabase'
import type { VaultCategory } from '../types/database'

// ─── types ────────────────────────────────────────────────────────────────────

export interface VaultDoc {
  id: string
  connectionId: string | null
  ownerId: string
  shared: boolean
  displayName: string
  category: VaultCategory
  documentDate: string | null
  storagePath: string
  sha256Hash: string
  fileSizeBytes: number
  contentType: string
  createdAt: string
  isMine: boolean
}

export interface VaultData {
  userId: string
  connectionId: string | null
  isPro: boolean
  documents: VaultDoc[]
}

// ─── hook ─────────────────────────────────────────────────────────────────────

export function useVault(): {
  data: VaultData | null
  loading: boolean
  error: string | null
  refresh: () => void
} {
  const [data, setData] = useState<VaultData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchVault = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError('not_signed_in'); return }
      const userId = session.user.id

      // ── Profile (plan) ────────────────────────────────────────────────────
      const { data: profile } = await supabase
        .from('profiles')
        .select('plan')
        .eq('id', userId)
        .single()

      const isPro = profile?.plan === 'pro' || profile?.plan === 'standard' || profile?.plan === 'premium'

      if (!isPro) {
        // Return empty vault for free users — Pro gate shown in UI
        setData({ userId, connectionId: '', isPro: false, documents: [] })
        return
      }

      // ── Active connection ─────────────────────────────────────────────────
      const { data: connection } = await supabase
        .from('co_parent_connections')
        .select('id')
        .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle()

      // ── Documents ─────────────────────────────────────────────────────────
      let docsQuery = supabase
        .from('vault_documents')
        .select('id, connection_id, owner_id, shared, display_name, category, document_date, storage_path, sha256_hash, file_size_bytes, content_type, created_at')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })

      if (connection) {
        docsQuery = docsQuery.eq('connection_id', connection.id)
      } else {
        docsQuery = docsQuery.is('connection_id', null).eq('owner_id', userId)
      }

      const connectionId = connection?.id ?? null

      const { data: rows, error: docsError } = await docsQuery

      if (docsError) { setError(docsError.message); return }

      const documents: VaultDoc[] = (rows ?? []).map(r => ({
        id:            r.id,
        connectionId:  r.connection_id,
        ownerId:       r.owner_id,
        shared:        r.shared,
        displayName:   r.display_name,
        category:      r.category as VaultCategory,
        documentDate:  r.document_date,
        storagePath:   r.storage_path,
        sha256Hash:    r.sha256_hash,
        fileSizeBytes: r.file_size_bytes,
        contentType:   r.content_type,
        createdAt:     r.created_at,
        isMine:        r.owner_id === userId,
      }))

      setData({ userId, connectionId, isPro, documents })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void fetchVault() }, [fetchVault])

  return { data, loading, error, refresh: fetchVault }
}
