import type { DataTableColumn } from '@repo/table';
import { Text } from '@repo/ui';
// Query-report column meta → DataTable columns with fieldtype-aware cells:
// numerics right-aligned, Date/Datetime trimmed like desk lists, Link cells
// navigable to the target doc form, HTML values (desk anchor markup)
// flattened to text.
import React from 'react';

import { formatDateCell } from '../list/list-format';

import { stripHtml } from './query-report';
import type { QueryReportColumn, QueryReportRow } from './query-report';

const NUMERIC_FIELDTYPES = new Set(['Currency', 'Float', 'Int', 'Percent', 'Duration']);

export interface BuildQueryReportColumnsArgs {
  columns: readonly QueryReportColumn[];
  /** Open a Link cell's target document (doctype comes from column options). */
  onOpenLink?: (doctype: string, name: string) => void;
}

const queryReportCell = (column: QueryReportColumn, onOpenLink?: (doctype: string, name: string) => void) =>
  // oxlint-disable-next-line anti-slop/no-unknown-returns -- TanStack's cell context types getValue as unknown; the cell narrows it below
  function QueryReportCell({ getValue }: { getValue: () => unknown }) {
    const raw = getValue();
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
    // oxlint-disable-next-line typescript/no-base-to-string -- report cells are server scalars; String() matches desk's text coercion
    const value = String(raw);
    if (NUMERIC_FIELDTYPES.has(column.fieldtype)) {
      return (
        <Text
          fontSize="$3"
          color="$color12"
          textAlign="right">
          {value}
        </Text>
      );
    }
    switch (column.fieldtype) {
      case 'Date':
      case 'Datetime': {
        return (
          <Text
            fontSize="$3"
            color="$color11">
            {formatDateCell(value)}
          </Text>
        );
      }
      case 'Link': {
        const doctype = column.options;
        if (doctype !== undefined && doctype !== '' && onOpenLink) {
          return (
            <Text
              fontSize="$3"
              color="$color11"
              textDecorationLine="underline"
              cursor="pointer"
              numberOfLines={1}
              // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Tamagui Text renders natively too; role=link exposes the pressable cell without an <a>
              role="link"
              onPress={(event) => {
                event?.stopPropagation?.();
                onOpenLink(doctype, value);
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
            {stripHtml(value)}
          </Text>
        );
      }
    }
  };

/** Build DataTable columns for a query-report run result. */
export const buildQueryReportColumns = ({
  columns,
  onOpenLink,
}: BuildQueryReportColumnsArgs): DataTableColumn<QueryReportRow>[] =>
  columns.map((column) => {
    const tableColumn: DataTableColumn<QueryReportRow> = {
      id: column.fieldname,
      header: column.label,
      // accessorFn (not accessorKey): report fieldnames may contain path-y
      // characters like "assigned_to/owner" that key-based access mangles.
      accessorFn: (row: QueryReportRow) => row[column.fieldname],
      cell: queryReportCell(column, onOpenLink),
    };
    if (NUMERIC_FIELDTYPES.has(column.fieldtype)) {
      tableColumn.align = 'right';
    }
    if (column.width !== undefined && column.width !== 0) {
      tableColumn.width = column.width;
    }
    return tableColumn;
  });

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- CSV cells are arbitrary report values; this is their serializer
const escapeCsvCell = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }
  // oxlint-disable-next-line typescript/no-base-to-string -- report cells are server scalars; String() matches desk's text coercion
  const text = stripHtml(String(value));
  return /[",\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

/** CSV over the full run result (Desk Export, not just the current page). */
export const buildQueryReportCsv = (columns: readonly QueryReportColumn[], rows: readonly QueryReportRow[]): string =>
  [
    columns.map((column) => escapeCsvCell(column.label)).join(','),
    ...rows.map((row) => columns.map((column) => escapeCsvCell(row[column.fieldname])).join(',')),
  ].join('\n');
