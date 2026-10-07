// Section model for the backoffice command palette (MOD-01) — ONE data hook
// consumed by both palette containers (centered overlay ≥sm, full sheet <sm).
//
// Composes the awesomebar data layer (catalog, global search, recent,
// ranking) into fixed-order sections:
//   Recents    → readRecentItems store (query-filtered while typing)
//   Actions    → contextual commands for the best doctype match
//                ("New X", "X List / Report / Kanban" — capability-gated)
//   Navigation → workspaces + doctypes from the catalog (rankNameMatches)
//   Documents  → frappe.utils.global_search hits (doctype badge + snippet)
//
// Empty sections are dropped; the provider's doctype scope (allow/deny)
// filters every doctype-derived row; `newDoc` and `views` capabilities gate
// the action commands.
import { ClockIcon, FileTextIcon, GlobeIcon, KanbanIcon, ListIcon, PlusIcon, TableIcon } from '@phosphor-icons/react';
import type { FC } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackofficeCapabilities, useBackofficePaths, useIsDoctypeAllowed } from '../config/BackofficeProvider';
import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';

import {
  matchQueryIndices,
  rankNameMatches,
  readRecentItems,
  toContentSnippet,
  useAwesomebarCatalog,
  useGlobalSearch,
} from './awesomebar-data';
import type { RecentItem } from './awesomebar-data';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IconProps {
  size?: number | string;
  color?: string;
}

export type CommandPaletteSectionId = 'recent' | 'actions' | 'navigation' | 'documents';

export interface CommandPaletteItem {
  id: string;
  label: string;
  /** Muted one-line detail under the label (document content snippet). */
  description?: string;
  /** Right-aligned type badge ("Workspace", "DocType", the hit's doctype). */
  badge?: string;
  icon: FC<IconProps>;
  path: string;
}

export interface CommandPaletteSection {
  id: CommandPaletteSectionId;
  /** Translated section header. */
  label: string;
  items: CommandPaletteItem[];
}

export interface CommandPaletteModel {
  /** Non-empty sections in fixed order (recent → actions → navigation → documents). */
  sections: CommandPaletteSection[];
  /** Section items flattened in render order — the roving-highlight index space. */
  items: CommandPaletteItem[];
  /** Global search in flight for the debounced query. */
  searching: boolean;
  /** The trimmed query the sections were built from. */
  query: string;
  /** Trimmed query is non-empty. */
  hasQuery: boolean;
  /** A settled non-empty query produced zero rows (honest empty state). */
  noResults: boolean;
}

// ---------------------------------------------------------------------------
// Limits (desk-style caps per section)
// ---------------------------------------------------------------------------

const maxRecentsEmptyQuery = 8;
const maxRecentsWithQuery = 4;
const maxNavWorkspaces = 4;
const maxNavDoctypes = 4;

/** Action view commands for the top doctype match, in render order. */
const actionViews = ['list', 'report', 'kanban'] as const;

const actionViewIcons: Record<(typeof actionViews)[number], FC<IconProps>> = {
  list: ListIcon,
  report: TableIcon,
  kanban: KanbanIcon,
};

// Explicit (greppable) i18n keys per view command.
const actionViewLabelKeys: Record<(typeof actionViews)[number], { key: string; defaultValue: string }> = {
  list: { key: 'awesomebar.listCommand', defaultValue: '{{doctype}} List' },
  report: { key: 'awesomebar.reportCommand', defaultValue: '{{doctype}} Report' },
  kanban: { key: 'awesomebar.kanbanCommand', defaultValue: '{{doctype}} Kanban' },
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseCommandPaletteModelOptions {
  /** Raw query (drives catalog-derived sections synchronously). */
  query: string;
  /** Debounced query (drives the global_search RPC). */
  debouncedQuery: string;
  /** Palette visibility — recent are re-read on every open. */
  open: boolean;
}

export function useCommandPaletteModel({
  query,
  debouncedQuery,
  open,
}: UseCommandPaletteModelOptions): CommandPaletteModel {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const paths = useBackofficePaths();
  const capabilities = useBackofficeCapabilities();
  const isDoctypeAllowed = useIsDoctypeAllowed();

  const { catalog } = useAwesomebarCatalog();
  const { hits, searching } = useGlobalSearch(debouncedQuery);
  const [recent, setRecents] = useState<RecentItem[]>([]);

  // Fresh recent on every open (another surface may have pushed a visit
  // since the last open).
  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    void readRecentItems().then((stored) => {
      if (!cancelled) {
        setRecents(stored);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const trimmed = query.trim();

  const sections = useMemo<CommandPaletteSection[]>(() => {
    const next: CommandPaletteSection[] = [];

    // ── Recents ──────────────────────────────────────────────────────────
    const matchingRecents = trimmed
      ? recent.filter((recent) => matchQueryIndices(trimmed, recent.label) !== null).slice(0, maxRecentsWithQuery)
      : recent.slice(0, maxRecentsEmptyQuery);
    if (matchingRecents.length > 0) {
      next.push({
        id: 'recent',
        label: t('awesomebar.recent', 'Recents'),
        items: matchingRecents.map((recent) => ({
          id: `recent:${recent.path}`,
          label: recent.label,
          path: recent.path,
          icon: ClockIcon,
        })),
      });
    }

    if (trimmed) {
      const scopedDoctypes = (catalog?.doctypes ?? []).filter(isDoctypeAllowed);
      const rankedDoctypes = rankNameMatches(trimmed, scopedDoctypes, maxNavDoctypes + 1);
      const topDoctype = rankedDoctypes[0];

      // ── Actions: contextual commands for the best doctype match ────────
      const actionItems: CommandPaletteItem[] = [];
      if (topDoctype) {
        if (capabilities.newDoc.enabled) {
          actionItems.push({
            id: `new:${topDoctype}`,
            label: t('awesomebar.newCommand', {
              defaultValue: 'New {{doctype}}',
              doctype: topDoctype,
            }),
            path: paths.newDoc(topDoctype),
            icon: PlusIcon,
          });
        }
        if (capabilities.views.enabled) {
          for (const view of actionViews) {
            if (!capabilities.views.allow.includes(view)) {
              continue;
            }
            const { key, defaultValue } = actionViewLabelKeys[view];
            actionItems.push({
              id: `${view}:${topDoctype}`,
              label: t(key, { defaultValue, doctype: topDoctype }),
              path: paths.view(topDoctype, view),
              icon: actionViewIcons[view],
            });
          }
        }
      }
      if (actionItems.length > 0) {
        next.push({
          id: 'actions',
          label: t('awesomebar.actions', 'Actions'),
          items: actionItems,
        });
      }

      // ── Navigation: workspaces + further doctypes from the catalog ─────
      const navigationItems: CommandPaletteItem[] = [];
      const workspaces = catalog?.workspaces ?? [];
      const byTitle = new Map(workspaces.map((workspace) => [workspace.title, workspace]));
      for (const title of rankNameMatches(
        trimmed,
        workspaces.map((workspace) => workspace.title),
        maxNavWorkspaces,
      )) {
        const workspace = byTitle.get(title);
        if (!workspace) {
          continue;
        }
        navigationItems.push({
          id: `workspace:${workspace.name}`,
          label: workspace.title,
          badge: t('awesomebar.workspaceBadge', 'Workspace'),
          path: paths.workspace(workspace.name),
          icon: GlobeIcon,
        });
      }
      // The top match already owns the Actions section — list the rest.
      for (const doctype of rankedDoctypes.slice(topDoctype ? 1 : 0, maxNavDoctypes + 1)) {
        navigationItems.push({
          id: `doctype:${doctype}`,
          label: doctype,
          badge: t('awesomebar.doctypeBadge', 'DocType'),
          path: paths.list(doctype),
          icon: ListIcon,
        });
      }
      if (navigationItems.length > 0) {
        next.push({
          id: 'navigation',
          label: t('awesomebar.navigation', 'Navigation'),
          items: navigationItems,
        });
      }

      // ── Documents: global-search hits (scope-filtered) ──────────────────
      const documentItems: CommandPaletteItem[] = [];
      for (const hit of hits) {
        if (!isDoctypeAllowed(hit.doctype)) {
          continue;
        }
        documentItems.push({
          id: `doc:${hit.doctype}:${hit.name}`,
          label: hit.name,
          badge: hit.doctype,
          description: toContentSnippet(hit.content),
          path: paths.form(hit.doctype, hit.name),
          icon: FileTextIcon,
        });
      }
      if (documentItems.length > 0) {
        next.push({
          id: 'documents',
          label: t('awesomebar.documents', 'Documents'),
          items: documentItems,
        });
      }
    }

    return next;
  }, [trimmed, recent, catalog, hits, capabilities, paths, isDoctypeAllowed, t]);

  const items = useMemo(() => sections.flatMap((section) => section.items), [sections]);

  return {
    sections,
    items,
    searching,
    query: trimmed,
    hasQuery: Boolean(trimmed),
    noResults: Boolean(trimmed) && !searching && items.length === 0,
  };
}
