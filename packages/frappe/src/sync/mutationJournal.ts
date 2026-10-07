import type { FrappeDoc, FrappeDocData } from '../common/types';

import type { Operation } from './types';
import { Status } from './types';

export const frappeSyncSequence = 'frappe-sync-sequence';

export interface Pending {
  createdAt?: number;
  docname?: string;
  doctype: string;
  error?: Error | { message: string; [key: string]: unknown };
  operation: Operation;
  retryCount?: number;
  sequence?: number;
  snapshot?: FrappeDoc<FrappeDocData>;
  status: Status;
  ttl?: number;
  values?: FrappeDoc<FrappeDocData>;
  version?: string;
}

export interface MutationJournalOptions {
  enableAutoCleanup?: boolean;
  storage?: Storage;
  ttl?: number;
}

export class MutationJournal {
  private cleanupTimer?: ReturnType<typeof setInterval>;
  private readonly autoCleanupEnabled: boolean;
  private readonly ttl = 24 * 60 * 60 * 1000;
  private readonly pending = new Map<string, Pending>();
  private sequenceNumber = 0;
  private readonly storage?: Storage;

  constructor(options?: MutationJournalOptions) {
    if (options?.ttl) {
      this.ttl = options.ttl;
    }
    if (options?.storage) {
      this.storage = options.storage;
      this.loadSequenceNumber();
    }
    // Auto-cleanup is armed lazily on the first add() rather than at
    // construction: an empty journal has nothing to expire, and an
    // unconditional interval was a leaked handle for every SyncModule that
    // never mutated (one per fixture set in tests/stories — the pending
    // hour-long timers helped wedge vitest forks-worker teardown).
    this.autoCleanupEnabled = options?.enableAutoCleanup !== false;
  }

  add(id: string, entry: Pending) {
    entry.sequence ??= this.getNextSequence();
    entry.createdAt ??= Date.now();
    entry.ttl ??= this.ttl;
    entry.retryCount ??= 0;
    this.pending.set(id, entry);
    if (this.autoCleanupEnabled) {
      this.startAutoCleanup();
    }
    this.persistSequenceNumber();
  }

  get(id: string) {
    const entry = this.pending.get(id);
    if (!entry) {
      return;
    }
    if (this.isExpired(entry)) {
      this.pending.delete(id);
      return;
    }
    return entry;
  }

  confirm(id: string) {
    const entry = this.pending.get(id);
    if (!entry) {
      return;
    }
    entry.status = Status.Confirmed;
    this.pending.delete(id);
  }

  fail(id: string, err?: Error | { message: string; [key: string]: unknown }) {
    const entry = this.pending.get(id);
    if (!entry) {
      return;
    }
    entry.status = Status.Failed;
    entry.error = err;
    entry.retryCount = (entry.retryCount ?? 0) + 1;
    this.pending.set(id, entry);
  }

  /**
   * Drops an entry without confirming it — the "dismiss" affordance for a
   * failed mutation the user chose not to retry. Unlike `confirm` this makes
   * no claim the write reached the server.
   */
  remove(id: string) {
    this.pending.delete(id);
  }

  listPending() {
    const pending: { id: string; entry: Pending }[] = [];
    for (const [id, entry] of this.pending) {
      if (this.isExpired(entry)) {
        this.pending.delete(id);
        continue;
      }
      if (entry.status === Status.Pending || entry.status === Status.Failed) {
        pending.push({ id, entry });
      }
    }
    pending.sort((a, b) => (a.entry.sequence ?? 0) - (b.entry.sequence ?? 0));
    return pending;
  }

  getAllEntries(): { id: string; entry: Pending }[] {
    const entries: { id: string; entry: Pending }[] = [];
    for (const [id, entry] of this.pending) {
      if (this.isExpired(entry)) {
        continue;
      }
      entries.push({ id, entry });
    }
    return entries;
  }

  cleanupExpired() {
    let cleaned = 0;
    for (const [id, entry] of this.pending) {
      if (this.isExpired(entry)) {
        this.pending.delete(id);
        cleaned++;
      }
    }
    return cleaned;
  }

  stopAutoCleanup() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  clear() {
    this.pending.clear();
    this.stopAutoCleanup();
  }

  dispose() {
    this.stopAutoCleanup();
    this.clear();
  }

  private getNextSequence() {
    return ++this.sequenceNumber;
  }

  private isExpired(entry: Pending): boolean {
    if (!entry.createdAt || !entry.ttl) {
      return false;
    }
    return Date.now() > entry.createdAt + entry.ttl;
  }

  private startAutoCleanup() {
    if (this.cleanupTimer) {
      return;
    }
    this.cleanupTimer = setInterval(
      () => {
        this.cleanupExpired();
        // Disarm once drained; the next add() re-arms.
        if (this.pending.size === 0) {
          this.stopAutoCleanup();
        }
      },
      60 * 60 * 1000,
    );
  }

  private loadSequenceNumber() {
    if (!this.storage) {
      return;
    }
    const stored = this.storage.getItem(frappeSyncSequence);
    if (stored) {
      this.sequenceNumber = Number.parseInt(stored, 10) || 0;
    }
  }

  private persistSequenceNumber() {
    if (!this.storage) {
      return;
    }
    this.storage.setItem(frappeSyncSequence, this.sequenceNumber.toString());
  }
}
