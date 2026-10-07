import type { FrappeDoc, FrappeDocData } from './common/types';
import type { HttpClient } from './core/http';
import type { CustomEndpoints, FrappeLiveConfig, ListOptions, WriteStrategy } from './core/types';
import { FrappeError } from './core/types';
import type { OrderBy } from './sync/types';
import { Order } from './sync/types';

const log = console;

/**
 * Builds endpoint names from app name or custom endpoints
 */
function buildEndpoints(appName?: string, customEndpoints: CustomEndpoints = {}): Required<CustomEndpoints> {
  const prefix = appName ? `${appName}.api` : 'live.live.api';
  return {
    createDoc: customEndpoints.createDoc ?? `${prefix}.create_doc`,
    updateDoc: customEndpoints.updateDoc ?? `${prefix}.update_doc`,
    deleteDoc: customEndpoints.deleteDoc ?? `${prefix}.delete_doc`,
    backfill: customEndpoints.backfill ?? `${prefix}.backfill`,
    getListWithCursor: customEndpoints.getListWithCursor ?? `${prefix}.get_list_with_cursor`,
    batchMutations: customEndpoints.batchMutations ?? `${prefix}.batch_mutations`,
    listSince: customEndpoints.listSince ?? `${prefix}.list_since`,
  };
}

export class DbModule {
  private readonly endpoints: Required<CustomEndpoints>;
  private readonly appName?: string;
  private readonly http: HttpClient;
  private readonly writeStrategy: WriteStrategy;

  constructor(http: HttpClient, config: FrappeLiveConfig = {}) {
    this.http = http;
    this.appName = config.appName;
    this.endpoints = buildEndpoints(config.appName, config.customEndpoints);
    this.writeStrategy = config.writeStrategy ?? 'live';
  }

  getWriteStrategy(): WriteStrategy {
    return this.writeStrategy;
  }

  /**
   * Get the configured app name
   */
  getAppName(): string | undefined {
    return this.appName;
  }

  /**
   * Get configured endpoints
   */
  getEndpoints(): Required<CustomEndpoints> {
    return { ...this.endpoints };
  }

  async getDoc<Data extends FrappeDocData>(doctype: string, name: string): Promise<FrappeDoc<Data>> {
    const res = await this.http.get<{ data: FrappeDoc<Data> }>(
      `/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`,
    );
    return res.payload.data;
  }

  async getDocVersion(doctype: string, name: string): Promise<string | undefined> {
    try {
      const res = await this.http.head(`/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`);
      return res.headers.get('ETag') ?? res.headers.get('Last-Modified') ?? undefined;
    } catch (error) {
      log.error(error);
      return;
    }
  }

  async getDocList<Data extends FrappeDocData>(doctype: string, options: ListOptions = {}): Promise<FrappeDoc<Data>[]> {
    const params: Record<string, string | number | boolean | readonly string[] | [string, string, unknown][]> = {};
    if (options.fields) {
      params.fields = options.fields;
    }
    if (options.filters) {
      params.filters = normalizeFilters(options.filters);
    }
    if (options.orFilters) {
      params.or_filters = options.orFilters;
    }
    if (options.cursor) {
      params.cursor = options.cursor;
    } else if (typeof options.limitStart === 'number') {
      params.limit_start = options.limitStart;
    }
    if (options.limit != null) {
      params.limit_page_length = options.limit;
    }
    if (options.orderBy) {
      const orderByArray = Array.isArray(options.orderBy) ? options.orderBy : [options.orderBy];
      params.order_by = orderByArray.map((ob) => `${ob.field} ${ob.order}`).join(', ');
    }
    if (options.groupBy) {
      params.group_by = options.groupBy;
    }
    if (options.asDict != null) {
      params.as_dict = options.asDict;
    }
    return (
      (
        await this.http.get<{
          data?: FrappeDoc<Data>[];
          message?: FrappeDoc<Data>[];
        }>(`/api/resource/${encodeURIComponent(doctype)}`, params, undefined, options.signal)
      ).payload?.data ?? []
    );
  }

  async getCount(
    doctype: string,
    filters?: [string, string, unknown][] | Record<string, unknown>,
    _cache?: boolean,
    _debug?: boolean,
    signal?: AbortSignal,
  ): Promise<number> {
    const params: Record<string, string | [string, string, unknown][]> = {
      doctype,
    };
    if (filters) {
      params.filters = normalizeFilters(filters);
    }
    const count = (
      await this.http.get<{ message: number }>('/api/method/frappe.client.get_count', params, undefined, signal)
    ).payload?.message;
    if (!Number.isFinite(count)) {
      log.error(`invalid count for doctype ${doctype}: ${count}`);
      return 0;
    }
    return count;
  }

  async createDoc<Data extends FrappeDocData>(
    doc: Partial<FrappeDoc<Data>> & {
      client_mutation_id?: string;
      base_modified?: string;
    } & Pick<FrappeDoc<Data>, 'doctype' | 'name'>,
  ): Promise<FrappeDoc<Data>> {
    const headers: Record<string, string> = {};
    const { client_mutation_id, base_modified: _base_modified, ...cleanDoc } = doc;
    if (this.writeStrategy === 'resource') {
      const { doctype, ...fields } = cleanDoc;
      return (await this.http.post<{ data: FrappeDoc<Data> }>(resourcePath(doctype), fields)).payload.data;
    }
    if (client_mutation_id) {
      headers['Idempotency-Key'] = client_mutation_id;
    }
    const raw = (await this.http.post<FrappeDoc<Data>>(`/api/method/${this.endpoints.createDoc}`, cleanDoc, headers))
      .payload;
    return unwrapMethodDoc(raw);
  }

  async updateDoc<Data extends FrappeDocData>(
    doc: Partial<FrappeDoc<Data>> & {
      client_mutation_id?: string;
      base_modified?: string;
    } & Pick<FrappeDoc<Data>, 'doctype' | 'name'>,
  ): Promise<FrappeDoc<Data>> {
    const headers: Record<string, string> = {};
    const { client_mutation_id, base_modified, doctype, name, ...data } = doc;
    if (this.writeStrategy === 'resource') {
      const body = base_modified ? { ...data, modified: base_modified } : data;
      try {
        return (await this.http.put<{ data: FrappeDoc<Data> }>(resourcePath(doctype, name), body)).payload.data;
      } catch (error) {
        throw asLiveUpdateError(error);
      }
    }
    if (client_mutation_id) {
      headers['Idempotency-Key'] = client_mutation_id;
    }
    if (base_modified) {
      headers['If-Match'] = base_modified;
    }
    const raw = (
      await this.http.post<FrappeDoc<Data>>(`/api/method/${this.endpoints.updateDoc}`, { doctype, name, data }, headers)
    ).payload;
    return unwrapMethodDoc(raw);
  }

  async deleteDoc<Data extends FrappeDocData>(
    doc: Pick<FrappeDoc<Data>, 'doctype' | 'name'> & {
      client_mutation_id?: string;
    },
  ) {
    const headers: Record<string, string> = {};
    const { client_mutation_id, ...cleanDoc } = doc;
    if (this.writeStrategy === 'resource') {
      try {
        return (await this.http.delete<{ message: string }>(resourcePath(cleanDoc.doctype, cleanDoc.name))).payload;
      } catch (error) {
        if (isMissingDoc(error)) {
          return { message: 'ok' };
        }
        throw error;
      }
    }
    if (client_mutation_id) {
      headers['Idempotency-Key'] = client_mutation_id;
    }
    return (await this.http.post<{ message: string }>(`/api/method/${this.endpoints.deleteDoc}`, cleanDoc, headers))
      .payload;
  }

  async renameDoc<Data extends FrappeDocData>(
    doc: Pick<FrappeDoc<Data>, 'doctype' | 'name'>,
    newName: string,
    merge?: boolean,
  ) {
    return (
      await this.http.post<{ message: string }>('/api/method/frappe.model.rename_doc.rename_doc', {
        doctype: doc.doctype,
        old_name: doc.name,
        new_name: newName,
        merge: !!merge,
      })
    ).payload;
  }

  async backfill<Data extends FrappeDocData>(args: BackfillArgs): Promise<BackfillResponse<Data>> {
    const method = args.method ?? this.endpoints.backfill;
    const raw = (
      await this.http.get<{ message?: BackfillResponse<Data> } & BackfillResponse<Data>>(`/api/method/${method}`, {
        doctype: args.doctype,
        fields: args.fields ?? undefined,
        filters: args.filters ?? undefined,
        limit: args.limit ?? 200,
        modified_after: args.modifiedAfter,
      })
    ).payload;
    // Frappe wraps API method responses in { message: { ... } }
    const wrapped = raw as { message?: BackfillResponse<Data> };
    return wrapped.message ?? (raw as BackfillResponse<Data>);
  }

  /**
   * Get documents using cursor-based pagination via frappe_live extension.
   * Provides stable pagination that doesn't skip/duplicate items when data changes.
   */
  async getListWithCursor<Data extends FrappeDocData>(
    args: CursorPaginationArgs,
  ): Promise<CursorPaginationResponse<Data>> {
    const response = await this.http.post<{
      message: CursorPaginationResponse<Data>;
    }>(`/api/method/${this.endpoints.getListWithCursor}`, {
      doctype: args.doctype,
      fields: args.fields,
      filters: args.filters,
      cursor: args.cursor,
      limit: args.limit ?? 100,
      order_by: formatOrderBy(args.orderBy),
    });
    return response.payload.message;
  }

  /**
   * Execute batch mutations via frappe_live extension.
   * Processes multiple create/update/delete operations in a single request.
   */
  async batchMutations<Data extends FrappeDocData>(
    args: BatchMutationsArgs<Data>,
  ): Promise<BatchMutationsResponse<Data>> {
    if (this.writeStrategy === 'resource') {
      return await this.resourceBatch(args);
    }
    const response = await this.http.post<{
      message: BatchMutationsResponse<Data>;
    }>(`/api/method/${this.endpoints.batchMutations}`, {
      mutations: args.mutations,
      atomic: args.atomic ?? false,
    });
    return response.payload.message;
  }

  /**
   * A batch over /api/resource: one request per mutation, in order, each
   * outcome reported like the live app's non-atomic batch. There is no
   * transaction spanning the requests, so an atomic batch is refused.
   */
  private async resourceBatch<Data extends FrappeDocData>(
    args: BatchMutationsArgs<Data>,
  ): Promise<BatchMutationsResponse<Data>> {
    if (args.atomic) {
      throw new Error('Atomic batch mutations need the live app: /api/resource cannot roll back a partial batch');
    }
    const results: BatchMutationsResponse<Data> = [];
    for (const mutation of args.mutations) {
      try {
        const { doctype, name } = mutation;
        if (mutation.type === 'create') {
          const data = await this.createDoc<Data>({
            ...mutation.data,
            doctype,
            ...(name ? { name } : {}),
          } as Partial<FrappeDoc<Data>> & Pick<FrappeDoc<Data>, 'doctype' | 'name'>);
          results.push({ success: true, data });
        } else if (!name) {
          results.push({ success: false, error: `name is required for ${mutation.type}` });
        } else if (mutation.type === 'update') {
          const data = await this.updateDoc<Data>({
            ...mutation.data,
            doctype,
            name,
          } as Partial<FrappeDoc<Data>> & Pick<FrappeDoc<Data>, 'doctype' | 'name'>);
          results.push({ success: true, data });
        } else {
          await this.deleteDoc({ doctype, name });
          results.push({ success: true });
        }
      } catch (error) {
        results.push({ success: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return results;
  }

  /**
   * Get documents modified after a checkpoint via frappe_live extension (CDC).
   * Optimized for incremental sync with tombstone tracking for deletions.
   */
  async listSince<Data extends FrappeDocData>(args: ListSinceArgs): Promise<ListSinceResponse<Data>> {
    const response = await this.http.post<{ message: ListSinceResponse<Data> }>(
      `/api/method/${this.endpoints.listSince}`,
      {
        doctype: args.doctype,
        modified_after: args.modifiedAfter,
        fields: args.fields,
        filters: args.filters,
        limit: args.limit ?? 1000,
      },
    );
    return response.payload.message;
  }
}

function resourcePath(doctype: string, name?: string): string {
  const path = `/api/resource/${encodeURIComponent(doctype)}`;
  return name === undefined ? path : `${path}/${encodeURIComponent(name)}`;
}

function excType(err: FrappeError): string | undefined {
  const data = err.data as { exc_type?: unknown } | undefined;
  return typeof data?.exc_type === 'string' ? data.exc_type : undefined;
}

function isMissingDoc(err: unknown): boolean {
  return err instanceof FrappeError && (err.status === 404 || excType(err) === 'DoesNotExistError');
}

/**
 * The live app answers a stale If-Match with 409 and a missing doc with 412,
 * and the mutation engine treats both as conflicts to reconcile. Frappe's own
 * PUT answers 417 TimestampMismatchError and 404, so map those to the same
 * statuses and a resource-only bench gets the same conflict handling.
 */
function asLiveUpdateError(err: unknown): unknown {
  if (!(err instanceof FrappeError)) {
    return err;
  }
  if (excType(err) === 'TimestampMismatchError') {
    return new FrappeError(err.message, 409, err.data);
  }
  if (isMissingDoc(err)) {
    return new FrappeError(err.message, 412, err.data);
  }
  return err;
}

function normalizeFilters(filters: [string, string, unknown][] | Record<string, unknown>): [string, string, unknown][] {
  if (Array.isArray(filters)) {
    return filters;
  }
  return Object.entries(filters).map(([k, v]) => [k, '=', v]);
}

/**
 * Unwraps Frappe's whitelisted-method response envelope.
 *
 * The live server returns the document wrapped as `{ message: {...doc} }`
 * (every `@frappe.whitelist` return is enveloped). The old code returned the
 * envelope itself, so `created.name` was always undefined and the mutation
 * engine's temporary→real name reconciliation was dead code on the live wire
 * (optimistic rows lingered next to their realtime server rows).
 *
 * Mocks and custom endpoints may return the document directly, so only
 * unwrap when the payload actually looks like an envelope: a `message`
 * object (a doc's own scalar `message` field or a child-table `message`
 * array never matches) on a payload that has no `name` of its own.
 */
function unwrapMethodDoc<Doc>(raw: Doc): Doc {
  if (raw && typeof raw === 'object' && !('name' in raw)) {
    const { message } = raw as { message?: unknown };
    if (message && typeof message === 'object' && !Array.isArray(message)) {
      return message as Doc;
    }
  }
  return raw;
}

export interface BackfillArgs {
  method?: string;
  doctype: string;
  fields?: readonly string[];
  filters?: [string, string, unknown][] | Record<string, unknown>;
  modifiedAfter?: string;
  limit?: number;
}

export interface BackfillResponse<Data extends FrappeDocData> {
  rows: FrappeDoc<Data>[];
  /**
   * Opaque resume cursor. The live server encodes the exact position of the
   * last delivered change ("timestamp|name"); older servers return a plain
   * timestamp. Clients must store and echo it verbatim via `modifiedAfter`.
   */
  checkpoint?: string;
  deleted?: { doctype?: string; name: string }[];
  /** True when the response was truncated at `limit` — keep draining. */
  has_more?: boolean;
}

/**
 * Arguments for cursor-based pagination (frappe_live.api.get_list_with_cursor)
 */
export interface CursorPaginationArgs {
  doctype: string;
  fields?: readonly string[];
  filters?: [string, string, unknown][] | Record<string, unknown>;
  cursor?: string | null;
  limit?: number;
  orderBy?: OrderBy;
}

/**
 * Response from cursor-based pagination endpoint
 */
export interface CursorPaginationResponse<Data extends FrappeDocData> {
  data: FrappeDoc<Data>[];
  next_cursor: string | null;
}

/**
 * Mutation type for batch operations
 */
export type BatchMutationType = 'create' | 'update' | 'delete';

/**
 * Single mutation in a batch
 */
export interface BatchMutation<Data extends FrappeDocData> {
  type: BatchMutationType;
  doctype: string;
  name?: string;
  data?: Partial<Data>;
}

/**
 * Arguments for batch mutations (frappe_live.api.batch_mutations)
 */
export interface BatchMutationsArgs<Data extends FrappeDocData> {
  mutations: BatchMutation<Data>[];
  /** If true, all mutations succeed or all fail */
  atomic?: boolean;
}

/**
 * Result of a single mutation in a batch
 */
export interface BatchMutationResult<Data extends FrappeDocData> {
  success: boolean;
  data?: FrappeDoc<Data>;
  error?: string;
}

/**
 * Response from batch mutations endpoint
 */
export type BatchMutationsResponse<Data extends FrappeDocData> = BatchMutationResult<Data>[];

/**
 * Arguments for list_since CDC endpoint (frappe_live.api.list_since)
 */
export interface ListSinceArgs {
  doctype: string;
  modifiedAfter?: string;
  fields?: readonly string[];
  filters?: [string, string, unknown][] | Record<string, unknown>;
  limit?: number;
}

/**
 * Response from list_since CDC endpoint
 */
export interface ListSinceResponse<Data extends FrappeDocData> {
  rows: FrappeDoc<Data>[];
  deleted: string[];
  /** Opaque resume cursor ("timestamp|name", or plain timestamp on old servers). */
  checkpoint: string;
  /** True when the response was truncated at `limit` — keep draining. */
  has_more?: boolean;
}

/**
 * Format OrderBy for API requests
 */
function formatOrderBy(orderBy?: OrderBy): string | undefined {
  if (!orderBy) {
    return undefined;
  }
  const orderByArray = Array.isArray(orderBy) ? orderBy : [orderBy];
  return orderByArray.map((ob) => `${ob.field} ${ob.order}`).join(', ');
}

// ---------------------------------------------------------------------------
// Tree DocType Support
// ---------------------------------------------------------------------------

/**
 * Arguments for getting tree children
 */
export interface GetTreeChildrenArgs {
  doctype: string;
  parent?: string | null;
  fields?: readonly string[];
  filters?: [string, string, unknown][] | Record<string, unknown>;
}

/**
 * Arguments for getting tree ancestors (path from root)
 */
export interface GetTreeAncestorsArgs {
  doctype: string;
  name: string;
  fields?: readonly string[];
  includeSelf?: boolean;
}

/**
 * Arguments for getting tree descendants
 */
export interface GetTreeDescendantsArgs {
  doctype: string;
  name: string;
  fields?: readonly string[];
  includeSelf?: boolean;
}

/**
 * Tree node with children for building tree structures
 */
export type TreeNode<Data extends FrappeDocData> = FrappeDoc<Data> & {
  children?: TreeNode<Data>[];
};

/**
 * Extension of DbModule with tree doctype methods
 */
export class TreeDbModule {
  private readonly db: DbModule;

  constructor(db: DbModule) {
    this.db = db;
  }

  /**
   * Get children of a tree node.
   * Pass parent=null/undefined to get root nodes.
   *
   * @example
   * ```ts
   * // Get root accounts
   * const roots = await tree.getChildren({ doctype: "Account", parent: null });
   * // Get children of a specific account
   * const children = await tree.getChildren({ doctype: "Account", parent: "Assets" });
   * ```
   */
  async getChildren<Data extends FrappeDocData>(args: GetTreeChildrenArgs): Promise<FrappeDoc<Data>[]> {
    const parentField = this.getParentField(args.doctype);

    const filters = [...normalizeFiltersForTree(args.filters)];
    if (args.parent === null || args.parent === undefined) {
      // Get root nodes (no parent or parent is empty string)
      filters.push([parentField, 'in', ['', null]]);
    } else {
      filters.push([parentField, '=', args.parent]);
    }

    return await this.db.getDocList<Data>(args.doctype, {
      fields: args.fields,
      filters,
      orderBy: [{ field: 'name', order: Order.Asc }],
    });
  }

  /**
   * Get ancestors of a node (path from root to this node).
   * Uses Frappe's built-in "ancestors of" filter.
   *
   * @example
   * ```ts
   * const path = await tree.getAncestors({ doctype: "Account", name: "Cash - ABC" });
   * // Returns: [root, ..., parent, ..., Cash - ABC] if includeSelf is true
   * ```
   */
  async getAncestors<Data extends FrappeDocData>(args: GetTreeAncestorsArgs): Promise<FrappeDoc<Data>[]> {
    // Use Frappe's "ancestors of" filter via getDocList
    const docs = await this.db.getDocList<Data>(args.doctype, {
      fields: args.fields,
      filters: [['name', 'ancestors of', args.name]],
      limit: 0, // Get all ancestors
    });

    if (args.includeSelf) {
      const self = await this.db.getDoc<Data>(args.doctype, args.name);
      return [...docs, self];
    }

    return docs;
  }

  /**
   * Get all descendants of a node.
   * Uses Frappe's built-in tree traversal.
   *
   * @example
   * ```ts
   * const allChildren = await tree.getDescendants({ doctype: "Account", name: "Assets" });
   * ```
   */
  async getDescendants<Data extends FrappeDocData>(args: GetTreeDescendantsArgs): Promise<FrappeDoc<Data>[]> {
    // Use Frappe's descendants of filter
    const docs = await this.db.getDocList<Data>(args.doctype, {
      fields: args.fields,
      filters: [['name', 'descendants of', args.name]],
      limit: 0, // Get all
    });

    if (args.includeSelf) {
      const self = await this.db.getDoc<Data>(args.doctype, args.name);
      return [self, ...docs];
    }

    return docs;
  }

  /**
   * Build a full tree structure from root nodes.
   * This recursively fetches children to build a nested tree.
   *
   * @example
   * ```ts
   * const tree = await treeDb.buildTree<Account>({ doctype: "Account" });
   * // Returns: [{ name: "Assets", children: [...] }, { name: "Liabilities", children: [...] }]
   * ```
   */
  async buildTree<Data extends FrappeDocData>(args: {
    doctype: string;
    fields?: readonly string[];
    maxDepth?: number;
  }): Promise<TreeNode<Data>[]> {
    const { doctype, fields, maxDepth = 10 } = args;

    const buildNode = async (doc: FrappeDoc<Data>, depth: number): Promise<TreeNode<Data>> => {
      if (depth >= maxDepth) {
        return { ...doc };
      }

      const children = await this.getChildren<Data>({
        doctype,
        parent: doc.name,
        fields,
      });

      const childNodes = await Promise.all(children.map(async (child) => await buildNode(child, depth + 1)));

      return {
        ...doc,
        children: childNodes.length > 0 ? childNodes : undefined,
      };
    };

    // Get root nodes
    const roots = await this.getChildren<Data>({
      doctype,
      parent: null,
      fields,
    });

    return await Promise.all(roots.map(async (root) => await buildNode(root, 0)));
  }

  /**
   * Get the parent field name for a tree doctype.
   * Convention: parent_<doctype_lowercase_with_underscores>
   */
  private getParentField(doctype: string): string {
    return `parent_${doctype.toLowerCase().replaceAll(' ', '_')}`;
  }
}

/**
 * Normalize filters for tree operations
 */
function normalizeFiltersForTree(
  filters: [string, string, unknown][] | Record<string, unknown> | undefined,
): [string, string, unknown][] {
  if (!filters) {
    return [];
  }
  if (Array.isArray(filters)) {
    return filters;
  }
  return Object.entries(filters).map(([k, v]) => [k, '=', v]);
}
