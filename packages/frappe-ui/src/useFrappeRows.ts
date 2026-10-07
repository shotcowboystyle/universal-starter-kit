/**
 * useFrappeRows — the composed doctype READ, exported (MPO-251).
 *
 * frappe-ui already re-exports the primitives underneath every live view
 * (`useFrappeCollection`, `useLiveQuery`, `useFrappeConfig`). What it did not
 * export was the ten lines that turn them into rows, so a consumer whose
 * panel shape has no shipped component (a balance tree with colon paths, a
 * register that folds a running balance before pagination, a per-currency
 * exact sum) copied the read out of FrappeTable and owned it forever. This
 * is that read, factored out, with the three things the copies had to get
 * right owned here instead:
 *
 * 1. ERROR PLUMBING. Without `onSyncError` wired through, a 403 or a dead
 *    server renders as an EMPTY panel with no error anywhere — success and
 *    total failure look identical. `error` here carries the surfaced sync
 *    failure, normalized through {@link toLiveLoadError} so a permission
 *    rejection reads differently from a network failure. Pass `messages` to
 *    keep i18n ownership in the calling component.
 *
 * 2. THE LIMIT. A live bench sends no `limit_page_length` when the
 *    subscription carries no limit, and clamps the page to 20 rows
 *    (frappe `sync/subscriptionManager.ts`); a fixture provider slices only
 *    when asked, so the truncation shows on serve and never in a story.
 *    `limit` therefore defaults to {@link DEFAULT_FRAPPE_ROWS_LIMIT} rather
 *    than being left to each caller. `limit: null` is the explicit opt-out
 *    for a caller that genuinely wants the bench default — FrappeTable
 *    passes it so its own row count does not move under existing consumers.
 *
 * 3. COLLECTION SHARING. `useFrappeCollection` keys its cache on the JSON of
 *    the options (doctype + fields + filters + orderBy + limit + id), so two
 *    hooks reading the same doctype with the SAME field list share one
 *    collection and one subscription — and two hooks whose field lists
 *    differ by a single entry do NOT. Pin one field list per doctype in a
 *    module constant and reuse it. `onSyncError` is deliberately NOT part of
 *    that key, so passing a different error handler never splits a
 *    collection.
 *
 * The shipped doctype views read through this hook — FrappeTable,
 * FrappeList (via useFrappePagination), FrappeTreeView, FrappeKanban,
 * FrappeCalendar, FrappeGantt, FrappeImageView, FrappeDashboard and
 * FrappeReportBuilder — so there is ONE implementation of the read rather
 * than a reference one and N copies.
 *
 * @example
 * ```tsx
 * const accountFields = ["name", "account", "balance"] as const;
 *
 * function Balances() {
 *   const connection = useFrappeConnection();
 *   const { rows, isLoading, error } = useFrappeRows<Account>(connection, "Account", {
 *     fields: accountFields,
 *     limit: 500,
 *   });
 *   if (error) return <ErrorNotice error={error} />;
 *   if (isLoading) return <Spinner />;
 *   return rows.map((account) => <BalanceRow key={account.name} account={account} />);
 * }
 * ```
 */

import { useFrappeCollection, useLiveQuery } from '@repo/frappe';
import type { Order, FixtureProvider } from '@repo/frappe';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useFrappeConfig } from './FrappeProvider';
import { toLiveLoadError } from './liveErrors';

/**
 * Rows returned when the caller passes no `limit`.
 *
 * Not a tuned number — it exists so a missing limit truncates at a value
 * that is written down rather than at the bench's silent 20. A panel that
 * knows its own ceiling should pass one.
 */
export const DEFAULT_FRAPPE_ROWS_LIMIT = 100;

/**
 * Connection shape the live-wired frappe-ui surfaces hand to
 * @repo/frappe — the FrappeProvider config narrowed to the
 * fields the collection layer reads. Same shape
 * {@link FrappeAggregateConnection} uses.
 */
export interface FrappeRowsConnection {
  /** Required unless `fixtures` is set (see FrappeConfig.baseURL). */
  baseURL?: string;
  socketPort?: number;
  /** Same-origin socket override (see FrappeConfig.socketBaseURL). */
  socketBaseURL?: string;
  /** Frappe site name — the realtime Socket.IO namespace. */
  siteName?: string;
  auth?: {
    useToken?: boolean;
    token?: string | (() => string | Promise<string>);
    type?: string;
  };
  syncOptions?: any;
  fixtures?: FixtureProvider;
}

/** User-facing sentences for the failure kinds, so i18n stays with the caller. */
export interface FrappeRowsMessages {
  /** Lead sentence when the server rejected the read (403 / PermissionError). */
  permission: string;
  /** Lead sentence for every other initial-sync failure. */
  generic: string;
  /**
   * Message when the live query itself reports a failure that carries no
   * detail of its own. Defaults to `generic`.
   */
  queryFailed?: string;
}

export interface UseFrappeRowsOptions<TDoc> {
  /** Fields to fetch. Pin ONE list per doctype so readers share a collection. */
  fields?: readonly (keyof TDoc & string)[];
  filters?: Partial<TDoc> | [keyof TDoc & string, string, any][];
  orderBy?: { field: keyof TDoc & string; order: Order }[];
  /**
   * Row ceiling for the subscription. Defaults to
   * {@link DEFAULT_FRAPPE_ROWS_LIMIT}; pass `null` to send no limit and take
   * the bench's own page length (20 on a stock site) — the legacy behavior,
   * and an explicit choice rather than an omission.
   */
  limit?: number | null;
  /** False parks the hook: no collection, no rows, not loading. */
  enabled?: boolean;
  /** Sentences for the surfaced error. Defaults are untranslated English. */
  messages?: FrappeRowsMessages;
  /**
   * Full override of the sync-failure → Error mapping, for a component whose
   * error copy predates {@link toLiveLoadError}'s "lead: detail" shape. Wins
   * over `messages` on the sync path; `messages.queryFailed` still names the
   * detail-less live-query failure.
   */
  mapError?: (err: unknown) => Error;
}

export interface UseFrappeRowsResult<TDoc> {
  /** Rows currently in the collection ([] before the first sync). */
  rows: TDoc[];
  /**
   * The initial-sync failure alone (403, network, bad doctype) — the one
   * that carries an actionable message. Null when the only signal is the
   * live query's detail-less `isError`.
   */
  syncError: Error | null;
  /** First load in flight — no rows to show yet. */
  isLoading: boolean;
  /**
   * The live query's own loading flag, untouched by `enabled`. Components
   * that hold last-good rows across a collection swap read this rather than
   * `isLoading`.
   */
  isQueryLoading: boolean;
  /** The live query reported a failure (no message available). */
  isError: boolean;
  /** Surfaced failure — sync error first, live-query failure second. */
  error: Error | null;
  /**
   * The underlying collection. `undefined` while parked, during SSR, or
   * before the sync module exists. Identity changes when the query changes,
   * which is the dependency to reset per-query state on.
   */
  collection: ReturnType<typeof useFrappeCollection<any>>;
}

const defaultMessages: FrappeRowsMessages = {
  permission: 'You do not have permission to view this document type',
  generic: 'Failed to load',
};

/**
 * Read a Frappe doctype into rows: collection + live query + honest error
 * state, in one hook.
 *
 * @typeParam TDoc - The document type (needs `name` and `doctype`)
 * @param connection - Connection config; `undefined` parks the hook
 * @param doctype - The doctype to read (`""` parks the hook)
 * @param options - Fields, filters, ordering, limit, enabled, messages
 */
export function useFrappeRows<TDoc extends { name: string; doctype: string }>(
  connection: FrappeRowsConnection | undefined,
  doctype: string,
  options: UseFrappeRowsOptions<TDoc> = {},
): UseFrappeRowsResult<TDoc> {
  const { fields, filters, orderBy, limit, enabled = true, messages, mapError } = options;
  const active = enabled && !!connection && !!doctype;

  const permissionMessage = messages?.permission ?? defaultMessages.permission;
  const genericMessage = messages?.generic ?? defaultMessages.generic;
  const queryFailedMessage = messages?.queryFailed ?? genericMessage;

  // Honest error surface: the collection swallows initial-sync failures
  // (renders as empty otherwise); onSyncError turns 403/PermissionError and
  // network failures into a visible error state.
  const [syncError, setSyncError] = useState<Error | null>(null);
  const mapErrorRef = useRef(mapError);
  mapErrorRef.current = mapError;
  const handleSyncError = useCallback(
    (err: unknown) => {
      setSyncError(
        mapErrorRef.current ? mapErrorRef.current(err) : toLiveLoadError(err, { permissionMessage, genericMessage }),
      );
    },
    [permissionMessage, genericMessage],
  );

  // `null` opts out of a limit entirely; `undefined` takes the documented
  // default so a missing limit cannot silently clamp to the bench's 20.
  const resolvedLimit = limit === null ? undefined : (limit ?? DEFAULT_FRAPPE_ROWS_LIMIT);

  const collectionOptions = useMemo(
    () => ({
      fields,
      filters,
      orderBy,
      ...(resolvedLimit === undefined ? {} : { limit: resolvedLimit }),
      onSyncError: handleSyncError,
    }),
    [fields, filters, orderBy, resolvedLimit, handleSyncError],
  );

  const collection = useFrappeCollection<TDoc>(
    active ? (connection as any) : undefined,
    active ? doctype : '',
    collectionOptions as any,
  );

  // A new collection (doctype / filter / field change) starts clean.
  useEffect(() => {
    setSyncError(null);
  }, [collection]);

  const {
    data: rawData,
    isLoading: isQueryLoading,
    isError,
  } = useLiveQuery((q) => (collection ? q.from({ _list: collection }) : null), [collection]);

  const rows = useMemo(() => (rawData as TDoc[] | undefined) ?? [], [rawData]);

  const error = useMemo(
    () => syncError ?? (isError ? new Error(queryFailedMessage) : null),
    [syncError, isError, queryFailedMessage],
  );

  return {
    rows,
    syncError,
    isLoading: active && (!collection || isQueryLoading),
    isQueryLoading,
    isError,
    error,
    collection,
  };
}

/**
 * The FrappeProvider config narrowed to a {@link FrappeRowsConnection}, with
 * per-call overrides for the components that accept `baseURL` / `auth` /
 * `syncOptions` props of their own.
 *
 * Returns `undefined` only when neither a baseURL nor a fixture corpus is
 * configured — with nothing to read from, the collection layer cannot be
 * built. Fixtures alone are enough: nothing dials a server in fixture mode.
 * Callers that require a connection should throw with their own component
 * name so the message names the missing provider.
 */
export function useFrappeConnection(overrides?: {
  baseURL?: string;
  auth?: FrappeRowsConnection['auth'];
  syncOptions?: any;
}): FrappeRowsConnection | undefined {
  const config = useFrappeConfig();
  const baseURL = overrides?.baseURL ?? config?.baseURL;
  const auth = overrides?.auth ?? config?.auth;
  const syncOptions = overrides?.syncOptions ?? config?.syncOptions;
  const socketPort = config?.socketPort;
  const siteName = config?.siteName;
  const socketBaseURL = config?.socketBaseURL;
  const fixtures = config?.fixtures;
  return useMemo(
    () =>
      baseURL || fixtures ? { baseURL, socketPort, siteName, socketBaseURL, auth, syncOptions, fixtures } : undefined,
    [baseURL, socketPort, siteName, socketBaseURL, auth, syncOptions, fixtures],
  );
}
