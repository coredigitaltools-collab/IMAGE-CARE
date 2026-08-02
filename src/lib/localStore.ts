import { cacheGet, cacheSet } from './offlineDb'
import type { SyncQueueItem } from '../types/settings'

// Guards against a real race: on a cold IndexedDB, two hooks can both call
// a seeding function (e.g. listProducts) before either has finished
// writing its seed, each would otherwise generate its own random IDs and
// the loser's write clobbers the winner's, leaving stale references (e.g.
// a list page linking to an ID the detail page can no longer find).
// Concurrent callers for the same key now share a single in-flight promise.
const inFlight = new Map<string, Promise<unknown>>()

export async function withSingleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key)
  if (existing) return existing as Promise<T>
  const promise = fn().finally(() => inFlight.delete(key))
  inFlight.set(key, promise)
  return promise
}

// Every write made while Supabase isn't configured lands here first. This
// is intentionally the same storage the Dashboard already reads through
// (see services/dashboardService.ts), one offline-first data layer for
// the whole app, per IMC-004 §3.1 and IMC-005 §6.

export async function getCollection<T>(key: string, seedFn: () => T[]): Promise<T[]> {
  const cached = await cacheGet<T[]>(key)
  if (cached) return cached.data
  return withSingleFlight(key, async () => {
    // Re-check after acquiring the lock, another caller may have just seeded it.
    const recheck = await cacheGet<T[]>(key)
    if (recheck) return recheck.data
    const seeded = seedFn()
    await cacheSet(key, seeded)
    return seeded
  })
}

export async function setCollection<T>(key: string, value: T[]): Promise<void> {
  await cacheSet(key, value)
}

export async function getSingleton<T>(key: string, seedFn: () => T): Promise<T> {
  const cached = await cacheGet<T>(key)
  if (cached) return cached.data
  return withSingleFlight(key, async () => {
    const recheck = await cacheGet<T>(key)
    if (recheck) return recheck.data
    const seeded = seedFn()
    await cacheSet(key, seeded)
    return seeded
  })
}

export async function setSingleton<T>(key: string, value: T): Promise<void> {
  await cacheSet(key, value)
}

const SYNC_QUEUE_KEY = 'sync-queue'

export async function getSyncQueue(): Promise<SyncQueueItem[]> {
  const cached = await cacheGet<SyncQueueItem[]>(SYNC_QUEUE_KEY)
  return cached?.data ?? []
}

export async function enqueueSync(item: Omit<SyncQueueItem, 'id' | 'createdAt'>): Promise<void> {
  const queue = await getSyncQueue()
  queue.push({ ...item, id: crypto.randomUUID(), createdAt: new Date().toISOString() })
  await cacheSet(SYNC_QUEUE_KEY, queue)
}

/** Simulates pushing every queued offline change to the backend. Since
 *  there's no live Supabase project connected yet, this just clears the
 *  queue and stamps the affected records as synced, replace with a real
 *  push loop once Supabase is configured (see lib/supabaseClient.ts). */
export async function clearSyncQueue(): Promise<void> {
  await cacheSet(SYNC_QUEUE_KEY, [])
}
