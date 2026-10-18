/**
 * DbModule adapter backed by a FixtureProvider.
 *
 * Implements the same interface as DbModule so that SyncModule works
 * identically whether data comes from a live Frappe server or in-memory
 * fixtures. This means virtual pagination, progressive cache, mutation
 * journal, and devtools all work in fixture/Storybook mode.
 */

import type { FrappeDoc, FrappeDocData } from './common/types';
import { FrappeError } from './core/types';
import type { ListOptions } from './core/types';
import type { BackfillArgs, BackfillResponse } from './db';
import type { FixtureProvider } from './fixtures';
import type { OrderBy } from './sync/types';

const normalizeOrderBy = (orderBy: OrderBy): { field: string; order: string } | { field: string; order: string }[] => {
  if (Array.isArray(orderBy)) {
    return orderBy.map((ob) => ({ field: ob.field, order: ob.order }));
  }
  return { field: orderBy.field, order: orderBy.order };
};

const asDoc = <Data extends FrappeDocData>(row: Partial<Data>, doctype: string): FrappeDoc<Data> =>
  // SAFETY: fixture rows carry every stored field unless `fields` projected them away, and Data is the caller's
  // claim about the doctype's shape — the same trust the live DbModule places in server JSON.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
  ({ ...row, doctype }) as FrappeDoc<Data>;

/** Sync-layer bookkeeping keys the live endpoints strip server-side. */
const SYNC_META_KEYS = ['client_mutation_id', 'base_modified'] as const;

/** A shallow copy of `doc` without `keys`. */
const withoutKeys = <T extends object>(doc: T, keys: readonly string[]): T => {
  const copy = { ...doc };
  for (const key of keys) {
    Reflect.deleteProperty(copy, key);
  }
  return copy;
};

interface FixtureMutation<Data extends FrappeDocData> {
  type: string;
  doctype: string;
  name?: string;
  data?: Partial<Data>;
}

interface FixtureMutationResult {
  success: boolean;
  data?: FrappeDocData;
  error?: string;
}

export class FixtureDbModule {
  private readonly fixtures: FixtureProvider;

  constructor(fixtures: FixtureProvider) {
    this.fixtures = fixtures;
  }

  // oxlint-disable-next-line eslint/class-methods-use-this -- part of the DbModule instance contract this adapter implements
  getAppName(): string | undefined {
    return undefined;
  }

  // oxlint-disable-next-line eslint/class-methods-use-this -- part of the DbModule instance contract this adapter implements
  getEndpoints() {
    return {
      createDoc: 'fixture://createDoc',
      updateDoc: 'fixture://updateDoc',
      deleteDoc: 'fixture://deleteDoc',
      backfill: 'fixture://backfill',
      getListWithCursor: 'fixture://getListWithCursor',
      batchMutations: 'fixture://batchMutations',
      listSince: 'fixture://listSince',
    };
  }

  async getDoc<Data extends FrappeDocData>(doctype: string, name: string): Promise<FrappeDoc<Data>> {
    const doc = await this.fixtures.getDoc<Data>(doctype, name);
    // Mirror the live DbModule contract: a missing document surfaces as a
    // 404-status FrappeError (what /api/resource/<dt>/<name> returns), so
    // callers that treat 404 as not-found (e.g. the single-doc subscription
    // path) behave identically in fixture mode. A bare Error here read as a
    // SYNC FAILURE upstream and turned every missing-doc fixture story into
    // a failing-fetch loop.
    if (!doc) {
      throw new FrappeError(`Document ${doctype}/${name} not found`, 404);
    }
    return asDoc<Data>({ ...doc, name }, doctype);
  }

  // oxlint-disable-next-line eslint/class-methods-use-this -- part of the DbModule instance contract this adapter implements
  async getDocVersion(_doctype: string, _name: string): Promise<string | undefined> {
    return undefined;
  }

  async getDocList<Data extends FrappeDocData>(doctype: string, options: ListOptions = {}): Promise<FrappeDoc<Data>[]> {
    const fixtureOptions: NonNullable<Parameters<FixtureProvider['getList']>[1]> = {};

    if (options.fields) {
      fixtureOptions.fields = options.fields;
    }
    if (options.filters) {
      fixtureOptions.filters = options.filters;
    }
    if (options.orderBy) {
      fixtureOptions.orderBy = normalizeOrderBy(options.orderBy);
    }
    if (options.limitStart !== undefined) {
      fixtureOptions.limitStart = options.limitStart;
    }
    if (options.limit != null) {
      fixtureOptions.limit = options.limit;
    }

    // Honour `cursor` the way getListWithCursor does. Dropping it silently
    // made every cursor-paged fetch return page ONE again, and
    // VirtualPageManager.fetchMorePages appends what it gets without
    // de-duplicating — so a fixture-backed useFrappeInfiniteList grew
    // [1..10, 1..10] and React logged a duplicate-key error per row
    // (Frappe/useFrappeInfiniteList "Sentinel Auto Load", MPO-197).
    // An explicit limitStart wins: that caller is paging by offset already.
    if (options.cursor !== undefined && options.cursor !== '' && options.limitStart === undefined) {
      const ordered = await this.fixtures.getList(doctype, {
        filters: options.filters,
        orderBy: options.orderBy ? normalizeOrderBy(options.orderBy) : undefined,
      });
      const cursorIdx = ordered.findIndex((d) => d.name === options.cursor);
      if (cursorIdx !== -1) {
        fixtureOptions.limitStart = cursorIdx + 1;
      }
    }

    const docs = await this.fixtures.getList<Data>(doctype, fixtureOptions);
    return docs.map((d) => asDoc(d, doctype));
  }

  async getCount(doctype: string, filters?: ListOptions['filters']): Promise<number> {
    const docs = await this.fixtures.getList(doctype, { filters });
    return docs.length;
  }

  async createDoc<Data extends FrappeDocData>(
    doc: Partial<FrappeDoc<Data>> & Pick<FrappeDoc<Data>, 'doctype' | 'name'>,
  ): Promise<FrappeDoc<Data>> {
    return await this.fixtures.createDoc<FrappeDoc<Data>>(doc.doctype, withoutKeys(doc, SYNC_META_KEYS));
  }

  async updateDoc<Data extends FrappeDocData>(
    doc: Partial<FrappeDoc<Data>> & Pick<FrappeDoc<Data>, 'doctype' | 'name'>,
  ): Promise<FrappeDoc<Data>> {
    const data = withoutKeys(doc, [...SYNC_META_KEYS, 'doctype', 'name']);
    return await this.fixtures.updateDoc<FrappeDoc<Data>>(doc.doctype, doc.name, data);
  }

  async deleteDoc<Data extends FrappeDocData>(doc: Pick<FrappeDoc<Data>, 'doctype' | 'name'>) {
    await this.fixtures.deleteDoc(doc.doctype, doc.name);
    return { message: 'ok' };
  }

  // oxlint-disable-next-line eslint/class-methods-use-this -- part of the DbModule instance contract this adapter implements
  async renameDoc<Data extends FrappeDocData>(
    _doc: Pick<FrappeDoc<Data>, 'doctype' | 'name'>,
    _newName: string,
    _merge = false,
  ) {
    return { message: 'not supported in fixture mode' };
  }

  async backfill<Data extends FrappeDocData>(args: BackfillArgs): Promise<BackfillResponse<Data>> {
    const docs = await this.fixtures.getList<Data>(args.doctype, {
      fields: args.fields,
      filters: args.filters,
      limit: args.limit,
    });
    return {
      rows: docs.map((d) => asDoc(d, args.doctype)),
      checkpoint: new Date().toISOString(),
      deleted: [],
    };
  }

  async getListWithCursor<Data extends FrappeDocData>(args: {
    doctype: string;
    fields?: readonly string[];
    filters?: ListOptions['filters'];
    cursor?: string | null;
    limit?: number;
    orderBy?: OrderBy;
  }) {
    const limit = args.limit ?? 100;
    let limitStart = 0;
    if (args.cursor != null && args.cursor !== '') {
      const allDocs = await this.fixtures.getList(args.doctype, {
        filters: args.filters,
        orderBy: args.orderBy ? normalizeOrderBy(args.orderBy) : undefined,
      });
      const cursorIdx = allDocs.findIndex((d) => d.name === args.cursor);
      if (cursorIdx !== -1) {
        limitStart = cursorIdx + 1;
      }
    }

    const docs = await this.fixtures.getList<Data>(args.doctype, {
      fields: args.fields,
      filters: args.filters,
      orderBy: args.orderBy ? normalizeOrderBy(args.orderBy) : undefined,
      limitStart,
      limit,
    });

    const data = docs.map((d) => asDoc(d, args.doctype));
    const lastDoc = data.length > 0 ? data.at(-1) : null;

    return {
      data,
      next_cursor: data.length === limit && lastDoc ? lastDoc.name : null,
    };
  }

  async batchMutations<Data extends FrappeDocData>(args: { mutations: FixtureMutation<Data>[]; atomic?: boolean }) {
    const results: FixtureMutationResult[] = [];
    for (const mutation of args.mutations) {
      try {
        // oxlint-disable-next-line eslint/no-await-in-loop, react-doctor/async-await-in-loop -- a batch applies in order, like the server's batch endpoint
        const result = await this.applyMutation(mutation);
        if (result) {
          results.push(result);
        }
      } catch (error) {
        results.push({ success: false, error: error instanceof Error ? error.message : undefined });
      }
    }
    return results;
  }

  async listSince<Data extends FrappeDocData>(args: {
    doctype: string;
    modifiedAfter?: string;
    fields?: readonly string[];
    filters?: ListOptions['filters'];
    limit?: number;
  }) {
    const docs = await this.fixtures.getList<Data>(args.doctype, {
      fields: args.fields,
      filters: args.filters,
      limit: args.limit,
    });
    const deleted: string[] = [];
    return {
      rows: docs.map((d) => asDoc(d, args.doctype)),
      deleted,
      checkpoint: new Date().toISOString(),
    };
  }

  private async applyMutation<Data extends FrappeDocData>(
    mutation: FixtureMutation<Data>,
  ): Promise<FixtureMutationResult | undefined> {
    const { type, doctype, name, data } = mutation;
    if (type === 'create') {
      const doc = await this.fixtures.createDoc(doctype, { ...data, name });
      return { success: true, data: doc };
    }
    if (name === undefined || name === '') {
      return undefined;
    }
    if (type === 'update') {
      const doc = await this.fixtures.updateDoc(doctype, name, data ?? {});
      return { success: true, data: doc };
    }
    if (type === 'delete') {
      await this.fixtures.deleteDoc(doctype, name);
      return { success: true };
    }
    return undefined;
  }
}
