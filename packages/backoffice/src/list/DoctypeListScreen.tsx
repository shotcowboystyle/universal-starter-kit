import { ArrowSquareOutIcon, ArrowsClockwiseIcon, PlusIcon, SidebarSimpleIcon } from '@phosphor-icons/react';
// Catalog action Button — `accent` renders the active accent intent, the
// house expression of the one page primary (LC-05 ONE-EMPHASIS; quick entry
// "Create" precedent). The components Button above stays for neutral chrome.
import { Button as ActionButton } from '@repo/forms';
import {
  FrappeTable,
  buildListColumns,
  docFieldsToFilterFields,
  isPermissionError,
  listFieldsToFetch,
  refusalReason,
  sessionDocRights,
  useFrappeAggregate,
  useFrappeConfig,
  // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- frappe-ui's exported hook name
  useRecordShape,
} from '@repo/frappe-ui';
import type { ListDoc, ListRow } from '@repo/frappe-ui';
import type { BulkAction, DataTableColumn, DataTableState, FilterableField, TableFilter } from '@repo/table';
import { useLayoutSizeClass, useResolvedKnobs } from '@repo/theme';
import {
  AsyncBoundary,
  EmptyState,
  H1,
  PageHeader,
  Paragraph,
  ScrollView,
  Spinner,
  XStack,
  YStack,
  isWeb,
  notify,
} from '@repo/ui';
// Contract: the primary list view for a doctype (desk list parity —
// filters, sort, pagination, bulk actions, tags, view switcher, New).
//
// Composition: FrappeTable (serverSide — Frappe REST pagination/sort/filter
// with realtime invalidation) fed by meta-derived columns, wrapped in desk
// chrome (header + live count, refresh, view switcher, New → QuickEntry,
// facet sidebar, sort selector). Fixture mode (Storybook / tests) degrades
// to the client-mode live collection and hides bench-only surfaces.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  actionsForDoctype,
  useBackofficeCapabilities,
  useBackofficeConfig,
  useBackofficeNavigator,
  useBackofficePaths,
  useBackofficeSlots,
} from '../config/BackofficeProvider';
import type { BackofficeAction } from '../config/BackofficeProvider';
import { useDeskScope } from '../desk/scope';
// Permlevel role matrix (desk perm.js parity) — shared with the form surface
// via the UI-free fieldPermissions module; drives list column pruning.
import { buildPermLevelMatrix } from '../form/fieldPermissions';
import { openInNewTab } from '../form/platform-hooks';
import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';
import type { BackofficeView } from '../navigation/paths';
import { QuickEntryDialog } from '../quickEntry/QuickEntryDialog';
import { deskViewUrl } from '../shared/desk-links';
import { setListNavContext } from '../shared/list-nav-context';
import type { FrappeFilters } from '../shared/types';
import { useDoctypeMeta } from '../shared/use-doctype-meta';
import type { DoctypeMeta } from '../shared/use-doctype-meta';
import { useFrappeApp } from '../shared/use-frappe-app';
import { useRecentVisit } from '../shared/use-recent-visit';
import { useSessionUserId as useSessionUser } from '../shared/use-session-user-id';
import { useUserRoles } from '../shared/use-user-roles';
import { deriveAvailableViews } from '../views/view-availability';
import { ViewSwitcherMenu } from '../views/ViewSwitcherMenu';

import { AddTagsDialog } from './AddTagsDialog';
import { AssignToDialog } from './AssignToDialog';
import { bulkDelete, toggleLike } from './bulk-actions';
import { BulkEditDialog } from './bulk-edit-dialog';
import { bulkExportCsv } from './bulk-export';
import { bulkSubmitCancel } from './bulk-submit-cancel';
import type { BulkDocstatusAction } from './bulk-submit-cancel';
import { FilterChips } from './filter-chips';
import { frappeFiltersToTableFilters, sameFilterTuple, tableStateToFrappeFilters } from './filter-conversion';
import { parseFiltersParam, parseSortParam, serializeFiltersParam, serializeSortParam } from './list-url-state';
import type { ListSortState } from './list-url-state';
import { ListFilterBar } from './ListFilterBar';
import { ListSidebar } from './ListSidebar';
import { toggleFacetFilter } from './sidebar-stats';

export interface DoctypeListScreenProps {
  /** Proper-cased doctype name (e.g. "Note", "Sales Order") */
  doctype: string;
  /**
   * Raw `?f=` deep-link query value (urlencoded JSON FrappeFilters) —
   * connections panels / dashboards link into filtered lists with it. Read
   * by the route wrapper (SlugScreen); the screen itself stays search-param
   * free so it mounts outside a One navigation container (stories/tests).
   * Bidirectional: the screen writes filter changes back through
   * `navigator.setParams` (list-url-state.ts documents the schema).
   */
  filtersParam?: string;
  /**
   * Raw `?sort=` query value (`<fieldname>.<asc|desc>`, see list-url-state.ts)
   * — same route-wrapper contract and write-back channel as `filtersParam`.
   */
  sortParam?: string;
  /**
   * Meta override for fixture-backed stories/tests (fixtures expose no
   * `getdoctype` RPC). Live surfaces leave this unset.
   */
  metaOverride?: DoctypeMeta;
  /**
   * View-switcher allowlist — intersected with the provider's
   * `capabilities.views.allow`. Unset offers every capability-allowed view.
   */
  views?: readonly BackofficeView[];
  /**
   * Filters seeded into the user-editable filter channel on mount (chips /
   * editor can change or remove them). `filtersParam` wins when both are set.
   */
  initialFilters?: FrappeFilters;
  /**
   * Filters ALWAYS ANDed into the query, invisible to the filter chrome and
   * not removable by the user — scope a list to a subset (e.g. one owner).
   */
  fixedFilters?: FrappeFilters;
  /** Transform the meta-derived columns before render (reorder/hide/extend). */
  columnOverrides?: (columns: DataTableColumn<ListRow>[]) => DataTableColumn<ListRow>[];
  /** Initial page size (user page-size picks still win afterwards). */
  pageSize?: number;
  /**
   * Row-open override. Default: navigate to the document form and emit a
   * `doc-opened` event on the provider bus.
   */
  onRowOpen?: (doctype: string, name: string) => void;
  /**
   * Hide the "New" affordances (header button + create-first empty state).
   * The `newDoc` capability gates them too.
   */
  hideNewButton?: boolean;
  /** Extra toolbar actions on selection (merged with provider `actions.list`). */
  toolbarActions?: readonly BackofficeAction[];
}

type PendingDialog = {
  type: 'assign' | 'tag' | 'edit';
  names: string[];
  clear: () => void;
} | null;

const PAGE_SIZES = [20, 100, 500];

// Generic JSX (`<FrappeTable<ListDoc> …/>`) breaks one-dev's source
// annotation transform; instantiate the type argument outside JSX instead.
const ListTable = FrappeTable<ListDoc>;

const sameFilters = (a: FrappeFilters, b: FrappeFilters): boolean =>
  a.length === b.length && a.every((tuple, index) => sameFilterTuple(tuple, b[index]));

const sameSort = (a: ListSortState | null, b: ListSortState | null): boolean => {
  if (a === null || b === null) {
    return a === b;
  }
  return a.field === b.field && a.order === b.order;
};

/** Names of the selected rows (rows without a name are skipped). */
const selectedNames = (items: ListRow[]): string[] => {
  const names: string[] = [];
  for (const item of items) {
    if (item.name !== undefined && item.name !== '') {
      names.push(item.name);
    }
  }
  return names;
};

const isNamedRow = (row: unknown): row is { name: string } => {
  if (typeof row !== 'object' || row === null || !('name' in row)) {
    return false;
  }
  return typeof row.name === 'string' && row.name.length > 0;
};

/** Display-order names of the table's resolved rows. */
const rowNames = (rows: readonly unknown[]): string[] => {
  const names: string[] = [];
  for (const row of rows) {
    if (isNamedRow(row)) {
      names.push(row.name);
    }
  }
  return names;
};

const NEW_DOC_DEFAULT = 'New {{doctype}}';

// oxlint-disable-next-line react-doctor/no-giant-component, eslint/complexity -- the list page composes many desk surfaces; splitting it is a separate refactor
export const DoctypeListScreen = ({
  doctype,
  filtersParam,
  sortParam,
  metaOverride,
  views: viewsAllowlist,
  initialFilters,
  fixedFilters,
  columnOverrides,
  pageSize,
  onRowOpen,
  hideNewButton,
  toolbarActions,
  // oxlint-disable-next-line sonarjs/cognitive-complexity -- see the no-giant-component note above
}: DoctypeListScreenProps) => {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const { knobProps } = useResolvedKnobs();
  const navigator = useBackofficeNavigator();
  const paths = useBackofficePaths();
  const capabilities = useBackofficeCapabilities();
  const { actions, emitEvent } = useBackofficeConfig();
  const slots = useBackofficeSlots();
  const config = useFrappeConfig();
  const app = useFrappeApp();
  const fixtureMode = Boolean(config?.fixtures);
  // Desk counterpart of this list — every backoffice surface links back to
  // its native desk twin (fixture mode has no desk to hop to).
  const deskBaseURL = fixtureMode ? undefined : config?.baseURL;
  const deskHref = deskBaseURL === undefined || deskBaseURL === '' ? undefined : deskViewUrl(deskBaseURL, doctype);
  const sessionUser = useSessionUser();
  // Compact list chrome below 640 (theme `compact` size class — matchMedia
  // on web, window dimensions on native; BackofficeShell drawer precedent):
  // one title row + one scrollable switcher row, filters/sort behind a sheet.
  const compactChrome = useLayoutSizeClass() === 'compact';

  // Write-on-visit for the shared recent store (workspace "Continue where
  // you left off" strip). Fixture mode (stories/tests) stays storage-free.
  useRecentVisit(fixtureMode ? undefined : { label: doctype, path: paths.list(doctype) });

  const {
    meta: loadedMeta,
    loading: metaLoading,
    error: metaError,
    reload: reloadMeta,
  } = useDoctypeMeta(metaOverride ? undefined : doctype);
  const meta = metaOverride ?? loadedMeta;
  // Guest is refused getdoctype while it may still read the rows (LC-96):
  // the list then lays them out from one record's own fields, read-only, and
  // offers nothing that needs the meta.
  const metaRefused = !meta && metaError !== undefined && isPermissionError(metaError);
  // oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- frappe-ui's exported hook name
  const recordLayout = useRecordShape(config, doctype, metaRefused);
  const layoutMeta = useMemo<DoctypeMeta | undefined>(
    () =>
      meta ??
      (recordLayout.fields
        ? {
            name: doctype,
            fields: recordLayout.fields.map((field) => ({ ...field, in_list_view: 1 as const })),
          }
        : undefined),
    [meta, recordLayout.fields, doctype],
  );

  // Operational errors reach the host bus (never replaces the inline state).
  useEffect(() => {
    if (metaError && !meta && !metaRefused) {
      emitEvent({ type: 'error', error: metaError, context: 'list-meta' });
    }
  }, [metaError, meta, metaRefused, emitEvent]);

  // Session roles × meta.permissions: the doctype-level rights (desk
  // get_role_permissions) gate New and the write/delete bulk actions; fixture
  // mode has no session and withholds nothing.
  const { roles, user: rolesUser } = useUserRoles();
  const rights = useMemo(
    () => sessionDocRights({ fixtures: fixtureMode, meta, roles, user: rolesUser }),
    [fixtureMode, meta, roles, rolesUser],
  );

  // "New" affordances: host prop + the newDoc capability + the create right.
  const showNew = !hideNewButton && capabilities.newDoc.enabled && rights.create;

  // ONE FILTER SYSTEM (MOD-04): `baseFilters` is the single writable filter
  // state for this screen. Every filter surface — quick standard filters,
  // the tuple editor, saved filters, the chips row, the facet sidebar, the
  // compact tools sheet, and the `?f=` deep link — reads and writes THIS
  // state via handleBaseFiltersChange; changes reach the mounted table
  // through its controlledState adoption channel (keep-rows-and-reconcile:
  // the table NEVER remounts on a filter/sort/refresh change — current rows
  // stay rendered, the new query reconciles in place; no blanking, no
  // scroll reset). The table's own filter chrome is suppressed
  // (enableFiltering={false} below), so no second live filter state exists.
  const [baseFilters, setBaseFilters] = useState<FrappeFilters>(() => {
    const fromParam = parseFiltersParam(filtersParam);
    if (fromParam.length > 0) {
      return fromParam;
    }
    return initialFilters ? [...initialFilters] : fromParam;
  });
  // Read-only mirror of the table's effective query (injected base tuples +
  // the table-owned search box), synced from onStateChange — feeds the live
  // count and facet stats. Not a second filter authority: with the table's
  // filter chrome suppressed, search is the only table-side contribution.
  const [effectiveFilters, setEffectiveFilters] = useState<FrappeFilters | null>(null);
  // null = ride the doctype's meta default; `?sort=` deep links seed it.
  const [sort, setSort] = useState<ListSortState | null>(() => parseSortParam(sortParam) ?? null);
  const [refreshGen, setRefreshGen] = useState(0);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [quickEntryOpen, setQuickEntryOpen] = useState(false);
  const [pendingDialog, setPendingDialog] = useState<PendingDialog>(null);
  const [likeOverrides, setLikeOverrides] = useState<Record<string, boolean>>({});
  // Last page size the user picked — survives the filter/sort remounts.
  const pageSizeRef = useRef(pageSize ?? PAGE_SIZES[0]);

  // Always-ANDed host filters: joined into every query (table injection,
  // live count, facet stats) but invisible to the user filter chrome —
  // value-keyed so unstable array literals from the host don't churn.
  // The ambient desk scope (GL-5, the tenant seam) joins the same channel.
  const deskScope = useDeskScope();
  const fixedFiltersKey = JSON.stringify([...deskScope, ...(fixedFilters ?? [])]);
  // SAFETY: fixedFiltersKey is JSON.stringify of FrappeFilters tuples, so it parses back losslessly
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
  const fixedTuples = useMemo(() => JSON.parse(fixedFiltersKey) as FrappeFilters, [fixedFiltersKey]);
  const withFixed = useCallback(
    (filters: FrappeFilters): FrappeFilters => (fixedTuples.length > 0 ? [...fixedTuples, ...filters] : filters),
    [fixedTuples],
  );

  // Seeds on doctype/param swaps (refs — prop identity must not retrigger).
  const initialFiltersRef = useRef(initialFilters);
  // oxlint-disable-next-line react/refs -- render-synced mirror, read only by effects/handlers
  initialFiltersRef.current = initialFilters;
  // Render-synced mirrors so imperative handlers (URL writes, the table's
  // onStateChange) read current state without re-subscribing.
  const baseFiltersRef = useRef(baseFilters);
  // oxlint-disable-next-line react/refs -- render-synced mirror, read only by handlers
  baseFiltersRef.current = baseFilters;
  const sortRef = useRef(sort);
  // oxlint-disable-next-line react/refs -- render-synced mirror, read only by handlers
  sortRef.current = sort;

  // URL round-trip, outbound half (desk parity: list_view.js
  // update_url_with_filters → history.replaceState). Every USER state
  // change mirrors into `?f=`/`?sort=` through the navigator's optional
  // setParams — no history entry, no remount; hosts without the primitive
  // (noop navigator in bare stories) skip silently and state stays local.
  // Inbound param changes never call this (the sync effect below adopts
  // them), so the echo cannot loop.
  const writeUrlState = useCallback(
    (filters: FrappeFilters, sortState: ListSortState | null) => {
      navigator.setParams?.({
        f: serializeFiltersParam(filters),
        sort: sortState ? serializeSortParam(sortState) : undefined,
      });
    },
    [navigator],
  );

  // The route component is reused across /backoffice/[slug] navigations, so
  // a doctype swap or a new `?f=`/`?sort=` deep link (incl. browser
  // back/forward — the URL is the single source) resets the list state in
  // place. Echoes of our own writeUrlState calls arrive here too and are
  // adopted without state churn (sameFilters/sameSort guards).
  const lastDoctype = useRef(doctype);
  const lastFiltersParam = useRef(filtersParam);
  const lastSortParam = useRef(sortParam);
  useEffect(() => {
    const doctypeChanged = lastDoctype.current !== doctype;
    const filtersParamChanged = lastFiltersParam.current !== filtersParam;
    const sortParamChanged = lastSortParam.current !== sortParam;
    if (!doctypeChanged && !filtersParamChanged && !sortParamChanged) {
      return;
    }
    lastDoctype.current = doctype;
    lastFiltersParam.current = filtersParam;
    lastSortParam.current = sortParam;
    if (doctypeChanged || filtersParamChanged) {
      const fromParam = parseFiltersParam(filtersParam);
      const seed = initialFiltersRef.current;
      const next = fromParam.length === 0 && doctypeChanged && seed !== undefined ? [...seed] : fromParam;
      if (doctypeChanged || !sameFilters(next, baseFiltersRef.current)) {
        setBaseFilters(next);
        setEffectiveFilters(withFixed(next));
      }
    }
    if (doctypeChanged) {
      setSort(parseSortParam(sortParam) ?? null);
      // oxlint-disable-next-line react-doctor/no-adjust-state-on-prop-change -- the URL is the source of truth; this adopts an inbound doctype/deep-link swap in place
      setLikeOverrides({});
      return;
    }
    if (sortParamChanged) {
      const parsed = parseSortParam(sortParam) ?? null;
      if (!sameSort(parsed, sortRef.current)) {
        setSort(parsed);
      }
    }
  }, [doctype, filtersParam, sortParam, withFixed]);

  const sortField = sort?.field ?? meta?.sort_field ?? 'modified';
  const sortOrder = sort?.order ?? (meta?.sort_order?.toUpperCase() === 'ASC' ? 'asc' : 'desc');
  // Effective sort as the table sees it (state ?? meta default) — the
  // onStateChange mirror compares against THIS so the seeded initial sort
  // never echoes a redundant `?sort=` into the URL on mount.
  const effectiveSortRef = useRef<ListSortState>({ field: sortField, order: sortOrder });
  // oxlint-disable-next-line react/refs -- render-synced mirror, read only by onStateChange
  effectiveSortRef.current = { field: sortField, order: sortOrder };
  const currentFilters = effectiveFilters ?? withFixed(baseFilters);

  // Live result count — realtime refetch on doctype events. It takes the
  // provider config itself, never a copy: the SyncModule is shared per socket
  // target and the first consumer's config wins, so a field a copy drops
  // (syncOptions, a token getter) is gone for every screen.
  const count = useFrappeAggregate(config, {
    doctype,
    filters: currentFilters.length > 0 ? currentFilters : undefined,
  });

  const handleToggleLike = useCallback(
    (name: string, nextLiked: boolean) => {
      setLikeOverrides((previous) => ({ ...previous, [name]: nextLiked }));
      if (!app || fixtureMode) {
        return;
      }
      const persistLike = async () => {
        try {
          await toggleLike(app, doctype, name, nextLiked);
        } catch {
          // Roll the optimistic override back and tell the user.
          setLikeOverrides((previous) => ({ ...previous, [name]: !nextLiked }));
          notify({
            severity: 'error',
            scope: 'page',
            body: t('list.likeFailed', 'Could not update liked state'),
          });
        }
      };
      void persistLike();
    },
    [app, fixtureMode, doctype, t],
  );

  // Session roles × meta.permissions → permlevel read matrix. Columns for
  // fields above the roles' read level are pruned (desk hides them; the
  // server strips their values anyway). Undefined (fixtures / roles RPC
  // unavailable) prunes nothing — never hides more than desk would.
  const permMatrix = useMemo(() => buildPermLevelMatrix(meta?.permissions, roles), [meta?.permissions, roles]);

  const columns = useMemo(() => {
    // oxlint-disable-next-line react/refs -- the ref is read inside the onFilterClick handler, not during render
    const built = buildListColumns({
      meta: layoutMeta,
      t: (key, fallback) => t(key, fallback),
      sessionUser,
      onToggleLike: metaRefused ? undefined : handleToggleLike,
      likeOverrides,
      permMatrix,
      getDocHref: (name) => paths.form(doctype, name),
      onFilterClick: (fieldname, value) => {
        const next = toggleFacetFilter(baseFiltersRef.current, [fieldname, '=', value]);
        setBaseFilters(next);
        setEffectiveFilters(withFixed(next));
        writeUrlState(next, sortRef.current);
      },
    });
    return columnOverrides ? columnOverrides(built) : built;
  }, [
    layoutMeta,
    metaRefused,
    t,
    sessionUser,
    handleToggleLike,
    likeOverrides,
    permMatrix,
    columnOverrides,
    paths,
    doctype,
    withFixed,
    writeUrlState,
  ]);

  const fields = useMemo(() => listFieldsToFetch(layoutMeta, permMatrix), [layoutMeta, permMatrix]);

  // Filterable-field declarations from the one vocabulary (meta fields, the
  // standard doc fields and the desk `_` facet columns). With the table's
  // filter chrome suppressed these render no toolbar surface — they resolve
  // filter TYPES for the injected tuples and keep FrappeTable from
  // refetching meta to derive its own list.
  const filterableFields = useMemo<FilterableField[] | undefined>(
    () => (layoutMeta?.fields ? docFieldsToFilterFields(layoutMeta.fields) : undefined),
    [layoutMeta],
  );

  const initialTableFilters = useMemo<TableFilter[]>(
    () => frappeFiltersToTableFilters(withFixed(baseFilters)),
    [baseFilters, withFixed],
  );

  const handleBaseFiltersChange = useCallback(
    (next: FrappeFilters) => {
      setBaseFilters(next);
      setEffectiveFilters(withFixed(next));
      writeUrlState(next, sortRef.current);
    },
    [withFixed, writeUrlState],
  );

  const handleSortChange = useCallback(
    (field: string, order: 'asc' | 'desc') => {
      setSort({ field, order });
      writeUrlState(baseFiltersRef.current, { field, order });
    },
    [writeUrlState],
  );

  // DataTable's onStateChange fires on every table render (its state object
  // is rebuilt each pass), so every mirror below MUST bail to the previous
  // state identity when nothing changed — fresh objects would loop
  // render → onStateChange → setState → render forever.
  const handleStateChange = useCallback(
    (state: DataTableState) => {
      if (state.pagination?.pageSize) {
        pageSizeRef.current = state.pagination.pageSize;
      }
      // Mirror the resolved page's display order into the shared prev/next
      // pager context (read by DocFormScreen). The store dedupes identical
      // writes and ignores the fetch-in-flight empty passes.
      setListNavContext(doctype, rowNames(state.data ?? []));
      const nextFilters = tableStateToFrappeFilters(state);
      setEffectiveFilters((previous) => (previous && sameFilters(previous, nextFilters) ? previous : nextFilters));
      // Header-sort clicks stay internal to the table; mirror them into the
      // sort selector without any table remount. Compared
      // against the EFFECTIVE sort so the seeded initial sorting is a no-op;
      // a real header sort also mirrors into the URL (write-once — the
      // effective ref updates on the next render).
      const sorting = state.sorting?.[0];
      if (sorting !== undefined) {
        const order = sorting.desc ? ('desc' as const) : ('asc' as const);
        const effective = effectiveSortRef.current;
        if (effective.field !== sorting.id || effective.order !== order) {
          const nextSort: ListSortState = { field: sorting.id, order };
          setSort(nextSort);
          writeUrlState(baseFiltersRef.current, nextSort);
        }
      }
    },
    [writeUrlState, doctype],
  );

  const handleRefresh = useCallback(() => {
    setRefreshGen((generation) => generation + 1);
    count.refresh();
  }, [count]);

  const handleRowClick = useCallback(
    (row: ListRow) => {
      if (row.name === undefined || row.name === '') {
        return;
      }
      if (onRowOpen) {
        onRowOpen(doctype, row.name);
        return;
      }
      emitEvent({ type: 'doc-opened', doctype, name: row.name });
      navigator.navigate(paths.form(doctype, row.name));
    },
    [navigator, paths, doctype, onRowOpen, emitEvent],
  );

  const handleBulkExport = useCallback(
    async (names: string[]) => {
      if (!app) {
        return;
      }
      try {
        const result = await bulkExportCsv(app, doctype, names, meta);
        if (result.cancelled) {
          return;
        }
        if (result.downloaded) {
          notify({
            severity: 'success',
            scope: 'page',
            body: t('list.exportDone', {
              count: result.rowCount,
              defaultValue_one: 'Exported {{count}} row to CSV',
              defaultValue_other: 'Exported {{count}} rows to CSV',
            }),
          });
        } else {
          notify({
            severity: 'warning',
            scope: 'page',
            body: t(
              'list.exportUnsupported',
              'CSV export needs a browser download — not available on this platform yet',
            ),
          });
        }
      } catch (error) {
        notify({
          severity: 'error',
          scope: 'page',
          body: error instanceof Error ? error.message : t('list.exportFailed', 'CSV export failed'),
        });
      }
    },
    [app, doctype, meta, t],
  );

  const handleBulkDocstatus = useCallback(
    async (names: string[], action: BulkDocstatusAction) => {
      if (!app) {
        return;
      }
      try {
        const result = await bulkSubmitCancel(app, doctype, names, action);
        if (result.queued) {
          notify({
            severity: 'info',
            scope: 'page',
            body: t('list.docstatusQueued', {
              action: action === 'submit' ? t('list.submit', 'Submit') : t('list.cancel', 'Cancel'),
              count: result.attempted,
              defaultValue_one: '{{action}} of {{count}} document queued in the background',
              defaultValue_other: '{{action}} of {{count}} documents queued in the background',
            }),
          });
        } else if (result.failed.length > 0) {
          notify({
            severity: 'warning',
            scope: 'page',
            // Two independent counts in one sentence — phrased "X of Y" so
            // no noun needs a second plural slot.
            body: t('list.docstatusPartial', {
              count: result.attempted - result.failed.length,
              total: result.attempted,
              names: result.failed.join(', '),
              defaultValue: 'Processed {{count}} of {{total}} documents; failed: {{names}}',
            }),
          });
        } else {
          notify({
            severity: 'success',
            scope: 'page',
            body:
              action === 'submit'
                ? t('list.submitDone', {
                    count: result.attempted,
                    defaultValue_one: 'Submitted {{count}} document',
                    defaultValue_other: 'Submitted {{count}} documents',
                  })
                : t('list.cancelDone', {
                    count: result.attempted,
                    defaultValue_one: 'Cancelled {{count}} document',
                    defaultValue_other: 'Cancelled {{count}} documents',
                  }),
          });
        }
        count.refresh();
      } catch (error) {
        notify({
          severity: 'error',
          scope: 'page',
          body: error instanceof Error ? error.message : t('list.docstatusFailed', 'Bulk action failed'),
        });
      }
    },
    [app, doctype, t, count],
  );

  const isSubmittable = meta?.is_submittable === 1;

  // Host-injected selection actions: provider `actions.list` (doctype-scoped
  // registry) + the `toolbarActions` prop, appended to the built-in bulk
  // actions.
  const hostListActions = useMemo<BulkAction<ListRow>[]>(() => {
    const injected: BackofficeAction[] = [
      ...actionsForDoctype(actions.list, doctype),
      ...actionsForDoctype(toolbarActions, doctype),
    ];
    return injected.map((action) => ({
      id: action.id,
      label: action.label,
      onExecute: (items: ListRow[]) => {
        const names = selectedNames(items);
        action.onPress({ doctype, selection: names });
      },
    }));
  }, [actions.list, toolbarActions, doctype]);

  const bulkActions = useMemo<BulkAction<ListRow>[]>(() => {
    const list: BulkAction<ListRow>[] = [];
    // Assignment/tag actions ride their capability flags.
    if (capabilities.assignments.enabled) {
      list.push({
        id: 'assign',
        label: t('list.assignTitle', 'Assign To'),
        onExecute: (items, clearSelection) => {
          const names = selectedNames(items);
          if (names.length > 0) {
            setPendingDialog({ type: 'assign', names, clear: clearSelection });
          }
        },
      });
    }
    if (capabilities.tags.enabled) {
      list.push({
        id: 'tag',
        label: t('list.tagTitle', 'Add Tags'),
        onExecute: (items, clearSelection) => {
          const names = selectedNames(items);
          if (names.length > 0) {
            setPendingDialog({ type: 'tag', names, clear: clearSelection });
          }
        },
      });
    }
    if (rights.write) {
      list.push({
        id: 'edit',
        label: t('list.editTitle', 'Bulk Edit'),
        onExecute: (items, clearSelection) => {
          const names = selectedNames(items);
          if (names.length > 0) {
            setPendingDialog({ type: 'edit', names, clear: clearSelection });
          }
        },
      });
    }
    list.push({
      id: 'export',
      label: t('list.export', 'Export CSV'),
      onExecute: async (items) => {
        const names = selectedNames(items);
        if (names.length > 0) {
          await handleBulkExport(names);
        }
      },
    });
    if (isSubmittable && rights.submit) {
      list.push({
        id: 'submit',
        label: t('list.submit', 'Submit'),
        requiresConfirmation: true,
        confirmTitle: t('list.submitTitle', 'Submit documents'),
        confirmMessage: t('list.submitConfirm', {
          defaultValue: 'Submit the selected {{doctype}} documents?',
          doctype,
        }),
        onExecute: async (items, clearSelection) => {
          const names = selectedNames(items);
          if (names.length === 0) {
            return;
          }
          await handleBulkDocstatus(names, 'submit');
          clearSelection();
        },
      });
    }
    if (isSubmittable && rights.cancel) {
      list.push({
        id: 'cancel',
        label: t('list.cancel', 'Cancel'),
        requiresConfirmation: true,
        confirmTitle: t('list.cancelTitle', 'Cancel documents'),
        confirmMessage: t('list.cancelBody', {
          defaultValue: 'Cancel the selected submitted {{doctype}} documents?',
          doctype,
        }),
        onExecute: async (items, clearSelection) => {
          const names = selectedNames(items);
          if (names.length === 0) {
            return;
          }
          await handleBulkDocstatus(names, 'cancel');
          clearSelection();
        },
      });
    }
    if (rights.delete) {
      list.push({
        id: 'delete',
        label: t('list.delete', 'Delete'),
        variant: 'destructive',
        requiresConfirmation: true,
        confirmTitle: t('list.deleteTitle', 'Delete documents'),
        confirmMessage: t('list.deleteConfirm', {
          defaultValue: 'Permanently delete the selected {{doctype}} documents?',
          doctype,
        }),
        onExecute: async (items, clearSelection) => {
          if (!app) {
            return;
          }
          const names = selectedNames(items);
          if (names.length === 0) {
            return;
          }
          const result = await bulkDelete(app, doctype, names);
          if (result.failed.length > 0) {
            notify({
              severity: 'warning',
              scope: 'page',
              body: t('list.deletePartial', {
                count: result.succeeded.length,
                total: names.length,
                names: result.failed.map((failure) => failure.name).join(', '),
                defaultValue: 'Deleted {{count}} of {{total}} documents; failed: {{names}}',
              }),
            });
          } else {
            notify({
              severity: 'success',
              scope: 'page',
              body: t('list.deleteDone', {
                count: result.succeeded.length,
                defaultValue_one: 'Deleted {{count}} document',
                defaultValue_other: 'Deleted {{count}} documents',
              }),
            });
          }
          clearSelection();
          count.refresh();
        },
      });
    }
    list.push(...hostListActions);
    return list;
  }, [
    t,
    app,
    doctype,
    count,
    isSubmittable,
    handleBulkExport,
    handleBulkDocstatus,
    capabilities.assignments.enabled,
    capabilities.tags.enabled,
    hostListActions,
    rights,
  ]);

  // Selection + the bulk bar ride the bulkActions capability as one unit.
  const bulkActionsEnabled = capabilities.bulkActions.enabled && !metaRefused;

  // View switcher options: meta-derived availability (view-availability.ts
  // documents each view's desk precondition) ∩ capability allowlist ∩ the
  // `views` prop. "list" is the current view, so it always survives.
  const availableViews = useMemo(() => {
    if (!capabilities.views.enabled) {
      return [];
    }
    const allowlist = viewsAllowlist ? new Set(viewsAllowlist) : undefined;
    const permitted = allowlist
      ? capabilities.views.allow.filter((view) => allowlist.has(view))
      : capabilities.views.allow;
    // Without meta only the report lays itself out from the rows (LC-96).
    const allow = metaRefused ? permitted.filter((view) => view === 'report') : permitted;
    return deriveAvailableViews(meta, { current: 'list', allow });
  }, [meta, metaRefused, capabilities.views.enabled, capabilities.views.allow, viewsAllowlist]);

  // Remount ONLY on a doctype swap (different columns/meta). Filter, sort,
  // and refresh changes reconcile IN PLACE through the table's
  // controlledState / refreshToken channels — remounting on those was the
  // named blank-the-list defect (rows torn down, skeleton flash, scroll
  // reset on every filter toggle).
  const tableKey = doctype;

  // Controlled sorting as the table should adopt it (state ?? meta default).
  const controlledSorting = useMemo(() => [{ id: sortField, desc: sortOrder === 'desc' }], [sortField, sortOrder]);
  const controlledTableState = useMemo(
    () => ({
      filters: initialTableFilters,
      sorting: controlledSorting,
      columnVisibility: { modified: false },
    }),
    [initialTableFilters, controlledSorting],
  );

  if (metaError && !meta && !metaRefused) {
    return (
      <YStack flex={1}>
        <AsyncBoundary
          error={metaError}
          errorTitle={t('list.metaError', {
            defaultValue: 'Could not load {{doctype}}',
            doctype,
          })}
          onRetry={reloadMeta}
        />
      </YStack>
    );
  }

  if (metaRefused && !layoutMeta && recordLayout.status !== 'pending') {
    return (
      <YStack flex={1}>
        <EmptyState
          testID="frappe-list-not-permitted"
          title={t('list.notPermitted', {
            defaultValue: "You can't open the {{doctype}} list",
            doctype,
          })}
          description={refusalReason(metaError)}
        />
      </YStack>
    );
  }

  if (!layoutMeta && (metaLoading || metaRefused)) {
    return (
      <YStack
        flex={1}
        alignItems="center"
        justifyContent="center"
        padding="$6">
        <Spinner size="large" />
      </YStack>
    );
  }

  const fixtureFilterProps = fixtureMode ? { filters: withFixed(baseFilters) } : {};
  const bulkActionProps = bulkActionsEnabled ? { bulkActions } : {};
  const showCreateFirst = !count.isLoading && count.value === 0 && currentFilters.length === 0;

  // i18next plural forms — never the lazy "(s)" suffix (the count picks the
  // form; other locales pluralize correctly through the same key).
  const countText =
    count.error || (count.value === undefined && count.isLoading)
      ? undefined
      : t('list.resultCount', {
          count: count.value ?? 0,
          defaultValue_one: '{{count}} result',
          defaultValue_other: '{{count}} results',
        });
  const handleViewChange = (view: BackofficeView) => {
    if (view !== 'list') {
      navigator.navigate(paths.view(doctype, view));
    }
  };

  // One dense toolbar: title + count on the left, every list control on
  // the right. Views are a dropdown (desk ListViewSelect) so they cannot
  // dominate the row; Save Filter is contextual (ListFilterBar hides it
  // until there is something to save); refresh sits with New, not as an
  // orphan next to a seven-segment switcher.
  const listToolbar = (
    <XStack
      gap="$1.5"
      alignItems="center"
      flexWrap="wrap">
      {!compactChrome && !metaRefused && (
        <ActionButton
          size="$3"
          circular
          chromeless
          icon={SidebarSimpleIcon}
          display="none"
          $sm={{ display: 'flex' }}
          onPress={() => {
            setSidebarVisible((visible) => !visible);
          }}
          aria-expanded={sidebarVisible}
          aria-label={sidebarVisible ? t('list.hideSidebar', 'Hide sidebar') : t('list.showSidebar', 'Show sidebar')}
        />
      )}
      {!metaRefused && (
        <ListFilterBar
          compact={compactChrome}
          showChips={false}
          doctype={doctype}
          meta={meta}
          filters={baseFilters}
          onFiltersChange={handleBaseFiltersChange}
          sortField={sortField}
          sortOrder={sortOrder}
          onSortChange={handleSortChange}
          likedByUser={sessionUser}
        />
      )}
      <ViewSwitcherMenu
        views={availableViews}
        current="list"
        onViewChange={handleViewChange}
      />
      {deskHref !== undefined && (
        <ActionButton
          size="$3"
          circular
          chromeless
          icon={ArrowSquareOutIcon}
          onPress={() => {
            openInNewTab(deskHref);
          }}
          aria-label={t('list.openInDesk', 'Open in Desk')}
        />
      )}
      <ActionButton
        size="$3"
        circular
        chromeless
        icon={ArrowsClockwiseIcon}
        onPress={handleRefresh}
        aria-label={t('list.refresh', 'Refresh')}
      />
      {showNew && (
        <ActionButton
          size={compactChrome ? '$3' : '$2'}
          accent
          {...(compactChrome ? { icon: PlusIcon } : {})}
          onPress={() => {
            setQuickEntryOpen(true);
          }}
          aria-label={t('list.new', {
            defaultValue: NEW_DOC_DEFAULT,
            doctype,
          })}>
          {compactChrome ? t('list.newShort', 'New') : t('list.new', { defaultValue: NEW_DOC_DEFAULT, doctype })}
        </ActionButton>
      )}
    </XStack>
  );

  return (
    <YStack
      flex={1}
      {...knobProps.gap}
      {...knobProps.panelPadding}>
      <PageHeader
        gap="$2"
        heading={
          <XStack
            gap="$2"
            alignItems="baseline"
            flexWrap="wrap">
            <H1
              {...knobProps.pageTitle}
              {...knobProps.heading}
              margin={0}
              flexShrink={1}
              minWidth={0}>
              {doctype}
            </H1>
            {countText !== undefined && countText !== '' ? (
              <Paragraph
                size="$2"
                color="$color10"
                margin={0}>
                {countText}
              </Paragraph>
            ) : null}
          </XStack>
        }
        actions={listToolbar}>
        {/* Shared chips readout (MOD-04 honest state): the table's own
            chips row is suppressed, so the list chrome owns them. Renders
            nothing while no filters apply. */}
        <FilterChips
          meta={meta}
          filters={baseFilters}
          onFiltersChange={handleBaseFiltersChange}
        />
      </PageHeader>

      {(() => {
        const listBody = (
          <XStack
            flex={1}
            gap="$2"
            alignItems="stretch">
            {/* Facet sidebar needs bench RPCs (fixture mode hides it) and is
                hidden on narrow viewports (< $sm) like desk. MOD-04 keeps it:
                facet clicks toggle tuples through the same baseFilters
                channel (handleBaseFiltersChange) — counts are informative,
                the chips row is the shared readout. */}
            {sidebarVisible && !metaRefused && (
              <YStack
                display="none"
                $sm={{ display: 'flex' }}>
                <ListSidebar
                  doctype={doctype}
                  meta={meta}
                  filters={currentFilters}
                  onFiltersChange={handleBaseFiltersChange}
                />
              </YStack>
            )}
            <YStack
              flex={1}
              minWidth={0}>
              {showCreateFirst ? (
                (slots.renderListEmpty?.({ doctype }) ?? (
                  <EmptyState
                    title={t('list.emptyTitle', {
                      defaultValue: 'No {{doctype}} yet',
                      doctype,
                    })}
                    description={t('list.emptyDescription', {
                      defaultValue: 'Create your first {{doctype}} to get started',
                      doctype,
                    })}
                    action={
                      showNew ? (
                        <ActionButton
                          accent
                          onPress={() => {
                            setQuickEntryOpen(true);
                          }}>
                          {t('list.new', {
                            defaultValue: NEW_DOC_DEFAULT,
                            doctype,
                          })}
                        </ActionButton>
                      ) : undefined
                    }
                  />
                ))
              ) : (
                <ListTable
                  key={tableKey}
                  doctype={doctype}
                  columns={columns}
                  fields={fields}
                  serverSide={!fixtureMode}
                  {...fixtureFilterProps}
                  filterableFields={filterableFields}
                  initialState={{
                    sorting: [{ id: sortField, desc: sortOrder === 'desc' }],
                    filters: initialTableFilters,
                    pagination: {
                      pageIndex: 0,
                      // oxlint-disable-next-line react/refs -- seeds the table's initial page size only; later picks live in the table
                      pageSize: fixtureMode ? 500 : pageSizeRef.current,
                    },
                    columnVisibility: { modified: false },
                  }}
                  // Keep-rows-and-reconcile (no remount): filter/sort changes
                  // adopt in place; refresh re-runs the current query in
                  // place. Rows stay rendered while the server reconciles.
                  controlledState={controlledTableState}
                  refreshToken={refreshGen}
                  enablePagination={!fixtureMode}
                  paginationMode="infinite"
                  compact
                  // ONE FILTER SYSTEM (MOD-04 / LC-16): the list chrome is
                  // the single filtering authority; tuples reach the table
                  // through controlledState (in-place adoption — no remount).
                  // enableFiltering={false} suppresses every in-table filter
                  // entry point (toolbar Filter button, column funnels, chips
                  // row, card Add Filter) and detaches the search clear-X
                  // from the injected filters — the table contributes header
                  // sort only, mirrored back via onStateChange.
                  enableFiltering={false}
                  enableGlobalSearch={false}
                  enableSorting
                  enableRowSelection={bulkActionsEnabled}
                  {...bulkActionProps}
                  onRowClick={handleRowClick}
                  onStateChange={handleStateChange}
                  rights={rights}
                  layout="list"
                />
              )}
            </YStack>
          </XStack>
        );
        // Native has no page-level scroll and the table body ships none —
        // wrap in a vertical ScrollView (DocFormScreen precedent) so rows
        // below the fold stay reachable. Compact web is in the same boat:
        // the card list renders in flow inside the shell's overflow-hidden
        // frame, so it needs the same scroll wrapper (the compact header
        // stays pinned above it). Wide web keeps the flex layout as-is —
        // the grid body scrolls internally.
        return isWeb && !compactChrome ? listBody : <ScrollView flex={1}>{listBody}</ScrollView>;
      })()}

      {showNew && (
        <QuickEntryDialog
          doctype={doctype}
          open={quickEntryOpen}
          onOpenChange={setQuickEntryOpen}
          onCreated={(name) => {
            emitEvent({ type: 'doc-opened', doctype, name });
            navigator.navigate(paths.form(doctype, name));
          }}
          onEditFullForm={() => {
            navigator.navigate(paths.newDoc(doctype));
          }}
        />
      )}
      <AssignToDialog
        doctype={doctype}
        names={pendingDialog?.type === 'assign' ? pendingDialog.names : []}
        open={pendingDialog?.type === 'assign'}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDialog(null);
          }
        }}
        onDone={() => {
          pendingDialog?.clear();
          count.refresh();
        }}
      />
      <AddTagsDialog
        doctype={doctype}
        names={pendingDialog?.type === 'tag' ? pendingDialog.names : []}
        open={pendingDialog?.type === 'tag'}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDialog(null);
          }
        }}
        onDone={() => {
          pendingDialog?.clear();
          count.refresh();
        }}
      />
      <BulkEditDialog
        doctype={doctype}
        meta={meta}
        names={pendingDialog?.type === 'edit' ? pendingDialog.names : []}
        open={pendingDialog?.type === 'edit'}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDialog(null);
          }
        }}
        onDone={() => {
          pendingDialog?.clear();
          count.refresh();
        }}
      />
    </YStack>
  );
};
