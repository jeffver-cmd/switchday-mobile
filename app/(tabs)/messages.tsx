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
import { useRouter } from 'expo-router'
import { useThreads, ThreadSummary } from '@/lib/hooks/useThreads'
import { colors, radius, font } from '@/lib/theme'

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays === 0) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'short' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function threadTypeLabel(type: string): string {
  switch (type) {
    case 'co_parent':    return 'Co-parent'
    case 'family':       return 'Family'
    case 'child_parent': return 'With child'
    default:             return type
  }
}

// ─── thread row ──────────────────────────────────────────────────────────────

interface ThreadRowProps {
  item: ThreadSummary
  onPress: () => void
}

function ThreadRow({ item, onPress }: ThreadRowProps) {
  const hasUnread = item.unreadCount > 0
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      {/* Avatar / type icon */}
      <View style={styles.avatarWrap}>
        <View style={[styles.avatar, hasUnread && styles.avatarUnread]}>
          <Text style={[styles.avatarText, hasUnread && styles.avatarTextUnread]}>
            {item.topic.charAt(0).toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Content */}
      <View style={styles.rowContent}>
        <View style={styles.rowTop}>
          <Text style={[styles.topic, hasUnread && styles.topicBold]} numberOfLines={1}>
            {item.topic}
          </Text>
          <Text style={styles.time}>{formatTime(item.lastMessageAt)}</Text>
        </View>
        <View style={styles.rowBottom}>
          <Text style={[styles.preview, hasUnread && styles.previewBold]} numberOfLines={1}>
            {item.lastMessageBody ?? 'No messages yet'}
          </Text>
          {hasUnread && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{item.unreadCount}</Text>
            </View>
          )}
        </View>
        <Text style={styles.typeLabel}>{threadTypeLabel(item.threadType)}</Text>
      </View>
    </TouchableOpacity>
  )
}

// ─── screen ──────────────────────────────────────────────────────────────────

export default function MessagesScreen() {
  const router = useRouter()
  const { data, loading, error, refresh } = useThreads()

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
        <Text style={styles.emptySubtitle}>Connect with your co-parent to start messaging.</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.heading}>Messages</Text>
      </View>

      <FlatList
        data={data?.threads ?? []}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.accent} />}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <ThreadRow
            item={item}
            onPress={() => router.push(`/messages/${item.id}?connectionId=${item.connectionId}&topic=${encodeURIComponent(item.topic)}`)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No conversations yet</Text>
            <Text style={styles.emptySubtitle}>Messages with your co-parent will appear here.</Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  )
}

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, paddingHorizontal: 24 },

  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.borderHair },
  heading: { fontSize: 24, fontWeight: '700', fontFamily: font.bold, color: colors.textPrimary },

  list: { flexGrow: 1 },
  separator: { height: 1, backgroundColor: colors.borderHair, marginLeft: 76 },

  // Thread row
  row: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center' },
  avatarWrap: { marginRight: 12 },
  avatar: {
    width: 48, height: 48, borderRadius: radius.full,
    backgroundColor: colors.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarUnread: { backgroundColor: colors.accent },
  avatarText: { fontSize: 18, fontWeight: '700', fontFamily: font.bold, color: colors.textSecondary },
  avatarTextUnread: { color: colors.white },

  rowContent: { flex: 1 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 },
  topic: { fontSize: 15, fontWeight: '500', fontFamily: font.medium, color: colors.textPrimary, flex: 1, marginRight: 8 },
  topicBold: { fontWeight: '700', fontFamily: font.bold },
  time: { fontSize: 12, fontFamily: font.regular, color: colors.textSubtle },

  rowBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  preview: { fontSize: 13, fontFamily: font.regular, color: colors.textSubtle, flex: 1, marginRight: 8 },
  previewBold: { color: colors.textSecondary, fontWeight: '500', fontFamily: font.medium },

  badge: {
    backgroundColor: colors.accent, borderRadius: radius.full,
    minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  badgeText: { fontSize: 11, fontWeight: '700', fontFamily: font.bold, color: colors.white },

  typeLabel: { fontSize: 11, fontFamily: font.regular, color: colors.textSubtle, marginTop: 1 },

  // Empty
  emptyBox: { paddingVertical: 60, alignItems: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '600', fontFamily: font.semibold, color: colors.textPrimary, marginBottom: 8, textAlign: 'center' },
  emptySubtitle: { fontSize: 13, fontFamily: font.regular, color: colors.textMuted, textAlign: 'center' },
})
