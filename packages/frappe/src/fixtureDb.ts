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

export class FixtureDbModule {
  private readonly fixtures: FixtureProvider;

  constructor(fixtures: FixtureProvider) {
    this.fixtures = fixtures;
  }

  getAppName(): string | undefined {
    return undefined;
  }

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
    return { ...doc, doctype, name } as FrappeDoc<Data>;
  }

  async getDocVersion(_doctype: string, _name: string): Promise<string | undefined> {
    return undefined;
  }

  async getDocList<Data extends FrappeDocData>(doctype: string, options: ListOptions = {}): Promise<FrappeDoc<Data>[]> {
    const fixtureOptions: Parameters<FixtureProvider['getList']>[1] = {};

    if (options.fields) {
      fixtureOptions.fields = options.fields;
    }
    if (options.filters) {
      fixtureOptions.filters = options.filters as any;
    }
    if (options.orderBy) {
      fixtureOptions.orderBy = normalizeOrderBy(options.orderBy);
    }
    if (typeof options.limitStart === 'number') {
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
    if (options.cursor && typeof options.limitStart !== 'number') {
      const ordered = await this.fixtures.getList(doctype, {
        filters: options.filters as any,
        orderBy: options.orderBy ? normalizeOrderBy(options.orderBy) : undefined,
      } as any);
      const cursorIdx = ordered.findIndex((d: any) => d.name === options.cursor);
      if (cursorIdx !== -1) {
        fixtureOptions.limitStart = cursorIdx + 1;
      }
    }

    const docs = await this.fixtures.getList<Data>(doctype, fixtureOptions as any);
    return docs.map((d) => ({ ...d, doctype, name: (d as any).name }) as FrappeDoc<Data>);
  }

  async getCount(doctype: string, filters?: [string, string, unknown][] | Record<string, unknown>): Promise<number> {
    const docs = await this.fixtures.getList(doctype, {
      filters: filters as any,
    });
    return docs.length;
  }

  async createDoc<Data extends FrappeDocData>(
    doc: Partial<FrappeDoc<Data>> & Pick<FrappeDoc<Data>, 'doctype' | 'name'>,
  ): Promise<FrappeDoc<Data>> {
    const { client_mutation_id: _, base_modified: _b, ...cleanDoc } = doc as any;
    return await this.fixtures.createDoc<FrappeDoc<Data>>(doc.doctype, cleanDoc);
  }

  async updateDoc<Data extends FrappeDocData>(
    doc: Partial<FrappeDoc<Data>> & Pick<FrappeDoc<Data>, 'doctype' | 'name'>,
  ): Promise<FrappeDoc<Data>> {
    const { client_mutation_id: _, base_modified: _b, doctype, name, ...data } = doc as any;
    return await this.fixtures.updateDoc<FrappeDoc<Data>>(doctype, name, data);
  }

  async deleteDoc<Data extends FrappeDocData>(doc: Pick<FrappeDoc<Data>, 'doctype' | 'name'>) {
    await this.fixtures.deleteDoc(doc.doctype, doc.name);
    return { message: 'ok' };
  }

  async renameDoc<Data extends FrappeDocData>(
    _doc: Pick<FrappeDoc<Data>, 'doctype' | 'name'>,
    _newName: string,
    _merge?: boolean,
  ) {
    return { message: 'not supported in fixture mode' };
  }

  async backfill<Data extends FrappeDocData>(args: BackfillArgs): Promise<BackfillResponse<Data>> {
    const docs = await this.fixtures.getList<Data>(args.doctype, {
      fields: args.fields as any,
      filters: args.filters as any,
      limit: args.limit,
    });
    return {
      rows: docs.map((d) => ({ ...d, doctype: args.doctype }) as FrappeDoc<Data>),
      checkpoint: new Date().toISOString(),
      deleted: [],
    };
  }

  async getListWithCursor<Data extends FrappeDocData>(args: {
    doctype: string;
    fields?: readonly string[];
    filters?: [string, string, unknown][] | Record<string, unknown>;
    cursor?: string | null;
    limit?: number;
    orderBy?: OrderBy;
  }) {
    const limit = args.limit ?? 100;
    let limitStart = 0;
    if (args.cursor) {
      const allDocs = await this.fixtures.getList(args.doctype, {
        filters: args.filters as any,
        orderBy: args.orderBy ? normalizeOrderBy(args.orderBy) : undefined,
      });
      const cursorIdx = allDocs.findIndex((d: any) => d.name === args.cursor);
      if (cursorIdx !== -1) {
        limitStart = cursorIdx + 1;
      }
    }

    const docs = await this.fixtures.getList<Data>(args.doctype, {
      fields: args.fields as any,
      filters: args.filters as any,
      orderBy: args.orderBy ? normalizeOrderBy(args.orderBy) : undefined,
      limitStart,
      limit,
    });

    const data = docs.map((d) => ({ ...d, doctype: args.doctype }) as FrappeDoc<Data>);
    const lastDoc = data.length > 0 ? data.at(-1) : null;

    return {
      data,
      next_cursor: data.length === limit && lastDoc ? (lastDoc as any).name : null,
    };
  }

  async batchMutations<Data extends FrappeDocData>(args: {
    mutations: { type: string; doctype: string; name?: string; data?: Partial<Data> }[];
    atomic?: boolean;
  }) {
    const results: { success: boolean; data?: FrappeDocData; error?: string }[] = [];
    for (const mutation of args.mutations) {
      try {
        if (mutation.type === 'create') {
          const doc = await this.fixtures.createDoc(mutation.doctype, {
            ...mutation.data,
            name: mutation.name,
          } as any);
          results.push({ success: true, data: doc });
        } else if (mutation.type === 'update' && mutation.name) {
          const doc = await this.fixtures.updateDoc(mutation.doctype, mutation.name, mutation.data as any);
          results.push({ success: true, data: doc });
        } else if (mutation.type === 'delete' && mutation.name) {
          await this.fixtures.deleteDoc(mutation.doctype, mutation.name);
          results.push({ success: true });
        }
      } catch (error: any) {
        results.push({ success: false, error: error.message });
      }
    }
    return results;
  }

  async listSince<Data extends FrappeDocData>(args: {
    doctype: string;
    modifiedAfter?: string;
    fields?: readonly string[];
    filters?: [string, string, unknown][] | Record<string, unknown>;
    limit?: number;
  }) {
    const docs = await this.fixtures.getList<Data>(args.doctype, {
      fields: args.fields as any,
      filters: args.filters as any,
      limit: args.limit,
    });
    return {
      rows: docs.map((d) => ({ ...d, doctype: args.doctype }) as FrappeDoc<Data>),
      deleted: [] as string[],
      checkpoint: new Date().toISOString(),
    };
  }
}

function normalizeOrderBy(orderBy: OrderBy): { field: string; order: string } | { field: string; order: string }[] {
  if (Array.isArray(orderBy)) {
    return orderBy.map((ob) => ({ field: ob.field, order: ob.order }));
  }
  return { field: orderBy.field, order: orderBy.order };
}
