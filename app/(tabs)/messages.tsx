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
          <Text style={styles.avatarText}>
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
        <ActivityIndicator size="large" color="#374151" />
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
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
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
  container: { flex: 1, backgroundColor: '#ffffff' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ffffff', paddingHorizontal: 24 },

  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  heading: { fontSize: 24, fontWeight: '700', color: '#111827' },

  list: { flexGrow: 1 },
  separator: { height: 1, backgroundColor: '#f3f4f6', marginLeft: 76 },

  // Thread row
  row: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center' },
  avatarWrap: { marginRight: 12 },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#e5e7eb',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarUnread: { backgroundColor: '#1f2937' },
  avatarText: { fontSize: 18, fontWeight: '700', color: '#374151' },

  rowContent: { flex: 1 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 },
  topic: { fontSize: 15, fontWeight: '500', color: '#1f2937', flex: 1, marginRight: 8 },
  topicBold: { fontWeight: '700' },
  time: { fontSize: 12, color: '#9ca3af' },

  rowBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  preview: { fontSize: 13, color: '#9ca3af', flex: 1, marginRight: 8 },
  previewBold: { color: '#374151', fontWeight: '500' },

  badge: {
    backgroundColor: '#1f2937', borderRadius: 10,
    minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: '#ffffff' },

  typeLabel: { fontSize: 11, color: '#d1d5db', marginTop: 1 },

  // Empty
  emptyBox: { paddingVertical: 60, alignItems: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#111827', marginBottom: 8, textAlign: 'center' },
  emptySubtitle: { fontSize: 13, color: '#6b7280', textAlign: 'center' },
})
