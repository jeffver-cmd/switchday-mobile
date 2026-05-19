import { View, Text, StyleSheet, SectionList } from 'react-native'
import { font, radius } from '@/lib/theme'
import { useProPortal, ProScheduleRow } from '@/lib/context/ProPortalContext'

const NAVY2 = '#1A2B47'
const AMBER = '#F59E0B'
const WHITE = '#FFFFFF'

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatDayRow(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

function monthLabel(iso: string) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function groupByMonth(rows: ProScheduleRow[]) {
  const sections: { title: string; data: ProScheduleRow[] }[] = []
  let current: { title: string; data: ProScheduleRow[] } | null = null
  for (const row of rows) {
    const label = monthLabel(row.date)
    if (!current || current.title !== label) {
      current = { title: label, data: [] }
      sections.push(current)
    }
    current.data.push(row)
  }
  return sections
}

// ─── day row ─────────────────────────────────────────────────────────────────

interface DayRowProps {
  row: ProScheduleRow
  ownerName: string
  ownerColor: string
}

function DayRow({ row, ownerName, ownerColor }: DayRowProps) {
  return (
    <View style={[styles.dayRow, row.is_switch && styles.switchRow]}>
      <Text style={styles.dateText}>{formatDayRow(row.date)}</Text>
      {row.is_switch && (
        <View style={styles.switchBadge}>
          <Text style={styles.switchText}>↔ Switch</Text>
        </View>
      )}
      <View style={styles.ownerPill}>
        <View style={[styles.ownerDot, { backgroundColor: ownerColor }]} />
        <Text style={styles.ownerName}>{ownerName}</Text>
      </View>
    </View>
  )
}

// ─── main tab ─────────────────────────────────────────────────────────────────

export default function ScheduleTab() {
  const { data } = useProPortal()
  if (!data) return null

  const getOwnerName  = (id: string) => id === data.parentAId ? data.parentA.display_name : data.parentB.display_name
  const getOwnerColor = (id: string) => id === data.parentAId ? data.parentA.color : data.parentB.color

  if (data.schedule.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No custody schedule on record.</Text>
      </View>
    )
  }

  const sections = groupByMonth(data.schedule)

  return (
    <SectionList
      sections={sections}
      keyExtractor={r => r.id}
      contentContainerStyle={styles.list}
      stickySectionHeadersEnabled
      renderSectionHeader={({ section }) => (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
        </View>
      )}
      renderItem={({ item }) => (
        <DayRow
          row={item}
          ownerName={getOwnerName(item.owner_id)}
          ownerColor={getOwnerColor(item.owner_id)}
        />
      )}
    />
  )
}

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  list:          { paddingBottom: 32 },
  empty:         { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText:     { fontSize: 14, fontFamily: font.regular, color: 'rgba(255,255,255,0.50)', textAlign: 'center' },

  sectionHeader: { backgroundColor: '#0A1525', paddingHorizontal: 16, paddingVertical: 8 },
  sectionTitle:  { fontSize: 12, fontFamily: font.semibold, color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase', letterSpacing: 0.8 },

  dayRow:        { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', gap: 8, backgroundColor: '#0F1B35' },
  switchRow:     { backgroundColor: 'rgba(245,158,11,0.08)' },
  dateText:      { fontSize: 13, fontFamily: font.medium, color: 'rgba(255,255,255,0.85)', flex: 1 },
  switchBadge:   { backgroundColor: 'rgba(245,158,11,0.20)', borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3 },
  switchText:    { fontSize: 11, fontFamily: font.semibold, color: AMBER },
  ownerPill:     { flexDirection: 'row', alignItems: 'center', gap: 5 },
  ownerDot:      { width: 7, height: 7, borderRadius: 4 },
  ownerName:     { fontSize: 12, fontFamily: font.medium, color: 'rgba(255,255,255,0.70)' },
})
