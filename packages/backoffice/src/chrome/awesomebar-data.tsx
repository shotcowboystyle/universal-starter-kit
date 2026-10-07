import { HttpClient } from '@repo/frappe';
import type { AuthConfig, FixtureProvider } from '@repo/frappe';
import { useFrappeConfig } from '@repo/frappe-ui';
import type { FrappeConfig } from '@repo/frappe-ui';
import { storage } from '@repo/store';
// Data layer for the backoffice awesomebar: a session-cached DocType +
// Workspace name catalog, the frappe.utils.global_search document search,
// and the shared desk recent store (same storage key frappe-ui's
// DeskSidebar reads).
//
// Connection comes exclusively from the ambient FrappeProvider (mounted by
// BackofficeProvider); without one the catalog/search stay empty and inert.
import React from 'react';
import { useEffect, useMemo, useState } from 'react';

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

async function fetchCatalog(source: CatalogSource): Promise<AwesomebarCatalog> {
  if (source.fixtures) {
    const [doctypes, workspaces] = await Promise.all([
      source.fixtures.getList('DocType', { fields: ['name'] }),
      source.fixtures.getList('Workspace', { fields: ['name', 'title'] }),
    ]);
    return {
      doctypes: (doctypes as { name?: string }[]).flatMap((row) => (row.name ? [row.name] : [])),
      workspaces: (workspaces as { name?: string; title?: string }[]).flatMap((row) =>
        row.name ? [{ name: row.name, title: row.title ?? row.name }] : [],
      ),
    };
  }
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
}

async function getCatalog(source: CatalogSource): Promise<AwesomebarCatalog> {
  const key = `${source.baseURL}:${source.fixtures ? 'fixtures' : 'live'}`;
  let promise = catalogCache.get(key);
  if (!promise) {
    promise = fetchCatalog(source);
    // Failed fetches are evicted so a later mount can retry.
    promise.catch(() => {
      if (catalogCache.get(key) === promise) {
        catalogCache.delete(key);
      }
    });
    catalogCache.set(key, promise);
  }
  return await promise;
}

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
export function useAwesomebarCatalog(): AwesomebarCatalogState {
  const config = useFrappeConfig();
  const baseURL = config?.baseURL;
  const fixtures = config?.fixtures;
  const auth = config?.auth;

  const [catalog, setCatalog] = useState<AwesomebarCatalog | undefined>();
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!baseURL) {
      return;
    }
    let cancelled = false;
    setError(false);
    getCatalog({ baseURL, auth, fixtures })
      .then((result) => {
        if (!cancelled) {
          setCatalog(result);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
        }
      });
    return () => {
      cancelled = true;
    };
    // `auth` is intentionally not a dependency: the cache is keyed by
    // baseURL/fixtures and provider auth is stable for the session.
    // oxlint-disable-next-line exhaustive-deps
  }, [baseURL, fixtures]);

  return { catalog, error };
}

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
export function useGlobalSearch(query: string, limit = 10): GlobalSearchState {
  const config = useFrappeConfig();
  const baseURL = config?.baseURL;
  const auth = config?.auth;
  const authKey = `${auth?.useToken ? 't' : ''}:${auth?.token ?? ''}:${auth?.type ?? ''}`;

  const client = useMemo(
    () => (baseURL ? new HttpClient(baseURL, auth as AuthConfig | undefined) : undefined),
    // Keyed by value: a host may rebuild the auth object and its token
    // getter on every render.
    // oxlint-disable-next-line exhaustive-deps
    [baseURL, authKey],
  );

  const [hits, setHits] = useState<GlobalSearchHit[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!query || !client) {
      setHits([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    client
      .get<{ message?: GlobalSearchHit[] }>('/api/method/frappe.utils.global_search.search', {
        text: query,
        start: 0,
        limit,
      })
      .then((response) => {
        if (!cancelled) {
          setHits(response.payload?.message ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHits([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSearching(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, query, limit]);

  return { hits, searching };
}

/**
 * Global-search `content` is "Label: value ||| Label2: value2" — flatten the
 * separators to a middot snippet and cap the length for one-line display.
 */
export function toContentSnippet(content: string, maxLength = 120): string {
  const flat = content
    .replaceAll(/<[^>]*>/g, ' ')
    .split('|||')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' · ')
    .replaceAll(/\s+/g, ' ')
    .trim();
  return flat.length > maxLength ? `${flat.slice(0, maxLength - 1)}…` : flat;
}

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
export async function readRecentItems(): Promise<RecentItem[]> {
  try {
    const raw = await Promise.resolve(storage.getItem(recentStorageKey));
    return raw ? (JSON.parse(raw) as RecentItem[]) : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Matching (Linear / Spotlight fuzzy, Frappe prefix-first)
// ---------------------------------------------------------------------------

/**
 * Indices of characters in `text` that participate in a case-insensitive
 * match against `query`. Prefers a contiguous substring; falls back to a
 * subsequence (so "tdo" hits "ToDo", "so" hits "Sales Order"). Empty query
 * → `[]`. No match → `null`.
 */
export function matchQueryIndices(query: string, text: string): number[] | null {
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
  for (let i = 0; i < lower.length && qi < q.length; i++) {
    if (lower[i] === q[qi]) {
      indices.push(i);
      qi += 1;
    }
  }
  return qi === q.length ? indices : null;
}

function isWordStart(text: string, index: number): boolean {
  if (index <= 0) {
    return true;
  }
  return /[\s\-_/.]/.test(text[index - 1] ?? '');
}

function scoreMatch(query: string, text: string, indices: number[]): number {
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
  for (let i = 0; i < indices.length; i++) {
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
}

/**
 * Rank names for the palette: prefix (desk) → substring → subsequence
 * (Linear / Spotlight). Shorter names break remaining ties.
 */
export function rankNameMatches(query: string, names: readonly string[], limit: number): string[] {
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
}
