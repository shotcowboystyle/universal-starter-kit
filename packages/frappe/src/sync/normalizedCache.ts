import type { FrappeDoc, FrappeDocData } from '../common/types';

export type EntityState = Record<string, { byId: Record<string, FrappeDoc<FrappeDocData>>; allIds: string[] }>;

export interface NormalizedCacheOptions {
  /** Maximum number of documents to keep in cache (default: unlimited) */
  maxSize?: number;
  /** Callback when eviction occurs */
  onEvict?: (doctype: string, name: string) => void;
}

export interface UpsertOptions {
  /**
   * Replace the cached document wholesale instead of merging fields.
   * Use when the incoming doc is authoritative for its entire shape
   * (e.g. restoring a rollback snapshot).
   */
  replace?: boolean;
}

/**
 * Normalized cache with optional LRU eviction.
 *
 * Documents are stored by doctype and name for O(1) lookups.
 * When maxSize is set, least recently used documents are evicted
 * to keep the cache within bounds.
 */
export class NormalizedCache {
  state: EntityState = {};
  /** LRU tracking: composite key "doctype:name" -> last access timestamp */
  private readonly accessOrder = new Map<string, number>();
  private readonly maxSize: number;
  private readonly onEvict?: (doctype: string, name: string) => void;

  constructor(options: NormalizedCacheOptions = {}) {
    this.maxSize = options.maxSize ?? Infinity;
    this.onEvict = options.onEvict;
  }

  private makeKey(doctype: string, name: string): string {
    return `${doctype}:${name}`;
  }

  private parseKey(key: string): { doctype: string; name: string } {
    const colonIndex = key.indexOf(':');
    return {
      doctype: key.slice(0, colonIndex),
      name: key.slice(colonIndex + 1),
    };
  }

  upsert<Data extends FrappeDocData>(doc: FrappeDoc<Data>, options: UpsertOptions = {}) {
    let bucket = this.state[doc.doctype];
    if (!bucket) {
      bucket = { byId: {}, allIds: [] };
      this.state[doc.doctype] = bucket;
    }
    const id = doc?.name;
    if (!id) {
      return;
    }

    const existing = bucket.byId[id];
    const isNew = !existing;
    if (isNew) {
      bucket.allIds.push(id);
    }
    // Shallow field merge: only keys PRESENT on the incoming doc overwrite the
    // cached entry, so a narrow-fields fetch (projection) cannot strip fields
    // other live views depend on. A key present with null/"" (genuinely
    // cleared server-side) still overwrites; a key absent from the projection
    // is preserved. Pass `replace: true` for wholesale replacement.
    bucket.byId[id] = existing && !options.replace ? ({ ...existing, ...doc } as FrappeDoc<FrappeDocData>) : doc;

    // Update access time
    const key = this.makeKey(doc.doctype, id);
    this.accessOrder.set(key, Date.now());

    // Evict if over max size
    if (isNew && this.maxSize !== Infinity) {
      this.evictIfNeeded();
    }
  }

  remove<Data extends FrappeDocData>(doc: Pick<FrappeDoc<Data>, 'doctype' | 'name'>) {
    const bucket = this.state[doc.doctype];
    if (!bucket) {
      return;
    }
    if (bucket.byId[doc.name]) {
      delete bucket.byId[doc.name];
    }
    bucket.allIds = bucket.allIds.filter((currentId) => currentId !== doc.name);

    // Remove from access order
    const key = this.makeKey(doc.doctype, doc.name);
    this.accessOrder.delete(key);
  }

  get<Data extends FrappeDocData>(doc: Pick<FrappeDoc<Data>, 'doctype' | 'name'>) {
    const result = this.state[doc.doctype]?.byId[doc.name];

    // Update access time on read
    if (result) {
      const key = this.makeKey(doc.doctype, doc.name);
      this.accessOrder.set(key, Date.now());
    }

    return result;
  }

  getStats(): { size: number; doctypes: { doctype: string; count: number }[] } {
    let size = 0;
    const doctypes: { doctype: string; count: number }[] = [];
    for (const [doctype, bucket] of Object.entries(this.state)) {
      const count = bucket.allIds.length;
      size += count;
      doctypes.push({ doctype, count });
    }
    return { size, doctypes };
  }

  /**
   * Evicts least recently used documents if cache exceeds maxSize.
   */
  private evictIfNeeded() {
    const stats = this.getStats();
    if (stats.size <= this.maxSize) {
      return;
    }

    // Sort by access time (oldest first)
    const sortedEntries = [...this.accessOrder.entries()].sort((a, b) => a[1] - b[1]);

    // Evict oldest entries until we're under max size
    const toEvict = stats.size - this.maxSize;
    for (let i = 0; i < toEvict && i < sortedEntries.length; i++) {
      const [key] = sortedEntries[i];
      const { doctype, name } = this.parseKey(key);

      // Remove from state
      const bucket = this.state[doctype];
      if (bucket) {
        delete bucket.byId[name];
        bucket.allIds = bucket.allIds.filter((id) => id !== name);
      }

      // Remove from access order
      this.accessOrder.delete(key);

      // Notify callback
      if (this.onEvict) {
        this.onEvict(doctype, name);
      }
    }
  }

  /**
   * Clears the entire cache.
   */
  clear() {
    this.state = {};
    this.accessOrder.clear();
  }

  /**
   * Gets the current cache size.
   */
  get size(): number {
    return this.getStats().size;
  }
}
