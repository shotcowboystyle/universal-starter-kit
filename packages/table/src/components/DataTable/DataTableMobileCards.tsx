/**
 * DataTableMobileCards - stacked card-list view for DataTable.
 *
 * Renders each row as a card instead of a grid row. Used when the
 * resolved layout is "cards" (below the `$sm` breakpoint with
 * layout="auto", or forced via layout="cards").
 *
 * Card anatomy: the first visible column is the card title in the header
 * row (with selection checkbox / row number / delete). The remaining
 * visible columns are NOT a stack of label/value rows any more — see
 * `classifyCardField`. Column visibility and order from table state apply
 * unchanged — cells come from `row.getVisibleCells()`. Values render
 * through the same cell renderers as the grid, inside `TableCellContext`
 * so fields stay chromeless (useIsInTableCell).
 *
 * The card is FLAT: no border, no elevation. A card list is drawn inside
 * a panel that already has its own frame, and an outlined, shadowed card
 * inside it reads as a box inside a box. The `cardSurface` fill and the
 * gap between cards are what separate one row from the next.
 */

import { EmptyState } from '@repo/ui';
import { Button, Checkbox } from '@repo/forms';
import { TableCellContext, tablePressFill, tableZebraFill } from '@repo/table-primitives';
import { hairline, useResolvedKnobs } from '@repo/theme';
import { TrashIcon } from '@phosphor-icons/react';
import type React from 'react';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View, VisuallyHidden, XStack } from 'tamagui';

import type { DataTableColumn, DataTableField } from '../../types';
import { withInterp } from '../../utils/withInterp';

import { rowIntentProps } from './dataTableChrome';

/**
 * Resolve the human label for a column: `meta.label` → string header →
 * column id. `meta.label` is the explicit label channel for columns whose
 * header is a render function or a bare glyph (the liked heart) — without
 * it a card field row would print the raw column id (`_liked_by`).
 */
export function getColumnLabel(cell: any): string {
  const columnDef = cell.column.columnDef as DataTableColumn;
  const metaLabel = columnDef.meta?.label;
  if (typeof metaLabel === 'string' && metaLabel) {
    return metaLabel;
  }
  return typeof columnDef.header === 'string' ? columnDef.header : (columnDef.id ?? cell.column.id);
}

/** Fields that draw their own control, which names itself and needs a target. */
const selfNamingFields = new Set<DataTableField>([
  'checkbox',
  'switch',
  'rating',
  'progress',
  'image',
  'signature',
  'fileupload',
  'colorpicker',
  'barcode',
  'geolocation',
]);

/** Column ids whose value is a state badge. A badge names itself. */
const indicatorIds = new Set(['status', 'priority', 'workflow_state', 'state']);

const dateLike = /^\d{4}-\d{2}-\d{2}([T ]|$)|^\d{1,2}\/\d{1,2}\/\d{2,4}$/;
const numberLike = /^[+\-−]?[\d,\s]*\d(\.\d+)?%?$/;

export type CardFieldKind = 'skip' | 'control' | 'bare' | 'figure';

/**
 * Whether a card field prints the column's name, and where it goes.
 *
 * A card is not the grid with its header repeated down the page. In the
 * grid the header is written ONCE for a whole column of values; on a card
 * it is written once per value, so a 12-column table prints 12 labels per
 * record. That is what a label costs here, and most labels do not earn it.
 *
 *   skip     the raw value is absent. A field with nothing in it is not a
 *            fact — "Rejected —" spends a row saying nothing.
 *   control  a button, a switch, a rating. The control names itself and
 *            needs its own tap target, so it keeps a row and takes no label.
 *   bare     a string that is neither a number nor a date. "DIVIDEND
 *            CREDIT" and "Income:Dividends" say what they are; "Payee" and
 *            "Account" in front of them are the header printed twice. The
 *            name is kept for assistive tech via VisuallyHidden, which
 *            costs no layout.
 *   figure   a number, a date, a boolean. "1,204" alone cannot be read, so
 *            these DO keep their label — inline beside the figure, not in a
 *            40%-wide column of its own.
 */
export function classifyCardField(cell: any): CardFieldKind {
  const def = cell.column.columnDef as DataTableColumn;
  const id = String(cell.column.id ?? '');
  const role = def.meta?.role;
  if (role === 'hidden' || role === 'skip') {
    return 'skip';
  }
  if (role === 'actions' || id.startsWith('_') || (def.field && selfNamingFields.has(def.field))) {
    return 'control';
  }
  const raw = typeof cell.getValue === 'function' ? cell.getValue() : undefined;
  if (raw == null || (typeof raw === 'string' && raw.trim() === '')) {
    return 'skip';
  }
  if (role === 'indicator' || indicatorIds.has(id)) {
    return 'bare';
  }
  if (typeof raw === 'string') {
    const value = raw.trim();
    return numberLike.test(value) || dateLike.test(value) ? 'figure' : 'bare';
  }
  return 'figure';
}

export interface DataTableMobileCardsProps<TData> {
  tableRows: any[];
  enableRowSelection?: boolean;
  showRowNumbers: boolean;
  showDeleteRow: boolean;
  readOnly: boolean;
  /** Table-level disabled state (UX-011): controls render inert + LC-40 visible. */
  disabled?: boolean;
  dataLength: number;
  minRows: number;
  hasActiveFilters: boolean;
  renderCellContent: (cell: any, rowIndex: number, rowData: TData) => React.ReactNode;
  onDeleteRow: (rowIndex: number) => void;
  selectAllChecked?: boolean;
  selectAllIndeterminate?: boolean;
  onToggleSelectAll?: () => void;
  compact?: boolean;
  /**
   * Accessible name for a row's selection checkbox ("Select row {identity}",
   * built by DataTableRoot so cards and grid share one naming source).
   */
  selectRowLabel?: (row: any, rowIndex: number) => string;
  /**
   * onRowPress support: press/keyboard/AT props for one pressable row
   * (built by DataTableRoot). Cards live outside the table tree, so they
   * take the `card` variant (role="button") with the same activation,
   * roving focus, and inner-control isolation as grid rows. The card paints
   * its own press fill, off the fill it rests on (MPO-404).
   */
  getRowPressProps?: (row: any, rowIndex: number, variant?: 'row' | 'card') => Record<string, any>;
  /** In-flight refetch: do not paint empty-state over a blank body. */
  queryInFlight?: boolean;
}

export function DataTableMobileCards<TData extends Record<string, any>>({
  tableRows,
  enableRowSelection = false,
  showRowNumbers,
  showDeleteRow,
  readOnly,
  disabled = false,
  dataLength,
  minRows,
  hasActiveFilters,
  renderCellContent,
  onDeleteRow,
  selectAllChecked = false,
  selectAllIndeterminate = false,
  onToggleSelectAll,
  compact = false,
  selectRowLabel,
  getRowPressProps,
  queryInFlight = false,
}: DataTableMobileCardsProps<TData>) {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs({ component: 'DataTable', compact });
  const tableZebraOn = knobProps.tableZebra === 'on';

  const renderCell = useCallback(
    (cell: any, index: number, rowData: TData) => (
      <TableCellContext.Provider value={{ inTableCell: true, isHeader: false }}>
        {renderCellContent(cell, index, rowData)}
      </TableCellContext.Provider>
    ),
    [renderCellContent],
  );

  const renderMobileCard = useCallback(
    (row: any, index: number) => {
      const rowData = row.original as TData;
      const visibleCells = row.getVisibleCells();
      const [titleCell, ...detailCells] = visibleCells;
      const showDelete = showDeleteRow && !readOnly;

      const bare: any[] = [];
      const figures: any[] = [];
      const controls: any[] = [];
      for (const cell of detailCells) {
        const kind = classifyCardField(cell);
        if (kind === 'bare') {
          bare.push(cell);
        } else if (kind === 'figure') {
          figures.push(cell);
        } else if (kind === 'control') {
          controls.push(cell);
        }
      }
      const hasBody = bare.length > 0 || figures.length > 0 || controls.length > 0;
      const cardFill = knobProps.cardSurface.backgroundColor;
      const restFill = tableZebraOn && index % 2 === 1 ? tableZebraFill(cardFill) : cardFill;
      const pressProps = getRowPressProps?.(row, index, 'card') ?? {};

      return (
        <View
          key={`${row.id}-${index}`}
          testID="data-table-card"
          {...knobProps.cardSurface}
          backgroundColor={restFill}
          {...({
            'data-table-zebra': tableZebraOn ? (index % 2 === 0 ? 'even' : 'odd') : 'off',
          } as any)}
          {...(pressProps as any)}
          {...(pressProps.onPress ? { pressStyle: { backgroundColor: tablePressFill(restFill) } } : {})}
          {...(rowIntentProps(rowData) as any)}>
          {/* Card header: selection + primary-column title + row number + delete */}
          <XStack
            alignItems="center"
            gap="$2"
            {...(hasBody
              ? {
                  paddingBottom: '$2',
                  marginBottom: '$2',
                  ...hairline.bottom,
                  borderBottomColor: '$color6',
                }
              : {})}>
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
            {titleCell ? (
              <View
                flex={1}
                minWidth={0}
                aria-label={getColumnLabel(titleCell)}
                accessibilityLabel={getColumnLabel(titleCell)}
                {...({ 'data-card-slot': 'title' } as any)}>
                {renderCell(titleCell, index, rowData)}
              </View>
            ) : (
              <View flex={1} />
            )}
            {showRowNumbers && (
              <Text
                fontSize={knobProps.sizeToken}
                color="$color10"
                fontWeight="600">
                #{index + 1}
              </Text>
            )}
            {showDelete && (
              <Button
                chromeless
                circular
                size="$2"
                icon={TrashIcon}
                disabled={disabled || dataLength <= minRows}
                onPress={() => {
                  onDeleteRow(index);
                }}
                aria-label={withInterp(t('Delete row {{row}}', { row: index + 1 }), {
                  row: index + 1,
                })}
              />
            )}
          </XStack>

          {/* Self-naming values, wrapped into one flow. No printed labels:
              the name goes to assistive tech only, at no layout cost. */}
          {bare.length > 0 ? (
            <XStack
              flexWrap="wrap"
              alignItems="center"
              gap="$2"
              {...({ 'data-card-slot': 'meta' } as any)}>
              {bare.map((cell: any, i: number) => (
                <XStack
                  key={cell.id}
                  alignItems="center"
                  gap="$2"
                  flexShrink={1}
                  minWidth={0}>
                  <VisuallyHidden>{`${getColumnLabel(cell)}: `}</VisuallyHidden>
                  <View
                    flexShrink={1}
                    minWidth={0}>
                    {renderCell(cell, index, rowData)}
                  </View>
                  {/* The separator TRAILS its value, so a line that wraps
                      starts with content instead of a stray dot. */}
                  {i < bare.length - 1 ? (
                    <Text
                      fontSize={knobProps.sizeToken}
                      color="$color8"
                      aria-hidden
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants">
                      ·
                    </Text>
                  ) : null}
                </XStack>
              ))}
            </XStack>
          ) : null}

          {/* Figures keep their name, inline beside the value. */}
          {figures.length > 0 ? (
            <XStack
              flexWrap="wrap"
              alignItems="center"
              gap="$3"
              paddingTop={bare.length > 0 ? '$1.5' : 0}
              {...({ 'data-card-slot': 'figure' } as any)}>
              {figures.map((cell: any) => (
                <XStack
                  key={cell.id}
                  alignItems="center"
                  gap="$1.5"
                  flexShrink={1}
                  minWidth={0}>
                  <Text
                    fontSize={knobProps.sizeToken}
                    color="$color10"
                    fontWeight="500">
                    {getColumnLabel(cell)}
                  </Text>
                  <View
                    flexShrink={1}
                    minWidth={0}>
                    {renderCell(cell, index, rowData)}
                  </View>
                </XStack>
              ))}
            </XStack>
          ) : null}

          {/* Controls keep a row of their own — they are tap targets. */}
          {controls.map((cell: any) => (
            <View
              key={cell.id}
              paddingTop="$2"
              minWidth={0}
              {...({ 'data-card-slot': 'control' } as any)}>
              <VisuallyHidden>{`${getColumnLabel(cell)}: `}</VisuallyHidden>
              {renderCell(cell, index, rowData)}
            </View>
          ))}
        </View>
      );
    },
    [
      enableRowSelection,
      showRowNumbers,
      showDeleteRow,
      readOnly,
      disabled,
      dataLength,
      minRows,
      renderCell,
      onDeleteRow,
      compact,
      knobProps,
      tableZebraOn,
      t,
      selectRowLabel,
      getRowPressProps,
    ],
  );

  return (
    <View
      flexDirection="column"
      {...knobProps.gap}
      testID="data-table-cards"
      // Roving-focus DOM scope for onRowPress arrow keys (LC-49) — keeps
      // ArrowUp/Down/Home/End inside THIS table's card list.
      {...(getRowPressProps ? ({ 'data-row-press-scope': 'true' } as any) : {})}>
      {enableRowSelection && tableRows.length > 0 && (
        <XStack
          alignItems="center"
          gap="$2"
          paddingBottom="$2">
          <Checkbox
            checked={selectAllIndeterminate ? 'indeterminate' : selectAllChecked}
            onChange={(checked) => {
              if (disabled || checked === 'indeterminate') {
                return;
              }
              const shouldSelect = checked;
              if (shouldSelect !== selectAllChecked) {
                onToggleSelectAll?.();
              }
            }}
            disabled={disabled}
            checkboxProps={{ 'aria-label': t('Select all rows') }}
            compact={compact}
          />
          <Text
            fontSize={knobProps.sizeToken}
            color="$color10">
            {t('Select all')}
          </Text>
        </XStack>
      )}
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
        tableRows.map((row: any, index: number) => renderMobileCard(row, index))
      )}
    </View>
  );
}
