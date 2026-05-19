import { View, Text, StyleSheet, ScrollView } from 'react-native'
import { font, radius } from '@/lib/theme'
import { useProPortal, ProChild } from '@/lib/context/ProPortalContext'

const NAVY2 = '#1A2B47'
const AMBER = '#F59E0B'
const WHITE = '#FFFFFF'

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatDOB(iso: string | null) {
  if (!iso) return 'Unknown'
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function childAge(dob: string | null) {
  if (!dob) return null
  const d = new Date(dob + 'T12:00:00')
  const age = Math.floor((Date.now() - d.getTime()) / (365.25 * 86_400_000))
  return age
}

// ─── child card ───────────────────────────────────────────────────────────────

function ChildCard({ child }: { child: ProChild }) {
  const allergies  = child.allergies  ?? []
  const meds       = child.medications ?? []

  return (
    <View style={styles.card}>
      {/* Name + DOB */}
      <Text style={styles.name}>{[child.first_name, child.last_name].filter(Boolean).join(' ')}</Text>
      <Text style={styles.dob}>
        DOB: {formatDOB(child.date_of_birth)}
        {childAge(child.date_of_birth) != null ? ` · Age ${childAge(child.date_of_birth)}` : ''}
      </Text>

      <View style={styles.divider} />

      {/* Education */}
      {(child.school_name || child.grade) && (
        <DataRow
          label="School"
          value={[child.school_name, child.grade ? `Grade ${child.grade}` : null].filter(Boolean).join(' · ') || '—'}
        />
      )}

      {/* Physician */}
      <DataRow label="Physician" value={child.pediatrician_name ?? '—'} />

      {/* Allergies */}
      {allergies.length > 0 && (
        <View style={styles.alertRow}>
          <View style={styles.alertBadge}>
            <Text style={styles.alertBadgeText}>Allergies</Text>
          </View>
          <Text style={styles.alertValue}>{allergies.join(', ')}</Text>
        </View>
      )}

      {/* Medications */}
      {meds.length > 0 && (
        <DataRow label="Medications" value={meds.join(', ')} />
      )}
    </View>
  )
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.dataRow}>
      <Text style={styles.dataLabel}>{label}</Text>
      <Text style={styles.dataValue}>{value}</Text>
    </View>
  )
}

// ─── main tab ─────────────────────────────────────────────────────────────────

export default function ChildrenTab() {
  const { data } = useProPortal()
  if (!data) return null

  if (data.children.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No children on record.</Text>
      </View>
    )
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      {data.children.map(child => (
        <ChildCard key={child.id} child={child} />
      ))}
    </ScrollView>
  )
}

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll:         { padding: 16, paddingBottom: 40 },
  empty:          { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText:      { fontSize: 14, fontFamily: font.regular, color: 'rgba(255,255,255,0.50)', textAlign: 'center' },

  card:           { backgroundColor: NAVY2, borderRadius: radius.lg, padding: 16, marginBottom: 14 },
  name:           { fontSize: 18, fontFamily: font.bold, color: WHITE, marginBottom: 2 },
  dob:            { fontSize: 12, fontFamily: font.regular, color: 'rgba(255,255,255,0.55)', marginBottom: 12 },
  divider:        { height: 1, backgroundColor: 'rgba(255,255,255,0.08)', marginBottom: 12 },

  dataRow:        { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, gap: 12 },
  dataLabel:      { fontSize: 12, fontFamily: font.medium, color: 'rgba(255,255,255,0.50)', width: 80 },
  dataValue:      { fontSize: 12, fontFamily: font.regular, color: 'rgba(255,255,255,0.85)', flex: 1, textAlign: 'right' },

  alertRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  alertBadge:     { backgroundColor: 'rgba(245,158,11,0.20)', borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3 },
  alertBadgeText: { fontSize: 11, fontFamily: font.semibold, color: AMBER },
  alertValue:     { fontSize: 12, fontFamily: font.regular, color: 'rgba(255,255,255,0.85)', flex: 1, paddingTop: 2 },
})
