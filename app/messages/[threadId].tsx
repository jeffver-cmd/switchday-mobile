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
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Path } from 'react-native-svg'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { useState, useRef, useEffect, useCallback } from 'react'
import { useMessages, sendMessage, Message } from '@/lib/hooks/useMessages'
import { colors, radius, font } from '@/lib/theme'

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

// Slightly darker warm gray — matches web's received bubble color
const RECEIVED_COLOR = '#D9D3CA'

interface BubbleProps {
  msg: Message
  isMe: boolean
  showTime: boolean
  /** Current user's profile color — used to tint their sent bubbles */
  myColor: string
}

function Bubble({ msg, isMe, showTime, myColor }: BubbleProps) {
  const bgColor = isMe ? myColor : RECEIVED_COLOR

  return (
    <View style={[
      styles.bubbleRow,
      isMe ? styles.bubbleRowMe : styles.bubbleRowThem,
      showTime && styles.bubbleRowLast,
    ]}>
      {/*
        paddingBottom: 9 when tail is shown — gives the tail room below the
        bubble without overflow clipping. SVG is absolutely positioned at
        bottom: 0, so it sits in that 9px gap and overlaps the bottom ~3px
        of the bubble (where it connects seamlessly).
      */}
      <View style={[styles.bubbleWrap, showTime && { paddingBottom: 9 }]}>
        <View style={[styles.bubble, { backgroundColor: bgColor }]}>
          <Text style={[styles.bubbleText, { color: isMe ? '#ffffff' : colors.textPrimary }]}>
            {msg.body}
          </Text>
        </View>

        {/* Teardrop tail — same SVG paths as web, shown on last message of each run */}
        {showTime && (
          <Svg
            width={10}
            height={12}
            viewBox="0 0 10 12"
            style={[
              styles.tail,
              isMe ? styles.tailMe : styles.tailThem,
            ]}
          >
            {isMe
              ? <Path d="M -1 0 L 10 0 C 8 4, 7 9, 9 12 C 5 10, 0 5, -1 0 Z" fill={bgColor} />
              : <Path d="M 11 0 L 0 0 C 2 4, 3 9, 1 12 C 5 10, 10 5, 11 0 Z" fill={bgColor} />
            }
          </Svg>
        )}
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
            <ActivityIndicator size="large" color={colors.accent} />
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
                : <Bubble msg={item.msg} isMe={item.isMe} showTime={item.showTime} myColor={data?.myColor ?? colors.accent} />
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
            placeholderTextColor={colors.textSubtle}
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
              <ActivityIndicator size="small" color={colors.white} />
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
  container: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 14, fontFamily: font.regular, color: colors.textMuted },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderHair,
  },
  backBtn: { padding: 8, width: 44 },
  backArrow: { fontSize: 28, fontFamily: font.regular, color: colors.textSecondary, fontWeight: '300', lineHeight: 30 },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '600', fontFamily: font.semibold, color: colors.textPrimary, textAlign: 'center' },
  headerRight: { width: 44 },

  // Messages
  messageList: { paddingHorizontal: 12, paddingVertical: 8, paddingBottom: 16 },

  // Day separator
  daySep: { alignItems: 'center', marginVertical: 12 },
  daySepText: { fontSize: 12, fontFamily: font.regular, color: colors.textSubtle, fontWeight: '500' },

  // Bubbles
  bubbleRow: { marginTop: 1, marginBottom: 2, maxWidth: '80%' },
  bubbleRowMe: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubbleRowThem: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubbleRowLast: { marginBottom: 8 },

  bubbleWrap: {},

  // Tail is absolutely positioned within the paddingBottom area of bubbleWrap
  tail: { position: 'absolute', bottom: 0 },
  tailMe:   { right: 9 },
  tailThem: { left: 13 },

  bubble: {
    borderRadius: 18,   // uniform — matches web
    paddingHorizontal: 14,
    paddingVertical: 9,
  },

  bubbleText: { fontSize: 15, fontFamily: font.regular, lineHeight: 20 },
  // text colours are now set inline with the dynamic bubble color

  bubbleTime: { fontSize: 11, fontFamily: font.regular, color: colors.textSubtle, marginTop: 6, marginHorizontal: 4 },
  bubbleTimeMe: { textAlign: 'right' },
  bubbleTimeThem: { textAlign: 'left' },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'ios' ? 28 : 14,
    borderTopWidth: 1,
    borderTopColor: colors.borderHair,
    backgroundColor: colors.surface,
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: font.regular,
    color: colors.textPrimary,
    maxHeight: 120,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  sendBtnDisabled: { backgroundColor: colors.surface2 },
  sendBtnText: { color: colors.white, fontSize: 20, fontWeight: '700', lineHeight: 22 },

  sendError: { fontSize: 12, fontFamily: font.regular, color: colors.danger, textAlign: 'center', paddingHorizontal: 16, paddingBottom: 4 },
})
