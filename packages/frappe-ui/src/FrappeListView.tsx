import {
  ArrowsClockwiseIcon,
  HeartIcon,
  ImageIcon,
  ListIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  SparkleIcon,
  TableIcon,
} from '@phosphor-icons/react';
import { Button, SearchInput, Spinner } from '@repo/forms';
import { useDocTypeMeta } from '@repo/frappe';
import { storage } from '@repo/store';
import { SavedFilterDropdown, useSavedFilters } from '@repo/table';
import type { DataTableColumn, ParsedFilter } from '@repo/table';
import { pressTargetStyle, useResolvedKnobs } from '@repo/theme';
import {
  AsyncBoundary,
  Avatar,
  EmptyState,
  ListPageLayout,
  PageHeader,
  SkipLink,
  Tooltip,
  ViewSwitcher,
  componentColors,
  showToast,
} from '@repo/ui';
import type { ImageGridProps } from '@repo/ui';
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View, XStack, YStack, isWeb, useTheme } from 'tamagui';
import type { YStackProps } from 'tamagui';

import { useDocRights } from './formEngine/use-doc-rights';
import { connectionsFromMeta } from './frappe-connections';
import type { FrappeConnection } from './frappe-connections';
import { frappeRouteHref, useFrappeRouter, useRouteLoaderData } from './frappe-navigation';
import { FrappeList } from './FrappeList';
import type { FrappeListProps } from './FrappeList';
import { FrappeNotConfigured } from './FrappeNotConfigured';
import { useFrappeConfig } from './FrappeProvider';
import { FrappeRowsReader } from './FrappeRowsReader';
import type { FrappeRowsSnapshot } from './FrappeRowsReader';
import { FrappeTable } from './FrappeTable';
import { favoritesKey } from './list/favorites';
import { isListNarrowed, listStateFilters, listStateOrderBy } from './list/list-state';
import type {
  FrappeListControls,
  FrappeListFacet,
  FrappeListFilter,
  FrappeListRange,
  FrappeListSort,
} from './list/list-state';
import { ListControls } from './list/ListControls';
import { ListToastHost } from './list/ListToastHost';
import { recordTitle } from './list/record-look';
import type { FrappeRecordLook } from './list/record-look';
import { RecordCard } from './list/RecordCard';
import { ShufflePanel } from './list/ShufflePanel';
import { useListControls } from './list/use-list-controls';
import { isPermissionError } from './live-errors';
// oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- the hook's exported name lives in record-shape; it is aliased for its role here
import { recordKeyLabel, useRecordShape as usePeekedRecord } from './record-shape';
import { useConnectionFilters } from './use-connection-filters';
import type { FrappeDoctypeFilter } from './use-connection-filters';

interface ListFieldConfig {
  key: string;
  label?: string;
  // oxlint-disable-next-line typescript/no-explicit-any -- callers type each field's value in their renderers; `any` keeps those typed renderers assignable
  render?: (value: any, doc: any) => React.ReactNode;
}

export type ListViewMode = 'list' | 'table' | 'grid';

/** What a card needs from the list beyond its row. */
export interface FrappeListCard {
  /** The record's page, when the list is routed. */
  href?: string;
  /** Opens the record the way a row press does. */
  open: () => void;
  /** Facet param to the record's values (a Pokemon's types, in slot order). */
  facets: Record<string, string[]>;
  /** Present when the list offers favorites. */
  favorite?: { active: boolean; toggle: () => void };
}

/** A page-header action of a routed list; icon-only under sm. */
export interface FrappeListAction {
  label: string;
  icon?: React.ComponentType<{ size?: number }>;
  /** Opened through the FrappeProvider's navigation. */
  href?: string;
  onPress?: () => void;
  /** Tooltip. */
  hint?: string;
  testID?: string;
}

export interface FrappeListViewProps<TDoc extends { name: string; doctype: string }> extends Omit<
  YStackProps,
  'children'
> {
  doctype: string;
  fields?: readonly (keyof TDoc & string)[];
  /**
   * Doctypes linking back to this one (desk Connections). A four-part filter
   * on one of them, `[doctype, field, operator, value]`, narrows this list to
   * the records its matching rows name. Defaults to the doctype's meta.links.
   */
  connections?: readonly FrappeConnection[];
  filters?: Partial<TDoc> | ([keyof TDoc & string, string, unknown] | FrappeDoctypeFilter)[];
  defaultViewMode?: ListViewMode;
  /** Controlled view mode; the stored per-doctype choice is then ignored. */
  viewMode?: ListViewMode;
  onViewModeChange?: (mode: ListViewMode) => void;
  onItemClick?: (doc: Partial<TDoc>) => void;
  onAdd?: () => void;
  /**
   * The path the doctype's pages live under (`/moves`). Given, the view is
   * the doctype's list page: it carries the list page template with the
   * doctype as its title, a row opens `route/<name>` and Add opens
   * `route/new` through the FrappeProvider's navigation. Add, routed or
   * given, shows only when the session's roles grant create on the doctype,
   * so a reader who cannot load its meta is not offered a form.
   */
  route?: string;
  /**
   * The query the list reads, beyond fields and filters. Give a route loader
   * the same order and limit (`loadDocList`) so its server page and the live
   * page match; `initialRows` is that server page.
   */
  orderBy?: FrappeListProps<TDoc>['orderBy'];
  limit?: number;
  initialRows?: readonly Partial<TDoc>[];
  /**
   * The route's loader (`frappeListLoader`): the rows it rendered on the
   * server seed the list, read through the host's navigation.
   */
  loader?: (...args: never[]) => Promise<{ rows: readonly Partial<TDoc>[] }>;
  columns?: DataTableColumn<Partial<TDoc>>[];
  displayFields?: ListFieldConfig[];
  /**
   * Per-row card slot. Given, the view gains a card grid (`grid` mode, the
   * catalog ImageGrid) that draws each row with it; loading, empty and error
   * stay the view's own states. A host that draws the grid itself may leave
   * `card` out.
   */
  renderCard?: (doc: Partial<TDoc>, index: number, card?: FrappeListCard) => React.ReactNode;
  /**
   * How the doctype's records present. With `images` and no card slot, the
   * grid draws each record as a RecordCard: the look's title, code,
   * subtitle and images, the well tinted and badged by the first facet that
   * declares tints, the favorite heart when the list keeps favorites.
   */
  look?: FrappeRecordLook<TDoc>;
  /** Card grid: column count, tile rung and media aspect. */
  gridProps?: Pick<ImageGridProps<Partial<TDoc>>, 'columns' | 'tileSize' | 'mediaAspect'>;
  /** Replaces the default empty message in list and card modes. */
  emptyState?: React.ReactNode;
  /**
   * Error-state retry. Defaults to remounting the list, which restarts its
   * sync only when nothing else still holds the failed collection.
   */
  onRetry?: () => void;
  /** Rows revealed per page in list and card modes (default 20). */
  pageSize?: number;
  /** False drops the list/card search band (a screen that owns its own search). */
  showSearch?: boolean;
  /** False renders the view without its card surface, flush in the page. */
  surface?: boolean;
  showToolbar?: boolean;
  showFilterSidebar?: boolean;
  /** @deprecated The toolbar always renders the List/Table switcher now. */
  enableViewSwitcher?: boolean;
  /** Routed page title; defaults to the doctype. */
  title?: string;
  /** Routed page subtitle from the number of records the list reads. */
  subtitle?: (count: number) => string;
  /**
   * Routed page actions. With the toolbar off, the view switcher and Add
   * join them in the page header.
   */
  actions?: readonly FrappeListAction[];
  /** Header content ahead of the actions. */
  headerAccessory?: React.ReactNode;
  /** The field that names a record in toasts; defaults to meta.title_field. */
  titleField?: string;
  /** Sort choices, first is the default; given, a Sort select joins the controls. */
  sorts?: readonly FrappeListSort[];
  /** The bench filters a search becomes; defaults to a like on the title field. */
  searchFilter?: (query: string) => readonly FrappeListFilter[];
  searchPlaceholder?: string;
  /** One chip rail per facet, with each value's record count. */
  facets?: readonly FrappeListFacet[];
  /** One minimum-value slider per numeric field. */
  ranges?: readonly FrappeListRange[];
  /**
   * Star records on this device and filter to them: true keys the stars by
   * doctype, a string names the storage key.
   */
  favorites?: boolean | string;
  /** A random-record picker; `label` names a record on its wheel. */
  shuffle?: { label: (doc: Partial<TDoc>) => string };
  /**
   * Keep the controls and the view in the route's query params, so a
   * refresh or a shared link reproduces the list.
   */
  urlState?: boolean;
  baseURL?: string;
  auth?: { useToken?: boolean; token?: string; type?: string };
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- SyncModule options pass through to @repo/frappe untouched
  syncOptions?: Record<string, unknown>;
}

const storageKeyPrefix = 'frappe-listview-';

/** Cards whose images load eagerly; the rest wait until they near the viewport. */
const eagerCards = 6;

// Fieldtypes that structure a form but hold no listable value.
const layoutFieldtypes = new Set(['Column Break', 'Section Break', 'Tab Break', 'HTML', 'Heading', 'Fold', 'Button']);

/**
 * Resolves an image field value to a full URL.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- this parses one raw list-row image cell
const resolveImageUrl = (value: unknown, baseURL: string): string => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- list rows are untyped server JSON; only a non-empty string names an image
  if (typeof value !== 'string' || value === '') {
    return '';
  }
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }
  if (value.startsWith('/')) {
    return `${baseURL}${value}`;
  }
  return value;
};

/** A row as an open field bag; a row object is one, so no conversion is needed. */
// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- display, facet and title fields are read off untyped list rows by name
const rowFields = (doc: Partial<{ name: string; doctype: string }>): Record<string, unknown> => doc;

/** Plain filters as filter rows, the form the list controls merge into. */
const toFilterRows = <TDoc extends { name: string; doctype: string }>(
  filters: FrappeListViewProps<TDoc>['filters'],
): FrappeListFilter[] => {
  if (!filters) {
    return [];
  }
  if (Array.isArray(filters)) {
    // SAFETY: each array entry is a [field, operator, value] row (or a doctype-scoped one), FrappeListFilter's two forms
    return filters as FrappeListFilter[];
  }
  return Object.entries(filters).map(([field, value]): FrappeListFilter => [field, '=', value]);
};

const favoritesStorageKeyFor = (favorites: boolean | string | undefined, doctype: string): string | undefined => {
  if (favorites === undefined || favorites === false || favorites === '') {
    return undefined;
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- discriminates the declared `boolean | string` favorites prop
  return typeof favorites === 'string' ? favorites : favoritesKey(doctype);
};

const getStoredViewMode = async (doctype: string): Promise<ListViewMode | null> => {
  try {
    const stored = await Promise.resolve(storage.getItem(`${storageKeyPrefix}${doctype}`));
    if (stored === 'list' || stored === 'table' || stored === 'grid') {
      return stored;
    }
  } catch {
    // storage not available
  }
  return null;
};

const setStoredViewMode = async (doctype: string, mode: ListViewMode): Promise<void> => {
  try {
    await Promise.resolve(storage.setItem(`${storageKeyPrefix}${doctype}`, mode));
  } catch {
    // storage not available
  }
};

// oxlint-disable-next-line eslint/complexity, react-doctor/no-giant-component -- the list page composes routing, controls, search, favorites and three views over one shared state; splitting it is tracked separately
const FrappeListViewBody = <TDoc extends { name: string; doctype: string }>({
  doctype,
  fields,
  connections,
  filters,
  defaultViewMode = 'list',
  viewMode: controlledViewMode,
  onViewModeChange,
  onItemClick: onItemClickProp,
  onAdd: onAddProp,
  route,
  orderBy,
  limit,
  initialRows: initialRowsProp,
  loader,
  columns,
  displayFields,
  renderCard,
  look,
  gridProps,
  emptyState,
  onRetry,
  pageSize,
  showSearch = true,
  surface = true,
  showToolbar = true,
  showFilterSidebar = false,
  // deprecated: switcher always renders; destructured so it stays out of stackProps
  // oxlint-disable-next-line typescript/no-deprecated -- destructured only so the deprecated prop stays out of stackProps
  enableViewSwitcher: _enableViewSwitcher,
  title,
  subtitle,
  actions,
  headerAccessory,
  titleField,
  sorts,
  searchFilter,
  searchPlaceholder,
  facets,
  ranges,
  favorites,
  shuffle,
  urlState = false,
  baseURL,
  auth,
  syncOptions,
  ...stackProps
  // oxlint-disable-next-line sonarjs/cognitive-complexity -- see the complexity note on FrappeListViewBody
}: FrappeListViewProps<TDoc>) => {
  const config = useFrappeConfig();
  const router = useFrappeRouter();
  const navigate = router?.navigate;
  const { knobProps } = useResolvedKnobs();
  const { t } = useTranslation();
  const theme = useTheme();

  const finalBaseURL = baseURL ?? config?.baseURL;
  const finalAuth = auth ?? config?.auth;
  const finalSyncOptions = syncOptions ?? config?.syncOptions;

  if (finalBaseURL === undefined || finalBaseURL === '') {
    throw new Error('FrappeListView requires baseURL prop or FrappeProvider with baseURL');
  }

  const connectionConfig = {
    baseURL: finalBaseURL,
    socketPort: config?.socketPort,
    siteName: config?.siteName,
    socketBaseURL: config?.socketBaseURL,
    auth: finalAuth,
    syncOptions: finalSyncOptions,
    realtime: config?.realtime,
    fixtures: config?.fixtures,
  };

  const [viewModeState, setViewModeState] = useState<ListViewMode>(defaultViewMode);

  useEffect(() => {
    let cancelled = false;
    setViewModeState(defaultViewMode);
    void (async () => {
      const storedMode = await getStoredViewMode(doctype);
      if (!cancelled && storedMode) {
        setViewModeState(storedMode);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doctype, defaultViewMode]);

  const { meta, isLoading: isMetaLoading, error: metaError } = useDocTypeMeta(connectionConfig, doctype);

  const isRoutable = route !== undefined && navigate !== undefined;
  const routedItemClick = isRoutable
    ? (doc: Partial<TDoc>) => {
        if (doc.name !== undefined && doc.name !== '') {
          navigate(frappeRouteHref(route, { mode: 'view', name: doc.name }));
        }
      }
    : undefined;
  const onItemClick = onItemClickProp ?? routedItemClick;
  const { rights } = useDocRights(connectionConfig, meta);
  const routedAdd = isRoutable
    ? () => {
        navigate(frappeRouteHref(route, { mode: 'create' }));
      }
    : undefined;
  const onAdd = rights.create ? (onAddProp ?? routedAdd) : undefined;
  // Meta refused (Guest gets 403) while the rows are readable: the views
  // take their fields from one record instead of collapsing to Name (LC-96).
  const peekedRecord = usePeekedRecord(connectionConfig, doctype, !meta && !isMetaLoading && Boolean(metaError));
  const peekedFields = useMemo(
    () => peekedRecord.fields?.map((field) => field.fieldname) ?? null,
    [peekedRecord.fields],
  );

  // List-view fields: prefer the doctype's in_list_view flags; when a doctype
  // declares none, lead with its first data fields so the list/table still
  // render something useful out of the box.
  const metaListFields = useMemo(() => {
    if (!meta) {
      return [];
    }
    const flagged = meta.fields.filter((f) => (f.in_list_view ?? 0) !== 0);
    if (flagged.length > 0) {
      return flagged;
    }
    return meta.fields
      .filter((f) => !layoutFieldtypes.has(f.fieldtype) && !f.fieldtype.startsWith('Table'))
      .slice(0, 4);
  }, [meta]);

  const imageFieldName = useMemo(() => {
    if (meta) {
      return meta.image_field ?? meta.fields.find((f) => f.fieldtype === 'Attach Image')?.fieldname;
    }
    return peekedFields?.find((key) => /sprite|image|photo|avatar|logo/iu.test(key));
  }, [meta, peekedFields]);

  const effectiveFields = useMemo(() => {
    if (fields) {
      return fields;
    }
    const listFields: string[] = [];
    if (meta) {
      for (const field of metaListFields) {
        if (field.fieldname !== 'name') {
          listFields.push(field.fieldname);
        }
      }
    } else {
      listFields.push(...(peekedFields ?? []));
    }
    const allFields = ['name', ...listFields];
    if (imageFieldName !== undefined && imageFieldName !== '' && !allFields.includes(imageFieldName)) {
      allFields.push(imageFieldName);
    }
    // SAFETY: the names come from the doctype's meta or a peeked record, so they are fields of TDoc rows
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
    return allFields as (keyof TDoc & string)[];
  }, [fields, meta, metaListFields, peekedFields, imageFieldName]);

  const effectiveDisplayFields = useMemo((): ListFieldConfig[] => {
    if (displayFields) {
      return displayFields;
    }
    if (meta && metaListFields.length > 0) {
      return metaListFields.map((f) => ({
        key: f.fieldname,
        label: f.label ?? f.fieldname,
      }));
    }
    if (peekedFields && peekedFields.length > 0) {
      return peekedFields
        .filter((key) => key !== imageFieldName)
        .slice(0, 4)
        .map((key) => ({ key, label: recordKeyLabel(key) }));
    }
    return [{ key: 'name', label: t('Name') }];
  }, [displayFields, meta, metaListFields, peekedFields, imageFieldName, t]);

  const renderListItem = useCallback(
    (doc: Partial<TDoc>) => {
      const row = rowFields(doc);
      const textFields = effectiveDisplayFields.filter((field) => field.key !== imageFieldName);
      const titleConfig = textFields.at(0);
      const subtitleFields = textFields.slice(1);
      const titleValue = titleConfig === undefined ? undefined : row[titleConfig.key];
      let titleNode: React.ReactNode;
      // oxlint-disable-next-line unicorn/prefer-ternary -- the fallback branch carries a SAFETY-annotated cast a ternary cannot host
      if (titleConfig?.render) {
        titleNode = titleConfig.render(titleValue, doc);
      } else {
        // SAFETY: list cells hold scalars, which React renders as text
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
        titleNode = (titleValue ?? doc.name) as React.ReactNode;
      }
      const subtitleParts: React.ReactNode[] = [];
      for (const field of subtitleFields) {
        const value = row[field.key];
        const rendered: unknown = field.render ? field.render(value, doc) : value;
        if (rendered !== null && rendered !== undefined && rendered !== '') {
          // SAFETY: a cell is a scalar or a renderer's node, both of which React renders
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
          subtitleParts.push(rendered as React.ReactNode);
        }
      }
      const imageUrl =
        imageFieldName === undefined || imageFieldName === '' ? '' : resolveImageUrl(row[imageFieldName], finalBaseURL);

      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- only a plain-string title can name the avatar
      const titleName = typeof titleNode === 'string' ? titleNode : undefined;
      return (
        <XStack
          alignItems="center"
          flex={1}
          minWidth={0}
          width="100%"
          {...knobProps.gap}>
          {imageUrl ? (
            <Avatar
              nested
              circular
              src={imageUrl}
              name={titleName}
              alt={titleName ?? ''}
            />
          ) : null}
          <YStack
            flex={1}
            minWidth={0}>
            <Text
              {...knobProps.body}
              color={componentColors.text.primary}
              numberOfLines={1}
              data-list-slot="title">
              {titleNode}
            </Text>
            {subtitleParts.length > 0 && (
              <Text
                {...knobProps.body}
                color={knobProps.textAccentColor}
                numberOfLines={1}>
                {subtitleParts.map((part, index) => (
                  <React.Fragment key={index}>
                    {index > 0 ? ' · ' : null}
                    {part}
                  </React.Fragment>
                ))}
              </Text>
            )}
          </YStack>
        </XStack>
      );
    },
    [effectiveDisplayFields, imageFieldName, finalBaseURL, knobProps],
  );

  const effectiveColumns = useMemo((): DataTableColumn<Partial<TDoc>>[] => {
    if (columns) {
      return columns;
    }
    if (meta && metaListFields.length > 0) {
      return metaListFields.map(
        (f) =>
          // SAFETY: meta fieldnames are fields of TDoc rows, so each names a TDoc column
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
          ({
            accessorKey: f.fieldname,
            header: f.label ?? f.fieldname,
          }) as DataTableColumn<Partial<TDoc>>,
      );
    }
    if (peekedFields && peekedFields.length > 0) {
      return peekedFields
        .filter((key) => key !== imageFieldName)
        .slice(0, 4)
        .map(
          (key) =>
            // SAFETY: a peeked record's keys are fields of TDoc rows, so each names a TDoc column
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
            ({ accessorKey: key, header: recordKeyLabel(key) }) as DataTableColumn<Partial<TDoc>>,
        );
    }
    // SAFETY: every Frappe row carries `name`
    return [{ accessorKey: 'name', header: t('Name') }] as DataTableColumn<Partial<TDoc>>[];
  }, [columns, meta, metaListFields, peekedFields, imageFieldName, t]);

  const standardFilterFields = useMemo(() => {
    if (!meta) {
      return [];
    }
    return meta.fields.filter((f) => (f.in_standard_filter ?? 0) !== 0);
  }, [meta]);

  const savedFiltersHook = useSavedFilters();

  const [activeFilters, setActiveFilters] = useState(filters);

  // oxlint-disable-next-line react-doctor/no-mirror-prop-effect -- a saved filter replaces activeFilters locally; a new `filters` prop resets them
  useEffect(() => {
    setActiveFilters(filters);
  }, [filters]);

  const effectiveConnections = useMemo(
    () => connections ?? (isMetaLoading ? undefined : connectionsFromMeta(meta)),
    [connections, isMetaLoading, meta],
  );

  const searchField = useMemo(() => {
    if (meta?.title_field !== undefined && meta.title_field !== '') {
      return meta.title_field;
    }
    if (metaListFields.length > 0) {
      return metaListFields[0].fieldname;
    }
    if (peekedFields && peekedFields.length > 0) {
      return peekedFields[0];
    }
    return 'name';
  }, [meta, metaListFields, peekedFields]);

  // The list's controls (sorts, facets, ranges, favorites, shuffle) own a
  // state the filters and order derive from; a list without them keeps the
  // plain search band below and its own view memory.
  const hasCards = Boolean(renderCard ?? look?.images);
  const listControls: FrappeListControls = {
    sorts,
    facets,
    ranges,
    views: hasCards ? ['grid', 'list', 'table'] : ['list', 'table'],
    defaultView: defaultViewMode,
  };
  const controlCount = sorts?.length ?? facets?.length ?? ranges?.length;
  const hasControls = Boolean(controlCount ?? favorites ?? shuffle);
  const favoritesStorageKey = favoritesStorageKeyFor(favorites, doctype);
  const list = useListControls({
    doctype,
    controls: listControls,
    connections: effectiveConnections,
    connection: connectionConfig,
    limit,
    favoritesKey: favoritesStorageKey,
    router: urlState ? router : undefined,
    readBase: Boolean(subtitle ?? facets?.length ?? ranges?.length),
  });
  const updateList = list.update;

  const requestedViewMode = controlledViewMode ?? (urlState ? list.state.view : undefined) ?? viewModeState;
  const viewMode: ListViewMode = requestedViewMode === 'grid' && !hasCards ? 'list' : requestedViewMode;

  const setViewMode = useCallback(
    (mode: ListViewMode) => {
      onViewModeChange?.(mode);
      if (controlledViewMode !== undefined) {
        return;
      }
      if (urlState) {
        updateList({ view: mode });
        return;
      }
      setViewModeState(mode);
      void setStoredViewMode(doctype, mode);
    },
    [doctype, controlledViewMode, onViewModeChange, urlState, updateList],
  );

  const controlsKey = JSON.stringify({
    facets: facets?.map((facet) => [facet.param, facet.field, facet.doctype]),
    ranges: ranges?.map((range) => [range.param, range.field]),
    sorts: sorts?.map((sort) => [sort.value, sort.orderBy]),
  });
  const controlFilters = useMemo(() => {
    if (!hasControls) {
      return activeFilters;
    }
    return listStateFilters(list.state, listControls, {
      base: toFilterRows<TDoc>(activeFilters),
      search: searchFilter ?? ((query) => [[searchField, 'like', `%${query}%`]]),
      favorites: list.favorites.favoriteSet,
    });
    // controlsKey stands for the facet and range definitions listControls carries.
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- see above
  }, [hasControls, activeFilters, list.state, list.favorites.favoriteSet, searchFilter, searchField, controlsKey]);
  let effectiveOrderBy = orderBy;
  if (hasControls) {
    // SAFETY: the list's sorts order by fields of TDoc rows
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
    effectiveOrderBy = listStateOrderBy(list.state, listControls, orderBy) as typeof orderBy;
  }
  // The server page is the unfiltered list in its default order; any other
  // query waits for its own read rather than flash rows it would drop.
  // SAFETY: a list route's loader returns its server page as `{ rows }` of this doctype
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
  const loaded = useRouteLoaderData(loader) as { rows?: readonly Partial<TDoc>[] } | undefined;
  const initialRows = initialRowsProp ?? loaded?.rows;
  const onDefaultSort = sorts === undefined || sorts.length === 0 || list.state.sort === sorts[0].value;
  const seedRows = !hasControls || (!isListNarrowed(list.state) && onDefaultSort) ? initialRows : undefined;

  const linkFilters = useConnectionFilters(
    connectionConfig,
    doctype,
    // SAFETY: control filters are the doctype's own filter rows, the form useConnectionFilters reads
    controlFilters as Parameters<typeof useConnectionFilters>[2],
    effectiveConnections,
  );
  // SAFETY: connection filters only add rows over this doctype's own fields
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
  const resolvedFilters = linkFilters.filters as typeof activeFilters;

  // List-mode search: a debounced server-side `like` on the doctype's title
  // field, merged into the filters useFrappePagination already accepts (the
  // pagination layer has no orFilters plumbing, so one well-chosen field
  // beats none). Table mode keeps DataTable's own client-side global filter.
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const listFilters = useMemo(() => {
    const query = debouncedSearch.trim();
    if (!query) {
      return resolvedFilters;
    }
    // SAFETY: the search field is the doctype's title field or a listed field, a field of TDoc rows
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
    const queryFilter = [searchField, 'like', `%${query}%`] as [keyof TDoc & string, string, unknown];
    if (!resolvedFilters) {
      return [queryFilter];
    }
    if (Array.isArray(resolvedFilters)) {
      return [...resolvedFilters, queryFilter];
    }
    return [
      ...Object.entries(resolvedFilters).map(
        // SAFETY: Object.entries of a Partial<TDoc> yields TDoc's own keys
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
        ([key, value]) => [key, '=', value] as [keyof TDoc & string, string, unknown],
      ),
      queryFilter,
    ];
  }, [resolvedFilters, debouncedSearch, searchField]);

  // Axiom 6 / DG-TBL-06: zero rows under active filters or search must not
  // render the same chrome as a truly empty doctype — the no-results message
  // names the narrowing context so it can't masquerade as empty.
  const hasProvidedFilters = useMemo(() => {
    if (!activeFilters) {
      return false;
    }
    return Array.isArray(activeFilters) ? activeFilters.length > 0 : Object.keys(activeFilters).length > 0;
  }, [activeFilters]);
  const searchQuery = debouncedSearch.trim();
  let noResultsMessage: string | undefined;
  if (searchQuery) {
    noResultsMessage = t('No {{doctype}} records match "{{query}}"', { doctype, query: searchQuery });
  } else if (hasProvidedFilters) {
    noResultsMessage = t('No {{doctype}} records match the active filters', { doctype });
  }

  const [refreshKey, setRefreshKey] = useState(0);
  const handleRefresh = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  const handleSelectSavedFilter = useCallback(
    (filter: ParsedFilter | null) => {
      if (filter) {
        // SAFETY: a saved filter for this list stores this doctype's own filter rows
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
        setActiveFilters(filter.filters as typeof filters);
      } else {
        setActiveFilters(filters);
      }
    },
    [filters],
  );

  const handleDeleteFilter = useCallback(
    async (name: string) => {
      await savedFiltersHook.deleteFilter(name);
    },
    [savedFiltersHook],
  );

  const slug = doctype.toLowerCase().replaceAll(/\s+/gu, '-');
  const searchId = `${slug}-list-search`;
  const resultsId = `${slug}-results`;
  const nameField = titleField ?? meta?.title_field;

  const [shuffleOpen, setShuffleOpen] = useState(false);
  const [shuffleRows, setShuffleRows] = useState<Partial<TDoc>[]>([]);
  const handleShuffleRows = useCallback((snapshot: FrappeRowsSnapshot<TDoc>) => {
    setShuffleRows(snapshot.rows);
  }, []);
  const shuffleOrderKey = JSON.stringify(sorts?.[0]?.orderBy ?? orderBy ?? null);
  const shuffleFiltersKey = JSON.stringify(resolvedFilters ?? null);
  const shuffleFieldsKey = JSON.stringify(effectiveFields);
  const shuffleOptions = useMemo(
    () => ({
      // oxlint-disable-next-line typescript/no-unsafe-assignment -- each key is the JSON of the value it restores
      fields: JSON.parse(shuffleFieldsKey),
      // oxlint-disable-next-line typescript/no-unsafe-assignment -- each key is the JSON of the value it restores
      filters: JSON.parse(shuffleFiltersKey) ?? undefined,
      // oxlint-disable-next-line typescript/no-unsafe-assignment -- each key is the JSON of the value it restores
      orderBy: JSON.parse(shuffleOrderKey) ?? undefined,
      limit: limit ?? 0,
    }),
    [shuffleFieldsKey, shuffleFiltersKey, shuffleOrderKey, limit],
  );

  const { isFavorite, toggle: toggleStar } = list.favorites;
  const toggleFavorite = useCallback(
    (doc: Partial<TDoc>) => {
      const { name } = doc;
      if (name === undefined || name === '') {
        return;
      }
      const starred = isFavorite(name);
      toggleStar(name);
      const titleValue = nameField === undefined || nameField === '' ? undefined : rowFields(doc)[nameField];
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- list rows are untyped server JSON; only a non-empty string titles the toast
      const label = typeof titleValue === 'string' && titleValue !== '' ? titleValue : name;
      showToast(
        starred
          ? {
              id: `${slug}-favorite-${name}`,
              title: t('{{name}} removed from favorites', { name: label }),
              intent: 'accent',
              action: {
                label: t('Undo'),
                onPress: () => {
                  toggleStar(name);
                },
              },
            }
          : {
              id: `${slug}-favorite-${name}`,
              title: t('{{name}} added to favorites', { name: label }),
              intent: 'success',
            },
      );
    },
    [isFavorite, toggleStar, nameField, slug, t],
  );

  const cardFor = (doc: Partial<TDoc>): FrappeListCard => {
    const name = doc.name ?? '';
    const row = rowFields(doc);
    const facetValues = (facet: FrappeListFacet): string[] => {
      if (facet.doctype !== undefined && facet.doctype !== '') {
        return list.facets[facet.param]?.values.get(name) ?? [];
      }
      const value = row[facet.field];
      // oxlint-disable-next-line typescript/no-base-to-string -- facet fields are scalars; String() matches the facet's option values
      return value == null ? [] : [String(value)];
    };
    return {
      href: route !== undefined && name !== '' ? frappeRouteHref(route, { mode: 'view', name }) : undefined,
      open: () => onItemClick?.(doc),
      facets: Object.fromEntries((facets ?? []).map((facet) => [facet.param, facetValues(facet)])),
      favorite:
        favoritesStorageKey !== undefined && favoritesStorageKey !== '' && name !== ''
          ? {
              active: isFavorite(name),
              toggle: () => {
                toggleFavorite(doc);
              },
            }
          : undefined,
    };
  };
  const tintFacet = facets?.find((facet) => facet.tint);
  const drawRecordCard = (doc: Partial<TDoc>, index: number) => {
    const card = cardFor(doc);
    const name = doc.name ?? '';
    const values = tintFacet ? (card.facets[tintFacet.param] ?? []) : [];
    const cardTitle = recordTitle(doc, look, nameField);
    return (
      <RecordCard
        title={cardTitle}
        subtitle={look?.subtitle?.(doc)}
        code={look?.code?.(doc)}
        images={look?.images?.(doc, finalBaseURL) ?? []}
        tints={values.slice(0, 2).map((value) => tintFacet?.tint?.(value))}
        badges={values.map((value) => ({
          value,
          label: tintFacet?.optionLabel?.(value) ?? value,
          tint: tintFacet?.tint?.(value),
        }))}
        href={card.href}
        onPress={() => {
          card.open();
        }}
        favorite={card.favorite}
        lazy={index >= eagerCards}
        testID={`${slug}-card-${name}`}
        favoriteTestID={`${slug}-favorite-${name}`}
      />
    );
  };
  let drawCard: ((doc: Partial<TDoc>, index: number) => React.ReactNode) | undefined;
  if (renderCard) {
    // oxlint-disable-next-line typescript/promise-function-async -- ReactNode's type admits a Promise; renderCard returns an element
    drawCard = (doc: Partial<TDoc>, index: number) => renderCard(doc, index, cardFor(doc));
  } else if (look?.images) {
    drawCard = drawRecordCard;
  }

  // "/" jumps to the search box on web, the common list-page affordance.
  // Document scope adds no tab stop (LC-49); it stands down while the reader
  // types in any editable control or works inside an open overlay.
  useEffect(() => {
    if (!isWeb || typeof document === 'undefined' || !showSearch) {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (event.defaultPrevented) {
        return;
      }
      // SAFETY: keydown targets on the document are elements (or null)
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
          return;
        }
        if (target.isContentEditable) {
          return;
        }
        if (target.closest?.('[role="dialog"], [role="menu"], [role="listbox"]')) {
          return;
        }
      }
      const input = document.querySelector(`#${searchId}`)?.querySelector('input');
      if (!input) {
        return;
      }
      event.preventDefault();
      input.focus();
      input.select?.();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [searchId, showSearch]);

  const headerOwnsTools = route !== undefined && !showToolbar;
  const pressFor = (action: FrappeListAction) => {
    if (action.onPress) {
      return action.onPress;
    }
    const { href } = action;
    return href !== undefined && href !== '' && navigate
      ? () => {
          navigate(href);
        }
      : undefined;
  };
  const hasHeaderActions = headerOwnsTools || Boolean(headerAccessory) || (actions !== undefined && actions.length > 0);
  const headerActions = hasHeaderActions ? (
    <XStack
      {...knobProps.gap}
      alignItems="center"
      flexWrap="wrap"
      flexShrink={1}
      minWidth={0}>
      {headerOwnsTools ? (
        <Tooltip content={t('Switch views')}>
          <XStack>
            <ViewSwitcher
              views={[
                ...(hasCards ? [{ type: 'grid', label: t('Cards'), icon: ImageIcon }] : []),
                { type: 'list', label: t('List'), icon: ListIcon },
                { type: 'table', label: t('Table'), icon: TableIcon },
              ]}
              currentView={viewMode}
              onViewChange={(v) => {
                // SAFETY: the switcher only offers the ListViewMode views listed above
                // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
                setViewMode(v as ListViewMode);
              }}
            />
          </XStack>
        </Tooltip>
      ) : null}
      {headerAccessory}
      {actions?.map((action) => {
        const Icon = action.icon;
        const onPress = pressFor(action);
        return (
          <React.Fragment key={action.label}>
            <Tooltip content={action.hint ?? action.label}>
              <Button
                outlined
                onPress={onPress}
                icon={Icon ? <Icon size={16} /> : undefined}
                $max-sm={{ display: 'none' }}
                testID={action.testID}>
                {action.label}
              </Button>
            </Tooltip>
            <Button
              outlined
              circular
              onPress={onPress}
              icon={Icon ? <Icon size={16} /> : undefined}
              display="none"
              aria-label={action.label}
              $max-sm={{ display: 'flex' }}
            />
          </React.Fragment>
        );
      })}
      {headerOwnsTools && onAdd ? (
        <>
          <Button
            theme="accent"
            onPress={onAdd}
            icon={<PlusIcon size={16} />}
            $max-sm={{ display: 'none' }}>
            {t('Add {{doctype}}', { doctype })}
          </Button>
          <Button
            theme="accent"
            onPress={onAdd}
            icon={<PlusIcon size={16} />}
            display="none"
            $max-sm={{ display: 'flex' }}>
            {t('Add')}
          </Button>
        </>
      ) : null}
    </XStack>
  ) : undefined;

  const hasShuffleRows = shuffleOpen && shuffleRows.length > 0;
  const controlsBand = hasControls ? (
    <ListControls
      controls={listControls}
      list={list}
      searchId={searchId}
      searchPlaceholder={searchPlaceholder}
      showSearch={showSearch}
      showFavorites={Boolean(favoritesStorageKey)}
      shuffle={
        shuffle
          ? {
              open: shuffleOpen,
              toggle: () => {
                setShuffleOpen((open) => !open);
              },
              panelId: `${slug}-shuffle-panel`,
            }
          : undefined
      }
      shufflePanel={
        shuffle && hasShuffleRows && drawCard ? (
          <ShufflePanel<Partial<TDoc>>
            id={`${slug}-shuffle-panel`}
            label={t('Surprise me')}
            rows={shuffleRows}
            itemLabel={shuffle.label}
            // oxlint-disable-next-line typescript/promise-function-async -- ReactNode's type admits a Promise; drawCard returns an element
            renderPick={(doc) => drawCard(doc, 0)}
            onGo={(doc) => {
              setShuffleOpen(false);
              onItemClick?.(doc);
            }}
            testID={`${slug}-shuffle-panel`}
          />
        ) : null
      }
      separator={!surface}
      testID={slug}
    />
  ) : null;

  const asPage = (view: React.ReactElement) => {
    const extras = (
      <>
        {list.readers}
        {shuffle && shuffleOpen && !linkFilters.pending ? (
          <FrappeRowsReader<TDoc>
            connection={connectionConfig}
            doctype={doctype}
            // SAFETY: shuffleOptions restores the same fields / filters / orderBy the list itself reads with
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
            options={shuffleOptions as never}
            onChange={handleShuffleRows}
          />
        ) : null}
        {favoritesStorageKey !== undefined && favoritesStorageKey !== '' ? <ListToastHost /> : null}
      </>
    );
    if (route === undefined) {
      return controlsBand ? (
        <YStack
          {...knobProps.gap}
          flex={viewMode === 'grid' ? undefined : 1}>
          {controlsBand}
          {view}
          {extras}
        </YStack>
      ) : (
        <>
          {view}
          {extras}
        </>
      );
    }
    return (
      <ListPageLayout
        scroll={!surface}
        header={
          <>
            {controlsBand ? <SkipLink targetId={resultsId}>{t('Skip to results')}</SkipLink> : null}
            <PageHeader
              title={title ?? doctype}
              subtitle={subtitle && list.total !== undefined ? subtitle(list.total) : undefined}
              actions={headerActions}
              divider={!surface}
            />
          </>
        }
        toolbar={controlsBand ?? undefined}>
        {view}
        {extras}
      </ListPageLayout>
    );
  };

  const listNarrowed = isListNarrowed(list.state);
  const listSearch = list.state.search.trim();
  const controlsEmptyIcon = () => {
    if (list.state.favoritesOnly) {
      return <HeartIcon size={28} />;
    }
    return listNarrowed ? <MagnifyingGlassIcon size={28} /> : <SparkleIcon size={28} />;
  };
  const controlsEmptyTitle = () => {
    if (list.state.favoritesOnly) {
      return t('No favorites yet');
    }
    if (listSearch) {
      return t('No match for "{{query}}"', { query: listSearch });
    }
    return listNarrowed
      ? t('No {{doctype}} match the active filters', { doctype })
      : t('No {{doctype}} yet', { doctype });
  };
  const controlsEmptyDescription = () => {
    if (list.state.favoritesOnly) {
      return t('Tap the heart on a record to favorite it.');
    }
    return listNarrowed ? t('Try a different search or filter.') : undefined;
  };
  const controlsEmptyAction = () => {
    if (listNarrowed) {
      return (
        <Button
          outlined
          onPress={() => {
            list.clear();
          }}>
          {t('Clear filters')}
        </Button>
      );
    }
    return onAdd ? (
      <Button
        theme="accent"
        onPress={onAdd}>
        {t('Add your first {{doctype}}', { doctype })}
      </Button>
    ) : undefined;
  };
  const controlsEmptyState = hasControls ? (
    <EmptyState
      aria-live="polite"
      icon={controlsEmptyIcon()}
      title={controlsEmptyTitle()}
      description={controlsEmptyDescription()}
      action={controlsEmptyAction()}
    />
  ) : undefined;

  // Named fields need no schema to read or draw: the view renders now (on
  // the server too) and labels settle when meta lands.
  if (isMetaLoading && !fields) {
    return asPage(
      <YStack
        {...knobProps.panelPadding}
        alignItems="center"
        justifyContent="center"
        gap="$2"
        {...stackProps}>
        <Spinner size="large" />
        <Text
          {...knobProps.body}
          color={knobProps.textAccentColor}>
          {t('Loading {{doctype}} schema...', { doctype })}
        </Text>
      </YStack>,
    );
  }

  const renderToolbar = () => {
    if (!showToolbar) {
      return null;
    }

    return (
      <XStack
        {...knobProps.panelPadding}
        alignItems="center"
        justifyContent="space-between"
        // Frame owns SF-CARD; this band is flattened (zero box border, one
        // bottom hairline) so it does not paint a second surface.
        borderWidth={0}
        borderBottomWidth={1}
        borderBottomColor="$borderColor">
        <XStack
          alignItems="center"
          {...knobProps.gap}>
          <ViewSwitcher
            views={[
              ...(hasCards ? [{ type: 'grid', label: t('Cards') }] : []),
              { type: 'list', label: t('List') },
              { type: 'table', label: t('Table') },
            ]}
            currentView={viewMode}
            onViewChange={(v) => {
              // SAFETY: the switcher only offers the ListViewMode views listed above
              // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
              setViewMode(v as ListViewMode);
            }}
          />
        </XStack>

        <XStack
          alignItems="center"
          {...knobProps.gap}>
          {/* LC-54 (amendment 2026-08-13): house Button, own-box floor — the
              raw tamagui Button + grown transparent target painted its hover
              fill across the escaped 44px floor. `circular` makes the painted
              box ITSELF the 44×44 control (box-is-control mechanism), so
              feedback stays inside its own layout slot. */}
          <Button
            size="$2"
            circular
            chromeless
            icon={ArrowsClockwiseIcon}
            onPress={handleRefresh}
            aria-label={t('Refresh')}
          />
          {onAdd && (
            <Button
              size="$3"
              theme="accent"
              icon={PlusIcon}
              onPress={onAdd}
              {...pressTargetStyle()}>
              {t('Add {{doctype}}', { doctype })}
            </Button>
          )}
        </XStack>
      </XStack>
    );
  };

  const renderFilterSidebar = () => {
    if (!showFilterSidebar) {
      return null;
    }
    const edge: unknown = theme.borderColor?.get();
    const webSidebarBorder = {
      // SAFETY: borderInline* are web CSS logical properties RN's style type does not declare; tamagui forwards them to the DOM
      // oxlint-disable-next-line typescript/no-explicit-any, typescript/no-unsafe-type-assertion, typescript/no-unsafe-assignment -- see SAFETY above
      style: { borderInlineEndWidth: 1, borderInlineEndStyle: 'solid', borderInlineEndColor: edge } as any,
    };

    return (
      <YStack
        width={220}
        // Frame owns SF-CARD; sidebar is a flattened band (inline-end
        // hairline only). Web uses inline style so the CSS logical props
        // beat physical border-right-width:0 from the borderWidth expansion
        // (tamagui borderEndWidth does not compile to working CSS, SB-M-1215).
        borderWidth={0}
        {...(isWeb ? webSidebarBorder : { borderEndWidth: 1, borderEndColor: '$borderColor' })}
        {...knobProps.panelPadding}
        {...knobProps.gap}>
        <Text
          {...knobProps.label}
          color={knobProps.textAccentColor}>
          {t('Filters')}
        </Text>
        {standardFilterFields.length > 0 && (
          <YStack {...knobProps.gap}>
            {standardFilterFields.map((field) => (
              <YStack
                key={field.fieldname}
                {...knobProps.gap}>
                <Text
                  {...knobProps.label}
                  color={knobProps.textAccentColor}>
                  {field.label ?? field.fieldname}
                </Text>
                <Text
                  {...knobProps.body}
                  color={knobProps.textAccentColor}>
                  {field.fieldtype === 'Select' ? (field.options ?? '—') : '—'}
                </Text>
              </YStack>
            ))}
          </YStack>
        )}
        {savedFiltersHook.filters.length > 0 && (
          <YStack {...knobProps.gap}>
            <Text
              {...knobProps.label}
              color={knobProps.textAccentColor}>
              {t('Saved Filters')}
            </Text>
            <SavedFilterDropdown
              filters={savedFiltersHook.filters}
              selectedFilter={null}
              onSelectFilter={handleSelectSavedFilter}
              onDeleteFilter={(name) => {
                void handleDeleteFilter(name);
              }}
            />
          </YStack>
        )}
      </YStack>
    );
  };

  // Catalog SearchInput (census item 6) so list and table mode search share
  // one control anatomy; it owns the debounce that drives the server `like`.
  const renderListSearch = () => (
    <XStack
      alignItems="center"
      {...knobProps.panelPadding}
      borderBottomWidth={1}
      borderBottomColor="$borderColor">
      <View
        flex={1}
        id={searchId}>
        <SearchInput
          value={searchText}
          onChange={setSearchText}
          onSearch={setDebouncedSearch}
          debounceMs={300}
          placeholder={t('Search...')}
          aria-label={t('Search {{doctype}}', { doctype })}
          compact
          size="$3"
        />
      </View>
    </XStack>
  );

  const renderContent = () => {
    if (viewMode === 'list' || viewMode === 'grid') {
      const isGrid = viewMode === 'grid';
      return (
        <YStack flex={isGrid ? undefined : 1}>
          {showSearch && !hasControls ? renderListSearch() : null}
          <FrappeList
            key={`${viewMode}-${refreshKey}`}
            layout={isGrid ? 'grid' : 'list'}
            gridProps={gridProps}
            emptyState={emptyState ?? controlsEmptyState}
            pageSize={pageSize}
            onRetry={onRetry ?? handleRefresh}
            doctype={doctype}
            // SAFETY: FrappeList is instantiated at the base doc type (generic JSX breaks one's source transform); the TDoc fields, filters, renderers and click handler all describe the same rows
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
            fields={effectiveFields as readonly ('name' | 'doctype')[]}
            // SAFETY: see the FrappeList instantiation note above
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
            filters={listFilters as Partial<{ name: string; doctype: string }>}
            renderItem={
              // SAFETY: see the FrappeList instantiation note above
              // oxlint-disable-next-line anti-slop/no-chained-type-assertions, typescript/no-unsafe-type-assertion -- see SAFETY above
              (isGrid && drawCard ? drawCard : renderListItem) as unknown as (
                item: Partial<{ name: string; doctype: string }>,
                index: number,
              ) => React.ReactNode
            }
            onItemClick={
              // SAFETY: see the FrappeList instantiation note above
              // oxlint-disable-next-line anti-slop/no-chained-type-assertions, typescript/no-unsafe-type-assertion -- see SAFETY above
              onItemClick as unknown as ((item: Partial<{ name: string; doctype: string }>) => void) | undefined
            }
            baseURL={finalBaseURL}
            auth={finalAuth}
            syncOptions={finalSyncOptions}
            // SAFETY: see the FrappeList instantiation note above
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
            orderBy={effectiveOrderBy as FrappeListProps<{ name: string; doctype: string }>['orderBy']}
            limit={limit}
            // SAFETY: see the FrappeList instantiation note above
            initialRows={seedRows as FrappeListProps<{ name: string; doctype: string }>['initialRows']}
            // Only override when narrowing is active: FrappeList's own
            // "No {doctype} records found" stays the true-empty message.
            {...(noResultsMessage === undefined ? {} : { emptyMessage: noResultsMessage })}
          />
        </YStack>
      );
    }

    return (
      <FrappeTable
        key={`table-${refreshKey}`}
        doctype={doctype}
        fields={effectiveFields}
        // SAFETY: FrappeTable reads the same TDoc filter rows; its prop type omits the doctype-scoped connection form
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
        filters={resolvedFilters as Parameters<typeof FrappeTable<TDoc>>[0]['filters']}
        columns={effectiveColumns}
        onRowClick={onItemClick}
        rights={rights}
        baseURL={finalBaseURL}
        auth={finalAuth}
        syncOptions={finalSyncOptions}
      />
    );
  };

  // A connection filter's matching records are known only once its linked
  // rows are read; until then the view waits instead of listing everything.
  const renderResolvedContent = () => {
    if (linkFilters.error) {
      return (
        <AsyncBoundary
          layout="list"
          error={linkFilters.error}
          errorTitle={
            isPermissionError(linkFilters.error)
              ? t('You do not have permission to view {{doctype}}', { doctype })
              : t('Error loading {{doctype}}', { doctype })
          }
        />
      );
    }
    if (linkFilters.pending) {
      return (
        <AsyncBoundary
          layout="list"
          loading
        />
      );
    }
    return renderContent();
  };

  return asPage(
    <YStack
      flex={viewMode === 'grid' ? undefined : 1}
      {...(surface ? knobProps.surface : {})}
      {...(surface ? knobProps.containerRadius : {})}
      overflow={surface ? 'hidden' : undefined}
      testID={`${doctype.toLowerCase()}-list`}
      {...(hasControls ? { id: resultsId } : {})}
      {...stackProps}>
      {renderToolbar()}
      {linkFilters.readers}
      {showFilterSidebar ? (
        <XStack flex={1}>
          {renderFilterSidebar()}
          <YStack flex={1}>{renderResolvedContent()}</YStack>
        </XStack>
      ) : (
        renderResolvedContent()
      )}
    </YStack>,
  );
};

/**
 * Unified list/table view for a Frappe DocType.
 *
 * Delegates to `FrappeList` (which delegates to generic `List`) or
 * `FrappeTable` (which delegates to `DataTable`) based on the view mode.
 * With neither a bench URL nor a fixture corpus it says Frappe is not
 * configured.
 */
export const FrappeListView = <TDoc extends { name: string; doctype: string }>(props: FrappeListViewProps<TDoc>) => {
  const config = useFrappeConfig();
  const baseURL = props.baseURL ?? config?.baseURL;
  if ((baseURL === undefined || baseURL === '') && !config?.fixtures) {
    return (
      <FrappeNotConfigured
        doctype={props.doctype}
        page={props.route !== undefined}
      />
    );
  }
  return <FrappeListViewBody<TDoc> {...props} />;
};
