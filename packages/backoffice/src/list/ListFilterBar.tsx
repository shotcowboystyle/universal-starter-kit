import { HeartIcon } from '@phosphor-icons/react';
import { Button } from '@repo/forms';
import { useResolvedKnobs } from '@repo/theme';
// Contract: filter chrome for the list surface (standard filters from meta,
// filter editor, saved filters, sort control). Keep props stable — the
// list-core composer imports this.
//
// Desk filter-chrome parity, one row of controls + a chips row:
//   - quick standard filters (in_standard_filter fields → kind-aware inline
//     controls) — filter-standard.tsx
//   - "Filter" button → popover editor over every applied tuple with desk's
//     operator vocabulary (=, !=, like, not like, in, not in, comparisons,
//     between, is set / is not set) — filter-editor.tsx
//   - saved filters (desk `List Filter` doctype through the table package's
//     useSavedFilters/SavedFilterDropdown/FilterManager) — filter-saved.tsx
//   - sort selector + asc/desc toggle (meta.sort_field defaults) —
//     filter-sort.tsx
//   - removable chips for every applied tuple (catalog Chip) —
//     filter-chips.tsx
// ONE FILTER SYSTEM (MOD-04): this bar is the single filter authority for
// the list. The DataTable's own filter chrome is suppressed by list-core
// (DoctypeListScreen passes enableFiltering={false}); the table keeps only
// search + header sort.
import { XStack, YStack } from '@repo/ui';
import { useTranslation } from 'react-i18next';

import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';
import type { FrappeFilter, FrappeFilters } from '../shared/types';
import type { DoctypeMeta } from '../shared/use-doctype-meta';

import { FilterChips } from './filter-chips';
import { FilterEditorButton } from './filter-editor';
import { SavedFiltersControl } from './filter-saved';
import { SortControl } from './filter-sort';
import { StandardFilters } from './filter-standard';
import { ListToolsButton } from './list-tools-sheet';
import { isFacetFilterActive, toggleFacetFilter } from './sidebar-stats';

export interface ListFilterBarProps {
  doctype: string;
  meta?: DoctypeMeta;
  filters: FrappeFilters;
  onFiltersChange: (filters: FrappeFilters) => void;
  sortField?: string;
  sortOrder?: 'asc' | 'desc';
  onSortChange?: (field: string, order: 'asc' | 'desc') => void;
  /**
   * Compact viewports collapse the whole bar behind one badge-counted
   * "Filter" button opening the list-tools sheet (LC-06) — no stacked
   * always-visible rows.
   */
  compact?: boolean;
  /**
   * When false, skip the chips row — the host renders FilterChips itself
   * (DoctypeListScreen puts them under the dense toolbar so they are not
   * chrome). Default true for standalone / story use.
   */
  showChips?: boolean;
  /**
   * Session user id — when set, a header heart toggles the desk liked-by-me
   * filter (`_liked_by like %user%`). Omitted when there is no session.
   */
  likedByUser?: string;
}

export const ListFilterBar = ({
  doctype,
  meta,
  filters,
  onFiltersChange,
  sortField,
  sortOrder,
  onSortChange,
  compact,
  showChips = true,
  likedByUser,
}: ListFilterBarProps) => {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const { knobProps } = useResolvedKnobs();
  const iconSize = knobProps.controlIcon?.width || 16;
  const likedTuple: FrappeFilter | undefined =
    likedByUser === undefined || likedByUser === '' ? undefined : ['_liked_by', 'like', `%${likedByUser}%`];
  const likedActive = likedTuple ? isFacetFilterActive(filters, likedTuple) : false;
  const likedButton = likedTuple ? (
    <Button
      size={knobProps.sizeToken}
      circular
      chromeless
      // SAFETY: both are theme color tokens; Button's `col` prop type does not list theme tokens
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
      col={(likedActive ? '$red10' : '$color8') as never}
      icon={
        <HeartIcon
          size={iconSize}
          weight={likedActive ? 'fill' : 'regular'}
        />
      }
      aria-pressed={likedActive}
      aria-label={t('list.likedByMe', 'Liked by me')}
      onPress={() => {
        onFiltersChange(toggleFacetFilter(filters, likedTuple));
      }}
    />
  ) : null;
  if (compact) {
    return (
      <XStack
        {...knobProps.gap}
        alignItems="center">
        <ListToolsButton
          doctype={doctype}
          meta={meta}
          filters={filters}
          onFiltersChange={onFiltersChange}
          sortField={sortField}
          sortOrder={sortOrder}
          onSortChange={onSortChange}
        />
        {likedButton}
      </XStack>
    );
  }
  const controls = (
    <XStack
      {...knobProps.gap}
      alignItems="center"
      flexWrap="wrap">
      <StandardFilters
        meta={meta}
        filters={filters}
        onFiltersChange={onFiltersChange}
      />
      <FilterEditorButton
        meta={meta}
        filters={filters}
        onFiltersChange={onFiltersChange}
      />
      <SavedFiltersControl
        doctype={doctype}
        filters={filters}
        onFiltersChange={onFiltersChange}
      />
      <SortControl
        meta={meta}
        sortField={sortField}
        sortOrder={sortOrder}
        onSortChange={onSortChange}
      />
      {likedButton}
    </XStack>
  );
  if (!showChips) {
    return controls;
  }
  return (
    <YStack {...knobProps.gap}>
      {controls}
      <FilterChips
        meta={meta}
        filters={filters}
        onFiltersChange={onFiltersChange}
      />
    </YStack>
  );
};
