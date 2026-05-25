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
  Modal,
  Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useState, useCallback, useMemo, useEffect } from 'react'
import * as Crypto from 'expo-crypto'
import DateTimePicker from '@react-native-community/datetimepicker'
import { useSchedules } from '@/lib/hooks/useSchedules'
import { scheduleAction, deleteSchedule, Schedule, ScheduleStatus } from '@/lib/api/schedules'
import { supabase } from '@/lib/supabase'
import { colors, radius, shadow, font } from '@/lib/theme'

// ─── types ───────────────────────────────────────────────────────────────────

interface CustodySwitchRequest {
  id: string
  switch_date: string
  current_owner_id: string
  proposed_owner_id: string
  requested_by_id: string
  reason: string | null
  status: 'pending' | 'counter_proposed' | 'approved' | 'declined' | 'cancelled'
  created_at: string
}

// ─── constants ───────────────────────────────────────────────────────────────

const PATTERN_LABELS: Record<string, string> = {
  week_on_week_off: 'Week on / week off',
  '2_2_3':          '2-2-3 rotating',
  '3_4_4_3':        '3-4-4-3 rotating',
  '2_2_5_5':        '2-2-5-5 rotating',
  custom:            'Custom',
}

const STATUS_COLORS: Record<ScheduleStatus, string> = {
  draft:      colors.textSubtle as string,
  proposed:   colors.info,
  accepted:   colors.success,
  declined:   colors.danger,
  superseded: 'rgba(26,26,24,0.20)',
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
    if (action === 'accept') {
      Alert.alert(
        'Schedule accepted',
        'Your calendar will update after you open the web app at switchday.app to activate the schedule. This step generates your custody day assignments.',
        [{ text: 'OK' }],
      )
    }
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
        <View style={card.busyRow}><ActivityIndicator size="small" color={colors.accent} /></View>
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
                placeholderTextColor={colors.textSubtle}
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

  // ── Custody switch request — proposal ──────────────────────────────────
  const [showSwitchReq, setShowSwitchReq] = useState(false)
  const [switchReqDate, setSwitchReqDate] = useState<Date>(new Date())
  const [showDatePick, setShowDatePick] = useState(false)
  const [switchReqReason, setSwitchReqReason] = useState('')
  const [switchReqBusy, setSwitchReqBusy] = useState(false)
  const [switchReqInfo, setSwitchReqInfo] = useState<{ownerId: string; ownerName: string} | null>(null)

  // ── Custody switch request — incoming (approval) ────────────────────────
  const [incomingSwapReqs, setIncomingSwapReqs] = useState<CustodySwitchRequest[]>([])
  const [swapReqsBusy, setSwapReqsBusy] = useState<Record<string, boolean>>({})
  const [decliningSwapId, setDecliningSwapId] = useState<string | null>(null)
  const [swapDeclineReason, setSwapDeclineReason] = useState('')

  function fmtDateStr(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }

  async function lookupDayOwner(d: Date) {
    if (!data) return
    const dateStr = fmtDateStr(d)
    const { data: day } = await supabase
      .from('custody_schedule')
      .select('owner_id')
      .eq('connection_id', data.connectionId)
      .eq('date', dateStr)
      .maybeSingle()
    if (!day) { setSwitchReqInfo(null); return }
    const ownerName = day.owner_id === data.userId
      ? 'you'
      : (data.coParentProfile?.display_name ?? 'your co-parent')
    setSwitchReqInfo({ ownerId: day.owner_id, ownerName })
  }

  async function submitSwitchRequest() {
    if (!data || !switchReqInfo) return
    setSwitchReqBusy(true)
    const dateStr = fmtDateStr(switchReqDate)
    const isMyDay = switchReqInfo.ownerId === data.userId
    const coParentId = data.coParentProfile?.id ?? ''
    const currentOwnerId  = switchReqInfo.ownerId
    const proposedOwnerId = isMyDay ? coParentId : data.userId
    try {
      // Row-level integrity hash on the custody_switch_requests record
      const rowPayload = { connection_id: data.connectionId, requested_by_id: data.userId, switch_date: dateStr, proposed_owner_id: proposedOwnerId }
      const sha256_hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, JSON.stringify(rowPayload))
      const { data: inserted, error: err } = await supabase.from('custody_switch_requests').insert({
        connection_id: data.connectionId,
        requested_by_id: data.userId,
        switch_date: dateStr,
        current_owner_id: currentOwnerId,
        proposed_owner_id: proposedOwnerId,
        reason: switchReqReason.trim() || null,
        switch_type: 'one_way',
        sha256_hash,
      }).select('id').single()
      if (err || !inserted) { Alert.alert('Error', err?.message ?? 'Could not send.'); return }

      // Audit log — fire and forget
      const metadata = { switch_date: dateStr, current_owner_id: currentOwnerId, proposed_owner_id: proposedOwnerId, reason: switchReqReason.trim() || null, connection_id: data.connectionId }
      const auditPayload = { actor_id: data.userId, action: 'switch_request.proposed', resource_id: inserted.id, metadata }
      const auditHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, JSON.stringify(auditPayload))
      supabase.from('audit_log').insert({
        actor_id: data.userId, action: 'switch_request.proposed',
        resource_type: 'custody_switch_requests', resource_id: inserted.id,
        metadata, sha256_hash: auditHash,
      }).then(() => {})

      setShowSwitchReq(false)
      setSwitchReqReason('')
      setSwitchReqInfo(null)
      Alert.alert('Request sent', 'Your co-parent can approve or decline the swap.')
      refresh()
      loadSwapRequests()
    } finally {
      setSwitchReqBusy(false)
    }
  }

  const loadSwapRequests = useCallback(async () => {
    if (!data) return
    const { data: rows } = await supabase
      .from('custody_switch_requests')
      .select('id, switch_date, current_owner_id, proposed_owner_id, requested_by_id, reason, status, created_at')
      .eq('connection_id', data.connectionId)
      .neq('requested_by_id', data.userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
    setIncomingSwapReqs((rows ?? []) as CustodySwitchRequest[])
  }, [data])

  useEffect(() => { loadSwapRequests() }, [loadSwapRequests])

  async function respondSwapRequest(req: CustodySwitchRequest, action: 'approved' | 'declined') {
    if (!data) return
    setSwapReqsBusy(prev => ({ ...prev, [req.id]: true }))
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('custody_switch_requests')
      .update({
        status: action,
        responded_by_id: data.userId,
        responded_at: now,
        ...(action === 'declined' && swapDeclineReason.trim() ? { decline_reason: swapDeclineReason.trim() } : {}),
      })
      .eq('id', req.id)
    if (error) {
      Alert.alert('Error', error.message)
      setSwapReqsBusy(prev => ({ ...prev, [req.id]: false }))
      return
    }

    // Audit log — fire and forget
    const auditAction = action === 'approved' ? 'switch_request.approved' : 'switch_request.declined'
    const metadata = { switch_date: req.switch_date, current_owner_id: req.current_owner_id, proposed_owner_id: req.proposed_owner_id, status: action, decline_reason: swapDeclineReason.trim() || null }
    const payload  = { actor_id: data.userId, action: auditAction, resource_id: req.id, metadata }
    const sha256_hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, JSON.stringify(payload))
    supabase.from('audit_log').insert({
      actor_id: data.userId, action: auditAction,
      resource_type: 'custody_switch_requests', resource_id: req.id,
      metadata, sha256_hash,
    }).then(() => {})

    setDecliningSwapId(null)
    setSwapDeclineReason('')
    setSwapReqsBusy(prev => ({ ...prev, [req.id]: false }))
    loadSwapRequests()
    refresh()
    Alert.alert(
      action === 'approved' ? 'Day swap approved' : 'Request declined',
      action === 'approved'
        ? 'The custody schedule will be updated.'
        : 'Your co-parent will be notified.',
    )
  }

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
        <ActivityIndicator size="large" color={colors.accent} />
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
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {data && (
            <TouchableOpacity
              style={[styles.addBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
              onPress={() => { setSwitchReqDate(new Date()); setSwitchReqInfo(null); setShowSwitchReq(true) }}
            >
              <Text style={[styles.addBtnText, { color: colors.textSecondary }]}>↔ Swap day</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => router.push('/schedule/new')}
          >
            <Text style={styles.addBtnText}>+ New</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Custody switch request modal */}
      <Modal visible={showSwitchReq} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowSwitchReq(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.borderHair }}>
            <TouchableOpacity onPress={() => setShowSwitchReq(false)}>
              <Text style={{ color: colors.textMuted, fontSize: 16 }}>Cancel</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 17, fontWeight: '600', fontFamily: font.semibold, color: colors.textPrimary }}>Request day swap</Text>
            <TouchableOpacity
              onPress={submitSwitchRequest}
              disabled={switchReqBusy || !switchReqInfo}
            >
              <Text style={{ color: !switchReqInfo ? colors.textSubtle : colors.accent, fontSize: 16, fontWeight: '600', fontFamily: font.semibold }}>
                {switchReqBusy ? 'Sending…' : 'Send'}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
            <Text style={{ fontSize: 13, color: colors.textMuted, marginBottom: 20, lineHeight: 18 }}>
              Propose to swap a custody day with {coParentName}. They can approve or decline the request.
            </Text>

            <Text style={{ fontSize: 12, fontWeight: '700', fontFamily: font.bold, color: colors.textSubtle, letterSpacing: 0.8, marginBottom: 8 }}>DATE</Text>
            <TouchableOpacity
              style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 13, marginBottom: 4 }}
              onPress={() => setShowDatePick(p => !p)}
            >
              <Text style={{ color: colors.textPrimary, fontFamily: font.regular, fontSize: 15 }}>
                {switchReqDate.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}
              </Text>
            </TouchableOpacity>
            {showDatePick && (
              <>
                <DateTimePicker
                  value={switchReqDate}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  minimumDate={new Date()}
                  onChange={(_e, d) => {
                    if (d) { setSwitchReqDate(d); lookupDayOwner(d) }
                    if (Platform.OS !== 'ios') setShowDatePick(false)
                  }}
                />
                {Platform.OS === 'ios' && (
                  <TouchableOpacity onPress={() => { setShowDatePick(false); lookupDayOwner(switchReqDate) }} style={{ alignItems: 'center', paddingVertical: 8 }}>
                    <Text style={{ color: colors.accent, fontFamily: font.medium, fontSize: 15 }}>Done</Text>
                  </TouchableOpacity>
                )}
              </>
            )}

            {switchReqInfo && (
              <View style={{ backgroundColor: colors.surface2, borderRadius: radius.md, padding: 12, marginTop: 12 }}>
                <Text style={{ fontSize: 13, color: colors.textSecondary, lineHeight: 18 }}>
                  {switchReqInfo.ownerName === 'you'
                    ? `You currently have custody this day. This will propose giving it to ${coParentName}.`
                    : `${coParentName} currently has custody this day. This will propose giving it to you.`}
                </Text>
              </View>
            )}

            {!switchReqInfo && !showDatePick && (
              <Text style={{ fontSize: 12, color: colors.textSubtle, marginTop: 8 }}>
                No custody day found for this date. Check that your schedule is active.
              </Text>
            )}

            <Text style={{ fontSize: 12, fontWeight: '700', fontFamily: font.bold, color: colors.textSubtle, letterSpacing: 0.8, marginBottom: 8, marginTop: 20 }}>REASON (OPTIONAL)</Text>
            <TextInput
              style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 12, fontSize: 15, fontFamily: font.regular, color: colors.textPrimary }}
              value={switchReqReason}
              onChangeText={setSwitchReqReason}
              placeholder="e.g. Work trip that week"
              placeholderTextColor={colors.textSubtle}
              maxLength={200}
            />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.accent} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Incoming day swap requests */}
        {incomingSwapReqs.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>NEEDS YOUR RESPONSE — DAY SWAPS</Text>
            {incomingSwapReqs.map(req => {
              const isBusy = !!swapReqsBusy[req.id]
              const isDeclining = decliningSwapId === req.id
              const swapDate = new Date(req.switch_date + 'T12:00:00').toLocaleDateString('en-US', {
                weekday: 'short', month: 'long', day: 'numeric', year: 'numeric',
              })
              // Determine direction: requested_by_id is co-parent. proposed_owner_id is who would get the day.
              const theyWantToGive = req.proposed_owner_id === data?.userId
              const directionText = theyWantToGive
                ? `${coParentName} wants to give you ${swapDate}.`
                : `${coParentName} wants to take ${swapDate} from you.`

              return (
                <View key={req.id} style={swapCard.container}>
                  <Text style={swapCard.dateText}>{swapDate}</Text>
                  <Text style={swapCard.directionText}>{directionText}</Text>
                  {req.reason ? (
                    <Text style={swapCard.reasonText}>"{req.reason}"</Text>
                  ) : null}

                  {isBusy ? (
                    <View style={{ paddingVertical: 8 }}><ActivityIndicator size="small" color={colors.accent} /></View>
                  ) : isDeclining ? (
                    <View style={{ marginTop: 10 }}>
                      <Text style={swapCard.declineLabelText}>REASON (OPTIONAL)</Text>
                      <TextInput
                        style={swapCard.declineInput}
                        value={swapDeclineReason}
                        onChangeText={setSwapDeclineReason}
                        placeholder="Let your co-parent know why…"
                        placeholderTextColor={colors.textSubtle}
                        maxLength={200}
                      />
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                        <TouchableOpacity
                          style={[swapCard.btn, swapCard.btnRed]}
                          onPress={() => respondSwapRequest(req, 'declined')}
                        >
                          <Text style={swapCard.btnText}>Confirm Decline</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[swapCard.btn, swapCard.btnGhost]}
                          onPress={() => { setDecliningSwapId(null); setSwapDeclineReason('') }}
                        >
                          <Text style={swapCard.btnGhostText}>Cancel</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                      <TouchableOpacity
                        style={[swapCard.btn, swapCard.btnGreen]}
                        onPress={() => respondSwapRequest(req, 'approved')}
                      >
                        <Text style={swapCard.btnText}>Approve</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[swapCard.btn, swapCard.btnRed]}
                        onPress={() => { setDecliningSwapId(req.id); setSwapDeclineReason('') }}
                      >
                        <Text style={swapCard.btnText}>Decline</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )
            })}
          </View>
        )}

        {/* Incoming parenting schedule proposals */}
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
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, paddingHorizontal: 24 },
  scroll: { paddingHorizontal: 16, paddingTop: 4 },
  bottomPad: { height: 32 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12,
  },
  heading: { fontSize: 24, fontWeight: '700', fontFamily: font.bold, color: colors.textPrimary },
  addBtn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 7 },
  addBtnText: { color: colors.white, fontWeight: '600', fontFamily: font.semibold, fontSize: 14 },

  section: { marginBottom: 8 },
  sectionLabel: { fontSize: 11, fontWeight: '700', fontFamily: font.bold, color: colors.textSubtle, letterSpacing: 0.8, marginBottom: 8, marginTop: 4 },

  emptyBox: { paddingVertical: 60, alignItems: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '600', fontFamily: font.semibold, color: colors.textPrimary, marginBottom: 8, textAlign: 'center' },
  emptySubtitle: { fontSize: 13, fontFamily: font.regular, color: colors.textMuted, textAlign: 'center' },

  historyToggle: { paddingVertical: 10 },
  historyToggleText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
})

const card = StyleSheet.create({
  container: {
    backgroundColor: colors.surface, borderRadius: radius.md, padding: 16, marginBottom: 12,
    ...shadow.sm,
  },
  header: { marginBottom: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  name: { fontSize: 16, fontWeight: '700', fontFamily: font.bold, color: colors.textPrimary, flex: 1, marginRight: 8 },
  badge: { borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700', fontFamily: font.bold },
  meta: { fontSize: 13, fontFamily: font.regular, color: colors.textMuted, marginBottom: 2 },
  dates: { fontSize: 12, fontFamily: font.regular, color: colors.textSubtle },
  note: { fontSize: 13, fontFamily: font.regular, color: colors.textMuted, fontStyle: 'italic', marginTop: 6 },
  declineNote: { fontSize: 12, fontFamily: font.regular, color: colors.danger, marginTop: 4 },

  busyRow: { alignItems: 'center', paddingVertical: 8 },

  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  btn: { flex: 1, minWidth: 100, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center' },
  btnPrimary: { backgroundColor: colors.accent },
  btnPrimaryText: { color: colors.white, fontWeight: '600', fontFamily: font.semibold, fontSize: 14 },
  btnGreen: { backgroundColor: colors.success },
  btnRed: { backgroundColor: colors.danger },
  btnGhost: { backgroundColor: colors.surface2 },
  btnGhostText: { color: colors.textSecondary, fontWeight: '600', fontFamily: font.semibold, fontSize: 14 },

  waitingRow: { flex: 1, justifyContent: 'center' },
  waitingText: { fontSize: 13, fontFamily: font.regular, color: colors.textSubtle, fontStyle: 'italic' },

  declineForm: { marginTop: 8 },
  declineInput: {
    backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontFamily: font.regular, color: colors.textPrimary,
    marginBottom: 10, minHeight: 60,
  },
})

const swapCard = StyleSheet.create({
  container: {
    backgroundColor: colors.surface, borderRadius: radius.md, padding: 16, marginBottom: 12,
    borderLeftWidth: 3, borderLeftColor: colors.info,
    ...shadow.sm,
  },
  dateText: { fontSize: 15, fontWeight: '700', fontFamily: font.bold, color: colors.textPrimary, marginBottom: 4 },
  directionText: { fontSize: 13, fontFamily: font.regular, color: colors.textSecondary, lineHeight: 18 },
  reasonText: { fontSize: 13, fontFamily: font.regular, color: colors.textMuted, fontStyle: 'italic', marginTop: 6 },
  declineLabelText: { fontSize: 11, fontWeight: '700', fontFamily: font.bold, color: colors.textSubtle, letterSpacing: 0.8, marginBottom: 6 },
  declineInput: {
    backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontFamily: font.regular, color: colors.textPrimary,
    minHeight: 60,
  },
  btn: { flex: 1, borderRadius: radius.md, paddingVertical: 10, alignItems: 'center' },
  btnGreen: { backgroundColor: colors.success },
  btnRed:   { backgroundColor: colors.danger },
  btnGhost: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  btnText:  { color: colors.white, fontWeight: '600', fontFamily: font.semibold, fontSize: 14 },
  btnGhostText: { color: colors.textSecondary, fontWeight: '600', fontFamily: font.semibold, fontSize: 14 },
})
