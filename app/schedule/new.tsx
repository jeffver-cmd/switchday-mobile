import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  FlatList,
  Modal,
  Platform,
  ActivityIndicator,
  Alert,
  useWindowDimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import DateTimePicker from '@react-native-community/datetimepicker'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useState, useCallback, useMemo } from 'react'
import { useSchedules } from '@/lib/hooks/useSchedules'
import { createSchedule, scheduleAction, type SchedulePattern } from '@/lib/api/schedules'
import { colors, radius, font } from '@/lib/theme'

// ─── types ───────────────────────────────────────────────────────────────────

type UIPattern =
  | 'week_on_week_off'
  | '2_2_3'
  | '3_4_4_3'
  | '2_2_5_5'
  | 'custom_cycle'
  | 'custom_specific'

// ─── constants ───────────────────────────────────────────────────────────────

const PATTERN_OPTIONS: { key: UIPattern; label: string; sub: string }[] = [
  { key: 'week_on_week_off', label: 'Week on / week off', sub: '7-7 · 50/50' },
  { key: '2_2_3',           label: '2-2-3 rotating',    sub: '50/50' },
  { key: '3_4_4_3',         label: '3-4-4-3 rotating',  sub: '50/50' },
  { key: '2_2_5_5',         label: '2-2-5-5 rotating',  sub: '50/50' },
  { key: 'custom_cycle',    label: 'Custom cycle',       sub: 'Repeating pattern' },
  { key: 'custom_specific', label: 'Specific days',      sub: 'Assign day by day' },
]

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

// ─── date helpers ─────────────────────────────────────────────────────────────

function toYMD(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function fmtDisplay(d: Date | null): string {
  if (!d) return 'Select date'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function firstWeekday(year: number, month: number): number {
  return new Date(year, month, 1).getDay()
}

function toDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

// ─── date field component ─────────────────────────────────────────────────────

interface DateFieldProps {
  label: string
  value: Date | null
  min?: Date
  max?: Date
  onChange: (d: Date) => void
}

function DateField({ label, value, min, max, onChange }: DateFieldProps) {
  const [show, setShow] = useState(false)

  const handleChange = useCallback((_: unknown, selected?: Date) => {
    if (Platform.OS === 'android') setShow(false)
    if (selected) onChange(selected)
  }, [onChange])

  return (
    <View style={df.wrapper}>
      <Text style={df.label}>{label}</Text>
      <TouchableOpacity style={df.btn} onPress={() => setShow(true)}>
        <Text style={value ? df.valueText : df.placeholderText}>{fmtDisplay(value)}</Text>
        <Text style={df.chevron}>›</Text>
      </TouchableOpacity>

      {Platform.OS === 'android' && show && (
        <DateTimePicker
          value={value ?? new Date()}
          mode="date"
          minimumDate={min}
          maximumDate={max}
          onChange={handleChange}
        />
      )}

      {Platform.OS === 'ios' && (
        <Modal
          visible={show}
          transparent
          animationType="slide"
          onRequestClose={() => setShow(false)}
        >
          <View style={df.iosBackdrop}>
            <View style={df.iosSheet}>
              <View style={df.iosDone}>
                <TouchableOpacity onPress={() => setShow(false)}>
                  <Text style={df.iosDoneText}>Done</Text>
                </TouchableOpacity>
              </View>
              <DateTimePicker
                value={value ?? new Date()}
                mode="date"
                display="spinner"
                themeVariant="light"
                minimumDate={min}
                maximumDate={max}
                onChange={handleChange}
              />
            </View>
          </View>
        </Modal>
      )}
    </View>
  )
}

const df = StyleSheet.create({
  wrapper: { marginBottom: 0 },
  label: { fontSize: 13, fontWeight: '600', fontFamily: font.semibold, color: colors.textSecondary, marginBottom: 6 },
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 13,
  },
  valueText: { fontSize: 15, fontFamily: font.regular, color: colors.textPrimary },
  placeholderText: { fontSize: 15, fontFamily: font.regular, color: colors.textSubtle },
  chevron: { fontSize: 20, fontFamily: font.regular, color: colors.textSubtle },
  iosBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' },
  iosSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  iosDone: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingTop: 12 },
  iosDoneText: { fontSize: 17, fontWeight: '600', fontFamily: font.semibold, color: colors.accent },
})

// ─── custom cycle editor ──────────────────────────────────────────────────────

interface CycleEditorProps {
  sequence: string[]
  onSequenceChange: (seq: string[]) => void
  cycleLen: number
  onCycleLenChange: (n: number) => void
  ownerA: { id: string; color: string; initials: string }
  ownerB: { id: string; color: string; initials: string }
}

function CustomCycleEditor({ sequence, onSequenceChange, cycleLen, onCycleLenChange, ownerA, ownerB }: CycleEditorProps) {
  const splitA = sequence.filter(id => id === ownerA.id).length
  const splitPct = sequence.length > 0 ? Math.round((splitA / sequence.length) * 100) : 50

  const toggleDay = useCallback((index: number) => {
    const next = [...sequence]
    next[index] = next[index] === ownerA.id ? ownerB.id : ownerA.id
    onSequenceChange(next)
  }, [sequence, ownerA.id, ownerB.id, onSequenceChange])

  const addDay = useCallback(() => {
    if (cycleLen >= 56) return
    const newLen = cycleLen + 1
    onCycleLenChange(newLen)
    const last = sequence[sequence.length - 1] ?? ownerA.id
    const next = last === ownerA.id ? ownerB.id : ownerA.id
    onSequenceChange([...sequence, next])
  }, [cycleLen, sequence, ownerA.id, ownerB.id, onCycleLenChange, onSequenceChange])

  const removeDay = useCallback(() => {
    if (cycleLen <= 1) return
    onCycleLenChange(cycleLen - 1)
    onSequenceChange(sequence.slice(0, -1))
  }, [cycleLen, sequence, onCycleLenChange, onSequenceChange])

  return (
    <View style={ce.container}>
      {/* Stepper */}
      <View style={ce.stepperRow}>
        <TouchableOpacity style={ce.stepBtn} onPress={removeDay} disabled={cycleLen <= 1}>
          <Text style={ce.stepBtnText}>−</Text>
        </TouchableOpacity>
        <Text style={ce.stepLabel}>{cycleLen} days</Text>
        <TouchableOpacity style={ce.stepBtn} onPress={addDay} disabled={cycleLen >= 56}>
          <Text style={ce.stepBtnText}>+</Text>
        </TouchableOpacity>
        <Text style={ce.splitLabel}>{splitPct}% / {100 - splitPct}%</Text>
      </View>

      {/* Day strip */}
      <FlatList
        horizontal
        data={sequence}
        keyExtractor={(_, i) => String(i)}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={ce.strip}
        renderItem={({ item, index }) => {
          const owner = item === ownerA.id ? ownerA : ownerB
          return (
            <TouchableOpacity style={ce.cell} onPress={() => toggleDay(index)}>
              <View style={[ce.circle, { backgroundColor: owner.color }]}>
                <Text style={ce.circleText}>{owner.initials}</Text>
              </View>
              <Text style={ce.dayNum}>{index + 1}</Text>
            </TouchableOpacity>
          )
        }}
      />

      {/* Legend */}
      <View style={ce.legend}>
        <View style={ce.legendItem}>
          <View style={[ce.legendDot, { backgroundColor: ownerA.color }]} />
          <Text style={ce.legendText}>{ownerA.initials} = You</Text>
        </View>
        <View style={ce.legendItem}>
          <View style={[ce.legendDot, { backgroundColor: ownerB.color }]} />
          <Text style={ce.legendText}>{ownerB.initials} = Co-parent</Text>
        </View>
      </View>
    </View>
  )
}

const ce = StyleSheet.create({
  container: { marginTop: 8 },
  stepperRow: {
    flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10,
  },
  stepBtn: {
    width: 34, height: 34, borderRadius: radius.full, backgroundColor: colors.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  stepBtnText: { fontSize: 20, fontFamily: font.regular, color: colors.textSecondary, lineHeight: 24 },
  stepLabel: { fontSize: 15, fontWeight: '600', fontFamily: font.semibold, color: colors.textPrimary, minWidth: 64, textAlign: 'center' },
  splitLabel: { fontSize: 13, fontFamily: font.regular, color: colors.textSubtle, marginLeft: 'auto' },
  strip: { paddingVertical: 4, paddingHorizontal: 4, gap: 6 },
  cell: { alignItems: 'center', width: 48, gap: 4 },
  circle: {
    width: 40, height: 40, borderRadius: radius.full,
    alignItems: 'center', justifyContent: 'center',
  },
  circleText: { fontSize: 13, fontWeight: '700', fontFamily: font.bold, color: colors.white },
  dayNum: { fontSize: 10, fontFamily: font.regular, color: colors.textMuted },
  legend: { flexDirection: 'row', gap: 16, marginTop: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  legendText: { fontSize: 12, fontFamily: font.regular, color: colors.textMuted },
})

// ─── custom specific days editor ──────────────────────────────────────────────

interface SpecificEditorProps {
  specificDays: Record<string, string>
  onChange: (days: Record<string, string>) => void
  startDate: Date
  endDate: Date
  ownerA: { id: string; color: string; initials: string }
  ownerB: { id: string; color: string; initials: string }
}

function CustomSpecificEditor({ specificDays, onChange, startDate, endDate, ownerA, ownerB }: SpecificEditorProps) {
  const { width } = useWindowDimensions()
  // form paddingHorizontal: 20 each side = 40px; 6 gaps of 2px = 12px; total = 52px
  const CELL = Math.floor((width - 52) / 7)

  const startYM = { year: startDate.getFullYear(), month: startDate.getMonth() }
  const endYM   = { year: endDate.getFullYear(),   month: endDate.getMonth() }

  const [edYear, setEdYear]   = useState(startYM.year)
  const [edMonth, setEdMonth] = useState(startYM.month)

  const startYMD = toYMD(startDate)
  const endYMD   = toYMD(endDate)

  const atStart = edYear === startYM.year && edMonth === startYM.month
  const atEnd   = edYear === endYM.year   && edMonth === endYM.month

  function prevMonth() {
    if (atStart) return
    if (edMonth === 0) { setEdYear(y => y - 1); setEdMonth(11) }
    else setEdMonth(m => m - 1)
  }

  function nextMonth() {
    if (atEnd) return
    if (edMonth === 11) { setEdYear(y => y + 1); setEdMonth(0) }
    else setEdMonth(m => m + 1)
  }

  const cells = useMemo(() => {
    const total = daysInMonth(edYear, edMonth)
    const offset = firstWeekday(edYear, edMonth)
    const items: Array<{ day: number | null; dateStr: string | null }> = []
    for (let i = 0; i < offset; i++) items.push({ day: null, dateStr: null })
    for (let d = 1; d <= total; d++) items.push({ day: d, dateStr: toDateStr(edYear, edMonth, d) })
    while (items.length % 7 !== 0) items.push({ day: null, dateStr: null })
    return items
  }, [edYear, edMonth])

  const tapDay = useCallback((dateStr: string) => {
    const current = specificDays[dateStr]
    const next = { ...specificDays }
    if (!current) {
      next[dateStr] = ownerA.id
    } else if (current === ownerA.id) {
      next[dateStr] = ownerB.id
    } else {
      delete next[dateStr]
    }
    onChange(next)
  }, [specificDays, ownerA.id, ownerB.id, onChange])

  const totalAssigned = Object.keys(specificDays).length
  const aCount = Object.values(specificDays).filter(id => id === ownerA.id).length
  const bCount = totalAssigned - aCount

  return (
    <View style={se.container}>
      {/* Month nav */}
      <View style={se.monthHeader}>
        <TouchableOpacity onPress={prevMonth} disabled={atStart} style={se.navBtn}>
          <Text style={[se.navArrow, atStart && se.navDisabled]}>‹</Text>
        </TouchableOpacity>
        <Text style={se.monthTitle}>{MONTH_NAMES[edMonth]} {edYear}</Text>
        <TouchableOpacity onPress={nextMonth} disabled={atEnd} style={se.navBtn}>
          <Text style={[se.navArrow, atEnd && se.navDisabled]}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Weekday labels */}
      <View style={[se.weekRow, { gap: 2 }]}>
        {WEEKDAYS.map(wd => (
          <View key={wd} style={[se.weekCell, { width: CELL }]}>
            <Text style={se.weekLabel}>{wd}</Text>
          </View>
        ))}
      </View>

      {/* Grid — explicit rows so ScrollView can measure height correctly */}
      {Array.from({ length: Math.ceil(cells.length / 7) }).map((_, rowIdx) => (
        <View key={rowIdx} style={[se.gridRow, { gap: 2, marginBottom: 2 }]}>
          {cells.slice(rowIdx * 7, (rowIdx + 1) * 7).map((cell, colIdx) => {
            if (!cell.day || !cell.dateStr) {
              return <View key={`b${colIdx}`} style={[se.cell, { width: CELL, height: CELL }]} />
            }
            const outOfRange = cell.dateStr < startYMD || cell.dateStr > endYMD
            const ownerId = specificDays[cell.dateStr]
            const owner = ownerId === ownerA.id ? ownerA : ownerId === ownerB.id ? ownerB : null

            return (
              <TouchableOpacity
                key={cell.dateStr}
                style={[se.cell, { width: CELL, height: CELL }, outOfRange && se.cellOut]}
                onPress={() => !outOfRange && tapDay(cell.dateStr!)}
                activeOpacity={outOfRange ? 1 : 0.7}
              >
                {owner ? (
                  <View style={[se.ownerCircle, { backgroundColor: owner.color }]}>
                    <Text style={se.ownerInitials}>{owner.initials}</Text>
                  </View>
                ) : (
                  <View style={[se.emptyCircle, outOfRange && se.emptyCircleOut]}>
                    <Text style={[se.dayNum, outOfRange && se.dayNumOut]}>{cell.day}</Text>
                  </View>
                )}
              </TouchableOpacity>
            )
          })}
        </View>
      ))}

      {/* Tally */}
      <View style={se.tally}>
        <View style={se.tallyItem}>
          <View style={[se.tallyDot, { backgroundColor: ownerA.color }]} />
          <Text style={se.tallyText}>{ownerA.initials}: {aCount} days</Text>
        </View>
        <View style={se.tallyItem}>
          <View style={[se.tallyDot, { backgroundColor: ownerB.color }]} />
          <Text style={se.tallyText}>{ownerB.initials}: {bCount} days</Text>
        </View>
      </View>
    </View>
  )
}

const se = StyleSheet.create({
  container: { marginTop: 8 },
  monthHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  navBtn: { padding: 4 },
  navArrow: { fontSize: 26, fontFamily: font.regular, color: colors.textSecondary, fontWeight: '300', lineHeight: 30 },
  navDisabled: { color: colors.textSubtle },
  monthTitle: { fontSize: 16, fontWeight: '700', fontFamily: font.bold, color: colors.textPrimary },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekCell: { alignItems: 'center', paddingVertical: 2 },
  weekLabel: { fontSize: 10, fontWeight: '600', fontFamily: font.semibold, color: colors.textSubtle },
  gridRow: { flexDirection: 'row' },
  cell: { alignItems: 'center', justifyContent: 'center', padding: 2 },
  cellOut: { opacity: 0.25 },
  ownerCircle: {
    width: 34, height: 34, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  ownerInitials: { fontSize: 12, fontWeight: '700', fontFamily: font.bold, color: colors.white },
  emptyCircle: {
    width: 34, height: 34, borderRadius: radius.md, borderWidth: 1,
    borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
  },
  emptyCircleOut: { borderColor: colors.borderHair },
  dayNum: { fontSize: 12, fontFamily: font.regular, color: colors.textMuted },
  dayNumOut: { color: colors.textSubtle },
  tally: { flexDirection: 'row', gap: 12, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' },
  tallyItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tallyDot: { width: 10, height: 10, borderRadius: 5 },
  tallyText: { fontSize: 12, fontFamily: font.medium, color: colors.textSecondary, fontWeight: '500' },
})

// ─── main form screen ─────────────────────────────────────────────────────────

export default function NewScheduleScreen() {
  const router = useRouter()
  const { supersedesId } = useLocalSearchParams<{ supersedesId?: string }>()
  const { data, loading: profileLoading } = useSchedules()

  // ── form state ──────────────────────────────────────────────────────────────
  const [name, setName]               = useState('')
  const [pattern, setPattern]         = useState<UIPattern | null>(null)
  const [showPatternPicker, setShowPatternPicker] = useState(false)
  const [startDate, setStartDate]     = useState<Date | null>(null)
  const [endDate, setEndDate]         = useState<Date | null>(null)
  const [firstOwnerId, setFirstOwnerId] = useState<string | null>(null)
  const [ownerSequence, setOwnerSequence] = useState<string[]>([])
  const [cycleLen, setCycleLen]       = useState(14)
  const [specificDays, setSpecificDays] = useState<Record<string, string>>({})
  const [note, setNote]               = useState('')
  const [saving, setSaving]           = useState(false)

  const myProfile    = data?.myProfile
  const coProfile    = data?.coParentProfile
  const connectionId = data?.connectionId

  const ownerA = useMemo(() => myProfile
    ? { id: myProfile.id, color: myProfile.color, initials: myProfile.initials }
    : null, [myProfile])
  const ownerB = useMemo(() => coProfile
    ? { id: coProfile.id, color: coProfile.color, initials: coProfile.initials }
    : null, [coProfile])

  const handlePatternSelect = useCallback((p: UIPattern) => {
    setPattern(p)
    if (p === 'custom_cycle' && firstOwnerId && ownerA && ownerB) {
      const other = firstOwnerId === ownerA.id ? ownerB.id : ownerA.id
      const seq = Array(14).fill(null).map((_, i) => (i < 7 ? firstOwnerId : other))
      setOwnerSequence(seq)
      setCycleLen(14)
    }
  }, [firstOwnerId, ownerA, ownerB])

  const handleFirstOwner = useCallback((id: string) => {
    setFirstOwnerId(id)
    if (pattern === 'custom_cycle' && ownerA && ownerB) {
      const other = id === ownerA.id ? ownerB.id : ownerA.id
      const seq = Array(14).fill(null).map((_, i) => (i < 7 ? id : other))
      setOwnerSequence(seq)
      setCycleLen(14)
    }
  }, [pattern, ownerA, ownerB])

  function validate(): string | null {
    if (!name.trim())  return 'Schedule name is required'
    if (!pattern)      return 'Select a pattern'
    if (!startDate)    return 'Select a start date'
    if (!endDate)      return 'Select an end date'
    if (startDate >= endDate) return 'End date must be after start date'
    if (!firstOwnerId) return 'Select who goes first'
    if (pattern === 'custom_cycle' && ownerSequence.length === 0)
      return 'Add at least one day to the cycle'
    return null
  }

  async function submit(andPropose: boolean) {
    const err = validate()
    if (err) { Alert.alert('Check form', err); return }

    const isCustomCycle    = pattern === 'custom_cycle'
    const isCustomSpecific = pattern === 'custom_specific'
    const apiPattern       = isCustomCycle || isCustomSpecific ? 'custom' : pattern!

    const patternData = isCustomSpecific
      ? { first_week_owner_id: firstOwnerId!, specific_days: specificDays }
      : isCustomCycle
        ? { first_week_owner_id: firstOwnerId!, owner_sequence: ownerSequence, cycle_length: cycleLen }
        : { first_week_owner_id: firstOwnerId! }

    setSaving(true)
    const { data: created, error: createErr } = await createSchedule({
      name: name.trim(),
      pattern: apiPattern as SchedulePattern,
      start_date: toYMD(startDate!),
      end_date:   toYMD(endDate!),
      pattern_data: patternData,
      note: note.trim() || null,
      supersedes_id: supersedesId ?? null,
    })

    if (createErr || !created) {
      setSaving(false)
      Alert.alert('Error', createErr ?? 'Could not create schedule')
      return
    }

    if (andPropose) {
      const { error: proposeErr } = await scheduleAction(created.id, { action: 'propose' })
      setSaving(false)
      if (proposeErr) {
        Alert.alert('Saved as draft', `Schedule saved but proposal failed: ${proposeErr}`)
      } else {
        Alert.alert('Proposed!', `${coProfile?.display_name ?? 'Co-parent'} has been notified.`, [
          { text: 'OK', onPress: () => router.back() },
        ])
        return
      }
    } else {
      setSaving(false)
    }

    router.back()
  }

  const showCustomEditor = pattern === 'custom_cycle' || pattern === 'custom_specific'
  const startMin = new Date()
  const endMin   = startDate ?? new Date()

  if (profileLoading || !myProfile) {
    return (
      <SafeAreaView style={s.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </SafeAreaView>
    )
  }

  if (!coProfile) {
    return (
      <SafeAreaView style={s.centered}>
        <Text style={s.errText}>No co-parent connected</Text>
        <TouchableOpacity onPress={() => router.back()} style={s.backLink}>
          <Text style={s.backLinkText}>Go back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.cancelBtn} hitSlop={12}>
          <Text style={s.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={s.title}>
          {supersedesId ? 'Propose Replacement' : 'New Schedule'}
        </Text>
        <View style={{ width: 64 }} />
      </View>

      <ScrollView
        contentContainerStyle={s.form}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Name ── */}
        <Text style={s.label}>Schedule name</Text>
        <TextInput
          style={s.input}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Summer 2026"
          placeholderTextColor={colors.textSubtle}
          maxLength={80}
        />

        {/* ── Pattern ── */}
        <Text style={s.label}>Pattern</Text>
        <TouchableOpacity style={s.patternSelect} onPress={() => setShowPatternPicker(true)}>
          {pattern ? (
            <View style={s.patternSelectFilled}>
              <Text style={s.patternSelectValue}>
                {PATTERN_OPTIONS.find(o => o.key === pattern)?.label}
              </Text>
              <Text style={s.patternSelectSub}>
                {PATTERN_OPTIONS.find(o => o.key === pattern)?.sub}
              </Text>
            </View>
          ) : (
            <Text style={s.patternSelectPlaceholder}>Select a pattern…</Text>
          )}
          <Text style={s.patternSelectChevron}>›</Text>
        </TouchableOpacity>

        {/* Pattern picker sheet */}
        <Modal visible={showPatternPicker} transparent animationType="slide" onRequestClose={() => setShowPatternPicker(false)}>
          <TouchableOpacity style={s.pickerBackdrop} activeOpacity={1} onPress={() => setShowPatternPicker(false)}>
            <View style={s.pickerSheet}>
              <View style={s.pickerHeader}>
                <Text style={s.pickerTitle}>Schedule pattern</Text>
                <TouchableOpacity onPress={() => setShowPatternPicker(false)} hitSlop={12}>
                  <Text style={s.pickerDone}>Done</Text>
                </TouchableOpacity>
              </View>
              {PATTERN_OPTIONS.map((opt, idx) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[s.pickerRow, idx === PATTERN_OPTIONS.length - 1 && s.pickerRowLast]}
                  onPress={() => { handlePatternSelect(opt.key); setShowPatternPicker(false) }}
                >
                  <View style={s.pickerRowContent}>
                    <Text style={s.pickerRowLabel}>{opt.label}</Text>
                    <Text style={s.pickerRowSub}>{opt.sub}</Text>
                  </View>
                  {pattern === opt.key && (
                    <Text style={s.pickerCheck}>✓</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </Modal>

        {/* ── Date range ── */}
        {pattern && (
          <>
            <Text style={s.sectionTitle}>Date range</Text>
            <View style={s.dateRow}>
              <View style={s.dateField}>
                <DateField
                  label="Start"
                  value={startDate}
                  min={startMin}
                  onChange={d => {
                    setStartDate(d)
                    if (endDate && d >= endDate) setEndDate(null)
                  }}
                />
              </View>
              <View style={s.dateField}>
                <DateField
                  label="End"
                  value={endDate}
                  min={endMin}
                  onChange={setEndDate}
                />
              </View>
            </View>
          </>
        )}

        {/* ── Who goes first ── */}
        {pattern && startDate && endDate && (
          <>
            <Text style={s.sectionTitle}>
              {pattern === 'custom_specific' ? 'First assignment owner' : 'Who goes first'}
            </Text>
            <View style={s.ownerRow}>
              {[myProfile, coProfile].map(p => (
                <TouchableOpacity
                  key={p.id}
                  style={[
                    s.ownerCard,
                    firstOwnerId === p.id && { borderColor: p.color, borderWidth: 2 },
                  ]}
                  onPress={() => handleFirstOwner(p.id)}
                >
                  <View style={[s.ownerAvatar, { backgroundColor: p.color }]}>
                    <Text style={s.ownerInitials}>{p.initials}</Text>
                  </View>
                  <Text style={s.ownerName} numberOfLines={1}>
                    {p.id === myProfile.id ? 'Me' : p.display_name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* ── Custom editors ── */}
        {showCustomEditor && firstOwnerId && startDate && endDate && ownerA && ownerB && (
          <>
            <Text style={s.sectionTitle}>
              {pattern === 'custom_cycle' ? 'Day cycle' : 'Day assignments'}
            </Text>
            {pattern === 'custom_cycle' ? (
              <CustomCycleEditor
                sequence={ownerSequence}
                onSequenceChange={setOwnerSequence}
                cycleLen={cycleLen}
                onCycleLenChange={setCycleLen}
                ownerA={firstOwnerId === ownerA.id ? ownerA : ownerB}
                ownerB={firstOwnerId === ownerA.id ? ownerB : ownerA}
              />
            ) : (
              <CustomSpecificEditor
                specificDays={specificDays}
                onChange={setSpecificDays}
                startDate={startDate}
                endDate={endDate}
                ownerA={firstOwnerId === ownerA.id ? ownerA : ownerB}
                ownerB={firstOwnerId === ownerA.id ? ownerB : ownerA}
              />
            )}
          </>
        )}

        {/* ── Note ── */}
        {pattern && startDate && endDate && firstOwnerId && (
          <>
            <Text style={s.sectionTitle}>Note <Text style={s.optional}>(optional)</Text></Text>
            <TextInput
              style={[s.input, s.noteInput]}
              value={note}
              onChangeText={setNote}
              placeholder="Message to co-parent about this proposal…"
              placeholderTextColor={colors.textSubtle}
              multiline
              maxLength={500}
            />
          </>
        )}

        {/* ── Footer actions ── */}
        {pattern && startDate && endDate && firstOwnerId && (
          <View style={s.footer}>
            {saving ? (
              <ActivityIndicator size="large" color={colors.accent} style={{ marginVertical: 16 }} />
            ) : (
              <>
                <TouchableOpacity style={[s.btn, s.btnPrimary]} onPress={() => submit(true)}>
                  <Text style={s.btnPrimaryText}>Propose to {coProfile.display_name}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.btn, s.btnGhost]} onPress={() => submit(false)}>
                  <Text style={s.btnGhostText}>Save as draft</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

// ─── styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  errText:   { fontSize: 16, fontWeight: '600', fontFamily: font.semibold, color: colors.textPrimary, marginBottom: 12 },
  backLink:  { paddingHorizontal: 20, paddingVertical: 10 },
  backLinkText: { color: colors.accent, fontSize: 15, fontFamily: font.regular },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.borderHair,
  },
  cancelBtn: { width: 64 },
  cancelText: { fontSize: 16, fontFamily: font.regular, color: colors.textMuted },
  title: { fontSize: 17, fontWeight: '600', fontFamily: font.semibold, color: colors.textPrimary },

  form: { paddingHorizontal: 20, paddingTop: 20 },
  label: { fontSize: 13, fontWeight: '600', fontFamily: font.semibold, color: colors.textSecondary, marginBottom: 6, marginTop: 16 },
  sectionTitle: { fontSize: 15, fontWeight: '700', fontFamily: font.bold, color: colors.textPrimary, marginTop: 24, marginBottom: 10 },
  optional: { fontWeight: '400', fontFamily: font.regular, color: colors.textSubtle },

  input: {
    backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, fontFamily: font.regular, color: colors.textPrimary,
  },
  noteInput: { minHeight: 80, textAlignVertical: 'top' },

  // Pattern select button
  patternSelect: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 13, marginTop: 4,
  },
  patternSelectFilled: { flex: 1 },
  patternSelectValue: { fontSize: 15, fontFamily: font.medium, fontWeight: '500', color: colors.textPrimary },
  patternSelectSub: { fontSize: 12, fontFamily: font.regular, color: colors.textMuted, marginTop: 1 },
  patternSelectPlaceholder: { flex: 1, fontSize: 15, fontFamily: font.regular, color: colors.textSubtle },
  patternSelectChevron: { fontSize: 20, color: colors.textSubtle, marginLeft: 8 },

  // Pattern picker sheet
  pickerBackdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.25)' },
  pickerSheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    paddingBottom: 32,
  },
  pickerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: colors.borderHair,
  },
  pickerTitle: { fontSize: 16, fontWeight: '600', fontFamily: font.semibold, color: colors.textPrimary },
  pickerDone: { fontSize: 16, fontFamily: font.semibold, fontWeight: '600', color: colors.accent },
  pickerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: colors.borderHair,
  },
  pickerRowLast: { borderBottomWidth: 0 },
  pickerRowContent: { flex: 1 },
  pickerRowLabel: { fontSize: 15, fontFamily: font.medium, fontWeight: '500', color: colors.textPrimary },
  pickerRowSub: { fontSize: 12, fontFamily: font.regular, color: colors.textMuted, marginTop: 1 },
  pickerCheck: { fontSize: 17, color: colors.accent, fontWeight: '700', marginLeft: 12 },

  // Date range
  dateRow: { flexDirection: 'row', gap: 10 },
  dateField: { flex: 1 },

  // Owner selector
  ownerRow: { flexDirection: 'row', gap: 12 },
  ownerCard: {
    flex: 1, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.surface2, alignItems: 'center', paddingVertical: 16, gap: 8,
  },
  ownerAvatar: {
    width: 48, height: 48, borderRadius: radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  ownerInitials: { fontSize: 17, fontWeight: '700', fontFamily: font.bold, color: colors.white },
  ownerName: { fontSize: 13, fontWeight: '500', fontFamily: font.medium, color: colors.textSecondary },

  // Footer
  footer: { marginTop: 28, gap: 10 },
  btn: { borderRadius: radius.md, paddingVertical: 15, alignItems: 'center' },
  btnPrimary: { backgroundColor: colors.accent },
  btnPrimaryText: { color: colors.white, fontWeight: '700', fontFamily: font.bold, fontSize: 15, lineHeight: 15 },
  btnGhost: { backgroundColor: colors.surface2 },
  btnGhostText: { color: colors.textSecondary, fontWeight: '600', fontFamily: font.semibold, fontSize: 15, lineHeight: 15 },
})
