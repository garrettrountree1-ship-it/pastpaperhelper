/**
 * Tiny IndexedDB store for rendered lesson documents.
 *
 * Signed storage URLs change on every load, so re-fetching and re-rendering a
 * PDF each time a teacher opens the workspace makes the pane feel like it is
 * "always loading". We keep the rendered page images in the browser keyed by
 * the material id, so a document renders once and then opens instantly.
 */

const DB_NAME = "pph-doc-cache";
const STORE = "docs";
const VERSION = 1;
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30; // 30 days

export type CachedDoc = { pages: string[]; savedAt: number };

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function readCachedDoc(key: string): Promise<string[] | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      request.onsuccess = () => {
        const value = request.result as CachedDoc | undefined;
        if (!value?.pages?.length) return resolve(null);
        if (Date.now() - value.savedAt > MAX_AGE_MS) return resolve(null);
        resolve(value.pages);
      };
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function writeCachedDoc(key: string, pages: string[]): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    db.transaction(STORE, "readwrite")
      .objectStore(STORE)
      .put({ pages, savedAt: Date.now() } satisfies CachedDoc, key);
  } catch {
    // Cache writes are best-effort only.
  }
}

export async function clearCachedDoc(key: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    db.transaction(STORE, "readwrite").objectStore(STORE).delete(key);
  } catch {
    // ignore
  }
}

/**
 * Slide decks and converted Word documents are cached as JSON so a lesson
 * document renders once and then opens instantly, even though the signed
 * storage URL changes on every load.
 */
export type CachedPayload<T> = { payload: T; savedAt: number };

export async function readCachedJson<T>(key: string): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      request.onsuccess = () => {
        const value = request.result as CachedPayload<T> | undefined;
        if (!value || value.payload === undefined) return resolve(null);
        if (Date.now() - value.savedAt > MAX_AGE_MS) return resolve(null);
        resolve(value.payload);
      };
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function writeCachedJson<T>(key: string, payload: T): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    db.transaction(STORE, "readwrite")
      .objectStore(STORE)
      .put({ payload, savedAt: Date.now() } satisfies CachedPayload<T>, key);
  } catch {
    // Cache writes are best-effort only.
  }
}
