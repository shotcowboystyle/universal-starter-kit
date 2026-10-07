import { storage } from '@repo/store';

import type { KVStorage } from './types';

/**
 * Platform-aware persistence adapter using @repo/store.
 *
 * Uses MMKV on React Native and localStorage on web, provided by the
 * store package's platform-specific storage module.
 */
export class PlatformStorageKV implements KVStorage {
  async getItem(key: string): Promise<string | null> {
    try {
      return storage.getItem(key) ?? null;
    } catch (error) {
      console.warn(`Storage getItem failed for key "${key}":`, error);
      return null;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    try {
      storage.setItem(key, value);
    } catch (error) {
      console.warn(`Storage setItem failed for key "${key}":`, error);
    }
  }

  async removeItem(key: string): Promise<void> {
    try {
      storage.removeItem(key);
    } catch (error) {
      console.warn(`Storage removeItem failed for key "${key}":`, error);
    }
  }
}

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
      openRequest.onerror = () => {
        reject(openRequest.error ?? new Error('Failed to open IndexedDB'));
      };
    });
  }

  async getItem(key: string): Promise<string | null> {
    const database = await this.dbPromise;
    return await new Promise<string | null>((resolve, reject) => {
      const transaction = database.transaction(this.store, 'readonly');
      const objectStore = transaction.objectStore(this.store);
      const getRequest = objectStore.get(key);
      getRequest.onsuccess = () => {
        resolve((getRequest.result as string) ?? null);
      };
      getRequest.onerror = () => {
        reject(getRequest.error ?? new Error(`Failed to get key "${key}"`));
      };
      transaction.onerror = () => {
        reject(transaction.error ?? new Error('Transaction failed'));
      };
    });
  }

  async setItem(key: string, value: string): Promise<void> {
    const database = await this.dbPromise;
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(this.store, 'readwrite');
      const objectStore = transaction.objectStore(this.store);
      const putRequest = objectStore.put(value, key);
      putRequest.onsuccess = () => {
        resolve();
      };
      putRequest.onerror = () => {
        reject(putRequest.error ?? new Error(`Failed to set key "${key}"`));
      };
      transaction.onerror = () => {
        reject(transaction.error ?? new Error('Transaction failed'));
      };
    });
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

      await new Promise<void>((resolve, reject) => {
        // Create readwrite transaction for this operation
        const transaction = database.transaction(this.store, 'readwrite');
        const objectStore = transaction.objectStore(this.store);
        const deleteRequest = objectStore.delete(key);

        // Handle successful deletion
        deleteRequest.onsuccess = () => {
          resolve();
        };

        // Handle deletion errors
        deleteRequest.onerror = () => {
          reject(deleteRequest.error ?? new Error(`Failed to delete key "${key}"`));
        };

        // Handle transaction errors
        transaction.onerror = () => {
          reject(transaction.error ?? new Error('Transaction failed'));
        };
      });
    } catch (error) {
      console.warn(`IndexedDB removeItem failed for key "${key}":`, error);
      // Don't throw - allow graceful degradation
    }
  }
}
