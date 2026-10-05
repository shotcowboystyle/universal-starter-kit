import {
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CaretUpIcon,
  ChartBarIcon,
  DownloadSimpleIcon,
} from '@phosphor-icons/react';
import { Button } from '@repo/forms';
import {
  formatAbsoluteDate,
  formatAbsoluteDateTime,
  formatCurrency,
  formatNumber,
  formatPercent,
  formatTimeOfDay,
  hairline,
  keyboardFocusRingProps,
  pressTargetStyle,
  useResolvedKnobs,
  ensureKeyboardModalityTracking,
  wasKeyboardFocus,
} from '@repo/theme';
import { useHotkey } from '@tanstack/react-hotkeys';
import React, { useState, useMemo, useCallback, useId, useRef } from 'react';
import { Text, XStack, YStack, type YStackProps } from 'tamagui';

import { BarChart } from '../charts/BarChart';
import { componentColors } from '../componentColors';
import { DropdownMenu } from '../DropdownMenu';
import { useDirection } from '../hooks/useDirection';
import { AsyncBoundary, AsyncSkeleton, resolveAsyncStatus } from '../layouts/AsyncBoundary';
import { EmptyState } from '../layouts/Page';
import { ScrollView } from '../ScrollView';
import { useTranslation } from '../shared/i18n';

const AGGREGATIONS = ['count', 'sum', 'avg', 'min', 'max'] as const;

export interface ReportColumn {
  fieldname: string;
  label: string;
  fieldtype: string;
  enabled: boolean;
}

export interface GroupByConfig {
  field: string;
  aggregation: (typeof AGGREGATIONS)[number];
  aggregationField?: string;
}

export interface ReportBuilderProps extends Omit<YStackProps, 'children'> {
  columns: ReportColumn[];
  data: Record<string, unknown>[];
  groupBy?: GroupByConfig;
  onGroupByChange?: (config: GroupByConfig | null) => void;
  onColumnsChange?: (enabledFieldnames: string[]) => void;
  onExport?: (data: Record<string, unknown>[]) => void;
  onRowPress?: (row: Record<string, unknown>, index: number) => void;
  showChart?: boolean;
  isLoading?: boolean;
  error?: boolean | string | Error | React.ReactNode | null;
  onRetry?: () => void;
  hasActiveFilters?: boolean;
}

const numericFieldTypes = new Set(['Int', 'Float', 'Currency', 'Percent', 'Rating', 'Duration']);

type SortDir = 'asc' | 'desc';
type SortState = { field: string; dir: SortDir } | null;
type FocusItem = { type: 'group'; key: string } | { type: 'row'; row: Record<string, unknown>; index: number };

function isNumericFieldType(fieldtype: string): boolean {
  return numericFieldTypes.has(fieldtype);
}

function formatCellValue(value: unknown, fieldtype: string): string {
  if (value === null || value === undefined) {
    return '\u2014';
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  switch (fieldtype) {
    case 'Check':
      return value ? 'Yes' : 'No';
    case 'Currency':
      return formatCurrency(value as number);
    case 'Float':
      return formatNumber(value as number, { maximumFractionDigits: 4 });
    case 'Int':
      return formatNumber(value as number, { maximumFractionDigits: 0 });
    case 'Percent':
      return formatPercent(value as number, { precision: 1 });
    case 'Rating':
      return `${formatNumber(Number(value) * 5, { precision: 1 })} / 5`;
    case 'Date':
      return formatAbsoluteDate(value as string);
    case 'Datetime':
      return formatAbsoluteDateTime(value as string);
    case 'Time':
      return formatTimeOfDay(value as string);
    default:
      return String(value);
  }
}

function compareValues(a: unknown, b: unknown, fieldtype: string): number {
  if (a == null && b == null) {
    return 0;
  }
  if (a == null) {
    return 1;
  }
  if (b == null) {
    return -1;
  }
  if (isNumericFieldType(fieldtype)) {
    return (Number(a) || 0) - (Number(b) || 0);
  }
  if (fieldtype === 'Date' || fieldtype === 'Datetime' || fieldtype === 'Time') {
    return String(a).localeCompare(String(b));
  }
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function SimpleBarChart({ data, height = 200 }: { data: Array<{ label: string; value: number }>; height?: number }) {
  const { knobProps } = useResolvedKnobs();
  if (data.length === 0) {
    return null;
  }

  return (
    <YStack {...knobProps.surface} {...knobProps.containerRadius} {...knobProps.panelPadding} overflow="hidden">
      <BarChart data={data} height={height} />
    </YStack>
  );
}

/**
 * Generic report builder — Frappe Report View / Query Report chrome:
 * column picker, group-by + aggregation, sortable headers, totals strip,
 * optional grouped chart, export. Rows are a stacked group
 * (CONTAINER-CLIP); selected = fill, keyboard focus = one inset ring.
 */
export function ReportBuilder({
  columns,
  data,
  groupBy: groupByProp,
  onGroupByChange,
  onColumnsChange,
  onExport,
  onRowPress,
  showChart = false,
  isLoading = false,
  error = null,
  onRetry,
  hasActiveFilters = false,
  height,
  minHeight,
  ...stackProps
}: ReportBuilderProps) {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  const nestedPx = knobProps.nestedControl.px;
  const edgePad = knobProps.panelPadding.padding;
  const iconPx = knobProps.controlIcon.width;
  const isRTL = useDirection() === 'rtl';
  const CollapsedCaretIcon = isRTL ? CaretLeftIcon : CaretRightIcon;
  const hasError = resolveAsyncStatus({ error }) === 'error';
  const isInitialLoading = !hasError && isLoading && data.length === 0;
  const bounded = height != null || minHeight != null;
  const tableId = useId();
  const gridRef = useRef<HTMLDivElement>(null);
  if (typeof document !== 'undefined') {
    ensureKeyboardModalityTracking();
  }

  const [enabledColumnSet, setEnabledColumnSet] = useState<Set<string>>(
    () => new Set(columns.filter((c) => c.enabled).map((c) => c.fieldname)),
  );

  const enabledColumns = useMemo(
    () => columns.filter((c) => enabledColumnSet.has(c.fieldname)),
    [columns, enabledColumnSet],
  );

  const numericColumns = useMemo(() => columns.filter((c) => isNumericFieldType(c.fieldtype)), [columns]);

  const toggleColumn = useCallback(
    (fieldname: string) => {
      setEnabledColumnSet((prev) => {
        const next = new Set(prev);
        if (next.has(fieldname)) {
          if (next.size <= 1) {
            return prev;
          }
          next.delete(fieldname);
        } else {
          next.add(fieldname);
        }
        onColumnsChange?.(Array.from(next));
        return next;
      });
    },
    [onColumnsChange],
  );

  const [internalGroupBy, setInternalGroupBy] = useState<GroupByConfig | null>(groupByProp ?? null);
  const groupBy = groupByProp !== undefined ? groupByProp : internalGroupBy;

  const handleGroupByChange = useCallback(
    (config: GroupByConfig | null) => {
      setInternalGroupBy(config);
      onGroupByChange?.(config);
    },
    [onGroupByChange],
  );

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const [sort, setSort] = useState<SortState>(null);
  const [chartVisible, setChartVisible] = useState(showChart);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const sortedData = useMemo(() => {
    if (!sort) {
      return data;
    }
    const col = columns.find((c) => c.fieldname === sort.field);
    const fieldtype = col?.fieldtype ?? 'Data';
    const copy = data.slice();
    copy.sort((a, b) => {
      const cmp = compareValues(a[sort.field], b[sort.field], fieldtype);
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return copy;
  }, [data, sort, columns]);

  const groupedData = useMemo(() => {
    if (!groupBy) {
      return null;
    }

    const groups: Record<string, { rows: Record<string, unknown>[]; aggregationValue: number }> = {};

    for (const row of sortedData) {
      const key = String(row[groupBy.field] ?? t('(empty)'));
      if (!groups[key]) {
        groups[key] = { rows: [], aggregationValue: 0 };
      }
      groups[key].rows.push(row);
    }

    for (const group of Object.values(groups)) {
      switch (groupBy.aggregation) {
        case 'count':
          group.aggregationValue = group.rows.length;
          break;
        case 'sum': {
          const field = groupBy.aggregationField;
          group.aggregationValue = field
            ? group.rows.reduce((acc, row) => acc + (Number(row[field]) || 0), 0)
            : group.rows.length;
          break;
        }
        case 'avg': {
          const field = groupBy.aggregationField;
          if (field && group.rows.length > 0) {
            const sum = group.rows.reduce((acc, row) => acc + (Number(row[field]) || 0), 0);
            group.aggregationValue = sum / group.rows.length;
          }
          break;
        }
        case 'min': {
          const field = groupBy.aggregationField;
          if (field && group.rows.length > 0) {
            group.aggregationValue = Math.min(...group.rows.map((row) => Number(row[field]) || 0));
          }
          break;
        }
        case 'max': {
          const field = groupBy.aggregationField;
          if (field && group.rows.length > 0) {
            group.aggregationValue = Math.max(...group.rows.map((row) => Number(row[field]) || 0));
          }
          break;
        }
      }
    }

    return groups;
  }, [groupBy, sortedData, t]);

  const groupEntries = useMemo(() => (groupedData ? Object.entries(groupedData) : []), [groupedData]);

  const chartData = useMemo(
    () => groupEntries.map(([label, group]) => ({ label, value: group.aggregationValue })),
    [groupEntries],
  );

  const totals = useMemo(() => {
    return enabledColumns
      .filter((col) => isNumericFieldType(col.fieldtype))
      .map((col) => ({
        col,
        value: sortedData.reduce((acc, row) => acc + (Number(row[col.fieldname]) || 0), 0),
      }));
  }, [enabledColumns, sortedData]);

  const focusItems = useMemo((): FocusItem[] => {
    if (groupBy && groupedData) {
      const items: FocusItem[] = [];
      for (const [key, group] of groupEntries) {
        items.push({ type: 'group', key });
        if (!collapsedGroups.has(key)) {
          group.rows.forEach((row, index) => items.push({ type: 'row', row, index }));
        }
      }
      return items;
    }
    return sortedData.map((row, index) => ({ type: 'row' as const, row, index }));
  }, [groupBy, groupedData, groupEntries, collapsedGroups, sortedData]);

  const effectiveFocused = focusedIndex >= focusItems.length ? -1 : focusedIndex;

  const toggleGroup = useCallback((groupKey: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  }, []);

  const cycleSort = useCallback((field: string) => {
    setSort((prev) => {
      if (prev?.field !== field) {
        return { field, dir: 'asc' };
      }
      if (prev.dir === 'asc') {
        return { field, dir: 'desc' };
      }
      return null;
    });
  }, []);

  const handleExport = useCallback(() => {
    const exportData = sortedData.map((row) => {
      const filtered: Record<string, unknown> = {};
      for (const col of enabledColumns) {
        filtered[col.fieldname] = row[col.fieldname];
      }
      return filtered;
    });
    onExport?.(exportData);
  }, [sortedData, enabledColumns, onExport]);

  const selectGroupField = useCallback(
    (fieldname: string | null) => {
      if (!fieldname) {
        handleGroupByChange(null);
        return;
      }
      handleGroupByChange({
        field: fieldname,
        aggregation: groupBy?.aggregation ?? 'count',
        aggregationField: groupBy?.aggregationField,
      });
    },
    [groupBy, handleGroupByChange],
  );

  const selectAggregation = useCallback(
    (aggregation: GroupByConfig['aggregation']) => {
      if (!groupBy) {
        return;
      }
      handleGroupByChange({
        ...groupBy,
        aggregation,
        aggregationField:
          aggregation === 'count' ? undefined : (groupBy.aggregationField ?? numericColumns[0]?.fieldname),
      });
    },
    [groupBy, handleGroupByChange, numericColumns],
  );

  const aggregationLabels: Record<GroupByConfig['aggregation'], string> = {
    count: t('Count'),
    sum: t('Sum'),
    avg: t('Average'),
    min: t('Min'),
    max: t('Max'),
  };

  const handleContainerFocus = useCallback(() => {
    if (!wasKeyboardFocus()) {
      return;
    }
    setFocusedIndex((prev) => (prev < 0 ? 0 : prev));
  }, []);

  const scrollToFocused = useCallback(
    (index: number) => {
      document.getElementById(`${tableId}-item-${index}`)?.scrollIntoView({ block: 'nearest' });
    },
    [tableId],
  );

  const hotkeyOpts = { target: gridRef as React.RefObject<HTMLElement | null> };

  useHotkey(
    'ArrowDown',
    () => {
      setFocusedIndex((prev) => {
        const next = prev < 0 ? 0 : Math.min(prev + 1, focusItems.length - 1);
        scrollToFocused(next);
        return next;
      });
    },
    hotkeyOpts,
  );
  useHotkey(
    'ArrowUp',
    () => {
      setFocusedIndex((prev) => {
        const next = prev < 0 ? focusItems.length - 1 : Math.max(prev - 1, 0);
        scrollToFocused(next);
        return next;
      });
    },
    hotkeyOpts,
  );
  useHotkey(
    'Home',
    () => {
      if (focusItems.length > 0) {
        setFocusedIndex(0);
        scrollToFocused(0);
      }
    },
    hotkeyOpts,
  );
  useHotkey(
    'End',
    () => {
      if (focusItems.length > 0) {
        const last = focusItems.length - 1;
        setFocusedIndex(last);
        scrollToFocused(last);
      }
    },
    hotkeyOpts,
  );
  useHotkey(
    'Enter',
    () => {
      const item = focusItems[effectiveFocused];
      if (!item) {
        return;
      }
      if (item.type === 'group') {
        toggleGroup(item.key);
      } else {
        onRowPress?.(item.row, item.index);
      }
    },
    hotkeyOpts,
  );
  useHotkey(
    'ArrowLeft',
    () => {
      const item = focusItems[effectiveFocused];
      if (item?.type === 'group' && !collapsedGroups.has(item.key)) {
        toggleGroup(item.key);
      }
    },
    hotkeyOpts,
  );
  useHotkey(
    'ArrowRight',
    () => {
      const item = focusItems[effectiveFocused];
      if (item?.type === 'group' && collapsedGroups.has(item.key)) {
        toggleGroup(item.key);
      }
    },
    hotkeyOpts,
  );

  const rowRing = (isFocused: boolean) =>
    isFocused && wasKeyboardFocus() ? keyboardFocusRingProps : { outlineWidth: 0 as const };

  const cellAlign = (col: ReportColumn) => (isNumericFieldType(col.fieldtype) ? ('right' as const) : ('left' as const));

  const renderHeaderRow = () => (
    <XStack
      role="row"
      minHeight={nestedPx}
      alignItems="center"
      backgroundColor={componentColors.surface.background}
      {...hairline.bottom}>
      {enabledColumns.map((col) => {
        const active = sort?.field === col.fieldname;
        const SortIcon = active && sort?.dir === 'desc' ? CaretDownIcon : CaretUpIcon;
        return (
          <XStack
            key={col.fieldname}
            role="columnheader"
            aria-sort={active ? (sort?.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
            flex={1}
            minWidth={0}
            minHeight={nestedPx}
            hitSlop={knobProps.nestedControl.hitSlop}
            alignItems="center"
            justifyContent={cellAlign(col) === 'right' ? 'flex-end' : 'flex-start'}
            gap={knobProps.control.gap}
            paddingHorizontal={edgePad}
            cursor="pointer"
            tabIndex={-1}
            onPress={() => {
              cycleSort(col.fieldname);
            }}
            hoverStyle={{ backgroundColor: componentColors.interactive.background }}>
            <Text {...knobProps.label} color="$color" numberOfLines={1} textAlign={cellAlign(col)}>
              {col.label}
            </Text>
            <SortIcon
              size={iconPx}
              weight="bold"
              color={active ? componentColors.text.primary : knobProps.textAccentColor}
              opacity={active ? 1 : 0.35}
            />
          </XStack>
        );
      })}
    </XStack>
  );

  const renderDataRow = (
    row: Record<string, unknown>,
    index: number,
    focusIdx: number,
    isLast: boolean,
    isGrouped = false,
  ) => {
    const isFocused = effectiveFocused === focusIdx;
    return (
      <XStack
        key={`${tableId}-row-${String(row.name ?? index)}`}
        id={`${tableId}-item-${focusIdx}`}
        role="row"
        aria-selected={isFocused}
        tabIndex={-1}
        {...(isFocused ? { 'data-focused': true } : {})}
        minHeight={nestedPx}
        alignItems="center"
        backgroundColor={isFocused ? '$accentBackground' : 'transparent'}
        {...rowRing(isFocused)}
        hoverStyle={{
          backgroundColor: isFocused ? '$accentBackground' : componentColors.interactive.background,
        }}
        {...(isLast ? {} : hairline.bottom)}
        {...(isGrouped ? { paddingInlineStart: knobProps.panelPadding.padding } : {})}
        {...(onRowPress
          ? {
              cursor: 'pointer',
              hitSlop: knobProps.nestedControl.hitSlop,
              onPress: () => {
                setFocusedIndex(focusIdx);
                gridRef.current?.focus();
                onRowPress(row, index);
              },
            }
          : {})}>
        {enabledColumns.map((col) => (
          <Text
            key={col.fieldname}
            role="cell"
            flex={1}
            minWidth={0}
            {...knobProps.body}
            {...knobProps.controlType}
            color="$color"
            paddingHorizontal={edgePad}
            numberOfLines={1}
            textAlign={cellAlign(col)}>
            {formatCellValue(row[col.fieldname], col.fieldtype)}
          </Text>
        ))}
      </XStack>
    );
  };

  const renderGroupedRows = () => {
    if (!groupBy) {
      return null;
    }
    const groupByCol = columns.find((c) => c.fieldname === groupBy.field);
    const aggLabel = aggregationLabels[groupBy.aggregation];
    const aggFieldCol = groupBy.aggregationField ? columns.find((c) => c.fieldname === groupBy.aggregationField) : null;

    let cursor = 0;
    return groupEntries.map(([groupKey, group], groupIndex) => {
      const isCollapsed = collapsedGroups.has(groupKey);
      const headerFocus = cursor;
      cursor += 1;
      const aggDisplay =
        groupBy.aggregation === 'count'
          ? `${aggLabel}: ${formatNumber(group.aggregationValue, { maximumFractionDigits: 0 })}`
          : `${aggLabel}(${aggFieldCol?.label ?? groupBy.aggregationField ?? ''}): ${formatNumber(
              group.aggregationValue,
            )}`;
      const isFocused = effectiveFocused === headerFocus;
      const header = (
        <XStack
          key={`group-${groupKey}`}
          id={`${tableId}-item-${headerFocus}`}
          role="row"
          aria-expanded={!isCollapsed}
          aria-selected={isFocused}
          tabIndex={-1}
          {...(isFocused ? { 'data-focused': true } : {})}
          minHeight={nestedPx}
          hitSlop={knobProps.nestedControl.hitSlop}
          paddingHorizontal={edgePad}
          backgroundColor={isFocused ? '$accentBackground' : componentColors.interactive.background}
          {...(groupIndex === groupEntries.length - 1 && isCollapsed ? {} : hairline.bottom)}
          alignItems="center"
          {...knobProps.gap}
          cursor="pointer"
          {...rowRing(isFocused)}
          onPress={() => {
            setFocusedIndex(headerFocus);
            gridRef.current?.focus();
            toggleGroup(groupKey);
          }}
          hoverStyle={{
            backgroundColor: isFocused ? '$accentBackground' : componentColors.interactive.hover,
          }}>
          {isCollapsed ? (
            <CollapsedCaretIcon size={iconPx} weight="bold" />
          ) : (
            <CaretDownIcon size={iconPx} weight="bold" />
          )}
          <Text {...knobProps.label} color="$accentColor" numberOfLines={1}>
            {groupByCol?.label ?? groupBy.field}: {groupKey}
          </Text>
          <Text {...knobProps.label} color={knobProps.textAccentColor}>
            ({group.rows.length} {group.rows.length === 1 ? t('record') : t('records')})
          </Text>
          <XStack flex={1} />
          <Text {...knobProps.label} color="$accentColor" numberOfLines={1}>
            {aggDisplay}
          </Text>
        </XStack>
      );
      const rows = isCollapsed
        ? null
        : group.rows.map((row, index) => {
            const focusIdx = cursor;
            cursor += 1;
            const lastInTable = groupIndex === groupEntries.length - 1 && index === group.rows.length - 1;
            return renderDataRow(row, index, focusIdx, lastInTable, true);
          });
      return (
        <YStack key={groupKey}>
          {header}
          {rows}
        </YStack>
      );
    });
  };

  const groupByCol = groupBy ? columns.find((c) => c.fieldname === groupBy.field) : undefined;
  const aggregationFieldCol = groupBy?.aggregationField
    ? columns.find((c) => c.fieldname === groupBy.aggregationField)
    : undefined;
  const chartAvailable = Boolean(groupedData && chartData.length > 0);

  if (hasError) {
    return (
      <AsyncBoundary
        error={error}
        onRetry={onRetry}
        layout="table"
        compact
        errorTitle={t("Couldn't load report")}
        {...knobProps.gap}
        {...stackProps}
      />
    );
  }

  return (
    <YStack
      testID="report-builder"
      {...({
        'data-testid': 'report-builder',
        'data-size': knobProps.size,
        'data-density': knobProps.density,
      } as Record<string, string>)}
      {...knobProps.gap}
      height={height}
      minHeight={minHeight}
      {...stackProps}>
      <XStack
        {...knobProps.surface}
        {...knobProps.containerRadius}
        {...knobProps.panelPadding}
        {...knobProps.gap}
        alignItems="center"
        flexWrap="wrap">
        <DropdownMenu>
          <DropdownMenu.Trigger asChild>
            <Button size={knobProps.sizeToken} chromeless {...pressTargetStyle()}>
              {t('Columns ({{enabled}}/{{total}})', {
                enabled: enabledColumns.length,
                total: columns.length,
              })}
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content maxHeight={360}>
            <DropdownMenu.Label>{t('Report columns')}</DropdownMenu.Label>
            {columns.map((column) => {
              const checked = enabledColumnSet.has(column.fieldname);
              const lastEnabled = checked && enabledColumnSet.size === 1;
              return (
                <DropdownMenu.CheckboxItem
                  key={column.fieldname}
                  checked={checked}
                  disabled={lastEnabled}
                  disabledReason={lastEnabled ? t('At least one column stays visible') : undefined}
                  onCheckedChange={() => {
                    toggleColumn(column.fieldname);
                  }}>
                  {column.label}
                </DropdownMenu.CheckboxItem>
              );
            })}
          </DropdownMenu.Content>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenu.Trigger asChild>
            <Button size={knobProps.sizeToken} chromeless {...pressTargetStyle()}>
              {groupByCol ? t('Group by: {{field}}', { field: groupByCol.label }) : t('Group by')}
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content maxHeight={360}>
            <DropdownMenu.CheckboxItem
              checked={!groupBy}
              closeOnSelect
              onCheckedChange={() => {
                selectGroupField(null);
              }}>
              {t('No grouping')}
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

        {groupBy && (
          <DropdownMenu>
            <DropdownMenu.Trigger asChild>
              <Button size={knobProps.sizeToken} chromeless {...pressTargetStyle()}>
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
                    disabledReason={needsNumeric ? t('No numeric fields to aggregate') : undefined}
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

        {groupBy && groupBy.aggregation !== 'count' && numericColumns.length > 0 && (
          <DropdownMenu>
            <DropdownMenu.Trigger asChild>
              <Button size={knobProps.sizeToken} chromeless {...pressTargetStyle()}>
                {t('of {{field}}', {
                  field: aggregationFieldCol?.label ?? groupBy.aggregationField ?? t('field'),
                })}
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Content maxHeight={360}>
              {numericColumns.map((column) => (
                <DropdownMenu.CheckboxItem
                  key={column.fieldname}
                  checked={groupBy.aggregationField === column.fieldname}
                  closeOnSelect
                  onCheckedChange={() => {
                    handleGroupByChange({ ...groupBy, aggregationField: column.fieldname });
                  }}>
                  {column.label}
                </DropdownMenu.CheckboxItem>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu>
        )}

        <XStack flex={1} />

        {chartAvailable && (
          <Button
            size={knobProps.sizeToken}
            chromeless
            icon={ChartBarIcon}
            aria-pressed={chartVisible}
            onPress={() => {
              setChartVisible((v) => !v);
            }}
            theme={chartVisible ? 'active' : undefined}
            {...pressTargetStyle()}>
            {t('Chart')}
          </Button>
        )}

        {onExport && (
          <Button
            size={knobProps.sizeToken}
            chromeless
            icon={DownloadSimpleIcon}
            onPress={handleExport}
            {...pressTargetStyle()}>
            {t('Export')}
          </Button>
        )}
      </XStack>

      {chartVisible && chartAvailable && (
        <YStack {...knobProps.gap}>
          <SimpleBarChart data={chartData} />
        </YStack>
      )}

      <YStack
        {...knobProps.surface}
        {...knobProps.containerRadius}
        overflow="hidden"
        flex={bounded ? 1 : undefined}
        minHeight={bounded ? 0 : undefined}>
        {isInitialLoading ? (
          <AsyncSkeleton layout="table" padding={knobProps.panelPadding.padding} />
        ) : (
          <YStack
            ref={gridRef as any}
            flex={bounded ? 1 : undefined}
            minHeight={bounded ? 0 : undefined}
            role="grid"
            aria-rowcount={sortedData.length}
            aria-colcount={enabledColumns.length}
            aria-label={t('Report')}
            aria-activedescendant={effectiveFocused >= 0 ? `${tableId}-item-${effectiveFocused}` : undefined}
            tabIndex={0}
            outlineWidth={0}
            onFocus={handleContainerFocus}>
            <ScrollView flex={bounded ? 1 : undefined}>
              <YStack minWidth="100%">
                {renderHeaderRow()}
                {groupBy && groupedData
                  ? renderGroupedRows()
                  : sortedData.map((row, index) => renderDataRow(row, index, index, index === sortedData.length - 1))}

                {data.length === 0 && (
                  <EmptyState
                    compact
                    aria-live="polite"
                    data-async-state={hasActiveFilters ? 'no-results' : 'empty'}
                    title={hasActiveFilters ? t('No results found') : t('No data to display')}
                  />
                )}
              </YStack>
            </ScrollView>
            {data.length > 0 && (
              <XStack
                role="row"
                minHeight={nestedPx}
                alignItems="center"
                paddingHorizontal={edgePad}
                {...hairline.top}
                backgroundColor={componentColors.surface.background}
                {...knobProps.gapLg}
                flexWrap="wrap">
                <Text {...knobProps.label} color={knobProps.textAccentColor}>
                  {t('Totals')}
                </Text>
                {totals.map(({ col, value }) => (
                  <Text key={col.fieldname} {...knobProps.label} color="$color">
                    {col.label}: <Text {...knobProps.label}>{formatCellValue(value, col.fieldtype)}</Text>
                  </Text>
                ))}
                <XStack flex={1} />
                <Text {...knobProps.label} color={knobProps.textAccentColor}>
                  {t('{{count}} row(s)', { count: data.length })}
                </Text>
              </XStack>
            )}
          </YStack>
        )}
      </YStack>
    </YStack>
  );
}
