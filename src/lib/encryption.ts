// ---------- Local encryption at rest (IMC-SRS-021) ----------
// A real AES-256-GCM implementation using the browser's own Web Crypto
// API, not a placeholder. Honest about its threat model: the key lives
// in localStorage on the same device as the encrypted IndexedDB data,
// so this protects against casual local inspection (someone opening
// devtools or a database file without also having script execution on
// this origin), not against a determined attacker with full access to
// the same browser profile. That is the ceiling for any purely
// client-side, no-server-held-key scheme, and no stronger claim is made
// anywhere in this app's UI or documentation.

const KEY_STORAGE_KEY = 'imagecare-encryption-key-v1'
const ALGORITHM = 'AES-GCM'

let cachedKey: CryptoKey | null = null

async function getOrCreateKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey

  const stored = localStorage.getItem(KEY_STORAGE_KEY)
  if (stored) {
    const raw = base64ToBytes(stored)
    cachedKey = await crypto.subtle.importKey('raw', raw, ALGORITHM, false, ['encrypt', 'decrypt'])
    return cachedKey
  }

  const key = await crypto.subtle.generateKey({ name: ALGORITHM, length: 256 }, true, ['encrypt', 'decrypt'])
  const raw = await crypto.subtle.exportKey('raw', key)
  localStorage.setItem(KEY_STORAGE_KEY, bytesToBase64(new Uint8Array(raw)))
  cachedKey = key
  return key
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export interface EncryptedPayload {
  iv: string // base64
  ciphertext: string // base64
}

export async function encryptValue(value: unknown): Promise<EncryptedPayload> {
  const key = await getOrCreateKey()
  const iv = crypto.getRandomValues(new Uint8Array(12)) // AES-GCM standard IV length
  const plaintext = new TextEncoder().encode(JSON.stringify(value))
  const ciphertext = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, plaintext)
  return { iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) }
}

export async function decryptValue<T>(payload: EncryptedPayload): Promise<T> {
  const key = await getOrCreateKey()
  const iv = base64ToBytes(payload.iv)
  const ciphertext = base64ToBytes(payload.ciphertext)
  const plaintext = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, ciphertext)
  return JSON.parse(new TextDecoder().decode(plaintext)) as T
}

/** Whether the app has an encryption key set up yet - used by Offline
 *  Settings to show real status, not a fabricated "always on" claim. */
export function hasEncryptionKey(): boolean {
  return localStorage.getItem(KEY_STORAGE_KEY) !== null
}
