import { sizeRecipeEscape } from '@repo/theme';
// Contract: desk list-view left sidebar — facet filters (assigned to,
// created by, tags, status) with counts; clicking applies filters. Keep
// props stable — list-core imports this.
//
// Facet sources (probed against a stock bench):
// - Assigned To / Created By: POST frappe.desk.listview.get_group_by_count
//   {doctype, current_filters: JSON string, field: "assigned_to" | "owner"}
// - Tags / status field: POST frappe.desk.reportview.get_sidebar_stats
//   {stats: '["_user_tags"]', doctype, filters: JSON string}
//   (get_group_by_count rejects `_user_tags` — not a meta/default field)
// Fetch/scrub details live in sidebar-stats.tsx; the collapsible chrome in
// sidebar-section.tsx. Desk parity notes:
// - Counts respect every OTHER active filter (own-field tuples excluded),
//   like desk's group-by sidebar.
// - Clicking a row clears the facet's fieldname then applies the tuple
//   unless it was already active (desk toggle/replace semantics).
// - "No Tags" applies desk's `["_user_tags", "not like", "%,%"]` tuple.
import { Accordion, SizableText, YStack } from '@repo/ui';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useBackofficeCapabilities } from '../config/BackofficeProvider';
import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';
import type { FrappeFilter, FrappeFilters } from '../shared/types';
import type { DocFieldMeta, DoctypeMeta } from '../shared/use-doctype-meta';
import { useSessionUserId as useSessionUser } from '../shared/use-session-user-id';

import { SidebarFacetRow, SidebarSectionChrome, SidebarSectionSkeleton } from './sidebar-section';
import { isFacetFilterActive, scrubUserFacetRows, toggleFacetFilter, useSidebarStats } from './sidebar-stats';
import type { SidebarFacetCount, SidebarFacetState, SidebarStatsState } from './sidebar-stats';

/** Facet sections a host can hide from the list sidebar. */
export type ListSidebarSection = 'assigned' | 'owner' | 'tags' | 'status';

export interface ListSidebarProps {
  doctype: string;
  meta?: DoctypeMeta;
  filters: FrappeFilters;
  onFiltersChange: (filters: FrappeFilters) => void;
  /**
   * Hide individual facet sections. The `assignments`/`tags` capabilities
   * additionally gate their sections regardless of this prop.
   */
  hiddenSections?: readonly ListSidebarSection[];
}

/** The Select field powering the status facet (plain status or workflow state). */
const findStatusField = (meta?: DoctypeMeta): DocFieldMeta | undefined => {
  const fields = meta?.fields;
  if (!fields) {
    return undefined;
  }
  return (
    fields.find((field) => field.fieldtype === 'Select' && field.fieldname === 'status') ??
    fields.find((field) => field.fieldtype === 'Select' && field.fieldname === 'workflow_state')
  );
};

interface FacetSectionModel {
  key: keyof SidebarStatsState;
  title: string;
  state: SidebarFacetState;
  /** Render-ready rows (scrubbed / empties collapsed). */
  rows: SidebarFacetCount[];
  makeTuple: (row: SidebarFacetCount) => FrappeFilter;
  rowLabel: (row: SidebarFacetCount) => string;
}

const SECTION_KEYS = ['assigned', 'owner', 'tags', 'status'];

export const ListSidebar = ({ doctype, meta, filters, onFiltersChange, hiddenSections }: ListSidebarProps) => {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const sessionUser = useSessionUser();
  const capabilities = useBackofficeCapabilities();
  const statusField = useMemo(() => findStatusField(meta), [meta]);
  const stats = useSidebarStats({ doctype, filters, statusFieldname: statusField?.fieldname });

  // Section visibility: host prop + capability flags (assignments → the
  // Assigned To facet, tags → the Tags facet).
  const hidden = useMemo(() => {
    const set = new Set<ListSidebarSection>(hiddenSections);
    if (!capabilities.assignments.enabled) {
      set.add('assigned');
    }
    if (!capabilities.tags.enabled) {
      set.add('tags');
    }
    return set;
  }, [hiddenSections, capabilities.assignments.enabled, capabilities.tags.enabled]);

  const handleToggle = useCallback(
    (tuple: FrappeFilter) => {
      onFiltersChange(toggleFacetFilter(filters, tuple));
    },
    [filters, onFiltersChange],
  );

  const userLabel = useCallback(
    (row: SidebarFacetCount) => (row.value === sessionUser ? t('list.me', 'Me') : row.value),
    [sessionUser, t],
  );

  const sections = useMemo<FacetSectionModel[]>(() => {
    const tagRows = stats.tags.rows ?? [];
    const models: FacetSectionModel[] = [
      {
        key: 'assigned',
        title: t('list.assignedTo', 'Assigned To'),
        state: stats.assigned,
        rows: scrubUserFacetRows(stats.assigned.rows ?? [], sessionUser),
        makeTuple: (row) => ['_assign', 'like', `%${row.value}%`],
        rowLabel: userLabel,
      },
      {
        key: 'owner',
        title: t('list.createdBy', 'Created By'),
        state: stats.owner,
        rows: scrubUserFacetRows(stats.owner.rows ?? [], sessionUser),
        makeTuple: (row) => ['owner', '=', row.value],
        rowLabel: userLabel,
      },
      {
        key: 'tags',
        title: t('list.tags', 'Tags'),
        state: stats.tags,
        // A lone "No Tags" pseudo-row means no tags exist at all — empty.
        rows: tagRows.some((row) => !row.isNoTags) ? tagRows : [],
        makeTuple: (row) =>
          row.isNoTags ? ['_user_tags', 'not like', '%,%'] : ['_user_tags', 'like', `%${row.value}%`],
        rowLabel: (row) => (row.isNoTags ? t('list.noTags', 'No Tags') : row.value),
      },
    ];
    const statusFieldname = statusField?.fieldname;
    if (statusField !== undefined && statusFieldname !== undefined && statusFieldname !== '') {
      models.push({
        key: 'status',
        title: statusField.label ?? t('list.status', 'Status'),
        state: stats.status,
        rows: stats.status.rows ?? [],
        makeTuple: (row) => [statusFieldname, '=', row.value],
        rowLabel: (row) => row.value,
      });
    }
    return models.filter((model) => !hidden.has(model.key));
  }, [stats, statusField, sessionUser, userLabel, t, hidden]);

  // Every section hidden (host prop / capabilities) — render nothing.
  if (sections.length === 0) {
    return null;
  }

  // Whole surface unavailable — every facet errored (e.g. no read perm).
  const unavailable = sections.every((section) => !section.state.loading && section.state.error !== undefined);

  return (
    <YStack
      width={sizeRecipeEscape(200, 'list sidebar: a fixed facet column beside the list')}
      paddingRight="$2"
      paddingBottom="$4"
      aria-label={t('list.sidebarLabel', 'List filters sidebar')}>
      {unavailable ? (
        <SizableText
          size="$2"
          color="$color9"
          padding="$2">
          {t('list.facetsUnavailable', 'Filters sidebar unavailable')}
        </SizableText>
      ) : (
        <Accordion
          type="multiple"
          defaultValue={SECTION_KEYS}
          variant="plain">
          {sections.map((section) => {
            // Empty (or errored) facets are hidden once resolved.
            if (!section.state.loading && section.rows.length === 0) {
              return null;
            }
            return (
              <Accordion.Item
                key={section.key}
                value={section.key}>
                <SidebarSectionChrome title={section.title}>
                  {section.state.loading ? (
                    <SidebarSectionSkeleton />
                  ) : (
                    section.rows.map((row) => {
                      const tuple = section.makeTuple(row);
                      return (
                        <SidebarFacetRow
                          key={row.value}
                          label={section.rowLabel(row)}
                          count={row.count}
                          active={isFacetFilterActive(filters, tuple)}
                          onPress={() => {
                            handleToggle(tuple);
                          }}
                        />
                      );
                    })
                  )}
                </SidebarSectionChrome>
              </Accordion.Item>
            );
          })}
        </Accordion>
      )}
    </YStack>
  );
};
