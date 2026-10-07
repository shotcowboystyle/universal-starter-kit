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
  | { kind: 'slug-new'; slug: string; defaults?: Record<string, unknown> }
  | { kind: 'slug-name'; slug: string; name: string }
  | { kind: 'report'; reportName: string; filtersParam?: string }
  | { kind: 'not-found'; path: string };

function first(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : value?.[0];
}

function decode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment; // malformed escape — keep the raw segment
  }
}

/**
 * Resolve `path` (no query string; query lives in `params`, One-router
 * semantics) against the six route shapes `createBackofficePaths` writes.
 * Paths outside `basePath` resolve to `not-found`.
 */
export function resolveDeskPath(
  path: string,
  basePath: string = BACKOFFICE_BASE,
  params: BackofficeParams = {},
): DeskAddress {
  const base = basePath.replace(/\/+$/, '') || '/';
  const clean = path.replace(/\/+$/, '') || '/';
  let rest: string;
  if (base === '/') {
    rest = clean;
  } else if (clean === base) {
    rest = '/';
  } else if (clean.startsWith(`${base}/`)) {
    rest = clean.slice(base.length);
  } else {
    return { kind: 'not-found', path };
  }

  const segments = rest.split('/').filter(Boolean).map(decode);
  if (segments.length === 0) {
    return { kind: 'home' };
  }

  if (segments[0] === 'query-report') {
    if (segments.length === 2 && segments[1]) {
      return { kind: 'report', reportName: segments[1], filtersParam: first(params.filters) };
    }
    return { kind: 'not-found', path };
  }

  const slug = segments[0];
  if (segments.length === 1) {
    return { kind: 'slug', slug, filtersParam: first(params.f), sortParam: first(params.sort) };
  }
  if (segments.length === 2 && segments[1] === 'new') {
    return { kind: 'slug-new', slug, defaults: parseDocDefaults(first(params.d)) };
  }
  if (segments.length === 3 && segments[1] === 'view' && isBackofficeView(segments[2])) {
    const view = segments[2];
    // /view/list is the list surface (DoctypeViewScreen bounces it too).
    if (view === 'list') {
      return { kind: 'slug', slug, filtersParam: first(params.f), sortParam: first(params.sort) };
    }
    const board = first(params.board);
    const field = first(params.field);
    const filtersParam = first(params.f);
    const viewParams: DeskViewParams | undefined =
      board || field || filtersParam ? { board, field, filtersParam } : undefined;
    return { kind: 'slug-view', slug, view, ...(viewParams && { params: viewParams }) };
  }
  if (segments.length === 2) {
    return { kind: 'slug-name', slug, name: segments[1] };
  }
  return { kind: 'not-found', path };
}
