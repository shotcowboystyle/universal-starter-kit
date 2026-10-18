import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DbModule } from '../db';

// oxlint-disable-next-line sonarjs/no-wildcard-import -- vi.spyOn patches exports through the module namespace
import * as filters from './filters';

import { SyncModule } from './index';

interface TodoRow {
  name: string;
  doctype: string;
  modified?: string;
  status?: string;
}

interface BackfillPage {
  rows: TodoRow[];
  checkpoint: null;
}

const createMockDb = () =>
  ({
    getDocList: vi.fn<() => Promise<TodoRow[]>>().mockResolvedValue([
      {
        name: 'todo-1',
        doctype: 'ToDo',
        modified: '2026-01-01 00:00:00',
        status: 'Open',
      },
      {
        name: 'todo-2',
        doctype: 'ToDo',
        modified: '2026-01-01 00:00:00',
        status: 'Open',
      },
    ]),
    getDoc: vi.fn<() => Promise<TodoRow>>().mockResolvedValue({
      name: 'todo-1',
      doctype: 'ToDo',
      modified: '2026-01-01',
      status: 'Open',
    }),
    backfill: vi.fn<() => Promise<BackfillPage>>().mockResolvedValue({ rows: [], checkpoint: null }),
    getCount: vi.fn<() => Promise<number>>().mockResolvedValue(2),
    createDoc: vi.fn<() => Promise<TodoRow>>().mockResolvedValue({ name: 'todo-new', doctype: 'ToDo' }),
    updateDoc: vi.fn<() => Promise<void>>().mockResolvedValue(),
    deleteDoc: vi.fn<() => Promise<void>>().mockResolvedValue(),
  }) as unknown as DbModule;

describe('SyncModule.__debug()', () => {
  let syncModule: SyncModule;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    vi.spyOn(filters, 'matchesFilters').mockReturnValue(true);
    // oxlint-disable-next-line unicorn/no-useless-undefined -- mockReturnValue requires its argument
    vi.spyOn(filters, 'extractSingleName').mockReturnValue(undefined);
    mockDb = createMockDb();
    Object.defineProperty(global, 'crypto', {
      value: { randomUUID: vi.fn<() => string>().mockReturnValue('debug-test-uuid') },
      writable: true,
    });
    syncModule = new SyncModule(mockDb, undefined, {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns subscriptions with correct doc counts', async () => {
    const { subscriptionId } = await syncModule.subscribe({
      doctype: 'ToDo',
      fields: ['name', 'status'],
      limit: 20,
    });

    const debug = syncModule.__debug();

    expect(debug.subscriptions).toHaveLength(1);
    expect(debug.subscriptions[0].id).toBe(subscriptionId);
    expect(debug.subscriptions[0].docCount).toBe(2);
    expect(debug.subscriptions[0].tombstoneCount).toBe(0);
    expect(debug.subscriptions[0].query.doctype).toBe('ToDo');
  });

  it('normalized cache stats match after subscribing', async () => {
    await syncModule.subscribe({
      doctype: 'ToDo',
      fields: ['name', 'status'],
      limit: 20,
    });

    const debug = syncModule.__debug();

    expect(debug.normalizedCache.size).toBe(2);
    expect(debug.normalizedCache.doctypes).toContainEqual({
      doctype: 'ToDo',
      count: 2,
    });
  });

  it('connection state reports correctly', () => {
    const debug = syncModule.__debug();

    expect(debug.connection).toBeDefined();
    expect(debug.connection.isOnline).toBeTypeOf('boolean');
    expect(debug.connection.isLeader).toBeTypeOf('boolean');
    expect(debug.connection.socketConnected).toBeTypeOf('boolean');
  });

  it('treats missing navigator.onLine as online (React Native)', () => {
    // RN has a navigator object but no onLine property — the old ternary
    // surfaced `undefined`, rendering as "offline" in devtools.
    const originalNavigator = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', {
      value: { product: 'ReactNative' },
      writable: true,
      configurable: true,
    });

    expect(syncModule.__debug().connection.isOnline).toBe(true);

    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  it('still reports offline when navigator.onLine is explicitly false (web)', () => {
    const originalNavigator = globalThis.navigator;
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: false },
      writable: true,
      configurable: true,
    });

    expect(syncModule.__debug().connection.isOnline).toBe(false);

    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  it('mutation journal has correct structure', async () => {
    await syncModule.subscribe({
      doctype: 'ToDo',
      fields: ['name', 'status'],
      limit: 20,
    });

    const debug = syncModule.__debug();

    expect(debug.mutationJournal).toBeDefined();
    expect(Array.isArray(debug.mutationJournal.pending)).toBe(true);
    expect(Array.isArray(debug.mutationJournal.confirmed)).toBe(true);
    expect(Array.isArray(debug.mutationJournal.failed)).toBe(true);
  });
});
