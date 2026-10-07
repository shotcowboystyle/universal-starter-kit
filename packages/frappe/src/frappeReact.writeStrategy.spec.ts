import { afterEach, expect, it, vi, test } from 'vitest';

import { getFrappeSyncModule } from './frappeReact';
import type { UseFrappeCollectionConfig } from './frappeReact';
import type { SyncModule } from './sync';
import { Operation } from './sync/types';

const modules = new Set<SyncModule>();
function moduleFor(config: UseFrappeCollectionConfig) {
  const sync = getFrappeSyncModule(config)!;
  expect(sync).toBeDefined();
  modules.add(sync);
  return sync;
}

afterEach(async () => {
  for (const sync of modules) {
    await sync.dispose();
  }
  modules.clear();
  vi.unstubAllGlobals();
});

function wire() {
  const requests: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      requests.push(`${init?.method ?? 'GET'} ${new URL(url).pathname}`);
      const doc = { name: 'n2r26ki4er', doctype: 'Poke Move', move_name: 'Surf' };
      return Response.json(url.includes('/api/method/') ? { message: doc } : { data: doc });
    }),
  );
  return requests;
}

async function create(sync: SyncModule) {
  await sync.mutate({
    mutationId: `m-${Math.random()}`,
    operation: Operation.Create,
    doc: { doctype: 'Poke Move', name: 'tmp-1', move_name: 'Surf' },
  });
}

test('a provider on a resource-only bench creates through /api/resource (MPO-396)', async () => {
  const requests = wire();
  const base = { baseURL: 'https://resource-writes.test', realtime: false };
  const sync = moduleFor({ ...base, syncOptions: { writeStrategy: 'resource' } });
  expect(moduleFor({ ...base, syncOptions: { writeStrategy: 'resource' } })).toBe(sync);
  expect(moduleFor(base)).not.toBe(sync);
  expect(moduleFor({ ...base, syncOptions: { writeStrategy: 'live' } })).toBe(moduleFor(base));
  await create(sync);
  expect(requests).toEqual(['POST /api/resource/Poke%20Move']);
});

test('a provider with no write strategy still creates through the live app', async () => {
  const requests = wire();
  await create(moduleFor({ baseURL: 'https://live-writes.test', realtime: false }));
  expect(requests).toEqual(['POST /api/method/live.live.api.create_doc']);
});
