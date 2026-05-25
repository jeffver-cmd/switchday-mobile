import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl, Modal, TextInput, ScrollView, KeyboardAvoidingView, Platform, Alert, ActionSheetIOS,
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
import { colors, radius, shadow, font } from '@/lib/theme'
import { supabase } from '@/lib/supabase'

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
  const [scanning, setScanning] = useState(false)
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null)
  const [scanFeedback, setScanFeedback] = useState<'scanned' | 'failed' | null>(null)
  const [err, setErr] = useState<string | null>(null)

  async function pickAndScan(useCamera: boolean) {
    let ImagePicker: typeof import('expo-image-picker')
    try { ImagePicker = await import('expo-image-picker') } catch { return }

    if (useCamera) {
      const { status } = await ImagePicker.requestCameraPermissionsAsync()
      if (status !== 'granted') { Alert.alert('Permission needed', 'Camera access is required to scan receipts.'); return }
    } else {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== 'granted') { Alert.alert('Permission needed', 'Photo library access is required to scan receipts.'); return }
    }

    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 })

    if (result.canceled || !result.assets[0]) return

    const asset = result.assets[0]
    setScanning(true)
    setScanFeedback(null)
    try {
      // Upload to Supabase Storage (receipts bucket)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const ext = asset.mimeType?.split('/')[1] ?? 'jpg'
      const path = `${connectionId}/${session.user.id}/${Date.now()}.${ext}`
      const fetchRes = await fetch(asset.uri)
      const blob = await fetchRes.blob()

      const { error: uploadErr } = await supabase.storage
        .from('receipts')
        .upload(path, blob, { contentType: asset.mimeType ?? 'image/jpeg', upsert: false })

      if (uploadErr) { setScanFeedback('failed'); return }

      const { data: { publicUrl } } = supabase.storage.from('receipts').getPublicUrl(path)
      setReceiptUrl(publicUrl)

      // Call Edge Function
      const { data: scan, error: fnErr } = await supabase.functions.invoke<{
        amount: number | null; description: string | null; category: string | null; date: string | null
      }>('scan-receipt', { body: { receipt_url: publicUrl } })

      if (fnErr || !scan) { setScanFeedback('failed'); return }

      // Pre-fill only empty fields
      if (scan.amount   && !amount.trim())      setAmount(String(scan.amount))
      if (scan.description && !description.trim()) setDescription(scan.description)
      if (scan.category && ['medical','education','activities','clothing','other'].includes(scan.category)) {
        setCategory(scan.category as ExpenseCategory)
      }

      setScanFeedback(scan.amount || scan.description ? 'scanned' : 'failed')
    } catch {
      setScanFeedback('failed')
    } finally {
      setScanning(false)
    }
  }

  function handleScanReceipt() {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Cancel', 'Take Photo', 'Choose from Library'], cancelButtonIndex: 0 },
        (idx) => { if (idx === 1) pickAndScan(true); else if (idx === 2) pickAndScan(false); },
      )
    } else {
      Alert.alert('Scan Receipt', 'Choose a source', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Camera',  onPress: () => pickAndScan(true)  },
        { text: 'Library', onPress: () => pickAndScan(false) },
      ])
    }
  }

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
      receiptUrl: receiptUrl ?? null,
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
          <TouchableOpacity onPress={handleSave} style={modal.saveBtn} disabled={saving || scanning}>
            {saving
              ? <ActivityIndicator size="small" color={colors.accent} />
              : <Text style={modal.saveText}>Save</Text>
            }
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={modal.flex}>
          <ScrollView contentContainerStyle={modal.form} keyboardShouldPersistTaps="handled">
            {err && <Text style={modal.errText}>{err}</Text>}

            {/* Scan receipt button */}
            <TouchableOpacity
              style={[modal.scanBtn, scanFeedback === 'scanned' && modal.scanBtnSuccess]}
              onPress={handleScanReceipt}
              disabled={scanning}
              activeOpacity={0.75}
            >
              {scanning ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Text style={[modal.scanBtnText, scanFeedback === 'scanned' && modal.scanBtnTextSuccess]}>
                  {scanFeedback === 'scanned' ? '✓ Receipt scanned — review below' : '📷  Scan Receipt'}
                </Text>
              )}
            </TouchableOpacity>

            <Text style={modal.label}>Description</Text>
            <TextInput
              style={modal.input}
              value={description}
              onChangeText={setDescription}
              placeholder="e.g. Soccer registration"
              placeholderTextColor={colors.textSubtle}
            />

            <Text style={modal.label}>Amount ($)</Text>
            <TextInput
              style={modal.input}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              placeholderTextColor={colors.textSubtle}
              keyboardType="decimal-pad"
            />

            <Text style={modal.label}>Your share (%)</Text>
            <TextInput
              style={modal.input}
              value={split}
              onChangeText={setSplit}
              placeholder="50"
              placeholderTextColor={colors.textSubtle}
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
          <ActivityIndicator size="large" color={colors.accent} />
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
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.accent} />}
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
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12,
    backgroundColor: colors.bg,
  },
  heading: { fontSize: 24, fontWeight: '700', fontFamily: font.bold, color: colors.textPrimary },
  logBtn: {
    backgroundColor: colors.accent, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  logBtnText: { color: colors.white, fontWeight: '600', fontFamily: font.semibold, fontSize: 14 },

  // Tabs
  tabs: {
    flexDirection: 'row', paddingHorizontal: 16, marginBottom: 8, gap: 8,
  },
  tab: {
    flex: 1, paddingVertical: 7, borderRadius: radius.sm,
    backgroundColor: colors.surface, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1,
  },
  tabActive: { backgroundColor: colors.accent },
  tabText: { fontSize: 12, fontWeight: '600', fontFamily: font.semibold, color: colors.textMuted },
  tabTextActive: { color: colors.white },

  // List
  list: { paddingHorizontal: 16, paddingTop: 4, flexGrow: 1 },
  separator: { height: 8 },

  // Expense row
  expenseRow: {
    backgroundColor: colors.surface, borderRadius: radius.md, padding: 14,
    ...shadow.sm,
  },
  expenseMain: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  expenseLeft: { flex: 1 },
  expenseDesc: { fontSize: 15, fontWeight: '600', fontFamily: font.semibold, color: colors.textPrimary, marginBottom: 3 },
  expenseMeta: { fontSize: 12, fontFamily: font.regular, color: colors.textSubtle },
  expenseNote: { fontSize: 12, fontFamily: font.regular, color: colors.textMuted, fontStyle: 'italic', marginTop: 3 },
  expenseRight: { alignItems: 'flex-end', gap: 4 },
  expenseAmount: { fontSize: 16, fontWeight: '700', fontFamily: font.bold, color: colors.textPrimary },
  expenseShare: { fontSize: 11, fontFamily: font.regular, color: colors.textMuted },
  statusBadge: { borderRadius: radius.sm, paddingHorizontal: 7, paddingVertical: 3 },
  statusText: { fontSize: 11, fontWeight: '700', fontFamily: font.bold },

  // Expanded
  expenseActions: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.borderHair },
  splitDetail: { fontSize: 12, fontFamily: font.regular, color: colors.textMuted, marginBottom: 10 },
  actionBtns: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center' },
  approveBtn: { backgroundColor: colors.successSoft },
  approveBtnText: { fontSize: 14, fontWeight: '600', fontFamily: font.semibold, color: colors.success },
  declineBtn: { backgroundColor: colors.dangerSoft },
  declineBtnText: { fontSize: 14, fontWeight: '600', fontFamily: font.semibold, color: colors.danger },

  // Empty
  emptyBox: { paddingVertical: 60, alignItems: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '600', fontFamily: font.semibold, color: colors.textPrimary, marginBottom: 8, textAlign: 'center' },
  emptySubtitle: { fontSize: 13, fontFamily: font.regular, color: colors.textMuted, textAlign: 'center' },
})

const modal = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: colors.borderHair,
  },
  closeBtn: { width: 64 },
  closeText: { fontSize: 16, fontFamily: font.regular, color: colors.textMuted },
  title: { fontSize: 17, fontWeight: '600', fontFamily: font.semibold, color: colors.textPrimary },
  saveBtn: { width: 64, alignItems: 'flex-end' },
  saveText: { fontSize: 16, fontWeight: '600', fontFamily: font.semibold, color: colors.accent },
  form: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
  errText: {
    color: colors.danger, fontSize: 13, fontFamily: font.regular, marginBottom: 12,
    backgroundColor: colors.dangerSoft, borderRadius: radius.sm, padding: 10,
  },
  label: { fontSize: 13, fontWeight: '600', fontFamily: font.semibold, color: colors.textSecondary, marginBottom: 6, marginTop: 16 },
  input: {
    backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, fontFamily: font.regular, color: colors.textPrimary,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: {
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontSize: 13, fontWeight: '500', fontFamily: font.medium, color: colors.textMuted },
  chipTextActive: { color: colors.white },
  scanBtn: {
    borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed',
    borderRadius: radius.md, paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  scanBtnSuccess: {
    borderColor: colors.success, borderStyle: 'solid', backgroundColor: colors.successSoft,
  },
  scanBtnText: { fontSize: 15, fontWeight: '600', fontFamily: font.semibold, color: colors.accent },
  scanBtnTextSuccess: { color: colors.success },
})
