import { supabase } from '../supabase'

// ─── types ───────────────────────────────────────────────────────────────────

export type ScheduleStatus = 'draft' | 'proposed' | 'accepted' | 'declined' | 'superseded'
export type SchedulePattern = 'week_on_week_off' | '2_2_3' | '3_4_4_3' | '2_2_5_5' | 'custom'

export interface PatternData {
  first_week_owner_id: string
  owner_sequence?: string[]
  cycle_length?: number
  specific_days?: Record<string, string>
}

export interface Schedule {
  id: string
  connection_id: string
  created_by_id: string
  name: string
  pattern: SchedulePattern
  start_date: string
  end_date: string
  pattern_data: PatternData
  status: ScheduleStatus
  proposed_at: string | null
  responded_at: string | null
  responded_by_id: string | null
  decline_reason: string | null
  note: string | null
  supersedes_id: string | null
  created_at: string
}

export interface CreateSchedulePayload {
  name: string
  pattern: SchedulePattern
  start_date: string
  end_date: string
  pattern_data: PatternData
  note?: string | null
  supersedes_id?: string | null
}

export interface SaveActionPayload {
  action: 'save'
  name?: string
  pattern?: SchedulePattern
  start_date?: string
  end_date?: string
  pattern_data?: PatternData
  note?: string | null
}

export type ScheduleActionPayload =
  | { action: 'propose' }
  | { action: 'accept' }
  | { action: 'decline'; decline_reason?: string }
  | { action: 'withdraw' }
  | SaveActionPayload

// ─── api base ─────────────────────────────────────────────────────────────────

const API_BASE = 'https://switchday.app'

async function authHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  return {
    'Content-Type': 'application/json',
    ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
  }
}

async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: await authHeaders(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      return { data: null, error: (json as { error?: string }).error ?? `HTTP ${res.status}` }
    }
    const json = await res.json()
    return { data: json as T, error: null }
  } catch {
    return { data: null, error: 'network_error' }
  }
}

// ─── api functions ────────────────────────────────────────────────────────────

export async function fetchSchedules(): Promise<{ data: Schedule[] | null; error: string | null }> {
  const result = await apiRequest<{ schedules: Schedule[] }>('GET', '/api/schedules')
  if (result.error) return { data: null, error: result.error }
  return { data: result.data?.schedules ?? [], error: null }
}

export async function createSchedule(
  payload: CreateSchedulePayload,
): Promise<{ data: Schedule | null; error: string | null; conflicting?: { id: string; name: string; start_date: string; end_date: string } }> {
  try {
    const res = await fetch(`${API_BASE}/api/schedules`, {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(payload),
    })
    const json = await res.json().catch(() => ({})) as {
      schedule?: Schedule
      error?: string
      conflicting?: { id: string; name: string; start_date: string; end_date: string }
    }
    if (!res.ok) {
      return { data: null, error: json.error ?? `HTTP ${res.status}`, conflicting: json.conflicting }
    }
    return { data: json.schedule ?? null, error: null }
  } catch {
    return { data: null, error: 'network_error' }
  }
}

export async function scheduleAction(
  id: string,
  payload: ScheduleActionPayload,
): Promise<{ data: Schedule | null; error: string | null }> {
  const result = await apiRequest<{ schedule: Schedule }>('PATCH', `/api/schedules/${id}`, payload)
  if (result.error) return { data: null, error: result.error }
  return { data: result.data?.schedule ?? null, error: null }
}

export async function deleteSchedule(id: string): Promise<{ error: string | null }> {
  const result = await apiRequest('DELETE', `/api/schedules/${id}`)
  return { error: result.error }
}
