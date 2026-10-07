import { expect, it, test } from 'vitest';

import { syncOptionsKey } from './syncOptionsKey';

test('normalizes lifecycle defaults and plain options independent of key order', () => {
  expect(syncOptionsKey()).toBe(syncOptionsKey({ catchUpStrategy: 'cdc', cdcInterval: 0, writeStrategy: 'live' }));
  expect(syncOptionsKey({ cdcInterval: -1 })).toBe(syncOptionsKey());
  expect(syncOptionsKey({ versionFields: { Task: 'modified', Item: 'version' }, pageSize: 20 })).toBe(
    syncOptionsKey({
      pageSize: 20,
      versionFields: { Item: 'version', Task: 'modified' },
      persistKey: undefined,
    }),
  );
});

test('separates strategy, interval, persistence and cursor capabilities', () => {
  const keys = [
    undefined,
    { catchUpStrategy: 'snapshot' as const },
    { writeStrategy: 'resource' as const },
    { cdcInterval: 1000 },
    { persistKey: 'one' },
    { useCursorPagination: true },
  ].map(syncOptionsKey);
  expect(new Set(keys).size).toBe(keys.length);
});

test('keeps callback and storage identities without dropping functions', () => {
  const callback = () => 0;
  const storage = {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  };
  expect(syncOptionsKey({ onBackfill: callback, storage })).toBe(syncOptionsKey({ storage, onBackfill: callback }));
  expect(syncOptionsKey({ onBackfill: callback })).not.toBe(syncOptionsKey({ onBackfill: () => {} }));
  expect(syncOptionsKey({ storage })).not.toBe(syncOptionsKey({ storage: { ...storage } }));
  expect(syncOptionsKey({ fieldMergeConfig: { Task: { value: callback } } })).not.toBe(syncOptionsKey());
});
