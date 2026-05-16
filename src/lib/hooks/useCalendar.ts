import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabase'

// ─── types ───────────────────────────────────────────────────────────────────

export interface Profile {
  id: string
  display_name: string
  initials: string
  color: string
}

export interface DayData {
  date: string          // YYYY-MM-DD
  ownerId: string | null
  ownerColor: string    // hex — resolved from profiles
  isSwitch: boolean
  events: CalendarEvent[]
}

export interface CalendarEvent {
  id: string
  title: string
  start_date: string
  start_time: string | null
  end_date: string | null
  end_time: string | null
  all_day: boolean
  category: string
}

export interface CalendarData {
  userId: string
  myProfile: Profile
  coParentProfile: Profile | null
  /** Keyed by YYYY-MM-DD */
  days: Record<string, DayData>
  events: CalendarEvent[]
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function monthBounds(year: number, month: number) {
  // month is 0-indexed (JS Date)
  const first = new Date(year, month, 1)
  const last  = new Date(year, month + 1, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    start: `${year}-${pad(month + 1)}-01`,
    end:   `${year}-${pad(month + 1)}-${pad(last.getDate())}`,
  }
}

// ─── hook ────────────────────────────────────────────────────────────────────

export function useCalendar(year: number, month: number) {
  const [data, setData] = useState<CalendarData | null>(null)
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

      const { start, end } = monthBounds(year, month)

      // 3. Parallel fetch
      const [scheduleResult, eventsResult, profilesResult] = await Promise.all([
        supabase
          .from('custody_schedule_current')
          .select('date, owner_id, is_switch')
          .eq('connection_id', connection.id)
          .gte('date', start)
          .lte('date', end)
          .order('date', { ascending: true }),

        supabase
          .from('calendar_events')
          .select('id, title, start_date, start_time, end_date, end_time, all_day, category')
          .eq('connection_id', connection.id)
          .gte('start_date', start)
          .lte('start_date', end)
          .order('start_date', { ascending: true }),

        supabase
          .from('profiles')
          .select('id, display_name, initials, color')
          .in('id', [userId, coParentId].filter(Boolean) as string[]),
      ])

      const profiles = profilesResult.data ?? []
      const myProfile  = profiles.find(p => p.id === userId)
      const coParentProfile = profiles.find(p => p.id === coParentId) ?? null

      if (!myProfile) { setError('profile_not_found'); setLoading(false); return }

      // 4. Build profile color map
      const colorMap: Record<string, string> = {}
      for (const p of profiles) colorMap[p.id] = p.color ?? '#6b7280'

      // 5. Build events map by date
      const rawEvents = (eventsResult.data ?? []) as CalendarEvent[]
      const eventsByDate: Record<string, CalendarEvent[]> = {}
      for (const ev of rawEvents) {
        if (!eventsByDate[ev.start_date]) eventsByDate[ev.start_date] = []
        eventsByDate[ev.start_date].push(ev)
      }

      // 6. Build days map
      const scheduleRows = scheduleResult.data ?? []
      const days: Record<string, DayData> = {}
      for (const row of scheduleRows) {
        days[row.date] = {
          date:       row.date,
          ownerId:    row.owner_id,
          ownerColor: colorMap[row.owner_id] ?? '#6b7280',
          isSwitch:   row.is_switch ?? false,
          events:     eventsByDate[row.date] ?? [],
        }
      }

      // Also add event-only days (events outside schedule rows)
      for (const [date, evs] of Object.entries(eventsByDate)) {
        if (!days[date]) {
          days[date] = {
            date,
            ownerId: null,
            ownerColor: '#6b7280',
            isSwitch: false,
            events: evs,
          }
        }
      }

      setData({
        userId,
        myProfile: myProfile as Profile,
        coParentProfile,
        days,
        events: rawEvents,
      })
    } catch (e) {
      setError('load_failed')
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => { load() }, [load])

  return { data, loading, error, refresh: load }
}
