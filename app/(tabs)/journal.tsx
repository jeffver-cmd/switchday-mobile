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
  Image,
  Linking,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useState, useCallback, useEffect } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { colors, radius, font, buttonLabel } from '@/lib/theme'
import type { JournalMood } from '@/lib/types/database'
import { pickDocument, pickFromCamera, pickFromPhotoLibrary, type PickedFile } from '@/lib/api/vault'

// ─── constants ───────────────────────────────────────────────────────────────

const JOURNAL_BUCKET = 'journal-attachments'
const MAX_ATTACH_BYTES = 20 * 1024 * 1024 // 20 MB

const MOODS: { key: JournalMood; emoji: string; label: string; color: string }[] = [
  { key: 'calm',       emoji: '😌', label: 'Calm',       color: '#3D8C6A' },
  { key: 'hopeful',    emoji: '🌟', label: 'Hopeful',    color: '#C4882A' },
  { key: 'worried',    emoji: '😟', label: 'Worried',    color: '#5B6B8A' },
  { key: 'frustrated', emoji: '😤', label: 'Frustrated', color: '#C04848' },
  { key: 'angry',      emoji: '😠', label: 'Angry',      color: '#8B0000' },
]

// ─── helpers ─────────────────────────────────────────────────────────────────

function moodFor(key: JournalMood | null) {
  return MOODS.find(m => m.key === key) ?? null
}

function formatEntryDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 7) return d.toLocaleDateString('en-US', { weekday: 'long' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

// ─── types ───────────────────────────────────────────────────────────────────

interface JournalAttachment {
  id: string
  storage_path: string
  file_name: string
  file_size: number | null
  mime_type: string | null
}

interface JournalEntry {
  id: string
  title: string | null
  content: string
  mood: JournalMood | null
  created_at: string
  archived_at: string | null
  journal_attachments?: { id: string }[]
}

// ─── attachment chip ──────────────────────────────────────────────────────────

interface AttachChipProps {
  name: string
  isImage: boolean
  imageUrl?: string   // signed URL or local URI
  isPending?: boolean
  onDelete: () => void
}

function AttachChip({ name, isImage, imageUrl, isPending, onDelete }: AttachChipProps) {
  return (
    <View style={editor.chip}>
      {isImage && imageUrl ? (
        <Image source={{ uri: imageUrl }} style={editor.chipThumb} />
      ) : (
        <View style={editor.chipIconWrap}>
          <Ionicons name="document-outline" size={15} color={colors.textSubtle} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={editor.chipName} numberOfLines={1}>{name}</Text>
        {isPending && (
          <Text style={editor.chipPending}>Uploads on save</Text>
        )}
      </View>
      <TouchableOpacity onPress={onDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Ionicons name="close-circle" size={18} color={colors.textSubtle} />
      </TouchableOpacity>
    </View>
  )
}

// ─── entry row ───────────────────────────────────────────────────────────────

interface EntryRowProps {
  item: JournalEntry
  onPress: () => void
  onDelete: () => void
}

function EntryRow({ item, onPress, onDelete }: EntryRowProps) {
  const mood = moodFor(item.mood)
  const attachCount = item.journal_attachments?.length ?? 0
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
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
          <Text style={styles.rowDate}>{formatEntryDate(item.created_at)}</Text>
          {attachCount > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Ionicons name="attach" size={11} color={colors.textSubtle} />
              <Text style={styles.rowDate}>{attachCount}</Text>
            </View>
          )}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={14} color={colors.textSubtle} style={{ marginTop: 4 }} />
    </TouchableOpacity>
  )
}

// ─── entry editor modal ───────────────────────────────────────────────────────

interface EditorProps {
  visible: boolean
  entry: JournalEntry | null  // null = new entry
  isPro: boolean
  onClose: () => void
  onSaved: (entry: JournalEntry) => void
  onDeleted?: (id: string) => void
}

function EntryEditor({ visible, entry, isPro, onClose, onSaved, onDeleted }: EditorProps) {
  const [title,    setTitle]    = useState('')
  const [content,  setContent]  = useState('')
  const [mood,     setMood]     = useState<JournalMood | null>(null)
  const [saving,   setSaving]   = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Attachment state
  const [attachments,  setAttachments]  = useState<JournalAttachment[]>([])
  const [pendingFiles, setPendingFiles] = useState<PickedFile[]>([])
  const [uploading,    setUploading]    = useState(false)
  const [signedUrls,   setSignedUrls]   = useState<Record<string, string>>({})

  // Reset + load when editor opens
  useEffect(() => {
    if (!visible) return
    setTitle(entry?.title ?? '')
    setContent(entry?.content ?? '')
    setMood(entry?.mood ?? null)
    setAttachments([])
    setPendingFiles([])
    setSignedUrls({})
    setUploading(false)
    if (entry) loadAttachments(entry.id)
  }, [visible, entry?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAttachments(entryId: string) {
    const { data } = await supabase
      .from('journal_attachments')
      .select('id, storage_path, file_name, file_size, mime_type')
      .eq('entry_id', entryId)
      .order('created_at', { ascending: true })
    if (!data) return
    setAttachments(data as JournalAttachment[])
    // Fetch signed URLs for image attachments
    for (const att of data as JournalAttachment[]) {
      if (att.mime_type?.startsWith('image/')) {
        const { data: urlData } = await supabase.storage
          .from(JOURNAL_BUCKET)
          .createSignedUrl(att.storage_path, 3600)
        if (urlData?.signedUrl) {
          setSignedUrls(prev => ({ ...prev, [att.id]: urlData.signedUrl }))
        }
      }
    }
  }

  async function uploadAndInsert(
    file: PickedFile,
    entryId: string,
    userId: string,
  ): Promise<JournalAttachment | null> {
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const storagePath = `journal/${userId}/${entryId}/${Date.now()}_${safeName}`

      const response = await fetch(file.uri)
      const arrayBuffer = await response.arrayBuffer()
      const blob = new Blob([arrayBuffer], { type: file.mimeType })

      const { error: uploadError } = await supabase.storage
        .from(JOURNAL_BUCKET)
        .upload(storagePath, blob, { contentType: file.mimeType, upsert: false })

      if (uploadError) return null

      const { data: att, error: insertError } = await supabase
        .from('journal_attachments')
        .insert({
          entry_id:     entryId,
          user_id:      userId,
          storage_path: storagePath,
          file_name:    file.name,
          file_size:    file.size || null,
          mime_type:    file.mimeType || null,
        })
        .select('id, storage_path, file_name, file_size, mime_type')
        .single()

      if (insertError || !att) {
        await supabase.storage.from(JOURNAL_BUCKET).remove([storagePath])
        return null
      }

      // Fetch signed URL if image
      if (file.mimeType.startsWith('image/')) {
        const { data: urlData } = await supabase.storage
          .from(JOURNAL_BUCKET)
          .createSignedUrl(storagePath, 3600)
        if (urlData?.signedUrl) {
          setSignedUrls(prev => ({ ...prev, [(att as JournalAttachment).id]: urlData.signedUrl }))
        }
      }

      return att as JournalAttachment
    } catch {
      return null
    }
  }

  async function handleAttach() {
    Alert.alert('Add attachment', undefined, [
      {
        text: 'Photo Library',
        onPress: async () => {
          const file = await pickFromPhotoLibrary()
          if (!file) return
          if (file.size > MAX_ATTACH_BYTES) { Alert.alert('File too large', 'Maximum attachment size is 20 MB.'); return }
          await stageOrUpload(file)
        },
      },
      {
        text: 'Camera',
        onPress: async () => {
          const file = await pickFromCamera()
          if (!file) return
          if (file.size > MAX_ATTACH_BYTES) { Alert.alert('File too large', 'Maximum attachment size is 20 MB.'); return }
          await stageOrUpload(file)
        },
      },
      {
        text: 'File',
        onPress: async () => {
          const file = await pickDocument()
          if (!file) return
          if (file.size > MAX_ATTACH_BYTES) { Alert.alert('File too large', 'Maximum attachment size is 20 MB.'); return }
          await stageOrUpload(file)
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ])
  }

  async function stageOrUpload(file: PickedFile) {
    if (!entry) {
      // New entry — stage locally until Save
      setPendingFiles(prev => [...prev, file])
      return
    }
    // Existing entry — upload immediately
    setUploading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setUploading(false); return }
    const att = await uploadAndInsert(file, entry.id, session.user.id)
    setUploading(false)
    if (att) {
      setAttachments(prev => [...prev, att])
    } else {
      Alert.alert('Upload failed', 'Could not attach the file. Try again.')
    }
  }

  async function handleDeleteAttachment(att: JournalAttachment) {
    Alert.alert('Remove attachment?', att.file_name, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive',
        onPress: async () => {
          await supabase.storage.from(JOURNAL_BUCKET).remove([att.storage_path])
          await supabase.from('journal_attachments').delete().eq('id', att.id)
          setAttachments(prev => prev.filter(a => a.id !== att.id))
          setSignedUrls(prev => { const n = { ...prev }; delete n[att.id]; return n })
        },
      },
    ])
  }

  async function handleSave() {
    if (!content.trim()) { Alert.alert('Write something first'); return }
    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const userId = session.user.id

      if (entry) {
        // ── Update existing entry ──────────────────────────────────────────
        const { data: updated, error } = await supabase
          .from('journal_entries')
          .update({ title: title.trim() || null, content: content.trim(), mood, updated_at: new Date().toISOString() })
          .eq('id', entry.id)
          .eq('user_id', userId)
          .select()
          .single()
        if (error || !updated) { Alert.alert('Error', error?.message ?? 'Failed to save'); return }

        // Upload any files staged while editing an existing entry
        if (isPro && pendingFiles.length > 0) {
          setUploading(true)
          const failed: string[] = []
          for (const file of pendingFiles) {
            const att = await uploadAndInsert(file, entry.id, userId)
            if (att) setAttachments(prev => [...prev, att])
            else failed.push(file.name)
          }
          setPendingFiles([])
          setUploading(false)
          if (failed.length > 0) Alert.alert('Some uploads failed', failed.join(', '))
        }

        onSaved(updated as JournalEntry)
      } else {
        // ── Insert new entry ───────────────────────────────────────────────
        const { data: created, error } = await supabase
          .from('journal_entries')
          .insert({ content: content.trim(), title: title.trim() || null, mood })
          .select()
          .single()
        if (error || !created) { Alert.alert('Error', error?.message ?? 'Failed to save'); return }

        // Upload pending files now that we have an entry ID
        if (isPro && pendingFiles.length > 0) {
          setUploading(true)
          const failed: string[] = []
          for (const file of pendingFiles) {
            const att = await uploadAndInsert(file, created.id, userId)
            if (!att) failed.push(file.name)
          }
          setPendingFiles([])
          setUploading(false)
          if (failed.length > 0) Alert.alert('Some uploads failed', failed.join(', '))
        }

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

  const isBusy = saving || uploading

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        {/* Header */}
        <View style={editor.header}>
          <TouchableOpacity onPress={onClose} style={editor.headerBtn} disabled={isBusy}>
            <Text style={[editor.cancel, isBusy && { opacity: 0.4 }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={editor.title}>{entry ? 'Edit entry' : 'New entry'}</Text>
          <TouchableOpacity onPress={handleSave} style={editor.headerBtn} disabled={isBusy}>
            {isBusy
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

            {/* Attachments */}
            <Text style={[editor.label, { marginTop: 20 }]}>ATTACHMENTS</Text>

            {!isPro ? (
              <TouchableOpacity
                style={editor.proGateRow}
                onPress={() => Linking.openURL('https://switchday.app/app/settings?tab=plan&upgrade=1')}
              >
                <Ionicons name="lock-closed" size={13} color={colors.textSubtle} />
                <Text style={editor.proGateText}>Attachments require Pro — tap to upgrade</Text>
              </TouchableOpacity>
            ) : (
              <>
                {/* Existing + pending attachment chips */}
                {(attachments.length > 0 || pendingFiles.length > 0) && (
                  <View style={editor.chipList}>
                    {attachments.map(att => (
                      <AttachChip
                        key={att.id}
                        name={att.file_name}
                        isImage={att.mime_type?.startsWith('image/') ?? false}
                        imageUrl={signedUrls[att.id]}
                        onDelete={() => handleDeleteAttachment(att)}
                      />
                    ))}
                    {pendingFiles.map((file, i) => (
                      <AttachChip
                        key={`pending-${i}`}
                        name={file.name}
                        isImage={file.mimeType.startsWith('image/')}
                        imageUrl={file.mimeType.startsWith('image/') ? file.uri : undefined}
                        isPending
                        onDelete={() => setPendingFiles(prev => prev.filter((_, idx) => idx !== i))}
                      />
                    ))}
                  </View>
                )}

                {/* Attach button */}
                <TouchableOpacity
                  style={editor.attachBtn}
                  onPress={handleAttach}
                  disabled={isBusy}
                  activeOpacity={0.7}
                >
                  {uploading ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : (
                    <>
                      <Ionicons name="attach" size={15} color={colors.accent} />
                      <Text style={editor.attachBtnText}>Attach file</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}

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
  const [isPro,   setIsPro]   = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [editing, setEditing] = useState<JournalEntry | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError('not_signed_in'); return }

      // Check plan
      const { data: profile } = await supabase
        .from('profiles')
        .select('plan')
        .eq('id', session.user.id)
        .single()
      setIsPro(['pro', 'standard', 'premium'].includes(profile?.plan ?? ''))

      // Fetch entries with attachment counts
      const { data, error: err } = await supabase
        .from('journal_entries')
        .select('id, title, content, mood, created_at, archived_at, journal_attachments(id)')
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

  function handleSaved(_entry: JournalEntry) {
    setShowNew(false)
    setEditing(null)
    load() // Refresh to pick up new attachment counts
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
        isPro={isPro}
        onClose={() => setShowNew(false)}
        onSaved={handleSaved}
      />

      <EntryEditor
        visible={!!editing}
        entry={editing}
        isPro={isPro}
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
  emptyBtnText: { color: colors.white, fontWeight: '600', fontFamily: font.semibold, fontSize: 15 },

  // Error / retry
  retryBtn: { marginTop: 12, backgroundColor: colors.accent, borderRadius: radius.md, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { ...buttonLabel, color: colors.white },
})

const editor = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: colors.borderHair,
  },
  headerBtn: { minWidth: 70 },
  cancel: { fontSize: 16, fontFamily: font.regular, color: colors.textMuted },
  title:  { flex: 1, fontSize: 17, fontWeight: '600', fontFamily: font.semibold, color: colors.textPrimary, textAlign: 'center' },
  save:   { fontSize: 16, fontWeight: '600', fontFamily: font.semibold, color: colors.accent, textAlign: 'right' },

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

  // Pro gate row
  proGateRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: colors.surface2, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
  },
  proGateText: { fontSize: 13, fontFamily: font.medium, color: colors.textSubtle, flex: 1 },

  // Attachment chip list
  chipList: { gap: 8, marginBottom: 10 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    paddingVertical: 8, paddingHorizontal: 10,
    overflow: 'hidden',
  },
  chipThumb: { width: 40, height: 40, borderRadius: 6, backgroundColor: colors.surface2 },
  chipIconWrap: { width: 40, height: 40, borderRadius: 6, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  chipName: { fontSize: 13, fontFamily: font.medium, color: colors.textPrimary, flex: 1 },
  chipPending: { fontSize: 11, fontFamily: font.regular, color: colors.textSubtle, marginTop: 1 },

  // Attach button
  attachBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 11, paddingHorizontal: 16,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.accent,
    borderStyle: 'dashed',
  },
  attachBtnText: { fontSize: 14, fontFamily: font.medium, color: colors.accent },

  // Delete
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 32, alignSelf: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  deleteBtnText: { fontSize: 14, fontFamily: font.medium, color: colors.danger },
})
