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

export interface NewExpenseInput {
  connectionId: string
  description: string
  amount: number
  category: ExpenseCategory
  splitPercent: number
}

// ─── state machine ────────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<ExpenseStatus, ExpenseStatus[]> = {
  requested: ['pending', 'declined'],
  pending:   ['approved', 'disputed'],
  approved:  ['paid', 'disputed'],
  disputed:  ['pending', 'approved'],
  paid:      [],
  declined:  [],
}

// ─── audit helper ─────────────────────────────────────────────────────────────

async function writeAuditLog(params: {
  actorId:      string
  action:       string
  resourceType: string
  resourceId:   string
  metadata:     Record<string, unknown>
}): Promise<void> {
  const { actorId, action, resourceType, resourceId, metadata } = params
  const payload = { actor_id: actorId, action, resource_id: resourceId, metadata }
  const sha256_hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    JSON.stringify(payload),
  )
  // Fire-and-forget per AGENTS.md
  supabase.from('audit_log').insert({
    actor_id:      actorId,
    action,
    resource_type: resourceType,
    resource_id:   resourceId,
    metadata,
    sha256_hash,
  }).then(() => {})
}

// ─── write operations ─────────────────────────────────────────────────────────

/**
 * Log a new shared expense (status → 'pending').
 * Writes: expenses row + expense_status_log (null → pending) + audit_log.
 * Row sha256_hash matches the web's createExpense pattern for cross-platform
 * integrity verification.
 */
export async function logExpense(input: NewExpenseInput): Promise<{ error: string | null }> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'not_signed_in' }

  if (!input.description?.trim())                           return { error: 'Description is required' }
  if (input.amount <= 0)                                    return { error: 'Amount must be greater than 0' }
  if (input.splitPercent < 0 || input.splitPercent > 100)  return { error: 'Split percent must be between 0 and 100' }

  // Row integrity hash — matches web createExpense pattern
  const sha256_hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${input.connectionId}|${session.user.id}|${input.description.trim()}|${input.amount}|${input.category}|${input.splitPercent}|${new Date().toISOString()}`,
  )

  const { data: expense, error: insertError } = await supabase
    .from('expenses')
    .insert({
      connection_id:   input.connectionId,
      submitted_by_id: session.user.id,
      description:     input.description.trim(),
      amount:          input.amount,
      category:        input.category,
      split_percent:   input.splitPercent,
      status:          'pending' as ExpenseStatus,
      sha256_hash,
    })
    .select()
    .single()

  if (insertError || !expense) return { error: insertError?.message ?? 'Failed to log expense' }

  // Status log: null → pending (fire-and-forget)
  const statusLogHash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${expense.id}|${session.user.id}|null|pending`,
  )
  supabase.from('expense_status_log').insert({
    expense_id:    expense.id,
    changed_by_id: session.user.id,
    from_status:   null,
    to_status:     'pending',
    sha256_hash:   statusLogHash,
  }).then(() => {})

  writeAuditLog({
    actorId:      session.user.id,
    action:       'expense.created',
    resourceType: 'expenses',
    resourceId:   expense.id,
    metadata:     { expense },
  })

  return { error: null }
}

/**
 * Shared state machine transition. Enforces VALID_TRANSITIONS, permission
 * rules (can't approve/dispute your own submission), and writes status_log +
 * audit_log entries.
 */
async function transitionStatus(
  id: string,
  toStatus: ExpenseStatus,
): Promise<{ error: string | null }> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'not_signed_in' }

  // Fetch current row — RLS ensures caller is a connection member
  const { data: expense, error: fetchErr } = await supabase
    .from('expenses')
    .select('id, status, submitted_by_id')
    .eq('id', id)
    .single()

  if (fetchErr || !expense) return { error: 'Expense not found' }

  // State machine
  const allowedNext = VALID_TRANSITIONS[expense.status as ExpenseStatus] ?? []
  if (!allowedNext.includes(toStatus)) {
    return { error: `Cannot transition from "${expense.status}" to "${toStatus}"` }
  }

  // Permission: can't approve or dispute your own submission
  if (
    (toStatus === 'approved' || toStatus === 'disputed') &&
    expense.submitted_by_id === session.user.id
  ) {
    return { error: 'You cannot approve or dispute your own expense submission' }
  }

  // Only the submitter can mark as paid
  if (toStatus === 'paid' && expense.submitted_by_id !== session.user.id) {
    return { error: 'Only the submitter can mark an expense as paid' }
  }

  const now = new Date().toISOString()
  const updatePayload: Record<string, unknown> = { status: toStatus }
  if (toStatus === 'paid') {
    updatePayload.payment_confirmed_at    = now
    updatePayload.payment_confirmed_by_id = session.user.id
  }

  const { error: updateErr } = await supabase
    .from('expenses')
    .update(updatePayload)
    .eq('id', id)

  if (updateErr) return { error: updateErr.message }

  // Status log (fire-and-forget)
  const statusLogHash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${id}|${session.user.id}|${expense.status}|${toStatus}`,
  )
  supabase.from('expense_status_log').insert({
    expense_id:    id,
    changed_by_id: session.user.id,
    from_status:   expense.status as ExpenseStatus,
    to_status:     toStatus,
    sha256_hash:   statusLogHash,
  }).then(() => {})

  const actionMap: Partial<Record<ExpenseStatus, string>> = {
    approved: 'expense.approved',
    declined: 'expense.declined',
  }
  writeAuditLog({
    actorId:      session.user.id,
    action:       actionMap[toStatus] ?? 'expense.updated',
    resourceType: 'expenses',
    resourceId:   id,
    metadata: {
      before: { status: expense.status, submitted_by_id: expense.submitted_by_id },
      after:  { status: toStatus },
    },
  })

  return { error: null }
}

export async function approveExpense(id: string): Promise<{ error: string | null }> {
  return transitionStatus(id, 'approved')
}

export async function declineExpense(id: string): Promise<{ error: string | null }> {
  return transitionStatus(id, 'declined')
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
    } catch {
      setError('load_failed')
    } finally {
      setLoading(false)
    }
  }, [statusFilter?.join(',')])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  return { data, loading, error, refresh: load }
}
