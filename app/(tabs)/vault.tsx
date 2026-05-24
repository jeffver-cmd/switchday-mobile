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
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Linking,
  ActionSheetIOS,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useState, useCallback } from 'react'
import { Ionicons } from '@expo/vector-icons'
import { useVault, VaultDoc } from '@/lib/hooks/useVault'
import {
  uploadDocument,
  deleteDocument,
  toggleDocumentShared,
  getDocumentSignedUrl,
  pickDocument,
  pickFromCamera,
  pickFromPhotoLibrary,
  PickedFile,
} from '@/lib/api/vault'
import type { VaultCategory } from '@/lib/types/database'
import { colors, radius, shadow, font } from '@/lib/theme'

// ─── constants ────────────────────────────────────────────────────────────────

const CATEGORY_OPTIONS: VaultCategory[] = ['court_order', 'agreement', 'medical', 'school', 'financial', 'other']

const CATEGORY_LABELS: Record<VaultCategory, string> = {
  court_order: 'Court Order',
  agreement:   'Agreement',
  medical:     'Medical',
  school:      'School',
  financial:   'Financial',
  other:       'Other',
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function truncateHash(hash: string): string {
  return hash.slice(0, 8) + '…' + hash.slice(-6)
}

function fileIconName(contentType: string): React.ComponentProps<typeof Ionicons>['name'] {
  if (contentType === 'application/pdf') return 'document-text'
  if (contentType.startsWith('image/')) return 'image'
  if (contentType.includes('word') || contentType.includes('document')) return 'document'
  return 'document-outline'
}

function fileIconColor(contentType: string): string {
  if (contentType === 'application/pdf') return colors.danger
  if (contentType.startsWith('image/')) return colors.success
  return colors.textMuted as string
}

// ─── document row ─────────────────────────────────────────────────────────────

interface DocRowProps {
  doc: VaultDoc
  onDownload: (doc: VaultDoc) => void
  onDelete: (doc: VaultDoc) => void
  onToggleShared: (doc: VaultDoc) => void
  downloadingId: string | null
}

function DocRow({ doc, onDownload, onDelete, onToggleShared, downloadingId }: DocRowProps) {
  const [expanded, setExpanded] = useState(false)
  const downloading = downloadingId === doc.id

  return (
    <TouchableOpacity
      style={styles.docRow}
      onPress={() => setExpanded(e => !e)}
      activeOpacity={0.85}
    >
      {/* Main row */}
      <View style={styles.docMain}>
        <View style={styles.docIconWrap}>
          <Ionicons name={fileIconName(doc.contentType)} size={22} color={fileIconColor(doc.contentType)} />
        </View>

        <View style={styles.docInfo}>
          <Text style={styles.docName} numberOfLines={1}>{doc.displayName}</Text>
          <View style={styles.docMeta}>
            <View style={[styles.catBadge, { backgroundColor: colors.surface2 }]}>
              <Text style={styles.catText}>{CATEGORY_LABELS[doc.category]}</Text>
            </View>
            <Text style={styles.docMetaText}>
              {doc.documentDate
                ? formatDate(doc.documentDate + 'T12:00:00Z')
                : formatDate(doc.createdAt)}
            </Text>
            <Text style={styles.docMetaText}>· {formatBytes(doc.fileSizeBytes)}</Text>
          </View>
        </View>

        {/* Privacy indicator */}
        <View style={[styles.privacyBadge, { backgroundColor: doc.shared ? colors.accentSoft : colors.surface2 }]}>
          <Ionicons
            name={doc.shared ? 'people' : 'lock-closed'}
            size={11}
            color={doc.shared ? colors.accent : colors.textMuted as string}
          />
        </View>
      </View>

      {/* Expanded detail */}
      {expanded && (
        <View style={styles.docExpanded}>
          {/* Hash */}
          <Text style={styles.hashText}>SHA-256: {truncateHash(doc.sha256Hash)}</Text>

          {/* Actions row */}
          <View style={styles.docActions}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.downloadBtn]}
              onPress={() => onDownload(doc)}
              disabled={downloading}
            >
              {downloading
                ? <ActivityIndicator size="small" color={colors.accent} />
                : <Ionicons name="download-outline" size={15} color={colors.accent} />}
              <Text style={[styles.actionBtnText, { color: colors.accent }]}>
                {downloading ? 'Opening…' : 'Open'}
              </Text>
            </TouchableOpacity>

            {doc.isMine && (
              <>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.shareBtn]}
                  onPress={() => onToggleShared(doc)}
                >
                  <Ionicons
                    name={doc.shared ? 'lock-closed-outline' : 'people-outline'}
                    size={15}
                    color={colors.textSecondary as string}
                  />
                  <Text style={[styles.actionBtnText, { color: colors.textSecondary as string }]}>
                    {doc.shared ? 'Make private' : 'Share'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.actionBtn, styles.deleteBtn]}
                  onPress={() => onDelete(doc)}
                >
                  <Ionicons name="trash-outline" size={15} color={colors.danger} />
                  <Text style={[styles.actionBtnText, { color: colors.danger }]}>Delete</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      )}
    </TouchableOpacity>
  )
}

// ─── upload modal ─────────────────────────────────────────────────────────────

interface UploadModalProps {
  connectionId: string
  onClose: () => void
  onUploaded: () => void
}

function UploadModal({ connectionId, onClose, onUploaded }: UploadModalProps) {
  const [pickedFile, setPickedFile] = useState<PickedFile | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [category, setCategory] = useState<VaultCategory>('court_order')
  const [documentDate, setDocumentDate] = useState('')
  const [shared, setShared] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const handlePickSource = useCallback(() => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Choose Document or File', 'Take Photo', 'Photo Library'],
          cancelButtonIndex: 0,
        },
        async (index) => {
          if (index === 0) return
          let file: PickedFile | null = null
          if (index === 1) file = await pickDocument()
          if (index === 2) file = await pickFromCamera()
          if (index === 3) file = await pickFromPhotoLibrary()
          if (file) {
            setPickedFile(file)
            if (!displayName) setDisplayName(file.name.replace(/\.[^.]+$/, ''))
          }
        },
      )
    } else {
      // Android: use document picker (handles all types)
      pickDocument().then(file => {
        if (file) {
          setPickedFile(file)
          if (!displayName) setDisplayName(file.name.replace(/\.[^.]+$/, ''))
        }
      }).catch(() => {})
    }
  }, [displayName])

  const handleUpload = async () => {
    if (!pickedFile) { setErr('Select a file first'); return }
    if (!displayName.trim()) { setErr('Document name is required'); return }

    setUploading(true)
    setErr(null)

    const { error } = await uploadDocument({
      file: pickedFile,
      connectionId,
      displayName: displayName.trim(),
      category,
      documentDate: documentDate.trim() || null,
      shared,
    })

    setUploading(false)

    if (error) { setErr(error); return }
    onUploaded()
  }

  return (
    <Modal animationType="slide" presentationStyle="pageSheet" onRequestClose={!uploading ? onClose : undefined}>
      <SafeAreaView style={uploadStyles.container}>
        {/* Header */}
        <View style={uploadStyles.header}>
          <TouchableOpacity onPress={onClose} disabled={uploading} style={uploadStyles.cancelBtn}>
            <Text style={[uploadStyles.cancelText, uploading && { opacity: 0.4 }]}>Cancel</Text>
          </TouchableOpacity>
          <Text style={uploadStyles.title}>Upload Document</Text>
          <TouchableOpacity onPress={handleUpload} disabled={!pickedFile || uploading} style={uploadStyles.saveBtn}>
            {uploading
              ? <ActivityIndicator size="small" color={colors.accent} />
              : <Text style={[uploadStyles.saveText, (!pickedFile) && { opacity: 0.4 }]}>Upload</Text>}
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={uploadStyles.form} keyboardShouldPersistTaps="handled">
            {err ? (
              <View style={uploadStyles.errBox}>
                <Text style={uploadStyles.errText}>{err}</Text>
              </View>
            ) : null}

            {/* File picker */}
            <TouchableOpacity style={uploadStyles.filePicker} onPress={handlePickSource} disabled={uploading}>
              <Ionicons
                name={pickedFile ? 'document-text' : 'cloud-upload-outline'}
                size={28}
                color={pickedFile ? colors.accent : colors.textSubtle as string}
              />
              {pickedFile ? (
                <>
                  <Text style={uploadStyles.filePickerName} numberOfLines={1}>{pickedFile.name}</Text>
                  <Text style={uploadStyles.filePickerSize}>{formatBytes(pickedFile.size)} · Tap to change</Text>
                </>
              ) : (
                <>
                  <Text style={uploadStyles.filePickerPrompt}>Tap to choose a file</Text>
                  <Text style={uploadStyles.filePickerHint}>Any file type · Max 25 MB</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Document name */}
            <Text style={uploadStyles.label}>Document name</Text>
            <TextInput
              style={uploadStyles.input}
              value={displayName}
              onChangeText={setDisplayName}
              placeholder="e.g. Custody Agreement 2025"
              placeholderTextColor={colors.textSubtle as string}
              editable={!uploading}
            />

            {/* Category */}
            <Text style={uploadStyles.label}>Category</Text>
            <View style={uploadStyles.chipRow}>
              {CATEGORY_OPTIONS.map(cat => (
                <TouchableOpacity
                  key={cat}
                  style={[uploadStyles.chip, category === cat && uploadStyles.chipActive]}
                  onPress={() => !uploading && setCategory(cat)}
                >
                  <Text style={[uploadStyles.chipText, category === cat && uploadStyles.chipTextActive]}>
                    {CATEGORY_LABELS[cat]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Document date (optional) */}
            <Text style={uploadStyles.label}>
              Document date <Text style={uploadStyles.labelOptional}>(optional)</Text>
            </Text>
            <TextInput
              style={uploadStyles.input}
              value={documentDate}
              onChangeText={setDocumentDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textSubtle as string}
              keyboardType="numbers-and-punctuation"
              maxLength={10}
              editable={!uploading}
            />

            {/* Shared toggle */}
            <TouchableOpacity
              style={uploadStyles.sharedRow}
              onPress={() => !uploading && setShared(s => !s)}
              activeOpacity={0.8}
            >
              <View style={uploadStyles.sharedInfo}>
                <Text style={uploadStyles.sharedLabel}>
                  {shared ? 'Shared with co-parent' : 'Private (only you)'}
                </Text>
                <Text style={uploadStyles.sharedSub}>
                  {shared
                    ? 'Your co-parent can view and open this document'
                    : 'Only you can see this document'}
                </Text>
              </View>
              <View style={[uploadStyles.toggle, shared && uploadStyles.toggleOn]}>
                <View style={[uploadStyles.toggleThumb, shared && uploadStyles.toggleThumbOn]} />
              </View>
            </TouchableOpacity>

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  )
}

// ─── screen ───────────────────────────────────────────────────────────────────

export default function VaultScreen() {
  const [showUpload, setShowUpload] = useState(false)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)
  const { data, loading, error, refresh } = useVault()

  const handleDownload = useCallback(async (doc: VaultDoc) => {
    if (downloadingId === doc.id) return
    setDownloadingId(doc.id)
    try {
      const { url, error: urlErr } = await getDocumentSignedUrl(doc.storagePath, doc.displayName)
      if (urlErr || !url) {
        Alert.alert('Error', urlErr ?? 'Could not open document')
        return
      }
      await Linking.openURL(url)
    } finally {
      setDownloadingId(null)
    }
  }, [downloadingId])

  const handleDelete = useCallback((doc: VaultDoc) => {
    Alert.alert(
      'Delete document?',
      `"${doc.displayName}" will be permanently removed. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            const { error: delErr } = await deleteDocument(doc.id)
            if (delErr) Alert.alert('Error', delErr)
            else refresh()
          },
        },
      ],
    )
  }, [refresh])

  const handleToggleShared = useCallback(async (doc: VaultDoc) => {
    const { error: togErr } = await toggleDocumentShared(doc.id, !doc.shared)
    if (togErr) Alert.alert('Error', togErr)
    else refresh()
  }, [refresh])

  const isPro = data?.isPro ?? false
  const documents = data?.documents ?? []

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.heading}>Vault</Text>
          <Text style={styles.subheading}>SHA-256 tamper-evident records</Text>
        </View>
        {isPro && (
          <TouchableOpacity
            style={styles.uploadBtn}
            onPress={() => setShowUpload(true)}
          >
            <Ionicons name="cloud-upload-outline" size={16} color={colors.white} />
            <Text style={styles.uploadBtnText}>Upload</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : !isPro ? (
        /* Pro gate */
        <View style={styles.centered}>
          <View style={styles.proGate}>
            <Ionicons name="lock-closed" size={32} color={colors.accent} style={{ marginBottom: 12 }} />
            <Text style={styles.proGateTitle}>Document Vault requires Pro</Text>
            <Text style={styles.proGateSub}>
              Upload court orders, agreements, and records with SHA-256 verification.
            </Text>
            <TouchableOpacity
              style={styles.proGateBtn}
              onPress={() => Linking.openURL('https://switchday.app/app/settings?tab=plan&upgrade=1')}
            >
              <Text style={styles.proGateBtnText}>Upgrade to Pro</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : error && error !== 'no_connection' ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>Something went wrong</Text>
          <TouchableOpacity onPress={refresh}>
            <Text style={[styles.emptySubtitle, { color: colors.accent }]}>Tap to retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={documents}
          keyExtractor={item => item.id}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.accent} />}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item }) => (
            <DocRow
              doc={item}
              onDownload={handleDownload}
              onDelete={handleDelete}
              onToggleShared={handleToggleShared}
              downloadingId={downloadingId}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Ionicons name="folder-open-outline" size={40} color={colors.textSubtle as string} style={{ marginBottom: 12 }} />
              <Text style={styles.emptyTitle}>No documents yet</Text>
              <Text style={styles.emptySubtitle}>
                Upload your first document using the button above.
              </Text>
              <TouchableOpacity style={styles.emptyUploadBtn} onPress={() => setShowUpload(true)}>
                <Ionicons name="cloud-upload-outline" size={15} color={colors.white} />
                <Text style={styles.emptyUploadBtnText}>Upload Document</Text>
              </TouchableOpacity>
            </View>
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Upload modal */}
      {showUpload && isPro && data?.connectionId ? (
        <UploadModal
          connectionId={data.connectionId}
          onClose={() => setShowUpload(false)}
          onUploaded={() => { setShowUpload(false); refresh() }}
        />
      ) : null}
    </SafeAreaView>
  )
}

// ─── styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14,
  },
  heading: { fontSize: 24, fontWeight: '700', fontFamily: font.bold, color: colors.textPrimary },
  subheading: { fontSize: 12, fontFamily: font.regular, color: colors.textSubtle as string, marginTop: 2 },

  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.accent, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  uploadBtnText: { color: colors.white, fontWeight: '600', fontFamily: font.semibold, fontSize: 14 },

  list: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 32, flexGrow: 1 },

  // Doc row
  docRow: {
    backgroundColor: colors.surface, borderRadius: radius.md, padding: 14,
    ...shadow.sm,
  },
  docMain: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  docIconWrap: {
    width: 38, height: 38, borderRadius: radius.sm,
    backgroundColor: colors.surface2,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  docInfo: { flex: 1, minWidth: 0 },
  docName: { fontSize: 14, fontWeight: '600', fontFamily: font.semibold, color: colors.textPrimary, marginBottom: 4 },
  docMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  catBadge: {
    borderRadius: radius.sm - 2, paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, borderColor: colors.border,
  },
  catText: { fontSize: 10, fontWeight: '600', fontFamily: font.semibold, color: colors.textSecondary as string },
  docMetaText: { fontSize: 11, fontFamily: font.regular, color: colors.textSubtle as string },

  privacyBadge: {
    width: 26, height: 26, borderRadius: radius.sm,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    borderWidth: 1, borderColor: colors.border,
  },

  // Expanded
  docExpanded: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.borderHair },
  hashText: { fontSize: 10, fontFamily: 'monospace' as string, color: colors.textSubtle as string, marginBottom: 10 },
  docActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.sm,
    borderWidth: 1,
  },
  actionBtnText: { fontSize: 13, fontWeight: '600', fontFamily: font.semibold },
  downloadBtn: { backgroundColor: colors.accentSoft, borderColor: 'rgba(43,58,92,0.2)' },
  shareBtn: { backgroundColor: colors.surface2, borderColor: colors.border },
  deleteBtn: { backgroundColor: 'rgba(192,72,72,0.08)', borderColor: 'rgba(192,72,72,0.2)' },

  // Pro gate
  proGate: {
    alignItems: 'center', padding: 28, backgroundColor: colors.surface,
    borderRadius: radius.lg, ...shadow.sm, maxWidth: 320,
  },
  proGateTitle: { fontSize: 17, fontWeight: '700', fontFamily: font.bold, color: colors.textPrimary, textAlign: 'center', marginBottom: 8 },
  proGateSub: { fontSize: 13, fontFamily: font.regular, color: colors.textMuted as string, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  proGateBtn: {
    backgroundColor: colors.accent, borderRadius: radius.md,
    paddingHorizontal: 20, paddingVertical: 10,
  },
  proGateBtnText: { color: colors.white, fontWeight: '600', fontFamily: font.semibold, fontSize: 14 },

  // Empty
  emptyBox: { paddingTop: 60, paddingBottom: 40, alignItems: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '600', fontFamily: font.semibold, color: colors.textPrimary, marginBottom: 8, textAlign: 'center' },
  emptySubtitle: { fontSize: 13, fontFamily: font.regular, color: colors.textMuted as string, textAlign: 'center', marginBottom: 20 },
  emptyUploadBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.accent, borderRadius: radius.md,
    paddingHorizontal: 18, paddingVertical: 10,
  },
  emptyUploadBtnText: { color: colors.white, fontWeight: '600', fontFamily: font.semibold, fontSize: 14 },
})

const uploadStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: colors.borderHair,
  },
  cancelBtn: { width: 72 },
  cancelText: { fontSize: 16, fontFamily: font.regular, color: colors.textMuted as string },
  title: { fontSize: 17, fontWeight: '600', fontFamily: font.semibold, color: colors.textPrimary },
  saveBtn: { width: 72, alignItems: 'flex-end' },
  saveText: { fontSize: 16, fontWeight: '600', fontFamily: font.semibold, color: colors.accent },

  form: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 60 },

  errBox: {
    backgroundColor: 'rgba(192,72,72,0.08)',
    borderRadius: radius.sm, padding: 12, marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(192,72,72,0.2)',
  },
  errText: { fontSize: 13, fontFamily: font.regular, color: colors.danger },

  filePicker: {
    alignItems: 'center', justifyContent: 'center',
    minHeight: 100, borderRadius: radius.md, borderWidth: 2,
    borderStyle: 'dashed', borderColor: colors.border,
    backgroundColor: colors.surface2,
    padding: 20, marginBottom: 20, gap: 4,
  },
  filePickerName: { fontSize: 14, fontWeight: '600', fontFamily: font.semibold, color: colors.textPrimary, textAlign: 'center', marginTop: 6 },
  filePickerSize: { fontSize: 11, fontFamily: font.regular, color: colors.textMuted as string },
  filePickerPrompt: { fontSize: 14, fontFamily: font.medium, color: colors.textSecondary as string, marginTop: 8 },
  filePickerHint: { fontSize: 11, fontFamily: font.regular, color: colors.textSubtle as string },

  label: { fontSize: 12, fontWeight: '600', fontFamily: font.semibold, color: colors.textSecondary as string, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6, marginTop: 18 },
  labelOptional: { fontWeight: '400', textTransform: 'none', letterSpacing: 0, color: colors.textSubtle as string },
  input: {
    backgroundColor: colors.surface2, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontFamily: font.regular, color: colors.textPrimary,
  },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: colors.surface2,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { fontSize: 13, fontWeight: '500', fontFamily: font.medium, color: colors.textMuted as string },
  chipTextActive: { color: colors.white },

  sharedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginTop: 20, padding: 14, borderRadius: radius.md,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
  },
  sharedInfo: { flex: 1 },
  sharedLabel: { fontSize: 14, fontWeight: '600', fontFamily: font.semibold, color: colors.textPrimary },
  sharedSub: { fontSize: 12, fontFamily: font.regular, color: colors.textMuted as string, marginTop: 2 },
  toggle: {
    width: 44, height: 26, borderRadius: 13, backgroundColor: colors.border,
    justifyContent: 'center', padding: 2, flexShrink: 0,
  },
  toggleOn: { backgroundColor: colors.accent },
  toggleThumb: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.white,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 2,
  },
  toggleThumbOn: { alignSelf: 'flex-end' },
})
