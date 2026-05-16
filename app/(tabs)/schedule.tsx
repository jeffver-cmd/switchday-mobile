import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useState, useCallback, useMemo } from 'react'
import { useSchedules } from '@/lib/hooks/useSchedules'
import { scheduleAction, deleteSchedule, Schedule, ScheduleStatus } from '@/lib/api/schedules'

// ─── constants ───────────────────────────────────────────────────────────────

const PATTERN_LABELS: Record<string, string> = {
  week_on_week_off: 'Week on / week off',
  '2_2_3':          '2-2-3 rotating',
  '3_4_4_3':        '3-4-4-3 rotating',
  '2_2_5_5':        '2-2-5-5 rotating',
  custom:            'Custom',
}

const STATUS_COLORS: Record<ScheduleStatus, string> = {
  draft:      '#9ca3af',
  proposed:   '#3b82f6',
  accepted:   '#10b981',
  declined:   '#ef4444',
  superseded: '#d1d5db',
}

const STATUS_LABELS: Record<ScheduleStatus, string> = {
  draft:      'Draft',
  proposed:   'Proposed',
  accepted:   'Active',
  declined:   'Declined',
  superseded: 'Superseded',
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

// ─── schedule card ───────────────────────────────────────────────────────────

interface CardProps {
  schedule: Schedule
  userId: string
  coParentName: string
  onRefresh: () => void
  onProposeReplacement: (supersedesId: string) => void
}

function ScheduleCard({ schedule, userId, coParentName, onRefresh, onProposeReplacement }: CardProps) {
  const isMySchedule = schedule.created_by_id === userId
  const [declining, setDeclining] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [busy, setBusy] = useState(false)

  const act = useCallback(async (
    action: 'propose' | 'accept' | 'decline' | 'withdraw',
    extras: Record<string, string> = {},
  ) => {
    setBusy(true)
    const payload = action === 'decline'
      ? { action: 'decline' as const, decline_reason: extras.reason }
      : { action }
    const { error } = await scheduleAction(schedule.id, payload as Parameters<typeof scheduleAction>[1])
    setBusy(false)
    if (error) { Alert.alert('Error', error); return }
    onRefresh()
  }, [schedule.id, onRefresh])

  const handleDelete = useCallback(() => {
    Alert.alert('Delete draft?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          setBusy(true)
          const { error } = await deleteSchedule(schedule.id)
          setBusy(false)
          if (error) Alert.alert('Error', error)
          else onRefresh()
        },
      },
    ])
  }, [schedule.id, onRefresh])

  const handleDeclineConfirm = useCallback(async () => {
    await act('decline', { reason: declineReason })
    setDeclining(false)
    setDeclineReason('')
  }, [act, declineReason])

  const statusColor = STATUS_COLORS[schedule.status]
  const patternLabel = schedule.pattern === 'custom'
    ? (schedule.pattern_data.specific_days ? 'Custom specific days' : 'Custom cycle')
    : (PATTERN_LABELS[schedule.pattern] ?? schedule.pattern)

  return (
    <View style={card.container}>
      {/* Header */}
      <View style={card.header}>
        <View style={card.titleRow}>
          <Text style={card.name} numberOfLines={1}>{schedule.name}</Text>
          <View style={[card.badge, { backgroundColor: statusColor + '20' }]}>
            <Text style={[card.badgeText, { color: statusColor }]}>
              {STATUS_LABELS[schedule.status]}
            </Text>
          </View>
        </View>
        <Text style={card.meta}>{patternLabel}</Text>
        <Text style={card.dates}>
          {fmtDate(schedule.start_date)} — {fmtDate(schedule.end_date)}
        </Text>
        {schedule.note ? (
          <Text style={card.note} numberOfLines={2}>"{schedule.note}"</Text>
        ) : null}
        {schedule.decline_reason ? (
          <Text style={card.declineNote}>Reason: {schedule.decline_reason}</Text>
        ) : null}
      </View>

      {/* Actions */}
      {busy ? (
        <View style={card.busyRow}><ActivityIndicator size="small" color="#374151" /></View>
      ) : (
        <>
          {/* Draft — I created */}
          {schedule.status === 'draft' && isMySchedule && (
            <View style={card.actions}>
              <TouchableOpacity
                style={[card.btn, card.btnPrimary]}
                onPress={() => act('propose')}
              >
                <Text style={card.btnPrimaryText}>Propose to {coParentName}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[card.btn, card.btnGhost]} onPress={handleDelete}>
                <Text style={card.btnGhostText}>Delete</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Proposed — I proposed, waiting */}
          {schedule.status === 'proposed' && isMySchedule && (
            <View style={card.actions}>
              <View style={card.waitingRow}>
                <Text style={card.waitingText}>Waiting for {coParentName}</Text>
              </View>
              <TouchableOpacity style={[card.btn, card.btnGhost]} onPress={() => act('withdraw')}>
                <Text style={card.btnGhostText}>Withdraw</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Proposed — co-parent proposed, my turn */}
          {schedule.status === 'proposed' && !isMySchedule && !declining && (
            <View style={card.actions}>
              <TouchableOpacity
                style={[card.btn, card.btnGreen]}
                onPress={() => act('accept')}
              >
                <Text style={card.btnPrimaryText}>Accept</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[card.btn, card.btnRed]}
                onPress={() => setDeclining(true)}
              >
                <Text style={card.btnPrimaryText}>Decline</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Decline reason input */}
          {declining && (
            <View style={card.declineForm}>
              <TextInput
                style={card.declineInput}
                value={declineReason}
                onChangeText={setDeclineReason}
                placeholder="Reason (optional)"
                placeholderTextColor="#9ca3af"
                multiline
              />
              <View style={card.actions}>
                <TouchableOpacity style={[card.btn, card.btnRed]} onPress={handleDeclineConfirm}>
                  <Text style={card.btnPrimaryText}>Confirm Decline</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[card.btn, card.btnGhost]} onPress={() => setDeclining(false)}>
                  <Text style={card.btnGhostText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Accepted — propose replacement */}
          {schedule.status === 'accepted' && (
            <View style={card.actions}>
              <TouchableOpacity
                style={[card.btn, card.btnGhost]}
                onPress={() => onProposeReplacement(schedule.id)}
              >
                <Text style={card.btnGhostText}>Propose Replacement</Text>
              </TouchableOpacity>
            </View>
          )}
        </>
      )}
    </View>
  )
}

// ─── screen ──────────────────────────────────────────────────────────────────

export default function ScheduleScreen() {
  const router = useRouter()
  const { data, loading, error, refresh } = useSchedules()
  const [showHistory, setShowHistory] = useState(false)

  const { incoming, active, history } = useMemo(() => {
    const schedules = data?.schedules ?? []
    const userId = data?.userId ?? ''
    const incoming: Schedule[] = []
    const active: Schedule[] = []
    const history: Schedule[] = []

    for (const s of schedules) {
      if (s.status === 'declined' || s.status === 'superseded') {
        history.push(s)
      } else if (s.status === 'proposed' && s.created_by_id !== userId) {
        incoming.push(s)
      } else {
        active.push(s)
      }
    }
    return { incoming, active, history }
  }, [data])

  const coParentName = data?.coParentProfile?.display_name ?? 'Co-parent'

  const handleProposeReplacement = useCallback((supersedesId: string) => {
    router.push(`/schedule/new?supersedesId=${supersedesId}`)
  }, [router])

  // ── loading / error states ────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#374151" />
      </SafeAreaView>
    )
  }

  if (error === 'no_connection') {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.emptyTitle}>No co-parent connected</Text>
        <Text style={styles.emptySubtitle}>Connect with your co-parent to manage schedules.</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.heading}>Schedule</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push('/schedule/new')}
        >
          <Text style={styles.addBtnText}>+ New</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Incoming proposals */}
        {incoming.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>NEEDS YOUR RESPONSE</Text>
            {incoming.map(s => (
              <ScheduleCard
                key={s.id}
                schedule={s}
                userId={data?.userId ?? ''}
                coParentName={coParentName}
                onRefresh={refresh}
                onProposeReplacement={handleProposeReplacement}
              />
            ))}
          </View>
        )}

        {/* Active schedules */}
        {active.length > 0 ? (
          <View style={styles.section}>
            {incoming.length > 0 && <Text style={styles.sectionLabel}>YOUR SCHEDULES</Text>}
            {active.map(s => (
              <ScheduleCard
                key={s.id}
                schedule={s}
                userId={data?.userId ?? ''}
                coParentName={coParentName}
                onRefresh={refresh}
                onProposeReplacement={handleProposeReplacement}
              />
            ))}
          </View>
        ) : (
          incoming.length === 0 && (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>No schedules yet</Text>
              <Text style={styles.emptySubtitle}>
                Tap "+ New" to propose a custody schedule to {coParentName}.
              </Text>
            </View>
          )
        )}

        {/* History */}
        {history.length > 0 && (
          <View style={styles.section}>
            <TouchableOpacity
              style={styles.historyToggle}
              onPress={() => setShowHistory(h => !h)}
            >
              <Text style={styles.historyToggleText}>
                {showHistory ? '▾' : '▸'} History ({history.length})
              </Text>
            </TouchableOpacity>
            {showHistory && history.map(s => (
              <ScheduleCard
                key={s.id}
                schedule={s}
                userId={data?.userId ?? ''}
                coParentName={coParentName}
                onRefresh={refresh}
                onProposeReplacement={handleProposeReplacement}
              />
            ))}
          </View>
        )}

        <View style={styles.bottomPad} />
      </ScrollView>
    </SafeAreaView>
  )
}

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f9fafb', paddingHorizontal: 24 },
  scroll: { paddingHorizontal: 16, paddingTop: 4 },
  bottomPad: { height: 32 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12,
  },
  heading: { fontSize: 24, fontWeight: '700', color: '#111827' },
  addBtn: { backgroundColor: '#1f2937', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
  addBtnText: { color: '#ffffff', fontWeight: '600', fontSize: 14 },

  section: { marginBottom: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#9ca3af', letterSpacing: 0.8, marginBottom: 8, marginTop: 4 },

  emptyBox: { paddingVertical: 60, alignItems: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 8, textAlign: 'center' },
  emptySubtitle: { fontSize: 13, color: '#6b7280', textAlign: 'center' },

  historyToggle: { paddingVertical: 10 },
  historyToggleText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
})

const card = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff', borderRadius: 16, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 4, elevation: 2,
  },
  header: { marginBottom: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  name: { fontSize: 16, fontWeight: '700', color: '#111827', flex: 1, marginRight: 8 },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  meta: { fontSize: 13, color: '#6b7280', marginBottom: 2 },
  dates: { fontSize: 12, color: '#9ca3af' },
  note: { fontSize: 13, color: '#6b7280', fontStyle: 'italic', marginTop: 6 },
  declineNote: { fontSize: 12, color: '#ef4444', marginTop: 4 },

  busyRow: { alignItems: 'center', paddingVertical: 8 },

  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  btn: { flex: 1, minWidth: 100, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  btnPrimary: { backgroundColor: '#1f2937' },
  btnPrimaryText: { color: '#ffffff', fontWeight: '600', fontSize: 14 },
  btnGreen: { backgroundColor: '#10b981' },
  btnRed: { backgroundColor: '#ef4444' },
  btnGhost: { backgroundColor: '#f3f4f6' },
  btnGhostText: { color: '#374151', fontWeight: '600', fontSize: 14 },

  waitingRow: { flex: 1, justifyContent: 'center' },
  waitingText: { fontSize: 13, color: '#9ca3af', fontStyle: 'italic' },

  declineForm: { marginTop: 8 },
  declineInput: {
    backgroundColor: '#f9fafb', borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb',
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#1f2937',
    marginBottom: 10, minHeight: 60,
  },
})
