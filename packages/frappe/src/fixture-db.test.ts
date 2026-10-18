/**
 * FixtureDbModule cursor paging.
 *
 * Fixture mode is what makes the frappe stories network-hermetic (G-15/D-05),
 * so it has to page the same way the HTTP path does. It did not: `getDocList`
 * forwarded fields / filters / orderBy / limitStart / limit and dropped
 * `cursor` on the floor, so every cursor-paged fetch returned page ONE again.
 * VirtualPageManager appends what it gets, so a fixture-backed
 * useFrappeInfiniteList grew [1..10, 1..10] and React logged a duplicate-key
 * error for every row of the first page (MPO-197).
 */
import { describe, expect, it } from 'vitest';

import { FixtureDbModule } from './fixture-db';
import { InMemoryFixtureProvider } from './fixtures';
import { Order } from './sync/types';

const pad = (n: number): string => String(n).padStart(4, '0');

const todos = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    name: `TODO-${pad(i + 1)}`,
    doctype: 'ToDo',
    description: `row ${i + 1}`,
    status: i % 2 === 0 ? 'Open' : 'Working',
  }));

const db = (count = 25) => new FixtureDbModule(new InMemoryFixtureProvider({ ToDo: todos(count) }));

const byName = { field: 'name', order: Order.Asc };

describe('FixtureDbModule.getDocList cursor paging', () => {
  it('with no cursor it returns the first page', async () => {
    const rows = await db().getDocList('ToDo', { orderBy: byName, limit: 10 });
    expect(rows.map((r) => r.name)).toStrictEqual(todos(10).map((r) => r.name));
  });

  it('a cursor starts the page AFTER that document', async () => {
    const rows = await db().getDocList('ToDo', {
      orderBy: byName,
      limit: 10,
      cursor: 'TODO-0010',
    });
    expect(rows[0]?.name).toBe('TODO-0011');
    expect(rows).toHaveLength(10);
    expect(rows.at(-1)?.name).toBe('TODO-0020');
  });

  it('paging the whole list by cursor yields every row exactly once', async () => {
    const dbModule = db(25);
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 5; page += 1) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- each page's cursor comes from the previous page
      const rows = await dbModule.getDocList('ToDo', { orderBy: byName, limit: 10, cursor });
      if (rows.length === 0) {
        break;
      }
      seen.push(...rows.map((r) => r.name));
      cursor = rows.at(-1)?.name;
    }
    expect(seen).toHaveLength(25);
    expect(new Set(seen).size).toBe(25);
    expect(seen[0]).toBe('TODO-0001');
    expect(seen.at(-1)).toBe('TODO-0025');
  });

  it('the last page is short and the one after it is empty', async () => {
    const dbModule = db(25);
    const tail = await dbModule.getDocList('ToDo', {
      orderBy: byName,
      limit: 10,
      cursor: 'TODO-0020',
    });
    expect(tail).toHaveLength(5);
    const past = await dbModule.getDocList('ToDo', {
      orderBy: byName,
      limit: 10,
      cursor: 'TODO-0025',
    });
    expect(past).toHaveLength(0);
  });

  it('a cursor naming a document that is not there falls back to the first page', async () => {
    const rows = await db().getDocList('ToDo', { orderBy: byName, limit: 5, cursor: 'NOPE' });
    expect(rows[0]?.name).toBe('TODO-0001');
  });

  it('the cursor is resolved against the FILTERED order, not the whole doctype', async () => {
    const rows = await db(10).getDocList('ToDo', {
      orderBy: byName,
      filters: { status: 'Open' },
      limit: 2,
      cursor: 'TODO-0003',
    });
    // Open rows are the odd-numbered names; after row 3 come rows 5 and 7.
    expect(rows.map((r) => r.name)).toStrictEqual(['TODO-0005', 'TODO-0007']);
  });

  it('an explicit limitStart wins over the cursor (that caller pages by offset)', async () => {
    const rows = await db().getDocList('ToDo', {
      orderBy: byName,
      limit: 3,
      limitStart: 0,
      cursor: 'TODO-0010',
    });
    expect(rows[0]?.name).toBe('TODO-0001');
  });

  it('getListWithCursor and getDocList agree on where a cursor lands', async () => {
    const dbModule = db();
    const viaList = await dbModule.getDocList('ToDo', {
      orderBy: byName,
      limit: 5,
      cursor: 'TODO-0005',
    });
    const viaCursor = await dbModule.getListWithCursor({
      doctype: 'ToDo',
      orderBy: byName,
      limit: 5,
      cursor: 'TODO-0005',
    });
    expect(viaList.map((r) => r.name)).toStrictEqual(viaCursor.data.map((r) => r.name));
  });
});
