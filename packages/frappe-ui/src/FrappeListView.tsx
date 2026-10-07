import { useDocTypeMeta } from "@repo/frappe";
import { type DataTableColumn,SavedFilterDropdown,useSavedFilters,type ParsedFilter } from "@repo/table";
import {
  ArrowsClockwiseIcon,
  HeartIcon,
  ImageIcon,
  ListIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  SparkleIcon,
  TableIcon,
} from "@phosphor-icons/react";
import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Button, SearchInput, Spinner } from "@repo/forms";
import { Text, View, XStack, YStack, isWeb, useTheme, type YStackProps } from "tamagui";
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
  type ImageGridProps,
} from "@repo/ui";
import { pressTargetStyle, useResolvedKnobs } from "@repo/theme";
import { storage } from "@repo/store";
import { useFrappeConfig } from "./FrappeProvider";
import { FrappeList } from './FrappeList';
import type { FrappeListProps } from './FrappeList';
import { FrappeNotConfigured } from "./FrappeNotConfigured";
import { FrappeRowsReader } from './FrappeRowsReader';
import type { FrappeRowsSnapshot } from './FrappeRowsReader';
import { FrappeTable } from "./FrappeTable";
import { useDocRights } from "./formEngine/useDocRights";
import { frappeRouteHref, useFrappeRouter, useRouteLoaderData } from "./frappeNavigation";
import { connectionsFromMeta } from './frappeConnections';
import type { FrappeConnection } from './frappeConnections';
import { isPermissionError } from "./liveErrors";
import { favoritesKey } from "./list/favorites";
import { RecordCard } from "./list/RecordCard";
import { recordTitle } from './list/recordLook';
import type { FrappeRecordLook } from './list/recordLook';
import { ListControls } from "./list/ListControls";
import { isListNarrowed, listStateFilters, listStateOrderBy } from './list/listState';
import type { FrappeListControls, FrappeListFacet, FrappeListFilter, FrappeListRange, FrappeListSort } from './list/listState';
import { ListToastHost } from "./list/ListToastHost";
import { ShufflePanel } from "./list/ShufflePanel";
import { useListControls } from "./list/useListControls";
import { recordKeyLabel, useRecordShape } from "./recordShape";
import { useConnectionFilters } from './useConnectionFilters';
import type { FrappeDoctypeFilter } from './useConnectionFilters';

interface ListFieldConfig {
  key: string;
  label?: string;
  render?: (value: any, doc: any) => React.ReactNode;
}

export type ListViewMode = "list" | "table" | "grid";

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
  "children"
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
  orderBy?: FrappeListProps<TDoc>["orderBy"];
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
  gridProps?: Pick<ImageGridProps<Partial<TDoc>>, "columns" | "tileSize" | "mediaAspect">;
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
  syncOptions?: Record<string, unknown>;
}

const storageKeyPrefix = "frappe-listview-";

/** Cards whose images load eagerly; the rest wait until they near the viewport. */
const eagerCards = 6;

// Fieldtypes that structure a form but hold no listable value.
const layoutFieldtypes = new Set([
  "Column Break",
  "Section Break",
  "Tab Break",
  "HTML",
  "Heading",
  "Fold",
  "Button",
]);

/**
 * Resolves an image field value to a full URL.
 */
function resolveImageUrl(value: unknown, baseURL: string): string {
  if (!value || typeof value !== "string") {return "";}
  if (value.startsWith("http://") || value.startsWith("https://")) {return value;}
  if (value.startsWith("/")) {return `${baseURL}${value}`;}
  return value;
}

async function getStoredViewMode(doctype: string): Promise<ListViewMode | null> {
  try {
    const stored = await Promise.resolve(storage.getItem(`${storageKeyPrefix}${doctype}`));
    if (stored === "list" || stored === "table" || stored === "grid") {return stored;}
  } catch {
    // storage not available
  }
  return null;
}

async function setStoredViewMode(doctype: string, mode: ListViewMode): Promise<void> {
  try {
    await Promise.resolve(storage.setItem(`${storageKeyPrefix}${doctype}`, mode));
  } catch {
    // storage not available
  }
}

/**
 * Unified list/table view for a Frappe DocType.
 *
 * Delegates to `FrappeList` (which delegates to generic `List`) or
 * `FrappeTable` (which delegates to `DataTable`) based on the view mode.
 * With neither a bench URL nor a fixture corpus it says Frappe is not
 * configured.
 */
export function FrappeListView<TDoc extends { name: string; doctype: string }>(
  props: FrappeListViewProps<TDoc>,
) {
  const config = useFrappeConfig();
  if (!(props.baseURL ?? config?.baseURL) && !config?.fixtures) {
    return <FrappeNotConfigured doctype={props.doctype} page={props.route !== undefined} />;
  }
  return <FrappeListViewBody<TDoc> {...props} />;
}

function FrappeListViewBody<TDoc extends { name: string; doctype: string }>({
  doctype,
  fields,
  connections,
  filters,
  defaultViewMode = "list",
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
}: FrappeListViewProps<TDoc>) {
  const config = useFrappeConfig();
  const router = useFrappeRouter();
  const navigate = router?.navigate;
  const { knobProps } = useResolvedKnobs();
  const { t } = useTranslation();
  const theme = useTheme();

  const finalBaseURL = baseURL ?? config?.baseURL;
  const finalAuth = auth ?? config?.auth;
  const finalSyncOptions = syncOptions ?? config?.syncOptions;

  if (!finalBaseURL) {
    throw new Error("FrappeListView requires baseURL prop or FrappeProvider with baseURL");
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

  const [storedViewMode, setViewModeState] = useState<ListViewMode>(defaultViewMode);

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

  const {
    meta,
    isLoading: isMetaLoading,
    error: metaError,
  } = useDocTypeMeta(connectionConfig, doctype);

  const onItemClick =
    onItemClickProp ??
    (route !== undefined && navigate
      ? (doc: Partial<TDoc>) => {
          if (doc.name) {navigate(frappeRouteHref(route, { mode: "view", name: doc.name }));}
        }
      : undefined);
  const { rights } = useDocRights(connectionConfig, meta);
  const onAdd = rights.create
    ? (onAddProp ??
      (route !== undefined && navigate
        ? () =>{  navigate(frappeRouteHref(route, { mode: "create" })); }
        : undefined))
    : undefined;
  // Meta refused (Guest gets 403) while the rows are readable: the views
  // take their fields from one record instead of collapsing to Name (LC-96).
  const recordShape = useRecordShape(
    connectionConfig,
    doctype,
    !meta && !isMetaLoading && Boolean(metaError),
  );
  const peekedFields = useMemo(
    () => recordShape.fields?.map((field) => field.fieldname) ?? null,
    [recordShape.fields],
  );

  // List-view fields: prefer the doctype's in_list_view flags; when a doctype
  // declares none, lead with its first data fields so the list/table still
  // render something useful out of the box.
  const metaListFields = useMemo(() => {
    if (!meta) {return [];}
    const flagged = meta.fields.filter((f) => f.in_list_view);
    if (flagged.length > 0) {return flagged;}
    return meta.fields
      .filter((f) => !layoutFieldtypes.has(f.fieldtype) && !f.fieldtype.startsWith("Table"))
      .slice(0, 4);
  }, [meta]);

  const imageFieldName = useMemo(() => {
    if (meta) {
      return meta.image_field ?? meta.fields.find((f) => f.fieldtype === "Attach Image")?.fieldname;
    }
    return peekedFields?.find((key) => /sprite|image|photo|avatar|logo/i.test(key));
  }, [meta, peekedFields]);

  const effectiveFields = useMemo(() => {
    if (fields) {return fields;}
    const listFields = meta
      ? metaListFields.map((f) => f.fieldname).filter((f) => f !== "name")
      : (peekedFields ?? []);
    const allFields = ["name", ...listFields] as (keyof TDoc & string)[];
    if (imageFieldName && !allFields.includes(imageFieldName as keyof TDoc & string)) {
      allFields.push(imageFieldName as keyof TDoc & string);
    }
    return allFields;
  }, [fields, meta, metaListFields, peekedFields, imageFieldName]);

  const effectiveDisplayFields = useMemo((): ListFieldConfig[] => {
    if (displayFields) {return displayFields;}
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
    return [{ key: "name", label: t("Name") }];
  }, [displayFields, meta, metaListFields, peekedFields, imageFieldName, t]);

  const renderListItem = useCallback(
    (doc: Partial<TDoc>) => {
      const row = doc as Record<string, unknown>;
      const textFields = effectiveDisplayFields.filter((field) => field.key !== imageFieldName);
      const [titleField, ...subtitleFields] = textFields;
      const titleValue = titleField ? row[titleField.key] : undefined;
      const title = titleField?.render
        ? titleField.render(titleValue, doc)
        : ((titleValue ?? doc.name) as React.ReactNode);
      const subtitleParts = subtitleFields
        .map((field) => {
          const value = row[field.key];
          const rendered = field.render ? field.render(value, doc) : value;
          return rendered === null || rendered === undefined || rendered === ""
            ? null
            : (rendered as React.ReactNode);
        })
        .filter((part) => part !== null);
      const imageUrl = imageFieldName ? resolveImageUrl(row[imageFieldName], finalBaseURL) : "";

      const titleName = typeof title === "string" ? title : undefined;
      return (
        <XStack alignItems="center" flex={1} minWidth={0} width="100%" {...knobProps.gap}>
          {imageUrl ? (
            <Avatar nested circular src={imageUrl} name={titleName} alt={titleName ?? ""} />
          ) : null}
          <YStack flex={1} minWidth={0}>
            <Text
              {...knobProps.body}
              color={componentColors.text.primary}
              numberOfLines={1}
              {...({ "data-list-slot": "title" } as Record<string, unknown>)}
            >
              {title}
            </Text>
            {subtitleParts.length > 0 && (
              <Text {...knobProps.body} color={knobProps.textAccentColor} numberOfLines={1}>
                {subtitleParts.map((part, index) => (
                  <React.Fragment key={index}>
                    {index > 0 ? " · " : null}
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
    if (columns) {return columns;}
    if (meta && metaListFields.length > 0) {
      return metaListFields.map(
        (f) =>
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
            ({ accessorKey: key, header: recordKeyLabel(key) }) as DataTableColumn<Partial<TDoc>>,
        );
    }
    return [{ accessorKey: "name" as string, header: t("Name") }] as DataTableColumn<
      Partial<TDoc>
    >[];
  }, [columns, meta, metaListFields, peekedFields, imageFieldName, t]);

  const standardFilterFields = useMemo(() => {
    if (!meta) {return [];}
    return meta.fields.filter((f) => f.in_standard_filter);
  }, [meta]);

  const savedFiltersHook = useSavedFilters();

  const [activeFilters, setActiveFilters] = useState(filters);

  useEffect(() => {
    setActiveFilters(filters);
  }, [filters]);

  const effectiveConnections = useMemo(
    () => connections ?? (isMetaLoading ? undefined : connectionsFromMeta(meta)),
    [connections, isMetaLoading, meta],
  );

  const searchField = useMemo(() => {
    if (meta?.title_field) {return meta.title_field;}
    if (metaListFields.length > 0) {return metaListFields[0].fieldname;}
    if (peekedFields && peekedFields.length > 0) {return peekedFields[0];}
    return "name";
  }, [meta, metaListFields, peekedFields]);

  // The list's controls (sorts, facets, ranges, favorites, shuffle) own a
  // state the filters and order derive from; a list without them keeps the
  // plain search band below and its own view memory.
  const hasCards = Boolean(renderCard ?? look?.images);
  const listControls: FrappeListControls = {
    sorts,
    facets,
    ranges,
    views: hasCards ? ["grid", "list", "table"] : ["list", "table"],
    defaultView: defaultViewMode,
  };
  const hasControls = Boolean(
    ((sorts?.length ?? facets?.length) ?? ranges?.length) || favorites ?? shuffle,
  );
  const favoritesStorageKey = favorites
    ? typeof favorites === "string"
      ? favorites
      : favoritesKey(doctype)
    : undefined;
  const list = useListControls({
    doctype,
    controls: listControls,
    connections: effectiveConnections,
    connection: connectionConfig,
    limit,
    favoritesKey: favoritesStorageKey,
    router: urlState ? router : undefined,
    readBase: Boolean((subtitle ?? facets?.length) ?? ranges?.length),
  });
  const updateList = list.update;

  const requestedViewMode =
    controlledViewMode ?? (urlState ? list.state.view : undefined) ?? storedViewMode;
  const viewMode: ListViewMode =
    requestedViewMode === "grid" && !hasCards ? "list" : requestedViewMode;

  const setViewMode = useCallback(
    (mode: ListViewMode) => {
      onViewModeChange?.(mode);
      if (controlledViewMode !== undefined) {return;}
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
    if (!hasControls) {return activeFilters;}
    const base = activeFilters
      ? Array.isArray(activeFilters)
        ? activeFilters
        : Object.entries(activeFilters).map(([field, value]) => [field, "=", value])
      : [];
    return listStateFilters(list.state, listControls, {
      base: base as FrappeListFilter[],
      search: searchFilter ?? ((query) => [[searchField, "like", `%${query}%`]]),
      favorites: list.favorites.favoriteSet,
    });
    // controlsKey stands for the facet and range definitions listControls carries.
  }, [
    hasControls,
    activeFilters,
    list.state,
    list.favorites.favoriteSet,
    searchFilter,
    searchField,
    controlsKey,
  ]);
  const effectiveOrderBy = hasControls
    ? (listStateOrderBy(list.state, listControls, orderBy) as typeof orderBy)
    : orderBy;
  // The server page is the unfiltered list in its default order; any other
  // query waits for its own read rather than flash rows it would drop.
  const loaded = useRouteLoaderData(loader) as { rows?: readonly Partial<TDoc>[] } | undefined;
  const initialRows = initialRowsProp ?? loaded?.rows;
  const seedRows =
    !hasControls ||
    (!isListNarrowed(list.state) && (!sorts?.length || list.state.sort === sorts[0].value))
      ? initialRows
      : undefined;

  const linkFilters = useConnectionFilters(
    connectionConfig,
    doctype,
    controlFilters as Parameters<typeof useConnectionFilters>[2],
    effectiveConnections,
  );
  const resolvedFilters = linkFilters.filters as typeof activeFilters;

  // List-mode search: a debounced server-side `like` on the doctype's title
  // field, merged into the filters useFrappePagination already accepts (the
  // pagination layer has no orFilters plumbing, so one well-chosen field
  // beats none). Table mode keeps DataTable's own client-side global filter.
  const [searchText, setSearchText] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const listFilters = useMemo(() => {
    const query = debouncedSearch.trim();
    if (!query) {return resolvedFilters;}
    const searchFilter = [searchField, "like", `%${query}%`] as [
      keyof TDoc & string,
      string,
      unknown,
    ];
    if (!resolvedFilters) {return [searchFilter];}
    if (Array.isArray(resolvedFilters)) {return [...resolvedFilters, searchFilter];}
    return [
      ...Object.entries(resolvedFilters).map(
        ([key, value]) => [key, "=", value] as [keyof TDoc & string, string, unknown],
      ),
      searchFilter,
    ];
  }, [resolvedFilters, debouncedSearch, searchField]);

  // Axiom 6 / DG-TBL-06: zero rows under active filters or search must not
  // render the same chrome as a truly empty doctype — the no-results message
  // names the narrowing context so it can't masquerade as empty.
  const hasProvidedFilters = useMemo(() => {
    if (!activeFilters) {return false;}
    return Array.isArray(activeFilters)
      ? activeFilters.length > 0
      : Object.keys(activeFilters).length > 0;
  }, [activeFilters]);
  const searchQuery = debouncedSearch.trim();
  const noResultsMessage = searchQuery
    ? t('No {{doctype}} records match "{{query}}"', { doctype, query: searchQuery })
    : hasProvidedFilters
      ? t("No {{doctype}} records match the active filters", { doctype })
      : undefined;

  const [refreshKey, setRefreshKey] = useState(0);
  const handleRefresh = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  const handleSelectSavedFilter = useCallback(
    (filter: ParsedFilter | null) => {
      if (filter) {
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

  const slug = doctype.toLowerCase().replaceAll(/\s+/g, "-");
  const searchId = `${slug}-list-search`;
  const resultsId = `${slug}-results`;
  const nameField = titleField ?? meta?.title_field;

  const [shuffleOpen, setShuffleOpen] = useState(false);
  const [shuffleRows, setShuffleRows] = useState<Partial<TDoc>[]>([]);
  const handleShuffleRows = useCallback(
    (snapshot: FrappeRowsSnapshot<TDoc>) =>{  setShuffleRows(snapshot.rows); },
    [],
  );
  const shuffleOrderKey = JSON.stringify(sorts?.[0]?.orderBy ?? orderBy ?? null);
  const shuffleFiltersKey = JSON.stringify(resolvedFilters ?? null);
  const shuffleFieldsKey = JSON.stringify(effectiveFields);
  const shuffleOptions = useMemo(
    () => ({
      fields: JSON.parse(shuffleFieldsKey),
      filters: JSON.parse(shuffleFiltersKey) ?? undefined,
      orderBy: JSON.parse(shuffleOrderKey) ?? undefined,
      limit: limit ?? 0,
    }),
    [shuffleFieldsKey, shuffleFiltersKey, shuffleOrderKey, limit],
  );

  const { isFavorite, toggle: toggleStar } = list.favorites;
  const toggleFavorite = useCallback(
    (doc: Partial<TDoc>) => {
      const {name} = doc;
      if (!name) {return;}
      const starred = isFavorite(name);
      toggleStar(name);
      const titleValue = nameField ? (doc as Record<string, unknown>)[nameField] : undefined;
      const label = typeof titleValue === "string" && titleValue ? titleValue : name;
      showToast(
        starred
          ? {
              id: `${slug}-favorite-${name}`,
              title: t("{{name}} removed from favorites", { name: label }),
              intent: "accent",
              action: { label: t("Undo"), onPress: () =>{  toggleStar(name); } },
            }
          : {
              id: `${slug}-favorite-${name}`,
              title: t("{{name}} added to favorites", { name: label }),
              intent: "success",
            },
      );
    },
    [isFavorite, toggleStar, nameField, slug, t],
  );

  const cardFor = (doc: Partial<TDoc>): FrappeListCard => {
    const name = doc.name ?? "";
    const row = doc as Record<string, unknown>;
    return {
      href:
        route !== undefined && name ? frappeRouteHref(route, { mode: "view", name }) : undefined,
      open: () => onItemClick?.(doc),
      facets: Object.fromEntries(
        (facets ?? []).map((facet) => [
          facet.param,
          facet.doctype
            ? (list.facets[facet.param]?.values.get(name) ?? [])
            : row[facet.field] === undefined || row[facet.field] === null
              ? []
              : [String(row[facet.field])],
        ]),
      ),
      favorite:
        favoritesStorageKey && name
          ? { active: isFavorite(name), toggle: () =>{  toggleFavorite(doc); } }
          : undefined,
    };
  };
  const tintFacet = facets?.find((facet) => facet.tint);
  const drawRecordCard = (doc: Partial<TDoc>, index: number) => {
    const card = cardFor(doc);
    const name = doc.name ?? "";
    const values = tintFacet ? (card.facets[tintFacet.param] ?? []) : [];
    const title = recordTitle(doc, look, nameField);
    return (
      <RecordCard
        title={title}
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
        onPress={card.open}
        favorite={card.favorite}
        lazy={index >= eagerCards}
        testID={`${slug}-card-${name}`}
        favoriteTestID={`${slug}-favorite-${name}`}
      />
    );
  };
  const drawCard = renderCard
    ? (doc: Partial<TDoc>, index: number) => renderCard(doc, index, cardFor(doc))
    : look?.images
      ? drawRecordCard
      : undefined;

  // "/" jumps to the search box on web, the common list-page affordance.
  // Document scope adds no tab stop (LC-49); it stands down while the reader
  // types in any editable control or works inside an open overlay.
  useEffect(() => {
    if (!isWeb || typeof document === "undefined" || !showSearch) {return;}
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) {return;}
      if (event.defaultPrevented) {return;}
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {return;}
        if (target.isContentEditable) {return;}
        if (target.closest?.('[role="dialog"], [role="menu"], [role="listbox"]')) {return;}
      }
      const input = document.querySelector(`#${searchId}`)?.querySelector("input");
      if (!input) {return;}
      event.preventDefault();
      input.focus();
      input.select?.();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () =>{  document.removeEventListener("keydown", handleKeyDown); };
  }, [searchId, showSearch]);

  const headerOwnsTools = route !== undefined && !showToolbar;
  const pressFor = (action: FrappeListAction) =>
    action.onPress ?? (action.href && navigate ? () =>{  navigate(action.href!); } : undefined);
  const headerActions =
    headerOwnsTools || headerAccessory || actions?.length ? (
      <XStack {...knobProps.gap} alignItems="center" flexWrap="wrap" flexShrink={1} minWidth={0}>
        {headerOwnsTools ? (
          <Tooltip content={t("Switch views")}>
            <XStack>
              <ViewSwitcher
                views={[
                  ...(hasCards ? [{ type: "grid", label: t("Cards"), icon: ImageIcon }] : []),
                  { type: "list", label: t("List"), icon: ListIcon },
                  { type: "table", label: t("Table"), icon: TableIcon },
                ]}
                currentView={viewMode}
                onViewChange={(v) =>{  setViewMode(v as ListViewMode); }}
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
                  $max-sm={{ display: "none" }}
                  testID={action.testID}
                >
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
                $max-sm={{ display: "flex" }}
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
              $max-sm={{ display: "none" }}
            >
              {t("Add {{doctype}}", { doctype })}
            </Button>
            <Button
              theme="accent"
              onPress={onAdd}
              icon={<PlusIcon size={16} />}
              display="none"
              $max-sm={{ display: "flex" }}
            >
              {t("Add")}
            </Button>
          </>
        ) : null}
      </XStack>
    ) : undefined;

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
              toggle: () =>{  setShuffleOpen((open) => !open); },
              panelId: `${slug}-shuffle-panel`,
            }
          : undefined
      }
      shufflePanel={
        shuffle && shuffleOpen && shuffleRows.length > 0 && drawCard ? (
          <ShufflePanel<Partial<TDoc>>
            id={`${slug}-shuffle-panel`}
            label={t("Surprise me")}
            rows={shuffleRows}
            itemLabel={shuffle.label}
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
            options={shuffleOptions as never}
            onChange={handleShuffleRows}
          />
        ) : null}
        {favoritesStorageKey ? <ListToastHost /> : null}
      </>
    );
    if (route === undefined) {
      return controlsBand ? (
        <YStack {...knobProps.gap} flex={viewMode === "grid" ? undefined : 1}>
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
            {controlsBand ? <SkipLink targetId={resultsId}>{t("Skip to results")}</SkipLink> : null}
            <PageHeader
              title={title ?? doctype}
              subtitle={subtitle && list.total !== undefined ? subtitle(list.total) : undefined}
              actions={headerActions}
              divider={!surface}
            />
          </>
        }
        toolbar={controlsBand ?? undefined}
      >
        {view}
        {extras}
      </ListPageLayout>
    );
  };

  const controlsEmptyState = hasControls ? (
    <EmptyState
      aria-live="polite"
      icon={
        list.state.favoritesOnly ? (
          <HeartIcon size={28} />
        ) : isListNarrowed(list.state) ? (
          <MagnifyingGlassIcon size={28} />
        ) : (
          <SparkleIcon size={28} />
        )
      }
      title={
        list.state.favoritesOnly
          ? t("No favorites yet")
          : list.state.search.trim()
            ? t('No match for "{{query}}"', { query: list.state.search.trim() })
            : isListNarrowed(list.state)
              ? t("No {{doctype}} match the active filters", { doctype })
              : t("No {{doctype}} yet", { doctype })
      }
      description={
        list.state.favoritesOnly
          ? t("Tap the heart on a record to favorite it.")
          : isListNarrowed(list.state)
            ? t("Try a different search or filter.")
            : undefined
      }
      action={
        isListNarrowed(list.state) ? (
          <Button outlined onPress={list.clear}>
            {t("Clear filters")}
          </Button>
        ) : onAdd ? (
          <Button theme="accent" onPress={onAdd}>
            {t("Add your first {{doctype}}", { doctype })}
          </Button>
        ) : undefined
      }
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
        {...stackProps}
      >
        <Spinner size="large" />
        <Text {...knobProps.body} color={knobProps.textAccentColor}>
          {t("Loading {{doctype}} schema...", { doctype })}
        </Text>
      </YStack>,
    );
  }

  const renderToolbar = () => {
    if (!showToolbar) {return null;}

    return (
      <XStack
        {...knobProps.panelPadding}
        alignItems="center"
        justifyContent="space-between"
        // Frame owns SF-CARD; this band is flattened (zero box border, one
        // bottom hairline) so it does not paint a second surface.
        borderWidth={0}
        borderBottomWidth={1}
        borderBottomColor="$borderColor"
      >
        <XStack alignItems="center" {...knobProps.gap}>
          <ViewSwitcher
            views={[
              ...(hasCards ? [{ type: "grid", label: t("Cards") }] : []),
              { type: "list", label: t("List") },
              { type: "table", label: t("Table") },
            ]}
            currentView={viewMode}
            onViewChange={(v) =>{  setViewMode(v as ListViewMode); }}
          />
        </XStack>

        <XStack alignItems="center" {...knobProps.gap}>
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
            aria-label={t("Refresh")}
          />
          {onAdd && (
            <Button
              size="$3"
              theme="accent"
              icon={PlusIcon}
              onPress={onAdd}
              {...pressTargetStyle()}
            >
              {t("Add {{doctype}}", { doctype })}
            </Button>
          )}
        </XStack>
      </XStack>
    );
  };

  const renderFilterSidebar = () => {
    if (!showFilterSidebar) {return null;}

    return (
      <YStack
        width={220}
        // Frame owns SF-CARD; sidebar is a flattened band (inline-end
        // hairline only). Web uses inline style so the CSS logical props
        // beat physical border-right-width:0 from the borderWidth expansion
        // (tamagui borderEndWidth does not compile to working CSS, SB-M-1215).
        borderWidth={0}
        {...(isWeb
          ? {
              style: {
                borderInlineEndWidth: 1,
                borderInlineEndStyle: "solid",
                borderInlineEndColor: theme.borderColor?.get() as string,
              } as any,
            }
          : { borderEndWidth: 1, borderEndColor: "$borderColor" })}
        {...knobProps.panelPadding}
        {...knobProps.gap}
      >
        <Text {...knobProps.label} color={knobProps.textAccentColor}>
          {t("Filters")}
        </Text>
        {standardFilterFields.length > 0 && (
          <YStack {...knobProps.gap}>
            {standardFilterFields.map((field) => (
              <YStack key={field.fieldname} {...knobProps.gap}>
                <Text {...knobProps.label} color={knobProps.textAccentColor}>
                  {field.label ?? field.fieldname}
                </Text>
                <Text {...knobProps.body} color={knobProps.textAccentColor}>
                  {field.fieldtype === "Select" ? field.options ?? "—" : "—"}
                </Text>
              </YStack>
            ))}
          </YStack>
        )}
        {savedFiltersHook.filters.length > 0 && (
          <YStack {...knobProps.gap}>
            <Text {...knobProps.label} color={knobProps.textAccentColor}>
              {t("Saved Filters")}
            </Text>
            <SavedFilterDropdown
              filters={savedFiltersHook.filters}
              selectedFilter={null}
              onSelectFilter={handleSelectSavedFilter}
              onDeleteFilter={handleDeleteFilter}
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
      borderBottomColor="$borderColor"
    >
      <View flex={1} id={searchId}>
        <SearchInput
          value={searchText}
          onChange={setSearchText}
          onSearch={setDebouncedSearch}
          debounceMs={300}
          placeholder={t("Search...")}
          aria-label={t("Search {{doctype}}", { doctype })}
          compact
          size="$3"
        />
      </View>
    </XStack>
  );

  const renderContent = () => {
    if (viewMode === "list" || viewMode === "grid") {
      const isGrid = viewMode === "grid";
      return (
        <YStack flex={isGrid ? undefined : 1}>
          {showSearch && !hasControls ? renderListSearch() : null}
          <FrappeList
            key={`${viewMode}-${refreshKey}`}
            layout={isGrid ? "grid" : "list"}
            gridProps={gridProps}
            emptyState={emptyState ?? controlsEmptyState}
            pageSize={pageSize}
            onRetry={onRetry ?? handleRefresh}
            doctype={doctype}
            fields={effectiveFields as readonly ("name" | "doctype")[]}
            filters={listFilters as Partial<{ name: string; doctype: string }>}
            renderItem={
              (isGrid && drawCard ? drawCard : renderListItem) as unknown as (
                item: Partial<{ name: string; doctype: string }>,
                index: number,
              ) => React.ReactNode
            }
            onItemClick={
              onItemClick as unknown as
                | ((item: Partial<{ name: string; doctype: string }>) => void)
                | undefined
            }
            baseURL={finalBaseURL}
            auth={finalAuth}
            syncOptions={finalSyncOptions}
            orderBy={
              effectiveOrderBy as FrappeListProps<{ name: string; doctype: string }>["orderBy"]
            }
            limit={limit}
            initialRows={
              seedRows as FrappeListProps<{ name: string; doctype: string }>["initialRows"]
            }
            // Only override when narrowing is active: FrappeList's own
            // "No {doctype} records found" stays the true-empty message.
            {...(noResultsMessage ? { emptyMessage: noResultsMessage } : {})}
          />
        </YStack>
      );
    }

    return (
      <FrappeTable
        key={`table-${refreshKey}`}
        doctype={doctype}
        fields={effectiveFields}
        filters={resolvedFilters as Parameters<typeof FrappeTable<TDoc>>[0]["filters"]}
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
              ? t("You do not have permission to view {{doctype}}", { doctype })
              : t("Error loading {{doctype}}", { doctype })
          }
        />
      );
    }
    if (linkFilters.pending) {return <AsyncBoundary layout="list" loading />;}
    return renderContent();
  };

  return asPage(
    <YStack
      flex={viewMode === "grid" ? undefined : 1}
      {...(surface ? knobProps.surface : {})}
      {...(surface ? knobProps.containerRadius : {})}
      overflow={surface ? "hidden" : undefined}
      testID={`${doctype.toLowerCase()}-list`}
      {...(hasControls ? { id: resultsId } : {})}
      {...stackProps}
    >
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
}
