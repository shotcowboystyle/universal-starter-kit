// Data layer for the desk "Connections" tab: groups meta.links the way
// frappe's meta.get_dashboard_data() does, and loads per-doctype counts via
// frappe.desk.notifications.get_open_count with a per-link
// frappe.client.get_count fallback.
import type { FrappeApp } from '@repo/frappe';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { BackofficePaths } from '../navigation/paths';
import type { FrappeFilters } from '../shared/types';
import type { DocLinkMeta, DoctypeMeta } from '../shared/use-doctype-meta';
import { useFrappeApp } from '../shared/use-frappe-app';

/** One connections row derived from a visible `meta.links` entry. */
export interface ConnectionLink {
  /**
   * Doctype the row represents. For child-table ("internal") links desk uses
   * the child's parent doctype (`parent_doctype`), not `link_doctype`.
   */
  targetDoctype: string;
  /** Fieldname on the target doctype that points back at this document. */
  linkFieldname: string;
  /**
   * Internal link: the connection lives in THIS doc's child rows, so counts
   * and navigation come from the `names` returned by get_open_count.
   */
  isChildTable: boolean;
}

/** A titled group of connection rows (a desk `transactions` group). */
export interface ConnectionGroup {
  /** Raw group label from the link row; undefined → caller shows "Reference". */
  label?: string;
  links: ConnectionLink[];
}

/** The doctype a visible link row points at, or undefined for hidden/targetless rows. */
const connectionTarget = (row: DocLinkMeta | null): string | undefined => {
  // Wire rows can be null on half-migrated benches.
  if (row == null || row.hidden === 1) {
    return undefined;
  }
  const parentDoctype = row.parent_doctype ?? '';
  const targetDoctype = row.is_child_table === 1 && parentDoctype !== '' ? parentDoctype : row.link_doctype;
  return targetDoctype || undefined;
};

/**
 * Group visible meta.links rows by `group` label, preserving first-seen order
 * and deduping doctypes within a group — mirrors
 * frappe.model.meta.Meta.add_doctype_links (hidden rows skipped, internal
 * links keyed by parent_doctype).
 */
export const groupConnectionLinks = (meta?: DoctypeMeta): ConnectionGroup[] => {
  const groups: ConnectionGroup[] = [];
  for (const row of meta?.links ?? []) {
    const targetDoctype = connectionTarget(row);
    if (targetDoctype === undefined) {
      continue;
    }
    const label = row.group ?? undefined;
    let group = groups.find((g) => (g.label ?? '') === (label ?? ''));
    if (!group) {
      group = { label, links: [] };
      groups.push(group);
    }
    if (!group.links.some((link) => link.targetDoctype === targetDoctype)) {
      group.links.push({ targetDoctype, linkFieldname: row.link_fieldname, isChildTable: Boolean(row.is_child_table) });
    }
  }
  return groups;
};

/** Count data for one linked doctype ("?" = server-side count timeout). */
export interface ConnectionCount {
  count?: number | string;
  openCount?: number | string;
  /** Linked docnames for internal links (drives the `name in (...)` filter). */
  names?: string[];
}

interface OpenCountEntry {
  doctype?: string;
  count?: number | string;
  open_count?: number | string;
  names?: string[];
}

/** get_open_count's `count`; degrades to [] while the bench migrates/installs. */
type OpenCountReply = { external_links_found?: OpenCountEntry[]; internal_links_found?: OpenCountEntry[] } | unknown[];

interface OpenCountPayload {
  message?: {
    count?: OpenCountReply;
  };
}

/** Counts keyed by ConnectionLink.targetDoctype. */
export interface ConnectionCountMap {
  [targetDoctype: string]: ConnectionCount;
}

export interface ConnectionCounts {
  /** Keyed by ConnectionLink.targetDoctype. */
  counts: ConnectionCountMap;
  loading: boolean;
}

/** Per-doctype counts from a get_open_count reply (`[]` while the bench migrates). */
const parseOpenCounts = (raw: OpenCountReply | undefined): ConnectionCountMap => {
  const counts: ConnectionCountMap = {};
  if (!raw || Array.isArray(raw)) {
    return counts;
  }
  for (const entry of raw.external_links_found ?? []) {
    if (entry?.doctype !== undefined && entry.doctype !== '') {
      counts[entry.doctype] = { count: entry.count, openCount: entry.open_count };
    }
  }
  for (const entry of raw.internal_links_found ?? []) {
    if (entry?.doctype !== undefined && entry.doctype !== '') {
      counts[entry.doctype] = { count: entry.count, openCount: entry.open_count, names: entry.names };
    }
  }
  return counts;
};

/** Fallback counts: one frappe.client.get_count per external link; failures stay uncounted. */
const countExternalLinks = async (
  app: FrappeApp,
  links: readonly ConnectionLink[],
  name: string,
): Promise<ConnectionCountMap> => {
  const external = links.filter((link) => !link.isChildTable);
  const pairs = await Promise.all(
    external.map(async (link) => {
      try {
        const res = await app.call().get<{ message?: number }>('frappe.client.get_count', {
          doctype: link.targetDoctype,
          filters: { [link.linkFieldname]: name },
        });
        return [link.targetDoctype, res.payload?.message] as const;
      } catch {
        // An uncountable link renders without a badge.
        return [link.targetDoctype, undefined] as const;
      }
    }),
  );
  const counts: ConnectionCountMap = {};
  for (const [target, count] of pairs) {
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- get_count is wire data; only a number is a count
    if (typeof count === 'number') {
      counts[target] = { count };
    }
  }
  return counts;
};

/**
 * Load linked-document counts for a doc in one
 * `frappe.desk.notifications.get_open_count` call. When that endpoint fails
 * (permissions, older bench) falls back to one `frappe.client.get_count` per
 * external link; internal links need the doc's child rows server-side, so
 * they stay uncounted in fallback mode.
 */
export const useConnectionCounts = (doctype: string, name: string, links: ConnectionLink[]): ConnectionCounts => {
  const app = useFrappeApp();
  const [state, setState] = useState<ConnectionCounts>({ counts: {}, loading: links.length > 0 });
  // Refetch keys off the link signature (not array identity) so callers don't
  // have to memoize the links array.
  const linksKey = useMemo(
    () =>
      links
        .map((link) => `${link.targetDoctype}\u0000${link.linkFieldname}\u0000${link.isChildTable ? 1 : 0}`)
        .join('\n'),
    [links],
  );
  const linksRef = useRef(links);
  // oxlint-disable-next-line react/refs -- latest-value ref synced during render; the effect keys off linksKey instead
  linksRef.current = links;

  useEffect(() => {
    const currentLinks = linksRef.current;
    if (!app || !doctype || !name || currentLinks.length === 0) {
      setState({ counts: {}, loading: false });
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
    }
    let cancelled = false;
    setState({ counts: {}, loading: true });
    const load = async () => {
      let counts: ConnectionCountMap;
      try {
        const res = await app
          .call()
          .get<OpenCountPayload>('frappe.desk.notifications.get_open_count', { doctype, name });
        counts = parseOpenCounts(res.payload?.message?.count);
      } catch {
        // get_open_count is refused on some benches: count each external link instead.
        if (cancelled) {
          return;
        }
        counts = await countExternalLinks(app, currentLinks, name);
      }
      if (!cancelled) {
        setState({ counts, loading: false });
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- linksKey is the refetch trigger: the link signature, not the array identity
  }, [app, doctype, name, linksKey]);

  return state;
};

/**
 * Badge text for a count value. Mirrors desk: zero hides the badge, the
 * server caps count scans at 100 rows so 100 renders as "99+", and a
 * server-side count timeout arrives as the literal string "?".
 */
export const formatConnectionCount = (value: number | string | undefined): string | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- discriminates the count union: "?" (timeout) arrives as a string
  if (typeof value === 'string') {
    return value || undefined;
  }
  if (value <= 0) {
    return undefined;
  }
  return value >= 100 ? '99+' : String(value);
};

/**
 * Filters the target list opens with (the list surface parses `?f=`).
 * External links filter by the back-reference field; internal links match
 * desk and filter by the child-row names collected by get_open_count.
 */
export const connectionListFilters = (link: ConnectionLink, docname: string, names?: string[]): FrappeFilters => {
  if (link.isChildTable) {
    return [['name', 'in', names ?? []]];
  }
  return [[link.linkFieldname, '=', docname]];
};

/**
 * Href for a connection row: filtered list of the target doctype. Takes the
 * provider's basePath-aware `paths` (from `useBackofficePaths()`).
 */
export const connectionListHref = (
  paths: BackofficePaths,
  link: ConnectionLink,
  docname: string,
  names?: string[],
): string => {
  const filters = connectionListFilters(link, docname, names);
  return `${paths.list(link.targetDoctype)}?f=${encodeURIComponent(JSON.stringify(filters))}`;
};
