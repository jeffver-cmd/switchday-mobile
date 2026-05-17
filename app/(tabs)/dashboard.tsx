import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import { useState, useEffect } from 'react'
import * as SecureStore from 'expo-secure-store'
import { useDashboard } from '@/lib/hooks/useDashboard'
import { colors, radius, shadow, font } from '@/lib/theme'
import SwitchDayCelebration from '@/components/SwitchDayCelebration'

// ─── helpers ─────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function greeting(displayName: string): string {
  const firstName = displayName.split(' ')[0]
  const h = new Date().getHours()
  if (h < 12) return `Good morning, ${firstName}`
  if (h < 17) return `Good afternoon, ${firstName}`
  return `Good evening, ${firstName}`
}

function formatHeaderDate() {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}

function formatSwitchDate(dateStr: string): string {
  const today = todayStr()
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
  if (dateStr === today) return 'Today'
  if (dateStr === tomorrow) return 'Tomorrow'
  const d = new Date(dateStr + 'T12:00:00')
  const diff = Math.round((d.getTime() - Date.now()) / 86400000)
  if (diff < 7) return d.toLocaleDateString('en-US', { weekday: 'long' })
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 || 12
  return `${hour}:${String(m).padStart(2, '0')} ${ampm}`
}

function formatEventDate(dateStr: string): string {
  const today = todayStr()
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0]
  if (dateStr === today) return 'Today'
  if (dateStr === tomorrow) return 'Tomorrow'
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function formatChildrenNames(names: string[]): string {
  if (names.length === 0) return 'the kids'
  if (names.length === 1) return names[0]
  if (names.length === 2) return `${names[0]} & ${names[1]}`
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`
}

function formatThreadTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  if (d.toDateString() === today.toDateString()) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  }
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  // Same week
  const diffDays = Math.round((today.getTime() - d.getTime()) / 86400000)
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'short' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function expenseStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
    case 'requested': return 'Pending'
    case 'approved':  return 'Approved'
    case 'paid':      return 'Paid'
    case 'disputed':  return 'Disputed'
    case 'declined':  return 'Declined'
    default:          return status
  }
}

function expenseStatusColor(status: string): string {
  switch (status) {
    case 'pending':
    case 'requested': return colors.warning
    case 'approved':  return colors.success
    case 'paid':      return colors.textSubtle
    case 'disputed':
    case 'declined':  return colors.danger
    default:          return colors.textSubtle
  }
}

function expenseStatusBg(status: string): string {
  switch (status) {
    case 'pending':
    case 'requested': return colors.warningSoft
    case 'approved':  return colors.successSoft
    case 'paid':      return 'rgba(26,26,24,0.07)'
    case 'disputed':
    case 'declined':  return colors.dangerSoft
    default:          return 'rgba(26,26,24,0.07)'
  }
}

// ─── sub-components ──────────────────────────────────────────────────────────

function SectionHeader({ title, onViewAll }: { title: string; onViewAll?: () => void }) {
  return (
    <View style={sectionStyles.header}>
      <View style={sectionStyles.accentBar} />
      <Text style={sectionStyles.title}>{title}</Text>
      {onViewAll && (
        <TouchableOpacity onPress={onViewAll} style={sectionStyles.viewAllBtn}>
          <Text style={sectionStyles.viewAllText}>View all</Text>
          <Ionicons name="chevron-forward" size={13} color={colors.accent2} />
        </TouchableOpacity>
      )}
    </View>
  )
}

const sectionStyles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: 4,
  },
  accentBar: {
    width: 3,
    height: 16,
    borderRadius: 2,
    backgroundColor: colors.accent2,
    marginRight: 8,
  },
  title: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    fontFamily: font.bold,
    color: colors.textSecondary,
    letterSpacing: 0.3,
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewAllText: {
    fontSize: 13,
    fontFamily: font.medium,
    color: colors.accent2,
  },
})

// ─── screen ──────────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const router = useRouter()
  const { data, loading, error, refresh } = useDashboard()

  // ── Switch day celebration ─────────────────────────────────────────────
  const [showCelebration, setShowCelebration] = useState(false)

  useEffect(() => {
    if (!data?.isSwitch) return
    const today = new Date().toISOString().split('T')[0]
    SecureStore.getItemAsync(`switchday:celebration:${today}`)
      .then(seen => { if (!seen) setShowCelebration(true) })
      .catch(() => { setShowCelebration(true) })
  }, [data?.isSwitch])

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
        <Text style={styles.emptySubtitle}>Connect with your co-parent to get started.</Text>
      </SafeAreaView>
    )
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.emptyTitle}>Something went wrong</Text>
        <TouchableOpacity onPress={refresh} style={styles.retryBtn}>
          <Text style={styles.retryText}>Try again</Text>
        </TouchableOpacity>
      </SafeAreaView>
    )
  }

  const {
    myProfile, coParentProfile, todayOwnerId, isSwitch, nextSwitch,
    unreadCount, pendingExpenseCount, upcomingEvents,
    recentThreads, recentExpenses, checklistItems, childrenNames,
  } = data

  const todayOwner = todayOwnerId === myProfile.id ? myProfile : coParentProfile
  const ownerColor = todayOwner?.color ?? '#6b7280'
  const isMyDay = todayOwnerId === myProfile.id

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.accent} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greetingText}>{greeting(myProfile.display_name)}</Text>
            <Text style={styles.headerDate}>{formatHeaderDate()}</Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/settings')} style={styles.gearBtn}>
            <Ionicons name="settings-outline" size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* ── Custody card ───────────────────────────────────────────────── */}
        <View style={[styles.custodyCard, { backgroundColor: colors.surface }]}>
          {/* Subtle owner-colour tint overlay */}
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: ownerColor, opacity: 0.08, borderRadius: radius.xl }]} />

          {/* Wide accent bar with initials */}
          <View style={[styles.custodyAccentBar, { backgroundColor: ownerColor }]}>
            <Text style={styles.custodyBarInitials}>{todayOwner?.initials ?? '?'}</Text>
          </View>

          {/* Content */}
          <View style={styles.custodyContent}>
            {isSwitch && (
              <View style={styles.switchBadge}>
                <Text style={styles.switchBadgeText}>SWITCH DAY</Text>
              </View>
            )}
            <Text style={styles.custodyLabel}>
              {isMyDay ? 'Your day' : `${todayOwner?.display_name ?? 'Co-parent'}'s day`}
            </Text>
            {childrenNames.length > 0 && (
              <Text style={styles.custodySubLabel}>
                {isMyDay
                  ? `You have ${formatChildrenNames(childrenNames)} today`
                  : `${todayOwner?.display_name ?? 'Co-parent'} has ${formatChildrenNames(childrenNames)} today`}
              </Text>
            )}

            {/* Next switch — folded into card bottom */}
            {nextSwitch && (
              <>
                <View style={styles.custodyDivider} />
                <View style={styles.custodyNextSwitch}>
                  <Ionicons name="swap-horizontal-outline" size={13} color={colors.textSubtle} />
                  <Text style={styles.custodyNextSwitchText}>
                    {'  Next switch · '}
                    <Text style={styles.custodyNextSwitchBold}>{formatSwitchDate(nextSwitch.date)}</Text>
                    {nextSwitch.time ? `  ·  ${formatTime(nextSwitch.time)}` : ''}
                  </Text>
                </View>
              </>
            )}
          </View>
        </View>

        {/* ── Stats row ──────────────────────────────────────────────────── */}
        <View style={styles.statsRow}>
          <TouchableOpacity
            style={styles.statCard}
            activeOpacity={0.75}
            onPress={() => router.push('/(tabs)/messages')}
          >
            <View style={styles.statIconRow}>
              <Ionicons name="chatbubble-outline" size={16} color={colors.accent2} />
              <Text style={styles.statLabel}>UNREAD</Text>
            </View>
            <Text style={styles.statCount}>{unreadCount}</Text>
            <Text style={styles.statSub}>
              {unreadCount === 0 ? 'All caught up' : `${unreadCount} unread ${unreadCount === 1 ? 'message' : 'messages'}`}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.statCard}
            activeOpacity={0.75}
            onPress={() => router.push('/(tabs)/expenses')}
          >
            <View style={styles.statIconRow}>
              <Ionicons name="receipt-outline" size={16} color={colors.accent2} />
              <Text style={styles.statLabel}>PENDING</Text>
            </View>
            <Text style={styles.statCount}>{pendingExpenseCount}</Text>
            <Text style={styles.statSub}>
              {pendingExpenseCount === 0 ? 'None pending' : `${pendingExpenseCount} pending review`}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Recent Messages ────────────────────────────────────────────── */}
        {recentThreads.length > 0 && (
          <View style={styles.section}>
            <SectionHeader
              title="Recent Messages"
              onViewAll={() => router.push('/(tabs)/messages')}
            />
            <View style={styles.card}>
              {recentThreads.map((thread, idx) => (
                <TouchableOpacity
                  key={thread.id}
                  style={[
                    styles.threadRow,
                    idx < recentThreads.length - 1 && styles.rowDivider,
                  ]}
                  activeOpacity={0.7}
                  onPress={() => router.push(`/messages/${thread.id}` as any)}
                >
                  <View style={styles.threadMain}>
                    <View style={styles.threadTopRow}>
                      {thread.unreadCount > 0 && <View style={styles.unreadDot} />}
                      <Text
                        style={[styles.threadTopic, thread.unreadCount > 0 && styles.threadTopicUnread]}
                        numberOfLines={1}
                      >
                        {thread.topic}
                      </Text>
                      <Text style={styles.threadTime}>{formatThreadTime(thread.lastMessageAt)}</Text>
                    </View>
                    {thread.lastMessageBody && (
                      <Text style={styles.threadPreview} numberOfLines={1}>
                        {thread.lastMessageBody}
                      </Text>
                    )}
                  </View>
                  <Ionicons name="chevron-forward" size={14} color={colors.textSubtle} style={styles.threadChevron} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── Recent Expenses ────────────────────────────────────────────── */}
        {recentExpenses.length > 0 && (
          <View style={styles.section}>
            <SectionHeader
              title="Recent Expenses"
              onViewAll={() => router.push('/(tabs)/expenses')}
            />
            <View style={styles.card}>
              {recentExpenses.map((exp, idx) => (
                <TouchableOpacity
                  key={exp.id}
                  style={[
                    styles.expenseRow,
                    idx < recentExpenses.length - 1 && styles.rowDivider,
                  ]}
                  activeOpacity={0.7}
                  onPress={() => router.push('/(tabs)/expenses')}
                >
                  <Text style={styles.expenseDesc} numberOfLines={1}>{exp.description}</Text>
                  <View style={styles.expenseRight}>
                    <Text style={styles.expenseAmount}>${exp.amount.toFixed(2)}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: expenseStatusBg(exp.status) }]}>
                      <Text style={[styles.statusBadgeText, { color: expenseStatusColor(exp.status) }]}>
                        {expenseStatusLabel(exp.status)}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── Coming Up ──────────────────────────────────────────────────── */}
        {upcomingEvents.length > 0 && (
          <View style={styles.section}>
            <SectionHeader
              title="Coming Up"
              onViewAll={() => router.push('/(tabs)/calendar')}
            />
            <View style={styles.card}>
              {upcomingEvents.map((event, idx) => (
                <View
                  key={event.id}
                  style={[styles.eventRow, idx < upcomingEvents.length - 1 && styles.rowDivider]}
                >
                  <Text style={styles.eventDate}>{formatEventDate(event.start_date)}</Text>
                  <View style={styles.eventInfo}>
                    <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
                    {!event.all_day && event.start_time && (
                      <Text style={styles.eventTime}>{formatTime(event.start_time)}</Text>
                    )}
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── All clear ──────────────────────────────────────────────────── */}
        {recentThreads.length === 0 && recentExpenses.length === 0 && upcomingEvents.length === 0 && (
          <View style={styles.allClearCard}>
            <Ionicons name="checkmark-circle-outline" size={32} color={colors.success} style={{ marginBottom: 8 }} />
            <Text style={styles.allClearTitle}>All clear</Text>
            <Text style={styles.allClearSubtitle}>No messages, expenses, or events yet.</Text>
          </View>
        )}

        <View style={styles.bottomPad} />
      </ScrollView>

      {/* Switch day celebration — shown once per switch day */}
      {showCelebration && (
        <SwitchDayCelebration
          switchDate={new Date().toISOString().split('T')[0]}
          checklistItems={checklistItems}
          onDismiss={() => setShowCelebration(false)}
        />
      )}
    </SafeAreaView>
  )
}

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, paddingHorizontal: 24 },
  scroll: { paddingHorizontal: 16, paddingTop: 8 },
  bottomPad: { height: 32 },

  // ── Header
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 },
  greetingText: { fontSize: 22, fontWeight: '700', fontFamily: font.bold, color: colors.textPrimary, marginBottom: 2 },
  headerDate: { fontSize: 13, fontFamily: font.regular, color: colors.textMuted },
  gearBtn: { padding: 4, marginTop: 2 },

  // ── Custody card
  custodyCard: {
    flexDirection: 'row',
    borderRadius: radius.xl,
    marginBottom: 12,
    overflow: 'hidden',
    ...shadow.md,
  },
  custodyAccentBar: {
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  custodyBarInitials: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: font.bold,
    color: 'rgba(255,255,255,0.90)',
    letterSpacing: 0.5,
  },
  custodyContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  switchBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accent2Soft,
    borderRadius: radius.sm,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginBottom: 5,
  },
  switchBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: font.bold,
    color: colors.accent2,
    letterSpacing: 0.8,
  },
  custodyLabel: {
    fontSize: 17,
    fontWeight: '600',
    fontFamily: font.semibold,
    color: colors.textPrimary,
    marginBottom: 3,
  },
  custodySubLabel: {
    fontSize: 13,
    fontFamily: font.regular,
    color: colors.textMuted,
    lineHeight: 18,
  },
  custodyDivider: {
    height: 1,
    backgroundColor: colors.borderHair,
    marginTop: 14,
    marginBottom: 12,
  },
  custodyNextSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  custodyNextSwitchText: {
    fontSize: 12,
    fontFamily: font.regular,
    color: colors.textMuted,
  },
  custodyNextSwitchBold: {
    fontFamily: font.semibold,
    color: colors.textSecondary,
  },

  // ── Stats row
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 14,
    ...shadow.sm,
  },
  statIconRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  statLabel: { fontSize: 10, fontWeight: '700', fontFamily: font.bold, color: colors.textSubtle, letterSpacing: 0.8 },
  statCount: { fontSize: 28, fontWeight: '700', fontFamily: font.bold, color: colors.textPrimary, lineHeight: 32, marginBottom: 3 },
  statSub: { fontSize: 11, fontFamily: font.regular, color: colors.textMuted, lineHeight: 14 },

  // ── Sections
  section: { marginBottom: 16 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    ...shadow.sm,
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderHair,
  },

  // ── Thread rows
  threadRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  threadMain: { flex: 1 },
  threadTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 3 },
  unreadDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent2, marginRight: 6 },
  threadTopic: { flex: 1, fontSize: 14, fontFamily: font.medium, color: colors.textPrimary },
  threadTopicUnread: { fontFamily: font.semibold },
  threadTime: { fontSize: 11, fontFamily: font.regular, color: colors.textSubtle, marginLeft: 8 },
  threadPreview: { fontSize: 12, fontFamily: font.regular, color: colors.textMuted, lineHeight: 17 },
  threadChevron: { marginLeft: 6 },

  // ── Expense rows
  expenseRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  expenseDesc: { flex: 1, fontSize: 14, fontFamily: font.medium, color: colors.textPrimary, marginRight: 12 },
  expenseRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  expenseAmount: { fontSize: 14, fontWeight: '600', fontFamily: font.semibold, color: colors.textPrimary },
  statusBadge: { borderRadius: radius.sm, paddingHorizontal: 7, paddingVertical: 3 },
  statusBadgeText: { fontSize: 11, fontWeight: '600', fontFamily: font.semibold },

  // ── Event rows
  eventRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, gap: 12 },
  eventDate: { fontSize: 12, fontWeight: '600', fontFamily: font.semibold, color: colors.textSubtle, width: 84, paddingTop: 1 },
  eventInfo: { flex: 1 },
  eventTitle: { fontSize: 14, fontWeight: '500', fontFamily: font.medium, color: colors.textPrimary },
  eventTime: { fontSize: 12, fontFamily: font.regular, color: colors.textMuted, marginTop: 2 },

  // ── All clear
  allClearCard: {
    backgroundColor: colors.surface, borderRadius: radius.md, padding: 32,
    alignItems: 'center', marginBottom: 12,
    ...shadow.sm,
  },
  allClearTitle: { fontSize: 16, fontWeight: '600', fontFamily: font.semibold, color: colors.textPrimary, marginBottom: 4 },
  allClearSubtitle: { fontSize: 13, fontFamily: font.regular, color: colors.textSubtle, textAlign: 'center' },

  // ── Empty / error
  emptyTitle: { fontSize: 18, fontWeight: '600', fontFamily: font.semibold, color: colors.textPrimary, marginBottom: 8, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, fontFamily: font.regular, color: colors.textMuted, textAlign: 'center' },
  retryBtn: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: colors.accent, borderRadius: radius.md },
  retryText: { color: colors.white, fontWeight: '600', fontFamily: font.semibold, fontSize: 14 },
})
