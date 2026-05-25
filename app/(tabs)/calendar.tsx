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
import { useState, useMemo, useCallback, useEffect } from 'react'
import * as Crypto from 'expo-crypto'
import DateTimePicker from '@react-native-community/datetimepicker'
import { useCalendar, CalendarEvent } from '@/lib/hooks/useCalendar'
import { supabase } from '@/lib/supabase'
import { colors, radius, shadow, font } from '@/lib/theme'

// ─── constants ───────────────────────────────────────────────────────────────

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const CATEGORY_COLORS: Record<string, string> = {
  school:    '#3b82f6',
  sports:    '#10b981',
  medical:   '#ef4444',
  birthday:  '#f59e0b',
  holiday:   '#8b5cf6',
  travel:    '#06b6d4',
  other:     '#6b7280',
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function toDateStr(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, '0')
  const d = String(day).padStart(2, '0')
  return `${year}-${m}-${d}`
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function firstWeekday(year: number, month: number): number {
  return new Date(year, month, 1).getDay()
}

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}

function eventDotColor(ev: CalendarEvent): string {
  return CATEGORY_COLORS[ev.category] ?? CATEGORY_COLORS.other
}

// ─── add event modal ─────────────────────────────────────────────────────────

const EVENT_CATEGORIES: { key: string; label: string }[] = [
  { key: 'school',   label: 'School'   },
  { key: 'sports',   label: 'Sports'   },
  { key: 'medical',  label: 'Medical'  },
  { key: 'birthday', label: 'Birthday' },
  { key: 'holiday',  label: 'Holiday'  },
  { key: 'travel',   label: 'Travel'   },
  { key: 'other',    label: 'Other'    },
]

interface AddEventModalProps {
  visible:      boolean
  onClose:      () => void
  defaultDate:  string
  connectionId: string
  userId:       string
  onSaved:      () => void
}

function AddEventModal({ visible, onClose, defaultDate, connectionId, userId, onSaved }: AddEventModalProps) {
  const [title,         setTitle]         = useState('')
  const [description,   setDescription]   = useState('')
  const [category,      setCategory]      = useState('other')
  const [allDay,        setAllDay]        = useState(true)
  const [eventDate,     setEventDate]     = useState<Date>(new Date())
  const [showDatePick,  setShowDatePick]  = useState(false)
  const [startTimeDt,   setStartTimeDt]   = useState<Date>(() => { const d = new Date(); d.setHours(15, 0, 0, 0); return d })
  const [showTimePick,  setShowTimePick]  = useState(false)
  const [saving,        setSaving]        = useState(false)

  function formatTimeDisplay(d: Date): string {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }
  function formatTimeHHMM(d: Date): string {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  useEffect(() => {
    if (visible) {
      setTitle(''); setDescription(''); setCategory('other')
      setAllDay(true); setSaving(false)
      const parts = defaultDate.split('-').map(Number)
      setEventDate(new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0))
      const t = new Date(); t.setHours(15, 0, 0, 0); setStartTimeDt(t)
      setShowDatePick(false); setShowTimePick(false)
    }
  }, [visible, defaultDate])

  function formatEventDateISO(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  function formatEventDateDisplay(d: Date): string {
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  }

  const handleSave = useCallback(async () => {
    if (!title.trim()) { Alert.alert('Title required', 'Give the event a name.'); return }
    setSaving(true)
    try {
      const startDate = formatEventDateISO(eventDate)
      const { data: newEvent, error } = await supabase
        .from('calendar_events')
        .insert({
          connection_id: connectionId,
          created_by_id: userId,
          title:         title.trim(),
          description:   description.trim() || null,
          start_date:    startDate,
          all_day:       allDay,
          start_time:    allDay ? null : formatTimeHHMM(startTimeDt),
          end_time:      null,
          category,
        })
        .select('id')
        .single()

      if (error || !newEvent) {
        Alert.alert('Error', 'Could not save event. Try again.')
        return
      }

      // Audit log — fire and forget
      const metadata = { title: title.trim(), start_date: startDate, all_day: allDay, start_time: allDay ? null : formatTimeHHMM(startTimeDt), category, connection_id: connectionId }
      const auditPayload = { actor_id: userId, action: 'calendar_event.created', resource_id: newEvent.id, metadata }
      const sha256_hash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        JSON.stringify(auditPayload),
      )
      supabase.from('audit_log').insert({
        actor_id: userId, action: 'calendar_event.created',
        resource_type: 'calendar_events', resource_id: newEvent.id,
        metadata, sha256_hash,
      }).then(() => {})

      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }, [title, description, category, allDay, eventDate, startTimeDt, connectionId, userId, onSaved, onClose])

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={addEvStyles.root}>
        {/* Header */}
        <View style={addEvStyles.header}>
          <TouchableOpacity onPress={onClose} style={addEvStyles.headerBtn} disabled={saving}>
            <Text style={[addEvStyles.cancel, saving && { opacity: 0.4 }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={addEvStyles.headerTitle}>Add Event</Text>
          <TouchableOpacity onPress={handleSave} style={addEvStyles.headerBtn} disabled={saving}>
            {saving
              ? <ActivityIndicator size="small" color={colors.accent} />
              : <Text style={[addEvStyles.save, !title.trim() && { opacity: 0.4 }]}>Save</Text>}
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={addEvStyles.form} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

            {/* Title */}
            <Text style={addEvStyles.label}>TITLE</Text>
            <TextInput
              style={addEvStyles.input}
              value={title}
              onChangeText={setTitle}
              placeholder="What is it?"
              placeholderTextColor={colors.textSubtle as string}
              maxLength={100}
              autoFocus
            />

            {/* Date */}
            <Text style={[addEvStyles.label, { marginTop: 20 }]}>DATE</Text>
            <TouchableOpacity
              style={addEvStyles.dateBtn}
              onPress={() => setShowDatePick(p => !p)}
            >
              <Text style={addEvStyles.dateBtnText}>{formatEventDateDisplay(eventDate)}</Text>
            </TouchableOpacity>
            {showDatePick && (
              <>
                <DateTimePicker
                  value={eventDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  themeVariant="light"
                  onChange={(_e, d) => {
                    if (d) setEventDate(d)
                    if (Platform.OS !== 'ios') setShowDatePick(false)
                  }}
                />
                {Platform.OS === 'ios' && (
                  <TouchableOpacity style={addEvStyles.dateDone} onPress={() => setShowDatePick(false)}>
                    <Text style={addEvStyles.dateDoneText}>Done</Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            {/* Category */}
            <Text style={[addEvStyles.label, { marginTop: 20 }]}>CATEGORY</Text>
            <View style={addEvStyles.chipRow}>
              {EVENT_CATEGORIES.map(cat => (
                <TouchableOpacity
                  key={cat.key}
                  style={[
                    addEvStyles.chip,
                    category === cat.key && { backgroundColor: CATEGORY_COLORS[cat.key] + '22', borderColor: CATEGORY_COLORS[cat.key] },
                  ]}
                  onPress={() => setCategory(cat.key)}
                >
                  {category === cat.key && (
                    <View style={[addEvStyles.chipDot, { backgroundColor: CATEGORY_COLORS[cat.key] }]} />
                  )}
                  <Text style={[
                    addEvStyles.chipText,
                    category === cat.key && { color: CATEGORY_COLORS[cat.key], fontWeight: '600', fontFamily: font.semibold },
                  ]}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* All day */}
            <View style={addEvStyles.toggleRow}>
              <Text style={addEvStyles.toggleLabel}>All day</Text>
              <Switch
                value={allDay}
                onValueChange={setAllDay}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor="#fff"
              />
            </View>

            {/* Start time — only when not all day */}
            {!allDay && (
              <>
                <Text style={[addEvStyles.label, { marginTop: 20 }]}>START TIME</Text>
                <TouchableOpacity
                  style={addEvStyles.dateBtn}
                  onPress={() => setShowTimePick(p => !p)}
                >
                  <Text style={addEvStyles.dateBtnText}>{formatTimeDisplay(startTimeDt)}</Text>
                </TouchableOpacity>
                {showTimePick && (
                  <>
                    <DateTimePicker
                      value={startTimeDt}
                      mode="time"
                      display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                      onChange={(_e, d) => {
                        if (d) setStartTimeDt(d)
                        if (Platform.OS !== 'ios') setShowTimePick(false)
                      }}
                    />
                    {Platform.OS === 'ios' && (
                      <TouchableOpacity style={addEvStyles.dateDone} onPress={() => setShowTimePick(false)}>
                        <Text style={addEvStyles.dateDoneText}>Done</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </>
            )}

            {/* Description */}
            <Text style={[addEvStyles.label, { marginTop: 20 }]}>
              DETAILS <Text style={addEvStyles.optional}>(optional)</Text>
            </Text>
            <TextInput
              style={[addEvStyles.input, { minHeight: 80, textAlignVertical: 'top' }]}
              value={description}
              onChangeText={setDescription}
              placeholder="Any extra details…"
              placeholderTextColor={colors.textSubtle as string}
              multiline
              maxLength={300}
            />

            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  )
}

// ─── sub-components ──────────────────────────────────────────────────────────

interface DayDetailProps {
  dateStr: string
  events: CalendarEvent[]
  isSwitch: boolean
  connectionId: string
  userId: string
}

function DayDetail({ dateStr, events, isSwitch, connectionId, userId }: DayDetailProps) {
  const date = new Date(dateStr + 'T12:00:00')
  const label = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  // Switch time override state
  const [showOverride, setShowOverride] = useState(false)
  const [overrideTime, setOverrideTime] = useState<Date>(() => { const d = new Date(); d.setHours(15, 0, 0, 0); return d })
  const [showTimePick, setShowTimePick] = useState(false)
  const [overrideNote, setOverrideNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function fmtHHMM(d: Date) { return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}` }
  function fmtTimeDisplay(d: Date) { return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) }

  async function submitOverride() {
    setSubmitting(true)
    try {
      const { error } = await supabase.from('switch_time_overrides').insert({
        connection_id: connectionId,
        date: dateStr,
        switch_time: fmtHHMM(overrideTime),
        set_by_id: userId,
        note: overrideNote.trim() || null,
        status: 'pending',
      })
      if (error) { Alert.alert('Error', error.message); return }
      setShowOverride(false)
      setOverrideNote('')
      Alert.alert('Proposal sent', 'Your co-parent will see the request and can approve or decline it.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View style={detailStyles.container}>
      <Text style={detailStyles.dateLabel}>{label}</Text>
      {events.length === 0 ? (
        <Text style={detailStyles.noEvents}>No events</Text>
      ) : (
        events.map(ev => (
          <View key={ev.id} style={detailStyles.eventRow}>
            <View style={[detailStyles.dot, { backgroundColor: eventDotColor(ev) }]} />
            <View style={detailStyles.eventInfo}>
              <Text style={detailStyles.eventTitle}>{ev.title}</Text>
              {ev.all_day ? (
                <Text style={detailStyles.eventMeta}>All day</Text>
              ) : ev.start_time ? (
                <Text style={detailStyles.eventMeta}>{formatTime(ev.start_time)}</Text>
              ) : null}
            </View>
          </View>
        ))
      )}

      {/* Switch time override CTA */}
      {isSwitch && !showOverride && (
        <TouchableOpacity
          style={detailStyles.overrideBtn}
          onPress={() => setShowOverride(true)}
          activeOpacity={0.75}
        >
          <Text style={detailStyles.overrideBtnText}>⏰  Propose a different switch time</Text>
        </TouchableOpacity>
      )}

      {isSwitch && showOverride && (
        <View style={detailStyles.overrideForm}>
          <Text style={detailStyles.overrideLabel}>PROPOSED TIME</Text>
          <TouchableOpacity
            style={detailStyles.overrideTimeBtn}
            onPress={() => setShowTimePick(p => !p)}
          >
            <Text style={detailStyles.overrideTimeText}>{fmtTimeDisplay(overrideTime)}</Text>
          </TouchableOpacity>
          {showTimePick && (
            <>
              <DateTimePicker
                value={overrideTime}
                mode="time"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(_e, d) => { if (d) setOverrideTime(d); if (Platform.OS !== 'ios') setShowTimePick(false) }}
              />
              {Platform.OS === 'ios' && (
                <TouchableOpacity onPress={() => setShowTimePick(false)} style={{ alignItems: 'center', paddingVertical: 4 }}>
                  <Text style={{ color: colors.accent, fontFamily: font.medium, fontSize: 14 }}>Done</Text>
                </TouchableOpacity>
              )}
            </>
          )}
          <Text style={[detailStyles.overrideLabel, { marginTop: 10 }]}>NOTE (OPTIONAL)</Text>
          <TextInput
            style={detailStyles.overrideInput}
            value={overrideNote}
            onChangeText={setOverrideNote}
            placeholder="e.g. Traffic — can we do 4pm instead?"
            placeholderTextColor={colors.textSubtle}
            maxLength={200}
          />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <TouchableOpacity
              style={[detailStyles.overrideSubmit, { flex: 1 }]}
              onPress={submitOverride}
              disabled={submitting}
            >
              <Text style={detailStyles.overrideSubmitText}>{submitting ? 'Sending…' : 'Send proposal'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[detailStyles.overrideCancel]}
              onPress={() => { setShowOverride(false); setOverrideNote('') }}
            >
              <Text style={detailStyles.overrideCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  )
}

// ─── screen ──────────────────────────────────────────────────────────────────

export default function CalendarScreen() {
  const today = todayStr()
  const now = new Date()

  const [year, setYear]     = useState(now.getFullYear())
  const [month, setMonth]   = useState(now.getMonth())
  const [selected, setSelected] = useState<string | null>(today)
  const [showAdd, setShowAdd] = useState(false)

  const { data, loading, error, refresh } = useCalendar(year, month)
  const { width } = useWindowDimensions()

  // cell size: full width minus horizontal padding (32) minus 6 column gaps of 2px each (12), divided by 7
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

  // Build grid cells
  const cells = useMemo(() => {
    const total = daysInMonth(year, month)
    const offset = firstWeekday(year, month)
    const items: Array<{ day: number | null; dateStr: string | null }> = []
    for (let i = 0; i < offset; i++) items.push({ day: null, dateStr: null })
    for (let d = 1; d <= total; d++) {
      items.push({ day: d, dateStr: toDateStr(year, month, d) })
    }
    // pad to complete last row
    while (items.length % 7 !== 0) items.push({ day: null, dateStr: null })
    return items
  }, [year, month])

  const selectedDayData = selected ? data?.days[selected] : null
  const selectedEvents  = selectedDayData?.events ?? []

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.accent} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Month header */}
        <View style={styles.monthHeader}>
          <TouchableOpacity onPress={prevMonth} style={styles.navBtn} hitSlop={12}>
            <Text style={styles.navArrow}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.monthTitle}>{MONTH_NAMES[month]} {year}</Text>
          <TouchableOpacity onPress={nextMonth} style={styles.navBtn} hitSlop={12}>
            <Text style={styles.navArrow}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Weekday labels */}
        <View style={styles.weekRow}>
          {WEEKDAYS.map(wd => (
            <View key={wd} style={[styles.weekCell, { width: CELL }]}>
              <Text style={styles.weekLabel}>{wd}</Text>
            </View>
          ))}
        </View>

        {/* Calendar grid */}
        {loading ? (
          <View style={[styles.loadingBox, { height: CELL * 6 }]}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : error === 'no_connection' ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No co-parent connected</Text>
            <Text style={styles.emptySubtitle}>Connect with your co-parent to see the custody calendar.</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {cells.map((cell, i) => {
              if (!cell.day || !cell.dateStr) {
                return <View key={`blank-${i}`} style={[styles.dayCell, { width: CELL, height: CELL }]} />
              }

              const dayData     = data?.days[cell.dateStr]
              const isToday     = cell.dateStr === today
              const isSel       = cell.dateStr === selected
              const hasSchedule = !!dayData?.ownerId
              const ownerColor  = dayData?.ownerColor ?? null
              const mColor      = dayData?.morningColor ?? ownerColor
              const isSwitch    = dayData?.isSwitch ?? false
              const isSplitCell = isSwitch && !!mColor && !!ownerColor && mColor !== ownerColor
              const evCount     = dayData?.events.length ?? 0
              const evColors    = (dayData?.events ?? []).slice(0, 3).map(eventDotColor)

              return (
                <TouchableOpacity
                  key={cell.dateStr}
                  style={[
                    styles.dayCell,
                    { width: CELL, height: CELL },
                    hasSchedule && (isSplitCell ? mColor : ownerColor)
                      // Split: morning bg at 12% (1F hex), solid days at 13% (22 hex)
                      ? { backgroundColor: (isSplitCell ? mColor! + '1F' : ownerColor! + '22') }
                      : null,
                    isSel ? styles.dayCellSelected : null,
                  ]}
                  onPress={() => setSelected(isSel ? null : cell.dateStr)}
                  activeOpacity={0.7}
                >
                  {/* Diagonal split: bottom-right triangle in evening color (no expo-linear-gradient needed) */}
                  {isSplitCell && (
                    <View
                      pointerEvents="none"
                      style={{
                        position: 'absolute',
                        right: 0,
                        bottom: 0,
                        width: 0,
                        height: 0,
                        borderBottomWidth: CELL,
                        borderBottomColor: ownerColor! + '33',  // ~20% opacity — richer than morning
                        borderLeftWidth: CELL,
                        borderLeftColor: 'transparent',
                      }}
                    />
                  )}
                  {/* Switch stripe on non-split switch days only */}
                  {isSwitch && ownerColor && !isSplitCell && (
                    <View style={[styles.switchStripe, { backgroundColor: ownerColor }]} />
                  )}

                  <View
                    collapsable={false}
                    renderToHardwareTextureAndroid
                    style={[
                      styles.dayNumWrap,
                      isToday ? styles.todayCircle : null,
                    ]}
                  >
                    <Text style={[
                      styles.dayNum,
                      isToday ? styles.todayNum : null,
                      isSel && !isToday ? styles.selectedNum : null,
                    ]}>
                      {cell.day}
                    </Text>
                  </View>

                  {/* Switch label */}
                  {isSwitch && (
                    <Text style={styles.switchLabel}>↔</Text>
                  )}

                  {/* Event dots */}
                  {evCount > 0 && (
                    <View style={styles.dotsRow}>
                      {evColors.map((c, di) => (
                        <View key={di} style={[styles.dot, { backgroundColor: c }]} />
                      ))}
                    </View>
                  )}
                </TouchableOpacity>
              )
            })}
          </View>
        )}

        {/* Legend */}
        {data && (
          <View style={styles.legend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendSwatch, { backgroundColor: (data.myProfile.color ?? '#6b7280') + '40' }]} />
              <Text style={styles.legendLabel}>{data.myProfile.display_name}</Text>
            </View>
            {data.coParentProfile && (
              <View style={styles.legendItem}>
                <View style={[styles.legendSwatch, { backgroundColor: (data.coParentProfile.color ?? '#6b7280') + '40' }]} />
                <Text style={styles.legendLabel}>{data.coParentProfile.display_name}</Text>
              </View>
            )}
            <View style={styles.legendItem}>
              <Text style={styles.legendSwitch}>↔</Text>
              <Text style={styles.legendLabel}>Switch</Text>
            </View>
          </View>
        )}

        {/* Day detail panel */}
        {selected && (
          <DayDetail
            dateStr={selected}
            events={selectedEvents}
            isSwitch={selectedDayData?.isSwitch ?? false}
            connectionId={data?.connectionId ?? ''}
            userId={data?.userId ?? ''}
          />
        )}

        <View style={styles.bottomPad} />
      </ScrollView>

      {/* FAB — add event */}
      {data && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setShowAdd(true)}
          activeOpacity={0.85}
        >
          <Text style={styles.fabIcon}>+</Text>
        </TouchableOpacity>
      )}

      {/* Add event modal */}
      {data && (
        <AddEventModal
          visible={showAdd}
          onClose={() => setShowAdd(false)}
          defaultDate={selected ?? today}
          connectionId={data.connectionId}
          userId={data.userId}
          onSaved={refresh}
        />
      )}
    </SafeAreaView>
  )
}

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: 16, paddingTop: 8 },
  bottomPad: { height: 32 },

  // Month header
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  navBtn: { padding: 4 },
  navArrow: { fontSize: 28, fontFamily: font.regular, color: colors.textSecondary, fontWeight: '300', lineHeight: 32 },
  monthTitle: { fontSize: 18, fontWeight: '700', fontFamily: font.bold, color: colors.textPrimary },

  // Weekday labels
  weekRow: { flexDirection: 'row', gap: 2, marginBottom: 4 },
  weekCell: { alignItems: 'center', paddingVertical: 4 },
  weekLabel: { fontSize: 11, fontWeight: '600', fontFamily: font.semibold, color: colors.textSubtle, letterSpacing: 0.5 },

  // Grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  loadingBox: { alignItems: 'center', justifyContent: 'center' },
  emptyBox: { paddingVertical: 40, alignItems: 'center', paddingHorizontal: 24 },
  emptyTitle: { fontSize: 16, fontWeight: '600', fontFamily: font.semibold, color: colors.textPrimary, textAlign: 'center', marginBottom: 8 },
  emptySubtitle: { fontSize: 13, fontFamily: font.regular, color: colors.textMuted, textAlign: 'center' },

  // Day cell — no overflow:hidden; that clipping layer on Android prevents
  // child text from being recomposited when the tab re-focuses
  dayCell: {
    alignItems: 'center',
    borderRadius: radius.sm,
    paddingVertical: 4,
    position: 'relative',
  },
  dayCellSelected: {
    borderWidth: 1.5,
    borderColor: colors.accent,
  },

  // Switch stripe — thin bar at top of cell
  switchStripe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    borderTopLeftRadius: radius.sm,
    borderTopRightRadius: radius.sm,
  },

  // Day number
  dayNumWrap: {
    width: 26,
    height: 26,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  todayCircle: { backgroundColor: colors.accent },
  dayNum: { fontSize: 13, fontWeight: '500', fontFamily: font.medium, color: colors.textPrimary },
  todayNum: { color: colors.white, fontWeight: '700', fontFamily: font.bold },
  selectedNum: { fontWeight: '700', fontFamily: font.bold },

  switchLabel: { fontSize: 9, color: colors.textMuted, marginTop: 1 },

  // Event dots
  dotsRow: { position: 'absolute', bottom: 3, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 2 },
  dot: { width: 4, height: 4, borderRadius: 2 },

  // Legend
  legend: {
    flexDirection: 'row',
    gap: 16,
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginBottom: 4,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 14, height: 14, borderRadius: 3 },
  legendSwitch: { fontSize: 14, color: colors.textMuted },
  legendLabel: { fontSize: 12, fontFamily: font.regular, color: colors.textMuted },

  // FAB
  fab: {
    position: 'absolute', bottom: 24, right: 20,
    width: 52, height: 52, borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18, shadowRadius: 8, elevation: 6,
  },
  fabIcon: { fontSize: 28, color: '#fff', fontWeight: '300', lineHeight: 32, marginTop: -2 },
})

// ─── add event modal styles ───────────────────────────────────────────────────

const addEvStyles = StyleSheet.create({
  root:        { flex: 1, backgroundColor: colors.surface },
  header:      {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: colors.borderHair,
  },
  headerBtn:   { width: 72 },
  cancel:      { fontSize: 15, fontFamily: font.regular, color: colors.textMuted as string },
  headerTitle: { fontSize: 17, fontWeight: '600', fontFamily: font.semibold, color: colors.textPrimary },
  save:        { fontSize: 15, fontWeight: '600', fontFamily: font.semibold, color: colors.accent, textAlign: 'right' },

  form:   { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 60 },
  label:  { fontSize: 11, fontWeight: '700', fontFamily: font.bold, color: colors.textSubtle as string, letterSpacing: 0.8, marginBottom: 6 },
  optional: { fontWeight: '400', letterSpacing: 0, textTransform: 'none', color: colors.textSubtle as string },

  input: {
    backgroundColor: colors.surface2, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontFamily: font.regular, color: colors.textPrimary,
  },

  dateBtn: {
    backgroundColor: colors.surface2, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 13,
  },
  dateBtnText: { fontSize: 15, fontFamily: font.regular, color: colors.textPrimary },
  dateDone:     { alignItems: 'flex-end', paddingHorizontal: 4, paddingVertical: 6 },
  dateDoneText: { fontSize: 15, fontWeight: '600', fontFamily: font.semibold, color: colors.accent },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: colors.surface2,
  },
  chipDot:  { width: 7, height: 7, borderRadius: 4 },
  chipText: { fontSize: 13, fontFamily: font.medium, fontWeight: '500', color: colors.textMuted as string },

  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 12, marginTop: 20,
    backgroundColor: colors.surface2,
  },
  toggleLabel: { fontSize: 15, fontFamily: font.regular, color: colors.textPrimary },
})

const detailStyles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 16,
    marginBottom: 12,
    ...shadow.sm,
  },
  dateLabel: { fontSize: 15, fontWeight: '700', fontFamily: font.bold, color: colors.textPrimary, marginBottom: 12 },
  noEvents: { fontSize: 13, fontFamily: font.regular, color: colors.textSubtle, fontStyle: 'italic' },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderHair,
    gap: 10,
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 3 },
  eventInfo: { flex: 1 },
  eventTitle: { fontSize: 14, fontWeight: '500', fontFamily: font.medium, color: colors.textPrimary },
  eventMeta: { fontSize: 12, fontFamily: font.regular, color: colors.textMuted, marginTop: 2 },

  // Switch time override
  overrideBtn: {
    marginTop: 12, paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    borderStyle: 'dashed', alignItems: 'center',
  },
  overrideBtnText: { fontSize: 13, fontFamily: font.medium, color: colors.accent },
  overrideForm: {
    marginTop: 12, padding: 12, borderRadius: radius.md,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
  },
  overrideLabel: {
    fontSize: 11, fontWeight: '700', fontFamily: font.bold,
    color: colors.textSubtle, letterSpacing: 0.8, marginBottom: 6,
  },
  overrideTimeBtn: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10, alignItems: 'center',
  },
  overrideTimeText: { fontSize: 16, fontFamily: font.semibold, color: colors.textPrimary },
  overrideInput: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 8,
    fontSize: 14, fontFamily: font.regular, color: colors.textPrimary,
  },
  overrideSubmit: {
    backgroundColor: colors.accent, borderRadius: radius.sm,
    paddingVertical: 10, alignItems: 'center',
  },
  overrideSubmitText: { color: colors.white, fontFamily: font.semibold, fontSize: 14 },
  overrideCancel: {
    borderRadius: radius.sm, paddingVertical: 10, paddingHorizontal: 16,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center',
  },
  overrideCancelText: { color: colors.textMuted, fontFamily: font.medium, fontSize: 14 },
})
