/**
 * A collection created with no `limit` must return the same rows in fixture
 * mode as it does against a live bench (MPO-238). Frappe clamps a request
 * that carries no `limit_page_length` to 20 rows while a fixture provider
 * slices only when asked, so development read every row, production read 20,
 * and neither one errored to say so.
 */
import { describe, expect, it, vi } from 'vitest';

import { fixtureCollectionOptions } from './collection';
import type { DbModule } from './db';
import { FixtureDbModule } from './fixtureDb';
import { InMemoryFixtureProvider } from './fixtures';
import { NormalizedCache } from './sync/normalizedCache';
import { SubscriptionManager } from './sync/subscriptionManager';
import { defaultPageLength } from './sync/types';
import type { SubscriptionQuery } from './sync/types';

const rowCount = 50;

interface Todo {
  name: string;
  doctype: string;
  description: string;
  modified: string;
}

function todos(): Todo[] {
  return Array.from({ length: rowCount }, (_, index) => ({
    name: `TODO-${String(index + 1).padStart(4, '0')}`,
    doctype: 'ToDo',
    description: `row ${index + 1}`,
    modified: `2026-01-01T00:${String(index).padStart(2, '0')}:00`,
  }));
}

/**
 * Stands in for a live bench: /api/resource pages a request with no
 * `limit_page_length` at 20 rows and reads `limit_page_length=0` as every
 * row. Nothing else about the response differs from fixture mode, so any
 * divergence these specs catch is the page length alone.
 */
function benchDb(): DbModule {
  const rows = todos();
  return {
    getDoc: async (_doctype: string, name: string) => rows.find((row) => row.name === name) ?? null,
    getDocList: async (_doctype: string, options: { limit?: number; limitStart?: number } = {}) => {
      const start = options.limitStart ?? 0;
      const pageLength = options.limit ?? 20;
      return rows.slice(start, pageLength === 0 ? undefined : start + pageLength);
    },
  } as unknown as DbModule;
}

function fixtureDb(): DbModule {
  return new FixtureDbModule(new InMemoryFixtureProvider({ ToDo: todos() })) as unknown as DbModule;
}

async function subscribedNames(db: DbModule, query: SubscriptionQuery): Promise<string[]> {
  const manager = new SubscriptionManager(db, new NormalizedCache());
  const result = await manager.subscribe(query);
  return result.rows.map((row) => String(row.name));
}

async function fixtureCollectionNames(limit?: number): Promise<string[]> {
  const options = fixtureCollectionOptions<Todo>('ToDo', {
    fixtures: new InMemoryFixtureProvider({ ToDo: todos() }),
    ...(limit === undefined ? {} : { limit }),
  });
  const written: string[] = [];
  const cleanup = options.sync.sync({
    begin: vi.fn(),
    write: (message: any) => {
      written.push(message.value.name);
    },
    commit: vi.fn(),
    markReady: vi.fn(),
    truncate: vi.fn(),
    collection: {} as any,
  } as any);
  await new Promise((resolve) => setTimeout(resolve, 10));
  if (typeof cleanup === 'function') {
    cleanup();
  }
  return written;
}

describe('collection row limit parity', () => {
  it('reads the default page length with no limit, on both paths', async () => {
    const query: SubscriptionQuery = { doctype: 'ToDo' };

    const live = await subscribedNames(benchDb(), query);
    const fixture = await subscribedNames(fixtureDb(), query);

    expect(fixture).toEqual(live);
    expect(fixture).toHaveLength(defaultPageLength);
    expect(fixture.at(-1)).toBe('TODO-0020');
  });

  it('reads every row with limit 0, on both paths', async () => {
    const query: SubscriptionQuery = { doctype: 'ToDo', limit: 0 };

    const live = await subscribedNames(benchDb(), query);
    const fixture = await subscribedNames(fixtureDb(), query);

    expect(fixture).toEqual(live);
    expect(fixture).toHaveLength(rowCount);
  });

  it('reads an explicit limit past the bench default, on both paths', async () => {
    const query: SubscriptionQuery = { doctype: 'ToDo', limit: 35 };

    const live = await subscribedNames(benchDb(), query);
    const fixture = await subscribedNames(fixtureDb(), query);

    expect(fixture).toEqual(live);
    expect(fixture).toHaveLength(35);
  });

  it('offsets by limitStart with no limit, on both paths', async () => {
    const query: SubscriptionQuery = { doctype: 'ToDo', limitStart: 20 };

    const live = await subscribedNames(benchDb(), query);
    const fixture = await subscribedNames(fixtureDb(), query);

    expect(fixture).toEqual(live);
    expect(fixture[0]).toBe('TODO-0021');
    expect(fixture).toHaveLength(defaultPageLength);
  });

  it('gives the direct fixture collection the same default page length', async () => {
    await expect(fixtureCollectionNames()).resolves.toHaveLength(defaultPageLength);
  });

  it('gives the direct fixture collection every row with limit 0', async () => {
    await expect(fixtureCollectionNames(0)).resolves.toHaveLength(rowCount);
  });
});
