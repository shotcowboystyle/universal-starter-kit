// Data layer for the backoffice awesomebar: a session-cached DocType +
// Workspace name catalog, the frappe.utils.global_search document search,
// and the shared desk recent store (same storage key frappe-ui's
// DeskSidebar reads).
//
// Connection comes exclusively from the ambient FrappeProvider (mounted by
// BackofficeProvider); without one the catalog/search stay empty and inert.
import { HttpClient } from '@repo/frappe';
import type { AuthConfig, FixtureProvider } from '@repo/frappe';
import { useFrappeConfig } from '@repo/frappe-ui';
import type { FrappeConfig } from '@repo/frappe-ui';
import { storage } from '@repo/store';
import React, { useEffect, useMemo, useState } from 'react';

// ---------------------------------------------------------------------------
// Catalog (DocType names + Workspaces), fetched once per session
// ---------------------------------------------------------------------------

export interface AwesomebarWorkspace {
  name: string;
  title: string;
}

export interface AwesomebarCatalog {
  doctypes: string[];
  workspaces: AwesomebarWorkspace[];
}

interface CatalogSource {
  baseURL: string;
  auth?: FrappeConfig['auth'];
  fixtures?: FixtureProvider;
}

/** Module-level cache: one fetch per (baseURL, fixture-mode) per session. */
const catalogCache = new Map<string, Promise<AwesomebarCatalog>>();

/** Fixture rows are untyped records; a blank or missing name is not a catalog entry. */
const isPresentName = (name: string | null | undefined): name is string => name != null && name !== '';

const fetchCatalog = async (source: CatalogSource): Promise<AwesomebarCatalog> => {
  if (source.fixtures) {
    const [doctypes, workspaces] = await Promise.all([
      source.fixtures.getList('DocType', { fields: ['name'] }),
      source.fixtures.getList('Workspace', { fields: ['name', 'title'] }),
    ]);
    // SAFETY: the fixture lists were requested with exactly these fields (name / name+title).
    const doctypeRows = doctypes as { name?: string }[];
    // SAFETY: as above — Workspace rows carry only the requested name and title.
    const workspaceRows = workspaces as { name?: string; title?: string }[];
    return {
      doctypes: doctypeRows.flatMap((row) => (isPresentName(row.name) ? [row.name] : [])),
      workspaces: workspaceRows.flatMap((row) =>
        isPresentName(row.name) ? [{ name: row.name, title: row.title ?? row.name }] : [],
      ),
    };
  }
  // SAFETY: FrappeConfig['auth'] is the provider-facing alias of the client's AuthConfig.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
  const client = new HttpClient(source.baseURL, source.auth as AuthConfig | undefined);
  const [doctypesRes, workspacesRes] = await Promise.all([
    client.get<{ message?: { name: string }[] }>('/api/method/frappe.client.get_list', {
      doctype: 'DocType',
      fields: '["name"]',
      limit_page_length: '0',
    }),
    client.get<{ data?: { name: string; title?: string }[] }>('/api/resource/Workspace', {
      fields: '["name","title"]',
      limit_page_length: '0',
    }),
  ]);
  return {
    doctypes: (doctypesRes.payload?.message ?? []).flatMap((row) => (row.name ? [row.name] : [])),
    workspaces: (workspacesRes.payload?.data ?? []).flatMap((row) =>
      row.name ? [{ name: row.name, title: row.title ?? row.name }] : [],
    ),
  };
};

const getCatalog = async (source: CatalogSource): Promise<AwesomebarCatalog> => {
  const key = `${source.baseURL}:${source.fixtures ? 'fixtures' : 'live'}`;
  let promise = catalogCache.get(key);
  if (!promise) {
    const pending = fetchCatalog(source);
    promise = pending;
    const evictOnFailure = async () => {
      try {
        await pending;
      } catch {
        // Failed fetches are evicted so a later mount can retry; callers see the rejection.
        if (catalogCache.get(key) === pending) {
          catalogCache.delete(key);
        }
      }
    };
    void evictOnFailure();
    catalogCache.set(key, pending);
  }
  return await promise;
};

export interface AwesomebarCatalogState {
  catalog?: AwesomebarCatalog;
  /** Catalog fetch failed (e.g. Guest 403 on the DocType list). */
  error: boolean;
}

/**
 * DocType + Workspace name catalog from the ambient FrappeProvider (fixtures
 * honored in stories/tests), fetched once per session. SSR-safe: the fetch
 * runs in an effect. Without a provider the catalog stays empty.
 */
export const useAwesomebarCatalog = (): AwesomebarCatalogState => {
  const config = useFrappeConfig();
  const baseURL = config?.baseURL;
  const fixtures = config?.fixtures;
  const auth = config?.auth;

  const [catalog, setCatalog] = useState<AwesomebarCatalog | undefined>();
  const [error, setError] = useState(false);

  useEffect(() => {
    if (baseURL === undefined || baseURL === '') {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
    }
    let cancelled = false;
    // oxlint-disable-next-line react/set-state-in-effect -- a new connection clears the previous fetch failure before refetching
    setError(false);
    const load = async () => {
      try {
        const result = await getCatalog({ baseURL, auth, fixtures });
        if (!cancelled) {
          setCatalog(result);
        }
      } catch {
        // Surfaced as `error` (e.g. Guest 403 on the DocType list).
        if (!cancelled) {
          setError(true);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // `auth` is intentionally not a dependency: the cache is keyed by
    // baseURL/fixtures and provider auth is stable for the session.
    // oxlint-disable-next-line exhaustive-deps, react/exhaustive-effect-dependencies
  }, [baseURL, fixtures]);

  return { catalog, error };
};

// ---------------------------------------------------------------------------
// Global search (frappe.utils.global_search.search)
// ---------------------------------------------------------------------------

/** Row shape returned by frappe.utils.global_search.search. */
export interface GlobalSearchHit {
  doctype: string;
  name: string;
  content: string;
}

export interface GlobalSearchState {
  hits: GlobalSearchHit[];
  searching: boolean;
}

/**
 * Document hits from the desk full-text index for an (already debounced)
 * query. Empty query clears without fetching. Failures degrade to no hits —
 * the nav-command and workspace sections still render.
 */
export const useGlobalSearch = (query: string, limit = 10): GlobalSearchState => {
  const config = useFrappeConfig();
  const baseURL = config?.baseURL;
  const auth = config?.auth;
  // A token getter stringifies to its source text, which stays stable when a host rebuilds it each render.
  // oxlint-disable-next-line typescript/restrict-template-expressions -- see above
  const authKey = `${auth?.useToken ? 't' : ''}:${auth?.token ?? ''}:${auth?.type ?? ''}`;

  const client = useMemo(
    () => {
      const hasBaseURL = baseURL !== undefined && baseURL !== '';
      // SAFETY: FrappeConfig['auth'] is the provider-facing alias of the client's AuthConfig.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion, react/memo-dependencies -- see SAFETY above; deps are keyed by value below
      return hasBaseURL ? new HttpClient(baseURL, auth as AuthConfig | undefined) : undefined;
    },
    // Keyed by value: a host may rebuild the auth object and its token
    // getter on every render.
    // oxlint-disable-next-line exhaustive-deps
    [baseURL, authKey],
  );

  const [hits, setHits] = useState<GlobalSearchHit[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!query || !client) {
      // oxlint-disable-next-line react/set-state-in-effect -- an empty query (or no connection) clears results without fetching
      setHits([]);
      setSearching(false);
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
    }
    let cancelled = false;
    setSearching(true);
    const search = async () => {
      try {
        const response = await client.get<{ message?: GlobalSearchHit[] }>(
          '/api/method/frappe.utils.global_search.search',
          { text: query, start: 0, limit },
        );
        if (!cancelled) {
          setHits(response.payload?.message ?? []);
          setSearching(false);
        }
      } catch {
        // Failures degrade to no hits; the other palette sections still render.
        if (!cancelled) {
          setHits([]);
          setSearching(false);
        }
      }
    };
    void search();
    return () => {
      cancelled = true;
    };
  }, [client, query, limit]);

  return { hits, searching };
};

/**
 * Global-search `content` is "Label: value ||| Label2: value2" — flatten the
 * separators to a middot snippet and cap the length for one-line display.
 */
export const toContentSnippet = (content: string, maxLength = 120): string => {
  const flat = content
    // oxlint-disable-next-line sonarjs/super-linear-regex -- content is a short global-search snippet
    .replaceAll(/<[^>]*>/gu, ' ')
    .split('|||')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' · ')
    .replaceAll(/\s+/gu, ' ')
    .trim();
  return flat.length > maxLength ? `${flat.slice(0, maxLength - 1)}…` : flat;
};

// ---------------------------------------------------------------------------
// Recents (shared desk store — same key frappe-ui's DeskSidebar/addToRecent
// writes, so navbar recent and sidebar recent stay one list)
// ---------------------------------------------------------------------------

export interface RecentItem {
  label: string;
  path: string;
}

const recentStorageKey = 'frappe-desk-recent';

/** Newest-first recent documents from the shared desk store. */
export const readRecentItems = async (): Promise<RecentItem[]> => {
  try {
    const raw = await Promise.resolve(storage.getItem(recentStorageKey));
    if (raw == null || raw === '') {
      return [];
    }
    // SAFETY: the shared desk store only holds RecentItem[] JSON written by frappe-ui's addToRecent.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
    return JSON.parse(raw) as RecentItem[];
  } catch {
    return [];
  }
};

// ---------------------------------------------------------------------------
// Matching (Linear / Spotlight fuzzy, Frappe prefix-first)
// ---------------------------------------------------------------------------

/**
 * Indices of characters in `text` that participate in a case-insensitive
 * match against `query`. Prefers a contiguous substring; falls back to a
 * subsequence (so "sinv" hits "Sales Invoice", "so" hits "Sales Order"). Empty query
 * → `[]`. No match → `null`.
 */
export const matchQueryIndices = (query: string, text: string): number[] | null => {
  const q = query.trim().toLowerCase();
  if (!q) {
    return [];
  }
  const lower = text.toLowerCase();
  const contiguous = lower.indexOf(q);
  if (contiguous !== -1) {
    return Array.from({ length: q.length }, (_, index) => contiguous + index);
  }
  const indices: number[] = [];
  let qi = 0;
  for (let i = 0; i < lower.length && qi < q.length; i += 1) {
    if (lower[i] === q[qi]) {
      indices.push(i);
      qi += 1;
    }
  }
  return qi === q.length ? indices : null;
};

const isWordStart = (text: string, index: number): boolean => {
  if (index <= 0) {
    return true;
  }
  return /[\s\-_/.]/u.test(text[index - 1] ?? '');
};

const scoreMatch = (query: string, text: string, indices: number[]): number => {
  const q = query.trim().toLowerCase();
  const lower = text.toLowerCase();
  // Frappe awesomebar: prefix beats contains beats fuzzy subsequence.
  if (lower.startsWith(q)) {
    return 10_000 - text.length;
  }
  if (lower.includes(q)) {
    return 5000 - (indices[0] ?? 0) * 10 - text.length;
  }
  let wordStarts = 0;
  let consecutive = 0;
  for (let i = 0; i < indices.length; i += 1) {
    const at = indices[i] ?? 0;
    if (isWordStart(text, at)) {
      wordStarts += 1;
    }
    if (i > 0 && at === (indices[i - 1] ?? 0) + 1) {
      consecutive += 1;
    }
  }
  const span = (indices.at(-1) ?? 0) - (indices[0] ?? 0) + 1;
  const gaps = Math.max(0, span - q.length);
  return 1000 + wordStarts * 80 + consecutive * 25 - (indices[0] ?? 0) * 5 - gaps * 15 - text.length;
};

/**
 * Rank names for the palette: prefix (desk) → substring → subsequence
 * (Linear / Spotlight). Shorter names break remaining ties.
 */
export const rankNameMatches = (query: string, names: readonly string[], limit: number): string[] => {
  const q = query.trim();
  if (!q) {
    return [];
  }
  const scored: { name: string; score: number }[] = [];
  for (const name of names) {
    const indices = matchQueryIndices(q, name);
    if (!indices || indices.length === 0) {
      continue;
    }
    scored.push({ name, score: scoreMatch(q, name, indices) });
  }
  scored.sort((a, b) => b.score - a.score || a.name.length - b.name.length || a.name.localeCompare(b.name));
  return scored.slice(0, limit).map((row) => row.name);
};
