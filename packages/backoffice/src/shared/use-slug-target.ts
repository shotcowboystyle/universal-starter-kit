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

const toSlugMap = (names: readonly { name?: string }[]): Map<string, string> => {
  const map = new Map<string, string>();
  for (const row of names) {
    if (row.name !== undefined && row.name !== '') {
      map.set(toSlug(row.name), row.name);
    }
  }
  return map;
};

const toSinglesSet = (rows: readonly DoctypeIndexRow[]): Set<string> => {
  const singles = new Set<string>();
  for (const row of rows) {
    if (row.name !== undefined && row.name !== '' && row.issingle === 1) {
      singles.add(row.name);
    }
  }
  return singles;
};

const fetchSlugIndex = async (source: SlugIndexSource): Promise<SlugIndex> => {
  if (source.fixtures) {
    const [workspaces, doctypes] = await Promise.all([
      source.fixtures.getList('Workspace', { fields: ['name'] }),
      source.fixtures.getList('DocType', { fields: ['name', 'issingle'] }),
    ]);
    // SAFETY: fixture getList rows carry the requested `name` (and `issingle`) fields, each optional on read
    const workspaceRows = workspaces as { name?: string }[];
    // SAFETY: as above — DocType rows were listed with `name` and `issingle`
    const doctypeRows = doctypes as DoctypeIndexRow[];
    return {
      workspaces: toSlugMap(workspaceRows),
      doctypes: toSlugMap(doctypeRows),
      singles: toSinglesSet(doctypeRows),
    };
  }
  // SAFETY: FrappeProvider auth is the same shape as AuthConfig, with `type` widened to string ('Bearer' | 'token' in practice)
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- provider auth types `type` as a plain string
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
};

const getSlugIndex = async (source: SlugIndexSource): Promise<SlugIndex> => {
  const key = `${source.baseURL}:${source.fixtures ? 'fixtures' : 'live'}`;
  let promise = slugIndexCache.get(key);
  if (!promise) {
    promise = fetchSlugIndex(source);
    // Failed fetches are evicted so a later mount can retry.
    const pending = promise;
    const evictOnFailure = async (): Promise<void> => {
      try {
        await pending;
      } catch {
        // Safe to continue: callers see the rejection through their own await; only the cache entry is dropped.
        if (slugIndexCache.get(key) === pending) {
          slugIndexCache.delete(key);
        }
      }
    };
    void evictOnFailure();
    slugIndexCache.set(key, promise);
  }
  return await promise;
};

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
export const useSlugTarget = (slug: string | undefined): SlugTarget => {
  const config = useFrappeConfig();
  const baseURL = config?.baseURL;
  const fixtures = config?.fixtures;
  const auth = config?.auth;

  const [index, setIndex] = useState<SlugIndex | undefined>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // No provider config → no bench to ask; degrade like a failed fetch.
    if ((baseURL === undefined || baseURL === '') && !fixtures) {
      // oxlint-disable-next-line react/set-state-in-effect -- no provider config: degrade synchronously like a failed fetch
      setFailed(true);
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
    }
    setFailed(false);
    const load = async (): Promise<void> => {
      try {
        const result = await getSlugIndex({ baseURL: baseURL ?? '', auth, fixtures });
        if (!cancelled) {
          setIndex(result);
        }
      } catch {
        // Safe to continue: a failed index degrades to the title-cased doctype guess below.
        if (!cancelled) {
          setFailed(true);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // `auth` is intentionally not a dependency: the cache is keyed by
    // baseURL/fixtures and provider auth is stable for the session.
    // oxlint-disable-next-line exhaustive-deps, react/exhaustive-effect-dependencies -- see above
  }, [baseURL, fixtures]);

  return useMemo<SlugTarget>(() => {
    if (slug === undefined || slug === '') {
      return { status: 'loading' };
    }
    if (index) {
      const workspace = index.workspaces.get(slug);
      if (workspace !== undefined && workspace !== '') {
        return { status: 'resolved', kind: 'workspace', workspace };
      }
      const doctype = index.doctypes.get(slug);
      if (doctype !== undefined && doctype !== '') {
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
};

const EMPTY_SINGLES: ReadonlySet<string> = new Set<string>();

/**
 * Proper-cased names of Single doctypes (desk boot's `single_types`
 * equivalent), from the same once-per-session index the slug router uses —
 * usually already resolved by the time any screen consults it.
 *
 * `undefined` while the index is loading; an EMPTY set once the fetch failed
 * (degrade to pre-gate behavior rather than blocking consumers forever).
 */
export const useSingleDoctypes = (): ReadonlySet<string> | undefined => {
  const config = useFrappeConfig();
  const baseURL = config?.baseURL;
  const fixtures = config?.fixtures;
  const auth = config?.auth;

  const [singles, setSingles] = useState<ReadonlySet<string> | undefined>();

  useEffect(() => {
    let cancelled = false;
    if ((baseURL === undefined || baseURL === '') && !fixtures) {
      // oxlint-disable-next-line react/set-state-in-effect -- no provider config: degrade synchronously like a failed fetch
      setSingles(EMPTY_SINGLES);
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
    }
    const load = async (): Promise<void> => {
      try {
        const result = await getSlugIndex({ baseURL: baseURL ?? '', auth, fixtures });
        if (!cancelled) {
          setSingles(result.singles);
        }
      } catch {
        // Safe to continue: a failed index degrades to an empty set rather than blocking consumers.
        if (!cancelled) {
          setSingles(EMPTY_SINGLES);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // `auth` is session-stable; the index cache is keyed by baseURL/fixtures.
    // oxlint-disable-next-line exhaustive-deps, react/exhaustive-effect-dependencies -- see above
  }, [baseURL, fixtures]);

  return singles;
};
