import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
  RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useState, useMemo, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { colors, radius, shadow, font } from '@/lib/theme'

// ─── types ───────────────────────────────────────────────────────────────────

interface ParentProfile { id: string; display_name: string; initials: string; color: string }
interface PortalEvent { id: string; title: string; start_date: string; start_time: string | null; all_day: boolean; category: string }
interface DayData { date: string; ownerId: string | null; ownerColor: string; isSwitch: boolean; events: PortalEvent[] }
interface PortalCalData { userId: string; parents: ParentProfile[]; days: Record<string, DayData> }

// ─── constants ───────────────────────────────────────────────────────────────

const WEEKDAYS   = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const CATEGORY_COLORS: Record<string, string> = {
  school: '#3b82f6', sports: '#10b981', medical: '#ef4444',
  birthday: '#f59e0b', holiday: '#8b5cf6', travel: '#06b6d4', other: '#6b7280',
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function todayStr()    { return new Date().toISOString().split('T')[0] }
function daysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate() }
function firstWeekday(y: number, m: number) { return new Date(y, m, 1).getDay() }
function toDateStr(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}
function formatTime(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}
function monthBounds(y: number, m: number) {
  const last = new Date(y, m + 1, 0).getDate()
  return {
    start: `${y}-${String(m + 1).padStart(2, '0')}-01`,
    end:   `${y}-${String(m + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`,
  }
}

// ─── hook ────────────────────────────────────────────────────────────────────

function usePortalCalendar(year: number, month: number) {
  const [data, setData]       = useState<PortalCalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError('not_signed_in'); setLoading(false); return }
      const userId = session.user.id

      const { data: childRow } = await supabase
        .from('children').select('id, connection_id')
        .eq('auth_user_id', userId).maybeSingle()

      if (!childRow?.connection_id) { setError('no_child_record'); setLoading(false); return }
      const connectionId = childRow.connection_id

      const { start, end } = monthBounds(year, month)

      const [schedResult, evResult, profResult] = await Promise.all([
        supabase
          .from('custody_schedule_current')
          .select('date, owner_id, is_switch')
          .eq('connection_id', connectionId)
          .gte('date', start).lte('date', end)
          .order('date', { ascending: true }),

        supabase
          .from('calendar_events')
          .select('id, title, start_date, start_time, all_day, category')
          .eq('connection_id', connectionId)
          .gte('start_date', start).lte('start_date', end)
          .order('start_date', { ascending: true }),

        supabase
          .from('profiles')
          .select('id, display_name, initials, color')
          .neq('id', userId),
      ])

      const parents = (profResult.data ?? []) as ParentProfile[]
      const colorMap: Record<string, string> = {}
      for (const p of parents) colorMap[p.id] = p.color ?? '#6b7280'

      const rawEvents = (evResult.data ?? []) as PortalEvent[]
      const evByDate: Record<string, PortalEvent[]> = {}
      for (const ev of rawEvents) {
        evByDate[ev.start_date] = [...(evByDate[ev.start_date] ?? []), ev]
      }

      const days: Record<string, DayData> = {}
      for (const row of (schedResult.data ?? [])) {
        days[row.date] = {
          date:       row.date,
          ownerId:    row.owner_id,
          ownerColor: colorMap[row.owner_id] ?? '#6b7280',
          isSwitch:   row.is_switch ?? false,
          events:     evByDate[row.date] ?? [],
        }
      }
      for (const [date, evs] of Object.entries(evByDate)) {
        if (!days[date]) days[date] = { date, ownerId: null, ownerColor: '#6b7280', isSwitch: false, events: evs }
      }

      setData({ userId, parents, days })
    } catch { setError('load_failed') }
    finally   { setLoading(false) }
  }, [year, month])

  useEffect(() => { load() }, [load])
  return { data, loading, error, refresh: load }
}

// ─── day detail ──────────────────────────────────────────────────────────────

function DayDetail({ dateStr, events }: { dateStr: string; events: PortalEvent[] }) {
  const label = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
  return (
    <View style={detailS.card}>
      <Text style={detailS.dateLabel}>{label}</Text>
      {events.length === 0
        ? <Text style={detailS.none}>No events</Text>
        : events.map(ev => (
            <View key={ev.id} style={detailS.row}>
              <View style={[detailS.dot, { backgroundColor: CATEGORY_COLORS[ev.category] ?? '#6b7280' }]} />
              <View style={{ flex: 1 }}>
                <Text style={detailS.title}>{ev.title}</Text>
                {ev.all_day ? (
                  <Text style={detailS.meta}>All day</Text>
                ) : ev.start_time ? (
                  <Text style={detailS.meta}>{formatTime(ev.start_time)}</Text>
                ) : null}
              </View>
            </View>
          ))}
    </View>
  )
}

// ─── screen ──────────────────────────────────────────────────────────────────

export default function PortalCalendarScreen() {
  const today = todayStr()
  const now   = new Date()

  const [year, setYear]     = useState(now.getFullYear())
  const [month, setMonth]   = useState(now.getMonth())
  const [selected, setSelected] = useState<string | null>(today)

  const { data, loading, error, refresh } = usePortalCalendar(year, month)
  const { width } = useWindowDimensions()
  const CELL = Math.floor((width - 32 - 12) / 7)

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
    setSelected(null)
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
    setSelected(null)
  }

  const cells = useMemo(() => {
    const total  = daysInMonth(year, month)
    const offset = firstWeekday(year, month)
    const items: Array<{ day: number | null; dateStr: string | null }> = []
    for (let i = 0; i < offset; i++) items.push({ day: null, dateStr: null })
    for (let d = 1; d <= total; d++) items.push({ day: d, dateStr: toDateStr(year, month, d) })
    while (items.length % 7 !== 0) items.push({ day: null, dateStr: null })
    return items
  }, [year, month])

  const selDayData = selected ? data?.days[selected] : null
  const selEvents  = selDayData?.events ?? []

  return (
    <SafeAreaView style={S.container}>
      <ScrollView
        contentContainerStyle={S.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.accent} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Month header */}
        <View style={S.monthHeader}>
          <TouchableOpacity onPress={prevMonth} style={S.navBtn} hitSlop={12}>
            <Text style={S.navArrow}>‹</Text>
          </TouchableOpacity>
          <Text style={S.monthTitle}>{MONTH_NAMES[month]} {year}</Text>
          <TouchableOpacity onPress={nextMonth} style={S.navBtn} hitSlop={12}>
            <Text style={S.navArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Weekday labels */}
        <View style={S.weekRow}>
          {WEEKDAYS.map(wd => (
            <View key={wd} style={[S.weekCell, { width: CELL }]}>
              <Text style={S.weekLabel}>{wd}</Text>
            </View>
          ))}
        </View>

        {/* Grid */}
        {loading ? (
          <View style={[S.loadingBox, { height: CELL * 6 }]}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : error ? (
          <View style={S.emptyBox}>
            <Text style={S.emptyTitle}>Calendar unavailable</Text>
            <Text style={S.emptySubtitle}>{error}</Text>
          </View>
        ) : (
          <View style={S.grid}>
            {cells.map((cell, i) => {
              if (!cell.day || !cell.dateStr)
                return <View key={`b-${i}`} style={[S.dayCell, { width: CELL, height: CELL }]} />

              const dd = data?.days[cell.dateStr]
              const isToday  = cell.dateStr === today
              const isSel    = cell.dateStr === selected
              const oc       = dd?.ownerColor ?? null
              const isSwitch = dd?.isSwitch ?? false
              const evColors = (dd?.events ?? []).slice(0, 3).map(ev =>
                CATEGORY_COLORS[ev.category] ?? '#6b7280'
              )

              return (
                <TouchableOpacity
                  key={cell.dateStr}
                  style={[
                    S.dayCell, { width: CELL, height: CELL },
                    dd?.ownerId && oc ? { backgroundColor: oc + '22' } : null,
                    isSel ? S.dayCellSelected : null,
                  ]}
                  onPress={() => setSelected(isSel ? null : cell.dateStr)}
                  activeOpacity={0.7}
                >
                  {isSwitch && oc && (
                    <View style={[S.switchStripe, { backgroundColor: oc }]} />
                  )}
                  <View style={[S.dayNumWrap, isToday ? S.todayCircle : null]}>
                    <Text style={[S.dayNum, isToday ? S.todayNum : null, isSel && !isToday ? S.selNum : null]}>
                      {cell.day}
                    </Text>
                  </View>
                  {isSwitch && <Text style={S.switchLabel}>↔</Text>}
                  {evColors.length > 0 && (
                    <View style={S.dotsRow}>
                      {evColors.map((c, di) => <View key={di} style={[S.dot, { backgroundColor: c }]} />)}
                    </View>
                  )}
                </TouchableOpacity>
              )
            })}
          </View>
        )}

        {/* Legend */}
        {data && data.parents.length > 0 && (
          <View style={S.legend}>
            {data.parents.map(p => (
              <View key={p.id} style={S.legendItem}>
                <View style={[S.legendSwatch, { backgroundColor: p.color + '40' }]} />
                <Text style={S.legendLabel}>{p.display_name}</Text>
              </View>
            ))}
            <View style={S.legendItem}>
              <Text style={S.legendSwitch}>↔</Text>
              <Text style={S.legendLabel}>Switch</Text>
            </View>
          </View>
        )}

        {/* Day detail */}
        {selected && <DayDetail dateStr={selected} events={selEvents} />}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

// ─── styles ──────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  container:  { flex: 1, backgroundColor: colors.bg },
  scroll:     { paddingHorizontal: 16, paddingTop: 8 },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingHorizontal: 4 },
  navBtn:     { padding: 4 },
  navArrow:   { fontSize: 28, fontFamily: font.regular, color: colors.textSecondary, fontWeight: '300', lineHeight: 32 },
  monthTitle: { fontSize: 18, fontWeight: '700', fontFamily: font.bold, color: colors.textPrimary },
  weekRow:    { flexDirection: 'row', gap: 2, marginBottom: 4 },
  weekCell:   { alignItems: 'center', paddingVertical: 4 },
  weekLabel:  { fontSize: 11, fontWeight: '600', fontFamily: font.semibold, color: colors.textSubtle, letterSpacing: 0.5 },
  grid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  loadingBox: { alignItems: 'center', justifyContent: 'center' },
  emptyBox:   { paddingVertical: 40, alignItems: 'center', paddingHorizontal: 24 },
  emptyTitle: { fontSize: 16, fontWeight: '600', fontFamily: font.semibold, color: colors.textPrimary, textAlign: 'center', marginBottom: 8 },
  emptySubtitle: { fontSize: 13, fontFamily: font.regular, color: colors.textMuted, textAlign: 'center' },
  dayCell:    { alignItems: 'center', borderRadius: radius.sm, paddingVertical: 4, overflow: 'hidden', position: 'relative' },
  dayCellSelected: { borderWidth: 1.5, borderColor: colors.accent },
  switchStripe: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, borderTopLeftRadius: radius.sm, borderTopRightRadius: radius.sm },
  dayNumWrap: { width: 26, height: 26, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  todayCircle: { backgroundColor: colors.accent },
  dayNum:     { fontSize: 13, fontWeight: '500', fontFamily: font.medium, color: colors.textPrimary },
  todayNum:   { color: colors.white, fontWeight: '700', fontFamily: font.bold },
  selNum:     { fontWeight: '700', fontFamily: font.bold },
  switchLabel: { fontSize: 9, color: colors.textMuted, marginTop: 1 },
  dotsRow:    { flexDirection: 'row', gap: 2, marginTop: 2 },
  dot:        { width: 4, height: 4, borderRadius: 2 },
  legend:     { flexDirection: 'row', gap: 16, paddingVertical: 12, paddingHorizontal: 4, marginTop: 4, borderTopWidth: 1, borderTopColor: colors.border, marginBottom: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 14, height: 14, borderRadius: 3 },
  legendSwitch: { fontSize: 14, color: colors.textMuted },
  legendLabel: { fontSize: 12, fontFamily: font.regular, color: colors.textMuted },
})

const detailS = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 16, marginBottom: 12, ...shadow.sm },
  dateLabel: { fontSize: 15, fontWeight: '700', fontFamily: font.bold, color: colors.textPrimary, marginBottom: 12 },
  none: { fontSize: 13, fontFamily: font.regular, color: colors.textSubtle, fontStyle: 'italic' },
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.borderHair, gap: 10 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 3 },
  title: { fontSize: 14, fontWeight: '500', fontFamily: font.medium, color: colors.textPrimary },
  meta: { fontSize: 12, fontFamily: font.regular, color: colors.textMuted, marginTop: 2 },
})
