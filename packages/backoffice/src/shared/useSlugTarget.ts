// Contract: resolve a {basePath}/[slug] segment to a workspace or doctype.
// Every backoffice route relies on this hook; keep the signature stable.
import { HttpClient } from '@repo/frappe';
import type { AuthConfig, FixtureProvider } from '@repo/frappe';
import { useFrappeConfig } from '@repo/frappe-ui';
import type { FrappeConfig } from '@repo/frappe-ui';
import { useEffect, useMemo, useState } from 'react';

import { slugToDisplayName, toSlug } from '../navigation/paths';

import type { SlugTarget } from './types';

/**
 * Slug → proper-cased-name indexes, fetched once per session.
 *
 * Workspaces win over doctypes on collision (desk parity: `/app/tools` is the
 * Tools workspace even though a "Tools" doctype could exist).
 */
interface SlugIndex {
  workspaces: Map<string, string>;
  doctypes: Map<string, string>;
  /**
   * Proper-cased names of Single doctypes. Desk skips these via boot
   * metadata (`frappe.boot.single_types`); we derive the same set from the
   * one DocType list this index already fetches. Consumers use it to avoid
   * operations that reject permanently on singles — `frappe.client.get_count`
   * HTTP-500s for every Single (e.g. the stock Website workspace's
   * "Website Settings" shortcut).
   */
  singles: Set<string>;
}

interface SlugIndexSource {
  baseURL: string;
  auth?: FrappeConfig['auth'];
  fixtures?: FixtureProvider;
}

/** Module-level cache: one fetch per (baseURL, fixture-mode) per session. */
const slugIndexCache = new Map<string, Promise<SlugIndex>>();

interface DoctypeIndexRow {
  name?: string;
  issingle?: 0 | 1;
}

function toSlugMap(names: readonly { name?: string }[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of names) {
    if (row.name) {
      map.set(toSlug(row.name), row.name);
    }
  }
  return map;
}

function toSinglesSet(rows: readonly DoctypeIndexRow[]): Set<string> {
  const singles = new Set<string>();
  for (const row of rows) {
    if (row.name && row.issingle) {
      singles.add(row.name);
    }
  }
  return singles;
}

async function fetchSlugIndex(source: SlugIndexSource): Promise<SlugIndex> {
  if (source.fixtures) {
    const [workspaces, doctypes] = await Promise.all([
      source.fixtures.getList('Workspace', { fields: ['name'] }),
      source.fixtures.getList('DocType', { fields: ['name', 'issingle'] }),
    ]);
    return {
      workspaces: toSlugMap(workspaces as { name?: string }[]),
      doctypes: toSlugMap(doctypes as { name?: string }[]),
      singles: toSinglesSet(doctypes as DoctypeIndexRow[]),
    };
  }
  const client = new HttpClient(source.baseURL, source.auth as AuthConfig | undefined);
  const [workspacesRes, doctypesRes] = await Promise.all([
    client.get<{ data?: { name: string }[] }>('/api/resource/Workspace', {
      fields: '["name"]',
      limit_page_length: '0',
    }),
    client.get<{ message?: DoctypeIndexRow[] }>('/api/method/frappe.client.get_list', {
      doctype: 'DocType',
      fields: '["name","issingle"]',
      limit_page_length: '0',
    }),
  ]);
  return {
    workspaces: toSlugMap(workspacesRes.payload?.data ?? []),
    doctypes: toSlugMap(doctypesRes.payload?.message ?? []),
    singles: toSinglesSet(doctypesRes.payload?.message ?? []),
  };
}

async function getSlugIndex(source: SlugIndexSource): Promise<SlugIndex> {
  const key = `${source.baseURL}:${source.fixtures ? 'fixtures' : 'live'}`;
  let promise = slugIndexCache.get(key);
  if (!promise) {
    promise = fetchSlugIndex(source);
    // Failed fetches are evicted so a later mount can retry.
    promise.catch(() => {
      if (slugIndexCache.get(key) === promise) {
        slugIndexCache.delete(key);
      }
    });
    slugIndexCache.set(key, promise);
  }
  return await promise;
}

/**
 * Resolve a URL slug ("sales-order") to its target:
 * - a Workspace whose slugged name matches → workspace page (workspaces win)
 * - otherwise a DocType whose slugged name matches → doctype list
 * - otherwise not-found
 *
 * The Workspace + DocType name indexes are fetched once per session (module
 * cache) via the frappe client, honoring FrappeProvider fixtures in stories
 * and tests. Connection comes exclusively from the ambient FrappeProvider
 * (mounted by BackofficeProvider); without one the hook degrades the same
 * way a failed fetch does. SSR-safe: the fetch runs in an effect, so the
 * server render (and first client paint) reports `loading`. If the fetch
 * fails the hook degrades gracefully by treating the slug as a title-cased
 * doctype.
 */
export function useSlugTarget(slug: string | undefined): SlugTarget {
  const config = useFrappeConfig();
  const baseURL = config?.baseURL;
  const fixtures = config?.fixtures;
  const auth = config?.auth;

  const [index, setIndex] = useState<SlugIndex | undefined>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // No provider config → no bench to ask; degrade like a failed fetch.
    if (!baseURL && !fixtures) {
      setFailed(true);
      return;
    }
    setFailed(false);
    getSlugIndex({ baseURL: baseURL ?? '', auth, fixtures })
      .then((result) => {
        if (!cancelled) {
          setIndex(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });
    return () => {
      cancelled = true;
    };
    // `auth` is intentionally not a dependency: the cache is keyed by
    // baseURL/fixtures and provider auth is stable for the session.
    // oxlint-disable-next-line exhaustive-deps
  }, [baseURL, fixtures]);

  return useMemo<SlugTarget>(() => {
    if (!slug) {
      return { status: 'loading' };
    }
    if (index) {
      const workspace = index.workspaces.get(slug);
      if (workspace) {
        return { status: 'resolved', kind: 'workspace', workspace };
      }
      const doctype = index.doctypes.get(slug);
      if (doctype) {
        return { status: 'resolved', kind: 'doctype', doctype };
      }
      return { status: 'not-found', slug };
    }
    if (failed) {
      // Degrade gracefully: guess a title-cased doctype so deep links still
      // land somewhere useful when the metadata fetch is unavailable.
      return { status: 'resolved', kind: 'doctype', doctype: slugToDisplayName(slug) };
    }
    return { status: 'loading' };
  }, [slug, index, failed]);
}

const EMPTY_SINGLES: ReadonlySet<string> = new Set<string>();

/**
 * Proper-cased names of Single doctypes (desk boot's `single_types`
 * equivalent), from the same once-per-session index the slug router uses —
 * usually already resolved by the time any screen consults it.
 *
 * `undefined` while the index is loading; an EMPTY set once the fetch failed
 * (degrade to pre-gate behavior rather than blocking consumers forever).
 */
export function useSingleDoctypes(): ReadonlySet<string> | undefined {
  const config = useFrappeConfig();
  const baseURL = config?.baseURL;
  const fixtures = config?.fixtures;
  const auth = config?.auth;

  const [singles, setSingles] = useState<ReadonlySet<string> | undefined>();

  useEffect(() => {
    let cancelled = false;
    if (!baseURL && !fixtures) {
      setSingles(EMPTY_SINGLES);
      return;
    }
    getSlugIndex({ baseURL: baseURL ?? '', auth, fixtures })
      .then((result) => {
        if (!cancelled) {
          setSingles(result.singles);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSingles(EMPTY_SINGLES);
        }
      });
    return () => {
      cancelled = true;
    };
    // `auth` is session-stable; the index cache is keyed by baseURL/fixtures.
    // oxlint-disable-next-line exhaustive-deps
  }, [baseURL, fixtures]);

  return singles;
}
