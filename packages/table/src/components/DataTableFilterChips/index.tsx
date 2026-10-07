/**
 * DataTableFilterChips — the visibility surface for EVERY active filter
 * (Axiom 6 HONEST STATE): toolbar/hidden-field filters AND column-funnel
 * filters render as removable chips under the toolbar, so the user always
 * sees what is filtering the data — especially filters on fields with no
 * visible column.
 *
 * Chip press reopens the shared editor pre-filled (filterUi channel), the X
 * removes (44px target via Chip), "Clear all" appears at 2+ chips.
 *
 * Anatomy follows Polaris Index Filters + Linear: wrapping pills, gray fill
 * (not a hue border), Clear all as a text control — LC-71 selected = fill.
 */

import { Button } from '@repo/forms';
import { useCallback, useMemo } from 'react';
import { XStack } from 'tamagui';

import { t } from '../../shared/t';
import type { FilterValue, ResolvedFilterField } from '../../types';
import { getFilterChipLabel, isFilterValueShape } from '../../utils/filterFields';
import type { FilterEditTarget } from '../DataTable/DataTableStateContext';
import { useDataTableState } from '../DataTable/DataTableStateContext';

import { FilterChip } from './FilterChip';

export { FilterChip } from './FilterChip';
export type { FilterChipProps } from './FilterChip';

interface FilterChipModel {
  key: string;
  label: string;
  target: FilterEditTarget;
  onRemove: () => void;
}

export function DataTableFilterChips() {
  const ctx = useDataTableState();

  const fields: ResolvedFilterField[] = ctx?.computed?.filterFields ?? [];
  const fieldFor = useCallback((id: string) => fields.find((f) => f.id === id), [fields]);

  const chips = useMemo<FilterChipModel[]>(() => {
    if (!ctx) {
      return [];
    }
    const items: FilterChipModel[] = [];
    for (const filter of ctx.state.filters ?? []) {
      const field = fieldFor(filter.columnId);
      const label = getFilterChipLabel(field?.label ?? filter.label ?? filter.columnId, filter.value, field?.options);
      items.push({
        key: `advanced-${filter.id}`,
        label,
        target: { kind: 'advanced', filterId: filter.id },
        onRemove: () => {
          ctx.actions.removeFilter(filter.id);
        },
      });
    }
    for (const columnFilter of ctx.state.columnFilters ?? []) {
      if (!isFilterValueShape(columnFilter.value)) {
        continue;
      }
      const field = fieldFor(columnFilter.id);
      const label = getFilterChipLabel(field?.label ?? columnFilter.id, columnFilter.value, field?.options);
      items.push({
        key: `column-${columnFilter.id}`,
        label,
        target: { kind: 'column', columnId: columnFilter.id },
        onRemove: () => ctx.table.getColumn(columnFilter.id)?.setFilterValue(undefined),
      });
    }
    return items;
  }, [ctx, ctx?.state.filters, ctx?.state.columnFilters, fieldFor]);

  const handleClearAll = useCallback(() => {
    if (!ctx) {
      return;
    }
    ctx.actions.setFilters([]);
    // Only clear funnel (FilterValue-shaped) column filters — leave faceted /
    // plain-value column filters some other surface may own.
    ctx.table.setColumnFilters((prev: { id: string; value: unknown }[]) =>
      prev.filter((cf) => !isFilterValueShape(cf.value)),
    );
  }, [ctx]);

  if (!ctx || chips.length === 0) {
    return null;
  }

  return (
    <XStack
      flexWrap="wrap"
      alignItems="center"
      gap="$2"
      paddingVertical="$1.5"
      aria-label={t('Active filters')}>
      {chips.map((chip) => (
        <FilterChip
          key={chip.key}
          label={chip.label}
          onRemove={chip.onRemove}
          onPress={() => ctx.filterUi?.requestEdit(chip.target)}
        />
      ))}
      {chips.length >= 2 && (
        <Button
          size="$2"
          chromeless
          compact
          onPress={handleClearAll}>
          {t('Clear all')}
        </Button>
      )}
    </XStack>
  );
}
