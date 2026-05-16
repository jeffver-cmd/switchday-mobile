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
import { useState, useMemo } from 'react'
import { useCalendar, CalendarEvent } from '@/lib/hooks/useCalendar'

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

// ─── sub-components ──────────────────────────────────────────────────────────

interface DayDetailProps {
  dateStr: string
  events: CalendarEvent[]
}

function DayDetail({ dateStr, events }: DayDetailProps) {
  const date = new Date(dateStr + 'T12:00:00')
  const label = date.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })

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
    </View>
  )
}

// ─── screen ──────────────────────────────────────────────────────────────────

export default function CalendarScreen() {
  const today = todayStr()
  const now = new Date()

  const [year, setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [selected, setSelected] = useState<string | null>(today)

  const { data, loading, error, refresh } = useCalendar(year, month)
  const { width } = useWindowDimensions()

  // cell size: full width minus horizontal padding (16 each side), divided by 7
  const CELL = Math.floor((width - 32) / 7)

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
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
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
            <ActivityIndicator size="large" color="#374151" />
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

              const dayData  = data?.days[cell.dateStr]
              const isToday  = cell.dateStr === today
              const isSel    = cell.dateStr === selected
              const hasSchedule = !!dayData?.ownerId
              const ownerColor  = dayData?.ownerColor ?? null
              const isSwitch    = dayData?.isSwitch ?? false
              const evCount     = dayData?.events.length ?? 0
              const evColors    = (dayData?.events ?? []).slice(0, 3).map(eventDotColor)

              return (
                <TouchableOpacity
                  key={cell.dateStr}
                  style={[
                    styles.dayCell,
                    { width: CELL, height: CELL },
                    hasSchedule && ownerColor
                      ? { backgroundColor: ownerColor + '28' }  // 16% opacity tint
                      : null,
                    isSel ? styles.dayCellSelected : null,
                  ]}
                  onPress={() => setSelected(isSel ? null : cell.dateStr)}
                  activeOpacity={0.7}
                >
                  {/* Switch stripe — thin top border in owner color */}
                  {isSwitch && ownerColor && (
                    <View style={[styles.switchStripe, { backgroundColor: ownerColor }]} />
                  )}

                  {/* Day number */}
                  <View style={[
                    styles.dayNumWrap,
                    isToday ? styles.todayCircle : null,
                  ]}>
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
          />
        )}

        <View style={styles.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  )
}

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
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
  navArrow: { fontSize: 28, color: '#374151', fontWeight: '300', lineHeight: 32 },
  monthTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },

  // Weekday labels
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekCell: { alignItems: 'center', paddingVertical: 4 },
  weekLabel: { fontSize: 11, fontWeight: '600', color: '#9ca3af', letterSpacing: 0.5 },

  // Grid
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  loadingBox: { alignItems: 'center', justifyContent: 'center' },
  emptyBox: { paddingVertical: 40, alignItems: 'center', paddingHorizontal: 24 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#111827', textAlign: 'center', marginBottom: 8 },
  emptySubtitle: { fontSize: 13, color: '#6b7280', textAlign: 'center' },

  // Day cell
  dayCell: {
    alignItems: 'center',
    borderRadius: 8,
    paddingVertical: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  dayCellSelected: {
    borderWidth: 1.5,
    borderColor: '#374151',
  },

  // Switch stripe — thin bar at top of cell
  switchStripe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },

  // Day number
  dayNumWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  todayCircle: { backgroundColor: '#1f2937' },
  dayNum: { fontSize: 13, fontWeight: '500', color: '#1f2937' },
  todayNum: { color: '#ffffff', fontWeight: '700' },
  selectedNum: { fontWeight: '700' },

  switchLabel: { fontSize: 9, color: '#6b7280', marginTop: 1 },

  // Event dots
  dotsRow: { flexDirection: 'row', gap: 2, marginTop: 2 },
  dot: { width: 4, height: 4, borderRadius: 2 },

  // Legend
  legend: {
    flexDirection: 'row',
    gap: 16,
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    marginBottom: 4,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 14, height: 14, borderRadius: 3 },
  legendSwitch: { fontSize: 14, color: '#6b7280' },
  legendLabel: { fontSize: 12, color: '#6b7280' },
})

const detailStyles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  dateLabel: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 12 },
  noEvents: { fontSize: 13, color: '#9ca3af', fontStyle: 'italic' },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    gap: 10,
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 3 },
  eventInfo: { flex: 1 },
  eventTitle: { fontSize: 14, fontWeight: '500', color: '#1f2937' },
  eventMeta: { fontSize: 12, color: '#6b7280', marginTop: 2 },
})
