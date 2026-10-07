/**
 * The state of a list page's controls (search, sort, facets, ranges,
 * favorites, view) and its two codecs: URL params, so a refresh or a shared
 * link reproduces the list, and bench filters, so the list reads exactly
 * the rows the controls describe. Pure: no React, no IO.
 *
 * Params: `q` search, `sort` the sort's value (absent for the first sort),
 * one param per facet and per range (absent when unset), `fav=1` favorites
 * only, `view` (absent for the default view).
 */
import type { Order } from '@repo/frappe';

export type FrappeListViewMode = 'list' | 'table' | 'grid';

export interface FrappeListSort {
  /** URL value. */
  value: string;
  label: string;
  orderBy: readonly { field: string; order: Order }[];
}

/** Narrow the list to records carrying one value of a field. */
export interface FrappeListFacet {
  /** URL param and state key. */
  param: string;
  /** Field whose value narrows. */
  field: string;
  /**
   * A connection doctype whose rows carry `field` (Pokemon's types live on
   * Pokemon Poke Type rows). Omitted, `field` is the list doctype's own.
   */
  doctype?: string;
  /** Values offered, in display order. */
  options: readonly string[];
  /** Names the rail for assistive tech. */
  label: string;
  /** The chip that clears the facet. */
  allLabel?: string;
  optionLabel?: (value: string) => string;
  /** A theme hue per value (`"grass"`), painting its chip from that ramp. */
  tint?: (value: string) => string | undefined;
  /** Connection field that orders one record's values (a `slot`). */
  orderBy?: string;
}

/** Narrow the list to records whose numeric field is at least a value. */
export interface FrappeListRange {
  param: string;
  field: string;
  label: string;
  step?: number;
}

export interface FrappeListControls {
  sorts?: readonly FrappeListSort[];
  facets?: readonly FrappeListFacet[];
  ranges?: readonly FrappeListRange[];
  views?: readonly FrappeListViewMode[];
  defaultView?: FrappeListViewMode;
}

export interface FrappeListState {
  search: string;
  /** The chosen sort's value; the first sort when none was chosen. */
  sort: string | undefined;
  /** Facet param to the value it narrows to. */
  facets: Record<string, string>;
  /** Range param to its minimum; absent or 0 is no minimum. */
  ranges: Record<string, number>;
  favoritesOnly: boolean;
  view: FrappeListViewMode | undefined;
}

export type FrappeListParams = Record<string, string | undefined>;

export type FrappeListFilter = [string, string, unknown] | [string, string, string, unknown];

function positiveInt(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function listStateFromParams(params: FrappeListParams, controls: FrappeListControls): FrappeListState {
  const sorts = controls.sorts ?? [];
  const sort = sorts.find((option) => option.value === params.sort)?.value ?? sorts[0]?.value;
  const facets: Record<string, string> = {};
  for (const facet of controls.facets ?? []) {
    const value = params[facet.param];
    if (value && facet.options.includes(value)) {
      facets[facet.param] = value;
    }
  }
  const ranges: Record<string, number> = {};
  for (const range of controls.ranges ?? []) {
    const value = positiveInt(params[range.param]);
    if (value > 0) {
      ranges[range.param] = value;
    }
  }
  const views = controls.views ?? [];
  const view = views.find((mode) => mode === params.view) ?? controls.defaultView;
  return {
    search: params.q ?? '',
    sort,
    facets,
    ranges,
    favoritesOnly: params.fav === '1',
    view,
  };
}

/** A state patch as the URL params it changes; a default value drops its param. */
export function listStateParams(patch: Partial<FrappeListState>, controls: FrappeListControls): FrappeListParams {
  const params: FrappeListParams = {};
  if (patch.search !== undefined) {
    params.q = patch.search.trim() || undefined;
  }
  if (patch.sort !== undefined) {
    params.sort = patch.sort === controls.sorts?.[0]?.value ? undefined : patch.sort;
  }
  for (const [param, value] of Object.entries(patch.facets ?? {})) {
    params[param] = value || undefined;
  }
  for (const [param, value] of Object.entries(patch.ranges ?? {})) {
    params[param] = value > 0 ? String(value) : undefined;
  }
  if (patch.favoritesOnly !== undefined) {
    params.fav = patch.favoritesOnly ? '1' : undefined;
  }
  if (patch.view !== undefined) {
    params.view = patch.view === controls.defaultView ? undefined : patch.view;
  }
  return params;
}

/** Search, a facet, a range or favorites narrows the rows. */
export function isListNarrowed(state: FrappeListState): boolean {
  return (
    state.search.trim() !== '' ||
    Object.values(state.facets).some(Boolean) ||
    Object.values(state.ranges).some((value) => value > 0) ||
    state.favoritesOnly
  );
}

export interface ListStateFilterOptions {
  /** Filters that always apply, ahead of the controls'. */
  base?: readonly FrappeListFilter[];
  /** The bench filters a search query becomes. */
  search?: (query: string) => readonly FrappeListFilter[];
  /** Starred names, for favorites only. */
  favorites?: ReadonlySet<string>;
}

/** The bench filters the state describes, or undefined when nothing filters. */
export function listStateFilters(
  state: FrappeListState,
  controls: FrappeListControls,
  options: ListStateFilterOptions = {},
): FrappeListFilter[] | undefined {
  const filters: FrappeListFilter[] = [...(options.base ?? [])];
  const query = state.search.trim();
  if (query && options.search) {
    filters.push(...options.search(query));
  }
  for (const facet of controls.facets ?? []) {
    const value = state.facets[facet.param];
    if (!value) {
      continue;
    }
    filters.push(facet.doctype ? [facet.doctype, facet.field, '=', value] : [facet.field, '=', value]);
  }
  for (const range of controls.ranges ?? []) {
    const value = state.ranges[range.param] ?? 0;
    if (value > 0) {
      filters.push([range.field, '>=', value]);
    }
  }
  if (state.favoritesOnly) {
    filters.push(['name', 'in', [...(options.favorites ?? [])].sort()]);
  }
  return filters.length > 0 ? filters : undefined;
}

export function listStateOrderBy(
  state: FrappeListState,
  controls: FrappeListControls,
  fallback?: readonly { field: string; order: Order }[],
): readonly { field: string; order: Order }[] | undefined {
  const sorts = controls.sorts ?? [];
  return (sorts.find((option) => option.value === state.sort) ?? sorts[0])?.orderBy ?? fallback;
}
