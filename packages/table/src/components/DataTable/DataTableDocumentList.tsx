/**
 * DataTableDocumentList — subject-led document rows (desk List view).
 *
 * One horizontal row per document: checkbox | title + stacked meta | trailing
 * indicators | actions. No key-value labels, no card chrome, no grid headers,
 * no wrapping into a column grid (Polaris Index / Frappe list). Stacked-group
 * radius (LC-72): first row top corners, last row bottom, interiors square.
 * LC-71: selected = fill; keyboard ring rides the row when it is the tab stop.
 */

import { EmptyState } from '@repo/ui';
import { Checkbox } from '@repo/forms';
import { TableCellContext } from '@repo/table-primitives';
import { getGroupPosition, hairline, stackRadiusProps, useResolvedKnobs } from '@repo/theme';
import type React from 'react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { View, XStack, YStack } from 'tamagui';

import type { DataTableColumn } from '../../types';
import { withInterp } from '../../utils/withInterp';

import { dataTableChrome, rowIntentProps } from './dataTableChrome';
import { partitionDocumentListCells } from './documentListSlots';
import { tableRowStateProps } from './rowStateChrome';

/** Subject cell: explicit title role, else first non-action / non-`_` column. */
export function pickDocumentListTitleCell<TCell extends { id: string; column: { id: string; columnDef: unknown } }>(
  visibleCells: TCell[],
): TCell | undefined {
  const titled = visibleCells.find((cell) => {
    const { meta } = cell.column.columnDef as DataTableColumn;
    return meta?.role === 'title';
  });
  if (titled) {
    return titled;
  }
  const content = visibleCells.find((cell) => {
    const id = String(cell.column.id ?? '');
    const { meta } = cell.column.columnDef as DataTableColumn;
    return !id.startsWith('_') && meta?.role !== 'actions';
  });
  return content ?? visibleCells[0];
}

export interface DataTableDocumentListProps<TData> {
  tableRows: any[];
  enableRowSelection?: boolean;
  disabled?: boolean;
  hasActiveFilters: boolean;
  renderCellContent: (cell: any, rowIndex: number, rowData: TData) => React.ReactNode;
  compact?: boolean;
  selectRowLabel?: (row: any, rowIndex: number) => string;
  getRowPressProps?: (row: any, rowIndex: number, variant?: 'row' | 'card') => Record<string, any>;
  /** In-flight refetch: do not paint empty-state over a blank body. */
  queryInFlight?: boolean;
}

export function DataTableDocumentList<TData extends Record<string, any>>({
  tableRows,
  enableRowSelection = false,
  disabled = false,
  hasActiveFilters,
  renderCellContent,
  compact = false,
  selectRowLabel,
  getRowPressProps,
  queryInFlight = false,
}: DataTableDocumentListProps<TData>) {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs({ component: 'DataTable', compact });
  const chrome = dataTableChrome(String(knobProps.sizeToken));
  const tableZebraOn = knobProps.tableZebra === 'on';
  const rowPad = knobProps.panelPadding.padding;

  const renderRow = useCallback(
    (row: any, index: number) => {
      const rowData = row.original as TData;
      const visibleCells = row.getVisibleCells();
      const titleCell = pickDocumentListTitleCell(visibleCells);
      const { indicators, metas, actions } = partitionDocumentListCells(visibleCells, titleCell);
      const position = getGroupPosition(index, tableRows.length);
      const corners = stackRadiusProps(position, knobProps.borderRadiusOuter.borderRadius);
      const selected = Boolean(enableRowSelection && row.getIsSelected?.());
      const rowState = tableRowStateProps({
        selected,
        zebraOn: tableZebraOn,
        index,
        pressable: Boolean(getRowPressProps),
      });

      return (
        <View key={`${row.id}-${index}`}>
          {index > 0 ? <View {...hairline.line} /> : null}
          <XStack
            testID="data-table-list-row"
            alignItems="center"
            gap="$3"
            paddingHorizontal={rowPad}
            paddingVertical="$2"
            minHeight={chrome.rowPx}
            overflow="hidden"
            display="flex"
            flexDirection="row"
            flexWrap="nowrap"
            width="100%"
            {...({ 'data-list-wrap': 'nowrap' } as any)}
            {...corners}
            {...rowState}
            hoverStyle={{
              ...(rowState.hoverStyle as object),
              ...corners,
            }}
            {...(getRowPressProps ? (getRowPressProps(row, index, 'row') as any) : {})}
            {...(rowIntentProps(rowData) as any)}>
            {enableRowSelection && (
              <Checkbox
                checked={row.getIsSelected()}
                onChange={(checked) => {
                  if (disabled) {
                    return;
                  }
                  row.toggleSelected(!!checked);
                }}
                disabled={disabled}
                checkboxProps={{
                  'aria-label':
                    selectRowLabel?.(row, index) ??
                    withInterp(t('Select row {{row}}', { row: index + 1 }), {
                      row: index + 1,
                    }),
                }}
                compact={compact}
              />
            )}
            <YStack
              flex={1}
              minWidth={0}
              gap="$1"
              overflow="hidden">
              {titleCell ? (
                <View
                  minWidth={0}
                  {...({ 'data-list-slot': 'title' } as any)}>
                  <TableCellContext.Provider value={{ inTableCell: true, isHeader: false }}>
                    {renderCellContent(titleCell, index, rowData)}
                  </TableCellContext.Provider>
                </View>
              ) : (
                <View flex={1} />
              )}
              {metas.map((cell: any) => (
                <View
                  key={cell.id}
                  minWidth={0}
                  opacity={0.7}
                  overflow="hidden"
                  {...({ 'data-list-slot': 'meta' } as any)}>
                  <TableCellContext.Provider value={{ inTableCell: true, isHeader: false }}>
                    {renderCellContent(cell, index, rowData)}
                  </TableCellContext.Provider>
                </View>
              ))}
            </YStack>
            {indicators.length > 0 ? (
              <XStack
                flexShrink={0}
                gap="$2"
                alignItems="center"
                flexWrap="nowrap"
                maxWidth="40%">
                {indicators.map((cell: any) => (
                  <View
                    key={cell.id}
                    flexShrink={0}
                    {...({ 'data-list-slot': 'indicator' } as any)}>
                    <TableCellContext.Provider value={{ inTableCell: true, isHeader: false }}>
                      {renderCellContent(cell, index, rowData)}
                    </TableCellContext.Provider>
                  </View>
                ))}
              </XStack>
            ) : null}
            {actions.length > 0 ? (
              <XStack
                flexShrink={0}
                gap="$1"
                alignItems="center"
                flexWrap="nowrap">
                {actions.map((cell: any) => (
                  <View
                    key={cell.id}
                    flexShrink={0}
                    {...({ 'data-list-slot': 'actions' } as any)}>
                    <TableCellContext.Provider value={{ inTableCell: true, isHeader: false }}>
                      {renderCellContent(cell, index, rowData)}
                    </TableCellContext.Provider>
                  </View>
                ))}
              </XStack>
            ) : null}
          </XStack>
        </View>
      );
    },
    [
      compact,
      disabled,
      enableRowSelection,
      getRowPressProps,
      knobProps.borderRadiusOuter.borderRadius,
      renderCellContent,
      rowPad,
      selectRowLabel,
      t,
      tableRows.length,
      tableZebraOn,
    ],
  );

  return (
    <View
      flexDirection="column"
      display="flex"
      testID="data-table-list"
      {...({ 'data-list-layout': 'list' } as any)}
      {...(getRowPressProps ? ({ 'data-row-press-scope': 'true' } as any) : {})}>
      {tableRows.length === 0 ? (
        queryInFlight ? null : (
          <EmptyState
            compact
            backgroundColor="$color1"
            {...knobProps.borderRadius}
            aria-live="polite"
            title={hasActiveFilters ? t('No results found') : t('No data available')}
          />
        )
      ) : (
        tableRows.map((row: any, index: number) => renderRow(row, index))
      )}
    </View>
  );
}
