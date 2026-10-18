import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MutationJournal, frappeSyncSequence } from './mutation-journal';
import type { Pending } from './mutation-journal';
import { Operation, Status } from './types';

describe(MutationJournal, () => {
  let journal: MutationJournal;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    // oxlint-disable-next-line typescript/strict-boolean-expressions -- unassigned until the first test constructs a journal
    if (journal) {
      journal.dispose();
    }
  });

  describe('basic operations', () => {
    beforeEach(() => {
      journal = new MutationJournal({ enableAutoCleanup: false });
    });

    it('should add a pending entry', () => {
      const entry: Pending = {
        doctype: 'Task',
        docname: 'TASK-001',
        operation: Operation.Update,
        status: Status.Pending,
        values: { doctype: 'Task', name: 'TASK-001', status: 'InProgress' },
      };
      journal.add('mut-1', entry);
      const retrieved = journal.get('mut-1');
      expect(retrieved).toBeDefined();
      expect(retrieved?.doctype).toBe('Task');
      expect(retrieved?.sequence).toBeDefined();
      expect(retrieved?.createdAt).toBeDefined();
      expect(retrieved?.ttl).toBeDefined();
      expect(retrieved?.retryCount).toBe(0);
    });

    it('should confirm an entry', () => {
      const entry: Pending = {
        doctype: 'Task',
        operation: Operation.Create,
        status: Status.Pending,
      };
      journal.add('mut-2', entry);
      journal.confirm('mut-2');
      const retrieved = journal.get('mut-2');
      expect(retrieved).toBeUndefined();
    });

    it('should fail an entry and increment retry count', () => {
      const entry: Pending = {
        doctype: 'Task',
        operation: Operation.Update,
        status: Status.Pending,
      };
      const error = new Error('Network error');
      journal.add('mut-3', entry);
      journal.fail('mut-3', error);
      const retrieved = journal.get('mut-3');
      expect(retrieved).toBeDefined();
      expect(retrieved?.status).toBe(Status.Failed);
      expect(retrieved?.error).toBe(error);
      expect(retrieved?.retryCount).toBe(1);
      journal.fail('mut-3', error);
      const retrievedAgain = journal.get('mut-3');
      expect(retrievedAgain?.retryCount).toBe(2);
    });

    it('should list pending entries in sequence order', () => {
      const entry1: Pending = {
        doctype: 'Task',
        operation: Operation.Create,
        status: Status.Pending,
      };
      const entry2: Pending = {
        doctype: 'Task',
        operation: Operation.Update,
        status: Status.Failed,
      };
      const entry3: Pending = {
        doctype: 'Task',
        operation: Operation.Delete,
        status: Status.Confirmed,
      };
      const entry4: Pending = {
        doctype: 'Task',
        operation: Operation.Update,
        status: Status.Pending,
      };
      journal.add('mut-1', entry1);
      journal.add('mut-2', entry2);
      journal.add('mut-3', entry3);
      journal.add('mut-4', entry4);
      journal.confirm('mut-3');
      const pending = journal.listPending();
      expect(pending).toHaveLength(3);
      expect(pending[0].id).toBe('mut-1');
      expect(pending[1].id).toBe('mut-2');
      expect(pending[2].id).toBe('mut-4');
    });

    it('should clear all entries', () => {
      const entry1: Pending = {
        doctype: 'Task',
        operation: Operation.Create,
        status: Status.Pending,
      };
      const entry2: Pending = {
        doctype: 'Task',
        operation: Operation.Update,
        status: Status.Pending,
      };
      journal.add('mut-1', entry1);
      journal.add('mut-2', entry2);
      journal.clear();
      expect(journal.get('mut-1')).toBeUndefined();
      expect(journal.get('mut-2')).toBeUndefined();
      expect(journal.listPending()).toHaveLength(0);
    });
  });

  describe('TTL and expiration', () => {
    it('should expire entries after TTL', () => {
      journal = new MutationJournal({
        ttl: 1000,
        enableAutoCleanup: false,
      });
      const entry: Pending = {
        doctype: 'Task',
        operation: Operation.Update,
        status: Status.Pending,
      };
      journal.add('mut-1', entry);
      expect(journal.get('mut-1')).toBeDefined();
      vi.advanceTimersByTime(1001);
      expect(journal.get('mut-1')).toBeUndefined();
    });

    it('should not return expired entries in listPending', () => {
      journal = new MutationJournal({
        ttl: 1000,
        enableAutoCleanup: false,
      });
      const entry1: Pending = {
        doctype: 'Task',
        operation: Operation.Create,
        status: Status.Pending,
      };
      const entry2: Pending = {
        doctype: 'Task',
        operation: Operation.Update,
        status: Status.Pending,
      };
      journal.add('mut-1', entry1);
      vi.advanceTimersByTime(500);
      journal.add('mut-2', entry2);
      vi.advanceTimersByTime(501);
      const pending = journal.listPending();
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe('mut-2');
    });

    it('should cleanup expired entries', () => {
      journal = new MutationJournal({
        ttl: 1000,
        enableAutoCleanup: false,
      });
      const entry1: Pending = {
        doctype: 'Task',
        operation: Operation.Create,
        status: Status.Pending,
      };
      const entry2: Pending = {
        doctype: 'Task',
        operation: Operation.Update,
        status: Status.Pending,
      };
      journal.add('mut-1', entry1);
      journal.add('mut-2', entry2);
      vi.advanceTimersByTime(1001);
      const cleaned = journal.cleanupExpired();
      expect(cleaned).toBe(2);
      expect(journal.listPending()).toHaveLength(0);
    });
  });

  describe('auto cleanup', () => {
    it('should automatically cleanup expired entries', () => {
      journal = new MutationJournal({
        ttl: 1000,
        enableAutoCleanup: true,
      });
      const entry: Pending = {
        doctype: 'Task',
        operation: Operation.Create,
        status: Status.Pending,
      };
      journal.add('mut-1', entry);
      vi.advanceTimersByTime(60_001);
      expect(journal.get('mut-1')).toBeUndefined();
    });

    it('should stop auto cleanup on dispose', () => {
      journal = new MutationJournal({
        enableAutoCleanup: true,
      });
      const stopAutoCleanupSpy = vi.spyOn(journal, 'stopAutoCleanup');
      journal.dispose();
      expect(stopAutoCleanupSpy).toHaveBeenCalledWith();
    });
  });

  describe('storage integration', () => {
    it('should persist and load sequence number', () => {
      const mockStorage = {
        getItem: vi.fn<Storage['getItem']>().mockReturnValue('10'),
        setItem: vi.fn<Storage['setItem']>(),
        removeItem: vi.fn<Storage['removeItem']>(),
        clear: vi.fn<Storage['clear']>(),
        key: vi.fn<Storage['key']>(),
        length: 0,
      };
      journal = new MutationJournal({
        storage: mockStorage,
        enableAutoCleanup: false,
      });
      expect(mockStorage.getItem).toHaveBeenCalledWith(frappeSyncSequence);
      const entry: Pending = {
        doctype: 'Task',
        operation: Operation.Create,
        status: Status.Pending,
      };
      journal.add('mut-1', entry);
      const retrieved = journal.get('mut-1');
      expect(retrieved?.sequence).toBe(11);
      expect(mockStorage.setItem).toHaveBeenCalledWith(frappeSyncSequence, '11');
    });

    it('should handle missing storage sequence gracefully', () => {
      const mockStorage = {
        getItem: vi.fn<Storage['getItem']>().mockReturnValue(null),
        setItem: vi.fn<Storage['setItem']>(),
        removeItem: vi.fn<Storage['removeItem']>(),
        clear: vi.fn<Storage['clear']>(),
        key: vi.fn<Storage['key']>(),
        length: 0,
      };
      journal = new MutationJournal({
        storage: mockStorage,
        enableAutoCleanup: false,
      });
      const entry: Pending = {
        doctype: 'Task',
        operation: Operation.Create,
        status: Status.Pending,
      };
      journal.add('mut-1', entry);
      const retrieved = journal.get('mut-1');
      expect(retrieved?.sequence).toBe(1);
    });
  });

  describe('sequence ordering', () => {
    beforeEach(() => {
      journal = new MutationJournal({ enableAutoCleanup: false });
    });

    it('should assign sequential numbers to entries', () => {
      const entry1: Pending = {
        doctype: 'Task',
        operation: Operation.Create,
        status: Status.Pending,
      };
      const entry2: Pending = {
        doctype: 'Task',
        operation: Operation.Update,
        status: Status.Pending,
      };
      const entry3: Pending = {
        doctype: 'Task',
        operation: Operation.Delete,
        status: Status.Pending,
      };
      journal.add('mut-1', entry1);
      journal.add('mut-2', entry2);
      journal.add('mut-3', entry3);
      const retrieved1 = journal.get('mut-1');
      const retrieved2 = journal.get('mut-2');
      const retrieved3 = journal.get('mut-3');
      expect(retrieved1?.sequence).toBe(1);
      expect(retrieved2?.sequence).toBe(2);
      expect(retrieved3?.sequence).toBe(3);
    });

    it('should preserve sequence when provided', () => {
      const entry: Pending = {
        doctype: 'Task',
        operation: Operation.Create,
        status: Status.Pending,
        sequence: 100,
      };
      journal.add('mut-1', entry);
      const retrieved = journal.get('mut-1');
      expect(retrieved?.sequence).toBe(100);
    });
  });

  describe('snapshot handling', () => {
    beforeEach(() => {
      journal = new MutationJournal({ enableAutoCleanup: false });
    });

    it('should store and retrieve snapshots', () => {
      const snapshot = {
        doctype: 'Task',
        name: 'TASK-001',
        title: 'Original Task',
        status: 'Open',
      };
      const entry: Pending = {
        doctype: 'Task',
        docname: 'TASK-001',
        operation: Operation.Update,
        status: Status.Pending,
        snapshot,
        values: { doctype: 'Task', name: 'TASK-001', status: 'Closed' },
      };
      journal.add('mut-1', entry);
      const retrieved = journal.get('mut-1');
      expect(retrieved?.snapshot).toStrictEqual(snapshot);
    });
  });
});
