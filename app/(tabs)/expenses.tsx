import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl, Modal, TextInput, ScrollView, KeyboardAvoidingView, Platform, Alert, ActionSheetIOS, Linking,
  Animated,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useState, useCallback, useEffect, useRef } from 'react'
import {
  useExpenses,
  approveExpense,
  declineExpense,
  disputeExpense,
  markExpensePaid,
  logExpense,
  Expense,
  NewExpenseInput,
} from '@/lib/hooks/useExpenses'

import type { ExpenseStatus, ExpenseCategory } from '@/lib/types/database'
import { colors, radius, shadow, font, buttonLabel } from '@/lib/theme'
import SoloBanner from '../../src/components/SoloBanner'
import { PrimaryButton } from '../../components/PrimaryButton'
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

type FilterTab = 'all' | 'pending' | 'approved' | 'disputed' | 'paid'
const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'all',      label: 'All' },
  { key: 'pending',  label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'disputed', label: 'Disputed' },
  { key: 'paid',     label: 'Paid' },
]

const FILTER_STATUSES: Record<FilterTab, ExpenseStatus[] | undefined> = {
  all:      undefined,
  pending:  ['pending', 'requested'],
  approved: ['approved'],
  disputed: ['disputed'],
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
  onApprove:   (id: string) => void
  onDecline:   (id: string) => void
  onDispute:   (id: string) => void
  onMarkPaid:  (id: string) => void
}

function ExpenseRow({ item, userId, onApprove, onDecline, onDispute, onMarkPaid }: ExpenseRowProps) {
  const [expanded, setExpanded] = useState(false)
  const isMyExpense  = item.submittedById === userId
  const canApprove   = !isMyExpense && (item.status === 'pending' || item.status === 'requested')
  const canDecline   = !isMyExpense && item.status === 'requested'
  const canDispute   = !isMyExpense && item.status === 'pending'
  const canMarkPaid  = isMyExpense && item.status === 'approved'
  const showVenmo    = !isMyExpense && item.status === 'approved' // co-parent owes submitter; they pay via Venmo
  const canAct = canApprove || canDecline || canDispute || canMarkPaid || showVenmo
  const coParentShare = item.amount * ((100 - item.splitPercent) / 100)
  const myShare = isMyExpense
    ? item.amount * (item.splitPercent / 100)
    : item.amount * ((100 - item.splitPercent) / 100)
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
          <Text style={styles.expenseShare}>Your share: ${myShare.toFixed(2)}</Text>
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
          <Text style={styles.splitDetail}>
            {isMyExpense
              ? `Your share: ${item.splitPercent}% · Their share: ${100 - item.splitPercent}%`
              : `Your share: ${100 - item.splitPercent}% · Their share: ${item.splitPercent}%`}
          </Text>
          {canAct && (
            <View style={styles.actionBtns}>
              {canApprove && (
                <TouchableOpacity style={[styles.actionBtn, styles.approveBtn]} onPress={() => onApprove(item.id)}>
                  <Text style={styles.approveBtnText}>Approve</Text>
                </TouchableOpacity>
              )}
              {canDecline && (
                <TouchableOpacity style={[styles.actionBtn, styles.declineBtn]} onPress={() => onDecline(item.id)}>
                  <Text style={styles.declineBtnText}>Decline</Text>
                </TouchableOpacity>
              )}
              {canDispute && (
                <TouchableOpacity style={[styles.actionBtn, styles.declineBtn]} onPress={() => onDispute(item.id)}>
                  <Text style={styles.declineBtnText}>Dispute</Text>
                </TouchableOpacity>
              )}
              {showVenmo && (
                <TouchableOpacity
                  style={[styles.actionBtn, { backgroundColor: '#008CFF22', borderColor: '#008CFF' }]}
                  onPress={() => {
                    const note = encodeURIComponent(item.description.slice(0, 60))
                    const amt  = coParentShare.toFixed(2)
                    Linking.openURL(`venmo://paycharge?txn=pay&amount=${amt}&note=${note}`).catch(() =>
                      Linking.openURL('https://venmo.com')
                    )
                  }}
                >
                  <Text style={{ color: '#008CFF', fontFamily: font.semibold, fontSize: 13 }}>
                    Pay ${coParentShare.toFixed(2)} via Venmo
                  </Text>
                </TouchableOpacity>
              )}
              {canMarkPaid && (
                <TouchableOpacity style={[styles.actionBtn, styles.approveBtn]} onPress={() => onMarkPaid(item.id)}>
                  <Text style={styles.approveBtnText}>Mark paid</Text>
                </TouchableOpacity>
              )}
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
  const [receiptPath, setReceiptPath] = useState<string | null>(null)
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
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85, base64: true })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85, base64: true })

    if (result.canceled || !result.assets[0]) return

    const asset = result.assets[0]
    setScanning(true)
    setScanFeedback(null)
    try {
      // Build ArrayBuffer from base64 — avoids fetch(file://) which is unreliable in
      // standalone builds. React Native Blob does not support ArrayBufferView
      // construction, so we pass the ArrayBuffer directly to Supabase storage.
      if (!asset.base64) { setScanFeedback('failed'); return }
      const byteString = atob(asset.base64)
      const bytes = new Uint8Array(byteString.length)
      for (let i = 0; i < byteString.length; i++) {
        bytes[i] = byteString.charCodeAt(i)
      }
      const mimeType = asset.mimeType ?? 'image/jpeg'
      const buffer = bytes.buffer

      // Upload to Supabase Storage (receipts bucket)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const ext = mimeType.split('/')[1] ?? 'jpg'
      const path = `${connectionId}/${session.user.id}/${Date.now()}.${ext}`

      const { error: uploadErr } = await supabase.storage
        .from('receipts')
        .upload(path, buffer, { contentType: mimeType, upsert: false })

      if (uploadErr) { setScanFeedback('failed'); return }

      // Store path — bucket is private, signed URLs generated server-side on demand
      setReceiptPath(path)

      // Call Edge Function with storage path — function generates signed URL internally
      const { data: scan, error: fnErr } = await supabase.functions.invoke<{
        amount: number | null; description: string | null; category: string | null; date: string | null
        scan_status: 'ok' | 'no_data' | 'no_key' | 'storage_error' | 'api_error' | 'error'
      }>('scan-receipt', { body: { storage_path: path } })

      if (fnErr || !scan) { setScanFeedback('failed'); return }

      // Pre-fill only empty fields
      if (scan.amount   && !amount.trim())      setAmount(String(scan.amount))
      if (scan.description && !description.trim()) setDescription(scan.description)
      if (scan.category && ['medical','education','activities','clothing','other'].includes(scan.category)) {
        setCategory(scan.category as ExpenseCategory)
      }

      setScanFeedback(scan.scan_status === 'ok' ? 'scanned' : 'failed')
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
      receiptUrl: receiptPath ?? null,
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
              style={[
                modal.scanBtn,
                scanFeedback === 'scanned' && modal.scanBtnSuccess,
                scanFeedback === 'failed'  && modal.scanBtnFailed,
              ]}
              onPress={handleScanReceipt}
              disabled={scanning}
              activeOpacity={0.75}
            >
              {scanning ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Text style={[
                  modal.scanBtnText,
                  scanFeedback === 'scanned' && modal.scanBtnTextSuccess,
                  scanFeedback === 'failed'  && modal.scanBtnTextFailed,
                ]}>
                  {scanFeedback === 'scanned'
                    ? '✓ Receipt scanned — review below'
                    : scanFeedback === 'failed'
                    ? '⚠ Scan failed — fill in manually or try again'
                    : '📷  Scan Receipt'}
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

// ─── recurring expense row ────────────────────────────────────────────────────

interface RecurringExpense {
  id: string
  description: string
  amount: number
  category: string
  split_percent: number
  frequency: string
  next_due_at: string
  paused: boolean
  created_by_id: string
}

const FREQ_LABELS: Record<string, string> = {
  weekly: 'Weekly', biweekly: 'Every 2 weeks', monthly: 'Monthly',
  quarterly: 'Quarterly', yearly: 'Yearly', custom: 'Custom',
}

function RecurringRow({ item, userId, onTogglePause }: {
  item: RecurringExpense
  userId: string
  onTogglePause: (id: string, paused: boolean) => void
}) {
  const isMine = item.created_by_id === userId
  const nextDue = new Date(item.next_due_at + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return (
    <View style={styles.recurRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.recurDesc} numberOfLines={1}>{item.description}</Text>
        <Text style={styles.recurMeta}>
          {CATEGORY_LABELS[item.category as ExpenseCategory] ?? item.category} · {FREQ_LABELS[item.frequency] ?? item.frequency}
          {!item.paused && ` · Next: ${nextDue}`}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={styles.recurAmount}>${item.amount.toFixed(2)}</Text>
        {isMine && (
          <TouchableOpacity
            onPress={() => onTogglePause(item.id, !item.paused)}
            style={[styles.recurPauseBtn, item.paused && styles.recurPauseBtnActive]}
          >
            <Text style={[styles.recurPauseBtnText, item.paused && styles.recurPauseBtnTextActive]}>
              {item.paused ? 'Resume' : 'Pause'}
            </Text>
          </TouchableOpacity>
        )}
        {item.paused && (
          <View style={styles.pausedBadge}><Text style={styles.pausedBadgeText}>Paused</Text></View>
        )}
      </View>
    </View>
  )
}

// ─── screen ──────────────────────────────────────────────────────────────────

export default function ExpensesScreen() {
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [showLog, setShowLog] = useState(false)
  const [showFilterSheet, setShowFilterSheet] = useState(false)
  const slideAnim = useRef(new Animated.Value(300)).current
  const statusFilter = FILTER_STATUSES[activeTab]
  const { data, loading, error, refresh } = useExpenses(statusFilter)

  function openFilterSheet() {
    setShowFilterSheet(true)
    Animated.timing(slideAnim, { toValue: 0, duration: 250, useNativeDriver: true }).start()
  }
  function closeFilterSheet() {
    Animated.timing(slideAnim, { toValue: 300, duration: 200, useNativeDriver: true }).start(() => setShowFilterSheet(false))
  }
  function selectFilter(tab: FilterTab) {
    setActiveTab(tab)
    closeFilterSheet()
  }

  // Recurring expenses
  const [recurring, setRecurring] = useState<RecurringExpense[]>([])
  const [showRecurring, setShowRecurring] = useState(false)

  const loadRecurring = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data: conn } = await supabase
      .from('co_parent_connections')
      .select('id')
      .or(`user_a_id.eq.${session.user.id},user_b_id.eq.${session.user.id}`)
      .eq('status', 'active')
      .maybeSingle()
    if (!conn) return
    const { data: rows } = await supabase
      .from('recurring_expenses')
      .select('id, description, amount, category, split_percent, frequency, next_due_at, paused, created_by_id')
      .eq('connection_id', conn.id)
      .order('created_at', { ascending: false })
    setRecurring(rows ?? [])
  }, [])

  const handleTogglePause = useCallback(async (id: string, paused: boolean) => {
    await supabase.from('recurring_expenses').update({ paused }).eq('id', id)
    setRecurring(prev => prev.map(r => r.id === id ? { ...r, paused } : r))
  }, [])

  // Load recurring on mount
  useEffect(() => { loadRecurring() }, [loadRecurring])

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

  const handleDispute = useCallback(async (id: string) => {
    Alert.alert('Dispute expense?', 'The submitter will be notified. You can still approve it later.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Dispute', style: 'destructive',
        onPress: async () => {
          const { error: err } = await disputeExpense(id)
          if (err) Alert.alert('Error', err)
          else refresh()
        },
      },
    ])
  }, [refresh])

  const handleMarkPaid = useCallback(async (id: string) => {
    Alert.alert('Mark as paid?', 'Confirm you\'ve received payment for your share.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark paid',
        onPress: async () => {
          const { error: err } = await markExpensePaid(id)
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
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.filterBtn} onPress={openFilterSheet}>
            <Text style={styles.filterBtnText}>
              {FILTER_TABS.find(t => t.key === activeTab)?.label ?? 'All'} ▾
            </Text>
          </TouchableOpacity>
          <PrimaryButton
            label="+ Log"
            onPress={() => setShowLog(true)}
            disabled={!data?.connectionId}
            small
          />
        </View>
      </View>

      {/* Filter sheet */}
      <Modal visible={showFilterSheet} transparent animationType="none" onRequestClose={closeFilterSheet}>
        <View style={styles.sheetContainer}>
          <TouchableOpacity style={styles.sheetBackdrop} activeOpacity={1} onPress={closeFilterSheet} />
          <Animated.View style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Filter</Text>
            {FILTER_TABS.map(tab => (
              <TouchableOpacity key={tab.key} style={styles.sheetRow} onPress={() => selectFilter(tab.key)}>
                <Text style={[styles.sheetRowText, activeTab === tab.key && styles.sheetRowTextActive]}>
                  {tab.label}
                </Text>
                {activeTab === tab.key && <Text style={styles.sheetCheck}>✓</Text>}
              </TouchableOpacity>
            ))}
          </Animated.View>
        </View>
      </Modal>

      {!loading && !data?.connectionId && <SoloBanner />}

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
              onDispute={handleDispute}
              onMarkPaid={handleMarkPaid}
            />
          )}
          ListHeaderComponent={
            recurring.length > 0 && activeTab === 'all' ? (
              <View style={styles.recurSection}>
                <TouchableOpacity
                  style={styles.recurHeader}
                  onPress={() => setShowRecurring(p => !p)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.recurHeaderText}>🔁  Recurring ({recurring.length})</Text>
                  <Text style={styles.recurChevron}>{showRecurring ? '▲' : '▼'}</Text>
                </TouchableOpacity>
                {showRecurring && recurring.map((item, i) => (
                  <RecurringRow
                    key={item.id}
                    item={item}
                    userId={data?.userId ?? ''}
                    onTogglePause={handleTogglePause}
                  />
                ))}
              </View>
            ) : null
          }
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
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  filterBtn: {
    height: 36, borderWidth: 1, borderColor: colors.border, borderRadius: radius.full,
    paddingHorizontal: 14, justifyContent: 'center',
  },
  filterBtnText: { fontSize: 13, fontWeight: '600', fontFamily: font.semibold, color: colors.textPrimary, lineHeight: 18 },


  // Filter bottom sheet
  sheetContainer: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 36, paddingHorizontal: 20,
  },
  sheetHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border,
    alignSelf: 'center', marginTop: 12, marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 16, fontWeight: '700', fontFamily: font.bold,
    color: colors.textPrimary, marginBottom: 8,
  },
  sheetRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  sheetRowText: { fontSize: 15, fontFamily: font.regular, color: colors.textPrimary, lineHeight: 20 },
  sheetRowTextActive: { fontFamily: font.semibold, color: colors.accent },
  sheetCheck: { fontSize: 16, color: colors.accent },

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
  approveBtnText: { ...buttonLabel, color: colors.success },
  declineBtn: { backgroundColor: colors.dangerSoft },
  declineBtnText: { ...buttonLabel, color: colors.danger },

  // Empty
  emptyBox: { paddingVertical: 60, alignItems: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '600', fontFamily: font.semibold, color: colors.textPrimary, marginBottom: 8, textAlign: 'center' },
  emptySubtitle: { fontSize: 13, fontFamily: font.regular, color: colors.textMuted, textAlign: 'center' },

  // Recurring section
  recurSection: {
    backgroundColor: colors.surface, borderRadius: radius.md, marginBottom: 12,
    ...shadow.sm, overflow: 'hidden',
  },
  recurHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: colors.borderHair,
  },
  recurHeaderText: { fontSize: 13, fontWeight: '600', fontFamily: font.semibold, color: colors.textSecondary },
  recurChevron: { fontSize: 10, color: colors.textSubtle },
  recurRow: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.borderHair, gap: 8,
  },
  recurDesc: { fontSize: 14, fontWeight: '500', fontFamily: font.medium, color: colors.textPrimary, marginBottom: 2 },
  recurMeta: { fontSize: 12, fontFamily: font.regular, color: colors.textSubtle },
  recurAmount: { fontSize: 14, fontWeight: '700', fontFamily: font.bold, color: colors.textPrimary, marginBottom: 4 },
  recurPauseBtn: {
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 8, paddingVertical: 3, backgroundColor: colors.surface2,
  },
  recurPauseBtnActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  recurPauseBtnText: { fontSize: 11, fontFamily: font.medium, color: colors.textMuted },
  recurPauseBtnTextActive: { color: colors.accent },
  pausedBadge: {
    borderRadius: radius.sm, backgroundColor: colors.surface2, paddingHorizontal: 6, paddingVertical: 2,
  },
  pausedBadgeText: { fontSize: 10, fontFamily: font.medium, color: colors.textSubtle },
})

const modal = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: colors.borderHair,
  },
  closeBtn: { minWidth: 70 },
  closeText: { fontSize: 16, fontFamily: font.regular, color: colors.textMuted },
  title: { flex: 1, fontSize: 17, fontWeight: '600', fontFamily: font.semibold, color: colors.textPrimary, textAlign: 'center' },
  saveBtn: { minWidth: 70, alignItems: 'flex-end' },
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
  scanBtnFailed: {
    borderColor: colors.warning, borderStyle: 'solid', backgroundColor: colors.warningSoft,
  },
  scanBtnText: { fontSize: 15, fontWeight: '600', fontFamily: font.semibold, color: colors.accent },
  scanBtnTextSuccess: { color: colors.success },
  scanBtnTextFailed: { color: colors.warning },
})
