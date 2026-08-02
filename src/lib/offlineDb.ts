import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

// Generic "last known good" cache for read models (dashboard summary, recent
// sales, low stock, etc). Business rule IMC-002 #8 requires offline data to
// sync safely without duplicates, this store is read-cache only (keyed by
// a stable string key, last write wins), the write path for offline
// mutations belongs to a future module (Sales/Inventory), not the Dashboard.

interface ImageCareDB extends DBSchema {
  cache: {
    key: string
    value: {
      key: string
      data: unknown
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
  await db.put('cache', { key, data, cachedAt: new Date().toISOString() })
}

export async function cacheGet<T>(key: string): Promise<{ data: T; cachedAt: string } | null> {
  const db = await getDb()
  const record = await db.get('cache', key)
  if (!record) return null
  return { data: record.data as T, cachedAt: record.cachedAt }
}
