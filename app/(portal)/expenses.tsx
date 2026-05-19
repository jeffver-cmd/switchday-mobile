import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useState, useCallback, useEffect } from 'react'
import * as Crypto from 'expo-crypto'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { colors, radius, shadow, font } from '@/lib/theme'
import { usePortal } from '@/lib/context/PortalContext'
import type { ExpenseCategory } from '@/lib/types/database'

// ─── constants ───────────────────────────────────────────────────────────────

const CATEGORIES: { value: ExpenseCategory; label: string; emoji: string }[] = [
  { value: 'medical',    label: 'Medical',    emoji: '🏥' },
  { value: 'education',  label: 'Education',  emoji: '📚' },
  { value: 'activities', label: 'Activities', emoji: '⚽' },
  { value: 'clothing',   label: 'Clothing',   emoji: '👕' },
  { value: 'other',      label: 'Other',      emoji: '📎' },
]

// ─── types ───────────────────────────────────────────────────────────────────

type ExpenseStatus = 'requested' | 'pending' | 'approved' | 'paid' | 'disputed' | 'declined'

interface Expense {
  id:              string
  description:     string
  amount:          number
  category:        string
  splitPercent:    number
  status:          ExpenseStatus
  submittedAt:     string
  submittedByChildId: string | null
  requestedSplitNote: string | null
}

type FilterTab = 'all' | 'mine' | 'paid'
const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all',  label: 'All'         },
  { key: 'mine', label: 'My Requests' },
  { key: 'paid', label: 'Paid'        },
]

const STATUS_COLORS: Record<ExpenseStatus, string> = {
  requested: colors.accent,
  pending:   colors.warning,
  approved:  colors.success,
  paid:      colors.textMuted as string,
  disputed:  colors.danger,
  declined:  colors.textSubtle as string,
}
const STATUS_LABELS: Record<ExpenseStatus, string> = {
  requested: 'Requested',
  pending:   'In progress',
  approved:  'Approved',
  paid:      'Paid',
  disputed:  'Disputed',
  declined:  'Declined',
}

// ─── hook ────────────────────────────────────────────────────────────────────

function usePortalExpenses() {
  const [expenses,     setExpenses]     = useState<Expense[]>([])
  const [childRowId,   setChildRowId]   = useState<string | null>(null)
  const [connectionId, setConnectionId] = useState<string | null>(null)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError('not_signed_in'); setLoading(false); return }

      const { data: childRow } = await supabase
        .from('children')
        .select('id, connection_id')
        .eq('auth_user_id', session.user.id)
        .maybeSingle()

      if (!childRow?.connection_id) { setError('no_child_record'); setLoading(false); return }

      setChildRowId(childRow.id)
      setConnectionId(childRow.connection_id)

      const { data: rows, error: err } = await supabase
        .from('expenses')
        .select('id, description, amount, category, split_percent, status, submitted_at, submitted_by_child_id, requested_split_note')
        .eq('connection_id', childRow.connection_id)
        .order('submitted_at', { ascending: false })
        .limit(100)

      if (err) { setError(err.message); setLoading(false); return }

      setExpenses((rows ?? []).map(r => ({
        id:                 r.id,
        description:        r.description,
        amount:             r.amount,
        category:           r.category,
        splitPercent:       r.split_percent,
        status:             r.status as ExpenseStatus,
        submittedAt:        r.submitted_at,
        submittedByChildId: r.submitted_by_child_id,
        requestedSplitNote: r.requested_split_note,
      })))
    } catch { setError('load_failed') }
    finally  { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])
  return { expenses, childRowId, connectionId, loading, error, refresh: load }
}

// ─── submit expense ──────────────────────────────────────────────────────────

async function requestExpense(params: {
  childRowId:   string
  connectionId: string
  description:  string
  amount:       number
  category:     ExpenseCategory
  note:         string
}): Promise<{ error: string | null }> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'not_signed_in' }

  const { childRowId, connectionId, description, amount, category, note } = params

  // Row integrity hash — matches web createChildExpenseRequest pattern
  const sha256_hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${connectionId}|${session.user.id}|${description.trim()}|${amount}|${new Date().toISOString()}`,
  )

  const { data: expense, error: insertError } = await supabase
    .from('expenses')
    .insert({
      connection_id:         connectionId,
      submitted_by_id:       null,
      submitted_by_child_id: childRowId,
      description:           description.trim(),
      amount,
      category,
      split_percent:         50,   // placeholder — parent sets real split on approval
      status:                'requested' as ExpenseStatus,
      requested_split_note:  note.trim() || null,
      sha256_hash,
    })
    .select()
    .single()

  if (insertError || !expense) return { error: insertError?.message ?? 'Failed to submit request' }

  // Audit log (fire-and-forget)
  const metadata   = { expense, submitted_by_child: true }
  const auditPayload = { actor_id: session.user.id, action: 'expense.created', resource_id: expense.id, metadata }
  const auditHash  = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    JSON.stringify(auditPayload),
  )
  supabase.from('audit_log').insert({
    actor_id:      session.user.id,
    action:        'expense.created',
    resource_type: 'expenses',
    resource_id:   expense.id,
    metadata,
    sha256_hash:   auditHash,
  }).then(() => {})

  return { error: null }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── log expense modal ────────────────────────────────────────────────────────

function LogExpenseModal({
  visible,
  onClose,
  onSubmitted,
  theme,
  childRowId,
  connectionId,
}: {
  visible:      boolean
  onClose:      () => void
  onSubmitted:  () => void
  theme:        ReturnType<typeof usePortal>['theme']
  childRowId:   string
  connectionId: string
}) {
  const [description, setDescription] = useState('')
  const [amount,      setAmount]      = useState('')
  const [category,    setCategory]    = useState<ExpenseCategory>('other')
  const [note,        setNote]        = useState('')
  const [submitting,  setSubmitting]  = useState(false)

  function reset() {
    setDescription(''); setAmount(''); setCategory('other'); setNote('')
  }

  async function handleSubmit() {
    const trimDesc = description.trim()
    const parsedAmount = parseFloat(amount)
    if (!trimDesc)              return Alert.alert('Missing info', 'Please enter a description.')
    if (!amount || parsedAmount <= 0) return Alert.alert('Missing info', 'Please enter a valid amount.')

    setSubmitting(true)
    const { error } = await requestExpense({
      childRowId, connectionId,
      description: trimDesc,
      amount: parsedAmount,
      category, note,
    })
    setSubmitting(false)

    if (error) {
      Alert.alert('Error', error)
    } else {
      reset()
      onSubmitted()
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[M.root, { backgroundColor: theme.bg }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Header */}
        <View style={[M.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={() => { reset(); onClose() }} hitSlop={12} activeOpacity={0.7}>
            <Text style={[M.cancelText, { color: theme.textMuted }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={[M.headerTitle, { color: theme.textPrimary }]}>Request Expense</Text>
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={submitting}
            hitSlop={12}
            activeOpacity={0.7}
          >
            <Text style={[M.submitText, { color: submitting ? theme.textMuted : theme.accent }]}>
              {submitting ? 'Sending…' : 'Send'}
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={M.scroll} keyboardShouldPersistTaps="handled">

          {/* Description */}
          <Text style={[M.label, { color: theme.textMuted }]}>WHAT IS IT FOR?</Text>
          <TextInput
            style={[M.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.textPrimary }]}
            value={description}
            onChangeText={setDescription}
            placeholder="Soccer cleats — size 8"
            placeholderTextColor={theme.textSubtle}
            maxLength={200}
            returnKeyType="next"
          />

          {/* Amount */}
          <Text style={[M.label, { color: theme.textMuted }]}>AMOUNT ($)</Text>
          <TextInput
            style={[M.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.textPrimary }]}
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            placeholderTextColor={theme.textSubtle}
            keyboardType="decimal-pad"
            returnKeyType="next"
          />

          {/* Category */}
          <Text style={[M.label, { color: theme.textMuted }]}>CATEGORY</Text>
          <View style={M.chipRow}>
            {CATEGORIES.map(cat => {
              const isSelected = category === cat.value
              return (
                <TouchableOpacity
                  key={cat.value}
                  style={[
                    M.chip,
                    { backgroundColor: isSelected ? theme.accent : theme.surface, borderColor: isSelected ? theme.accent : theme.border },
                  ]}
                  onPress={() => setCategory(cat.value)}
                  activeOpacity={0.7}
                >
                  <Text style={M.chipEmoji}>{cat.emoji}</Text>
                  <Text style={[M.chipLabel, { color: isSelected ? '#fff' : theme.textSecondary }]}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>

          {/* Note (optional) */}
          <Text style={[M.label, { color: theme.textMuted }]}>NOTE FOR PARENTS <Text style={{ fontWeight: '400' }}>(optional)</Text></Text>
          <TextInput
            style={[M.input, M.noteInput, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.textPrimary }]}
            value={note}
            onChangeText={setNote}
            placeholder="Coach said we need these before Saturday's game"
            placeholderTextColor={theme.textSubtle}
            multiline
            maxLength={300}
            returnKeyType="default"
          />

          <Text style={[M.hint, { color: theme.textSubtle }]}>
            Your parents will review this and set the split when they approve it.
          </Text>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  )
}

// ─── screen ──────────────────────────────────────────────────────────────────

export default function PortalExpensesScreen() {
  const [activeTab,   setActiveTab]   = useState<FilterTab>('all')
  const [showModal,   setShowModal]   = useState(false)
  const { theme } = usePortal()
  const { expenses, childRowId, connectionId, loading, error, refresh } = usePortalExpenses()

  const filtered = expenses.filter(e => {
    if (activeTab === 'mine') return e.submittedByChildId === childRowId
    if (activeTab === 'paid') return e.status === 'paid'
    return true
  })

  if (loading) {
    return (
      <SafeAreaView style={[S.centered, { backgroundColor: theme.bg }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </SafeAreaView>
    )
  }

  if (error) {
    return (
      <SafeAreaView style={[S.centered, { backgroundColor: theme.bg }]}>
        <Text style={[S.errorText, { color: colors.danger }]}>Could not load expenses</Text>
        <TouchableOpacity onPress={refresh} style={[S.retryBtn, { backgroundColor: theme.accent }]}>
          <Text style={S.retryText}>Try again</Text>
        </TouchableOpacity>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[S.container, { backgroundColor: theme.bg }]}>
      {/* Header */}
      <View style={S.headerRow}>
        <Text style={[S.headerTitle, { color: theme.textPrimary }]}>Expenses</Text>
        {childRowId && connectionId && (
          <TouchableOpacity
            style={[S.addBtn, { backgroundColor: theme.accent }]}
            onPress={() => setShowModal(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={S.addBtnText}>Request</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Filter tabs */}
      <View style={S.filterRow}>
        {FILTER_TABS.map(tab => {
          const isActive = activeTab === tab.key
          return (
            <TouchableOpacity
              key={tab.key}
              style={[S.filterTab, { backgroundColor: isActive ? theme.accent : theme.surface2 }]}
              onPress={() => setActiveTab(tab.key)}
            >
              <Text style={[S.filterTabText, { color: isActive ? '#fff' : theme.textMuted }]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {filtered.length === 0 ? (
        <View style={S.emptyBox}>
          <Text style={[S.emptyTitle, { color: theme.textPrimary }]}>No expenses</Text>
          <Text style={[S.emptySubtitle, { color: theme.textMuted }]}>
            {activeTab === 'mine'
              ? 'Tap "Request" to ask your parents about an expense.'
              : 'Shared expenses will appear here.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={e => e.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={theme.accent} />}
          contentContainerStyle={S.list}
          renderItem={({ item: exp }) => {
            const catInfo = CATEGORIES.find(c => c.value === exp.category)
            return (
              <View style={[S.card, { backgroundColor: theme.surface }]}>
                <View style={S.cardTop}>
                  <View style={S.cardLeft}>
                    <View style={S.descRow}>
                      {catInfo && <Text style={S.catEmoji}>{catInfo.emoji}</Text>}
                      <Text style={[S.description, { color: theme.textPrimary }]} numberOfLines={2}>
                        {exp.description}
                      </Text>
                    </View>
                    {exp.requestedSplitNote ? (
                      <Text style={[S.noteText, { color: theme.textMuted }]} numberOfLines={2}>
                        "{exp.requestedSplitNote}"
                      </Text>
                    ) : null}
                    <Text style={[S.meta, { color: theme.textMuted }]}>{formatDate(exp.submittedAt)}</Text>
                  </View>
                  <View style={S.cardRight}>
                    <Text style={[S.amount, { color: theme.textPrimary }]}>${exp.amount.toFixed(2)}</Text>
                    <View style={[S.statusBadge, { backgroundColor: STATUS_COLORS[exp.status] + '22' }]}>
                      <Text style={[S.statusText, { color: STATUS_COLORS[exp.status] }]}>
                        {STATUS_LABELS[exp.status]}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            )
          }}
        />
      )}

      {/* Log expense modal */}
      {childRowId && connectionId && (
        <LogExpenseModal
          visible={showModal}
          onClose={() => setShowModal(false)}
          onSubmitted={() => { setShowModal(false); refresh() }}
          theme={theme}
          childRowId={childRowId}
          connectionId={connectionId}
        />
      )}
    </SafeAreaView>
  )
}

// ─── screen styles ────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  container:  { flex: 1 },
  centered:   { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  errorText:  { fontSize: 14, fontFamily: font.regular, textAlign: 'center', marginBottom: 12 },
  retryBtn:   { paddingHorizontal: 20, paddingVertical: 10, borderRadius: radius.md },
  retryText:  { color: '#fff', fontWeight: '600', fontFamily: font.semibold, fontSize: 14 },

  headerRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  headerTitle:{ fontSize: 22, fontWeight: '700', fontFamily: font.bold },
  addBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full },
  addBtnText: { color: '#fff', fontSize: 14, fontWeight: '600', fontFamily: font.semibold },

  filterRow:     { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  filterTab:     { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.full },
  filterTabText: { fontSize: 13, fontWeight: '500', fontFamily: font.medium },

  emptyBox:     { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyTitle:   { fontSize: 16, fontWeight: '600', fontFamily: font.semibold, marginBottom: 8 },
  emptySubtitle:{ fontSize: 13, fontFamily: font.regular, textAlign: 'center' },

  list:        { paddingHorizontal: 16, paddingBottom: 32 },
  card:        { borderRadius: radius.md, padding: 16, marginBottom: 10, ...shadow.sm },
  cardTop:     { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  cardLeft:    { flex: 1, marginRight: 12, gap: 4 },
  cardRight:   { alignItems: 'flex-end', gap: 6 },
  descRow:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  catEmoji:    { fontSize: 15 },
  description: { fontSize: 15, fontWeight: '600', fontFamily: font.semibold, flex: 1 },
  noteText:    { fontSize: 12, fontFamily: font.regular, fontStyle: 'italic' },
  meta:        { fontSize: 12, fontFamily: font.regular },
  amount:      { fontSize: 18, fontWeight: '700', fontFamily: font.bold },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  statusText:  { fontSize: 11, fontWeight: '700', fontFamily: font.bold },
})

// ─── modal styles ─────────────────────────────────────────────────────────────

const M = StyleSheet.create({
  root:   { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 16, fontWeight: '700', fontFamily: font.bold },
  cancelText:  { fontSize: 15, fontFamily: font.regular },
  submitText:  { fontSize: 15, fontWeight: '600', fontFamily: font.semibold },

  scroll: { padding: 20 },

  label: {
    fontSize: 11, fontWeight: '700', fontFamily: font.bold,
    letterSpacing: 0.6, marginBottom: 8, marginTop: 20,
  },
  input: {
    borderWidth: 1, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontFamily: font.regular,
  },
  noteInput: { minHeight: 80, textAlignVertical: 'top' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: radius.full, borderWidth: 1,
  },
  chipEmoji: { fontSize: 14 },
  chipLabel: { fontSize: 13, fontWeight: '500', fontFamily: font.medium },

  hint: { fontSize: 12, fontFamily: font.regular, marginTop: 20, textAlign: 'center', lineHeight: 18 },
})
