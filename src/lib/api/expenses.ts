/**
 * Expense write operations for the mobile app.
 * All writes use direct Supabase calls + expo-crypto SHA-256 audit logs.
 * No web API calls — see AGENTS.md for why.
 */

import * as Crypto from 'expo-crypto'
import { supabase } from '../supabase'

export type ExpenseCategory = 'medical' | 'education' | 'activities' | 'clothing' | 'other'
export type ExpenseStatus = 'requested' | 'pending' | 'approved' | 'paid' | 'declined' | 'disputed'

// ─── requestExpense ───────────────────────────────────────────────────────────
// Submits a child expense request. Moved here from portal/expenses.tsx
// to centralise write logic per AGENTS.md architecture rules.

export async function requestExpense(params: {
  childRowId:   string
  connectionId: string
  description:  string
  amount:       number
  category:     ExpenseCategory
  note:         string
}): Promise<{ error: string | null }> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'not_signed_in' }

  const { childRowId, connectionId, description, amount, category, note } = params

  // Canonical hash — matches parent logExpense pattern for cross-platform consistency
  const sha256_hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${connectionId}|${session.user.id}|${description.trim()}|${amount}|${category}|50|${new Date().toISOString()}`,
  )

  const { data: expense, error: insertError } = await supabase
    .from('expenses')
    .insert({
      connection_id:         connectionId,
      submitted_by_id:       null,
      submitted_by_child_id: childRowId,
      description:           description.trim(),
      amount,
      category,
      split_percent:         50, // placeholder — parent sets real split on approval
      status:                'requested' as ExpenseStatus,
      requested_split_note:  note.trim() || null,
      sha256_hash,
    })
    .select()
    .single()

  if (insertError || !expense) return { error: insertError?.message ?? 'Failed to submit request' }

  // Audit log (fire-and-forget)
  const metadata    = { expense, submitted_by_child: true }
  const auditPayload = { actor_id: session.user.id, action: 'expense.created', resource_id: expense.id, metadata }
  const auditHash   = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    JSON.stringify(auditPayload),
  )
  supabase.from('audit_log').insert({
    actor_id:      session.user.id,
    action:        'expense.created',
    resource_type: 'expenses',
    resource_id:   expense.id,
    metadata,
    sha256_hash:   auditHash,
  }).then(() => {})

  return { error: null }
}
