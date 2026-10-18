// oxlint-disable max-classes-per-file -- the two KVStorage adapters share this public module path; splitting them would move an exported import
import { storage } from '@repo/store';

import type { KVStorage } from './types';

/**
 * Platform-aware persistence adapter using @repo/store.
 *
 * Uses MMKV on React Native and localStorage on web, provided by the
 * store package's platform-specific storage module.
 */
export class PlatformStorageKV implements KVStorage {
  // oxlint-disable-next-line eslint/class-methods-use-this -- KVStorage method; the adapter delegates to the shared platform storage
  async getItem(key: string): Promise<string | null> {
    try {
      return (await storage.getItem(key)) ?? null;
    } catch (error) {
      console.warn(`Storage getItem failed for key "${key}":`, error);
      return null;
    }
  }

  // oxlint-disable-next-line eslint/class-methods-use-this -- KVStorage method; the adapter delegates to the shared platform storage
  async setItem(key: string, value: string): Promise<void> {
    try {
      await storage.setItem(key, value);
    } catch (error) {
      console.warn(`Storage setItem failed for key "${key}":`, error);
    }
  }

  // oxlint-disable-next-line eslint/class-methods-use-this -- KVStorage method; the adapter delegates to the shared platform storage
  async removeItem(key: string): Promise<void> {
    try {
      await storage.removeItem(key);
    } catch (error) {
      console.warn(`Storage removeItem failed for key "${key}":`, error);
    }
  }
}

/** Settles with the request's result; rejects on a request error or a transaction error. */
const settleRequest = async <T>(request: IDBRequest<T>, transaction: IDBTransaction, failure: string): Promise<T> =>
  // oxlint-disable-next-line promise/avoid-new -- promisifies the IndexedDB request callbacks
  await new Promise<T>((resolve, reject) => {
    request.onsuccess = () => {
      resolve(request.result);
    };
    // oxlint-disable-next-line unicorn/prefer-add-event-listener -- IDB handlers are on* properties here, like onsuccess
    request.onerror = () => {
      reject(request.error ?? new Error(failure));
    };
    // oxlint-disable-next-line unicorn/prefer-add-event-listener -- IDB handlers are on* properties here, like onsuccess
    transaction.onerror = () => {
      reject(transaction.error ?? new Error('Transaction failed'));
    };
  });

/**
 * IndexedDB-based persistence adapter.
 *
 * This is the preferred storage option for modern browsers, providing
 * robust asynchronous storage with proper transaction support and
 * generous quota limits (typically hundreds of MB to GB).
 *
 * Characteristics:
 * - **Asynchronous**: All operations are truly async and non-blocking
 * - **Large Quota**: Usually 10% of available disk space (GB range)
 * - **Transactional**: ACID guarantees for data consistency
 * - **Structured**: Can store complex objects, not just strings
 * - **Versioned**: Schema migrations supported through version upgrades
 * - **Origin-isolated**: Each domain gets its own database namespace
 *
 * Architecture:
 * - Database: "frappe-sync" (configurable)
 * - Object Store: "kv" (simple key-value pairs)
 * - No indexes: Simple string keys for sync state storage
 *
 * Transaction Model:
 * - Read operations use "readonly" transactions (can run in parallel)
 * - Write operations use "readwrite" transactions (serialized)
 * - Failed operations automatically rollback the transaction
 *
 * Error Scenarios:
 * - IndexedDB not available (older browsers, private browsing)
 * - Database blocked by another connection
 * - Quota exceeded (rare with generous limits)
 * - Transaction abort due to concurrent modifications
 * - Database corruption or version conflicts
 *
 * Performance Notes:
 * - Connection pooling: Single database connection shared across operations
 * - Async initialization: Database opens lazily on first access
 * - Transaction batching: Consider batching multiple operations when possible
 */
export class IndexedDBKV implements KVStorage {
  private readonly dbPromise: Promise<IDBDatabase>;
  private readonly dbName: string;
  private readonly store: string;

  constructor(dbName = 'frappe-sync', store = 'kv') {
    this.dbName = dbName;
    this.store = store;
    // oxlint-disable-next-line promise/avoid-new -- promisifies the IndexedDB open callbacks
    this.dbPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('IndexedDB not available in this environment'));
        return;
      }
      const openRequest = indexedDB.open(dbName, 1);
      openRequest.onupgradeneeded = () => {
        const database = openRequest.result;
        if (!database.objectStoreNames.contains(store)) {
          database.createObjectStore(store);
        }
      };
      openRequest.onsuccess = () => {
        resolve(openRequest.result);
      };
      // oxlint-disable-next-line unicorn/prefer-add-event-listener -- IDB handlers are on* properties here, like onsuccess/onupgradeneeded
      openRequest.onerror = () => {
        reject(openRequest.error ?? new Error('Failed to open IndexedDB'));
      };
    });
  }

  async getItem(key: string): Promise<string | null> {
    const database = await this.dbPromise;
    const transaction = database.transaction(this.store, 'readonly');
    const getRequest = transaction.objectStore(this.store).get(key);
    const result: unknown = await settleRequest(getRequest, transaction, `Failed to get key "${key}"`);
    // SAFETY: this store only ever holds the string values written by setItem.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
    return (result as string | undefined) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    const database = await this.dbPromise;
    const transaction = database.transaction(this.store, 'readwrite');
    const putRequest = transaction.objectStore(this.store).put(value, key);
    await settleRequest(putRequest, transaction, `Failed to set key "${key}"`);
  }

  /**
   * Removes a key from IndexedDB.
   * Uses a readwrite transaction with automatic error handling.
   *
   * @param key - The storage key to remove
   */
  async removeItem(key: string): Promise<void> {
    try {
      const database = await this.dbPromise;
      const transaction = database.transaction(this.store, 'readwrite');
      const deleteRequest = transaction.objectStore(this.store).delete(key);
      await settleRequest(deleteRequest, transaction, `Failed to delete key "${key}"`);
    } catch (error) {
      console.warn(`IndexedDB removeItem failed for key "${key}":`, error);
      // Don't throw - allow graceful degradation
    }
  }
}
