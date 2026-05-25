/**
 * Schedule write operations — direct Supabase (no web API proxy).
 *
 * Reads are handled by useSchedules (src/lib/hooks/useSchedules.ts) which
 * queries Supabase directly. This file covers INSERT / UPDATE / DELETE.
 *
 * All writes produce a signed audit_log entry (AGENTS.md legal-integrity rules).
 * SHA-256 is computed with expo-crypto since Node's `crypto` is unavailable in RN.
 *
 * NOTE — schedule.accepted (accept action): updating the status to 'accepted'
 * is done directly here, but custody day generation currently only happens
 * server-side via the web app. Until a mobile-auth-compatible endpoint exists,
 * full custody day regeneration requires the accepting party to also confirm
 * via the web. This is acceptable for mobile MVP.
 *
 * NOTE — useExpenses write operations (approveExpense / declineExpense /
 * logExpense) have the same web-API auth problem and need the same treatment.
 * Tracked as a follow-up for Session 107+.
 */

import * as Crypto from 'expo-crypto'
import { supabase } from '../supabase'
import type { SchedulePattern, ScheduleStatus, PatternData, Schedule } from '../types/database'

// Re-export types so existing imports keep working without change
export type { SchedulePattern, ScheduleStatus, PatternData, Schedule }

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
  // Fire-and-forget per AGENTS.md — never block user-facing response on this
  supabase.from('audit_log').insert({
    actor_id:      actorId,
    action,
    resource_type: resourceType,
    resource_id:   resourceId,
    metadata,
    sha256_hash,
  }).then(() => {})
}

// ─── createSchedule ───────────────────────────────────────────────────────────

export interface CreateSchedulePayload {
  name:           string
  pattern:        SchedulePattern
  start_date:     string
  end_date:       string
  pattern_data:   PatternData
  note?:          string | null
  supersedes_id?: string | null
}

/**
 * Insert a new draft schedule. Gets connectionId + actorId from the active session.
 *
 * Does NOT generate pending custody days — that happens server-side on schedule
 * acceptance. For the mobile propose flow this is fine: days are generated when
 * the co-parent accepts (which can happen on the web).
 */
export async function createSchedule(
  payload: CreateSchedulePayload,
): Promise<{ data: Schedule | null; error: string | null; conflicting?: { id: string; name: string; start_date: string; end_date: string } }> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { data: null, error: 'not_signed_in' }

  const { data: conn } = await supabase
    .from('co_parent_connections')
    .select('id')
    .or(`user_a_id.eq.${session.user.id},user_b_id.eq.${session.user.id}`)
    .eq('status', 'active')
    .maybeSingle()

  if (!conn) return { data: null, error: 'no_connection' }

  const { data, error } = await supabase
    .from('parenting_schedules')
    .insert({
      connection_id:  conn.id,
      created_by_id:  session.user.id,
      name:           payload.name,
      pattern:        payload.pattern,
      start_date:     payload.start_date,
      end_date:       payload.end_date,
      pattern_data:   payload.pattern_data as unknown as Record<string, unknown>,
      status:         'draft' as ScheduleStatus,
      note:           payload.note ?? null,
      supersedes_id:  payload.supersedes_id ?? null,
    })
    .select()
    .single()

  if (error || !data) return { data: null, error: error?.message ?? 'Failed to create schedule' }

  writeAuditLog({
    actorId:      session.user.id,
    action:       (data.status as string) === 'proposed' ? 'schedule.proposed' : 'schedule.drafted',
    resourceType: 'parenting_schedules',
    resourceId:   data.id,
    metadata:     { name: payload.name, pattern: payload.pattern, start_date: payload.start_date, end_date: payload.end_date, note: payload.note ?? null, status: data.status },
  })

  return { data: data as unknown as Schedule, error: null }
}

// ─── scheduleAction ───────────────────────────────────────────────────────────

export interface SaveActionPayload {
  action:        'save'
  name?:         string
  pattern?:      SchedulePattern
  start_date?:   string
  end_date?:     string
  pattern_data?: PatternData
  note?:         string | null
}

export type ScheduleActionPayload =
  | { action: 'propose' }
  | { action: 'accept' }
  | { action: 'decline'; decline_reason?: string }
  | { action: 'withdraw' }
  | SaveActionPayload

export async function scheduleAction(
  id: string,
  payload: ScheduleActionPayload,
): Promise<{ data: Schedule | null; error: string | null }> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { data: null, error: 'not_signed_in' }

  const now = new Date().toISOString()
  let update: Record<string, unknown>
  let auditAction: string

  switch (payload.action) {
    case 'propose':
      update      = { status: 'proposed', proposed_at: now }
      auditAction = 'schedule.proposed'
      break
    case 'accept':
      // Status updated directly; custody day generation is deferred to web.
      update      = { status: 'accepted', responded_at: now, responded_by_id: session.user.id }
      auditAction = 'schedule.accepted'
      break
    case 'decline':
      update      = { status: 'declined', responded_at: now, responded_by_id: session.user.id, decline_reason: payload.decline_reason ?? null }
      auditAction = 'schedule.declined'
      break
    case 'withdraw':
      update      = { status: 'draft' }
      auditAction = 'schedule.withdrawn'
      break
    case 'save':
      update = {
        ...(payload.name         !== undefined && { name:         payload.name }),
        ...(payload.pattern      !== undefined && { pattern:      payload.pattern }),
        ...(payload.start_date   !== undefined && { start_date:   payload.start_date }),
        ...(payload.end_date     !== undefined && { end_date:     payload.end_date }),
        ...(payload.pattern_data !== undefined && { pattern_data: payload.pattern_data as unknown as Record<string, unknown> }),
        ...(payload.note         !== undefined && { note:         payload.note }),
      }
      auditAction = 'schedule.updated'
      break
  }

  const { data, error } = await supabase
    .from('parenting_schedules')
    .update(update)
    .eq('id', id)
    .select()
    .single()

  if (error || !data) return { data: null, error: error?.message ?? 'Update failed' }

  writeAuditLog({
    actorId:      session.user.id,
    action:       auditAction,
    resourceType: 'parenting_schedules',
    resourceId:   id,
    metadata:     { action: payload.action, ...payload },
  })

  return { data: data as unknown as Schedule, error: null }
}

// ─── deleteSchedule ───────────────────────────────────────────────────────────

/**
 * Delete a draft schedule. Safety guards: only drafts, only owned by the caller.
 * Snapshots the row before deleting for the audit trail.
 */
export async function deleteSchedule(id: string): Promise<{ error: string | null }> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'not_signed_in' }

  // Snapshot before delete — required for recoverable paper trail (AGENTS.md)
  const { data: snapshot } = await supabase
    .from('parenting_schedules')
    .select('*')
    .eq('id', id)
    .single()

  const { error } = await supabase
    .from('parenting_schedules')
    .delete()
    .eq('id', id)
    .eq('status', 'draft')          // safety: can only delete drafts
    .eq('created_by_id', session.user.id) // safety: can only delete own schedules

  if (error) return { error: error.message }

  writeAuditLog({
    actorId:      session.user.id,
    action:       'schedule.draft_deleted',
    resourceType: 'parenting_schedules',
    resourceId:   id,
    metadata:     { snapshot: snapshot ?? {} },
  })

  return { error: null }
}
