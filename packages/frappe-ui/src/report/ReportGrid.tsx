import { CaretDownIcon, CaretUpDownIcon } from '@phosphor-icons/react';
import { Input } from '@repo/forms';
import { Table } from '@repo/table';
import { ensureFocusVisibleRing, formatCurrency, formatNumber, formatPercent } from '@repo/theme';
// Desk-parity report spreadsheet: row numbers, sortable column headers, a
// per-column FILTER ROW under the headers (desk's killer report feature —
// inputs drive the standard frappe filter pipeline via reportViewModel's
// kind→operator mapping), group header rows, and a totals row.
//
// Composed from @repo/table's Table primitives (exported for
// standalone use) rather than DataTable: DataTable owns a single internal
// scrollport and wraps header content in Text, so it cannot host an input
// row under its headers today — capability gap flagged to the table
// workstream; this grid is the interim desk-parity surface.
import { ScrollView, Text, Tooltip, View, XStack, isWeb } from '@repo/ui';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { formatDateCell } from '../list/listFormat';

import { REPORT_NUMERIC_FIELDTYPES } from './reportViewModel';
import type { ReportColumnDef, ReportGridRow, ReportRow, ReportSortState, ReportTotalsCell } from './reportViewModel';

const ROW_NUMBER_WIDTH = 56;

// ── LC-49/LC-50 row keyboard contract ───────────────────────────────
// Local mirror of the table package's `isInteractiveInnerTarget`
// (public/table/src/utils/rowPress.ts — internal util, not on the
// barrel): when the whole row is one pressable unit, presses and keys
// that originate on inner interactive content (Link cells, future
// editors) must keep working without also firing the row press.
const INTERACTIVE_SELECTOR = [
  'a[href]',
  'button',
  'input',
  'select',
  'textarea',
  'label',
  '[contenteditable="true"]',
  '[role="button"]',
  '[role="checkbox"]',
  '[role="combobox"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="option"]',
  '[role="radio"]',
  '[role="slider"]',
  '[role="spinbutton"]',
  '[role="switch"]',
  '[role="textbox"]',
  '[aria-expanded]',
].join(', ');

function isInteractiveInnerTarget(target: unknown, boundary: unknown): boolean {
  if (typeof Element === 'undefined') {
    return false;
  }
  if (!(target instanceof Element)) {
    return false;
  }
  const boundaryEl = boundary instanceof Element ? boundary : null;
  let node: Element | null = target;
  while (node && node !== boundaryEl) {
    if (node.matches(INTERACTIVE_SELECTOR)) {
      return true;
    }
    const tabIndex = node.getAttribute('tabindex');
    // A tab stop of its own (0 or positive) marks a focusable control; the
    // row's roving -1/0 tabindex lives on the boundary, not inside it.
    if (tabIndex != null && Number(tabIndex) >= 0) {
      return true;
    }
    node = node.parentElement;
  }
  return false;
}

export interface ReportGridProps {
  columns: readonly ReportColumnDef[];
  rows: readonly ReportGridRow[];
  sort: ReportSortState;
  onSortChange: (sort: ReportSortState) => void;
  /** Filter-row DRAFT values by fieldname (uncommitted text). */
  columnFilters: Readonly<Record<string, string>>;
  onColumnFilterChange: (fieldname: string, value: string) => void;
  /** Open the row's document form. Absent, rows are not pressable. */
  onOpenRow?: (name: string) => void;
  /** Open a Link cell's target document. */
  onOpenLink?: (doctype: string, name: string) => void;
  /** Totals over the full filtered result — rendered as a bottom row. */
  totals: readonly ReportTotalsCell[];
  /** Group-by column (group header rows span the grid). */
  groupByColumn?: ReportColumnDef;
}

function alignToJustify(align: ReportColumnDef['align']) {
  return align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start';
}

function formatNumericCell(value: number, fieldtype: string): string {
  switch (fieldtype) {
    case 'Currency': {
      return formatCurrency(value);
    }
    case 'Int': {
      return formatNumber(Math.round(value), { maximumFractionDigits: 0 });
    }
    case 'Percent': {
      return formatPercent(value, { precision: 1 });
    }
    default: {
      return formatNumber(value);
    }
  }
}

/** Fieldtype-aware cell content (query-report cell channel, D-04 numbers). */
function ReportCellValue({
  column,
  row,
  onOpenLink,
}: {
  column: ReportColumnDef;
  row: ReportRow;
  onOpenLink?: (doctype: string, name: string) => void;
}) {
  const raw = row[column.fieldname];
  if (raw === null || raw === undefined || raw === '') {
    return (
      <Text
        fontSize="$3"
        color="$color8">
        —
      </Text>
    );
  }
  if (column.fieldtype === 'Check') {
    return (
      <Text
        fontSize="$3"
        color={raw ? '$green11' : '$color8'}>
        {raw ? '✓' : '—'}
      </Text>
    );
  }
  if (REPORT_NUMERIC_FIELDTYPES.has(column.fieldtype)) {
    const numeric = Number(raw);
    return (
      <Text
        fontSize="$3"
        color="$color12"
        fontFamily="$mono">
        {Number.isFinite(numeric) ? formatNumericCell(numeric, column.fieldtype) : String(raw)}
      </Text>
    );
  }
  const value = String(raw);
  switch (column.fieldtype) {
    case 'Date':
    case 'Datetime': {
      return (
        <Text
          fontSize="$3"
          color="$color11"
          numberOfLines={1}>
          {formatDateCell(value)}
        </Text>
      );
    }
    case 'Link': {
      const target = column.options;
      if (target && onOpenLink) {
        return (
          <Text
            fontSize="$3"
            color="$color11"
            textDecorationLine="underline"
            cursor="pointer"
            numberOfLines={1}
            role="link"
            onPress={(event) => {
              event?.stopPropagation?.();
              onOpenLink(target, value);
            }}>
            {value}
          </Text>
        );
      }
      return (
        <Text
          fontSize="$3"
          color="$color11"
          numberOfLines={1}>
          {value}
        </Text>
      );
    }
    default: {
      return (
        <Text
          fontSize="$3"
          color="$color11"
          numberOfLines={1}>
          {value}
        </Text>
      );
    }
  }
}

export function ReportGrid({
  columns,
  rows,
  sort,
  onSortChange,
  columnFilters,
  onColumnFilterChange,
  onOpenRow,
  onOpenLink,
  totals,
  groupByColumn,
}: ReportGridProps) {
  const { t } = useTranslation();

  const handleSortPress = useCallback(
    (fieldname: string) => {
      if (sort.field === fieldname) {
        onSortChange({ field: fieldname, order: sort.order === 'asc' ? 'desc' : 'asc' });
      } else {
        onSortChange({ field: fieldname, order: 'asc' });
      }
    },
    [sort, onSortChange],
  );

  // ── Row press + keyboard (LC-49 ONE-TAB-STOP, LC-50 KEY-ACTIVATION) ──
  // Mirrors DataTable's getRowPressProps contract (DataTableRoot): the
  // DATA-row set exposes exactly one tab stop (roving anchor — the focused
  // row while focus is inside the set, else the first row); Enter AND
  // Space each fire exactly one activation; arrows/Home/End rove focus;
  // inner interactive content (Link cells) wins over the row press.
  const isSSR = typeof window === 'undefined';
  const [rowAnchor, setRowAnchor] = useState(0);
  const dataRowCount = rows.reduce((count, row) => (row.kind === 'row' ? count + 1 : count), 0);
  const effectiveRowAnchor = Math.min(rowAnchor, Math.max(dataRowCount - 1, 0));

  const getRowPressProps = useCallback(
    (row: ReportRow, pressIndex: number) => {
      const handlePress = (
        event: { defaultPrevented?: boolean; target?: unknown; nativeEvent?: { target?: unknown } } | undefined,
      ) => {
        if (event?.defaultPrevented) {
          return;
        }
        const targetEl = event?.target ?? event?.nativeEvent?.target;
        if (isWeb && typeof Element !== 'undefined' && targetEl instanceof Element) {
          const boundary = targetEl.closest('[data-report-row="true"]');
          if (isInteractiveInnerTarget(targetEl, boundary)) {
            return;
          }
        }
        onOpenRow?.(row.name);
      };
      return {
        // Accessible row name from doc identity (DG-A11Y-06); positional
        // fallback for the defensive empty-name case.
        'aria-label': row.name || t('report.rowLabel', { defaultValue: 'Row {{row}}', row: pressIndex + 1 }),
        onPress: handlePress,
        cursor: 'pointer' as const,
        hoverStyle: { backgroundColor: '$color2' },
        pressStyle: { backgroundColor: '$color4' },
        ...(isWeb && !isSSR
          ? {
              tabIndex: pressIndex === effectiveRowAnchor ? 0 : -1,
              outlineWidth: 0,
              focusStyle: { outlineWidth: 0 },
              focusVisibleStyle: ensureFocusVisibleRing({ outlineOffset: -2 }),
              'data-report-row': 'true',
              onFocus: (event: React.FocusEvent) => {
                // Only a focused ROW moves the anchor; focus on an inner
                // control (own tab stop) leaves the roving state alone.
                if (event.target === event.currentTarget) {
                  setRowAnchor(pressIndex);
                }
              },
              onBlur: (event: React.FocusEvent) => {
                const next = event.relatedTarget;
                if (!(next instanceof Element) || !next.closest('[data-report-row="true"]')) {
                  setRowAnchor(0);
                }
              },
              onKeyDown: (event: React.KeyboardEvent) => {
                if (event.defaultPrevented) {
                  return;
                }
                // Keys on focused inner controls belong to those controls.
                if (event.target !== event.currentTarget) {
                  return;
                }
                const { key } = event;
                if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
                  // preventDefault stops Space page-scroll; one physical
                  // key press = one activation (auto-repeat guarded).
                  event.preventDefault();
                  event.stopPropagation();
                  if (event.repeat) {
                    return;
                  }
                  onOpenRow?.(row.name);
                  return;
                }
                if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End') {
                  event.preventDefault();
                  event.stopPropagation();
                  const rowEl = event.currentTarget as HTMLElement;
                  const scope = rowEl.closest('[data-report-grid="true"]') ?? rowEl.ownerDocument;
                  const pressRows = [...scope.querySelectorAll('[data-report-row="true"]')] as HTMLElement[];
                  const currentIdx = pressRows.indexOf(rowEl);
                  if (currentIdx === -1) {
                    return;
                  }
                  const nextIdx =
                    key === 'Home'
                      ? 0
                      : key === 'End'
                        ? pressRows.length - 1
                        : Math.min(Math.max(currentIdx + (key === 'ArrowDown' ? 1 : -1), 0), pressRows.length - 1);
                  pressRows[nextIdx]?.focus();
                }
              },
            }
          : {}),
      };
    },
    [onOpenRow, effectiveRowAnchor, isSSR, t],
  );

  const totalsByField = new Map(totals.map((total) => [total.fieldname, total]));
  const gridWidth = ROW_NUMBER_WIDTH + columns.reduce((sum, column) => sum + column.width, 0);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator
      flexGrow={0}
      flexShrink={1}>
      <Table
        minWidth={gridWidth}
        width={gridWidth}
        displayMode="flex"
        cellHeight="$3"
        // Roving scope marker: arrow-key navigation queries pressable rows
        // within this container (getRowPressProps).
        {...({ 'data-report-grid': 'true' } as Record<string, unknown>)}>
        <Table.Head>
          {/* Header row: label + sort affordance (aria-sort, Enter/Space). */}
          <Table.Row>
            <Table.HeaderCell
              cellWidth={ROW_NUMBER_WIDTH}
              aria-label={t('report.rowNumber', 'Row number')}>
              <Text
                fontSize="$2"
                color="$color9">
                #
              </Text>
            </Table.HeaderCell>
            {columns.map((column) => {
              const sorted = sort.field === column.fieldname ? sort.order : undefined;
              return (
                <Table.HeaderCell
                  key={column.fieldname}
                  cellWidth={column.width}
                  justifyContent={alignToJustify(column.align)}
                  aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}>
                  <Tooltip
                    content={
                      sorted === 'asc'
                        ? t('report.sortDesc', 'Sorted ascending (press to sort descending)')
                        : sorted === 'desc'
                          ? t('report.sortAsc', 'Sorted descending (press to sort ascending)')
                          : t('report.sortColumn', 'Sort by this column')
                    }>
                    <XStack
                      gap="$1.5"
                      alignItems="center"
                      cursor="pointer"
                      role="button"
                      tabIndex={0}
                      outlineWidth={0}
                      focusStyle={{ outlineWidth: 0 }}
                      focusVisibleStyle={ensureFocusVisibleRing({ outlineOffset: -2 })}
                      aria-label={t('report.sortBy', {
                        defaultValue: 'Sort by {{column}}',
                        column: column.label,
                      })}
                      onPress={() => {
                        handleSortPress(column.fieldname);
                      }}
                      onKeyDown={(event: { key?: string; preventDefault?: () => void }) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault?.();
                          handleSortPress(column.fieldname);
                        }
                      }}
                      hoverStyle={{ opacity: 0.8 }}>
                      <Text
                        fontSize="$3"
                        fontWeight="400"
                        numberOfLines={1}>
                        {column.label}
                      </Text>
                      {/* Caret orientation mirrors DataTable's headers:
                          asc = caret-down, desc = rotated 180. */}
                      <View
                        aria-hidden
                        role="presentation">
                        {sorted ? (
                          <CaretDownIcon
                            size={12}
                            color="var(--color10)"
                            style={sorted === 'desc' ? { transform: 'rotate(180deg)' } : undefined}
                          />
                        ) : (
                          <CaretUpDownIcon
                            size={12}
                            color="var(--color8)"
                          />
                        )}
                      </View>
                    </XStack>
                  </Tooltip>
                </Table.HeaderCell>
              );
            })}
          </Table.Row>
          {/* Filter row — desk parity: one input per column, standard filter
              pipeline. Number/date accept comparison prefixes (>, <, >=…). */}
          <Table.Row>
            <Table.HeaderCell
              cellWidth={ROW_NUMBER_WIDTH}
              paddingVertical="$1.5"
            />
            {columns.map((column) => {
              const placeholder =
                column.kind === 'number' || column.kind === 'date'
                  ? t('report.filterComparablePlaceholder', '= > <…')
                  : column.kind === 'check'
                    ? t('report.filterCheckPlaceholder', 'yes / no')
                    : t('report.filterPlaceholder', 'Filter…');
              return (
                <Table.HeaderCell
                  key={column.fieldname}
                  cellWidth={column.width}
                  paddingVertical="$1.5"
                  overflow="visible">
                  <View
                    flex={1}
                    minWidth={0}
                    overflow="visible">
                    <Input
                      size="$2"
                      compact
                      value={columnFilters[column.fieldname] ?? ''}
                      onChangeText={(next) => {
                        onColumnFilterChange(column.fieldname, next);
                      }}
                      placeholder={placeholder}
                      // inputProps is the eject that reaches the real input
                      // element — a top-level aria-label stays on the wrapper.
                      inputProps={{
                        'aria-label': t('report.filterColumn', {
                          defaultValue: 'Filter {{column}}',
                          column: column.label,
                        }),
                      }}
                    />
                  </View>
                </Table.HeaderCell>
              );
            })}
          </Table.Row>
        </Table.Head>
        <Table.Body>
          {(() => {
            // Position within the pressable DATA-row set (group headers are
            // not pressable and hold no tab stop).
            let pressCursor = -1;
            return rows.map((gridRow) => {
              if (gridRow.kind === 'group') {
                const label =
                  gridRow.value === null || gridRow.value === undefined || gridRow.value === ''
                    ? t('report.groupEmpty', '(blank)')
                    : String(gridRow.value);
                return (
                  <Table.Row
                    key={gridRow.key}
                    backgroundColor="$color2">
                    <Table.Cell
                      cellWidth={gridWidth}
                      paddingVertical="$1.5"
                      role="rowheader">
                      <Text
                        fontSize="$2"
                        fontWeight="400"
                        color="$color11"
                        numberOfLines={1}>
                        {groupByColumn
                          ? t('report.groupHeader', {
                              defaultValue: '{{field}}: {{value}} · {{count}}',
                              field: groupByColumn.label,
                              value: label,
                              count: gridRow.count,
                            })
                          : label}
                      </Text>
                    </Table.Cell>
                  </Table.Row>
                );
              }
              pressCursor += 1;
              return (
                // Spread LAST so the roving tabIndex/handlers stay in
                // charge of this row's interactivity (DataTable precedent).
                <Table.Row
                  key={gridRow.key}
                  {...(onOpenRow
                    ? (getRowPressProps(gridRow.row, pressCursor) as Record<string, unknown>)
                    : { 'aria-label': gridRow.row.name })}>
                  <Table.Cell
                    cellWidth={ROW_NUMBER_WIDTH}
                    paddingVertical="$2">
                    <Text
                      fontSize="$2"
                      color="$color9"
                      fontFamily="$mono">
                      {gridRow.index}
                    </Text>
                  </Table.Cell>
                  {columns.map((column) => (
                    <Table.Cell
                      key={column.fieldname}
                      cellWidth={column.width}
                      paddingVertical="$2"
                      justifyContent={alignToJustify(column.align)}>
                      <ReportCellValue
                        column={column}
                        row={gridRow.row}
                        onOpenLink={onOpenLink}
                      />
                    </Table.Cell>
                  ))}
                </Table.Row>
              );
            });
          })()}
        </Table.Body>
        {totals.length > 0 && (
          <Table.Foot
            borderTopWidth={1}
            borderTopColor="$color6">
            <Table.Row backgroundColor="$color2">
              <Table.Cell
                cellWidth={ROW_NUMBER_WIDTH}
                paddingVertical="$2">
                <Text
                  fontSize="$2"
                  fontWeight="400"
                  color="$color10">
                  {t('report.totals', 'Totals')}
                </Text>
              </Table.Cell>
              {columns.map((column) => {
                const total = totalsByField.get(column.fieldname);
                return (
                  <Table.Cell
                    key={column.fieldname}
                    cellWidth={column.width}
                    paddingVertical="$2"
                    justifyContent={alignToJustify(column.align)}>
                    {total ? (
                      <Text
                        fontSize="$3"
                        fontWeight="400"
                        color="$color12"
                        fontFamily="$mono">
                        {formatNumericCell(total.value, total.fieldtype)}
                      </Text>
                    ) : null}
                  </Table.Cell>
                );
              })}
            </Table.Row>
          </Table.Foot>
        )}
      </Table>
    </ScrollView>
  );
}
