/**
 * Vault write operations for the mobile app.
 * All writes use direct Supabase calls + expo-crypto SHA-256 audit logs.
 * No web API calls — see AGENTS.md for why.
 */

import * as Crypto from 'expo-crypto'
import { supabase } from '../supabase'
import type { VaultCategory } from '../types/database'

// expo-document-picker and expo-image-picker are native modules not available
// in Expo Go — only in dev/production builds. Dynamic imports let us catch
// the failure gracefully instead of crashing on module load.

// ─── constants ────────────────────────────────────────────────────────────────

const BUCKET = 'vault-documents'
const MAX_FILE_BYTES = 25 * 1024 * 1024  // 25 MB
const SIGNED_URL_EXPIRY = 3600            // 1 hour

// ─── helpers ──────────────────────────────────────────────────────────────────

async function writeAuditLog(params: {
  actorId:      string
  action:       string
  resourceType: string
  resourceId:   string
  metadata:     Record<string, unknown>
}): Promise<void> {
  const { actorId, action, resourceType, resourceId, metadata } = params
  const payload = { actor_id: actorId, action, resource_id: resourceId, metadata }
  const sha256_hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    JSON.stringify(payload),
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase.from('audit_log').insert({
    actor_id:      actorId,
    action,
    resource_type: resourceType,
    resource_id:   resourceId,
    metadata:      metadata as any,
    sha256_hash,
  }).then(() => {})
}

/** Convert ArrayBuffer to lowercase hex string. */
function bufferToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// ─── pick file ────────────────────────────────────────────────────────────────

export type PickedFile = {
  uri:      string
  name:     string
  mimeType: string
  size:     number
}

/** Open the system document picker. Returns null if user cancelled or module unavailable. */
export async function pickDocument(): Promise<PickedFile | null> {
  let DocumentPicker: typeof import('expo-document-picker')
  try {
    DocumentPicker = await import('expo-document-picker')
  } catch {
    return null
  }
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
  })
  if (result.canceled) return null
  const asset = result.assets[0]
  if (!asset) return null
  return {
    uri:      asset.uri,
    name:     asset.name,
    mimeType: asset.mimeType ?? 'application/octet-stream',
    size:     asset.size ?? 0,
  }
}

/** Open the camera to photograph a document. Returns null if user cancelled or module unavailable. */
export async function pickFromCamera(): Promise<PickedFile | null> {
  let ImagePicker: typeof import('expo-image-picker')
  try {
    ImagePicker = await import('expo-image-picker')
  } catch {
    return null
  }
  const { status } = await ImagePicker.requestCameraPermissionsAsync()
  if (status !== 'granted') return null

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.9,
    allowsEditing: false,
  })
  if (result.canceled) return null
  const asset = result.assets[0]
  if (!asset) return null
  return {
    uri:      asset.uri,
    name:     asset.fileName ?? `photo-${Date.now()}.jpg`,
    mimeType: asset.mimeType ?? 'image/jpeg',
    size:     asset.fileSize ?? 0,
  }
}

/** Open the photo library. Returns null if user cancelled or module unavailable. */
export async function pickFromPhotoLibrary(): Promise<PickedFile | null> {
  let ImagePicker: typeof import('expo-image-picker')
  try {
    ImagePicker = await import('expo-image-picker')
  } catch {
    return null
  }
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (status !== 'granted') return null

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.9,
  })
  if (result.canceled) return null
  const asset = result.assets[0]
  if (!asset) return null
  return {
    uri:      asset.uri,
    name:     asset.fileName ?? `image-${Date.now()}.jpg`,
    mimeType: asset.mimeType ?? 'image/jpeg',
    size:     asset.fileSize ?? 0,
  }
}

// ─── upload ───────────────────────────────────────────────────────────────────

export interface UploadDocumentInput {
  file:         PickedFile
  connectionId: string
  displayName:  string
  category:     VaultCategory
  documentDate: string | null  // YYYY-MM-DD or null
  shared:       boolean
}

export async function uploadDocument(input: UploadDocumentInput): Promise<{ error: string | null }> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Not signed in' }
  const userId = session.user.id

  const { file, connectionId, displayName, category, documentDate, shared } = input

  if (!displayName.trim()) return { error: 'Document name is required' }

  if (file.size > MAX_FILE_BYTES) {
    return { error: `File exceeds 25 MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB)` }
  }

  // Read file bytes
  let arrayBuffer: ArrayBuffer
  try {
    const response = await fetch(file.uri)
    arrayBuffer = await response.arrayBuffer()
  } catch (e) {
    return { error: 'Could not read file. Try again.' }
  }

  // Compute SHA-256 on raw bytes (matches web platform)
  const hashBuffer = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, arrayBuffer)
  const sha256Hash = bufferToHex(hashBuffer)

  // Dedup check
  const { data: existing } = await supabase
    .from('vault_documents')
    .select('id, display_name')
    .eq('connection_id', connectionId)
    .eq('sha256_hash', sha256Hash)
    .is('deleted_at', null)
    .maybeSingle()

  if (existing) {
    return { error: `This file was already uploaded as "${existing.display_name}".` }
  }

  // Upload to Supabase Storage
  const storagePath = `${connectionId}/${userId}/${sha256Hash}`
  const blob = new Blob([arrayBuffer], { type: file.mimeType })

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, blob, {
      contentType: file.mimeType,
      upsert: false,
    })

  if (uploadError && uploadError.message !== 'The resource already exists') {
    return { error: 'Upload failed. Check your connection and try again.' }
  }

  // Insert DB row
  const { data: doc, error: insertError } = await supabase
    .from('vault_documents')
    .insert({
      connection_id:   connectionId,
      owner_id:        userId,
      shared,
      display_name:    displayName.trim(),
      category,
      document_date:   documentDate || null,
      storage_path:    storagePath,
      sha256_hash:     sha256Hash,
      file_size_bytes: file.size,
      content_type:    file.mimeType,
    })
    .select()
    .single()

  if (insertError || !doc) {
    // Clean up orphaned storage object
    await supabase.storage.from(BUCKET).remove([storagePath])
    return { error: insertError?.message ?? 'Upload failed' }
  }

  // Audit log
  writeAuditLog({
    actorId:      userId,
    action:       'vault_document.uploaded',
    resourceType: 'vault_documents',
    resourceId:   doc.id,
    metadata:     { document: doc },
  })

  return { error: null }
}

// ─── delete ───────────────────────────────────────────────────────────────────

export async function deleteDocument(id: string): Promise<{ error: string | null }> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Not signed in' }
  const userId = session.user.id

  // Fetch before-snapshot for audit trail
  const { data: doc } = await supabase
    .from('vault_documents')
    .select('*')
    .eq('id', id)
    .eq('owner_id', userId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!doc) return { error: 'Document not found' }

  // Soft-delete
  const { error: deleteError } = await supabase
    .from('vault_documents')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('owner_id', userId)

  if (deleteError) return { error: deleteError.message }

  // Audit log with full before-snapshot
  writeAuditLog({
    actorId:      userId,
    action:       'vault_document.deleted',
    resourceType: 'vault_documents',
    resourceId:   id,
    metadata:     { before: doc },
  })

  return { error: null }
}

// ─── toggle shared ────────────────────────────────────────────────────────────

export async function toggleDocumentShared(id: string, shared: boolean): Promise<{ error: string | null }> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { error: 'Not signed in' }
  const userId = session.user.id

  // Snapshot the document before update for audit trail
  const { data: before } = await supabase
    .from('vault_documents')
    .select('id, shared, file_name')
    .eq('id', id)
    .eq('owner_id', userId)
    .maybeSingle()

  const { error } = await supabase
    .from('vault_documents')
    .update({ shared })
    .eq('id', id)
    .eq('owner_id', userId)

  if (!error) {
    writeAuditLog({
      actorId:      userId,
      action:       'vault_document.updated',
      resourceType: 'vault_documents',
      resourceId:   id,
      metadata:     { before: before ?? null, after: { shared }, field: 'shared' },
    }).catch(() => {})
  }

  return { error: error?.message ?? null }
}

// ─── download (signed URL) ────────────────────────────────────────────────────

export async function getDocumentSignedUrl(
  storagePath: string,
  displayName: string,
): Promise<{ url: string | null; error: string | null }> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRY, {
      download: displayName,
    })

  if (error || !data?.signedUrl) {
    return { url: null, error: error?.message ?? 'Could not generate download URL' }
  }

  return { url: data.signedUrl, error: null }
}
