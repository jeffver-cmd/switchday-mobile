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

export interface RecentThread {
  id: string
  topic: string
  threadType: string
  connectionId: string
  lastMessageAt: string | null
  lastMessageBody: string | null
  unreadCount: number
}

export interface RecentExpense {
  id: string
  description: string
  amount: number
  status: string
  submittedAt: string
}

export interface DashboardData {
  userId: string
  connectionId: string
  myProfile: Profile
  coParentProfile: Profile | null
  todayOwnerId: string | null
  isSwitch: boolean
  switchTime: string | null   // HH:MM default switch time from connection
  nextSwitch: NextSwitch | null
  unreadCount: number
  pendingExpenses: PendingExpense[]
  pendingExpenseCount: number
  upcomingEvents: UpcomingEvent[]
  recentThreads: RecentThread[]
  recentExpenses: RecentExpense[]
  checklistItems: string[]
  childrenNames: string[]
}

// ── Solo mode data ────────────────────────────────────────────────────────────

export interface SoloData {
  userId: string
  displayName: string
  welcomeSeen: boolean                // whether welcome_seen_at is set on profile
  pendingInviteEmail: string | null   // invited_email from pending co_parent_connection
  declinedInviteEmail: string | null  // invited_email from most recent declined co_parent_connection
  hasChildren: boolean                // at least one solo child (connection_id IS NULL)
  hasImport: boolean                  // at least one completed import
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [soloData, setSoloData] = useState<SoloData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    setSoloData(null)
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
        // Solo mode — fetch profile + pending invite + declined invite + solo counts in parallel
        const [profileResult, pendingInviteResult, declinedInviteResult, childrenResult, importsResult] = await Promise.all([
          supabase
            .from('profiles')
            .select('id, display_name, welcome_seen_at')
            .eq('id', userId)
            .maybeSingle(),
          supabase
            .from('co_parent_connections')
            .select('invited_email')
            .eq('user_a_id', userId)
            .eq('status', 'pending')
            .order('invited_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('co_parent_connections')
            .select('invited_email')
            .eq('user_a_id', userId)
            .eq('status', 'declined')
            .order('invited_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from('children')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .is('connection_id', null),
          supabase
            .from('imports')
            .select('id', { count: 'exact', head: true })
            .eq('performed_by_id', userId)
            .eq('status', 'complete'),
        ])

        setSoloData({
          userId,
          displayName: profileResult.data?.display_name ?? 'there',
          welcomeSeen: !!profileResult.data?.welcome_seen_at,
          pendingInviteEmail: pendingInviteResult.data?.invited_email ?? null,
          declinedInviteEmail: declinedInviteResult.data?.invited_email ?? null,
          hasChildren: (childrenResult.count ?? 0) > 0,
          hasImport: (importsResult.count ?? 0) > 0,
        })
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
        threadsResult,
        recentExpensesResult,
        checklistResult,
        childrenResult,
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

        // Recent threads — top 3 by last message
        supabase
          .from('message_threads')
          .select('id, topic, thread_type, last_message_at')
          .eq('connection_id', connection.id)
          .order('last_message_at', { ascending: false, nullsFirst: false })
          .limit(3),

        // Recent expenses — any status, most recent first
        supabase
          .from('expenses')
          .select('id, description, amount, status, submitted_at')
          .eq('connection_id', connection.id)
          .order('submitted_at', { ascending: false })
          .limit(3),

        // Switch day packing checklist
        supabase
          .from('switch_checklist_items')
          .select('item_text, sort_order')
          .eq('connection_id', connection.id)
          .eq('active', true)
          .order('sort_order', { ascending: true }),

        // Children names
        supabase
          .from('children')
          .select('name')
          .eq('connection_id', connection.id)
          .order('created_at', { ascending: true }),
      ])

      const profiles = profilesResult.data ?? []
      const myProfile = profiles.find(p => p.id === userId)
      const coParentProfile = profiles.find(p => p.id === coParentId) ?? null

      if (!myProfile) { setError('Profile not found'); setLoading(false); return }

      // 4. Resolve next switch time + thread details in parallel
      const nextSwitchRow = nextSwitchResult.data?.[0] ?? null
      const threadIds = (threadsResult.data ?? []).map(t => t.id)

      const [overrideResult, lastMsgsResult, threadUnreadResult] = await Promise.all([
        nextSwitchRow
          ? supabase
              .from('switch_time_overrides')
              .select('switch_time, location')
              .eq('connection_id', connection.id)
              .eq('date', nextSwitchRow.date)
              .eq('status', 'approved')
              .maybeSingle()
          : Promise.resolve({ data: null }),

        threadIds.length > 0
          ? supabase
              .from('messages')
              .select('thread_id, body, sent_at')
              .in('thread_id', threadIds)
              .order('sent_at', { ascending: false })
              .limit(threadIds.length * 3)
          : Promise.resolve({ data: [] }),

        threadIds.length > 0
          ? supabase
              .from('messages')
              .select('thread_id')
              .in('thread_id', threadIds)
              .neq('sender_id', userId)
              .is('read_at', null)
          : Promise.resolve({ data: [] }),
      ])

      // Build next switch
      let nextSwitch: NextSwitch | null = null
      if (nextSwitchRow) {
        let resolvedTime = connection.switch_time
          ? connection.switch_time.slice(0, 5)
          : null
        let resolvedLocation: string | null = null

        const override = overrideResult.data
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

      // Build recent threads
      const lastMsgMap: Record<string, string> = {}
      for (const msg of (lastMsgsResult.data ?? [])) {
        if (!lastMsgMap[msg.thread_id]) {
          lastMsgMap[msg.thread_id] = msg.body
        }
      }
      const threadUnreadMap: Record<string, number> = {}
      for (const msg of (threadUnreadResult.data ?? [])) {
        threadUnreadMap[msg.thread_id] = (threadUnreadMap[msg.thread_id] ?? 0) + 1
      }
      const recentThreads: RecentThread[] = (threadsResult.data ?? []).map(t => ({
        id: t.id,
        topic: t.topic ?? 'Conversation',
        threadType: t.thread_type ?? 'co_parent',
        connectionId: connection.id,
        lastMessageAt: t.last_message_at,
        lastMessageBody: lastMsgMap[t.id] ?? null,
        unreadCount: threadUnreadMap[t.id] ?? 0,
      }))

      setData({
        userId,
        connectionId: connection.id,
        myProfile: myProfile as Profile,
        coParentProfile,
        todayOwnerId: todayResult.data?.owner_id ?? null,
        isSwitch: todayResult.data?.is_switch ?? false,
        switchTime: connection.switch_time ? connection.switch_time.slice(0, 5) : null,
        nextSwitch,
        unreadCount: unreadResult.count ?? 0,
        pendingExpenses: (expensesResult.data ?? []) as PendingExpense[],
        pendingExpenseCount: expensesResult.data?.length ?? 0,
        upcomingEvents: (eventsResult.data ?? []) as UpcomingEvent[],
        recentThreads,
        recentExpenses: (recentExpensesResult.data ?? []).map(e => ({
          id: e.id,
          description: e.description,
          amount: e.amount,
          status: e.status,
          submittedAt: e.submitted_at,
        })) as RecentExpense[],
        checklistItems: (checklistResult.data ?? []).map(r => r.item_text as string),
        childrenNames: (childrenResult.data ?? []).map(r => r.name as string),
      })
    } catch (e) {
      setError('Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return { data, soloData, loading, error, refresh: load }
}
