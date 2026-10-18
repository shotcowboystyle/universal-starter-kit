import type { DataTableColumn } from '@repo/table';
import { Text } from '@repo/ui';
// Query-report column meta → DataTable columns with fieldtype-aware cells:
// numerics right-aligned, Date/Datetime trimmed like desk lists, Link cells
// navigable to the target doc form, HTML values (desk anchor markup)
// flattened to text.
import React from 'react';

import { formatDateCell } from '../list/listFormat';

import { stripHtml } from './queryReport';
import type { QueryReportColumn, QueryReportRow } from './queryReport';

const NUMERIC_FIELDTYPES = new Set(['Currency', 'Float', 'Int', 'Percent', 'Duration']);

export interface BuildQueryReportColumnsArgs {
  columns: readonly QueryReportColumn[];
  /** Open a Link cell's target document (doctype comes from column options). */
  onOpenLink?: (doctype: string, name: string) => void;
}

function queryReportCell(column: QueryReportColumn, onOpenLink?: (doctype: string, name: string) => void) {
  return ({ getValue }: { getValue: () => unknown }) => {
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
      return (
        <Text
          fontSize="$3"
          color={raw ? '$green11' : '$color8'}>
          {raw ? '✓' : '—'}
        </Text>
      );
    }
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
        if (doctype && onOpenLink) {
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
}

/** Build DataTable columns for a query-report run result. */
export function buildQueryReportColumns({
  columns,
  onOpenLink,
}: BuildQueryReportColumnsArgs): DataTableColumn<QueryReportRow>[] {
  return columns.map((column) => ({
    id: column.fieldname,
    header: column.label,
    // accessorFn (not accessorKey): report fieldnames may contain path-y
    // characters like "assigned_to/owner" that key-based access mangles.
    accessorFn: (row: QueryReportRow) => row[column.fieldname],
    ...(NUMERIC_FIELDTYPES.has(column.fieldtype) ? { align: 'right' as const } : {}),
    ...(column.width ? { width: column.width } : {}),
    cell: queryReportCell(column, onOpenLink),
  }));
}

function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  const text = stripHtml(String(value));
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** CSV over the full run result (Desk Export, not just the current page). */
export function buildQueryReportCsv(columns: readonly QueryReportColumn[], rows: readonly QueryReportRow[]): string {
  return [
    columns.map((column) => escapeCsvCell(column.label)).join(','),
    ...rows.map((row) => columns.map((column) => escapeCsvCell(row[column.fieldname])).join(',')),
  ].join('\n');
}
