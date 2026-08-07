import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { encryptValue, decryptValue, type EncryptedPayload } from './encryption'

// Generic "last known good" cache for read models (dashboard summary, recent
// sales, low stock, etc). Business rule IMC-002 #8 requires offline data to
// sync safely without duplicates, this store is read-cache only (keyed by
// a stable string key, last write wins), the write path for offline
// mutations belongs to a future module (Sales/Inventory), not the Dashboard.
//
// IMC-SRS-021 "local encrypted database cache": every value is encrypted
// with AES-256-GCM before it reaches IndexedDB, transparently, at this one
// choke point every module in the app already funnels through. Records
// written before this feature existed are still readable (the legacy
// `data` field is returned as-is rather than treated as ciphertext and
// crashing), so nothing already stored is lost; every new write from here
// on is encrypted.

interface ImageCareDB extends DBSchema {
  cache: {
    key: string
    value: {
      key: string
      encrypted?: EncryptedPayload
      data?: unknown // legacy, pre-encryption records only
      cachedAt: string // ISO timestamp
    }
  }
}

let dbPromise: Promise<IDBPDatabase<ImageCareDB>> | null = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<ImageCareDB>('imagecare-offline', 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('cache')) {
          db.createObjectStore('cache', { keyPath: 'key' })
        }
      },
    })
  }
  return dbPromise
}

export async function cacheSet<T>(key: string, data: T): Promise<void> {
  const db = await getDb()
  const encrypted = await encryptValue(data)
  await db.put('cache', { key, encrypted, cachedAt: new Date().toISOString() })
}

export async function cacheGet<T>(key: string): Promise<{ data: T; cachedAt: string } | null> {
  const db = await getDb()
  const record = await db.get('cache', key)
  if (!record) return null
  if (record.encrypted) {
    const data = await decryptValue<T>(record.encrypted)
    return { data, cachedAt: record.cachedAt }
  }
  // Legacy plaintext record, written before encryption existed.
  return { data: record.data as T, cachedAt: record.cachedAt }
}

/** Re-encrypts every record currently stored as legacy plaintext, for
 *  Offline Settings' "Encrypt existing data now" action, so a business
 *  doesn't have to wait for ordinary use to rewrite every record. */
export async function encryptAllLegacyRecords(): Promise<number> {
  const db = await getDb()
  const all = await db.getAll('cache')
  let count = 0
  for (const record of all) {
    if (record.encrypted) continue
    const encrypted = await encryptValue(record.data)
    await db.put('cache', { key: record.key, encrypted, cachedAt: record.cachedAt })
    count += 1
  }
  return count
}

export async function countLegacyPlaintextRecords(): Promise<number> {
  const db = await getDb()
  const all = await db.getAll('cache')
  return all.filter((r) => !r.encrypted).length
}
