// Data layer for the desk "Connections" tab: groups meta.links the way
// frappe's meta.get_dashboard_data() does, and loads per-doctype counts via
// frappe.desk.notifications.get_open_count with a per-link
// frappe.client.get_count fallback.
import { useEffect, useMemo, useRef, useState } from 'react';

import type { BackofficePaths } from '../navigation/paths';
import type { FrappeFilters } from '../shared/types';
import type { DoctypeMeta } from '../shared/useDoctypeMeta';
import { useFrappeApp } from '../shared/useFrappeApp';

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

/**
 * Group visible meta.links rows by `group` label, preserving first-seen order
 * and deduping doctypes within a group — mirrors
 * frappe.model.meta.Meta.add_doctype_links (hidden rows skipped, internal
 * links keyed by parent_doctype).
 */
export function groupConnectionLinks(meta?: DoctypeMeta): ConnectionGroup[] {
  const groups: ConnectionGroup[] = [];
  for (const row of meta?.links ?? []) {
    if (!row || row.hidden) {
      continue;
    }
    const isChildTable = Boolean(row.is_child_table);
    const parentDoctype = typeof row.parent_doctype === 'string' ? row.parent_doctype : '';
    const targetDoctype = (isChildTable && parentDoctype) || row.link_doctype;
    if (!targetDoctype) {
      continue;
    }
    const label = row.group ?? undefined;
    let group = groups.find((g) => (g.label ?? '') === (label ?? ''));
    if (!group) {
      group = { label, links: [] };
      groups.push(group);
    }
    if (group.links.some((link) => link.targetDoctype === targetDoctype)) {
      continue;
    }
    group.links.push({ targetDoctype, linkFieldname: row.link_fieldname, isChildTable });
  }
  return groups;
}

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

interface OpenCountPayload {
  message?: {
    /** Degrades to [] while the bench migrates/installs. */
    count?: { external_links_found?: OpenCountEntry[]; internal_links_found?: OpenCountEntry[] } | unknown[];
  };
}

export interface ConnectionCounts {
  /** Keyed by ConnectionLink.targetDoctype. */
  counts: Record<string, ConnectionCount>;
  loading: boolean;
}

/**
 * Load linked-document counts for a doc in one
 * `frappe.desk.notifications.get_open_count` call. When that endpoint fails
 * (permissions, older bench) falls back to one `frappe.client.get_count` per
 * external link; internal links need the doc's child rows server-side, so
 * they stay uncounted in fallback mode.
 */
export function useConnectionCounts(doctype: string, name: string, links: ConnectionLink[]): ConnectionCounts {
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
  linksRef.current = links;

  useEffect(() => {
    const currentLinks = linksRef.current;
    if (!app || !doctype || !name || currentLinks.length === 0) {
      setState({ counts: {}, loading: false });
      return;
    }
    let cancelled = false;
    setState({ counts: {}, loading: true });
    app
      .call()
      .get<OpenCountPayload>('frappe.desk.notifications.get_open_count', { doctype, name })
      .then((res) => {
        if (cancelled) {
          return;
        }
        const counts: Record<string, ConnectionCount> = {};
        const raw = res.payload?.message?.count;
        if (raw && !Array.isArray(raw)) {
          for (const entry of raw.external_links_found ?? []) {
            if (!entry?.doctype) {
              continue;
            }
            counts[entry.doctype] = { count: entry.count, openCount: entry.open_count };
          }
          for (const entry of raw.internal_links_found ?? []) {
            if (!entry?.doctype) {
              continue;
            }
            counts[entry.doctype] = {
              count: entry.count,
              openCount: entry.open_count,
              names: entry.names,
            };
          }
        }
        setState({ counts, loading: false });
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        const external = currentLinks.filter((link) => !link.isChildTable);
        Promise.all(
          external.map(
            async (link) =>
              await app
                .call()
                .get<{ message?: number }>('frappe.client.get_count', {
                  doctype: link.targetDoctype,
                  filters: { [link.linkFieldname]: name },
                })
                .then((res) => [link.targetDoctype, res.payload?.message] as const)
                .catch(() => [link.targetDoctype, undefined] as const),
          ),
        ).then((pairs) => {
          if (cancelled) {
            return;
          }
          const counts: Record<string, ConnectionCount> = {};
          for (const [target, count] of pairs) {
            if (typeof count === 'number') {
              counts[target] = { count };
            }
          }
          setState({ counts, loading: false });
        });
      });
    return () => {
      cancelled = true;
    };
  }, [app, doctype, name, linksKey]);

  return state;
}

/**
 * Badge text for a count value. Mirrors desk: zero hides the badge, the
 * server caps count scans at 100 rows so 100 renders as "99+", and a
 * server-side count timeout arrives as the literal string "?".
 */
export function formatConnectionCount(value: number | string | undefined): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'string') {
    return value || undefined;
  }
  if (value <= 0) {
    return undefined;
  }
  return value >= 100 ? '99+' : String(value);
}

/**
 * Filters the target list opens with (the list surface parses `?f=`).
 * External links filter by the back-reference field; internal links match
 * desk and filter by the child-row names collected by get_open_count.
 */
export function connectionListFilters(link: ConnectionLink, docname: string, names?: string[]): FrappeFilters {
  if (link.isChildTable) {
    return [['name', 'in', names ?? []]];
  }
  return [[link.linkFieldname, '=', docname]];
}

/**
 * Href for a connection row: filtered list of the target doctype. Takes the
 * provider's basePath-aware `paths` (from `useBackofficePaths()`).
 */
export function connectionListHref(
  paths: BackofficePaths,
  link: ConnectionLink,
  docname: string,
  names?: string[],
): string {
  const filters = connectionListFilters(link, docname, names);
  return `${paths.list(link.targetDoctype)}?f=${encodeURIComponent(JSON.stringify(filters))}`;
}
