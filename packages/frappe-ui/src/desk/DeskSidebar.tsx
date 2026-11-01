/**
 * DeskSidebar - Sidebar navigation for Frappe Desk.
 *
 * Sections:
 * - Recent: last 20 visited documents from shared storage
 * - Favorites: user-pinned documents from shared storage
 * - Modules: DocTypes grouped by module (fetched via useDocTypeSearch cache)
 *
 * Uses the existing Sidebar component internally.
 */

import { useDocTypeSearch } from '@repo/frappe';
import type { FrappeConnectionConfig } from '@repo/frappe';
import { storage } from '@repo/store';
import { Sidebar } from '@repo/ui';
import type { SidebarSection } from '@repo/ui';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useFrappeConfig } from '../FrappeProvider';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeskSidebarProps {
  /** Called when user navigates */
  onNavigate?: (path: string) => void;
  /** Currently active path */
  activePath?: string;
  /** Base path (default "/desk") */
  basePath?: string;
}

interface StoredItem {
  label: string;
  path: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const recentStorageKey = 'frappe-desk-recent';
const favoritesStorageKey = 'frappe-desk-favorites';
const maxRecent = 20;

// ---------------------------------------------------------------------------
// Storage helpers (exported for external use)
// ---------------------------------------------------------------------------

const readStoredItems = async (key: string): Promise<StoredItem[]> => {
  try {
    const raw = await Promise.resolve(storage.getItem(key));
    if (raw === null || raw === '') {
      return [];
    }
    // SAFETY: these keys are only ever written by writeStoredItems with a StoredItem[]; a corrupt value throws in JSON.parse and falls to the catch.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
    return JSON.parse(raw) as StoredItem[];
  } catch {
    return [];
  }
};

const writeStoredItems = async (key: string, items: StoredItem[]): Promise<void> => {
  try {
    await Promise.resolve(storage.setItem(key, JSON.stringify(items)));
  } catch {
    // storage unavailable
  }
};

/**
 * Add an item to the recent documents list.
 * Deduplicates by path and caps at 20 entries.
 */
export const addToRecent = (item: { label: string; path: string }): void => {
  void (async () => {
    const stored = await readStoredItems(recentStorageKey);
    const items = stored.filter((r) => r.path !== item.path);
    items.unshift(item);
    await writeStoredItems(recentStorageKey, items.slice(0, maxRecent));
  })();
};

/**
 * Add an item to the favorites list.
 * Deduplicates by path.
 */
export const addToFavorites = (item: { label: string; path: string }): void => {
  void (async () => {
    const items = await readStoredItems(favoritesStorageKey);
    if (items.some((f) => f.path === item.path)) {
      return;
    }
    items.push(item);
    await writeStoredItems(favoritesStorageKey, items);
  })();
};

/**
 * Remove an item from the favorites list by path.
 */
export const removeFromFavorites = (path: string): void => {
  void (async () => {
    const stored = await readStoredItems(favoritesStorageKey);
    const items = stored.filter((f) => f.path !== path);
    await writeStoredItems(favoritesStorageKey, items);
  })();
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const DeskSidebar = ({ onNavigate, activePath, basePath = '/desk' }: DeskSidebarProps) => {
  const { t } = useTranslation();
  const config = useFrappeConfig();

  // Read persisted sidebar data on mount
  const [recentItems, setRecentItems] = useState<StoredItem[]>([]);
  const [favoriteItems, setFavoriteItems] = useState<StoredItem[]>([]);

  useEffect(() => {
    void (async () => {
      setRecentItems(await readStoredItems(recentStorageKey));
      setFavoriteItems(await readStoredItems(favoritesStorageKey));
    })();
  }, []);

  // Fetch DocType list for module grouping.
  // useDocTypeSearch with "" returns [] but still fetches and caches the full
  // DocType list internally. Passing " " triggers a local filter that matches
  // all doctypes (every name contains a space-like match), giving us the full list.
  // Memoized: a fresh config object per render re-runs the hook's fetch
  // effect per render (and loops when the fetch fails, e.g. Guest 403).
  const frappeConfig = useMemo<FrappeConnectionConfig | undefined>(
    () =>
      config
        ? {
            baseURL: config.baseURL,
            realtime: config.realtime,
            socketPort: config.socketPort,
            auth: config.auth,
          }
        : undefined,
    [config],
  );
  const { results: moduleResults } = useDocTypeSearch(frappeConfig, ' ');

  // Deduplicate by doctype to build a Modules section
  const modulesSections = useMemo<SidebarSection[]>(() => {
    const doctypeSet = new Set<string>();
    for (const r of moduleResults) {
      if (r.type === 'list') {
        doctypeSet.add(r.doctype);
      }
    }

    const items = [...doctypeSet].toSorted().map((dt) => ({
      label: dt,
      value: `${basePath}/${dt}`,
      active: activePath === `${basePath}/${dt}`,
      onPress: () => onNavigate?.(`${basePath}/${dt}`),
    }));

    if (items.length === 0) {
      return [];
    }
    return [{ title: t('Modules'), items }];
  }, [moduleResults, basePath, activePath, onNavigate, t]);

  // Build sidebar sections
  const sections = useMemo<SidebarSection[]>(() => {
    const result: SidebarSection[] = [];

    if (recentItems.length > 0) {
      result.push({
        title: t('Recent'),
        items: recentItems.map((item) => ({
          label: item.label,
          value: item.path,
          onPress: () => onNavigate?.(item.path),
          active: activePath === item.path,
        })),
      });
    }

    if (favoriteItems.length > 0) {
      result.push({
        title: t('Favorites'),
        items: favoriteItems.map((item) => ({
          label: item.label,
          value: item.path,
          onPress: () => onNavigate?.(item.path),
          active: activePath === item.path,
        })),
      });
    }

    result.push(...modulesSections);

    return result;
  }, [recentItems, favoriteItems, modulesSections, activePath, onNavigate, t]);

  return <Sidebar sections={sections} />;
};
