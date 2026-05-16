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
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useState, useCallback } from 'react'
import {
  useExpenses,
  approveExpense,
  declineExpense,
  logExpense,
  Expense,
  NewExpenseInput,
} from '@/lib/hooks/useExpenses'
import type { ExpenseStatus, ExpenseCategory } from '@/lib/types/database'

// ─── constants ───────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<ExpenseStatus, string> = {
  requested: '#f59e0b',
  pending:   '#3b82f6',
  approved:  '#10b981',
  paid:      '#6b7280',
  disputed:  '#ef4444',
  declined:  '#9ca3af',
}

const STATUS_LABELS: Record<ExpenseStatus, string> = {
  requested: 'Requested',
  pending:   'Pending',
  approved:  'Approved',
  paid:      'Paid',
  disputed:  'Disputed',
  declined:  'Declined',
}

const CATEGORIES: ExpenseCategory[] = ['medical', 'education', 'activities', 'clothing', 'other']
const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  medical:    'Medical',
  education:  'Education',
  activities: 'Activities',
  clothing:   'Clothing',
  other:      'Other',
}

type FilterTab = 'all' | 'pending' | 'approved' | 'paid'
const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all',      label: 'All' },
  { key: 'pending',  label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'paid',     label: 'Paid' },
]

const FILTER_STATUSES: Record<FilterTab, ExpenseStatus[] | undefined> = {
  all:      undefined,
  pending:  ['pending', 'requested'],
  approved: ['approved'],
  paid:     ['paid'],
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// ─── expense row ─────────────────────────────────────────────────────────────

interface ExpenseRowProps {
  item: Expense
  userId: string
  onApprove: (id: string) => void
  onDecline: (id: string) => void
}

function ExpenseRow({ item, userId, onApprove, onDecline }: ExpenseRowProps) {
  const [expanded, setExpanded] = useState(false)
  const isMyExpense = item.submittedById === userId
  const canAct = !isMyExpense && (item.status === 'pending' || item.status === 'requested')
  const shareAmount = (item.amount * item.splitPercent) / 100
  const statusColor = STATUS_COLORS[item.status]

  return (
    <TouchableOpacity
      style={styles.expenseRow}
      onPress={() => setExpanded(e => !e)}
      activeOpacity={0.8}
    >
      {/* Main row */}
      <View style={styles.expenseMain}>
        <View style={styles.expenseLeft}>
          <Text style={styles.expenseDesc} numberOfLines={1}>{item.description}</Text>
          <Text style={styles.expenseMeta}>
            {CATEGORY_LABELS[item.category]} · {formatDate(item.submittedAt)}
          </Text>
          {item.requestedSplitNote ? (
            <Text style={styles.expenseNote} numberOfLines={1}>"{item.requestedSplitNote}"</Text>
          ) : null}
        </View>
        <View style={styles.expenseRight}>
          <Text style={styles.expenseAmount}>${item.amount.toFixed(2)}</Text>
          <Text style={styles.expenseShare}>Your share: ${shareAmount.toFixed(2)}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>
              {STATUS_LABELS[item.status]}
            </Text>
          </View>
        </View>
      </View>

      {/* Expanded actions */}
      {expanded && (
        <View style={styles.expenseActions}>
          <Text style={styles.splitDetail}>{item.splitPercent}% your share · {100 - item.splitPercent}% theirs</Text>
          {canAct && (
            <View style={styles.actionBtns}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.approveBtn]}
                onPress={() => onApprove(item.id)}
              >
                <Text style={styles.approveBtnText}>Approve</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.declineBtn]}
                onPress={() => onDecline(item.id)}
              >
                <Text style={styles.declineBtnText}>Decline</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
    </TouchableOpacity>
  )
}

// ─── log expense modal ───────────────────────────────────────────────────────

interface LogModalProps {
  connectionId: string
  onClose: () => void
  onSaved: () => void
}

function LogExpenseModal({ connectionId, onClose, onSaved }: LogModalProps) {
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState<ExpenseCategory>('other')
  const [split, setSplit] = useState('50')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const handleSave = async () => {
    const amtNum = parseFloat(amount)
    const splitNum = parseInt(split, 10)
    if (!description.trim()) { setErr('Description required'); return }
    if (isNaN(amtNum) || amtNum <= 0) { setErr('Enter a valid amount'); return }
    if (isNaN(splitNum) || splitNum < 0 || splitNum > 100) { setErr('Split must be 0–100'); return }

    setSaving(true)
    setErr(null)
    const input: NewExpenseInput = {
      connectionId,
      description: description.trim(),
      amount: amtNum,
      category,
      splitPercent: splitNum,
    }
    const { error } = await logExpense(input)
    setSaving(false)
    if (error) { setErr(error); return }
    onSaved()
  }

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={modal.container}>
        <View style={modal.header}>
          <TouchableOpacity onPress={onClose} style={modal.closeBtn}>
            <Text style={modal.closeText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={modal.title}>Log Expense</Text>
          <TouchableOpacity onPress={handleSave} style={modal.saveBtn} disabled={saving}>
            {saving
              ? <ActivityIndicator size="small" color="#1f2937" />
              : <Text style={modal.saveText}>Save</Text>
            }
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={modal.flex}>
          <ScrollView contentContainerStyle={modal.form} keyboardShouldPersistTaps="handled">
            {err && <Text style={modal.errText}>{err}</Text>}

            <Text style={modal.label}>Description</Text>
            <TextInput
              style={modal.input}
              value={description}
              onChangeText={setDescription}
              placeholder="e.g. Soccer registration"
              placeholderTextColor="#9ca3af"
            />

            <Text style={modal.label}>Amount ($)</Text>
            <TextInput
              style={modal.input}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              placeholderTextColor="#9ca3af"
              keyboardType="decimal-pad"
            />

            <Text style={modal.label}>Your share (%)</Text>
            <TextInput
              style={modal.input}
              value={split}
              onChangeText={setSplit}
              placeholder="50"
              placeholderTextColor="#9ca3af"
              keyboardType="number-pad"
            />

            <Text style={modal.label}>Category</Text>
            <View style={modal.chipRow}>
              {CATEGORIES.map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[modal.chip, category === cat && modal.chipActive]}
                  onPress={() => setCategory(cat)}
                >
                  <Text style={[modal.chipText, category === cat && modal.chipTextActive]}>
                    {CATEGORY_LABELS[cat]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  )
}

// ─── screen ──────────────────────────────────────────────────────────────────

export default function ExpensesScreen() {
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [showLog, setShowLog] = useState(false)
  const statusFilter = FILTER_STATUSES[activeTab]
  const { data, loading, error, refresh } = useExpenses(statusFilter)

  const handleApprove = useCallback(async (id: string) => {
    const { error: err } = await approveExpense(id)
    if (err) Alert.alert('Error', err)
    else refresh()
  }, [refresh])

  const handleDecline = useCallback(async (id: string) => {
    Alert.alert('Decline expense?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Decline', style: 'destructive',
        onPress: async () => {
          const { error: err } = await declineExpense(id)
          if (err) Alert.alert('Error', err)
          else refresh()
        },
      },
    ])
  }, [refresh])

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.heading}>Expenses</Text>
        <TouchableOpacity
          style={styles.logBtn}
          onPress={() => setShowLog(true)}
          disabled={!data?.connectionId}
        >
          <Text style={styles.logBtnText}>+ Log</Text>
        </TouchableOpacity>
      </View>

      {/* Filter tabs */}
      <View style={styles.tabs}>
        {FILTER_TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#374151" />
        </View>
      ) : error === 'no_connection' ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>No co-parent connected</Text>
          <Text style={styles.emptySubtitle}>Connect with your co-parent to track expenses.</Text>
        </View>
      ) : (
        <FlatList
          data={data?.expenses ?? []}
          keyExtractor={item => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <ExpenseRow
              item={item}
              userId={data?.userId ?? ''}
              onApprove={handleApprove}
              onDecline={handleDecline}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>No expenses</Text>
              <Text style={styles.emptySubtitle}>
                {activeTab === 'all'
                  ? 'Log your first shared expense above.'
                  : `No ${activeTab} expenses.`}
              </Text>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Log modal */}
      {showLog && data?.connectionId && (
        <LogExpenseModal
          connectionId={data.connectionId}
          onClose={() => setShowLog(false)}
          onSaved={() => { setShowLog(false); refresh() }}
        />
      )}
    </SafeAreaView>
  )
}

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12,
    backgroundColor: '#f9fafb',
  },
  heading: { fontSize: 24, fontWeight: '700', color: '#111827' },
  logBtn: {
    backgroundColor: '#1f2937', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  logBtnText: { color: '#ffffff', fontWeight: '600', fontSize: 14 },

  // Tabs
  tabs: {
    flexDirection: 'row', paddingHorizontal: 16, marginBottom: 8, gap: 8,
  },
  tab: {
    flex: 1, paddingVertical: 7, borderRadius: 8,
    backgroundColor: '#ffffff', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1,
  },
  tabActive: { backgroundColor: '#1f2937' },
  tabText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  tabTextActive: { color: '#ffffff' },

  // List
  list: { paddingHorizontal: 16, paddingTop: 4, flexGrow: 1 },
  separator: { height: 8 },

  // Expense row
  expenseRow: {
    backgroundColor: '#ffffff', borderRadius: 14, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 1,
  },
  expenseMain: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  expenseLeft: { flex: 1 },
  expenseDesc: { fontSize: 15, fontWeight: '600', color: '#111827', marginBottom: 3 },
  expenseMeta: { fontSize: 12, color: '#9ca3af' },
  expenseNote: { fontSize: 12, color: '#6b7280', fontStyle: 'italic', marginTop: 3 },
  expenseRight: { alignItems: 'flex-end', gap: 4 },
  expenseAmount: { fontSize: 16, fontWeight: '700', color: '#111827' },
  expenseShare: { fontSize: 11, color: '#6b7280' },
  statusBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },

  // Expanded
  expenseActions: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  splitDetail: { fontSize: 12, color: '#6b7280', marginBottom: 10 },
  actionBtns: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  approveBtn: { backgroundColor: '#ecfdf5' },
  approveBtnText: { fontSize: 14, fontWeight: '600', color: '#10b981' },
  declineBtn: { backgroundColor: '#fef2f2' },
  declineBtnText: { fontSize: 14, fontWeight: '600', color: '#ef4444' },

  // Empty
  emptyBox: { paddingVertical: 60, alignItems: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 8, textAlign: 'center' },
  emptySubtitle: { fontSize: 13, color: '#6b7280', textAlign: 'center' },
})

const modal = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  closeBtn: { width: 64 },
  closeText: { fontSize: 16, color: '#6b7280' },
  title: { fontSize: 17, fontWeight: '600', color: '#111827' },
  saveBtn: { width: 64, alignItems: 'flex-end' },
  saveText: { fontSize: 16, fontWeight: '600', color: '#1f2937' },
  form: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
  errText: {
    color: '#ef4444', fontSize: 13, marginBottom: 12,
    backgroundColor: '#fef2f2', borderRadius: 8, padding: 10,
  },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 16 },
  input: {
    backgroundColor: '#f9fafb', borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb',
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#1f2937',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: {
    borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb',
    paddingHorizontal: 12, paddingVertical: 7,
  },
  chipActive: { backgroundColor: '#1f2937', borderColor: '#1f2937' },
  chipText: { fontSize: 13, fontWeight: '500', color: '#6b7280' },
  chipTextActive: { color: '#ffffff' },
})
