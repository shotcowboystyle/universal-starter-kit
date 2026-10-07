import { Tabs, Text, XStack, YStack } from '@repo/ui';
import { DataTable } from '@repo/table';
import type { DataTableColumn, DataTableData } from '@repo/table';
import { useResolvedKnobs } from '@repo/theme';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ImageWell } from '../list/ImageWell';

import { topBy } from './insightsData';
import { formatMetric, metricValue } from './insightsRecord';
import type { FrappeInsightsMetric, InsightsRecordView } from './insightsRecord';

interface LeaderRow<TDoc> extends DataTableData {
  rank: number;
  doc: TDoc;
  title: string;
  value: number;
}

export interface InsightsLeadersProps<TDoc> {
  rows: readonly TDoc[];
  metrics: readonly FrappeInsightsMetric[];
  record: InsightsRecordView<TDoc>;
  /** Rows per metric. */
  count?: number;
  testID?: string;
}

/**
 * The top records by a metric the reader picks on a contained tab strip,
 * in one compact read-only DataTable; a row opens its record. Nested cell
 * chrome uses the compact nestedControl and label type (LC-73).
 */
export function InsightsLeaders<TDoc>({ rows, metrics, record, count = 5, testID }: InsightsLeadersProps<TDoc>) {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs({ compact: true });
  const [field, setField] = useState(metrics[0]?.field ?? '');
  const metric = metrics.find((candidate) => candidate.field === field) ?? metrics[0];
  const nestedPx = knobProps.nestedControl.px;

  const leaders = useMemo<LeaderRow<TDoc>[]>(
    () =>
      metric
        ? topBy(rows as never[], metric.field, count).map((doc: TDoc, index) => ({
            rank: index + 1,
            doc,
            title: record.title(doc),
            value: metricValue(doc, metric.field),
          }))
        : [],
    [rows, metric, count, record],
  );

  const columns = useMemo<DataTableColumn<LeaderRow<TDoc>>[]>(
    () => [
      {
        id: 'rank',
        accessorKey: 'rank',
        header: t('Rank'),
        size: 64,
        cell: ({ row }) => (
          <Text
            {...knobProps.label}
            color="$color10"
            fontWeight="600">
            {`#${row.original.rank}`}
          </Text>
        ),
      },
      {
        id: 'record',
        accessorKey: 'title',
        header: t('Record'),
        cell: ({ row }) => {
          const tints = record.tints(row.original.doc);
          const code = record.code(row.original.doc);
          return (
            <XStack
              gap="$2"
              alignItems="center"
              minWidth={0}>
              <ImageWell
                sources={record.images(row.original.doc)}
                alt={row.original.title}
                tints={tints}
                inset={0.04}
                width={nestedPx}
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
                {code ? (
                  <Text
                    {...knobProps.label}
                    color="$color10">
                    {code}
                  </Text>
                ) : null}
              </YStack>
            </XStack>
          );
        },
      },
      {
        id: 'value',
        accessorKey: 'value',
        header: metric?.label ?? '',
        align: 'right',
        cell: ({ row }) => <Text fontWeight="700">{metric ? formatMetric(metric, row.original.value) : ''}</Text>,
      },
    ],
    [t, metric, record, nestedPx, knobProps.label],
  );

  if (!metric) {
    return null;
  }
  return (
    <YStack
      {...knobProps.gap}
      testID={testID}>
      {metrics.length > 1 ? (
        <Tabs
          variant="contained"
          compact
          value={metric.field}
          onChange={setField}
          items={metrics.map((candidate) => ({ value: candidate.field, label: candidate.label }))}
        />
      ) : null}
      <DataTable
        data={leaders}
        columns={columns}
        enableFiltering={false}
        enableGlobalSearch={false}
        enableSorting={false}
        enablePagination={false}
        readOnly
        columnLayout="auto"
        onRowPress={(row) => {
          record.open(row.doc);
        }}
        rowLabel={(row) => row.title}
        aria-label={t('Leaders by {{metric}}', { metric: metric.label })}
      />
    </YStack>
  );
}
