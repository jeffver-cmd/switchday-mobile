import { useEffect, useState, useCallback } from 'react'
import * as Crypto from 'expo-crypto'
import { supabase } from '../supabase'
import type { ExpenseStatus, ExpenseCategory } from '../types/database'

// ─── types ───────────────────────────────────────────────────────────────────

export interface Expense {
  id: string
  connectionId: string
  submittedById: string | null
  description: string
  amount: number
  category: ExpenseCategory
  splitPercent: number
  status: ExpenseStatus
  receiptUrl: string | null
  submittedAt: string
  requestedSplitNote: string | null
}

export interface ExpensesData {
  userId: string
  connectionId: string
  expenses: Expense[]
}

// ─── api helpers ─────────────────────────────────────────────────────────────

const API_BASE = 'https://switchday.app'

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  return {
    'Content-Type': 'application/json',
    ...(session ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
  }
}

export async function approveExpense(id: string): Promise<{ error: string | null }> {
  try {
    const res = await fetch(`${API_BASE}/api/expenses/${id}/status`, {
      method: 'PATCH',
      headers: await authHeaders(),
      body: JSON.stringify({ toStatus: 'approved' }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      return { error: (j as { error?: string }).error ?? `HTTP ${res.status}` }
    }
    return { error: null }
  } catch {
    return { error: 'network_error' }
  }
}

export async function declineExpense(id: string): Promise<{ error: string | null }> {
  try {
    const res = await fetch(`${API_BASE}/api/expenses/${id}/status`, {
      method: 'PATCH',
      headers: await authHeaders(),
      body: JSON.stringify({ toStatus: 'declined' }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      return { error: (j as { error?: string }).error ?? `HTTP ${res.status}` }
    }
    return { error: null }
  } catch {
    return { error: 'network_error' }
  }
}

export interface NewExpenseInput {
  connectionId: string
  description: string
  amount: number
  category: ExpenseCategory
  splitPercent: number
}

export async function logExpense(input: NewExpenseInput): Promise<{ error: string | null }> {
  try {
    const res = await fetch(`${API_BASE}/api/expenses`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({
        connectionId:  input.connectionId,
        description:   input.description,
        amount:        input.amount,
        category:      input.category,
        splitPercent:  input.splitPercent,
      }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      return { error: (j as { error?: string }).error ?? `HTTP ${res.status}` }
    }
    return { error: null }
  } catch {
    return { error: 'network_error' }
  }
}

// ─── hook ────────────────────────────────────────────────────────────────────

export function useExpenses(statusFilter?: ExpenseStatus[]) {
  const [data, setData] = useState<ExpensesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError('not_signed_in'); setLoading(false); return }
      const userId = session.user.id

      const { data: connection } = await supabase
        .from('co_parent_connections')
        .select('id')
        .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
        .eq('status', 'active')
        .maybeSingle()

      if (!connection) { setError('no_connection'); setLoading(false); return }

      let query = supabase
        .from('expenses')
        .select('id, connection_id, submitted_by_id, description, amount, category, split_percent, status, receipt_url, submitted_at, requested_split_note')
        .eq('connection_id', connection.id)
        .order('submitted_at', { ascending: false })
        .limit(50)

      if (statusFilter && statusFilter.length > 0) {
        query = query.in('status', statusFilter)
      }

      const { data: rows, error: err } = await query

      if (err) { setError(err.message); setLoading(false); return }

      const expenses: Expense[] = (rows ?? []).map(r => ({
        id: r.id,
        connectionId: r.connection_id,
        submittedById: r.submitted_by_id,
        description: r.description,
        amount: Number(r.amount),
        category: r.category as ExpenseCategory,
        splitPercent: r.split_percent,
        status: r.status as ExpenseStatus,
        receiptUrl: r.receipt_url,
        submittedAt: r.submitted_at,
        requestedSplitNote: r.requested_split_note,
      }))

      setData({ userId, connectionId: connection.id, expenses })
    } catch (e) {
      setError('load_failed')
    } finally {
      setLoading(false)
    }
  }, [statusFilter?.join(',')])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  return { data, loading, error, refresh: load }
}
