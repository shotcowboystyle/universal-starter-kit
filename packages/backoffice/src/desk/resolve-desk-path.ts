/**
 * resolveDeskPath — the pure path→surface resolver (MPO-14 / gap GL-1,
 * spec 09 §DM-1, §4.3).
 *
 * One inverse for every builder in `createBackofficePaths`, so dispatch
 * lives in the package once instead of being re-derived per host route
 * file. Pure: no network, no React. The slug half of an address stays
 * AMBIGUOUS here (workspace vs doctype is data, resolved by
 * `useSlugTarget`); `useDeskTarget` composes the two.
 */
import type { BackofficeParams } from '../navigation/navigator';
import { BACKOFFICE_BASE, isBackofficeView, parseDocDefaults } from '../navigation/paths';
import type { BackofficeView } from '../navigation/paths';

/** View search params the view surface reads (board/field/f — spec §2.2). */
export interface DeskViewParams {
  /** `?board=` kanban board selection. */
  board?: string;
  /** `?field=` calendar date field. */
  field?: string;
  /** `?f=` report base filters (raw urlencoded JSON). */
  filtersParam?: string;
}

/** Field prefill decoded from a `?d=` param. */
export type DeskDocDefaults = NonNullable<ReturnType<typeof parseDocDefaults>>;

/**
 * A resolved desk address: the shape of the URL, before slug disambiguation.
 * `slug` kinds still need the runtime workspace/doctype index.
 */
export type DeskAddress =
  | { kind: 'home' }
  | { kind: 'slug'; slug: string; filtersParam?: string; sortParam?: string }
  | {
      kind: 'slug-view';
      slug: string;
      view: Exclude<BackofficeView, 'list'>;
      params?: DeskViewParams;
    }
  | { kind: 'slug-new'; slug: string; defaults?: DeskDocDefaults }
  | { kind: 'slug-name'; slug: string; name: string }
  | { kind: 'report'; reportName: string; filtersParam?: string }
  | { kind: 'not-found'; path: string };

const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

const decode = (segment: string): string => {
  try {
    return decodeURIComponent(segment);
  } catch {
    // Malformed escape — keep the raw segment.
    return segment;
  }
};

/** `path` without trailing slashes — a linear scan, where `/\/+$/` backtracks. */
export const stripTrailingSlashes = (path: string): string => {
  let end = path.length;
  while (end > 0 && path[end - 1] === '/') {
    end -= 1;
  }
  return path.slice(0, end);
};

/** The part of `clean` under `base`, or undefined when it lies outside. */
const pathUnderBase = (clean: string, base: string): string | undefined => {
  if (base === '/') {
    return clean;
  }
  if (clean === base) {
    return '/';
  }
  return clean.startsWith(`${base}/`) ? clean.slice(base.length) : undefined;
};

export const isPresent = (value: string | undefined): value is string => value !== undefined && value !== '';

/** `/<slug>/view/<view>` → the view address (`/view/list` is the list surface). */
const resolveViewAddress = (slug: string, view: BackofficeView, params: BackofficeParams): DeskAddress => {
  // /view/list is the list surface (DoctypeViewScreen bounces it too).
  if (view === 'list') {
    return { kind: 'slug', slug, filtersParam: first(params.f), sortParam: first(params.sort) };
  }
  const board = first(params.board);
  const field = first(params.field);
  const filtersParam = first(params.f);
  if (!isPresent(board) && !isPresent(field) && !isPresent(filtersParam)) {
    return { kind: 'slug-view', slug, view };
  }
  return { kind: 'slug-view', slug, view, params: { board, field, filtersParam } };
};

/**
 * Resolve `path` (no query string; query lives in `params`, One-router
 * semantics) against the six route shapes `createBackofficePaths` writes.
 * Paths outside `basePath` resolve to `not-found`.
 */
export const resolveDeskPath = (
  path: string,
  basePath: string = BACKOFFICE_BASE,
  params: BackofficeParams = {},
): DeskAddress => {
  const base = stripTrailingSlashes(basePath) || '/';
  const clean = stripTrailingSlashes(path) || '/';
  const rest = pathUnderBase(clean, base);
  if (rest === undefined) {
    return { kind: 'not-found', path };
  }

  const segments = rest.split('/').filter(Boolean).map(decode);
  if (segments.length === 0) {
    return { kind: 'home' };
  }

  const [slug, second, third] = segments;
  if (slug === 'query-report') {
    if (segments.length === 2 && isPresent(second)) {
      return { kind: 'report', reportName: second, filtersParam: first(params.filters) };
    }
    return { kind: 'not-found', path };
  }

  if (segments.length === 1) {
    return { kind: 'slug', slug, filtersParam: first(params.f), sortParam: first(params.sort) };
  }
  if (segments.length === 2 && second === 'new') {
    return { kind: 'slug-new', slug, defaults: parseDocDefaults(first(params.d)) };
  }
  if (segments.length === 3 && second === 'view' && isBackofficeView(third)) {
    return resolveViewAddress(slug, third, params);
  }
  if (segments.length === 2) {
    return { kind: 'slug-name', slug, name: second };
  }
  return { kind: 'not-found', path };
};
