import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native'
import { font, radius } from '@/lib/theme'
import { useProPortal, ProMessage, ProThread } from '@/lib/context/ProPortalContext'
import ToneBadge from './ToneBadge'
import HashBadge from './HashBadge'

const NAVY  = '#0F1B35'
const NAVY2 = '#1A2B47'
const AMBER = '#F59E0B'
const WHITE = '#FFFFFF'

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const d = Math.floor(diff / 86_400_000)
  if (d === 0) return 'Today'
  if (d === 1) return 'Yesterday'
  if (d < 30)  return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const FLAG_LABELS: Record<string, string> = {
  legal_threat:      'Legal threat',
  child_alienation:  'Child alienation',
  profanity:         'Profanity',
  financial_dispute: 'Financial dispute',
  custody_violation: 'Custody violation',
}

// ─── message item ─────────────────────────────────────────────────────────────

interface MessageItemProps {
  message: ProMessage
  senderName: string
  senderColor: string
}

function MessageItem({ message, senderName, senderColor }: MessageItemProps) {
  return (
    <View style={styles.msgCard}>
      <View style={styles.msgHeader}>
        <View style={[styles.senderDot, { backgroundColor: senderColor }]} />
        <Text style={styles.senderName}>{senderName}</Text>
        <Text style={styles.msgTime}>{formatRelative(message.sent_at)}</Text>
      </View>
      <Text style={styles.msgBody}>{message.body}</Text>
      <View style={styles.msgBadges}>
        <ToneBadge score={message.tone_score} />
        {(message.tone_flags ?? []).map(flag => (
          <View key={flag} style={styles.flagBadge}>
            <Text style={styles.flagText}>{FLAG_LABELS[flag] ?? flag}</Text>
          </View>
        ))}
      </View>
      <HashBadge hash={message.sha256_hash} tsaToken={message.tsa_token} />
    </View>
  )
}

// ─── thread group ─────────────────────────────────────────────────────────────

interface ThreadGroupProps {
  thread: ProThread
  messages: ProMessage[]
  parentAId: string
  parentBId: string
  parentAName: string
  parentBName: string
  parentAColor: string
  parentBColor: string
}

function ThreadGroup({ thread, messages, parentAId, parentAName, parentBName, parentAColor, parentBColor }: ThreadGroupProps) {
  const getSenderName = (id: string) => id === parentAId ? parentAName : parentBName
  const getSenderColor = (id: string) => id === parentAId ? parentAColor : parentBColor

  return (
    <View style={styles.threadGroup}>
      <View style={styles.threadHeader}>
        <Text style={styles.threadTopic}>{thread.topic ?? 'General'}</Text>
        <Text style={styles.threadCount}>{messages.length} messages</Text>
      </View>
      {messages.map(msg => (
        <MessageItem
          key={msg.id}
          message={msg}
          senderName={getSenderName(msg.sender_id)}
          senderColor={getSenderColor(msg.sender_id)}
        />
      ))}
    </View>
  )
}

// ─── main tab ─────────────────────────────────────────────────────────────────

export default function CommunicationsTab() {
  const { data } = useProPortal()
  if (!data) return null

  // Group messages by thread, sort threads by most recent message
  const threadMap = new Map<string, ProMessage[]>()
  for (const msg of data.messages) {
    const arr = threadMap.get(msg.thread_id) ?? []
    arr.push(msg)
    threadMap.set(msg.thread_id, arr)
  }
  // Sort messages within each thread ascending for reading order
  for (const [tid, msgs] of threadMap) {
    threadMap.set(tid, [...msgs].sort((a, b) => a.sent_at.localeCompare(b.sent_at)))
  }

  // Build thread list, most recent first
  const threadsSorted = [...data.threads]
    .filter(t => threadMap.has(t.id))
    .sort((a, b) => {
      const aLatest = threadMap.get(a.id)?.at(-1)?.sent_at ?? ''
      const bLatest = threadMap.get(b.id)?.at(-1)?.sent_at ?? ''
      return bLatest.localeCompare(aLatest)
    })

  if (threadsSorted.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No messages in the last 180 days.</Text>
      </View>
    )
  }

  return (
    <FlatList
      data={threadsSorted}
      keyExtractor={t => t.id}
      contentContainerStyle={styles.list}
      renderItem={({ item: thread }) => (
        <ThreadGroup
          thread={thread}
          messages={threadMap.get(thread.id) ?? []}
          parentAId={data.parentAId}
          parentBId={data.parentBId}
          parentAName={data.parentA.display_name}
          parentBName={data.parentB.display_name}
          parentAColor={data.parentA.color}
          parentBColor={data.parentB.color}
        />
      )}
    />
  )
}

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  list:         { padding: 16, paddingBottom: 32 },
  empty:        { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText:    { fontSize: 14, fontFamily: font.regular, color: 'rgba(255,255,255,0.50)', textAlign: 'center' },

  threadGroup:  { marginBottom: 20 },
  threadHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 4 },
  threadTopic:  { fontSize: 13, fontFamily: font.semibold, color: 'rgba(255,255,255,0.85)', flex: 1 },
  threadCount:  { fontSize: 11, fontFamily: font.regular, color: 'rgba(255,255,255,0.40)' },

  msgCard:     { backgroundColor: NAVY2, borderRadius: radius.md, padding: 12, marginBottom: 8 },
  msgHeader:   { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 6 },
  senderDot:   { width: 8, height: 8, borderRadius: 4 },
  senderName:  { fontSize: 12, fontFamily: font.semibold, color: WHITE, flex: 1 },
  msgTime:     { fontSize: 11, fontFamily: font.regular, color: 'rgba(255,255,255,0.40)' },
  msgBody:     { fontSize: 13, fontFamily: font.regular, color: 'rgba(255,255,255,0.85)', lineHeight: 19, marginBottom: 8 },
  msgBadges:   { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 2 },
  flagBadge:   { backgroundColor: 'rgba(245,158,11,0.20)', borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 },
  flagText:    { fontSize: 10, fontFamily: font.semibold, color: AMBER },
})
