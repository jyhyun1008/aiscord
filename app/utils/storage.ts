export function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : JSON.parse(raw) as T
  }
  catch {
    return fallback
  }
}

export function saveJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value))
}

// Message history can outgrow localStorage's quota, so it alone lives in IndexedDB
const STORE = 'messages'
let db: Promise<IDBDatabase> | null = null

function openDb() {
  db ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('aiscord', 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return db
}

async function run<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>) {
  const conn = await openDb()
  return new Promise<T>((resolve, reject) => {
    const req = op(conn.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export const idbGet = <T>(key: string) => run<T | undefined>('readonly', s => s.get(key))
export const idbSet = (key: string, value: unknown) => run('readwrite', s => s.put(value, key))
export const idbDelete = (key: string) => run('readwrite', s => s.delete(key))
