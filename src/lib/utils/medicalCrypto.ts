/**
 * Medical data encryption utility — mobile
 *
 * AES-256-GCM, compatible with the web implementation in src/lib/medical-crypto.ts.
 * Format: ENC:v1:<iv_base64>.<tag_base64>.<ciphertext_base64>
 *
 * The encryption key is never bundled. It is fetched from the get-medical-key
 * Edge Function after login and stored in expo-secure-store (device keychain).
 * Call loadMedicalKey() on login and clearMedicalKey() on sign-out.
 */

import { gcm } from '@noble/ciphers/aes'
import * as SecureStore from 'expo-secure-store'
import { supabase } from '../supabase'

const PREFIX = 'ENC:v1:'
const SECURE_STORE_KEY = 'medical_enc_key'

// ─── In-memory cache so we don't hit SecureStore on every field ───────────────

let _cachedKey: Uint8Array | null = null

function hexToBytes(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2)
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return arr
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

function fromBase64(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, 'base64'))
}

// ─── Key lifecycle ────────────────────────────────────────────────────────────

/**
 * Fetch the encryption key from the Edge Function and persist it in SecureStore.
 * Call this immediately after a successful sign-in.
 */
export async function loadMedicalKey(): Promise<void> {
  try {
    const { data, error } = await supabase.functions.invoke('get-medical-key')
    if (error || !data?.key) {
      console.warn('[medicalCrypto] Failed to fetch medical key:', error?.message ?? 'no key returned')
      return
    }
    await SecureStore.setItemAsync(SECURE_STORE_KEY, data.key)
    _cachedKey = hexToBytes(data.key)
  } catch (err) {
    console.warn('[medicalCrypto] loadMedicalKey error:', err)
  }
}

/**
 * Remove the encryption key from SecureStore and memory.
 * Call this immediately before sign-out.
 */
export async function clearMedicalKey(): Promise<void> {
  _cachedKey = null
  await SecureStore.deleteItemAsync(SECURE_STORE_KEY)
}

/**
 * Load the key from SecureStore into memory (call on app start if already signed in).
 */
export async function restoreMedicalKey(): Promise<void> {
  try {
    const hex = await SecureStore.getItemAsync(SECURE_STORE_KEY)
    if (hex) _cachedKey = hexToBytes(hex)
  } catch (err) {
    console.warn('[medicalCrypto] restoreMedicalKey error:', err)
  }
}

async function getKey(): Promise<Uint8Array> {
  if (_cachedKey) return _cachedKey
  // Try restoring from SecureStore on first use
  const hex = await SecureStore.getItemAsync(SECURE_STORE_KEY)
  if (!hex) throw new Error('Medical encryption key not available — call loadMedicalKey() after login')
  _cachedKey = hexToBytes(hex)
  return _cachedKey
}

// ─── Crypto ───────────────────────────────────────────────────────────────────

export async function encrypt(plaintext: string): Promise<string> {
  const key = await getKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipher = gcm(key, iv)
  const encoded = new TextEncoder().encode(plaintext)
  const ctWithTag = cipher.encrypt(encoded) // noble appends 16-byte tag at end
  const ct  = ctWithTag.slice(0, ctWithTag.length - 16)
  const tag = ctWithTag.slice(ctWithTag.length - 16)
  return `${PREFIX}${toBase64(iv)}.${toBase64(tag)}.${toBase64(ct)}`
}

export async function decrypt(ciphertext: string): Promise<string> {
  // Backward-compat: return plaintext values unchanged (pre-migration rows)
  if (!ciphertext.startsWith(PREFIX)) return ciphertext
  const key = await getKey()
  const rest  = ciphertext.slice(PREFIX.length)
  const parts = rest.split('.')
  if (parts.length !== 3) throw new Error('Invalid ciphertext format')
  const [ivB64, tagB64, ctB64] = parts
  const iv  = fromBase64(ivB64)
  const tag = fromBase64(tagB64)
  const ct  = fromBase64(ctB64)
  // noble expects ct + tag concatenated
  const ctWithTag = new Uint8Array(ct.length + tag.length)
  ctWithTag.set(ct)
  ctWithTag.set(tag, ct.length)
  const cipher = gcm(key, iv)
  const plain  = cipher.decrypt(ctWithTag)
  return new TextDecoder().decode(plain)
}

export async function encryptField(val: string | null | undefined): Promise<string | null> {
  if (!val) return val ?? null
  return encrypt(val)
}

export async function decryptField(val: string | null | undefined): Promise<string | null> {
  if (!val) return val ?? null
  return decrypt(val)
}
