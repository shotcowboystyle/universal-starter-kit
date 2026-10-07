import { Avatar, Text, XStack, YStack } from '@repo/ui';
import { DataTable } from '@repo/table';
import type { DataTableColumn, DataTableData } from '@repo/table';
import { useResolvedKnobs } from '@repo/theme';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { FacetBadge } from '../list/FacetBadge';

import { formatMetric, metricValue } from './insightsRecord';
import type { FrappeInsightsMetric, InsightsRecordView } from './insightsRecord';

interface TableRow<TDoc> extends DataTableData {
  doc: TDoc;
  code: string;
  title: string;
  values: string[];
  [metric: string]: unknown;
}

export interface InsightsTableProps<TDoc> {
  rows: readonly TDoc[];
  metrics: readonly FrappeInsightsMetric[];
  record: InsightsRecordView<TDoc>;
  /** Header of the facet column; without it, no facet column. */
  facetLabel?: string;
  pageSize?: number;
  label: string;
  testID?: string;
}

/**
 * Every record in the catalog DataTable: sortable metric columns, a pager,
 * and the stacked card layout below `$sm`. A row opens its record.
 */
export function InsightsTable<TDoc>({
  rows,
  metrics,
  record,
  facetLabel,
  pageSize = 5,
  label,
  testID,
}: InsightsTableProps<TDoc>) {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs({ compact: true });
  const nestedPx = knobProps.nestedControl.px;
  const hasCode = rows.some((doc) => Boolean(record.code(doc)));

  const data = useMemo<TableRow<TDoc>[]>(
    () =>
      rows.map((doc) => ({
        doc,
        code: record.code(doc) ?? '',
        title: record.title(doc),
        values: record.values(doc),
        ...Object.fromEntries(metrics.map((metric) => [metric.field, metricValue(doc, metric.field)])),
      })),
    [rows, metrics, record],
  );

  const columns = useMemo<DataTableColumn<TableRow<TDoc>>[]>(
    () => [
      ...(hasCode
        ? [
            {
              id: 'code',
              accessorKey: 'code',
              header: t('No.'),
              size: 72,
              cell: ({ row }: { row: { original: TableRow<TDoc> } }) => (
                <Text
                  {...knobProps.label}
                  color="$color10"
                  fontWeight="600">
                  {row.original.code}
                </Text>
              ),
            } satisfies DataTableColumn<TableRow<TDoc>>,
          ]
        : []),
      {
        id: 'record',
        accessorKey: 'title',
        header: t('Record'),
        cell: ({ row }) => (
          <XStack
            gap="$2"
            alignItems="center"
            minWidth={0}>
            <Avatar
              src={record.images(row.original.doc)[0] || undefined}
              name={row.original.title}
              fallbackBackgroundColor="$color4"
              size={nestedPx}
              data-nested-px={nestedPx}
            />
            <YStack
              flexShrink={1}
              minWidth={0}>
              <Text
                fontWeight="600"
                numberOfLines={1}>
                {row.original.title}
              </Text>
            </YStack>
          </XStack>
        ),
      },
      ...(facetLabel
        ? [
            {
              id: 'facet',
              header: facetLabel,
              accessorFn: (row: TableRow<TDoc>) => row.values.join(', '),
              enableSorting: false,
              sortable: false,
              cell: ({ row }: { row: { original: TableRow<TDoc> } }) => (
                <XStack
                  gap="$1.5"
                  flexWrap="wrap">
                  {row.original.values.length > 0 ? (
                    row.original.values.map((value) => (
                      <FacetBadge
                        key={value}
                        label={record.valueLabel(value)}
                        tint={record.valueTint(value)}
                        compact
                      />
                    ))
                  ) : (
                    <Text
                      {...knobProps.label}
                      color="$color10">
                      —
                    </Text>
                  )}
                </XStack>
              ),
            } satisfies DataTableColumn<TableRow<TDoc>>,
          ]
        : []),
      ...metrics.map(
        (metric, index) =>
          ({
            id: metric.field,
            accessorKey: metric.field,
            header: metric.label,
            align: 'right',
            cell: ({ row }: { row: { original: TableRow<TDoc> } }) => (
              <Text fontWeight={index === 0 ? '700' : undefined}>
                {formatMetric(metric, row.original[metric.field] as number)}
              </Text>
            ),
          }) satisfies DataTableColumn<TableRow<TDoc>>,
      ),
    ],
    [t, hasCode, facetLabel, metrics, record, nestedPx, knobProps.label],
  );

  return (
    <YStack testID={testID}>
      <DataTable
        data={data}
        columns={columns}
        enableFiltering={false}
        enableGlobalSearch={false}
        enableSorting
        enablePagination
        pageSizeOptions={[pageSize, pageSize * 2, pageSize * 5]}
        initialState={{ pagination: { pageIndex: 0, pageSize } }}
        readOnly
        columnLayout="auto"
        onRowPress={(row) => {
          record.open(row.doc);
        }}
        rowLabel={(row) => row.title}
        aria-label={label}
      />
    </YStack>
  );
}
