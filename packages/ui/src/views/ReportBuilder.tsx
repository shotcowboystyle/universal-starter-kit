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
import { Text, XStack, YStack } from 'tamagui';
import type { YStackProps } from 'tamagui';

import { BarChart } from '../charts/BarChart';
import { componentColors } from '../component-colors';
import { DropdownMenu } from '../DropdownMenu';
import { useDirection } from '../hooks/use-direction';
import { AsyncBoundary, AsyncSkeleton, resolveAsyncStatus } from '../layouts/AsyncBoundary';
import { EmptyState } from '../layouts/Page';
import { ScrollView } from '../ScrollView';
import { useTranslation } from '../shared/i18n';

import { useDomRefCallback } from './dom-interop';
import { isNonEmpty, isNumber, isString } from './guards';

const AGGREGATIONS = ['count', 'sum', 'avg', 'min', 'max'] as const;
const ACCENT_BACKGROUND = '$accentBackground';
const MENU_MAX_HEIGHT = 360;

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

/** One report record: rows are keyed by the report's own field names. */
export interface ReportRow {
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- exported API: report rows have no owner shape, the columns prop names the fields at runtime
  [field: string]: unknown;
}

export interface ReportBuilderProps extends Omit<YStackProps, 'children'> {
  columns: ReportColumn[];
  data: ReportRow[];
  groupBy?: GroupByConfig;
  onGroupByChange?: (config: GroupByConfig | null) => void;
  onColumnsChange?: (enabledFieldnames: string[]) => void;
  onExport?: (data: ReportRow[]) => void;
  onRowPress?: (row: ReportRow, index: number) => void;
  showChart?: boolean;
  isLoading?: boolean;
  error?: Error | React.ReactNode;
  onRetry?: () => void;
  hasActiveFilters?: boolean;
}

const numericFieldTypes = new Set(['Int', 'Float', 'Currency', 'Percent', 'Rating', 'Duration']);

type SortDir = 'asc' | 'desc';
type SortState = { field: string; dir: SortDir } | null;
type FocusItem = { type: 'group'; key: string } | { type: 'row'; row: ReportRow; index: number };
type CellValue = string | number | boolean | Date | null | undefined;
interface ReportGroup {
  rows: ReportRow[];
  aggregationValue: number;
}

const isNumericFieldType = (fieldtype: string): boolean => numericFieldTypes.has(fieldtype);

const isBoolean = (value: unknown): value is boolean => value === true || value === false;

const isScalar = (value: unknown): value is string | number | boolean =>
  isString(value) || isNumber(value) || isBoolean(value);

const isCellValue = (value: unknown): value is CellValue => value == null || isScalar(value) || value instanceof Date;

/** A row field as a displayable value; anything that is not a primitive or Date reads as empty. */
const cellOf = (row: ReportRow, field: string): CellValue => {
  const raw = row[field];
  return isCellValue(raw) ? raw : undefined;
};

const formatCellValue = (value: CellValue, fieldtype: string): string => {
  if (value === null || value === undefined) {
    return '—';
  }
  if (value === true || value === false) {
    return value ? 'Yes' : 'No';
  }
  // Numeric formatters take string | number; a Date has no numeric reading.
  const numeric = value instanceof Date ? undefined : value;

  switch (fieldtype) {
    case 'Check': {
      const checked = Boolean(value);
      return checked ? 'Yes' : 'No';
    }
    case 'Currency': {
      return formatCurrency(numeric);
    }
    case 'Float': {
      return formatNumber(numeric, { maximumFractionDigits: 4 });
    }
    case 'Int': {
      return formatNumber(numeric, { maximumFractionDigits: 0 });
    }
    case 'Percent': {
      return formatPercent(numeric, { precision: 1 });
    }
    case 'Rating': {
      return `${formatNumber(Number(value) * 5, { precision: 1 })} / 5`;
    }
    case 'Date': {
      return formatAbsoluteDate(value);
    }
    case 'Datetime': {
      return formatAbsoluteDateTime(value);
    }
    case 'Time': {
      return formatTimeOfDay(value);
    }
    default: {
      return String(value);
    }
  }
};

const compareValues = (a: CellValue, b: CellValue, fieldtype: string): number => {
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
};

const numberAt = (row: ReportRow, field: string): number => Number(row[field]) || 0;

const aggregateRows = (rows: ReportRow[], { aggregation, aggregationField: field }: GroupByConfig): number => {
  if (aggregation === 'count') {
    return rows.length;
  }
  if (!isNonEmpty(field)) {
    return aggregation === 'sum' ? rows.length : 0;
  }
  if (aggregation === 'sum') {
    return rows.reduce((acc, row) => acc + numberAt(row, field), 0);
  }
  if (rows.length === 0) {
    return 0;
  }
  const values = rows.map((row) => numberAt(row, field));
  if (aggregation === 'avg') {
    return values.reduce((acc, value) => acc + value, 0) / rows.length;
  }
  return aggregation === 'min' ? Math.min(...values) : Math.max(...values);
};

const groupRows = (rows: ReportRow[], groupBy: GroupByConfig, emptyLabel: string) => {
  const rowsByKey = new Map<string, ReportRow[]>();
  for (const row of rows) {
    const key = String(cellOf(row, groupBy.field) ?? emptyLabel);
    const bucket = rowsByKey.get(key);
    if (bucket === undefined) {
      rowsByKey.set(key, [row]);
    } else {
      bucket.push(row);
    }
  }
  return Object.fromEntries(
    [...rowsByKey].map(([key, keyRows]) => [key, { rows: keyRows, aggregationValue: aggregateRows(keyRows, groupBy) }]),
  );
};

const sortRows = (rows: ReportRow[], columns: ReportColumn[], sort: SortState): ReportRow[] => {
  if (!sort) {
    return rows;
  }
  const col = columns.find((c) => c.fieldname === sort.field);
  const fieldtype = col?.fieldtype ?? 'Data';
  return rows.toSorted((a, b) => {
    const cmp = compareValues(cellOf(a, sort.field), cellOf(b, sort.field), fieldtype);
    return sort.dir === 'asc' ? cmp : -cmp;
  });
};

const buildFocusItems = (
  groupBy: GroupByConfig | null | undefined,
  groupEntries: [string, ReportGroup][] | null,
  collapsedGroups: Set<string>,
  sortedData: ReportRow[],
): FocusItem[] => {
  if (groupBy && groupEntries) {
    const items: FocusItem[] = [];
    for (const [key, group] of groupEntries) {
      items.push({ type: 'group', key });
      if (!collapsedGroups.has(key)) {
        for (const [index, row] of group.rows.entries()) {
          items.push({ type: 'row', row, index });
        }
      }
    }
    return items;
  }
  return sortedData.map((row, index) => ({ type: 'row' as const, row, index }));
};

const rowRing = (isFocused: boolean) =>
  isFocused && wasKeyboardFocus() ? keyboardFocusRingProps : { outlineWidth: 0 as const };

const cellAlign = (col: ReportColumn) => (isNumericFieldType(col.fieldtype) ? ('right' as const) : ('left' as const));

const ariaSortFor = (active: boolean, dir: SortDir | undefined): 'none' | 'ascending' | 'descending' => {
  if (!active) {
    return 'none';
  }
  return dir === 'asc' ? 'ascending' : 'descending';
};

const scrollToFocusItem = (tableId: string, index: number) => {
  document.querySelector(`[id="${tableId}-item-${index}"]`)?.scrollIntoView({ block: 'nearest' });
};

const SimpleBarChart = ({ data, height = 200 }: { data: { label: string; value: number }[]; height?: number }) => {
  const { knobProps } = useResolvedKnobs();
  if (data.length === 0) {
    return null;
  }

  return (
    <YStack
      {...knobProps.surface}
      {...knobProps.containerRadius}
      {...knobProps.panelPadding}
      overflow="hidden">
      <BarChart
        data={data}
        height={height}
      />
    </YStack>
  );
};

// ── Keyboard navigation ───────────────────────────────────────

interface ReportHotkeysOptions {
  target: React.RefObject<HTMLElement | null>;
  tableId: string;
  focusItems: FocusItem[];
  effectiveFocused: number;
  collapsedGroups: Set<string>;
  setFocusedIndex: React.Dispatch<React.SetStateAction<number>>;
  toggleGroup: (groupKey: string) => void;
  onRowPress: ((row: ReportRow, index: number) => void) | undefined;
}

const useReportHotkeys = ({
  target,
  tableId,
  focusItems,
  effectiveFocused,
  collapsedGroups,
  setFocusedIndex,
  toggleGroup,
  onRowPress,
}: ReportHotkeysOptions) => {
  const hotkeyOpts = { target };

  useHotkey(
    'ArrowDown',
    () => {
      setFocusedIndex((prev) => {
        const next = prev < 0 ? 0 : Math.min(prev + 1, focusItems.length - 1);
        scrollToFocusItem(tableId, next);
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
        scrollToFocusItem(tableId, next);
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
        scrollToFocusItem(tableId, 0);
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
        scrollToFocusItem(tableId, last);
      }
    },
    hotkeyOpts,
  );
  useHotkey(
    'Enter',
    () => {
      const item = effectiveFocused < 0 ? undefined : focusItems[effectiveFocused];
      if (item === undefined) {
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
      const item = effectiveFocused < 0 ? undefined : focusItems[effectiveFocused];
      if (item?.type === 'group' && !collapsedGroups.has(item.key)) {
        toggleGroup(item.key);
      }
    },
    hotkeyOpts,
  );
  useHotkey(
    'ArrowRight',
    () => {
      const item = effectiveFocused < 0 ? undefined : focusItems[effectiveFocused];
      if (item?.type === 'group' && collapsedGroups.has(item.key)) {
        toggleGroup(item.key);
      }
    },
    hotkeyOpts,
  );
};

// ── Table parts ───────────────────────────────────────────────

interface ReportHeaderRowProps {
  columns: ReportColumn[];
  sort: SortState;
  onSort: (field: string) => void;
}

const ReportHeaderRow = ({ columns, sort, onSort }: ReportHeaderRowProps) => {
  const { knobProps } = useResolvedKnobs();
  const nestedPx = knobProps.nestedControl.px;
  const edgePad = knobProps.panelPadding.padding;
  const iconPx = knobProps.controlIcon.width;
  return (
    <XStack
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Tamagui XStack is the cross-platform primitive (no native <tr> on RN); role supplies the accessibility semantics
      role="row"
      minHeight={nestedPx}
      alignItems="center"
      backgroundColor={componentColors.surface.background}
      {...hairline.bottom}>
      {columns.map((col) => {
        const active = sort?.field === col.fieldname;
        const SortIcon = active && sort?.dir === 'desc' ? CaretDownIcon : CaretUpIcon;
        return (
          <XStack
            key={col.fieldname}
            // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Tamagui XStack is the cross-platform primitive (no native <th> on RN); role supplies the accessibility semantics
            role="columnheader"
            aria-sort={ariaSortFor(active, sort?.dir)}
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
              onSort(col.fieldname);
            }}
            hoverStyle={{ backgroundColor: componentColors.interactive.background }}>
            <Text
              {...knobProps.label}
              color="$color"
              numberOfLines={1}
              textAlign={cellAlign(col)}>
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
};

interface ReportDataRowProps {
  row: ReportRow;
  rowId: string;
  columns: ReportColumn[];
  isFocused: boolean;
  isLast: boolean;
  isGrouped: boolean;
  onPress: (() => void) | undefined;
}

const ReportDataRow = ({ row, rowId, columns, isFocused, isLast, isGrouped, onPress }: ReportDataRowProps) => {
  const { knobProps } = useResolvedKnobs();
  const nestedPx = knobProps.nestedControl.px;
  const edgePad = knobProps.panelPadding.padding;
  return (
    <XStack
      id={rowId}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Tamagui XStack is the cross-platform primitive (no native <tr> on RN); role supplies the accessibility semantics
      role="row"
      aria-selected={isFocused}
      tabIndex={-1}
      data-focused={isFocused ? true : undefined}
      minHeight={nestedPx}
      alignItems="center"
      backgroundColor={isFocused ? ACCENT_BACKGROUND : 'transparent'}
      {...rowRing(isFocused)}
      hoverStyle={{
        backgroundColor: isFocused ? ACCENT_BACKGROUND : componentColors.interactive.background,
      }}
      {...(isLast ? {} : hairline.bottom)}
      {...(isGrouped ? { paddingInlineStart: knobProps.panelPadding.padding } : {})}
      {...(onPress
        ? {
            cursor: 'pointer',
            hitSlop: knobProps.nestedControl.hitSlop,
            onPress,
          }
        : {})}>
      {columns.map((col) => (
        <Text
          key={col.fieldname}
          // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Tamagui Text is the cross-platform primitive (no native <td> on RN); role supplies the accessibility semantics
          role="cell"
          flex={1}
          minWidth={0}
          {...knobProps.body}
          {...knobProps.controlType}
          color="$color"
          paddingHorizontal={edgePad}
          numberOfLines={1}
          textAlign={cellAlign(col)}>
          {formatCellValue(cellOf(row, col.fieldname), col.fieldtype)}
        </Text>
      ))}
    </XStack>
  );
};

interface ReportGroupHeaderProps {
  groupKey: string;
  group: ReportGroup;
  groupBy: GroupByConfig;
  columns: ReportColumn[];
  aggregationLabel: string;
  focusId: string;
  isCollapsed: boolean;
  isFocused: boolean;
  isLast: boolean;
  onPress: () => void;
}

const ReportGroupHeader = ({
  groupKey,
  group,
  groupBy,
  columns,
  aggregationLabel,
  focusId,
  isCollapsed,
  isFocused,
  isLast,
  onPress,
}: ReportGroupHeaderProps) => {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  const nestedPx = knobProps.nestedControl.px;
  const edgePad = knobProps.panelPadding.padding;
  const iconPx = knobProps.controlIcon.width;
  const isRTL = useDirection() === 'rtl';
  const CollapsedCaretIcon = isRTL ? CaretLeftIcon : CaretRightIcon;
  const groupByCol = columns.find((c) => c.fieldname === groupBy.field);
  const aggFieldCol = isNonEmpty(groupBy.aggregationField)
    ? columns.find((c) => c.fieldname === groupBy.aggregationField)
    : null;
  const aggDisplay =
    groupBy.aggregation === 'count'
      ? `${aggregationLabel}: ${formatNumber(group.aggregationValue, { maximumFractionDigits: 0 })}`
      : `${aggregationLabel}(${aggFieldCol?.label ?? groupBy.aggregationField ?? ''}): ${formatNumber(
          group.aggregationValue,
        )}`;
  return (
    <XStack
      id={focusId}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Tamagui XStack is the cross-platform primitive (no native <tr> on RN); role supplies the accessibility semantics
      role="row"
      aria-expanded={!isCollapsed}
      aria-selected={isFocused}
      tabIndex={-1}
      data-focused={isFocused ? true : undefined}
      minHeight={nestedPx}
      hitSlop={knobProps.nestedControl.hitSlop}
      paddingHorizontal={edgePad}
      backgroundColor={isFocused ? ACCENT_BACKGROUND : componentColors.interactive.background}
      {...(isLast && isCollapsed ? {} : hairline.bottom)}
      alignItems="center"
      {...knobProps.gap}
      cursor="pointer"
      {...rowRing(isFocused)}
      onPress={onPress}
      hoverStyle={{
        backgroundColor: isFocused ? ACCENT_BACKGROUND : componentColors.interactive.hover,
      }}>
      {isCollapsed ? (
        <CollapsedCaretIcon
          size={iconPx}
          weight="bold"
        />
      ) : (
        <CaretDownIcon
          size={iconPx}
          weight="bold"
        />
      )}
      <Text
        {...knobProps.label}
        color="$accentColor"
        numberOfLines={1}>
        {groupByCol?.label ?? groupBy.field}: {groupKey}
      </Text>
      <Text
        {...knobProps.label}
        color={knobProps.textAccentColor}>
        ({group.rows.length} {group.rows.length === 1 ? t('record') : t('records')})
      </Text>
      <XStack flex={1} />
      <Text
        {...knobProps.label}
        color="$accentColor"
        numberOfLines={1}>
        {aggDisplay}
      </Text>
    </XStack>
  );
};

interface ReportTotalsRowProps {
  totals: { col: ReportColumn; value: number }[];
  rowCount: number;
}

const ReportTotalsRow = ({ totals, rowCount }: ReportTotalsRowProps) => {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  return (
    <XStack
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Tamagui XStack is the cross-platform primitive (no native <tr> on RN); role supplies the accessibility semantics
      role="row"
      minHeight={knobProps.nestedControl.px}
      alignItems="center"
      paddingHorizontal={knobProps.panelPadding.padding}
      {...hairline.top}
      backgroundColor={componentColors.surface.background}
      {...knobProps.gapLg}
      flexWrap="wrap">
      <Text
        {...knobProps.label}
        color={knobProps.textAccentColor}>
        {t('Totals')}
      </Text>
      {totals.map(({ col, value }) => (
        <Text
          key={col.fieldname}
          {...knobProps.label}
          color="$color">
          {col.label}: <Text {...knobProps.label}>{formatCellValue(value, col.fieldtype)}</Text>
        </Text>
      ))}
      <XStack flex={1} />
      <Text
        {...knobProps.label}
        color={knobProps.textAccentColor}>
        {t('{{count}} row(s)', { count: rowCount })}
      </Text>
    </XStack>
  );
};

// ── Toolbar ───────────────────────────────────────────────────

interface ReportToolbarProps {
  columns: ReportColumn[];
  enabledColumnSet: Set<string>;
  enabledCount: number;
  numericColumns: ReportColumn[];
  groupBy: GroupByConfig | null | undefined;
  aggregationLabels: Record<GroupByConfig['aggregation'], string>;
  chartAvailable: boolean;
  chartVisible: boolean;
  onToggleColumn: (fieldname: string) => void;
  onSelectGroupField: (fieldname: string | null) => void;
  onSelectAggregation: (aggregation: GroupByConfig['aggregation']) => void;
  onSelectAggregationField: (fieldname: string) => void;
  onToggleChart: () => void;
  onExport: (() => void) | undefined;
}

const ReportToolbar = ({
  columns,
  enabledColumnSet,
  enabledCount,
  numericColumns,
  groupBy,
  aggregationLabels,
  chartAvailable,
  chartVisible,
  onToggleColumn,
  onSelectGroupField,
  onSelectAggregation,
  onSelectAggregationField,
  onToggleChart,
  onExport,
}: ReportToolbarProps) => {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  const groupByCol = groupBy ? columns.find((c) => c.fieldname === groupBy.field) : undefined;
  const aggregationField = groupBy?.aggregationField;
  const aggregationFieldCol = isNonEmpty(aggregationField)
    ? columns.find((c) => c.fieldname === aggregationField)
    : undefined;
  return (
    <XStack
      {...knobProps.surface}
      {...knobProps.containerRadius}
      {...knobProps.panelPadding}
      {...knobProps.gap}
      alignItems="center"
      flexWrap="wrap">
      <DropdownMenu>
        <DropdownMenu.Trigger asChild>
          <Button
            size={knobProps.sizeToken}
            chromeless
            {...pressTargetStyle()}>
            {t('Columns ({{enabled}}/{{total}})', {
              enabled: enabledCount,
              total: columns.length,
            })}
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content maxHeight={MENU_MAX_HEIGHT}>
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
                  onToggleColumn(column.fieldname);
                }}>
                {column.label}
              </DropdownMenu.CheckboxItem>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenu.Trigger asChild>
          <Button
            size={knobProps.sizeToken}
            chromeless
            {...pressTargetStyle()}>
            {groupByCol ? t('Group by: {{field}}', { field: groupByCol.label }) : t('Group by')}
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content maxHeight={MENU_MAX_HEIGHT}>
          <DropdownMenu.CheckboxItem
            checked={!groupBy}
            closeOnSelect
            onCheckedChange={() => {
              onSelectGroupField(null);
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
                onSelectGroupField(column.fieldname);
              }}>
              {column.label}
            </DropdownMenu.CheckboxItem>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu>

      {groupBy && (
        <DropdownMenu>
          <DropdownMenu.Trigger asChild>
            <Button
              size={knobProps.sizeToken}
              chromeless
              {...pressTargetStyle()}>
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
                    onSelectAggregation(aggregation);
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
            <Button
              size={knobProps.sizeToken}
              chromeless
              {...pressTargetStyle()}>
              {t('of {{field}}', {
                field: aggregationFieldCol?.label ?? groupBy.aggregationField ?? t('field'),
              })}
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Content maxHeight={MENU_MAX_HEIGHT}>
            {numericColumns.map((column) => (
              <DropdownMenu.CheckboxItem
                key={column.fieldname}
                checked={groupBy.aggregationField === column.fieldname}
                closeOnSelect
                onCheckedChange={() => {
                  onSelectAggregationField(column.fieldname);
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
          onPress={onToggleChart}
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
          onPress={onExport}
          {...pressTargetStyle()}>
          {t('Export')}
        </Button>
      )}
    </XStack>
  );
};

const useReportColumns = (
  columns: ReportColumn[],
  onColumnsChange: ((enabledFieldnames: string[]) => void) | undefined,
) => {
  const [enabledColumnSet, setEnabledColumnSet] = useState<Set<string>>(
    () => new Set(columns.flatMap((c) => (c.enabled ? [c.fieldname] : []))),
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
        onColumnsChange?.([...next]);
        return next;
      });
    },
    [onColumnsChange],
  );

  return { enabledColumnSet, enabledColumns, numericColumns, toggleColumn };
};

interface ReportGroupingOptions {
  groupByProp: GroupByConfig | undefined;
  onGroupByChange: ((config: GroupByConfig | null) => void) | undefined;
  numericColumns: ReportColumn[];
}

const useReportGrouping = ({ groupByProp, onGroupByChange, numericColumns }: ReportGroupingOptions) => {
  const [internalGroupBy, setInternalGroupBy] = useState<GroupByConfig | null>(groupByProp ?? null);
  const groupBy = groupByProp ?? internalGroupBy;

  const handleGroupByChange = useCallback(
    (config: GroupByConfig | null) => {
      setInternalGroupBy(config);
      onGroupByChange?.(config);
    },
    [onGroupByChange],
  );

  const selectGroupField = useCallback(
    (fieldname: string | null) => {
      if (fieldname === null || fieldname === '') {
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

  const selectAggregationField = useCallback(
    (fieldname: string) => {
      if (groupBy) {
        handleGroupByChange({ ...groupBy, aggregationField: fieldname });
      }
    },
    [groupBy, handleGroupByChange],
  );

  return { groupBy, selectGroupField, selectAggregation, selectAggregationField };
};

interface ReportDataOptions {
  data: ReportRow[];
  columns: ReportColumn[];
  enabledColumns: ReportColumn[];
  groupBy: GroupByConfig | null | undefined;
  sort: SortState;
  collapsedGroups: Set<string>;
  emptyGroupLabel: string;
}

/** Sorted, grouped and totaled views of the report data, plus the keyboard focus order. */
const useReportData = ({
  data,
  columns,
  enabledColumns,
  groupBy,
  sort,
  collapsedGroups,
  emptyGroupLabel,
}: ReportDataOptions) => {
  const sortedData = useMemo(() => sortRows(data, columns, sort), [data, sort, columns]);

  const groupedData = useMemo(
    () => (groupBy ? groupRows(sortedData, groupBy, emptyGroupLabel) : null),
    [groupBy, sortedData, emptyGroupLabel],
  );

  const groupEntries = useMemo(() => (groupedData ? Object.entries(groupedData) : []), [groupedData]);

  const chartData = useMemo(
    () => groupEntries.map(([label, group]) => ({ label, value: group.aggregationValue })),
    [groupEntries],
  );

  const totals = useMemo(
    () =>
      enabledColumns.flatMap((col) =>
        isNumericFieldType(col.fieldtype)
          ? [{ col, value: sortedData.reduce((acc, row) => acc + numberAt(row, col.fieldname), 0) }]
          : [],
      ),
    [enabledColumns, sortedData],
  );

  const focusItems = useMemo(
    () => buildFocusItems(groupBy, groupedData ? groupEntries : null, collapsedGroups, sortedData),
    [groupBy, groupedData, groupEntries, collapsedGroups, sortedData],
  );

  return { sortedData, groupedData, groupEntries, chartData, totals, focusItems };
};

interface ReportRowsProps {
  tableId: string;
  columns: ReportColumn[];
  enabledColumns: ReportColumn[];
  groupBy: GroupByConfig | null | undefined;
  groupEntries: [string, ReportGroup][];
  sortedData: ReportRow[];
  collapsedGroups: Set<string>;
  effectiveFocused: number;
  aggregationLabels: Record<GroupByConfig['aggregation'], string>;
  onRowPress: ((row: ReportRow, index: number) => void) | undefined;
  onFocusRow: (focusIdx: number) => void;
  onToggleGroup: (groupKey: string) => void;
}

/** Data rows, flat or grouped; focus indexes follow the on-screen order. */
const ReportRows = ({
  tableId,
  columns,
  enabledColumns,
  groupBy,
  groupEntries,
  sortedData,
  collapsedGroups,
  effectiveFocused,
  aggregationLabels,
  onRowPress,
  onFocusRow,
  onToggleGroup,
}: ReportRowsProps) => {
  const renderDataRow = (row: ReportRow, index: number, focusIdx: number, isLast: boolean, isGrouped = false) => (
    <ReportDataRow
      // oxlint-disable-next-line react-doctor/no-array-index-as-key -- rows without a `name` field carry no stable id and are positional
      key={`${tableId}-row-${String(cellOf(row, 'name') ?? index)}`}
      row={row}
      rowId={`${tableId}-item-${focusIdx}`}
      columns={enabledColumns}
      isFocused={effectiveFocused === focusIdx}
      isLast={isLast}
      isGrouped={isGrouped}
      onPress={
        onRowPress
          ? () => {
              onFocusRow(focusIdx);
              onRowPress(row, index);
            }
          : undefined
      }
    />
  );

  const renderGroupedRows = () => {
    if (!groupBy) {
      return null;
    }
    let cursor = 0;
    return groupEntries.map(([groupKey, group], groupIndex) => {
      const isCollapsed = collapsedGroups.has(groupKey);
      const headerFocus = cursor;
      cursor += 1;
      const isLastGroup = groupIndex === groupEntries.length - 1;
      const rows = isCollapsed
        ? null
        : group.rows.map((row, index) => {
            const focusIdx = cursor;
            cursor += 1;
            return renderDataRow(row, index, focusIdx, isLastGroup && index === group.rows.length - 1, true);
          });
      return (
        <YStack key={groupKey}>
          <ReportGroupHeader
            groupKey={groupKey}
            group={group}
            groupBy={groupBy}
            columns={columns}
            aggregationLabel={aggregationLabels[groupBy.aggregation]}
            focusId={`${tableId}-item-${headerFocus}`}
            isCollapsed={isCollapsed}
            isFocused={effectiveFocused === headerFocus}
            isLast={isLastGroup}
            onPress={() => {
              onFocusRow(headerFocus);
              onToggleGroup(groupKey);
            }}
          />
          {rows}
        </YStack>
      );
    });
  };

  if (groupBy) {
    return renderGroupedRows();
  }
  return sortedData.map((row, index) => renderDataRow(row, index, index, index === sortedData.length - 1));
};

/**
 * Generic report builder — report view chrome:
 * column picker, group-by + aggregation, sortable headers, totals strip,
 * optional grouped chart, export. Rows are a stacked group
 * (CONTAINER-CLIP); selected = fill, keyboard focus = one inset ring.
 */
// oxlint-disable-next-line eslint/complexity -- the report shell wires the toolbar, grid, chart and keyboard hooks together; the branches are the prop defaults and the loading/error states
export const ReportBuilder = ({
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
  // oxlint-disable-next-line sonarjs/cognitive-complexity -- see the complexity note above the component
}: ReportBuilderProps) => {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  const hasError = resolveAsyncStatus({ error }) === 'error';
  const isInitialLoading = !hasError && isLoading && data.length === 0;
  const bounded = height != null || minHeight != null;
  const tableId = useId();
  const gridRef = useRef<HTMLElement | null>(null);
  const gridViewRef = useDomRefCallback(gridRef);
  if (typeof document !== 'undefined') {
    ensureKeyboardModalityTracking();
  }

  const { enabledColumnSet, enabledColumns, numericColumns, toggleColumn } = useReportColumns(columns, onColumnsChange);
  const { groupBy, selectGroupField, selectAggregation, selectAggregationField } = useReportGrouping({
    groupByProp,
    onGroupByChange,
    numericColumns,
  });

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const [sort, setSort] = useState<SortState>(null);
  const [chartVisible, setChartVisible] = useState(showChart);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const { sortedData, groupedData, groupEntries, chartData, totals, focusItems } = useReportData({
    data,
    columns,
    enabledColumns,
    groupBy,
    sort,
    collapsedGroups,
    emptyGroupLabel: t('(empty)'),
  });

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
      const filtered: ReportRow = {};
      for (const col of enabledColumns) {
        filtered[col.fieldname] = row[col.fieldname];
      }
      return filtered;
    });
    onExport?.(exportData);
  }, [sortedData, enabledColumns, onExport]);

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
    setFocusedIndex((prev) => Math.max(prev, 0));
  }, []);

  useReportHotkeys({
    target: gridRef,
    tableId,
    focusItems,
    effectiveFocused,
    collapsedGroups,
    setFocusedIndex,
    toggleGroup,
    onRowPress,
  });

  const focusRow = (focusIdx: number) => {
    setFocusedIndex(focusIdx);
    gridRef.current?.focus();
  };

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
      data-testid="report-builder"
      data-size={knobProps.size}
      data-density={knobProps.density}
      {...knobProps.gap}
      height={height}
      minHeight={minHeight}
      {...stackProps}>
      <ReportToolbar
        columns={columns}
        enabledColumnSet={enabledColumnSet}
        enabledCount={enabledColumns.length}
        numericColumns={numericColumns}
        groupBy={groupBy}
        aggregationLabels={aggregationLabels}
        chartAvailable={chartAvailable}
        chartVisible={chartVisible}
        onToggleColumn={toggleColumn}
        onSelectGroupField={selectGroupField}
        onSelectAggregation={selectAggregation}
        onSelectAggregationField={selectAggregationField}
        onToggleChart={() => {
          setChartVisible((v) => !v);
        }}
        onExport={onExport ? handleExport : undefined}
      />

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
          <AsyncSkeleton
            layout="table"
            padding={knobProps.panelPadding.padding}
          />
        ) : (
          <YStack
            ref={gridViewRef}
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
                <ReportHeaderRow
                  columns={enabledColumns}
                  sort={sort}
                  onSort={cycleSort}
                />
                <ReportRows
                  tableId={tableId}
                  columns={columns}
                  enabledColumns={enabledColumns}
                  groupBy={groupBy}
                  groupEntries={groupEntries}
                  sortedData={sortedData}
                  collapsedGroups={collapsedGroups}
                  effectiveFocused={effectiveFocused}
                  aggregationLabels={aggregationLabels}
                  onRowPress={onRowPress}
                  onFocusRow={focusRow}
                  onToggleGroup={toggleGroup}
                />

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
              <ReportTotalsRow
                totals={totals}
                rowCount={data.length}
              />
            )}
          </YStack>
        )}
      </YStack>
    </YStack>
  );
};
