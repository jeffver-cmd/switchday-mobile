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
import { useDashboard } from '@/lib/hooks/useDashboard'

// ─── date helpers ────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().split('T')[0]
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

function daysUntil(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  const diff = Math.round((d.getTime() - Date.now()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  return `In ${diff} days`
}

// ─── screen ──────────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const router = useRouter()
  const { data, loading, error, refresh } = useDashboard()

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

  const { myProfile, coParentProfile, todayOwnerId, isSwitch, nextSwitch,
          unreadCount, pendingExpenses, pendingExpenseCount, upcomingEvents } = data

  const todayOwner = todayOwnerId === myProfile.id ? myProfile : coParentProfile
  const ownerColor = todayOwner?.color ?? '#6b7280'
  const isMyDay = todayOwnerId === myProfile.id
  const hasAttention = unreadCount > 0 || pendingExpenseCount > 0

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerDate}>{formatHeaderDate()}</Text>
          <View style={[styles.avatar, { backgroundColor: myProfile.color }]}>
            <Text style={styles.avatarText}>{myProfile.initials}</Text>
          </View>
        </View>

        {/* Custody card */}
        <View style={[styles.custodyCard, { backgroundColor: ownerColor }]}>
          {isSwitch && (
            <View style={styles.switchBadge}>
              <Text style={styles.switchBadgeText}>SWITCH DAY</Text>
            </View>
          )}
          <Text style={styles.custodyLabel}>
            {isMyDay ? 'Your day' : `${todayOwner?.display_name ?? 'Co-parent'}'s day`}
          </Text>
          <Text style={styles.custodyInitials}>{todayOwner?.initials ?? '?'}</Text>
          {coParentProfile && (
            <Text style={styles.custodySubLabel}>
              {isMyDay
                ? `${coParentProfile.display_name} has the kids next`
                : `You have the kids next`}
            </Text>
          )}
        </View>

        {/* Next switch */}
        {nextSwitch && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>NEXT SWITCH</Text>
            <Text style={styles.switchDateText}>{formatSwitchDate(nextSwitch.date)}</Text>
            <Text style={styles.switchCountdown}>{daysUntil(nextSwitch.date)}</Text>
            {nextSwitch.time && (
              <Text style={styles.switchDetail}>🕐 {formatTime(nextSwitch.time)}</Text>
            )}
            {nextSwitch.location && (
              <Text style={styles.switchDetail}>📍 {nextSwitch.location}</Text>
            )}
            {!nextSwitch.time && !nextSwitch.location && (
              <Text style={styles.switchDetailMuted}>No time or location set</Text>
            )}
          </View>
        )}

        {/* Needs attention */}
        {hasAttention && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>NEEDS ATTENTION</Text>
            {unreadCount > 0 && (
              <TouchableOpacity style={styles.attentionRow} onPress={() => router.push('/(tabs)/messages')}>
                <View style={[styles.attentionDot, { backgroundColor: '#3b82f6' }]} />
                <Text style={styles.attentionText}>
                  {unreadCount} unread {unreadCount === 1 ? 'message' : 'messages'}
                </Text>
                <Text style={styles.attentionChevron}>›</Text>
              </TouchableOpacity>
            )}
            {pendingExpenses.map(exp => (
              <TouchableOpacity
                key={exp.id}
                style={styles.attentionRow}
                onPress={() => router.push('/(tabs)/expenses')}
              >
                <View style={[styles.attentionDot, { backgroundColor: '#f59e0b' }]} />
                <Text style={styles.attentionText} numberOfLines={1}>
                  ${exp.amount.toFixed(2)} · {exp.description}
                </Text>
                <Text style={styles.attentionChevron}>›</Text>
              </TouchableOpacity>
            ))}
            {pendingExpenseCount > pendingExpenses.length && (
              <TouchableOpacity onPress={() => router.push('/(tabs)/expenses')}>
                <Text style={styles.seeAllText}>
                  +{pendingExpenseCount - pendingExpenses.length} more expenses
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Upcoming events */}
        {upcomingEvents.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardLabel}>COMING UP</Text>
            {upcomingEvents.map(event => (
              <View key={event.id} style={styles.eventRow}>
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
        )}

        {/* All clear state */}
        {!hasAttention && upcomingEvents.length === 0 && (
          <View style={styles.allClearCard}>
            <Text style={styles.allClearTitle}>All clear</Text>
            <Text style={styles.allClearSubtitle}>No messages, expenses, or events this week.</Text>
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
  scroll: { paddingHorizontal: 16, paddingTop: 8 },
  bottomPad: { height: 32 },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  headerDate: { fontSize: 15, fontWeight: '600', color: '#374151' },
  avatar: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 13, fontWeight: '700', color: '#ffffff' },

  // Custody card
  custodyCard: {
    borderRadius: 20, padding: 24, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 3,
  },
  switchBadge: {
    alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 12,
  },
  switchBadgeText: { fontSize: 10, fontWeight: '700', color: '#ffffff', letterSpacing: 1 },
  custodyLabel: { fontSize: 15, fontWeight: '600', color: 'rgba(255,255,255,0.85)', marginBottom: 4 },
  custodyInitials: { fontSize: 56, fontWeight: '800', color: '#ffffff', marginVertical: 4 },
  custodySubLabel: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 4 },

  // Generic card
  card: {
    backgroundColor: '#ffffff', borderRadius: 16, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1,
  },
  cardLabel: { fontSize: 11, fontWeight: '700', color: '#9ca3af', letterSpacing: 0.8, marginBottom: 10 },

  // Next switch
  switchDateText: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 2 },
  switchCountdown: { fontSize: 13, color: '#6b7280', marginBottom: 10 },
  switchDetail: { fontSize: 14, color: '#374151', marginTop: 4 },
  switchDetailMuted: { fontSize: 13, color: '#9ca3af', marginTop: 2, fontStyle: 'italic' },

  // Attention
  attentionRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  attentionDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  attentionText: { flex: 1, fontSize: 14, color: '#1f2937' },
  attentionChevron: { fontSize: 18, color: '#d1d5db', marginLeft: 8 },
  seeAllText: { fontSize: 13, color: '#6b7280', marginTop: 8, textAlign: 'center' },

  // Events
  eventRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', gap: 12 },
  eventDate: { fontSize: 12, fontWeight: '600', color: '#9ca3af', width: 84, paddingTop: 1 },
  eventInfo: { flex: 1 },
  eventTitle: { fontSize: 14, fontWeight: '500', color: '#1f2937' },
  eventTime: { fontSize: 12, color: '#6b7280', marginTop: 2 },

  // All clear
  allClearCard: {
    backgroundColor: '#ffffff', borderRadius: 16, padding: 24,
    alignItems: 'center', marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1,
  },
  allClearTitle: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 4 },
  allClearSubtitle: { fontSize: 13, color: '#9ca3af', textAlign: 'center' },

  // Empty / error
  emptyTitle: { fontSize: 18, fontWeight: '600', color: '#111827', marginBottom: 8, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, color: '#6b7280', textAlign: 'center' },
  retryBtn: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#1f2937', borderRadius: 10 },
  retryText: { color: '#ffffff', fontWeight: '600', fontSize: 14 },
})
