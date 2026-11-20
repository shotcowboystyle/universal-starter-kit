import { FrappeApp, Order, matchesFilters, useDocTypeMeta, useFrappeDoctypeEvents } from '@repo/frappe';
import type { UseFrappeCollectionConfig } from '@repo/frappe';
import { DataTable, FilterManager, SavedFilterDropdown, useSavedFilters } from '@repo/table';
import type {
  DataTableColumn,
  DataTablePageLoader,
  DataTableProps,
  DataTableState,
  FilterOperator,
  FilterValue,
  FilterableField,
  PageLoadQuery,
  ParsedFilter,
} from '@repo/table';
import { useResolvedKnobs } from '@repo/theme';
import { AsyncBoundary } from '@repo/ui';
import type { AsyncBoundaryProps } from '@repo/ui';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { XStack, YStack } from 'tamagui';

import { docFieldsToFilterFields } from './filter-fields';
import type { DocRights } from './formEngine/doc-permissions';
import { buildPermLevelMatrix } from './formEngine/field-permissions';
import { useDocRights } from './formEngine/use-doc-rights';
import { useFrappeConfig } from './FrappeProvider';
import { FrappeReconnectIndicator } from './FrappeReconnectIndicator';
import { buildListColumns } from './list/list-columns';
import { listFieldsToFetch } from './list/list-fields';
import { isPermissionError } from './live-errors';
import { useFrappeRows } from './use-frappe-rows';

/**
 * Props for the FrappeTable component.
 *
 * `data` is omitted because FrappeTable fetches its own rows. Everything else
 * on `DataTableProps` passes straight through — including `rowAccumulator`
 * (MPO-250), so a Frappe-bound table CAN carry a folded column (a running
 * balance, a per-row cumulative count) without the caller re-fetching the
 * doctype and hand-assembling a DataTable. Declare the derived field on
 * `TDoc` so a column can name it in `accessorKey`:
 *
 * ```tsx
 * const balance: RowAccumulator<Partial<Posting>, string> = {
 *   initial: "0",
 *   reduce: (carried, row) => addMoney(carried, row.amount ?? "0"),
 *   derive: (carried) => ({ running: carried }),
 *   order: (a, b) => compareByDateThenName(a, b),
 * };
 * <FrappeTable<Posting & { running?: string }> doctype="Posting" rowAccumulator={balance} … />
 * ```
 *
 * The fold runs over the rows the table HOLDS, before pagination. In
 * `serverSide` mode that is one page, so a running balance there needs the
 * server to send the figure — the fold cannot invent rows it never got.
 */
export interface FrappeTableProps<TDoc extends { name: string; doctype: string }> extends Omit<
  DataTableProps<Partial<TDoc>>,
  'data' | 'columns'
> {
  /** Base URL for the Frappe server (uses FrappeProvider config if not set) */
  baseURL?: string;
  /** Authentication configuration */
  auth?: {
    /** Whether to use token authentication */
    useToken?: boolean;
    /** The authentication token, or a (possibly async) getter for lazy/rotating tokens */
    token?: string | (() => string | Promise<string>);
    /** Authentication type (e.g., 'token', 'cookie') */
    type?: string;
  };
  /** Sync options for the live data subscription */
  syncOptions?: UseFrappeCollectionConfig['syncOptions'];
  /** The Frappe DocType to display */
  doctype: string;
  /**
   * Column definitions. Omitted, they come from the doctype's meta through
   * `buildListColumns`, the desk list's own anatomy (title, the
   * in_list_view fields the session may read, activity), and the table
   * waits for meta and the session's roles before its first read.
   */
  columns?: DataTableColumn<Partial<TDoc>>[];
  /**
   * Fields to fetch. Omitted, a read from the bench (`serverSide`, or client
   * mode under a provider without `fixtures`) requests `name` plus every
   * column's `accessorKey` (with `columns` omitted too, the fields the
   * derived columns paint: `listFieldsToFetch`), and client mode under a
   * provider carrying `fixtures` reads whole documents from the corpus. A column keyed on
   * something that is not a doctype field (a rowAccumulator's derived key,
   * say) makes the bench refuse that read, so name the list to leave such a
   * key out. Name it, too, to share one collection with another reader of
   * the same doctype (see useFrappeRows) or to fetch fields no column shows,
   * such as a title field or a filter-only field.
   */
  fields?: readonly (keyof TDoc & string)[];
  /** Initial filter criteria */
  filters?: Partial<TDoc> | [keyof TDoc & string, string, unknown][];
  /**
   * Callback when a row is activated. Rides DataTable's first-class
   * `onRowPress` contract: the whole row is ONE pressable unit (no
   * per-cell pressable wrappers), the row set exposes a single roving tab
   * stop (LC-49), Enter AND Space activate the focused row (LC-50), and
   * presses on inner interactive controls (selection checkboxes, buttons,
   * links) never fire the row press.
   */
  onRowClick?: (row: Partial<TDoc>) => void;
  /** Custom loading indicator */
  loading?: React.ReactNode;
  /** Custom error renderer */
  error?: (error: Error) => React.ReactNode;
  /** Enable saved filters feature */
  savedFilters?: boolean;
  /** Allow creating global (shared) filters */
  canCreateGlobalFilters?: boolean;
  /** Current user ID for saved filters */
  userId?: string;
  /**
   * When true, enable server-side filtering, sorting, and pagination.
   * Uses Frappe REST API (limit_start, limit_page_length, order_by, filters).
   * Requires onStateChange for state sync; fetches data based on table state.
   */
  serverSide?: boolean;
  /**
   * Callback when filters, sort, or pagination change.
   * Used for server-side fetches when serverSide is true.
   */
  onStateChange?: (state: DataTableState) => void;
  /**
   * In-place refresh channel: bump the value to re-run the current query
   * (serverSide mode) without remounting — rows stay rendered and swap when
   * the response lands (keep-rows-and-reconcile; never key the table on a
   * refresh generation).
   */
  refreshToken?: unknown;
  /**
   * Density. DataTableRoot accepts this; it is not on DataTableProps, so
   * FrappeTable has to name it or callers (backoffice list) fail the build.
   */
  compact?: boolean;
  /**
   * Filters the toolbar offers. Omitted, the list is derived from the
   * doctype's meta: under a provider carrying `fixtures` that is the
   * corpus's "DocType" entry and never the network, whatever `baseURL` the
   * host also carries (a corpus without the entry yields no menu);
   * otherwise it is a `frappe.desk.form.load.getdoctype` call. The
   * meta-derived menu offers the doctype's fields, including ones the
   * server refuses to filter on, so a live app should pass the honored
   * set by hand. Passing it skips the meta read entirely, which also drops
   * title-field row labels back to the document name, unless the table
   * still reads meta for `rights`.
   */
  filterableFields?: FilterableField[];
  /**
   * The session's rights on the doctype. Without write the cells render
   * read-only, without create there is no add row, without delete no row
   * delete. Omitted, the table resolves them from the doctype's meta and the
   * session's roles; a fixtures connection withholds nothing.
   */
  rights?: Pick<DocRights, 'create' | 'write' | 'delete'>;
}

type FrappeFilterTuple = [string, string, unknown];

/** A caller-written `%` wildcard is kept as-is instead of being wrapped again. */
const likeOperand = (value: FilterValue['value'], pattern: string): string =>
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- FilterValue.value is untyped by contract; only a string can carry a wildcard
  typeof value === 'string' && value.includes('%') ? value : pattern;

/** Operators that read `values` (or nothing); a missing list yields null. */
const LIST_OPERATORS = new Map<FilterOperator, (values: FilterValue['values']) => [string, unknown] | null>([
  ['isEmpty', () => ['is', 'not set']],
  ['isNotEmpty', () => ['is', 'set']],
  ['isAnyOf', (values) => ((values?.length ?? 0) > 0 ? ['in', values] : null)],
  ['isNoneOf', (values) => ((values?.length ?? 0) > 0 ? ['not in', values] : null)],
  ['isBetween', (values) => (values?.length === 2 ? ['between', values] : null)],
]);

/** Operators that read `value`; any operator not listed here (isNotBetween) maps to equality. */
const VALUE_OPERATORS = new Map<FilterOperator, (value: FilterValue['value']) => [string, unknown]>([
  ['contains', (value) => ['like', likeOperand(value, `%${value}%`)]],
  ['doesNotContain', (value) => ['not like', likeOperand(value, `%${value}%`)]],
  ['startsWith', (value) => ['like', likeOperand(value, `${value}%`)]],
  ['endsWith', (value) => ['like', likeOperand(value, `%${value}`)]],
  ['is', (value) => ['=', value]],
  ['isNot', (value) => ['!=', value]],
  ['isLessThan', (value) => ['<', value]],
  ['isBefore', (value) => ['<', value]],
  ['isGreaterThan', (value) => ['>', value]],
  ['isAfter', (value) => ['>', value]],
  ['isLessThanOrEqual', (value) => ['<=', value]],
  ['isOnOrBefore', (value) => ['<=', value]],
  ['isGreaterThanOrEqual', (value) => ['>=', value]],
  ['isOnOrAfter', (value) => ['>=', value]],
]);

/**
 * Map one table FilterValue to a Frappe filter tuple. Returns null when the
 * filter carries no usable value (e.g. "contains" with an empty string) so
 * half-built live-commit filters never reach the API.
 */
export const filterValueToFrappeTuple = (fieldname: string, filterValue: FilterValue): FrappeFilterTuple | null => {
  const listOperator = LIST_OPERATORS.get(filterValue.operator);
  if (listOperator !== undefined) {
    const entry = listOperator(filterValue.values);
    return entry === null ? null : [fieldname, ...entry];
  }
  if (filterValue.value == null || filterValue.value === '') {
    return null;
  }
  const valueOperator = VALUE_OPERATORS.get(filterValue.operator);
  return valueOperator === undefined
    ? [fieldname, '=', filterValue.value]
    : [fieldname, ...valueOperator(filterValue.value)];
};

/** True when a column-filter value is FilterValue-shaped ({operator, ...}). */
const isOperatorFilterValue = (value: unknown): value is FilterValue =>
  typeof value === 'object' && value !== null && 'operator' in value && typeof value.operator === 'string';

/** Ascending comparison of one field; null/undefined sorts first. */
const compareFieldAscending = <T extends Record<string, unknown>>(a: T, b: T, field: string): number => {
  const av = a[field];
  const bv = b[field];
  if (av == null && bv == null) {
    return 0;
  }
  if (av == null) {
    return -1;
  }
  if (bv == null) {
    return 1;
  }
  if (av < bv) {
    return -1;
  }
  return av > bv ? 1 : 0;
};

/** Sort the current page locally so a sort change is visible before reconcile. */
const sortRowsLocally = <T extends Record<string, unknown>>(
  rows: T[],
  orderBy: { field: string; order: Order }[] | undefined,
): T[] => {
  if (orderBy === undefined || orderBy.length === 0) {
    return rows;
  }
  return rows.toSorted((a, b) => {
    for (const { field, order } of orderBy) {
      const ascending = compareFieldAscending(a, b, field);
      if (ascending !== 0) {
        return order === Order.Asc ? ascending : -ascending;
      }
    }
    return 0;
  });
};

/** Convert DataTableState to Frappe API params */
const stateToFrappeParams = (
  state: Pick<DataTableState, 'pagination' | 'sorting' | 'filters' | 'columnFilters' | 'globalFilter'>,
) => {
  const { pagination, sorting, filters, columnFilters, globalFilter } = state;
  const limitStart = pagination.pageIndex * pagination.pageSize;
  const limit = pagination.pageSize;

  const frappeFilters: [string, string, unknown][] = [];
  // Advanced (toolbar / hidden-field) filters — operator-aware.
  for (const f of filters ?? []) {
    if (!f.value?.operator) {
      continue;
    }
    const tuple = filterValueToFrappeTuple(f.columnId, f.value);
    if (tuple) {
      frappeFilters.push(tuple);
    }
  }
  // Column-funnel filters — FilterValue-shaped values map through the same
  // operator table; plain values keep the legacy equality behavior.
  for (const cf of columnFilters ?? []) {
    if (isOperatorFilterValue(cf.value)) {
      const tuple = filterValueToFrappeTuple(cf.id, cf.value);
      if (tuple) {
        frappeFilters.push(tuple);
      }
    } else if (cf.value != null && cf.value !== '') {
      frappeFilters.push([cf.id, '=', cf.value]);
    }
  }
  if (globalFilter !== undefined && globalFilter.trim() !== '') {
    frappeFilters.push(['name', 'like', `%${globalFilter}%`]);
  }

  const orderBy =
    sorting.length > 0 ? sorting.map((s) => ({ field: s.id, order: s.desc ? Order.Desc : Order.Asc })) : undefined;

  return { limitStart, limit, filters: frappeFilters, orderBy };
};

/** Saved-filter and FilterManager surfaces speak `[field, operator, value]` tuples. */
const toFilterTuples = <TDoc,>(
  filters: Partial<TDoc> | [keyof TDoc & string, string, unknown][] | undefined,
): FrappeFilterTuple[] => {
  if (filters === undefined) {
    return [];
  }
  if (Array.isArray(filters)) {
    return filters;
  }
  return Object.entries(filters).map(([key, value]): FrappeFilterTuple => [key, '=', value]);
};

const asFilterableDoc = (row: { name: string; doctype: string }) =>
  // SAFETY: matchesFilters only reads document fields by name, which every TDoc row (a Frappe document) carries
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions, typescript/no-unsafe-type-assertion -- see SAFETY above
  row as unknown as Parameters<typeof matchesFilters>[0];

/**
 * A data table component connected to Frappe Live data.
 *
 * Displays documents from a Frappe DocType in a sortable, filterable table
 * with real-time updates via WebSocket. Integrates with the FrappeProvider
 * for configuration.
 *
 * Two props read as optional and carry defaults that matter (MPO-230).
 * Without `fields`, a read from the bench (`serverSide`, or client mode with
 * no `fixtures`) requests `name` plus every column's `accessorKey`, and
 * client mode under a fixture corpus reads whole documents. Without
 * `filterableFields`, the filter menu comes from the doctype's meta: the
 * corpus's "DocType" entry under a provider carrying `fixtures`, never the
 * network whatever `baseURL` the host also carries, and a `getdoctype` call
 * otherwise. Each prop's own entry has the detail.
 *
 * @template TDoc - The document type with at least name and doctype fields
 *
 * @example
 * ```tsx
 * interface Task {
 *   name: string;
 *   doctype: string;
 *   subject: string;
 *   status: 'Open' | 'Completed';
 * }
 *
 * function TaskTable() {
 *   return (
 *     <FrappeProvider baseURL="https://mysite.frappe.cloud">
 *       <FrappeTable<Task>
 *         doctype="Task"
 *         columns={[
 *           { accessorKey: 'subject', header: 'Subject' },
 *           { accessorKey: 'status', header: 'Status' }
 *         ]}
 *         fields={['name', 'subject', 'status']}
 *         onRowClick={(row) => console.log('Clicked:', row)}
 *       />
 *     </FrappeProvider>
 *   );
 * }
 * ```
 */
// oxlint-disable-next-line eslint/complexity, react-doctor/no-giant-component -- one component wires three data paths (client live rows, paged and infinite serverSide) that share state; splitting it is a refactor beyond lint cleanup
export const FrappeTable = <TDoc extends { name: string; doctype: string }>({
  baseURL,
  auth,
  syncOptions,
  doctype,
  columns: columnsProp,
  fields,
  filters: initialFilters,
  onRowClick,
  loading,
  error,
  savedFilters = false,
  canCreateGlobalFilters = false,
  userId,
  serverSide = false,
  onStateChange: onStateChangeProp,
  refreshToken,
  paginationMode = 'pages',
  loadPage: loadPageProp,
  filterableFields: filterableFieldsProp,
  rights: rightsProp,
  layout,
  initialState,
  ...dataTableProps
  // oxlint-disable-next-line sonarjs/cognitive-complexity -- see the complexity note on FrappeTable above
}: FrappeTableProps<TDoc>) => {
  // Infinite + serverSide: DataTable's page cache drives fetching through a
  // Frappe-backed page loader (prefetch-ahead), replacing the legacy
  // fetch-on-state-change path below.
  const infiniteServerMode = serverSide && paginationMode === 'infinite';
  const { knobProps } = useResolvedKnobs();
  const { t } = useTranslation();
  const [errorState, setErrorState] = React.useState<Error | null>(null);
  const [activeFilters, setActiveFilters] = React.useState<
    Partial<TDoc> | [keyof TDoc & string, string, unknown][] | undefined
  >(initialFilters);
  const config = useFrappeConfig();

  // Adopt `filters` prop CONTENT changes in place (client/live-collection
  // mode) — the keep-rows counterpart of DataTable's controlledState: outer
  // filter surfaces update the query without remounting the table. Content-
  // keyed so unstable array identities from hosts are safe; saved-filter
  // selections (setActiveFilters below) are not overridden by echoes.
  const filtersPropKey = initialFilters === undefined ? undefined : JSON.stringify(initialFilters);
  const adoptedFiltersPropRef = useRef(filtersPropKey);
  useEffect(() => {
    if (filtersPropKey === undefined) {
      return;
    }
    if (adoptedFiltersPropRef.current === filtersPropKey) {
      return;
    }
    adoptedFiltersPropRef.current = filtersPropKey;
    // SAFETY: filtersPropKey is JSON.stringify(initialFilters), so it parses back to the filters prop's shape
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
    setActiveFilters(JSON.parse(filtersPropKey) as FrappeTableProps<TDoc>['filters']);
  }, [filtersPropKey]);

  const finalBaseURL = baseURL ?? config?.baseURL;
  const finalAuth = auth ?? config?.auth;
  const finalSyncOptions = syncOptions ?? config?.syncOptions;

  // A fixture corpus is a complete data source, so it satisfies the same
  // requirement a baseURL does: fixture mode never dials a server.
  if ((finalBaseURL === undefined || finalBaseURL === '') && !config?.fixtures) {
    throw new Error('FrappeTable requires baseURL prop or FrappeProvider with baseURL or fixtures');
  }

  // One connection config for the live subscription (client mode), the
  // realtime invalidation watch (serverSide mode), and the reconnect pill.
  const connectionConfig = useMemo(
    () => ({
      baseURL: finalBaseURL,
      socketPort: config?.socketPort,
      siteName: config?.siteName,
      socketBaseURL: config?.socketBaseURL,
      auth: finalAuth,
      syncOptions: finalSyncOptions,
      realtime: config?.realtime,
      fixtures: config?.fixtures,
    }),
    [
      finalBaseURL,
      config?.socketPort,
      config?.siteName,
      config?.socketBaseURL,
      config?.realtime,
      finalAuth,
      finalSyncOptions,
      config?.fixtures,
    ],
  );

  const frappeApp = useMemo(() => {
    if (!serverSide || finalBaseURL === undefined || finalBaseURL === '') {
      return null;
    }
    // SAFETY: the auth prop/config is FrappeApp's AuthConfig shape; only the token getter's declared return differs
    // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- see SAFETY above
    return new FrappeApp(finalBaseURL, (finalAuth ?? {}) as Record<string, unknown>);
  }, [serverSide, finalBaseURL, finalAuth]);

  // Full doctype field list → table filterableFields: hidden / non-column
  // fields become filterable through the toolbar Filter surface. An explicit
  // filterableFields prop overrides the metadata-derived list (fixtures,
  // stories, custom subsets). A fixture corpus is the whole world for meta
  // too: the read goes to its "DocType" collection with the baseURL a
  // fixture host may still carry withheld, so a corpus without the entry
  // yields no menu instead of dialling getdoctype (MPO-230). Columns left to
  // meta need it whatever else is given.
  const deriveColumns = !columnsProp;
  const skipMeta = !deriveColumns && !!filterableFieldsProp && (!!rightsProp || !!connectionConfig.fixtures);
  const metaConnection = useMemo(() => {
    if (skipMeta) {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- consistent-return needs a value beside the connection returns
      return undefined;
    }
    if (!connectionConfig.fixtures) {
      return connectionConfig;
    }
    // oxlint-disable-next-line sonarjs/no-undefined-assignment -- the fixture host's baseURL is withheld so meta never dials getdoctype
    return { ...connectionConfig, baseURL: undefined };
  }, [skipMeta, connectionConfig]);
  const { meta, isLoading: isMetaLoading } = useDocTypeMeta(metaConnection, doctype);
  const readSession = !rightsProp || deriveColumns;
  const {
    rights: resolvedRights,
    pending: rolesPending,
    user: sessionUser,
    roles: sessionRoles,
  } = useDocRights(readSession ? connectionConfig : undefined, readSession ? meta : undefined);
  const rights = rightsProp ?? resolvedRights;

  const permMatrix = useMemo(
    () => (deriveColumns ? buildPermLevelMatrix(meta?.permissions, sessionRoles) : undefined),
    [deriveColumns, meta?.permissions, sessionRoles],
  );
  const derivedColumns = useMemo(() => {
    if (!deriveColumns) {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- consistent-return needs a value beside the columns return
      return undefined;
    }
    const built = buildListColumns({
      meta,
      t: (_key, fallback) => t(fallback),
      sessionUser,
      permMatrix,
    });
    // SAFETY: buildListColumns builds columns over this doctype's own fields, which TDoc describes
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
    return built as DataTableColumn<Partial<TDoc>>[];
  }, [deriveColumns, meta, t, sessionUser, permMatrix]);
  const columns = columnsProp ?? derivedColumns ?? [];
  // Derived columns settle once meta and the roles that prune them land;
  // reading before that would fetch one field list and then another.
  const columnsPending = deriveColumns && (isMetaLoading || rolesPending);
  const resolvedInitialState = deriveColumns
    ? {
        ...initialState,
        columnVisibility: { modified: false, ...initialState?.columnVisibility },
      }
    : initialState;

  // Keyed on content, not on the columns array, so an inline `columns`
  // literal cannot re-key the fetch every render and refetch in a loop.
  const columnAccessorKeys = deriveColumns
    ? listFieldsToFetch(meta, permMatrix)
    : columns.map((column) => column.accessorKey).filter((key): key is keyof TDoc & string => typeof key === 'string');
  const columnFieldsKey = fields ? undefined : JSON.stringify(columnAccessorKeys);
  const serverFields = useMemo<string[]>(() => {
    if (fields) {
      return [...fields];
    }
    // SAFETY: columnFieldsKey is JSON.stringify of a string[] (columnAccessorKeys)
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
    const columnKeys = JSON.parse(columnFieldsKey ?? '[]') as string[];
    return [...new Set<string>(['name', ...columnKeys])];
  }, [fields, columnFieldsKey]);
  // Client mode over a fixture corpus keeps whole documents: narrowing it
  // would drop the non-column fields (a title field, a filter-only field)
  // fixture hosts read today.
  // SAFETY: serverFields is `name` plus the columns' accessor keys, all TDoc field names
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
  const clientFields = (fields ?? (connectionConfig.fixtures ? undefined : serverFields)) as typeof fields;

  const metaFilterFields = useMemo(() => (meta?.fields ? docFieldsToFilterFields(meta.fields) : undefined), [meta]);
  const filterableFields = filterableFieldsProp ?? metaFilterFields;

  // Accessible row identity (DG-A11Y-06) for DataTable's row-press label
  // and selection-checkbox names: the doctype's title-field value when
  // meta is loaded, else the document name. An empty result defers to
  // DataTable's own fallbacks (first visible cell → positional "Row N").
  const titleField = meta?.title_field;
  const rowLabel = useCallback(
    (row: Partial<TDoc>): string => {
      if (titleField !== undefined && titleField !== '') {
        // SAFETY: a Frappe document is a plain JSON object, so any field name reads as an unknown value
        // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- see SAFETY above
        const fromTitle = (row as Record<string, unknown>)[titleField];
        // oxlint-disable-next-line anti-slop/no-runtime-typeof -- the title field holds whatever the doctype stores; only text labels a row
        if (typeof fromTitle === 'string' && fromTitle !== '') {
          return fromTitle;
        }
        // oxlint-disable-next-line anti-slop/no-runtime-typeof -- numeric title fields (an autoname series) still label a row
        if (typeof fromTitle === 'number') {
          return String(fromTitle);
        }
      }
      return row.name ?? '';
    },
    [titleField],
  );

  const [serverData, setServerData] = useState<TDoc[]>([]);
  const [serverRowCount, setServerRowCount] = useState(0);
  const [serverLoading, setServerLoading] = useState(serverSide);
  // First fetch completed (success or failure) — later live refetches must
  // swap rows in place without flashing the skeleton over the table.
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const hasLoadedOnceRef = useRef(false);
  const lastFetchKey = useRef<string>('');
  const fetchSeq = useRef(0);
  /** In-flight serverSide request — superseding fetches and unmount abort it. */
  const fetchAbortRef = useRef<AbortController | null>(null);
  /** Last table state fetched — realtime refetches re-run the same query. */
  const lastStateRef = useRef<DataTableState | null>(null);

  /** Filters / sort of the last issued query — detects changes for the
   * optimistic local apply below. */
  const lastFiltersKey = useRef<string>('');
  const lastSortKey = useRef<string>('');
  /** Last successful rows — held as placeholderData while a refetch is in
   * flight so a local apply that would empty the current page cannot blank
   * the body. */
  const lastGoodServerRows = useRef<TDoc[]>([]);

  const fetchServerData = useCallback(
    async (state: DataTableState) => {
      if (!frappeApp || !serverSide) {
        return;
      }
      lastStateRef.current = state;
      const params = stateToFrappeParams(state);
      const key = JSON.stringify(params);
      if (key === lastFetchKey.current) {
        return;
      }
      lastFetchKey.current = key;
      // Optimistic local apply (keep-rows-and-reconcile / keepPreviousData):
      // filter narrows the CURRENT page when it leaves rows; sort reorders
      // what is on screen; pagination keeps the current page as placeholder
      // until the new page arrives. A local pass that would empty the body
      // is skipped — previous rows stay mounted until reconcile.
      const filtersKey = JSON.stringify(params.filters);
      const sortKey = JSON.stringify(params.orderBy ?? []);
      const alreadyLoaded = lastFiltersKey.current !== '' || lastGoodServerRows.current.length > 0;
      if (alreadyLoaded) {
        const filtersChanged = filtersKey !== lastFiltersKey.current;
        const sortChanged = sortKey !== lastSortKey.current;
        if (filtersChanged || sortChanged) {
          setServerData((previous) => {
            let next = previous;
            if (filtersChanged && params.filters.length > 0) {
              const narrowed = previous.filter((row) => matchesFilters(asFilterableDoc(row), params.filters));
              if (narrowed.length > 0) {
                next = narrowed;
              }
            }
            if (sortChanged && params.orderBy !== undefined) {
              // SAFETY: TDoc rows are plain JSON documents keyed by field name; sorting only reorders them
              // oxlint-disable-next-line anti-slop/no-chained-type-assertions, typescript/no-unsafe-type-assertion, anti-slop/no-unsafe-dictionary-type -- see SAFETY above
              next = sortRowsLocally(next as unknown as Record<string, unknown>[], params.orderBy) as TDoc[];
            }
            return next;
          });
        }
      }
      lastFiltersKey.current = filtersKey;
      lastSortKey.current = sortKey;
      // Abort the superseded request (SB-M-011): the sequence guard below
      // already drops its response, aborting stops the wasted transfer too.
      fetchAbortRef.current?.abort();
      const controller = new AbortController();
      fetchAbortRef.current = controller;
      fetchSeq.current += 1;
      const seq = fetchSeq.current;
      setServerLoading(true);
      try {
        const [data, count] = await Promise.all([
          frappeApp.db().getDocList<TDoc>(doctype, {
            fields: serverFields,
            filters: params.filters.length ? params.filters : undefined,
            limitStart: params.limitStart,
            limit: params.limit,
            orderBy: params.orderBy,
            signal: controller.signal,
          }),
          frappeApp
            .db()
            .getCount(
              doctype,
              params.filters.length ? params.filters : undefined,
              undefined,
              undefined,
              controller.signal,
            ),
        ]);
        // Drop stale responses so a slower earlier request cannot overwrite newer state.
        if (seq !== fetchSeq.current) {
          return;
        }
        setServerData(data);
        setServerRowCount(count);
        lastGoodServerRows.current = data;
        setErrorState(null);
      } catch (fetchError) {
        if (seq !== fetchSeq.current) {
          return;
        }
        // Abort is a cancellation (unmount), not a failure to surface.
        if (controller.signal.aborted) {
          return;
        }
        setErrorState(fetchError instanceof Error ? fetchError : new Error(String(fetchError)));
        // Keep last-good rows on a refetch failure — only the first load
        // may settle as empty.
        if (!hasLoadedOnceRef.current) {
          setServerData([]);
          setServerRowCount(0);
        }
      } finally {
        if (seq === fetchSeq.current && !controller.signal.aborted) {
          setServerLoading(false);
          hasLoadedOnceRef.current = true;
          setHasLoadedOnce(true);
        }
      }
    },
    [frappeApp, serverSide, doctype, serverFields],
  );

  // Live invalidation for serverSide mode: any realtime event for this
  // doctype (doc_update / list_update / doc_deleted — and reconnects, which
  // may have missed events) re-runs the current page query. Debounced so a
  // save's doc_update+list_update pair costs one fetch; rows swap in place
  // (no skeleton after first load), and the user's page/sort/filter state
  // is untouched because the refetch replays lastStateRef.
  const liveRefetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useFrappeDoctypeEvents(
    connectionConfig,
    doctype,
    () => {
      if (liveRefetchTimer.current) {
        clearTimeout(liveRefetchTimer.current);
      }
      liveRefetchTimer.current = setTimeout(() => {
        lastFetchKey.current = '';
        if (lastStateRef.current) {
          void fetchServerData(lastStateRef.current);
        }
      }, 250);
    },
    serverSide && !infiniteServerMode,
  );
  useEffect(
    () => () => {
      if (liveRefetchTimer.current) {
        clearTimeout(liveRefetchTimer.current);
      }
      fetchAbortRef.current?.abort();
    },
    [],
  );

  // In-place refresh: re-run the current query when the host bumps
  // refreshToken. Rows stay rendered (hasLoadedOnce is untouched) and swap
  // when the response lands — the no-remount replacement for keying the
  // table on a refresh generation.
  const refreshTokenSeen = useRef(refreshToken);
  useEffect(() => {
    if (refreshTokenSeen.current === refreshToken) {
      return;
    }
    refreshTokenSeen.current = refreshToken;
    if (!serverSide || infiniteServerMode) {
      return;
    }
    lastFetchKey.current = '';
    if (lastStateRef.current) {
      void fetchServerData(lastStateRef.current);
    }
  }, [refreshToken, serverSide, infiniteServerMode, fetchServerData]);

  // Page loader for infinite mode: same param mapping as fetchServerData but
  // per-page and cacheable — DataTable pre-loads page N+1 while N is on
  // screen. totalCount rides page 0 only (one count query per query state).
  const frappeLoadPage = useCallback<DataTablePageLoader<Partial<TDoc>>>(
    async (query: PageLoadQuery) => {
      if (!frappeApp) {
        return { rows: [] };
      }
      const params = stateToFrappeParams({
        pagination: { pageIndex: query.pageIndex, pageSize: query.pageSize },
        sorting: query.sorting,
        filters: query.filters,
        columnFilters: query.columnFilters,
        globalFilter: query.globalFilter,
      });
      // Frappe refuses get_count to Guest while /api/resource still lists the
      // rows (LC-96): the page loads without a total.
      const loadTotalCount = async (): Promise<number | null> => {
        try {
          return await frappeApp.db().getCount(doctype, params.filters.length > 0 ? params.filters : undefined);
        } catch (countError) {
          if (isPermissionError(countError)) {
            return null;
          }
          throw countError;
        }
      };
      const [rows, count] = await Promise.all([
        frappeApp.db().getDocList<TDoc>(doctype, {
          fields: serverFields,
          filters: params.filters.length ? params.filters : undefined,
          limitStart: params.limitStart,
          limit: params.limit,
          orderBy: params.orderBy,
        }),
        query.pageIndex === 0 ? loadTotalCount() : null,
      ]);
      return { rows, totalCount: count ?? undefined };
    },
    [frappeApp, doctype, serverFields],
  );

  const resolvedLoadPage = loadPageProp ?? (infiniteServerMode ? frappeLoadPage : undefined);

  const handleStateChange = useCallback(
    (state: DataTableState) => {
      onStateChangeProp?.(state);
      if (serverSide && !infiniteServerMode) {
        void fetchServerData(state);
      }
    },
    [onStateChangeProp, serverSide, infiniteServerMode, fetchServerData],
  );

  const hasFrappeApp = frappeApp !== null;
  useEffect(() => {
    if (serverSide && !infiniteServerMode && hasFrappeApp && !columnsPending) {
      lastFetchKey.current = '';
      // oxlint-disable-next-line react-doctor/no-pass-live-state-to-parent -- fetchServerData issues the first server query; it pushes nothing to a parent
      void fetchServerData(
        lastStateRef.current ?? {
          data: [],
          // SAFETY: fetchServerData only reads the query fields of this state; columns ride along for shape only
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
          columns: columns as DataTableColumn[],
          pagination: { pageIndex: 0, pageSize: 10 },
          sorting: [],
          filters: [],
          columnFilters: [],
          columnVisibility: {},
          columnOrder: columns.map((c) => c.id ?? ''),
          columnSizing: {},
        },
      );
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- columns is left out on purpose: an inline columns literal would refetch every render
  }, [serverSide, infiniteServerMode, hasFrappeApp, columnsPending, fetchServerData]);

  // Always call the hook — toggling `savedFilters` must not change hook order (SB-M-012).
  const savedFiltersHook = useSavedFilters({ userId });

  // The client/live-collection read is the SHARED one (MPO-251): collection
  // + live query + the honest error surface a bare collection swallows
  // (without onSyncError a 403 or a dead server renders as an empty table).
  // `limit: null` keeps the bench's own page length rather than the hook's
  // default — FrappeTable paginates on the rows it is handed, and moving its
  // row ceiling here would move it for every existing consumer.
  const rowsMessages = useMemo(
    () => ({
      permission: t('You do not have permission to view {{doctype}}', { doctype }),
      generic: t('Error loading {{doctype}}', { doctype }),
      queryFailed: t('Failed to load {{doctype}}', { doctype }),
    }),
    [doctype, t],
  );
  const {
    rows: clientRows,
    isQueryLoading: isRowsLoading,
    error: liveError,
  } = useFrappeRows<TDoc>(serverSide ? undefined : connectionConfig, doctype, {
    fields: clientFields,
    filters: activeFilters,
    limit: null,
    enabled: !serverSide && !columnsPending,
    messages: rowsMessages,
  });

  // Keep-rows-and-reconcile for client/live-collection mode: a filter change
  // swaps the collection (new subscription), which reports loading from
  // empty — render the LAST GOOD rows, locally narrowed by the new filters
  // (optimistic local apply), until the new collection is ready. Only the
  // very first load may show the skeleton.
  const lastGoodClientRows = useRef<TDoc[] | null>(null);
  if (!serverSide && !isRowsLoading && !columnsPending) {
    lastGoodClientRows.current = clientRows;
  }
  const clientRowsResolved = useMemo(() => {
    if (serverSide) {
      return clientRows;
    }
    if (!isRowsLoading || !lastGoodClientRows.current) {
      return clientRows;
    }
    const held = lastGoodClientRows.current;
    if (!activeFilters) {
      return held;
    }
    const narrowed = held.filter((row) => matchesFilters(asFilterableDoc(row), activeFilters));
    // A local pass that would empty the body is skipped — held rows stay
    // as placeholderData until the new collection reconciles.
    return narrowed.length > 0 ? narrowed : held;
  }, [serverSide, clientRows, isRowsLoading, activeFilters]);

  const serverPageEmptyWhileLoading = serverSide && serverLoading && serverData.length === 0;
  const serverRowsResolved =
    serverPageEmptyWhileLoading && lastGoodServerRows.current.length > 0 ? lastGoodServerRows.current : serverData;
  const rows = serverSide ? serverRowsResolved : clientRowsResolved;
  // Infinite serverSide: DataTable owns loading/empty chrome (skeleton +
  // honest end state) — FrappeTable must not early-return on its own.
  // Paged serverSide: only the FIRST load shows the skeleton; live
  // refetches swap rows in place without flashing (LC-06-adjacent).
  // Client mode: the skeleton shows only before the FIRST ready pass —
  // collection swaps keep the last-good rows rendered.
  const hasHeldClientRows = lastGoodClientRows.current !== null;
  const serverFirstLoad = !infiniteServerMode && serverLoading && !hasLoadedOnce;
  const isRowsLoadingResolved = serverSide ? serverFirstLoad : isRowsLoading && !hasHeldClientRows;
  const serverRefetching = !infiniteServerMode && serverLoading && hasLoadedOnce;
  const isFetching = serverSide ? serverRefetching : isRowsLoading && hasHeldClientRows;

  const handleSelectFilter = (filter: ParsedFilter | null) => {
    if (filter === null) {
      setActiveFilters(initialFilters);
      return;
    }
    // SAFETY: saved filters are saved from this table's own activeFilters, so their fields are TDoc keys
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
    setActiveFilters(filter.filters as [keyof TDoc & string, string, unknown][]);
  };

  const handleSaveFilter = async (filterName: string, isGlobal: boolean) => {
    if (activeFilters === undefined) {
      return;
    }
    await savedFiltersHook.saveFilter(filterName, toFilterTuples(activeFilters), isGlobal);
  };

  const handleDeleteFilter = (name: string) => {
    void savedFiltersHook.deleteFilter(name);
  };

  // serverSide failures come from the fetch above; client/live failures come
  // from useFrappeRows. Only one path is ever live at a time.
  const resolvedError = serverSide ? errorState : liveError;

  if (resolvedError && error) {
    return <>{error(resolvedError)}</>;
  }

  const rowData = rows ?? [];
  // Honest states via AsyncBoundary (DG-ST-01: error > loading > empty).
  // Infinite serverSide delegates loading/empty chrome to DataTable.
  // After the first load, NEVER replace DataTable with empty/loading chrome
  // while a refetch is in flight — that was the named blank-the-list defect.
  let boundaryState: Pick<AsyncBoundaryProps, 'error' | 'loading' | 'empty'> | null = null;
  if (resolvedError) {
    boundaryState = { error: resolvedError };
  } else if (isRowsLoadingResolved || columnsPending) {
    boundaryState = { loading: loading ?? true };
  } else if (rowData.length === 0 && !infiniteServerMode && !isFetching) {
    boundaryState = { empty: true };
  }
  if (boundaryState) {
    return (
      <YStack
        {...knobProps.gap}
        // flexBasis auto, not flex={1}: a basis-0 chain resolves to 0 in an
        // auto-height parent and collapses the table to a sliver. Same
        // geometry as DataTableRoot's own root.
        flexGrow={1}
        flexShrink={1}
        flexBasis="auto"
        minHeight={0}>
        <FrappeReconnectIndicator config={connectionConfig} />
        <AsyncBoundary
          layout={layout === 'list' || layout === 'cards' ? 'list' : 'table'}
          errorTitle={t('Error loading {{doctype}}', { doctype })}
          emptyTitle={t('No {{doctype}} records found', { doctype })}
          {...boundaryState}
        />
      </YStack>
    );
  }

  return (
    <YStack
      {...knobProps.gap}
      // flexBasis auto, not flex={1}: a basis-0 chain resolves to 0 in an
      // auto-height parent and collapses the table to a sliver. Same
      // geometry as DataTableRoot's own root.
      flexGrow={1}
      flexShrink={1}
      flexBasis="auto"
      minHeight={0}>
      <FrappeReconnectIndicator config={connectionConfig} />
      {savedFilters && (
        <XStack
          {...knobProps.gap}
          padding="$2">
          <SavedFilterDropdown
            filters={savedFiltersHook.filters}
            selectedFilter={null}
            onSelectFilter={handleSelectFilter}
            onDeleteFilter={handleDeleteFilter}
          />
          <FilterManager
            currentFilters={toFilterTuples(activeFilters)}
            onSaveFilter={handleSaveFilter}
            canCreateGlobal={canCreateGlobalFilters}
          />
        </XStack>
      )}
      <DataTable
        data={rowData}
        columns={columns}
        // onRowClick (the stable FrappeTable prop name) rides DataTable's
        // first-class row activation: whole-row press target, roving tab
        // stop (LC-49), Enter/Space activation (LC-50), inner interactive
        // controls win. rowLabel names each pressable row and its
        // selection checkbox by document identity. Both spread BEFORE
        // {...dataTableProps} so an explicit consumer onRowPress/rowLabel
        // still ejects (consumer-last house rule).
        {...(onRowClick
          ? {
              onRowPress: (row: Partial<TDoc>) => {
                onRowClick(row);
              },
            }
          : {})}
        rowLabel={rowLabel}
        {...(serverSide && {
          manualFiltering: true,
          manualPagination: true,
          manualSorting: true,
          onStateChange: handleStateChange,
          rowCount: infiniteServerMode ? undefined : serverRowCount,
        })}
        paginationMode={paginationMode}
        {...(resolvedLoadPage ? { loadPage: resolvedLoadPage } : {})}
        {...(filterableFields ? { filterableFields } : {})}
        {...(resolvedInitialState ? { initialState: resolvedInitialState } : {})}
        isFetching={isFetching}
        {...dataTableProps}
        readOnly={dataTableProps.readOnly ?? !rights.write}
        showAddRow={dataTableProps.showAddRow && rights.create}
        showDeleteRow={dataTableProps.showDeleteRow && rights.delete}
        {...(layout ? { layout } : {})}
      />
    </YStack>
  );
};
