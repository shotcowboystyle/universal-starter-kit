/**
 * DataTableCardControls - sort + filter affordances for the card layout.
 *
 * In the grid layout, sorting and per-column filtering live in the column
 * headers. The card layout has no headers, so this compact control row
 * restores those affordances above the card list: a sort menu (cycles
 * none → asc → desc per sortable column, mirroring the header click
 * cycle) and the existing DataTableFilters compact chrome (add filter +
 * active count + clear). Both operate on the same table state as the
 * grid — no parallel state.
 */

import { CaretDownIcon, CaretUpDownIcon } from '@phosphor-icons/react';
import { Button } from '@repo/forms';
import { useResolvedKnobs } from '@repo/theme';
import { DropdownMenu } from '@repo/ui';
import type { Column, SortDirection, Table } from '@tanstack/react-table';
import type React from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View, XStack } from 'tamagui';

import type { DataTableColumnType, DataTableData, FacetedFilterOption } from '../../types';
import { withInterp } from '../../utils/with-interp';
import { DataTableFilters } from '../DataTableFilters';

import { dataTableChrome } from './data-table-chrome';

/** One column offered by the card filter builder. */
export interface CardFilterColumn {
  id: string;
  label: string;
  type: DataTableColumnType;
  options?: FacetedFilterOption[];
}

export interface DataTableCardControlsProps<TData extends DataTableData = DataTableData> {
  /** TanStack table instance (from useDataTable). */
  table: Table<TData>;
  enableSorting?: boolean;
  enableFiltering?: boolean;
  /** Columns offered by the filter builder (id/label/type). */
  availableColumns?: CardFilterColumn[];
  compact?: boolean;
  /** Table-level disabled state (UX-011): controls render inert + LC-40 visible. */
  disabled?: boolean;
}

/** Resolve the human label for a TanStack column (string header, else id). */
const getColumnLabel = <TData,>(column: Column<TData>): string =>
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- TanStack header is a string or a render function; typeof is the discriminant
  typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id;

const sortIcon = (sorted: false | SortDirection, iconPx: number): React.ReactNode => {
  if (sorted === 'asc') {
    return <CaretDownIcon size={iconPx} />;
  }
  if (sorted === 'desc') {
    return (
      <CaretDownIcon
        size={iconPx}
        style={{ transform: 'rotate(180deg)' }}
      />
    );
  }
  return <CaretUpDownIcon size={iconPx} />;
};

const noFilterColumns: CardFilterColumn[] = [];

export const DataTableCardSortControl = <TData extends DataTableData>({
  table,
  compact = false,
  disabled = false,
  contained = false,
}: Pick<DataTableCardControlsProps<TData>, 'table' | 'compact' | 'disabled'> & { contained?: boolean }) => {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs({ component: 'DataTable', compact });
  const chrome = dataTableChrome(knobProps.sizeToken);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortableColumns = table.getVisibleLeafColumns().filter((col) => col.getCanSort());
  const activeSort = table.getState().sorting?.[0];
  const activeSortColumn = activeSort === undefined ? undefined : table.getColumn(activeSort.id);
  const sortArrow = activeSort?.desc ? '\u2193' : '\u2191';
  const sortLabel = activeSortColumn === undefined ? t('Sort') : `${getColumnLabel(activeSortColumn)} ${sortArrow}`;
  if (sortableColumns.length === 0) {
    return null;
  }
  const menu = (
    <DropdownMenu
      open={disabled ? false : sortMenuOpen}
      onOpenChange={(open: boolean) => {
        if (disabled) {
          return;
        }
        setSortMenuOpen(open);
      }}>
      <DropdownMenu.Trigger asChild>
        <Button
          size={knobProps.sizeToken}
          icon={<CaretUpDownIcon size={chrome.iconPx} />}
          aria-label={t('Sort rows')}
          {...(contained
            ? {
                minWidth: 0,
                maxWidth: '100%' as const,
                'aria-description': activeSortColumn === undefined ? undefined : sortLabel,
              }
            : {})}
          disabled={disabled}>
          {sortLabel}
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content>
        <DropdownMenu.Label>{t('Sort by')}</DropdownMenu.Label>
        {sortableColumns.map((column) => {
          const sorted = column.getIsSorted();
          return (
            <DropdownMenu.Item
              key={column.id}
              closeOnSelect={false}
              icon={sortIcon(sorted, chrome.iconPx)}
              aria-label={withInterp(t('Sort by {{column}}', { column: getColumnLabel(column) }), {
                column: getColumnLabel(column),
              })}
              onSelect={() => {
                // Same cycle as the grid header click: none → asc → desc → none.
                if (sorted === false) {
                  column.toggleSorting(false);
                } else if (sorted === 'asc') {
                  column.toggleSorting(true);
                } else {
                  column.clearSorting();
                }
              }}>
              {getColumnLabel(column)}
            </DropdownMenu.Item>
          );
        })}
      </DropdownMenu.Content>
    </DropdownMenu>
  );
  return contained ? (
    <View
      data-table-card-sort=""
      flexBasis="auto"
      flexGrow={0}
      flexShrink={1}
      minWidth={0}
      maxWidth="50%">
      {menu}
    </View>
  ) : (
    menu
  );
};

export const DataTableCardControls = <TData extends DataTableData>({
  table,
  enableSorting = false,
  enableFiltering = false,
  availableColumns = noFilterColumns,
  compact = false,
  disabled = false,
}: DataTableCardControlsProps<TData>) => {
  const { t } = useTranslation();
  const { disabledState } = useResolvedKnobs({ component: 'DataTable', compact });
  if (!enableSorting && !enableFiltering) {
    return null;
  }
  return (
    <XStack
      alignItems="center"
      flexWrap="wrap"
      gap="$2"
      paddingVertical="$2"
      role="toolbar"
      aria-label={t('Card list controls')}>
      {enableSorting && (
        <DataTableCardSortControl
          table={table}
          compact={compact}
          disabled={disabled}
        />
      )}
      {enableFiltering && availableColumns.length > 0 && (
        // DataTableFilters (chrome) has no disabled API — the wrapper is the
        // LC-40 carrier and interaction gate for the disabled table.
        <View {...(disabled ? { ...disabledState.chromeKnobProps, pointerEvents: 'none' as const } : {})}>
          <DataTableFilters
            compact
            availableColumns={availableColumns}
          />
        </View>
      )}
    </XStack>
  );
};
