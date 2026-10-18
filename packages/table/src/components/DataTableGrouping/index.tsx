import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChartBarIcon,
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  MinusIcon,
  GearIcon,
} from '@phosphor-icons/react';
import { Button, FloatingPanel, Select } from '@repo/forms';
import {
  ensureFocusVisibleRing,
  formatNumber,
  getGroupPosition,
  hairline,
  stackEdgeRadius,
  stackRadiusProps,
  useResolvedKnobs,
} from '@repo/theme';
import type { GroupPosition } from '@repo/theme';
import { useDirection } from '@repo/ui';
import type { Table } from '@tanstack/react-table';
import { useCallback, useMemo, useState } from 'react';
import { Separator, Text, View, XStack, YStack, isWeb } from 'tamagui';

import { iconSizeForToken } from '../../utils/chrome-icons';
import { getViewLeafRows } from '../../utils/view-data';
import { useDataTableState } from '../DataTable/data-table-state-context';

export type AggregationFunction = 'count' | 'sum' | 'avg' | 'min' | 'max' | 'custom';

export interface AggregationConfig {
  column: string;
  function: AggregationFunction;
  label?: string;
  // oxlint-disable-next-line typescript/method-signature-style, anti-slop/no-unknown-returns -- method syntax keeps callers' narrower callbacks (e.g. `(values: number[]) => number`) assignable; custom results are arbitrary and formatted at render
  customFunction?(values: unknown[]): unknown;
}

export interface GroupingConfig {
  columns: string[];
  aggregations: AggregationConfig[];
  showEmptyGroups?: boolean;
  expandedByDefault?: boolean;
  maxDepth?: number;
}

export type GroupingColumnType = 'string' | 'number' | 'date' | 'boolean';

export interface GroupingColumn {
  accessorKey?: string;
  header?: string | React.ReactNode;
  id?: string;
  type?: GroupingColumnType;
}

export interface AggregationResult {
  count?: number;
  sum?: number;
  avg?: number;
  min?: number;
  max?: number;
  custom?: unknown;
}

export interface GroupedData<T = unknown> {
  key: string;
  value: unknown;
  count: number;
  aggregations: Record<string, AggregationResult>;
  items: T[];
  children?: GroupedData<T>[];
  level: number;
  path: unknown[];
}

export interface DataTableGroupingProps<T = unknown> {
  data?: T[];
  columns?: GroupingColumn[];
  groupBy?: string[];
  aggregations?: AggregationConfig[];
  onGroupingChange?: (config: GroupingConfig) => void;
  renderGroupHeader?: (group: GroupedData<T>, level: number) => React.ReactNode;
  renderGroupFooter?: (group: GroupedData<T>, level: number) => React.ReactNode;
  showAggregations?: boolean;
  expandedGroups?: Set<string>;
  onExpandedGroupsChange?: (expanded: Set<string>) => void;
  maxDepth?: number;
}

const EMPTY_EXPANDED_GROUPS = new Set<string>();
const EMPTY_GROUP_BY: string[] = [];
const EMPTY_AGGREGATIONS: AggregationConfig[] = [];
const EMPTY_COLUMNS: GroupingColumn[] = [];
const HOVER_BACKGROUND = '$backgroundHover';

// SP-EDGE row density (getTableCellPadding precedent): the space knob moves
// row padding; medium keeps the previous hardcoded $3/$2 defaults.
const groupHeaderPaddingMap = new Map([
  ['small', '$2'],
  ['medium', '$3'],
  ['large', '$4'],
]);
const groupItemPaddingMap = new Map([
  ['small', '$1'],
  ['medium', '$2'],
  ['large', '$3'],
]);

// Tree indent rides the space knob so nested groups stay flush full-bleed
// rows (padding, never margin) — AG Grid / Excel / Airtable grouping: the
// chevron and label step in, the painted row still spans the stack.
const groupIndentStepMap = new Map([
  ['small', 12],
  ['medium', 16],
  ['large', 24],
]);

// T-VALUE meta text rides one step below the size-knob body scale (LC-18);
// medium keeps the previous $3.
const groupMetaSizeMap = new Map([
  ['$3', '$2'],
  ['$4', '$3'],
  ['$5', '$4'],
]);

const popoverMinWidthMap = new Map([
  ['$3', 320],
  ['$5', 480],
]);
const popoverMaxWidthMap = new Map([
  ['$3', 400],
  ['$5', 560],
]);

const AGGREGATION_FUNCTION_OPTIONS: { value: AggregationFunction; label: string }[] = [
  { value: 'count', label: 'Count' },
  { value: 'sum', label: 'Sum' },
  { value: 'avg', label: 'Average' },
  { value: 'min', label: 'Minimum' },
  { value: 'max', label: 'Maximum' },
];

// Chevron/tree glyphs are control-internal icons (LC-75/LC-79): the
// generated recipe's icon channel (lossless vs the old $3/$4/$5 map).
const groupIconSize = (token: string): number => iconSizeForToken(token);

const groupStartRail = (borderWidth: number) => {
  const width = borderWidth === 0 ? 0 : borderWidth * 4;
  return isWeb
    ? {
        borderInlineStartWidth: width,
        borderInlineStartStyle: 'solid' as const,
        borderInlineStartColor: '$color6',
      }
    : { borderStartWidth: width, borderStartColor: '$color6' };
};

const groupIndent = (space: string | undefined, level: number): number =>
  (groupIndentStepMap.get(space ?? 'medium') ?? 16) * Math.max(0, level);

// oxlint-disable-next-line anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns -- generic row cells: T is unconstrained, so a field read has no schema at this layer
const readField = (item: unknown, key: string): unknown =>
  // SAFETY: grouping rows are caller-supplied records indexed by column accessor key; the value is consumed as unknown.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-unsafe-dictionary-type -- generic row data has no schema at this layer
  (item as Record<string, unknown>)[key];

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- cells of arbitrary row data; there is no parse boundary for a generic table
const formatCellValue = (value: unknown): string => {
  if (value == null) {
    return '';
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- cell values are arbitrary row data; numbers get the house number format
  if (typeof value === 'number') {
    return Number.isFinite(value) ? formatNumber(value) : '';
  }
  // oxlint-disable-next-line typescript/no-base-to-string -- arbitrary cell values render through their own string form
  return String(value);
};

/**
 * Group aggregates are the same number class as the cells they summarise, so
 * they render through the house number register (LC-12 render channel) —
 * "15,400", never the raw `15400` beside a localized cell. Counts are whole
 * by construction; a custom aggregation may return anything, and a
 * non-numeric result passes through as its own text.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- custom aggregations may return anything; this is the render boundary
export const formatAggregateValue = (value: unknown, agg: AggregationConfig): string => {
  if (value == null) {
    return formatNumber(0);
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- custom aggregation results are untyped; numbers get the house number format
  if (typeof value === 'number') {
    // The aggregation math is NaN-guarded upstream; keep the zero floor so a
    // guard slipping through still reads as a number, not a hole.
    if (!Number.isFinite(value)) {
      return formatNumber(0);
    }
    return agg.function === 'count' ? formatNumber(value, { maximumFractionDigits: 0 }) : formatNumber(value);
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- custom aggregation results are untyped; numeric strings are localized
  if (typeof value === 'string') {
    const asNumber = Number(value);
    return value.trim() !== '' && Number.isFinite(asNumber) ? formatNumber(asNumber) : value;
  }
  // oxlint-disable-next-line typescript/no-base-to-string -- non-numeric custom results pass through as their own text
  return String(value);
};

const getGroupKey = (group: GroupedData): string => group.path.join(' → ');

const finiteNumbers = (values: unknown[]): number[] => {
  const nums: number[] = [];
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num)) {
      nums.push(num);
    }
  }
  return nums;
};

const columnsFromTable = <TData,>(table: Table<TData>): GroupingColumn[] =>
  table.getAllColumns().map((col) => ({
    id: col.id,
    accessorKey: col.id,
    // oxlint-disable-next-line anti-slop/no-runtime-typeof -- TanStack header is a string or a render function; only strings are labels
    header: typeof col.columnDef.header === 'string' ? col.columnDef.header : col.id,
  }));

// Data Grouping Utilities

export const groupData = <T,>(data: T[], groupByColumns: string[], aggregations: AggregationConfig[], maxDepth = 5) => {
  if (!groupByColumns.length) {
    return null;
  }

  const [firstColumn] = groupByColumns;
  const grouped = new Map<string, { items: T[]; key: unknown; path: unknown[] }>();

  // Group data by the first column. Nullish coalescing (not ||) so falsy
  // values like 0, false, and "" form their own groups instead of all
  // collapsing into a shared "null" bucket.
  for (const item of data) {
    const firstGroupValue = readField(item, firstColumn);
    // oxlint-disable-next-line typescript/no-base-to-string -- group keys stringify arbitrary row values by design
    const key = String(firstGroupValue ?? 'null');

    if (!grouped.has(key)) {
      grouped.set(key, {
        items: [],
        key: firstGroupValue,
        path: [firstGroupValue],
      });
    }

    const bucket = grouped.get(key);
    if (bucket) {
      bucket.items.push(item);
    }
  }

  // Convert to GroupedData format
  const result = [...grouped.entries()].map(([key, group]) => {
    const aggregationsResult: Record<string, AggregationResult> = {};

    // Calculate aggregations
    for (const agg of aggregations) {
      const target = aggregationsResult[agg.column] ?? {};
      aggregationsResult[agg.column] = target;

      const values = group.items.map((item) => readField(item, agg.column)).filter((val) => val != null);

      switch (agg.function) {
        case 'count': {
          target.count = group.items.length;
          break;
        }
        case 'sum': {
          target.sum = values.reduce<number>((acc, val) => acc + (Number(val) || 0), 0);
          break;
        }
        case 'avg': {
          const total = values.reduce<number>((acc, val) => acc + (Number(val) || 0), 0);
          target.avg = values.length > 0 ? Math.round((total / values.length) * 100) / 100 : 0;
          break;
        }
        case 'min': {
          // Skip non-numeric values (e.g. date strings) — one bad value must
          // not poison the whole aggregate with NaN.
          const nums = finiteNumbers(values);
          target.min = nums.length > 0 ? Math.min(...nums) : 0;
          break;
        }
        case 'max': {
          const nums = finiteNumbers(values);
          target.max = nums.length > 0 ? Math.max(...nums) : 0;
          break;
        }
        case 'custom': {
          target.custom = agg.customFunction ? agg.customFunction(values) : null;
          break;
        }
        default: {
          break;
        }
      }
    }

    const groupedItem: GroupedData<T> = {
      key,
      value: group.key,
      count: group.items.length,
      aggregations: aggregationsResult,
      items: group.items,
      level: 0,
      path: group.path,
    };

    // Recursively group children if more columns
    if (groupByColumns.length > 1 && groupedItem.level < maxDepth - 1) {
      const childGroups = groupData(group.items, groupByColumns.slice(1), aggregations, maxDepth);
      if (childGroups) {
        groupedItem.children = childGroups.map((child) => ({
          ...child,
          level: child.level + 1,
          path: [group.key, ...child.path],
        }));
      }
    }

    return groupedItem;
  });

  return result;
};

interface GroupFooterProps<T> {
  group: GroupedData<T>;
  level: number;
  renderCustomFooter: (group: GroupedData<T>, level: number) => React.ReactNode;
}

const GroupFooter = <T,>({ group, level, renderCustomFooter }: GroupFooterProps<T>) => {
  const { knobProps } = useResolvedKnobs();
  return <View paddingInlineStart={groupIndent(knobProps.space, level)}>{renderCustomFooter(group, level)}</View>;
};

interface GroupItemsProps<T> {
  items: T[];
  columns?: GroupingColumn[];
  level: number;
  stackEnd: boolean;
}

const GroupItems = <T,>({ items, columns = EMPTY_COLUMNS, level, stackEnd }: GroupItemsProps<T>) => {
  const { knobProps } = useResolvedKnobs();
  const metaSize = groupMetaSizeMap.get(knobProps.sizeToken) ?? '$3';
  const indent = groupIndent(knobProps.space, level);
  const iconSize = groupIconSize(knobProps.sizeToken);
  return (
    <YStack>
      {items.map((item, index) => {
        const position = getGroupPosition(index, items.length);
        const isLast = position === 'last' || position === 'only';
        const corners = stackEdgeRadius(knobProps.borderRadius.borderRadius, {
          start: false,
          end: stackEnd && isLast,
        });
        return (
          // oxlint-disable-next-line react-doctor/no-array-index-as-key -- generic rows carry no guaranteed id; the list is rebuilt from the grouped view
          <YStack key={index}>
            {index > 0 ? <View {...hairline.line} /> : null}
            <XStack
              {...corners}
              padding={groupItemPaddingMap.get(knobProps.space) ?? '$2'}
              paddingInlineStart={indent + iconSize}
              overflow="hidden"
              backgroundColor={index % 2 === 0 ? '$background' : '$color2'}
              hoverStyle={{ backgroundColor: HOVER_BACKGROUND, ...corners }}
              data-testid="data-table-group-item"
              data-group-position={position}
              data-stack-end={stackEnd && isLast ? 'true' : 'false'}>
              {columns.length > 0 ? (
                columns.map((column, colIndex) => {
                  const key = column.accessorKey ?? column.id ?? `col-${colIndex}`;
                  const value = readField(item, key);
                  return (
                    <View
                      key={key}
                      flex={1}
                      minWidth={0}>
                      <Text
                        fontSize={metaSize}
                        numberOfLines={1}>
                        {formatCellValue(value)}
                      </Text>
                    </View>
                  );
                })
              ) : (
                <Text fontSize={metaSize}>{JSON.stringify(item, null, 2)}</Text>
              )}
            </XStack>
          </YStack>
        );
      })}
    </YStack>
  );
};

interface GroupHeaderProps<T> {
  group: GroupedData<T>;
  level: number;
  isExpanded: boolean;
  hasChildren: boolean;
  aggregations: AggregationConfig[];
  showAggregations?: boolean;
  onToggleExpansion: () => void;
  renderCustomHeader?: (group: GroupedData<T>, level: number) => React.ReactNode;
  position?: GroupPosition;
  stackStart: boolean;
  stackEnd: boolean;
}

const GroupHeader = <T,>({
  group,
  level,
  isExpanded,
  hasChildren,
  aggregations,
  showAggregations,
  onToggleExpansion,
  renderCustomHeader,
  position = 'only',
  stackStart,
  stackEnd,
}: GroupHeaderProps<T>) => {
  const { knobProps } = useResolvedKnobs();
  const CollapsedCaretIcon = useDirection() === 'rtl' ? CaretLeftIcon : CaretRightIcon;
  const corners = stackEdgeRadius(knobProps.borderRadius.borderRadius, {
    start: stackStart,
    end: stackEnd,
  });
  const iconSize = groupIconSize(knobProps.sizeToken);
  const metaSize = groupMetaSizeMap.get(knobProps.sizeToken) ?? '$3';
  const indent = groupIndent(knobProps.space, level);
  // oxlint-disable-next-line typescript/no-base-to-string -- group values are arbitrary row values shown as their own text
  const label = group.value == null || group.value === '' ? 'No Value' : String(group.value);
  const countLabel = `${formatNumber(group.count, { maximumFractionDigits: 0 })} item${group.count === 1 ? '' : 's'}`;

  if (renderCustomHeader) {
    return <View>{renderCustomHeader(group, level)}</View>;
  }

  return (
    <XStack
      {...corners}
      {...groupStartRail(knobProps.borderRadius.borderWidth || 0)}
      alignItems="center"
      gap="$2"
      minHeight={44}
      padding={groupHeaderPaddingMap.get(knobProps.space) ?? '$3'}
      backgroundColor={knobProps.inputBackground}
      overflow="hidden"
      cursor="pointer"
      hoverStyle={{ backgroundColor: HOVER_BACKGROUND, ...corners }}
      pressStyle={{ backgroundColor: '$backgroundPress', ...corners }}
      onPress={onToggleExpansion}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- the header is a full-width XStack flex row (tamagui), not an HTML element; role + keyboard handler make it a button
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded}
      aria-label={`${label}, ${countLabel}`}
      outlineWidth={0}
      focusStyle={{ outlineWidth: 0 }}
      focusVisibleStyle={ensureFocusVisibleRing({ outlineOffset: -2 })}
      data-testid="data-table-group-header"
      data-group-position={position}
      data-stack-start={stackStart ? 'true' : 'false'}
      data-stack-end={stackEnd ? 'true' : 'false'}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggleExpansion();
        }
      }}>
      <View
        width={indent + iconSize + 4}
        alignItems="center"
        paddingInlineStart={indent}>
        {hasChildren && (isExpanded ? <CaretDownIcon size={iconSize} /> : <CollapsedCaretIcon size={iconSize} />)}
      </View>

      <XStack
        flex={1}
        alignItems="center"
        justifyContent="space-between"
        gap="$3"
        flexWrap="wrap">
        <XStack
          alignItems="center"
          gap="$2"
          flexShrink={1}
          minWidth={0}>
          <Text
            {...knobProps.label}
            fontWeight="400"
            numberOfLines={1}>
            {label}
          </Text>
          <Text
            fontSize={metaSize}
            color="$color11">
            ({countLabel})
          </Text>
        </XStack>

        {showAggregations && aggregations.length > 0 && (
          <XStack
            gap="$3"
            flexWrap="wrap"
            justifyContent="flex-end">
            {aggregations.map((agg, index) => {
              const aggLabel = agg.label ?? `${agg.function}(${agg.column})`;
              return (
                <XStack
                  // oxlint-disable-next-line react-doctor/no-array-index-as-key -- aggregation configs carry no id and the same aggregation may repeat
                  key={index}
                  alignItems="baseline"
                  gap="$1">
                  <Text
                    fontSize={metaSize}
                    color="$color11">
                    {`${aggLabel}:`}
                  </Text>
                  <Text
                    {...knobProps.label}
                    fontWeight="400">
                    {formatAggregateValue(group.aggregations[agg.column]?.[agg.function], agg)}
                  </Text>
                </XStack>
              );
            })}
          </XStack>
        )}
      </XStack>
    </XStack>
  );
};

interface GroupedDataRendererProps<T> {
  groupedData: GroupedData<T>[];
  columns: DataTableGroupingProps<T>['columns'];
  level: number;
  /** This level occupies the root stack's leading edge (LC-72). */
  stackStart: boolean;
  /** This level occupies the root stack's trailing edge (LC-72). */
  stackEnd: boolean;
  aggregations: AggregationConfig[];
  showAggregations?: boolean;
  expandedGroups: Set<string>;
  onToggleExpansion: (groupKey: string) => void;
  renderGroupHeader?: (group: GroupedData<T>, level: number) => React.ReactNode;
  renderGroupFooter?: (group: GroupedData<T>, level: number) => React.ReactNode;
}

const GroupedDataRenderer = <T,>({
  groupedData,
  columns,
  level,
  stackStart,
  stackEnd,
  aggregations,
  showAggregations,
  expandedGroups,
  onToggleExpansion,
  renderGroupHeader,
  renderGroupFooter,
}: GroupedDataRendererProps<T>) => (
  <YStack>
    {groupedData.map((group, groupIndex) => {
      const groupKey = getGroupKey(group);
      const isExpanded = expandedGroups.has(groupKey);
      const isExpandable = (group.children?.length ?? 0) > 0 || group.items.length > 0;
      const position = getGroupPosition(groupIndex, groupedData.length);
      const isFirst = position === 'first' || position === 'only';
      const isLast = position === 'last' || position === 'only';
      // Nested groups sit under a parent header, so they never own the
      // stack's leading corners. An OPEN header abuts its own content, so
      // it drops trailing radius even when it is last (accordion corollary).
      const headerStart = stackStart && isFirst;
      const headerEnd = stackEnd && isLast && !isExpanded;
      const childStackEnd = stackEnd && isLast;

      return (
        <YStack key={groupKey}>
          {groupIndex > 0 ? <View {...hairline.line} /> : null}
          <GroupHeader
            group={group}
            level={level}
            isExpanded={isExpanded}
            hasChildren={isExpandable}
            aggregations={aggregations}
            showAggregations={showAggregations ?? true}
            onToggleExpansion={() => {
              onToggleExpansion(groupKey);
            }}
            renderCustomHeader={renderGroupHeader}
            position={position}
            stackStart={headerStart}
            stackEnd={headerEnd}
          />

          {isExpanded && (
            <>
              <View {...hairline.line} />
              {group.children && group.children.length > 0 ? (
                <GroupedDataRenderer
                  groupedData={group.children}
                  columns={columns}
                  level={level + 1}
                  stackStart={false}
                  stackEnd={childStackEnd}
                  aggregations={aggregations}
                  showAggregations={showAggregations}
                  expandedGroups={expandedGroups}
                  onToggleExpansion={onToggleExpansion}
                  renderGroupHeader={renderGroupHeader}
                  renderGroupFooter={renderGroupFooter}
                />
              ) : (
                <GroupItems
                  items={group.items}
                  columns={columns}
                  level={level + 1}
                  stackEnd={childStackEnd}
                />
              )}
            </>
          )}

          {renderGroupFooter && isExpanded && (
            <GroupFooter
              group={group}
              level={level}
              renderCustomFooter={renderGroupFooter}
            />
          )}
        </YStack>
      );
    })}
  </YStack>
);

export const DataTableGrouping = <T = unknown,>(props: DataTableGroupingProps<T>) => {
  // Try to consume from DataTableStateContext (compound component pattern)
  const ctx = useDataTableState<T>();

  // Resolve values: explicit props override context values.
  // Context data is the CURRENT VIEW (filtered + sorted, same source as
  // DataTableExport) — computed.filteredData is the pre-sort model, which
  // ordered groups and their items by insertion order regardless of the
  // visible sort.
  const data = props.data ?? (ctx ? getViewLeafRows<T>(ctx.table) : []);
  const columns = props.columns ?? (ctx ? columnsFromTable(ctx.table) : []);

  const {
    groupBy = EMPTY_GROUP_BY,
    aggregations = EMPTY_AGGREGATIONS,
    renderGroupHeader,
    renderGroupFooter,
    showAggregations = true,
    expandedGroups: expandedGroupsProp,
    onExpandedGroupsChange,
    maxDepth = 5,
  } = props;

  // Expansion state is controlled when the caller wires
  // `onExpandedGroupsChange`; otherwise fall back to internal state (seeded
  // from any `expandedGroups` prop) so header clicks expand out of the box.
  const isExpansionControlled = onExpandedGroupsChange != null;
  const [internalExpandedGroups, setInternalExpandedGroups] = useState<Set<string>>(() => new Set(expandedGroupsProp));
  const expandedGroups = isExpansionControlled ? (expandedGroupsProp ?? EMPTY_EXPANDED_GROUPS) : internalExpandedGroups;

  // Group the data
  const groupedData = useMemo(() => {
    if (!groupBy.length) {
      return null;
    }
    return groupData(data, groupBy, aggregations, maxDepth);
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- context rows are rebuilt from the live table every render (no stable identity); the memo only saves work when props.data is stable
  }, [data, groupBy, aggregations, maxDepth]);

  // Handle group expansion
  const toggleGroupExpansion = useCallback(
    (groupKey: string) => {
      const newExpanded = new Set(expandedGroups);
      if (newExpanded.has(groupKey)) {
        newExpanded.delete(groupKey);
      } else {
        newExpanded.add(groupKey);
      }
      if (isExpansionControlled) {
        onExpandedGroupsChange?.(newExpanded);
      } else {
        setInternalExpandedGroups(newExpanded);
      }
    },
    [expandedGroups, isExpansionControlled, onExpandedGroupsChange],
  );

  if (!groupedData) {
    return null;
  }

  return (
    <GroupedDataRenderer
      groupedData={groupedData}
      columns={columns}
      level={0}
      stackStart
      stackEnd
      aggregations={aggregations}
      showAggregations={showAggregations}
      expandedGroups={expandedGroups}
      onToggleExpansion={toggleGroupExpansion}
      renderGroupHeader={renderGroupHeader}
      renderGroupFooter={renderGroupFooter}
    />
  );
};

// Aggregation Selector Component

interface AggregationSelectorProps {
  columns: GroupingColumn[];
  onAddAggregation: (aggregation: AggregationConfig) => void;
}

const AggregationSelector = ({ columns, onAddAggregation }: AggregationSelectorProps) => {
  const { knobProps } = useResolvedKnobs();
  const [selectedColumn, setSelectedColumn] = useState<string>('');
  const [selectedFunction, setSelectedFunction] = useState<AggregationFunction>('count');

  // Convert columns to forms Select options
  const columnOptions = useMemo(
    () =>
      columns.map((column) => {
        const key = column.accessorKey ?? column.id ?? '';
        return {
          value: key,
          // oxlint-disable-next-line anti-slop/no-runtime-typeof -- header is a ReactNode; only string headers are usable as option labels
          label: typeof column.header === 'string' ? column.header : key,
        };
      }),
    [columns],
  );

  const handleAdd = () => {
    if (!selectedColumn) {
      return;
    }

    const column = columns.find((col) => (col.accessorKey ?? col.id) === selectedColumn);
    const aggregation: AggregationConfig = {
      column: selectedColumn,
      function: selectedFunction,
      // oxlint-disable-next-line typescript/no-base-to-string -- headers are strings in practice; a ReactNode header keeps its previous stringification
      label: `${selectedFunction} of ${String(column?.header ?? selectedColumn)}`,
    };

    onAddAggregation(aggregation);
    setSelectedColumn('');
    setSelectedFunction('count');
  };

  return (
    <YStack gap="$2">
      <Text
        {...knobProps.label}
        fontWeight="400">
        Add Aggregation
      </Text>

      <XStack
        gap="$2"
        alignItems="flex-end">
        <View flex={1}>
          <Select
            value={selectedColumn}
            onChange={(v) => {
              if (!Array.isArray(v)) {
                setSelectedColumn(v);
              }
            }}
            options={columnOptions}
            placeholder="Select column..."
            aria-label="Aggregation column"
          />
        </View>

        <View width={140}>
          <Select
            value={selectedFunction}
            onChange={(v) => {
              const match = AGGREGATION_FUNCTION_OPTIONS.find((option) => option.value === v);
              if (match) {
                setSelectedFunction(match.value);
              }
            }}
            options={AGGREGATION_FUNCTION_OPTIONS}
            aria-label="Aggregation function"
          />
        </View>

        <Button
          size={knobProps.sizeToken}
          disabled={!selectedColumn}
          onPress={handleAdd}>
          Add
        </Button>
      </XStack>
    </YStack>
  );
};

// Grouping Configuration Component

export interface DataTableGroupingConfigProps<_T = unknown> {
  columns?: GroupingColumn[];
  currentConfig: GroupingConfig;
  onConfigChange: (config: GroupingConfig) => void;
  disabled?: boolean;
}

// oxlint-disable-next-line react-doctor/no-giant-component -- one popover body: group-by list, aggregation list and clear-all share the config handlers
export const DataTableGroupingConfig = <T = unknown,>(props: DataTableGroupingConfigProps<T>) => {
  // Try to consume from DataTableStateContext (compound component pattern)
  const ctx = useDataTableState();

  // Resolve values: explicit props override context values
  const columns = props.columns ?? (ctx ? columnsFromTable(ctx.table) : []);

  const { currentConfig, onConfigChange, disabled = false } = props;

  const { knobProps } = useResolvedKnobs();
  const sz = knobProps.sizeToken;
  const popoverMinWidth = popoverMinWidthMap.get(sz) ?? 400;
  const popoverMaxWidth = popoverMaxWidthMap.get(sz) ?? 500;
  const [isOpen, setIsOpen] = useState(false);

  // Available columns for grouping
  const groupedColumnKeys = new Set(currentConfig.columns);
  const availableColumns = columns.filter((col) => {
    const key = col.accessorKey ?? col.id ?? '';
    return key !== '' && !groupedColumnKeys.has(key);
  });

  // Available columns for aggregation
  const aggregatableColumns = columns.filter((col) => {
    const type = 'type' in col && col.type != null ? col.type : 'string';
    return ['number', 'date'].includes(type);
  });

  const handleAddGroupBy = (columnKey: string) => {
    const newConfig = {
      ...currentConfig,
      columns: [...currentConfig.columns, columnKey],
    };
    onConfigChange(newConfig);
  };

  const handleRemoveGroupBy = (columnKey: string) => {
    const newConfig = {
      ...currentConfig,
      columns: currentConfig.columns.filter((col) => col !== columnKey),
    };
    onConfigChange(newConfig);
  };

  const handleAddAggregation = (aggregation: AggregationConfig) => {
    const newConfig = {
      ...currentConfig,
      aggregations: [...currentConfig.aggregations, aggregation],
    };
    onConfigChange(newConfig);
  };

  const handleRemoveAggregation = (index: number) => {
    const newConfig = {
      ...currentConfig,
      aggregations: currentConfig.aggregations.filter((_, i) => i !== index),
    };
    onConfigChange(newConfig);
  };

  const handleMoveGroupBy = (index: number, direction: -1 | 1) => {
    const next = [...currentConfig.columns];
    const swap = index + direction;
    if (swap < 0 || swap >= next.length) {
      return;
    }
    [next[index], next[swap]] = [next[swap], next[index]];
    onConfigChange({ ...currentConfig, columns: next });
  };

  const iconSize = groupIconSize(sz);
  const radius = knobProps.borderRadius.borderRadius;

  const trigger = (
    <Button
      size={knobProps.sizeToken}
      icon={<GearIcon size={iconSize} />}
      disabled={disabled}
      aria-label="Grouping configuration">
      <XStack
        alignItems="center"
        gap="$2">
        <ChartBarIcon size={iconSize} />
        <Text>Group & Aggregate</Text>
        {(currentConfig.columns.length > 0 || currentConfig.aggregations.length > 0) && (
          <View
            backgroundColor="$color6"
            borderRadius={1000}
            paddingHorizontal="$1"
            paddingVertical={2}
            minWidth={20}
            alignItems="center">
            <Text
              {...knobProps.label}
              fontWeight="400"
              color="$color12">
              {currentConfig.columns.length + currentConfig.aggregations.length}
            </Text>
          </View>
        )}
      </XStack>
    </Button>
  );

  return (
    // LC-06/LC-10: the config list grows with every group-by/aggregation
    // added. FloatingPanel clamps and scrolls it inside the viewport instead
    // of painting rows past the fold.
    <FloatingPanel
      open={isOpen}
      onOpenChange={setIsOpen}
      trigger={trigger}
      triggerSizing="content"
      disabled={disabled}
      scrollable>
      <YStack
        gap="$4"
        minWidth={popoverMinWidth}
        maxWidth={popoverMaxWidth}
        data-dismiss-class="compose">
        <Text
          {...knobProps.label}
          fontWeight="400">
          Grouping & Aggregation
        </Text>

        {/* Group By Section */}
        <YStack gap="$3">
          <XStack
            justifyContent="space-between"
            alignItems="center">
            <Text
              {...knobProps.label}
              fontWeight="400">
              Group By
            </Text>
            <Text
              fontSize="$2"
              color="$color10">
              {currentConfig.columns.length} selected
            </Text>
          </XStack>

          {/* Current Group By Columns */}
          <YStack>
            {currentConfig.columns.map((columnKey, index) => {
              const column = columns.find((col) => (col.accessorKey ?? col.id) === columnKey);
              const position = getGroupPosition(index, currentConfig.columns.length);
              const corners = stackRadiusProps(position, radius);
              // oxlint-disable-next-line typescript/no-base-to-string -- headers are strings in practice; a ReactNode header keeps its previous stringification
              const label = String(column?.header ?? columnKey);
              return (
                <YStack key={columnKey}>
                  {index > 0 ? <View {...hairline.line} /> : null}
                  <XStack
                    alignItems="center"
                    gap="$2"
                    padding="$2"
                    overflow="hidden"
                    backgroundColor="$color2"
                    {...corners}
                    hoverStyle={{ backgroundColor: HOVER_BACKGROUND, ...corners }}
                    data-group-position={position}>
                    <Text
                      fontSize="$3"
                      flex={1}
                      numberOfLines={1}>
                      {`${label} · ${index + 1}`}
                    </Text>
                    <Button
                      size={knobProps.sizeToken}
                      icon={<ArrowUpIcon size={iconSize} />}
                      disabled={disabled || index === 0}
                      onPress={() => {
                        handleMoveGroupBy(index, -1);
                      }}
                      aria-label={`Move ${label} up`}
                    />
                    <Button
                      size={knobProps.sizeToken}
                      icon={<ArrowDownIcon size={iconSize} />}
                      disabled={disabled || index === currentConfig.columns.length - 1}
                      onPress={() => {
                        handleMoveGroupBy(index, 1);
                      }}
                      aria-label={`Move ${label} down`}
                    />
                    <Button
                      size={knobProps.sizeToken}
                      icon={<MinusIcon size={iconSize} />}
                      disabled={disabled}
                      onPress={() => {
                        handleRemoveGroupBy(columnKey);
                      }}
                      aria-label={`Remove grouping by ${label}`}
                    />
                  </XStack>
                </YStack>
              );
            })}
          </YStack>

          {/* Add Group By Column */}
          {availableColumns.length > 0 && (
            <XStack gap="$2">
              <Text
                fontSize="$3"
                color="$color10">
                Add:
              </Text>
              {availableColumns.slice(0, 3).map((column) => {
                const key = column.accessorKey ?? column.id ?? '';
                return (
                  <Button
                    key={key}
                    size={knobProps.sizeToken}
                    onPress={() => {
                      handleAddGroupBy(key);
                    }}>
                    {column.header ?? key}
                  </Button>
                );
              })}
            </XStack>
          )}
        </YStack>

        <Separator />

        {/* Aggregation Section */}
        <YStack gap="$3">
          <XStack
            justifyContent="space-between"
            alignItems="center">
            <Text
              {...knobProps.label}
              fontWeight="400">
              Aggregations
            </Text>
            <Text
              fontSize="$2"
              color="$color10">
              {currentConfig.aggregations.length} configured
            </Text>
          </XStack>

          {/* Current Aggregations */}
          <YStack>
            {currentConfig.aggregations.map((agg, index) => {
              const position = getGroupPosition(index, currentConfig.aggregations.length);
              const corners = stackRadiusProps(position, radius);
              return (
                // oxlint-disable-next-line react-doctor/no-array-index-as-key -- aggregation configs carry no id and the same aggregation may repeat; removal is by index
                <YStack key={`${agg.function}-${agg.column}-${index}`}>
                  {index > 0 ? <View {...hairline.line} /> : null}
                  <XStack
                    alignItems="center"
                    gap="$2"
                    padding="$2"
                    overflow="hidden"
                    backgroundColor="$color2"
                    {...corners}
                    hoverStyle={{ backgroundColor: HOVER_BACKGROUND, ...corners }}
                    data-group-position={position}>
                    <Text
                      fontSize="$3"
                      flex={1}
                      numberOfLines={1}>
                      {agg.function}({agg.column}){agg.label !== undefined && agg.label !== '' && ` as "${agg.label}"`}
                    </Text>
                    <Button
                      size={knobProps.sizeToken}
                      icon={<MinusIcon size={iconSize} />}
                      disabled={disabled}
                      onPress={() => {
                        handleRemoveAggregation(index);
                      }}
                      aria-label={`Remove ${agg.function} aggregation on ${agg.column}`}
                    />
                  </XStack>
                </YStack>
              );
            })}
          </YStack>

          {/* Add Aggregation */}
          <AggregationSelector
            columns={aggregatableColumns}
            onAddAggregation={handleAddAggregation}
          />
        </YStack>

        {/* Clear All */}
        {(currentConfig.columns.length > 0 || currentConfig.aggregations.length > 0) && (
          <>
            <Separator />
            <Button
              size={knobProps.sizeToken}
              error
              onPress={() => {
                onConfigChange({ columns: [], aggregations: [] });
              }}
              aria-label="Clear all grouping and aggregation">
              Clear All Grouping
            </Button>
          </>
        )}
      </YStack>
    </FloatingPanel>
  );
};

// Hook for Grouping

export interface UseGroupingOptions<T = unknown> {
  data: T[];
  columns: GroupingColumn[];
  initialConfig?: Partial<GroupingConfig>;
}

export interface UseGroupingReturn<T = unknown> {
  groupedData: GroupedData<T>[] | null;
  config: GroupingConfig;
  setConfig: (config: GroupingConfig) => void;
  expandedGroups: Set<string>;
  setExpandedGroups: (groups: Set<string>) => void;
  toggleGroupExpansion: (groupKey: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
  isGrouped: boolean;
}

export const useGrouping = <T = unknown,>({
  data,
  initialConfig = {},
}: UseGroupingOptions<T>): UseGroupingReturn<T> => {
  const [config, setConfig] = useState<GroupingConfig>({
    columns: [],
    aggregations: [],
    showEmptyGroups: false,
    expandedByDefault: false,
    maxDepth: 5,
    ...initialConfig,
  });

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const groupedData = useMemo(() => {
    if (!config.columns.length) {
      return null;
    }
    return groupData(data, config.columns, config.aggregations, config.maxDepth);
  }, [data, config]);

  const toggleGroupExpansion = useCallback((groupKey: string) => {
    setExpandedGroups((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(groupKey)) {
        newSet.delete(groupKey);
      } else {
        newSet.add(groupKey);
      }
      return newSet;
    });
  }, []);

  const expandAll = useCallback(() => {
    if (!groupedData) {
      return;
    }

    const allKeys = new Set<string>();
    const collectKeys = (groups: GroupedData<T>[]) => {
      for (const group of groups) {
        allKeys.add(getGroupKey(group));
        if (group.children) {
          collectKeys(group.children);
        }
      }
    };

    collectKeys(groupedData);
    setExpandedGroups(allKeys);
  }, [groupedData]);

  const collapseAll = useCallback(() => {
    setExpandedGroups(new Set());
  }, []);

  return {
    groupedData,
    config,
    setConfig,
    expandedGroups,
    setExpandedGroups,
    toggleGroupExpansion,
    expandAll,
    collapseAll,
    isGrouped: config.columns.length > 0,
  };
};
