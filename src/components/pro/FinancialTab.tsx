import { View, Text, StyleSheet, FlatList } from 'react-native'
import { font, radius } from '@/lib/theme'
import { useProPortal, ProExpense } from '@/lib/context/ProPortalContext'
import HashBadge from './HashBadge'

const NAVY2 = '#1A2B47'
const AMBER = '#F59E0B'
const WHITE = '#FFFFFF'

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatAmount(n: number) {
  return `$${n.toFixed(2)}`
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  requested: { label: 'Requested', bg: 'rgba(245,158,11,0.20)', text: '#F59E0B' },
  pending:   { label: 'Pending',   bg: 'rgba(245,158,11,0.20)', text: '#F59E0B' },
  approved:  { label: 'Approved',  bg: 'rgba(61,140,106,0.20)', text: '#3D8C6A' },
  paid:      { label: 'Paid',      bg: 'rgba(59,130,246,0.20)', text: '#93C5FD' },
  disputed:  { label: 'Disputed',  bg: 'rgba(192,72,72,0.20)',  text: '#FCA5A5' },
  declined:  { label: 'Declined',  bg: 'rgba(192,72,72,0.20)',  text: '#FCA5A5' },
}

const CATEGORY_LABELS: Record<string, string> = {
  medical:    'Medical',
  education:  'Education',
  activities: 'Activities',
  clothing:   'Clothing',
  other:      'Other',
}

// ─── expense card ─────────────────────────────────────────────────────────────

interface ExpenseCardProps {
  expense: ProExpense
  submitterName: string
  submitterColor: string
}

function ExpenseCard({ expense, submitterName, submitterColor }: ExpenseCardProps) {
  const status = STATUS_CONFIG[expense.status] ?? { label: expense.status, bg: '#374151', text: '#D1D5DB' }
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.description} numberOfLines={2}>{expense.description}</Text>
        <Text style={styles.amount}>{formatAmount(expense.amount)}</Text>
      </View>
      <View style={styles.meta}>
        <View style={[styles.senderDot, { backgroundColor: submitterColor }]} />
        <Text style={styles.metaText}>{submitterName}</Text>
        <Text style={styles.dot}>·</Text>
        <Text style={styles.metaText}>{formatDate(expense.submitted_at)}</Text>
        {expense.category && (
          <>
            <Text style={styles.dot}>·</Text>
            <Text style={styles.metaText}>{CATEGORY_LABELS[expense.category] ?? expense.category}</Text>
          </>
        )}
        {expense.split_percent != null && (
          <>
            <Text style={styles.dot}>·</Text>
            <Text style={styles.metaText}>{expense.split_percent}% split</Text>
          </>
        )}
      </View>
      <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
        <Text style={[styles.statusText, { color: status.text }]}>{status.label}</Text>
      </View>
      <HashBadge hash={expense.sha256_hash} tsaToken={expense.tsa_token} />
    </View>
  )
}

// ─── main tab ─────────────────────────────────────────────────────────────────

export default function FinancialTab() {
  const { data } = useProPortal()
  if (!data) return null

  const getSubmitterName  = (id: string) => id === data.parentAId ? data.parentA.display_name : data.parentB.display_name
  const getSubmitterColor = (id: string) => id === data.parentAId ? data.parentA.color : data.parentB.color

  if (data.expenses.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No expenses in the last 180 days.</Text>
      </View>
    )
  }

  return (
    <FlatList
      data={data.expenses}
      keyExtractor={e => e.id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <ExpenseCard
          expense={item}
          submitterName={getSubmitterName(item.submitted_by_id)}
          submitterColor={getSubmitterColor(item.submitted_by_id)}
        />
      )}
    />
  )
}

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  list:         { padding: 16, paddingBottom: 32 },
  empty:        { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText:    { fontSize: 14, fontFamily: font.regular, color: 'rgba(255,255,255,0.50)', textAlign: 'center' },

  card:         { backgroundColor: NAVY2, borderRadius: radius.md, padding: 14, marginBottom: 10 },
  cardHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 8 },
  description:  { fontSize: 14, fontFamily: font.semibold, color: WHITE, flex: 1 },
  amount:       { fontSize: 16, fontFamily: font.bold, color: WHITE },
  meta:         { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginBottom: 10 },
  senderDot:    { width: 7, height: 7, borderRadius: 4 },
  metaText:     { fontSize: 11, fontFamily: font.regular, color: 'rgba(255,255,255,0.55)' },
  dot:          { fontSize: 11, color: 'rgba(255,255,255,0.25)' },
  statusBadge:  { borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3, alignSelf: 'flex-start', marginBottom: 2 },
  statusText:   { fontSize: 11, fontFamily: font.semibold },
})
