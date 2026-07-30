import type { Play } from './types'

const DB_NAME = 'rotation'
const DB_VERSION = 1

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('plays')) {
        const plays = db.createObjectStore('plays', { keyPath: 'id' })
        plays.createIndex('ts', 'ts')
      }
      if (!db.objectStoreNames.contains('kv')) {
        db.createObjectStore('kv')
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
    req.onblocked = () => reject(new Error('IndexedDB open blocked'))
  })
  return dbPromise
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'))
  })
}

function reqResult<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function putPlays(plays: Play[]): Promise<void> {
  if (plays.length === 0) return
  const db = await open()
  // Chunked so one huge import doesn't hold a single transaction forever
  const CHUNK = 4000
  for (let i = 0; i < plays.length; i += CHUNK) {
    const tx = db.transaction('plays', 'readwrite')
    const store = tx.objectStore('plays')
    for (const p of plays.slice(i, i + CHUNK)) store.put(p)
    await txDone(tx)
  }
}

export async function getAllPlays(): Promise<Play[]> {
  const db = await open()
  const tx = db.transaction('plays', 'readonly')
  return reqResult(tx.objectStore('plays').getAll() as IDBRequest<Play[]>)
}

export async function countPlays(): Promise<number> {
  const db = await open()
  const tx = db.transaction('plays', 'readonly')
  return reqResult(tx.objectStore('plays').count())
}

export async function clearPlays(source?: 'lastfm' | 'csv'): Promise<number> {
  const db = await open()
  if (!source) {
    const tx = db.transaction('plays', 'readwrite')
    tx.objectStore('plays').clear()
    await txDone(tx)
    return 0
  }
  const all = await getAllPlays()
  const doomed = all.filter((p) => p.source === source)
  const CHUNK = 4000
  for (let i = 0; i < doomed.length; i += CHUNK) {
    const tx = db.transaction('plays', 'readwrite')
    const store = tx.objectStore('plays')
    for (const p of doomed.slice(i, i + CHUNK)) store.delete(p.id)
    await txDone(tx)
  }
  return doomed.length
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const db = await open()
  const tx = db.transaction('kv', 'readonly')
  return reqResult(tx.objectStore('kv').get(key) as IDBRequest<T | undefined>)
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  const db = await open()
  const tx = db.transaction('kv', 'readwrite')
  tx.objectStore('kv').put(value, key)
  await txDone(tx)
}

/** Ask the browser not to evict our data under storage pressure. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist()
  } catch {
    /* unsupported */
  }
  return false
}
