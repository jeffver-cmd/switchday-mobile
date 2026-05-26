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
  Alert,
  ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { useState, useCallback } from 'react'
import { useThreads, ThreadSummary, archiveThread } from '@/lib/hooks/useThreads'
import { supabase } from '@/lib/supabase'
import { colors, radius, shadow, font, buttonLabel } from '@/lib/theme'

// ─── thread type options ──────────────────────────────────────────────────────

const THREAD_TYPES: { key: string; label: string; description: string }[] = [
  { key: 'co_parent',    label: 'Co-Parent',  description: 'Private conversation between you and your co-parent' },
  { key: 'family',       label: 'Family',     description: 'Visible to both parents and any connected children'  },
  { key: 'child_parent', label: 'Children',   description: 'Messages with your children'                         },
]

// ─── new thread modal ─────────────────────────────────────────────────────────

interface NewThreadModalProps {
  connectionId: string
  onClose: () => void
  onCreated: (threadId: string, topic: string, connectionId: string) => void
}

function NewThreadModal({ connectionId, onClose, onCreated }: NewThreadModalProps) {
  const [topic,      setTopic]      = useState('')
  const [threadType, setThreadType] = useState('co_parent')
  const [creating,   setCreating]   = useState(false)

  const handleCreate = useCallback(async () => {
    const trimmed = topic.trim()
    if (!trimmed) { Alert.alert('Name required', 'Give this conversation a name.'); return }
    setCreating(true)
    const { data: thread, error } = await supabase
      .from('message_threads')
      .insert({ connection_id: connectionId, topic: trimmed, thread_type: threadType })
      .select('id')
      .single()
    setCreating(false)
    if (error || !thread) { Alert.alert('Error', error?.message ?? 'Could not create conversation'); return }
    onCreated(thread.id, trimmed, connectionId)
  }, [topic, threadType, connectionId, onCreated])

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={nm.container}>
        {/* Header */}
        <View style={nm.header}>
          <TouchableOpacity onPress={onClose} disabled={creating} style={nm.headerBtn}>
            <Text style={[nm.cancel, creating && { opacity: 0.4 }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={nm.title}>New Conversation</Text>
          <TouchableOpacity
            onPress={handleCreate}
            disabled={creating || !topic.trim()}
            style={nm.headerBtn}
          >
            {creating
              ? <ActivityIndicator size="small" color={colors.accent} />
              : <Text style={[nm.create, !topic.trim() && { opacity: 0.4 }]}>Create</Text>}
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={nm.form}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Topic */}
            <Text style={nm.label}>CONVERSATION NAME</Text>
            <TextInput
              style={nm.input}
              value={topic}
              onChangeText={setTopic}
              placeholder="e.g. Summer schedule, Medical info…"
              placeholderTextColor={colors.textSubtle as string}
              maxLength={80}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleCreate}
            />

            {/* Type */}
            <Text style={[nm.label, { marginTop: 24 }]}>TYPE</Text>
            {THREAD_TYPES.map(t => (
              <TouchableOpacity
                key={t.key}
                style={[nm.typeRow, threadType === t.key && nm.typeRowActive]}
                onPress={() => setThreadType(t.key)}
                activeOpacity={0.7}
              >
                <View style={[nm.typeRadio, threadType === t.key && nm.typeRadioActive]}>
                  {threadType === t.key && <View style={nm.typeRadioDot} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[nm.typeLabel, threadType === t.key && nm.typeLabelActive]}>
                    {t.label}
                  </Text>
                  <Text style={nm.typeDesc}>{t.description}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  )
}

// ─── types ───────────────────────────────────────────────────────────────────

type TabKey = 'co_parent' | 'family' | 'child_parent'

const TABS: { key: TabKey; label: string }[] = [
  { key: 'co_parent',    label: 'Co-Parent' },
  { key: 'family',       label: 'Family'    },
  { key: 'child_parent', label: 'Children'  },
]

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

// ─── thread row ──────────────────────────────────────────────────────────────

interface ThreadRowProps {
  item: ThreadSummary
  onPress: () => void
  onLongPress?: () => void
}

function ThreadRow({ item, onPress, onLongPress }: ThreadRowProps) {
  const hasUnread = item.unreadCount > 0
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} onLongPress={onLongPress} activeOpacity={0.7} delayLongPress={400}>
      {/* Avatar */}
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
      </View>
    </TouchableOpacity>
  )
}

// ─── screen ──────────────────────────────────────────────────────────────────

export default function MessagesScreen() {
  const router = useRouter()
  const { data, loading, error, refresh } = useThreads()
  const [activeTab,  setActiveTab]  = useState<TabKey>('co_parent')
  const [showNew,    setShowNew]    = useState(false)

  const handleCreated = useCallback((threadId: string, topic: string, connectionId: string) => {
    setShowNew(false)
    refresh()
    router.push(`/messages/${threadId}?connectionId=${connectionId}&topic=${encodeURIComponent(topic)}` as never)
  }, [refresh, router])

  const handleArchive = useCallback((item: ThreadSummary) => {
    Alert.alert(
      'Archive conversation?',
      `"${item.topic}" will be hidden from your inbox. You can find it in archived conversations.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
          onPress: async () => {
            const { error } = await archiveThread(item.id)
            if (error) Alert.alert('Error', error)
            else refresh()
          },
        },
      ]
    )
  }, [refresh])

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

  const filteredThreads = (data?.threads ?? []).filter(t => t.threadType === activeTab)

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.heading}>Messages</Text>
        {data && (
          <TouchableOpacity
            style={styles.newBtn}
            onPress={() => setShowNew(true)}
          >
            <Text style={styles.newBtnText}>+ New</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* New thread modal */}
      {showNew && data?.connectionId && (
        <NewThreadModal
          connectionId={data.connectionId}
          onClose={() => setShowNew(false)}
          onCreated={handleCreated}
        />
      )}

      {/* Filter tabs */}
      <View style={styles.tabBar}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filteredThreads}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.accent} />}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => (
          <ThreadRow
            item={item}
            onPress={() => router.push(`/messages/${item.id}?connectionId=${item.connectionId}&topic=${encodeURIComponent(item.topic)}`)}
            onLongPress={() => handleArchive(item)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>No conversations yet</Text>
            <Text style={styles.emptySubtitle}>
              {activeTab === 'co_parent'   ? 'Messages with your co-parent will appear here.' :
               activeTab === 'family'      ? 'Family group messages will appear here.' :
                                            'Messages with your children will appear here.'}
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  )
}

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, paddingHorizontal: 24 },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  heading: { fontSize: 24, fontWeight: '700', fontFamily: font.bold, color: colors.textPrimary },
  newBtn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 7 },
  newBtnText: { ...buttonLabel, color: colors.white },

  // Tab bar
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  tabText: {
    fontSize: 13,
    fontFamily: font.medium,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.white,
  },

  list: { flexGrow: 1 },
  separator: { height: 1, backgroundColor: colors.borderHair, marginLeft: 76 },

  // Thread row
  row: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', backgroundColor: colors.surface },
  avatarWrap: { marginRight: 12 },
  avatar: {
    width: 48, height: 48, borderRadius: radius.md,
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

  rowBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  preview: { fontSize: 13, fontFamily: font.regular, color: colors.textSubtle, flex: 1, marginRight: 8 },
  previewBold: { color: colors.textSecondary, fontWeight: '500', fontFamily: font.medium },

  badge: {
    backgroundColor: colors.accent, borderRadius: radius.full,
    minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  badgeText: { fontSize: 11, fontWeight: '700', fontFamily: font.bold, color: colors.white },

  // Empty
  emptyBox: { paddingVertical: 60, alignItems: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '600', fontFamily: font.semibold, color: colors.textPrimary, marginBottom: 8, textAlign: 'center' },
  emptySubtitle: { fontSize: 13, fontFamily: font.regular, color: colors.textMuted, textAlign: 'center' },
})

// ─── new thread modal styles ──────────────────────────────────────────────────

const nm = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: colors.borderHair,
  },
  headerBtn: { width: 72 },
  cancel:  { fontSize: 16, fontFamily: font.regular, color: colors.textMuted },
  title:   { fontSize: 17, fontWeight: '600', fontFamily: font.semibold, color: colors.textPrimary },
  create:  { fontSize: 16, fontWeight: '600', fontFamily: font.semibold, color: colors.accent, textAlign: 'right' },

  form:  { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 60 },
  label: { fontSize: 11, fontWeight: '700', fontFamily: font.bold, color: colors.textSubtle, letterSpacing: 0.8, marginBottom: 8 },

  input: {
    backgroundColor: colors.surface2, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontFamily: font.regular, color: colors.textPrimary,
  },

  typeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 14, borderRadius: radius.md, borderWidth: 1,
    borderColor: colors.border, backgroundColor: colors.surface2,
    marginBottom: 10,
  },
  typeRowActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },

  typeRadio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  typeRadioActive: { borderColor: colors.accent },
  typeRadioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },

  typeLabel: { fontSize: 14, fontWeight: '600', fontFamily: font.semibold, color: colors.textPrimary, marginBottom: 2 },
  typeLabelActive: { color: colors.accent },
  typeDesc:  { fontSize: 12, fontFamily: font.regular, color: colors.textMuted },
})
