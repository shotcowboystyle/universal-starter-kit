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

import { formatDateCell } from '../list/list-format';

import { REPORT_NUMERIC_FIELDTYPES } from './report-view-model';
import type {
  ReportColumnDef,
  ReportGridRow,
  ReportGroupHeader,
  ReportRow,
  ReportSortState,
  ReportTotalsCell,
} from './report-view-model';

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

/** Row press props as spread onto Table.Row (Tamagui view props plus data-* attributes). */
// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- the props are spread onto Table.Row, never read here
type RowViewProps = Record<string, unknown>;

const ROW_SELECTOR = '[data-report-row="true"]';

const isInteractiveInnerTarget = (target: Element, boundary: Element | null): boolean => {
  let node: Element | null = target;
  while (node && node !== boundary) {
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
};

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

const JUSTIFY_BY_ALIGN = { left: 'flex-start', right: 'flex-end', center: 'center' } as const;

const alignToJustify = (align: ReportColumnDef['align']) => JUSTIFY_BY_ALIGN[align];

const ARIA_SORT = { asc: 'ascending', desc: 'descending' } as const;

/** Arrow/Home/End → the row index focus moves to (clamped to the row set). */
const nextRowIndex = (key: string, currentIdx: number, count: number): number => {
  if (key === 'Home') {
    return 0;
  }
  if (key === 'End') {
    return count - 1;
  }
  return Math.min(Math.max(currentIdx + (key === 'ArrowDown' ? 1 : -1), 0), count - 1);
};

const formatNumericCell = (value: number, fieldtype: string): string => {
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
};

/** Fieldtype-aware cell content (query-report cell channel, D-04 numbers). */
const ReportCellValue = ({
  column,
  row,
  onOpenLink,
}: {
  column: ReportColumnDef;
  row: ReportRow;
  onOpenLink?: (doctype: string, name: string) => void;
}) => {
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
    const checked = Boolean(raw);
    return (
      <Text
        fontSize="$3"
        color={checked ? '$green11' : '$color8'}>
        {checked ? '✓' : '—'}
      </Text>
    );
  }
  // oxlint-disable-next-line typescript/no-base-to-string -- cells are wire scalars; String() is the desk's own text form
  const value = String(raw);
  if (REPORT_NUMERIC_FIELDTYPES.has(column.fieldtype)) {
    const numeric = Number(raw);
    return (
      <Text
        fontSize="$3"
        color="$color12"
        fontFamily="$mono">
        {Number.isFinite(numeric) ? formatNumericCell(numeric, column.fieldtype) : value}
      </Text>
    );
  }
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
      if (target !== undefined && target !== '' && onOpenLink) {
        return (
          <Text
            fontSize="$3"
            color="$color11"
            textDecorationLine="underline"
            cursor="pointer"
            numberOfLines={1}
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- opens an in-app route via onPress; there is no href for an <a>
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
};

/** Header cell: label + sort affordance (aria-sort, Enter/Space). */
const SortHeaderCell = ({
  column,
  sorted,
  onSortPress,
}: {
  column: ReportColumnDef;
  sorted: ReportSortState['order'] | undefined;
  onSortPress: (fieldname: string) => void;
}) => {
  const { t } = useTranslation();
  let tooltip: string;
  if (sorted === 'asc') {
    tooltip = t('report.sortDesc', 'Sorted ascending (press to sort descending)');
  } else if (sorted === 'desc') {
    tooltip = t('report.sortAsc', 'Sorted descending (press to sort ascending)');
  } else {
    tooltip = t('report.sortColumn', 'Sort by this column');
  }
  return (
    <Table.HeaderCell
      cellWidth={column.width}
      justifyContent={alignToJustify(column.align)}
      aria-sort={sorted === undefined ? 'none' : ARIA_SORT[sorted]}>
      <Tooltip content={tooltip}>
        <XStack
          gap="$1.5"
          alignItems="center"
          cursor="pointer"
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the control holds block content (<div>s), which is invalid inside <button>; role/tabIndex/Enter+Space give the same semantics
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
            onSortPress(column.fieldname);
          }}
          onKeyDown={(event: { key?: string; preventDefault?: () => void }) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault?.();
              onSortPress(column.fieldname);
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
};

/** Filter-row cell — desk parity: number/date accept comparison prefixes (>, <, >=…). */
const FilterHeaderCell = ({
  column,
  value,
  onChange,
}: {
  column: ReportColumnDef;
  value: string;
  onChange: (fieldname: string, value: string) => void;
}) => {
  const { t } = useTranslation();
  let placeholder: string;
  if (column.kind === 'number' || column.kind === 'date') {
    placeholder = t('report.filterComparablePlaceholder', '= > <…');
  } else if (column.kind === 'check') {
    placeholder = t('report.filterCheckPlaceholder', 'yes / no');
  } else {
    placeholder = t('report.filterPlaceholder', 'Filter…');
  }
  return (
    <Table.HeaderCell
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
          value={value}
          onChangeText={(next) => {
            onChange(column.fieldname, next);
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
};

/** A full-width group header row (not pressable, no tab stop). */
const GroupHeaderRow = ({
  gridRow,
  gridWidth,
  groupByColumn,
}: {
  gridRow: ReportGroupHeader;
  gridWidth: number;
  groupByColumn?: ReportColumnDef;
}) => {
  const { t } = useTranslation();
  const isBlank = gridRow.value === null || gridRow.value === undefined || gridRow.value === '';
  const label = isBlank ? t('report.groupEmpty', '(blank)') : String(gridRow.value);
  return (
    <Table.Row backgroundColor="$color2">
      <Table.Cell
        cellWidth={gridWidth}
        paddingVertical="$1.5"
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- @repo/table's flex Table.Cell renders a view, not a <th>; the role names the group label for AT
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
};

export const ReportGrid = ({
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
}: ReportGridProps) => {
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
  // Position of each grid row within the pressable DATA-row set (group
  // headers are not pressable and hold no tab stop).
  const pressIndexes: number[] = [];
  let dataRowCount = 0;
  for (const row of rows) {
    pressIndexes.push(dataRowCount);
    if (row.kind === 'row') {
      dataRowCount += 1;
    }
  }
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
          const boundary = targetEl.closest(ROW_SELECTOR);
          if (isInteractiveInnerTarget(targetEl, boundary)) {
            return;
          }
        }
        onOpenRow?.(row.name);
      };
      const pressProps = {
        // Accessible row name from doc identity (DG-A11Y-06); positional
        // fallback for the defensive empty-name case.
        'aria-label': row.name || t('report.rowLabel', { defaultValue: 'Row {{row}}', row: pressIndex + 1 }),
        onPress: handlePress,
        cursor: 'pointer' as const,
        hoverStyle: { backgroundColor: '$color2' },
        pressStyle: { backgroundColor: '$color4' },
      };
      if (!isWeb || isSSR) {
        return pressProps;
      }
      return {
        ...pressProps,
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
          if (!(next instanceof Element) || !next.closest(ROW_SELECTOR)) {
            setRowAnchor(0);
          }
        },
        onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => {
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
            const rowEl = event.currentTarget;
            const scope = rowEl.closest('[data-report-grid="true"]') ?? rowEl.ownerDocument;
            const pressRows = [...scope.querySelectorAll<HTMLElement>(ROW_SELECTOR)];
            const currentIdx = pressRows.indexOf(rowEl);
            if (currentIdx === -1) {
              return;
            }
            pressRows[nextRowIndex(key, currentIdx, pressRows.length)]?.focus();
          }
        },
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
        data-report-grid="true">
        <Table.Head>
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
            {columns.map((column) => (
              <SortHeaderCell
                key={column.fieldname}
                column={column}
                sorted={sort.field === column.fieldname ? sort.order : undefined}
                onSortPress={handleSortPress}
              />
            ))}
          </Table.Row>
          {/* Filter row — desk parity: one input per column, standard filter
              pipeline. */}
          <Table.Row>
            <Table.HeaderCell
              cellWidth={ROW_NUMBER_WIDTH}
              paddingVertical="$1.5"
            />
            {columns.map((column) => (
              <FilterHeaderCell
                key={column.fieldname}
                column={column}
                value={columnFilters[column.fieldname] ?? ''}
                onChange={onColumnFilterChange}
              />
            ))}
          </Table.Row>
        </Table.Head>
        <Table.Body>
          {rows.map((gridRow, position) => {
            if (gridRow.kind === 'group') {
              return (
                <GroupHeaderRow
                  key={gridRow.key}
                  gridRow={gridRow}
                  gridWidth={gridWidth}
                  groupByColumn={groupByColumn}
                />
              );
            }
            // oxlint-disable-next-line anti-slop/no-known-value-widening -- one binding holds either prop shape before the spread
            let rowProps: RowViewProps = { 'aria-label': gridRow.row.name };
            if (onOpenRow) {
              // SAFETY: the press props are view props (handlers, styles, a11y, data-*) that Table.Row forwards to its view
              rowProps = getRowPressProps(gridRow.row, pressIndexes[position]) as RowViewProps;
            }
            return (
              // Spread LAST so the roving tabIndex/handlers stay in
              // charge of this row's interactivity (DataTable precedent).
              <Table.Row
                key={gridRow.key}
                {...rowProps}>
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
          })}
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
};
