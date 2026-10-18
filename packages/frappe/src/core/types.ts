import type { FilterObject } from '../sync/filters';
import type { OrderBy } from '../sync/types';

export enum AuthType {
  Bearer = 'Bearer',
  Token = 'token',
}

export interface AuthConfig {
  /**
   * Raw cookie string to attach to every request (used in SSR / Node.js
   * where the browser cookie jar is not available).
   *
   * Example: `"sid=abc123; system_user=yes"`
   */
  cookie?: string;
  sessionId?: string | (() => string | Promise<string>);
  token?: string | (() => string | Promise<string>);
  type?: AuthType;
  useToken?: boolean;
}

export interface RetryConfig {
  baseDelayMs?: number;
  exponentialBackoff?: boolean;
  maxDelayMs?: number;
  maxRetries?: number;
  retryOnNetworkError?: boolean;
  retryStatusCodes?: number[];
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- receives whatever the request threw: a FrappeError or a network error
  shouldRetry?: (err: unknown, attempt: number) => boolean;
}

export interface CustomEndpoints {
  createDoc?: string;
  deleteDoc?: string;
  backfill?: string;
  updateDoc?: string;
  /** Cursor-based pagination endpoint (frappe_live.api.get_list_with_cursor) */
  getListWithCursor?: string;
  /** Batch mutations endpoint (frappe_live.api.batch_mutations) */
  batchMutations?: string;
  /** CDC list_since endpoint (frappe_live.api.list_since) */
  listSince?: string;
}

/**
 * Configuration for frappe_live extension endpoints
 */
export interface FrappeLiveConfig {
  /** Custom Frappe app name for extension endpoints (default: 'frappe_live') */
  appName?: string;
  /** Custom endpoints to override default frappe_live endpoints */
  customEndpoints?: CustomEndpoints;
  /**
   * Where create, update and delete go. `live` (the default) calls the live
   * app's methods, with idempotency keys and atomic batches. `resource` uses
   * Frappe's own `/api/resource` routes, for a bench without the live app.
   */
  writeStrategy?: WriteStrategy;
}

export type WriteStrategy = 'live' | 'resource';

export enum HttpMethod {
  Delete = 'DELETE',
  Get = 'GET',
  Head = 'HEAD',
  Post = 'POST',
  Put = 'PUT',
}

export class FrappeError extends Error {
  public readonly status: number;
  public readonly data?: unknown;
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- the raw error response body, kept unparsed for callers to inspect
  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = 'FrappeError';
    this.status = status;
    this.data = data;
    Object.setPrototypeOf(this, FrappeError.prototype);
  }
}

export interface ListOptions {
  asDict?: boolean;
  cursor?: string;
  fields?: readonly string[];
  filters?: [string, string, unknown][] | FilterObject;
  groupBy?: string;
  limit?: number;
  limitStart?: number;
  orFilters?: [string, string, unknown][];
  orderBy?: OrderBy;
  /** Cancels the underlying HTTP request when aborted (never serialized). */
  signal?: AbortSignal;
}
