// The toolbar and footer the old compatibility ReportView composed around
// the generic ReportBuilder. That view is DoctypeReportView now (MPO-15,
// GL-28) and renders neither; both stay exported for hosts that built on
// them:
//   - ReportToolbar: column add/remove picker across all meta fields,
//     group-by + aggregation pickers, page-size selector, filter chips
//   - ReportFooter: totals strip, an "Open" record jump, numbered pagination

import { ArrowSquareOutIcon } from '@phosphor-icons/react';
import { REPORT_NUMERIC_FIELDTYPES, REPORT_PAGE_SIZES } from '@repo/frappe-ui';
import type { GroupByConfig, ReportColumn } from '@repo/frappe-ui';
import { formatCurrency, formatNumber, formatPercent, useResolvedKnobs } from '@repo/theme';
import { Button, Chip, DropdownMenu, Pagination, Text, XStack, YStack } from '@repo/ui';
import { useTranslation } from 'react-i18next';

import { isPresent } from '../desk/resolve-desk-path';
import { BACKOFFICE_I18N_NAMESPACE } from '../i18n';
import { overlayListMaxHeight } from '../shared/measures';
import type { FrappeFilters } from '../shared/types';

export { REPORT_NUMERIC_FIELDTYPES, REPORT_PAGE_SIZES } from '@repo/frappe-ui';

const AGGREGATIONS: GroupByConfig['aggregation'][] = ['count', 'sum', 'avg', 'min', 'max'];

const LIKE_WILDCARD_EDGES = /^%|%$/gu;

/** Display text for a filter tuple's value (LIKE wildcards stripped). */
const filterValueText = (value: FrappeFilters[number][2]): string => {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- filter values are arbitrary URL-param payloads; typeof is the discriminant
  if (typeof value === 'string') {
    return value.replaceAll(LIKE_WILDCARD_EDGES, '');
  }
  if (Array.isArray(value)) {
    return value.map(String).join(', ');
  }
  return JSON.stringify(value);
};

/** Human-readable chip text for a frappe filter tuple. */
const filterChipLabel = ([fieldname, operator, value]: FrappeFilters[number]): string =>
  `${fieldname} ${operator} ${filterValueText(value)}`;

export interface ReportToolbarProps {
  /** All pickable report columns; `enabled` reflects the current selection. */
  columns: ReportColumn[];
  onToggleColumn: (fieldname: string) => void;
  groupBy: GroupByConfig | null;
  onGroupByChange: (groupBy: GroupByConfig | null) => void;
  pageSize: number;
  onPageSizeChange: (pageSize: number) => void;
  /** Base filters applied to the report (`?f=` URL param), shown as chips. */
  filters: FrappeFilters;
  onClearFilters?: () => void;
}

export const ReportToolbar = ({
  columns,
  onToggleColumn,
  groupBy,
  onGroupByChange,
  pageSize,
  onPageSizeChange,
  filters,
  onClearFilters,
}: ReportToolbarProps) => {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const { knobProps } = useResolvedKnobs();
  const enabledCount = columns.filter((column) => column.enabled).length;
  const numericColumns = columns.filter((column) => REPORT_NUMERIC_FIELDTYPES.has(column.fieldtype));
  const groupByColumn = groupBy ? columns.find((column) => column.fieldname === groupBy.field) : undefined;
  const aggregationField = groupBy?.aggregationField;
  const aggregationFieldColumn = isPresent(aggregationField)
    ? columns.find((column) => column.fieldname === aggregationField)
    : undefined;

  const aggregationLabels: Record<GroupByConfig['aggregation'], string> = {
    count: t('report.aggCount', 'Count'),
    sum: t('report.aggSum', 'Sum'),
    avg: t('report.aggAvg', 'Average'),
    min: t('report.aggMin', 'Min'),
    max: t('report.aggMax', 'Max'),
  };

  const selectGroupField = (fieldname: string | null) => {
    if (fieldname === null || fieldname === '') {
      onGroupByChange(null);
      return;
    }
    onGroupByChange({
      field: fieldname,
      aggregation: groupBy?.aggregation ?? 'count',
      aggregationField: groupBy?.aggregationField,
    });
  };

  const selectAggregation = (aggregation: GroupByConfig['aggregation']) => {
    if (!groupBy) {
      return;
    }
    onGroupByChange({
      ...groupBy,
      aggregation,
      aggregationField:
        aggregation === 'count' ? undefined : (groupBy.aggregationField ?? numericColumns[0]?.fieldname),
    });
  };

  return (
    <XStack
      alignItems="center"
      flexWrap="wrap"
      {...knobProps.gap}>
      {/* Column add/remove picker across all meta fields */}
      <DropdownMenu>
        <DropdownMenu.Trigger asChild>
          <Button
            size="$2"
            chromeless>
            {t('report.columns', {
              defaultValue: 'Columns ({{enabled}}/{{total}})',
              enabled: enabledCount,
              total: columns.length,
            })}
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content maxHeight={overlayListMaxHeight}>
          <DropdownMenu.Label>{t('report.pickColumns', 'Report columns')}</DropdownMenu.Label>
          {columns.map((column) => {
            const lastEnabled = column.enabled && enabledCount === 1;
            return (
              <DropdownMenu.CheckboxItem
                key={column.fieldname}
                checked={column.enabled}
                disabled={lastEnabled}
                disabledReason={lastEnabled ? t('report.lastColumn', 'At least one column stays visible') : undefined}
                onCheckedChange={() => {
                  onToggleColumn(column.fieldname);
                }}>
                {column.label}
              </DropdownMenu.CheckboxItem>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu>

      {/* Group-by field */}
      <DropdownMenu>
        <DropdownMenu.Trigger asChild>
          <Button
            size="$2"
            chromeless>
            {groupByColumn
              ? t('report.groupByActive', {
                  defaultValue: 'Group by: {{field}}',
                  field: groupByColumn.label,
                })
              : t('report.groupBy', 'Group by')}
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content maxHeight={overlayListMaxHeight}>
          <DropdownMenu.CheckboxItem
            checked={!groupBy}
            closeOnSelect
            onCheckedChange={() => {
              selectGroupField(null);
            }}>
            {t('report.groupByNone', 'No grouping')}
          </DropdownMenu.CheckboxItem>
          <DropdownMenu.Separator />
          {columns.map((column) => (
            <DropdownMenu.CheckboxItem
              key={column.fieldname}
              checked={groupBy?.field === column.fieldname}
              closeOnSelect
              onCheckedChange={() => {
                selectGroupField(column.fieldname);
              }}>
              {column.label}
            </DropdownMenu.CheckboxItem>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu>

      {/* Aggregation (per-group summary rendered by ReportBuilder) */}
      {groupBy && (
        <DropdownMenu>
          <DropdownMenu.Trigger asChild>
            <Button
              size="$2"
              chromeless>
              {aggregationLabels[groupBy.aggregation]}
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content>
            {AGGREGATIONS.map((aggregation) => {
              const needsNumeric = aggregation !== 'count' && numericColumns.length === 0;
              return (
                <DropdownMenu.CheckboxItem
                  key={aggregation}
                  checked={groupBy.aggregation === aggregation}
                  closeOnSelect
                  disabled={needsNumeric}
                  disabledReason={
                    needsNumeric ? t('report.noNumericFields', 'No numeric fields to aggregate') : undefined
                  }
                  onCheckedChange={() => {
                    selectAggregation(aggregation);
                  }}>
                  {aggregationLabels[aggregation]}
                </DropdownMenu.CheckboxItem>
              );
            })}
          </DropdownMenu.Content>
        </DropdownMenu>
      )}

      {/* Aggregated field (sum/avg/min/max) */}
      {groupBy && groupBy.aggregation !== 'count' && numericColumns.length > 0 && (
        <DropdownMenu>
          <DropdownMenu.Trigger asChild>
            <Button
              size="$2"
              chromeless>
              {t('report.aggregationOf', {
                defaultValue: 'of {{field}}',
                field: aggregationFieldColumn?.label ?? groupBy.aggregationField ?? t('report.pickField', 'field'),
              })}
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content maxHeight={overlayListMaxHeight}>
            {numericColumns.map((column) => (
              <DropdownMenu.CheckboxItem
                key={column.fieldname}
                checked={groupBy.aggregationField === column.fieldname}
                closeOnSelect
                onCheckedChange={() => {
                  onGroupByChange({ ...groupBy, aggregationField: column.fieldname });
                }}>
                {column.label}
              </DropdownMenu.CheckboxItem>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu>
      )}

      <XStack flex={1} />

      {/* Base filter chips (?f= URL param) */}
      {filters.map((tuple, index) => (
        <Chip
          // oxlint-disable-next-line react-doctor/no-array-index-as-key -- tuples can repeat; index kept so a lint-only pass does not change remount behavior
          key={`${tuple[0]}-${index}`}
          size="$2"
          variant="subtle"
          color="gray">
          {filterChipLabel(tuple)}
        </Chip>
      ))}
      {onClearFilters && filters.length > 0 && (
        <Button
          size="$2"
          chromeless
          onPress={onClearFilters}>
          {t('report.clearFilters', 'Clear filters')}
        </Button>
      )}

      {/* Page size (desk page lengths) */}
      <DropdownMenu>
        <DropdownMenu.Trigger asChild>
          <Button
            size="$2"
            chromeless>
            {t('report.pageSize', {
              defaultValue: '{{count}} / page',
              count: pageSize,
            })}
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          {REPORT_PAGE_SIZES.map((size) => (
            <DropdownMenu.CheckboxItem
              key={size}
              checked={pageSize === size}
              closeOnSelect
              onCheckedChange={() => {
                onPageSizeChange(size);
              }}>
              {String(size)}
            </DropdownMenu.CheckboxItem>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu>
    </XStack>
  );
};

export interface ReportRecordRef {
  name: string;
  /** Display title (the doctype's title field value, falling back to name). */
  title: string;
}

export interface ReportTotal {
  label: string;
  fieldtype: string;
  value: number;
}

export interface ReportFooterProps {
  /** 0-based current page. */
  page: number;
  pageCount: number;
  pageSize: number;
  totalItems: number;
  /** Called with the new 0-based page. */
  onPageChange: (page: number) => void;
  /** Records on the current page, for the open-record jump. */
  records: ReportRecordRef[];
  onOpenRecord: (name: string) => void;
  /** Column totals over the full filtered result (desk totals row). */
  totals: ReportTotal[];
}

const OPEN_MENU_LIMIT = 50;

/**
 * Totals render through the house number channel (LC-12 render channel /
 * D-04): the same registers the table cells use, so a footer total never
 * reads raw ("15400") beside a localized cell ("15,400"). The Currency
 * register stays symbol-less here — a column total across mixed-currency
 * rows must not invent a unit the data does not carry.
 */
const formatTotalValue = (value: number, fieldtype: string): string => {
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

export const ReportFooter = ({
  page,
  pageCount,
  pageSize,
  totalItems,
  onPageChange,
  records,
  onOpenRecord,
  totals,
}: ReportFooterProps) => {
  const { t } = useTranslation(BACKOFFICE_I18N_NAMESPACE);
  const { knobProps } = useResolvedKnobs();
  const openRecords = records.slice(0, OPEN_MENU_LIMIT);

  return (
    <YStack {...knobProps.gap}>
      {totals.length > 0 && (
        <XStack
          alignItems="center"
          flexWrap="wrap"
          {...knobProps.gap}>
          <Text
            fontSize="$2"
            fontWeight="400"
            color="$color10">
            {t('report.totals', 'Totals')}
          </Text>
          {totals.map((total) => (
            <Text
              key={total.label}
              fontSize="$2"
              color="$color11">
              {total.label}:{' '}
              <Text
                fontSize="$2"
                fontWeight="400"
                color="$color12">
                {formatTotalValue(total.value, total.fieldtype)}
              </Text>
            </Text>
          ))}
        </XStack>
      )}
      <XStack
        alignItems="center"
        flexWrap="wrap"
        gap="$2">
        {records.length > 0 && (
          <DropdownMenu>
            <DropdownMenu.Trigger asChild>
              <Button
                size="$2"
                chromeless
                icon={ArrowSquareOutIcon}>
                {t('report.openRecord', 'Open')}
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content maxHeight={overlayListMaxHeight}>
              <DropdownMenu.Label>{t('report.openRecordHint', 'Open a record from this page')}</DropdownMenu.Label>
              {openRecords.map((record) => (
                <DropdownMenu.Item
                  key={record.name}
                  shortcut={record.title === record.name ? undefined : record.name}
                  onSelect={() => {
                    onOpenRecord(record.name);
                  }}>
                  {record.title}
                </DropdownMenu.Item>
              ))}
              {records.length > OPEN_MENU_LIMIT && (
                <DropdownMenu.Item
                  disabled
                  disabledReason={t(
                    'report.openRecordOverflow',
                    'Narrow with filters or a smaller page to reach the rest',
                  )}>
                  {t('report.moreRecords', {
                    defaultValue: '+{{count}} more on this page',
                    count: records.length - OPEN_MENU_LIMIT,
                  })}
                </DropdownMenu.Item>
              )}
            </DropdownMenu.Content>
          </DropdownMenu>
        )}
        <XStack flex={1} />
        {pageCount > 1 ? (
          <Pagination
            variant="numbered"
            total={pageCount}
            page={page + 1}
            onPageChange={(nextPage) => {
              onPageChange(nextPage - 1);
            }}
            totalItems={totalItems}
            pageSize={pageSize}
            showSummary
          />
        ) : (
          <Text
            fontSize="$2"
            color="$color10">
            {t('report.recordCount', {
              defaultValue: '{{count}} record(s)',
              count: totalItems,
            })}
          </Text>
        )}
      </XStack>
    </YStack>
  );
};
