import { afterEach, describe, expect, it, vi } from 'vitest';

import { getFrappeSyncModule } from './frappe-react';
import type { UseFrappeCollectionConfig } from './frappe-react';
import type { SyncModule } from './sync';
import { Operation } from './sync/types';

const modules = new Set<SyncModule>();
const moduleFor = (config: UseFrappeCollectionConfig) => {
  const sync = getFrappeSyncModule(config)!;
  expect(sync).toBeDefined();
  modules.add(sync);
  return sync;
};

const wire = () => {
  const requests: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (url, init) => {
      requests.push(`${init?.method ?? 'GET'} ${new URL(url).pathname}`);
      const doc = { name: 'n2r26ki4er', doctype: 'Poke Move', move_name: 'Surf' };
      return Response.json(url.includes('/api/method/') ? { message: doc } : { data: doc });
    }),
  );
  return requests;
};

let mutationSeq = 0;
const create = async (sync: SyncModule) => {
  mutationSeq += 1;
  await sync.mutate({
    mutationId: `m-${mutationSeq}`,
    operation: Operation.Create,
    doc: { doctype: 'Poke Move', name: 'tmp-1', move_name: 'Surf' },
  });
};

describe('provider write strategy', () => {
  afterEach(async () => {
    await Promise.all(
      [...modules].map(async (sync) => {
        await sync.dispose();
      }),
    );
    modules.clear();
    vi.unstubAllGlobals();
  });

  it('a provider on a resource-only bench creates through /api/resource (MPO-396)', async () => {
    const requests = wire();
    const base = { baseURL: 'https://resource-writes.test', realtime: false };
    const sync = moduleFor({ ...base, syncOptions: { writeStrategy: 'resource' } });
    expect(moduleFor({ ...base, syncOptions: { writeStrategy: 'resource' } })).toBe(sync);
    expect(moduleFor(base)).not.toBe(sync);
    expect(moduleFor({ ...base, syncOptions: { writeStrategy: 'live' } })).toBe(moduleFor(base));
    await create(sync);
    expect(requests).toStrictEqual(['POST /api/resource/Poke%20Move']);
  });

  it('a provider with no write strategy still creates through the live app', async () => {
    const requests = wire();
    await create(moduleFor({ baseURL: 'https://live-writes.test', realtime: false }));
    expect(requests).toStrictEqual(['POST /api/method/live.live.api.create_doc']);
  });
});
