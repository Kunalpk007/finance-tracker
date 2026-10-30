/* ============================================================================
   LocalAdapter — IndexedDB-backed, replacing the original app's synchronous
   localStorage blob (T3: "localStorage holds the entire state as one JSON
   blob... blocking boot cost as history grows"). IndexedDB is async and has a
   far higher storage ceiling, which unblocks the main thread on boot.

   Scope note: this still stores the whole state as ONE document, not one row
   per transaction. That's a deliberate, smaller step — per-row storage (the
   real scaling fix, ARCHITECTURE.md §7) matters once there's concurrent
   multi-device writers, which only exists once RemoteAdapter is live. For a
   single device reading/writing its own local cache, one document is simpler
   and correct; it just isn't the final scaling answer.
============================================================================ */
import type { StoreState } from '../domain/types';
import type { StoreAdapter } from './adapter';

const DB_NAME = 'household_tracker';
const DB_VERSION = 1;
const STORE_NAME = 'state';
const DOC_KEY = 'current';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export class LocalAdapter implements StoreAdapter {
  name = 'local';

  async load(): Promise<StoreState | null> {
    try {
      const db = await openDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(DOC_KEY);
        req.onsuccess = () => resolve((req.result as StoreState) ?? null);
        req.onerror = () => reject(req.error);
      });
    } catch {
      return null;
    }
  }

  async save(state: StoreState): Promise<boolean> {
    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(state, DOC_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      return true;
    } catch {
      return false;
    }
  }

  /** Backup/export (D13/T5): copy or download the whole state as JSON. */
  async exportJson(state: StoreState): Promise<string> {
    return JSON.stringify(state, null, 2);
  }

  async importJson(json: string): Promise<StoreState> {
    return JSON.parse(json) as StoreState;
  }
}
