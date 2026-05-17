import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useState, useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { colors, radius, shadow, font } from '@/lib/theme'

// ─── types ───────────────────────────────────────────────────────────────────

type ExpenseStatus = 'requested' | 'pending' | 'approved' | 'paid' | 'disputed' | 'declined'

interface Expense {
  id: string
  description: string
  amount: number
  category: string
  splitPercent: number
  status: ExpenseStatus
  submittedAt: string
  submittedById: string | null
}

type FilterTab = 'all' | 'approved' | 'paid'
const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all',      label: 'All' },
  { key: 'approved', label: 'Approved' },
  { key: 'paid',     label: 'Paid' },
]

// ─── constants ───────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<ExpenseStatus, string> = {
  requested: colors.warning,
  pending:   colors.info,
  approved:  colors.success,
  paid:      colors.textMuted as string,
  disputed:  colors.danger,
  declined:  colors.textSubtle as string,
}
const STATUS_LABELS: Record<ExpenseStatus, string> = {
  requested: 'Requested', pending: 'Pending', approved: 'Approved',
  paid: 'Paid', disputed: 'Disputed', declined: 'Declined',
}

// ─── hook ────────────────────────────────────────────────────────────────────

function usePortalExpenses() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError('not_signed_in'); setLoading(false); return }
      const userId = session.user.id

      const { data: childRow } = await supabase
        .from('children').select('connection_id')
        .eq('auth_user_id', userId).maybeSingle()

      if (!childRow?.connection_id) { setError('no_child_record'); setLoading(false); return }

      const { data: rows, error: err } = await supabase
        .from('expenses')
        .select('id, description, amount, category, split_percent, status, submitted_at, submitted_by_id')
        .eq('connection_id', childRow.connection_id)
        .order('submitted_at', { ascending: false })
        .limit(100)

      if (err) { setError(err.message); setLoading(false); return }

      setExpenses((rows ?? []).map(r => ({
        id:           r.id,
        description:  r.description,
        amount:       r.amount,
        category:     r.category,
        splitPercent: r.split_percent,
        status:       r.status as ExpenseStatus,
        submittedAt:  r.submitted_at,
        submittedById: r.submitted_by_id,
      })))
    } catch { setError('load_failed') }
    finally   { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])
  return { expenses, loading, error, refresh: load }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── screen ──────────────────────────────────────────────────────────────────

export default function PortalExpensesScreen() {
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const { expenses, loading, error, refresh } = usePortalExpenses()

  const filtered = expenses.filter(e => {
    if (activeTab === 'all')      return true
    if (activeTab === 'approved') return e.status === 'approved'
    if (activeTab === 'paid')     return e.status === 'paid'
    return true
  })

  if (loading) {
    return (
      <SafeAreaView style={S.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </SafeAreaView>
    )
  }

  if (error) {
    return (
      <SafeAreaView style={S.centered}>
        <Text style={S.errorText}>Could not load expenses</Text>
        <TouchableOpacity onPress={refresh} style={S.retryBtn}>
          <Text style={S.retryText}>Try again</Text>
        </TouchableOpacity>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={S.container}>
      <View style={S.headerRow}>
        <Text style={S.headerTitle}>Expenses</Text>
      </View>

      {/* Filter tabs */}
      <View style={S.filterRow}>
        {FILTER_TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[S.filterTab, activeTab === tab.key && S.filterTabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[S.filterTabText, activeTab === tab.key && S.filterTabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {filtered.length === 0 ? (
        <View style={S.emptyBox}>
          <Text style={S.emptyTitle}>No expenses</Text>
          <Text style={S.emptySubtitle}>Shared expenses will appear here.</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={e => e.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.accent} />}
          contentContainerStyle={S.list}
          renderItem={({ item: exp }) => (
            <View style={S.card}>
              <View style={S.cardTop}>
                <View style={S.cardLeft}>
                  <Text style={S.description} numberOfLines={2}>{exp.description}</Text>
                  <Text style={S.meta}>{formatDate(exp.submittedAt)} · {exp.category}</Text>
                </View>
                <View style={S.cardRight}>
                  <Text style={S.amount}>${exp.amount.toFixed(2)}</Text>
                  <View style={[S.statusBadge, { backgroundColor: STATUS_COLORS[exp.status] + '20' }]}>
                    <Text style={[S.statusText, { color: STATUS_COLORS[exp.status] }]}>
                      {STATUS_LABELS[exp.status]}
                    </Text>
                  </View>
                </View>
              </View>
              <Text style={S.split}>Split: {exp.splitPercent}% / {100 - exp.splitPercent}%</Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  )
}

// ─── styles ──────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, paddingHorizontal: 24 },
  errorText: { fontSize: 14, fontFamily: font.regular, color: colors.danger, textAlign: 'center', marginBottom: 12 },
  retryBtn:  { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: colors.accent, borderRadius: radius.md },
  retryText: { color: colors.white, fontWeight: '600', fontFamily: font.semibold, fontSize: 14 },

  headerRow:  { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  headerTitle:{ fontSize: 22, fontWeight: '700', fontFamily: font.bold, color: colors.textPrimary },

  filterRow: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  filterTab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.full, backgroundColor: colors.surface2 },
  filterTabActive: { backgroundColor: colors.accent },
  filterTabText:   { fontSize: 13, fontWeight: '500', fontFamily: font.medium, color: colors.textMuted },
  filterTabTextActive: { color: colors.white },

  emptyBox:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyTitle:{ fontSize: 16, fontWeight: '600', fontFamily: font.semibold, color: colors.textPrimary, marginBottom: 8 },
  emptySubtitle: { fontSize: 13, fontFamily: font.regular, color: colors.textSubtle, textAlign: 'center' },

  list: { paddingHorizontal: 16, paddingBottom: 32 },
  card: { backgroundColor: colors.surface, borderRadius: radius.md, padding: 16, marginBottom: 10, ...shadow.sm },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 },
  cardLeft:{ flex: 1, marginRight: 12 },
  cardRight: { alignItems: 'flex-end', gap: 6 },
  description: { fontSize: 15, fontWeight: '600', fontFamily: font.semibold, color: colors.textPrimary, marginBottom: 3 },
  meta: { fontSize: 12, fontFamily: font.regular, color: colors.textSubtle },
  amount: { fontSize: 18, fontWeight: '700', fontFamily: font.bold, color: colors.textPrimary },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  statusText:  { fontSize: 11, fontWeight: '700', fontFamily: font.bold },
  split: { fontSize: 12, fontFamily: font.regular, color: colors.textSubtle },
})
