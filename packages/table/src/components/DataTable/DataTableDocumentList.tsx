/**
 * DataTableDocumentList — subject-led document rows (desk List view).
 *
 * One horizontal row per document: checkbox | title + stacked meta | trailing
 * indicators | actions. No key-value labels, no card chrome, no grid headers,
 * no wrapping into a column grid (Polaris Index / Frappe list). Stacked-group
 * radius (LC-72): first row top corners, last row bottom, interiors square.
 * LC-71: selected = fill; keyboard ring rides the row when it is the tab stop.
 */

import { Checkbox } from '@repo/forms';
import { TableCellContext } from '@repo/table-primitives';
import { getGroupPosition, hairline, stackRadiusProps, useResolvedKnobs } from '@repo/theme';
import { EmptyState } from '@repo/ui';
import type React from 'react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { View, XStack, YStack } from 'tamagui';

import type { DataTableData } from '../../types';
import { withInterp } from '../../utils/with-interp';

import { dataTableChrome, rowIntentProps } from './data-table-chrome';
import type { CardCell, CardRow } from './DataTableMobileCards';
import { partitionDocumentListCells } from './document-list-slots';
import { tableRowStateProps } from './row-state-chrome';

/** Subject cell: explicit title role, else first non-action / non-`_` column. */
export const pickDocumentListTitleCell = <TCell extends CardCell>(visibleCells: TCell[]): TCell | undefined => {
  const titled = visibleCells.find((cell) => cell.column.columnDef.meta?.role === 'title');
  if (titled !== undefined) {
    return titled;
  }
  const content = visibleCells.find((cell) => {
    const { id } = cell.column;
    const { meta } = cell.column.columnDef;
    return !id.startsWith('_') && meta?.role !== 'actions';
  });
  return content ?? visibleCells[0];
};

type ListCellOf<TRow extends CardRow<unknown>> = ReturnType<TRow['getVisibleCells']>[number];

const cellContextValue = { inTableCell: true, isHeader: false };

export interface DataTableDocumentListProps<TData, TRow extends CardRow<TData> = CardRow<TData>> {
  tableRows: readonly TRow[];
  enableRowSelection?: boolean;
  disabled?: boolean;
  hasActiveFilters: boolean;
  renderCellContent: (cell: ListCellOf<TRow>, rowIndex: number, rowData: TData) => React.ReactNode;
  compact?: boolean;
  selectRowLabel?: (row: TRow, rowIndex: number) => string;
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- open-ended prop bag built by the root and spread onto the row host
  getRowPressProps?: (row: TRow, rowIndex: number, variant?: 'row' | 'card') => Record<string, unknown>;
  /** In-flight refetch: do not paint empty-state over a blank body. */
  queryInFlight?: boolean;
}

export const DataTableDocumentList = <TData extends DataTableData, TRow extends CardRow<TData> = CardRow<TData>>({
  tableRows,
  enableRowSelection = false,
  disabled = false,
  hasActiveFilters,
  renderCellContent,
  compact = false,
  selectRowLabel,
  getRowPressProps,
  queryInFlight = false,
}: DataTableDocumentListProps<TData, TRow>) => {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs({ component: 'DataTable', compact });
  const chrome = dataTableChrome(knobProps.sizeToken);
  const tableZebraOn = knobProps.tableZebra === 'on';
  const rowPad = knobProps.panelPadding.padding;

  const renderRow = useCallback(
    (row: TRow, index: number) => {
      const rowData = row.original;
      // SAFETY: TRow's getVisibleCells returns ListCellOf<TRow>[]; the method type widens it back to CardCell
      const visibleCells = row.getVisibleCells() as ListCellOf<TRow>[];
      const titleCell = pickDocumentListTitleCell(visibleCells);
      const { indicators, metas, actions } = partitionDocumentListCells(visibleCells, titleCell);
      const position = getGroupPosition(index, tableRows.length);
      const corners = stackRadiusProps(position, knobProps.borderRadiusNested.borderRadius);
      const selected = enableRowSelection && row.getIsSelected();
      const rowState = tableRowStateProps({
        selected,
        zebraOn: tableZebraOn,
        index,
        pressable: getRowPressProps !== undefined,
      });

      return (
        // oxlint-disable-next-line react-doctor/no-array-index-as-key -- row.id leads the key; index kept so lint-only pass does not change remount behavior
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
            data-list-wrap="nowrap"
            {...corners}
            {...rowState}
            hoverStyle={{
              // SAFETY: tableRowStateProps always sets hoverStyle to a style object
              ...(rowState.hoverStyle as object),
              ...corners,
            }}
            {...getRowPressProps?.(row, index, 'row')}
            {...rowIntentProps(rowData)}>
            {enableRowSelection && (
              <Checkbox
                checked={row.getIsSelected()}
                onChange={(checked) => {
                  if (disabled) {
                    return;
                  }
                  row.toggleSelected?.(checked !== false);
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
              {titleCell === undefined ? (
                <View flex={1} />
              ) : (
                <View
                  minWidth={0}
                  data-list-slot="title">
                  <TableCellContext.Provider value={cellContextValue}>
                    {renderCellContent(titleCell, index, rowData)}
                  </TableCellContext.Provider>
                </View>
              )}
              {metas.map((cell) => (
                <View
                  key={cell.id}
                  minWidth={0}
                  opacity={0.7}
                  overflow="hidden"
                  data-list-slot="meta">
                  <TableCellContext.Provider value={cellContextValue}>
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
                {indicators.map((cell) => (
                  <View
                    key={cell.id}
                    flexShrink={0}
                    data-list-slot="indicator">
                    <TableCellContext.Provider value={cellContextValue}>
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
                {actions.map((cell) => (
                  <View
                    key={cell.id}
                    flexShrink={0}
                    data-list-slot="actions">
                    <TableCellContext.Provider value={cellContextValue}>
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
      chrome.rowPx,
      compact,
      disabled,
      enableRowSelection,
      getRowPressProps,
      knobProps.borderRadiusNested.borderRadius,
      renderCellContent,
      rowPad,
      selectRowLabel,
      t,
      tableRows.length,
      tableZebraOn,
    ],
  );

  const emptyState = queryInFlight ? null : (
    <EmptyState
      compact
      backgroundColor="$color1"
      {...knobProps.borderRadius}
      aria-live="polite"
      title={hasActiveFilters ? t('No results found') : t('No data available')}
    />
  );

  return (
    <View
      flexDirection="column"
      display="flex"
      testID="data-table-list"
      data-list-layout="list"
      {...(getRowPressProps ? { 'data-row-press-scope': 'true' } : {})}>
      {tableRows.length === 0 ? emptyState : tableRows.map((row, index) => renderRow(row, index))}
    </View>
  );
};
