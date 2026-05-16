import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  SafeAreaView as RNSafeAreaView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useMessages, sendMessage, Message } from '@/lib/hooks/useMessages'

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatBubbleTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function formatDaySeparator(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(Date.now() - 86400000)

  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()

  if (isSameDay(d, today)) return 'Today'
  if (isSameDay(d, yesterday)) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

// ─── message bubble ──────────────────────────────────────────────────────────

interface BubbleProps {
  msg: Message
  isMe: boolean
  showTime: boolean
}

function Bubble({ msg, isMe, showTime }: BubbleProps) {
  return (
    <View style={[styles.bubbleRow, isMe ? styles.bubbleRowMe : styles.bubbleRowThem]}>
      <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
        <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextThem]}>
          {msg.body}
        </Text>
      </View>
      {showTime && (
        <Text style={[styles.bubbleTime, isMe ? styles.bubbleTimeMe : styles.bubbleTimeThem]}>
          {formatBubbleTime(msg.sentAt)}
        </Text>
      )}
    </View>
  )
}

// ─── day separator ───────────────────────────────────────────────────────────

function DaySep({ label }: { label: string }) {
  return (
    <View style={styles.daySep}>
      <Text style={styles.daySepText}>{label}</Text>
    </View>
  )
}

// ─── screen ──────────────────────────────────────────────────────────────────

export default function ConversationScreen() {
  const { threadId, connectionId, topic } = useLocalSearchParams<{
    threadId: string
    connectionId: string
    topic: string
  }>()
  const router = useRouter()

  const { data, loading, error } = useMessages(threadId)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const listRef = useRef<FlatList>(null)

  // Scroll to bottom when messages load or a new one arrives
  useEffect(() => {
    if (data?.messages.length) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 100)
    }
  }, [data?.messages.length])

  const handleSend = useCallback(async () => {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    setSending(true)
    setSendError(null)
    setText('')
    const { error: err } = await sendMessage(threadId, connectionId, trimmed)
    if (err) {
      setSendError('Failed to send. Try again.')
      setText(trimmed)  // restore
    }
    setSending(false)
  }, [text, sending, threadId, connectionId])

  // Build list items: inject day separators
  const listItems: Array<{ type: 'sep'; label: string } | { type: 'msg'; msg: Message; isMe: boolean; showTime: boolean }> = []

  if (data) {
    const msgs = data.messages
    let lastDate = ''
    for (let i = 0; i < msgs.length; i++) {
      const msg = msgs[i]
      const msgDate = msg.sentAt.split('T')[0]
      if (msgDate !== lastDate) {
        listItems.push({ type: 'sep', label: formatDaySeparator(msg.sentAt) })
        lastDate = msgDate
      }
      const isMe = msg.senderId === data.userId
      // Show time on last message of a "run" from same sender
      const next = msgs[i + 1]
      const showTime = !next || next.senderId !== msg.senderId ||
        (new Date(next.sentAt).getTime() - new Date(msg.sentAt).getTime()) > 5 * 60 * 1000
      listItems.push({ type: 'msg', msg, isMe, showTime })
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {decodeURIComponent(topic ?? 'Conversation')}
        </Text>
        <View style={styles.headerRight} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Messages */}
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#374151" />
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>Couldn't load messages</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={listItems}
            keyExtractor={(item, index) =>
              item.type === 'sep' ? `sep-${index}` : item.msg.id
            }
            renderItem={({ item }) =>
              item.type === 'sep'
                ? <DaySep label={item.label} />
                : <Bubble msg={item.msg} isMe={item.isMe} showTime={item.showTime} />
            }
            contentContainerStyle={styles.messageList}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          />
        )}

        {/* Send error */}
        {sendError && (
          <Text style={styles.sendError}>{sendError}</Text>
        )}

        {/* Input bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Message…"
            placeholderTextColor="#9ca3af"
            multiline
            maxLength={2000}
            returnKeyType="default"
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!text.trim() || sending}
            activeOpacity={0.8}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.sendBtnText}>↑</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#ffffff' },
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 14, color: '#6b7280' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  backBtn: { padding: 8, width: 44 },
  backArrow: { fontSize: 28, color: '#374151', fontWeight: '300', lineHeight: 30 },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '600', color: '#111827', textAlign: 'center' },
  headerRight: { width: 44 },

  // Messages
  messageList: { paddingHorizontal: 12, paddingVertical: 8, paddingBottom: 16 },

  // Day separator
  daySep: { alignItems: 'center', marginVertical: 12 },
  daySepText: { fontSize: 12, color: '#9ca3af', fontWeight: '500' },

  // Bubbles
  bubbleRow: { marginVertical: 1, maxWidth: '80%' },
  bubbleRowMe: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubbleRowThem: { alignSelf: 'flex-start', alignItems: 'flex-start' },

  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleMe: { backgroundColor: '#1f2937', borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: '#f3f4f6', borderBottomLeftRadius: 4 },

  bubbleText: { fontSize: 15, lineHeight: 20 },
  bubbleTextMe: { color: '#ffffff' },
  bubbleTextThem: { color: '#1f2937' },

  bubbleTime: { fontSize: 11, color: '#9ca3af', marginTop: 3, marginHorizontal: 4 },
  bubbleTimeMe: { textAlign: 'right' },
  bubbleTimeThem: { textAlign: 'left' },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingBottom: Platform.OS === 'ios' ? 24 : 10,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    backgroundColor: '#ffffff',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1f2937',
    maxHeight: 120,
  },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#1f2937',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 2,
  },
  sendBtnDisabled: { backgroundColor: '#d1d5db' },
  sendBtnText: { color: '#ffffff', fontSize: 20, fontWeight: '700', lineHeight: 22 },

  sendError: { fontSize: 12, color: '#ef4444', textAlign: 'center', paddingHorizontal: 16, paddingBottom: 4 },
})
