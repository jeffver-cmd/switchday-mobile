import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../supabase'

export interface Profile {
  id: string
  display_name: string
  initials: string
  color: string
}

export interface NextSwitch {
  date: string         // YYYY-MM-DD
  ownerName: string    // who receives custody
  time: string | null  // HH:MM resolved (override > default)
  location: string | null
}

export interface PendingExpense {
  id: string
  description: string
  amount: number
  status: string
}

export interface UpcomingEvent {
  id: string
  title: string
  start_date: string
  start_time: string | null
  all_day: boolean
  category: string
}

export interface DashboardData {
  userId: string
  myProfile: Profile
  coParentProfile: Profile | null
  todayOwnerId: string | null
  isSwitch: boolean
  nextSwitch: NextSwitch | null
  unreadCount: number
  pendingExpenses: PendingExpense[]
  pendingExpenseCount: number
  upcomingEvents: UpcomingEvent[]
}

export function useDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // 1. Session
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError('Not signed in'); setLoading(false); return }
      const userId = session.user.id

      // 2. Active connection
      const { data: connection } = await supabase
        .from('co_parent_connections')
        .select('id, user_a_id, user_b_id, switch_time, switch_timezone, switch_location_mode')
        .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`)
        .eq('status', 'active')
        .maybeSingle()

      if (!connection) {
        setError('no_connection')
        setLoading(false)
        return
      }

      const coParentId = connection.user_a_id === userId
        ? connection.user_b_id
        : connection.user_a_id

      const today = new Date().toISOString().split('T')[0]
      const in14 = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]

      const profileIds = [userId, coParentId].filter(Boolean) as string[]

      // 3. All queries in parallel
      const [
        profilesResult,
        todayResult,
        nextSwitchResult,
        unreadResult,
        expensesResult,
        eventsResult,
      ] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, display_name, initials, color')
          .in('id', profileIds),

        supabase
          .from('custody_schedule_current')
          .select('date, owner_id, is_switch')
          .eq('connection_id', connection.id)
          .eq('date', today)
          .maybeSingle(),

        supabase
          .from('custody_schedule_current')
          .select('date, owner_id')
          .eq('connection_id', connection.id)
          .eq('is_switch', true)
          .gte('date', today)
          .order('date', { ascending: true })
          .limit(1),

        supabase
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('connection_id', connection.id)
          .neq('sender_id', userId)
          .is('read_at', null),

        supabase
          .from('expenses')
          .select('id, description, amount, status')
          .eq('connection_id', connection.id)
          .in('status', ['requested', 'pending', 'disputed'])
          .order('submitted_at', { ascending: false })
          .limit(3),

        supabase
          .from('calendar_events')
          .select('id, title, start_date, start_time, all_day, category')
          .eq('connection_id', connection.id)
          .gte('start_date', today)
          .lte('start_date', in14)
          .order('start_date', { ascending: true })
          .limit(5),
      ])

      const profiles = profilesResult.data ?? []
      const myProfile = profiles.find(p => p.id === userId)
      const coParentProfile = profiles.find(p => p.id === coParentId) ?? null

      if (!myProfile) { setError('Profile not found'); setLoading(false); return }

      // 4. Resolve next switch time (override > connection default)
      const nextSwitchRow = nextSwitchResult.data?.[0] ?? null
      let nextSwitch: NextSwitch | null = null

      if (nextSwitchRow) {
        let resolvedTime = connection.switch_time
          ? connection.switch_time.slice(0, 5)
          : null
        let resolvedLocation: string | null = null

        const { data: override } = await supabase
          .from('switch_time_overrides')
          .select('switch_time, location')
          .eq('connection_id', connection.id)
          .eq('date', nextSwitchRow.date)
          .eq('status', 'approved')
          .maybeSingle()

        if (override) {
          resolvedTime = override.switch_time.slice(0, 5)
          resolvedLocation = override.location ?? null
        }

        const receivingProfile = profiles.find(p => p.id === nextSwitchRow.owner_id)
        nextSwitch = {
          date: nextSwitchRow.date,
          ownerName: receivingProfile?.display_name ?? 'Co-parent',
          time: resolvedTime,
          location: resolvedLocation,
        }
      }

      setData({
        userId,
        myProfile: myProfile as Profile,
        coParentProfile,
        todayOwnerId: todayResult.data?.owner_id ?? null,
        isSwitch: todayResult.data?.is_switch ?? false,
        nextSwitch,
        unreadCount: unreadResult.count ?? 0,
        pendingExpenses: (expensesResult.data ?? []) as PendingExpense[],
        pendingExpenseCount: expensesResult.data?.length ?? 0,
        upcomingEvents: (eventsResult.data ?? []) as UpcomingEvent[],
      })
    } catch (e) {
      setError('Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return { data, loading, error, refresh: load }
}
