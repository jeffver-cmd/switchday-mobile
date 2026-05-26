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
import { useState, useCallback, useEffect } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { colors, radius, shadow, font, buttonLabel } from '@/lib/theme'
import type { JournalMood } from '@/lib/types/database'

// ─── constants ───────────────────────────────────────────────────────────────

const MOODS: { key: JournalMood; emoji: string; label: string; color: string }[] = [
  { key: 'calm',       emoji: '😌', label: 'Calm',       color: '#3D8C6A' },
  { key: 'hopeful',    emoji: '🌟', label: 'Hopeful',    color: '#C4882A' },
  { key: 'worried',    emoji: '😟', label: 'Worried',    color: '#5B6B8A' },
  { key: 'frustrated', emoji: '😤', label: 'Frustrated', color: '#C04848' },
  { key: 'angry',      emoji: '😠', label: 'Angry',      color: '#8B0000' },
]

function moodFor(key: JournalMood | null) {
  return MOODS.find(m => m.key === key) ?? null
}

// ─── types ───────────────────────────────────────────────────────────────────

interface JournalEntry {
  id: string
  title: string | null
  content: string
  mood: JournalMood | null
  created_at: string
  archived_at: string | null
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function formatEntryDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 7) return d.toLocaleDateString('en-US', { weekday: 'long' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
}

// ─── entry row ───────────────────────────────────────────────────────────────

interface EntryRowProps {
  item: JournalEntry
  onPress: () => void
  onDelete: () => void
}

function EntryRow({ item, onPress, onDelete }: EntryRowProps) {
  const mood = moodFor(item.mood)
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} onLongPress={onDelete} delayLongPress={500} activeOpacity={0.8}>
      <View style={styles.rowLeft}>
        {mood && <Text style={styles.rowMoodEmoji}>{mood.emoji}</Text>}
        {!mood && <View style={[styles.rowMoodDot, { backgroundColor: colors.border }]} />}
      </View>
      <View style={styles.rowContent}>
        {item.title ? (
          <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
        ) : null}
        <Text style={[styles.rowContent2, item.title ? null : styles.rowContent2NoTitle]} numberOfLines={2}>
          {item.content}
        </Text>
        <Text style={styles.rowDate}>{formatEntryDate(item.created_at)}</Text>
      </View>
      <Ionicons name="chevron-forward" size={14} color={colors.textSubtle} style={{ marginTop: 4 }} />
    </TouchableOpacity>
  )
}

// ─── entry editor modal ───────────────────────────────────────────────────────

interface EditorProps {
  visible: boolean
  entry: JournalEntry | null  // null = new entry
  onClose: () => void
  onSaved: (entry: JournalEntry) => void
  onDeleted?: (id: string) => void
}

function EntryEditor({ visible, entry, onClose, onSaved, onDeleted }: EditorProps) {
  const [title,   setTitle]   = useState('')
  const [content, setContent] = useState('')
  const [mood,    setMood]    = useState<JournalMood | null>(null)
  const [saving,  setSaving]  = useState(false)
  const [deleting,setDeleting]= useState(false)

  useEffect(() => {
    if (visible) {
      setTitle(entry?.title ?? '')
      setContent(entry?.content ?? '')
      setMood(entry?.mood ?? null)
    }
  }, [visible, entry])

  async function handleSave() {
    if (!content.trim()) { Alert.alert('Write something first'); return }
    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      if (entry) {
        // Update
        const { data: updated, error } = await supabase
          .from('journal_entries')
          .update({ title: title.trim() || null, content: content.trim(), mood, updated_at: new Date().toISOString() })
          .eq('id', entry.id)
          .eq('user_id', session.user.id)
          .select()
          .single()
        if (error || !updated) { Alert.alert('Error', error?.message ?? 'Failed to save'); return }
        onSaved(updated as JournalEntry)
      } else {
        // Insert
        const { data: created, error } = await supabase
          .from('journal_entries')
          .insert({ content: content.trim(), title: title.trim() || null, mood })
          .select()
          .single()
        if (error || !created) { Alert.alert('Error', error?.message ?? 'Failed to save'); return }
        onSaved(created as JournalEntry)
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!entry || !onDeleted) return
    Alert.alert('Delete entry?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          setDeleting(true)
          const { data: { session } } = await supabase.auth.getSession()
          if (!session) { setDeleting(false); return }
          await supabase.from('journal_entries').delete().eq('id', entry.id).eq('user_id', session.user.id)
          setDeleting(false)
          onDeleted(entry.id)
        },
      },
    ])
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        {/* Header */}
        <View style={editor.header}>
          <TouchableOpacity onPress={onClose} style={editor.headerBtn} disabled={saving}>
            <Text style={[editor.cancel, saving && { opacity: 0.4 }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={editor.title}>{entry ? 'Edit entry' : 'New entry'}</Text>
          <TouchableOpacity onPress={handleSave} style={editor.headerBtn} disabled={saving}>
            {saving
              ? <ActivityIndicator size="small" color={colors.accent} />
              : <Text style={editor.save}>Save</Text>}
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={editor.form} keyboardShouldPersistTaps="handled">
            {/* Mood picker */}
            <Text style={editor.label}>HOW ARE YOU FEELING?</Text>
            <View style={editor.moodRow}>
              {MOODS.map(m => (
                <TouchableOpacity
                  key={m.key}
                  style={[editor.moodChip, mood === m.key && { borderColor: m.color, backgroundColor: m.color + '18' }]}
                  onPress={() => setMood(mood === m.key ? null : m.key)}
                >
                  <Text style={editor.moodEmoji}>{m.emoji}</Text>
                  <Text style={[editor.moodLabel, mood === m.key && { color: m.color }]}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Optional title */}
            <Text style={[editor.label, { marginTop: 20 }]}>TITLE (OPTIONAL)</Text>
            <TextInput
              style={editor.input}
              value={title}
              onChangeText={setTitle}
              placeholder="Untitled"
              placeholderTextColor={colors.textSubtle}
              maxLength={100}
            />

            {/* Content */}
            <Text style={[editor.label, { marginTop: 16 }]}>ENTRY</Text>
            <TextInput
              style={[editor.input, { minHeight: 180, textAlignVertical: 'top' }]}
              value={content}
              onChangeText={setContent}
              placeholder="What's on your mind…"
              placeholderTextColor={colors.textSubtle}
              multiline
              maxLength={5000}
              autoFocus={!entry}
            />

            {/* Delete button (edit only) */}
            {entry && onDeleted && (
              <TouchableOpacity
                onPress={handleDelete}
                disabled={deleting}
                style={editor.deleteBtn}
              >
                <Ionicons name="trash-outline" size={16} color={colors.danger} />
                <Text style={editor.deleteBtnText}>{deleting ? 'Deleting…' : 'Delete entry'}</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  )
}

// ─── screen ──────────────────────────────────────────────────────────────────

export default function JournalScreen() {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [editing, setEditing] = useState<JournalEntry | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError('not_signed_in'); return }
      const { data, error: err } = await supabase
        .from('journal_entries')
        .select('id, title, content, mood, created_at, archived_at')
        .eq('user_id', session.user.id)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
      if (err) { setError(err.message); return }
      setEntries((data ?? []) as JournalEntry[])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  function handleSaved(entry: JournalEntry) {
    setEntries(prev => {
      const idx = prev.findIndex(e => e.id === entry.id)
      if (idx >= 0) {
        const next = [...prev]; next[idx] = entry; return next
      }
      return [entry, ...prev]
    })
    setShowNew(false)
    setEditing(null)
  }

  function handleDeleted(id: string) {
    setEntries(prev => prev.filter(e => e.id !== id))
    setEditing(null)
  }

  function confirmDelete(entry: JournalEntry) {
    Alert.alert('Delete entry?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          const { data: { session } } = await supabase.auth.getSession()
          if (!session) return
          await supabase.from('journal_entries').delete().eq('id', entry.id).eq('user_id', session.user.id)
          handleDeleted(entry.id)
        },
      },
    ])
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.heading}>Journal</Text>
          <View style={styles.privatePill}>
            <Ionicons name="lock-closed" size={10} color={colors.textSubtle} />
            <Text style={styles.privateText}>Private to you only</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.newBtn} onPress={() => setShowNew(true)}>
          <Text style={styles.newBtnText}>+ New</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>Couldn't load journal</Text>
          <TouchableOpacity onPress={load} style={styles.retryBtn}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={item => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.accent} />}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <EntryRow
              item={item}
              onPress={() => setEditing(item)}
              onDelete={() => confirmDelete(item)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyEmoji}>📓</Text>
              <Text style={styles.emptyTitle}>No entries yet</Text>
              <Text style={styles.emptySubtitle}>
                Your journal is private — only you can see it. Document what matters.
              </Text>
              <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowNew(true)}>
                <Text style={styles.emptyBtnText}>Write your first entry</Text>
              </TouchableOpacity>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      <EntryEditor
        visible={showNew}
        entry={null}
        onClose={() => setShowNew(false)}
        onSaved={handleSaved}
      />

      <EntryEditor
        visible={!!editing}
        entry={editing}
        onClose={() => setEditing(null)}
        onSaved={handleSaved}
        onDeleted={handleDeleted}
      />
    </SafeAreaView>
  )
}

// ─── styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },

  header: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12,
  },
  heading: { fontSize: 24, fontWeight: '700', fontFamily: font.bold, color: colors.textPrimary },
  privatePill: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  privateText: { fontSize: 11, fontFamily: font.regular, color: colors.textSubtle },
  newBtn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 7, marginTop: 4 },
  newBtnText: { ...buttonLabel, color: colors.white },

  list: { paddingHorizontal: 16, paddingTop: 4, flexGrow: 1 },
  separator: { height: 1, backgroundColor: colors.borderHair, marginLeft: 60 },

  row: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingVertical: 14, paddingHorizontal: 4,
    backgroundColor: colors.surface,
    gap: 12,
  },
  rowLeft: { width: 36, alignItems: 'center', paddingTop: 2 },
  rowMoodEmoji: { fontSize: 22 },
  rowMoodDot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  rowContent: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '600', fontFamily: font.semibold, color: colors.textPrimary, marginBottom: 3 },
  rowContent2: { fontSize: 14, fontFamily: font.regular, color: colors.textSecondary, lineHeight: 20, marginBottom: 4 },
  rowContent2NoTitle: { fontWeight: '500', fontFamily: font.medium, color: colors.textPrimary },
  rowDate: { fontSize: 11, fontFamily: font.regular, color: colors.textSubtle },

  // Empty state
  emptyBox: { flex: 1, paddingVertical: 80, alignItems: 'center', paddingHorizontal: 32 },
  emptyEmoji: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 17, fontWeight: '600', fontFamily: font.semibold, color: colors.textPrimary, marginBottom: 8, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, fontFamily: font.regular, color: colors.textMuted, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  emptyBtn: { backgroundColor: colors.accent, borderRadius: radius.md, paddingHorizontal: 24, paddingVertical: 12 },
  emptyBtnText: { color: colors.white, fontWeight: '600', fontFamily: font.semibold, fontSize: 15, lineHeight: 15 },

  // Error / retry
  retryBtn: { marginTop: 12, backgroundColor: colors.accent, borderRadius: radius.md, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { ...buttonLabel, color: colors.white },
})

const editor = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: colors.borderHair,
  },
  headerBtn: { width: 72 },
  cancel: { fontSize: 16, fontFamily: font.regular, color: colors.textMuted },
  title:  { fontSize: 17, fontWeight: '600', fontFamily: font.semibold, color: colors.textPrimary },
  save:   { fontSize: 16, fontWeight: '600', fontFamily: font.semibold, color: colors.accent, textAlign: 'right', lineHeight: 16 },

  form: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 60 },
  label: {
    fontSize: 11, fontWeight: '700', fontFamily: font.bold,
    color: colors.textSubtle, letterSpacing: 0.8, marginBottom: 10,
  },

  // Mood picker
  moodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  moodChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 7,
    borderRadius: radius.full, borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  moodEmoji: { fontSize: 16 },
  moodLabel: { fontSize: 13, fontFamily: font.medium, color: colors.textSecondary },

  // Text inputs
  input: {
    backgroundColor: colors.surface2, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontFamily: font.regular, color: colors.textPrimary,
  },

  // Delete
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 32, alignSelf: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  deleteBtnText: { fontSize: 14, fontFamily: font.medium, color: colors.danger },
})
