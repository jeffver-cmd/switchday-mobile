import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  useWindowDimensions,
  RefreshControl,
  Modal,
  TextInput,
  Switch,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useState, useMemo, useEffect, useCallback } from 'react'
import * as Crypto from 'expo-crypto'
import { supabase } from '@/lib/supabase'
import { colors, radius, shadow, font } from '@/lib/theme'
import { usePortal } from '@/lib/context/PortalContext'
import type { PortalTheme } from '@/lib/childThemes'

// ─── types ───────────────────────────────────────────────────────────────────

interface ParentProfile { id: string; display_name: string; initials: string; color: string }
interface PortalEvent { id: string; title: string; start_date: string; start_time: string | null; all_day: boolean; category: string }
interface DayData { date: string; ownerId: string | null; ownerColor: string; isSwitch: boolean; events: PortalEvent[] }
interface PortalCalData {
  userId:        string
  childId:       string
  connectionId:  string
  parents:       ParentProfile[]
  days:          Record<string, DayData>

}

// ─── constants ───────────────────────────────────────────────────────────────

const WEEKDAYS    = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
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
        .from('children').select('id, connection_id, parent_nicknames')
        .eq('auth_user_id', userId).maybeSingle()

      if (!childRow?.connection_id) { setError('no_child_record'); setLoading(false); return }
      const connectionId = childRow.connection_id
      const childId      = childRow.id
      const nicknames    = (childRow.parent_nicknames ?? {}) as Record<string, string>

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

      const parents: ParentProfile[] = (profResult.data ?? []).map(p => ({
        ...p,
        display_name: nicknames[p.id]?.trim() || p.display_name,
      }))
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

      setData({ userId, childId, connectionId, parents, days })
    } catch { setError('load_failed') }
    finally   { setLoading(false) }
  }, [year, month])

  useEffect(() => { load() }, [load])
  return { data, loading, error, refresh: load }
}

// ─── day detail ──────────────────────────────────────────────────────────────

function DayDetail({
  dateStr, events, theme,
}: {
  dateStr: string
  events: PortalEvent[]
  theme: PortalTheme
}) {
  const label = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })

  return (
    <View style={[detailS.card, { backgroundColor: theme.surface }]}>
      <Text style={[detailS.dateLabel, { color: theme.textPrimary }]}>{label}</Text>
      {events.length === 0
        ? <Text style={[detailS.none, { color: theme.textSubtle }]}>No events</Text>
        : events.map(ev => (
            <View key={ev.id} style={[detailS.row, { borderBottomColor: theme.border }]}>
              <View style={[detailS.dot, { backgroundColor: CATEGORY_COLORS[ev.category] ?? '#6b7280' }]} />
              <View style={{ flex: 1 }}>
                <Text style={[detailS.title, { color: theme.textPrimary }]}>{ev.title}</Text>
                {ev.all_day
                  ? <Text style={[detailS.meta, { color: theme.textMuted }]}>All day</Text>
                  : ev.start_time
                    ? <Text style={[detailS.meta, { color: theme.textMuted }]}>{formatTime(ev.start_time)}</Text>
                    : null}
              </View>
            </View>
          ))
      }
    </View>
  )
}



// ─── add event modal ──────────────────────────────────────────────────────────

function AddEventModal({
  visible, onClose, defaultDate, connectionId, childId, userId, theme, onSaved,
}: {
  visible:      boolean
  onClose:      () => void
  defaultDate:  string
  connectionId: string
  childId:      string
  userId:       string
  theme:        PortalTheme
  onSaved:      () => void
}) {
  const [title,       setTitle]       = useState('')
  const [description, setDescription] = useState('')
  const [allDay,      setAllDay]      = useState(true)
  const [startTime,   setStartTime]   = useState('')
  const [saving,      setSaving]      = useState(false)

  // Reset form when modal opens
  useEffect(() => {
    if (visible) {
      setTitle(''); setDescription(''); setAllDay(true); setStartTime(''); setSaving(false)
    }
  }, [visible])

  async function handleSave() {
    if (!title.trim()) { Alert.alert('Title required', 'Please enter a title for the event.'); return }
    setSaving(true)
    try {
      const { data: newEvent, error } = await supabase
        .from('calendar_events')
        .insert({
          connection_id:        connectionId,
          created_by_id:        userId,
          proposed_by_child_id: childId,
          title:                title.trim(),
          description:          description.trim() || null,
          start_date:           defaultDate,
          all_day:              allDay,
          start_time:           allDay ? null : (startTime.trim() || null),
          end_time:             null,
        })
        .select('id')
        .single()

      if (error || !newEvent) {
        Alert.alert('Error', 'Could not save event. Try again.')
        return
      }

      // Audit log — fire and forget
      const metadata    = { title: title.trim(), start_date: defaultDate, all_day: allDay, start_time: startTime.trim() || null, connection_id: connectionId }
      const auditPayload = { actor_id: userId, action: 'calendar_event.proposed', resource_id: newEvent.id, metadata }
      const sha256_hash  = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        JSON.stringify(auditPayload),
      )
      supabase.from('audit_log').insert({
        actor_id: userId, action: 'calendar_event.proposed',
        resource_type: 'calendar_events', resource_id: newEvent.id,
        metadata, sha256_hash,
      }).then(() => {})

      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[modalS.root, { backgroundColor: theme.bg }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={[modalS.header, { borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={onClose} style={modalS.headerBtn}>
            <Text style={[modalS.cancel, { color: theme.textSecondary }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[modalS.headerTitle, { color: theme.textPrimary }]}>Add Event</Text>
          <TouchableOpacity onPress={handleSave} style={modalS.headerBtn} disabled={saving}>
            <Text style={[modalS.save, { color: theme.accent }, saving && modalS.disabled]}>
              {saving ? 'Saving…' : 'Save'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={modalS.scroll} showsVerticalScrollIndicator={false}>
          {/* Date preview */}
          <Text style={[modalS.datePreview, { color: theme.textMuted }]}>
            {new Date(defaultDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </Text>

          {/* Title */}
          <Text style={[modalS.label, { color: theme.textSecondary }]}>Title</Text>
          <TextInput
            style={[modalS.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.textPrimary }]}
            value={title}
            onChangeText={setTitle}
            placeholder="What is it?"
            placeholderTextColor={theme.textSubtle}
            maxLength={100}
            autoFocus
          />

          {/* All day toggle */}
          <View style={[modalS.toggleRow, { borderColor: theme.border, backgroundColor: theme.surface }]}>
            <Text style={[modalS.toggleLabel, { color: theme.textPrimary }]}>All day</Text>
            <Switch
              value={allDay}
              onValueChange={setAllDay}
              trackColor={{ false: theme.border, true: theme.accent }}
              thumbColor="#fff"
            />
          </View>

          {/* Start time — only when not all day */}
          {!allDay && (
            <>
              <Text style={[modalS.label, { color: theme.textSecondary }]}>Start time</Text>
              <TextInput
                style={[modalS.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.textPrimary }]}
                value={startTime}
                onChangeText={setStartTime}
                placeholder="e.g. 3:30 PM"
                placeholderTextColor={theme.textSubtle}
                maxLength={20}
              />
            </>
          )}

          {/* Description */}
          <Text style={[modalS.label, { color: theme.textSecondary }]}>Details (optional)</Text>
          <TextInput
            style={[modalS.input, modalS.inputMulti, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.textPrimary }]}
            value={description}
            onChangeText={setDescription}
            placeholder="Any extra details…"
            placeholderTextColor={theme.textSubtle}
            multiline
            maxLength={300}
          />

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ─── screen ──────────────────────────────────────────────────────────────────

export default function PortalCalendarScreen() {
  const today = todayStr()
  const now   = new Date()
  const { theme } = usePortal()

  const [year, setYear]         = useState(now.getFullYear())
  const [month, setMonth]       = useState(now.getMonth())
  const [selected, setSelected] = useState<string | null>(today)
  const [showAdd, setShowAdd]   = useState(false)

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
    <View style={[S.root, { backgroundColor: theme.bg }]}>
      <SafeAreaView style={S.safeArea} edges={['top']}>
        <ScrollView
          contentContainerStyle={S.scroll}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={theme.accent} />}
          showsVerticalScrollIndicator={false}
        >
          {/* Month header */}
          <View style={S.monthHeader}>
            <TouchableOpacity onPress={prevMonth} style={S.navBtn} hitSlop={12}>
              <Text style={[S.navArrow, { color: theme.textSecondary }]}>‹</Text>
            </TouchableOpacity>
            <Text style={[S.monthTitle, { color: theme.textPrimary }]}>{MONTH_NAMES[month]} {year}</Text>
            <TouchableOpacity onPress={nextMonth} style={S.navBtn} hitSlop={12}>
              <Text style={[S.navArrow, { color: theme.textSecondary }]}>›</Text>
            </TouchableOpacity>
          </View>

          {/* Weekday labels */}
          <View style={S.weekRow}>
            {WEEKDAYS.map(wd => (
              <View key={wd} style={[S.weekCell, { width: CELL }]}>
                <Text style={[S.weekLabel, { color: theme.textSubtle }]}>{wd}</Text>
              </View>
            ))}
          </View>

          {/* Grid */}
          {loading ? (
            <View style={[S.loadingBox, { height: CELL * 6 }]}>
              <ActivityIndicator size="large" color={theme.accent} />
            </View>
          ) : error ? (
            <View style={S.emptyBox}>
              <Text style={[S.emptyTitle, { color: theme.textPrimary }]}>Calendar unavailable</Text>
              <Text style={[S.emptySubtitle, { color: theme.textMuted }]}>{error}</Text>
            </View>
          ) : (
            <View style={S.grid}>
              {cells.map((cell, i) => {
                if (!cell.day || !cell.dateStr)
                  return <View key={`b-${i}`} style={[S.dayCell, { width: CELL, height: CELL }]} />

                const dd       = data?.days[cell.dateStr]
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
                      isSel ? [S.dayCellSelected, { borderColor: theme.accent }] : null,
                    ]}
                    onPress={() => setSelected(isSel ? null : cell.dateStr)}
                    activeOpacity={0.7}
                  >
                    {isSwitch && oc && (
                      <View style={[S.switchStripe, { backgroundColor: oc }]} />
                    )}
                    <View
                      style={[S.dayNumWrap, isToday ? [S.todayCircle, { backgroundColor: theme.accent }] : null]}
                      collapsable={false}
                      renderToHardwareTextureAndroid
                    >
                      <Text style={[S.dayNum, { color: theme.textPrimary }, isToday ? S.todayNum : null, isSel && !isToday ? S.selNum : null]}>
                        {cell.day}
                      </Text>
                    </View>
                    {isSwitch && <Text style={[S.switchLabel, { color: theme.textMuted }]}>↔</Text>}
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
            <View style={[S.legend, { borderTopColor: theme.border }]}>
              {data.parents.map(p => (
                <View key={p.id} style={S.legendItem}>
                  <View style={[S.legendSwatch, { backgroundColor: p.color + '40' }]} />
                  <Text style={[S.legendLabel, { color: theme.textMuted }]}>{p.display_name}</Text>
                </View>
              ))}
              <View style={S.legendItem}>
                <Text style={[S.legendSwitch, { color: theme.textMuted }]}>↔</Text>
                <Text style={[S.legendLabel, { color: theme.textMuted }]}>Switch</Text>
              </View>
            </View>
          )}

          {/* Day detail */}
          {selected && (
            <DayDetail dateStr={selected} events={selEvents} theme={theme} />
          )}

          <View style={{ height: 80 }} />
        </ScrollView>
      </SafeAreaView>

      {/* FAB — add event */}
      {data && (
        <TouchableOpacity
          style={[S.fab, { backgroundColor: theme.accent }]}
          onPress={() => setShowAdd(true)}
          activeOpacity={0.85}
        >
          <Text style={S.fabIcon}>+</Text>
        </TouchableOpacity>
      )}

      {/* Add event modal */}
      {data && (
        <AddEventModal
          visible={showAdd}
          onClose={() => setShowAdd(false)}
          defaultDate={selected ?? today}
          connectionId={data.connectionId}
          childId={data.childId}
          userId={data.userId}
          theme={theme}
          onSaved={refresh}
        />
      )}
    </View>
  )
}

// ─── styles ──────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  root:       { flex: 1 },
  safeArea:   { flex: 1 },
  scroll:     { paddingHorizontal: 16, paddingTop: 8 },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingHorizontal: 4 },
  navBtn:     { padding: 4 },
  navArrow:   { fontSize: 28, fontFamily: font.regular, fontWeight: '300', lineHeight: 32 },
  monthTitle: { fontSize: 18, fontWeight: '700', fontFamily: font.bold },
  weekRow:    { flexDirection: 'row', gap: 2, marginBottom: 4 },
  weekCell:   { alignItems: 'center', paddingVertical: 4 },
  weekLabel:  { fontSize: 11, fontWeight: '600', fontFamily: font.semibold, letterSpacing: 0.5 },
  grid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  loadingBox: { alignItems: 'center', justifyContent: 'center' },
  emptyBox:   { paddingVertical: 40, alignItems: 'center', paddingHorizontal: 24 },
  emptyTitle: { fontSize: 16, fontWeight: '600', fontFamily: font.semibold, textAlign: 'center', marginBottom: 8 },
  emptySubtitle: { fontSize: 13, fontFamily: font.regular, textAlign: 'center' },
  dayCell:    { alignItems: 'center', borderRadius: radius.sm, paddingVertical: 4, position: 'relative' },
  dayCellSelected: { borderWidth: 1.5 },
  switchStripe: { position: 'absolute', top: 0, left: 0, right: 0, height: 3, borderTopLeftRadius: radius.sm, borderTopRightRadius: radius.sm },
  dayNumWrap: { width: 26, height: 26, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  todayCircle: {},
  dayNum:     { fontSize: 13, fontWeight: '500', fontFamily: font.medium },
  todayNum:   { color: '#fff', fontWeight: '700', fontFamily: font.bold },
  selNum:     { fontWeight: '700', fontFamily: font.bold },
  switchLabel: { fontSize: 9, marginTop: 1 },
  dotsRow:    { position: 'absolute', bottom: 3, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 2 },
  dot:        { width: 4, height: 4, borderRadius: 2 },
  legend:     { flexDirection: 'row', gap: 16, paddingVertical: 12, paddingHorizontal: 4, marginTop: 4, borderTopWidth: 1, marginBottom: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 14, height: 14, borderRadius: 3 },
  legendSwitch: { fontSize: 14 },
  legendLabel: { fontSize: 12, fontFamily: font.regular },

  // FAB
  fab: {
    position: 'absolute', bottom: 24, right: 20,
    width: 52, height: 52, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18, shadowRadius: 8, elevation: 6,
  },
  fabIcon: { fontSize: 28, color: '#fff', fontWeight: '300', lineHeight: 32, marginTop: -2 },
})

const detailS = StyleSheet.create({
  card:          { borderRadius: radius.md, padding: 16, marginBottom: 12, ...shadow.sm },
  dateLabel:     { fontSize: 15, fontWeight: '700', fontFamily: font.bold, marginBottom: 12 },
  none:          { fontSize: 13, fontFamily: font.regular, fontStyle: 'italic' },
  row:           { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, borderBottomWidth: 1, gap: 10 },
  dot:           { width: 8, height: 8, borderRadius: 4, marginTop: 3 },
  title:         { fontSize: 14, fontWeight: '500', fontFamily: font.medium },
  meta:          { fontSize: 12, fontFamily: font.regular, marginTop: 2 },


})

const modalS = StyleSheet.create({
  root:        { flex: 1 },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  headerBtn:   { width: 72 },
  headerTitle: { fontSize: 16, fontWeight: '700', fontFamily: font.bold },
  cancel:      { fontSize: 15, fontFamily: font.regular },
  save:        { fontSize: 15, fontWeight: '600', fontFamily: font.semibold, textAlign: 'right' },
  disabled:    { opacity: 0.4 },
  scroll:      { paddingHorizontal: 20, paddingTop: 16 },
  datePreview: { fontSize: 13, fontFamily: font.medium, marginBottom: 20 },
  label:       { fontSize: 13, fontWeight: '600', fontFamily: font.semibold, marginBottom: 6, marginTop: 16 },
  input:       { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: font.regular },
  inputMulti:  { minHeight: 80, textAlignVertical: 'top' },
  toggleRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, marginTop: 16 },
  toggleLabel: { fontSize: 15, fontFamily: font.regular },
})
