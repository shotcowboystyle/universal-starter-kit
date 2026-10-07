import { useDirection } from '@repo/ui';
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
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChartBarIcon,
  CalculatorIcon,
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CaretUpIcon,
  HashIcon,
  MinusIcon,
  PlusIcon,
  GearIcon,
} from '@phosphor-icons/react';
import { useCallback, useMemo, useState } from 'react';
import { Separator, Text, View, XStack, YStack, isWeb } from 'tamagui';

import { iconSizeForToken } from '../../utils/chromeIcons';
import { getViewLeafRows } from '../../utils/viewData';
import { useDataTableState } from '../DataTable/DataTableStateContext';

export type AggregationFunction = 'count' | 'sum' | 'avg' | 'min' | 'max' | 'custom';

export interface AggregationConfig {
  column: string;
  function: AggregationFunction;
  label?: string;
  customFunction?: (values: any[]) => any;
}

export interface GroupingConfig {
  columns: string[];
  aggregations: AggregationConfig[];
  showEmptyGroups?: boolean;
  expandedByDefault?: boolean;
  maxDepth?: number;
}

export interface GroupedData<T = any> {
  key: string;
  value: any;
  count: number;
  aggregations: Record<string, any>;
  items: T[];
  children?: GroupedData<T>[];
  level: number;
  path: any[];
}

export interface DataTableGroupingProps<T = any> {
  data?: T[];
  columns?: {
    accessorKey?: string;
    header?: string | React.ReactNode;
    id?: string;
    type?: 'string' | 'number' | 'date' | 'boolean';
  }[];
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

// SP-EDGE row density (getTableCellPadding precedent): the space knob moves
// row padding; medium keeps the previous hardcoded $3/$2 defaults.
const groupHeaderPaddingMap: Record<string, string> = {
  small: '$2',
  medium: '$3',
  large: '$4',
};
const groupItemPaddingMap: Record<string, string> = {
  small: '$1',
  medium: '$2',
  large: '$3',
};

// Tree indent rides the space knob so nested groups stay flush full-bleed
// rows (padding, never margin) — AG Grid / Excel / Airtable grouping: the
// chevron and label step in, the painted row still spans the stack.
const groupIndentStepMap: Record<string, number> = {
  small: 12,
  medium: 16,
  large: 24,
};

// T-VALUE meta text rides one step below the size-knob body scale (LC-18);
// medium keeps the previous $3.
const groupMetaSizeMap: Record<string, string> = {
  $3: '$2',
  $4: '$3',
  $5: '$4',
};

// Chevron/tree glyphs are control-internal icons (LC-75/LC-79): the
// generated recipe's icon channel (lossless vs the old $3/$4/$5 map).
const groupIconSize = (token: string): number => iconSizeForToken(token);

function groupStartRail(borderWidth: number) {
  const width = borderWidth === 0 ? 0 : borderWidth * 4;
  return isWeb
    ? {
        borderInlineStartWidth: width,
        borderInlineStartStyle: 'solid' as const,
        borderInlineStartColor: '$color6',
      }
    : { borderStartWidth: width, borderStartColor: '$color6' };
}

function groupIndent(space: string | undefined, level: number): number {
  return (groupIndentStepMap[space ?? 'medium'] ?? 16) * Math.max(0, level);
}

function formatCellValue(value: unknown): string {
  if (value == null) {
    return '';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? formatNumber(value) : '';
  }
  return String(value);
}

/**
 * Group aggregates are the same number class as the cells they summarise, so
 * they render through the house number register (LC-12 render channel) —
 * "15,400", never the raw `15400` beside a localized cell. Counts are whole
 * by construction; a custom aggregation may return anything, and a
 * non-numeric result passes through as its own text.
 */
export function formatAggregateValue(value: unknown, agg: AggregationConfig): string {
  if (value == null) {
    return formatNumber(0);
  }
  if (typeof value === 'number') {
    // The aggregation math is NaN-guarded upstream; keep the zero floor so a
    // guard slipping through still reads as a number, not a hole.
    if (!Number.isFinite(value)) {
      return formatNumber(0);
    }
    return agg.function === 'count' ? formatNumber(value, { maximumFractionDigits: 0 }) : formatNumber(value);
  }
  if (typeof value === 'string') {
    const asNumber = Number(value);
    return value.trim() !== '' && Number.isFinite(asNumber) ? formatNumber(asNumber) : value;
  }
  return String(value);
}

export function DataTableGrouping<T = any>(props: DataTableGroupingProps<T>) {
  // Try to consume from DataTableStateContext (compound component pattern)
  const ctx = useDataTableState();

  // Resolve values: explicit props override context values.
  // Context data is the CURRENT VIEW (filtered + sorted, same source as
  // DataTableExport) — computed.filteredData is the pre-sort model, which
  // ordered groups and their items by insertion order regardless of the
  // visible sort.
  const data = props.data ?? (ctx ? getViewLeafRows<T>(ctx.table) : []);
  const columns =
    props.columns ??
    (ctx
      ? ctx.table.getAllColumns().map((col) => ({
          id: col.id,
          accessorKey: col.id,
          header: typeof col.columnDef.header === 'string' ? col.columnDef.header : col.id,
        }))
      : []);

  const {
    groupBy = [],
    aggregations = [],
    renderGroupHeader,
    renderGroupFooter,
    showAggregations = true as boolean,
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
}

interface GroupedDataRendererProps<T = any> {
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

function GroupedDataRenderer<T = any>({
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
}: GroupedDataRendererProps<T>) {
  return (
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
}

interface GroupHeaderProps<T = any> {
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

function GroupHeader<T = any>({
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
}: GroupHeaderProps<T>) {
  const { knobProps } = useResolvedKnobs();
  const CollapsedCaretIcon = useDirection() === 'rtl' ? CaretLeftIcon : CaretRightIcon;
  const corners = stackEdgeRadius(knobProps.borderRadius.borderRadius, {
    start: stackStart,
    end: stackEnd,
  });
  const iconSize = groupIconSize(String(knobProps.sizeToken));
  const metaSize = groupMetaSizeMap[knobProps.sizeToken] ?? '$3';
  const indent = groupIndent(knobProps.space, level);
  const label = group.value == null || group.value === '' ? 'No Value' : String(group.value);
  const countLabel = `${formatNumber(group.count, { maximumFractionDigits: 0 })} item${group.count === 1 ? '' : 's'}`;

  if (renderCustomHeader) {
    return <View>{renderCustomHeader(group, level)}</View>;
  }

  return (
    <XStack
      {...corners}
      {...groupStartRail(Number(knobProps.borderRadius.borderWidth) || 0)}
      alignItems="center"
      gap="$2"
      minHeight={44}
      padding={groupHeaderPaddingMap[knobProps.space] ?? '$3'}
      backgroundColor={knobProps.inputBackground}
      overflow="hidden"
      cursor="pointer"
      hoverStyle={{ backgroundColor: '$backgroundHover', ...corners }}
      pressStyle={{ backgroundColor: '$backgroundPress', ...corners }}
      onPress={onToggleExpansion}
      role="button"
      tabIndex={0}
      aria-expanded={isExpanded}
      aria-label={`${label}, ${countLabel}`}
      outlineWidth={0}
      focusStyle={{ outlineWidth: 0 }}
      focusVisibleStyle={ensureFocusVisibleRing({ outlineOffset: -2 })}
      {...({
        'data-testid': 'data-table-group-header',
        'data-group-position': position,
        'data-stack-start': stackStart ? 'true' : 'false',
        'data-stack-end': stackEnd ? 'true' : 'false',
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggleExpansion();
          }
        },
      } as any)}>
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
            {aggregations.map((agg, index) => (
              <XStack
                key={index}
                alignItems="baseline"
                gap="$1">
                <Text
                  fontSize={metaSize}
                  color="$color11">
                  {`${agg.label ?? `${agg.function}(${agg.column})`}:`}
                </Text>
                <Text
                  {...knobProps.label}
                  fontWeight="400">
                  {formatAggregateValue(group.aggregations[agg.column]?.[agg.function], agg)}
                </Text>
              </XStack>
            ))}
          </XStack>
        )}
      </XStack>
    </XStack>
  );
}

interface GroupItemsProps<T = any> {
  items: T[];
  columns?: {
    accessorKey?: string;
    header?: string | React.ReactNode;
    id?: string;
  }[];
  level: number;
  stackEnd: boolean;
}

function GroupItems<T = any>({ items, columns = [], level, stackEnd }: GroupItemsProps<T>) {
  const { knobProps } = useResolvedKnobs();
  const metaSize = groupMetaSizeMap[knobProps.sizeToken] ?? '$3';
  const indent = groupIndent(knobProps.space, level);
  const iconSize = groupIconSize(String(knobProps.sizeToken));
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
          <YStack key={index}>
            {index > 0 ? <View {...hairline.line} /> : null}
            <XStack
              {...corners}
              padding={groupItemPaddingMap[knobProps.space] ?? '$2'}
              paddingInlineStart={indent + iconSize}
              overflow="hidden"
              backgroundColor={index % 2 === 0 ? '$background' : '$color2'}
              hoverStyle={{ backgroundColor: '$backgroundHover', ...corners }}
              {...({
                'data-testid': 'data-table-group-item',
                'data-group-position': position,
                'data-stack-end': stackEnd && isLast ? 'true' : 'false',
              } as any)}>
              {columns.length > 0 ? (
                columns.map((column, colIndex) => {
                  const key = column.accessorKey ?? column.id ?? `col-${colIndex}`;
                  const value = (item as any)[key];
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
}

interface GroupFooterProps<T = any> {
  group: GroupedData<T>;
  level: number;
  renderCustomFooter: (group: GroupedData<T>, level: number) => React.ReactNode;
}

function GroupFooter<T = any>({ group, level, renderCustomFooter }: GroupFooterProps<T>) {
  const { knobProps } = useResolvedKnobs();
  return <View paddingInlineStart={groupIndent(knobProps.space, level)}>{renderCustomFooter(group, level)}</View>;
}

// Grouping Configuration Component

export interface DataTableGroupingConfigProps<_T = any> {
  columns?: {
    accessorKey?: string;
    header?: string | React.ReactNode;
    id?: string;
    type?: 'string' | 'number' | 'date' | 'boolean';
  }[];
  currentConfig: GroupingConfig;
  onConfigChange: (config: GroupingConfig) => void;
  disabled?: boolean;
}

export function DataTableGroupingConfig<T = any>(props: DataTableGroupingConfigProps<T>) {
  // Try to consume from DataTableStateContext (compound component pattern)
  const ctx = useDataTableState();

  // Resolve values: explicit props override context values
  const columns =
    props.columns ??
    (ctx
      ? ctx.table.getAllColumns().map((col) => ({
          id: col.id,
          accessorKey: col.id,
          header: typeof col.columnDef.header === 'string' ? col.columnDef.header : col.id,
        }))
      : []);

  const { currentConfig, onConfigChange, disabled = false } = props;

  const { knobProps } = useResolvedKnobs();
  const sz = knobProps.sizeToken;
  const popoverMinWidth = sz === '$3' ? 320 : sz === '$5' ? 480 : 400;
  const popoverMaxWidth = sz === '$3' ? 400 : sz === '$5' ? 560 : 500;
  const [isOpen, setIsOpen] = useState(false);

  // Available columns for grouping
  const availableColumns = columns.filter((col) => {
    const key = col.accessorKey ?? col.id ?? '';
    return key && !currentConfig.columns.includes(key);
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

  const iconSize = groupIconSize(String(sz));
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
                    hoverStyle={{ backgroundColor: '$backgroundHover', ...corners }}
                    {...({ 'data-group-position': position } as any)}>
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
                <YStack key={`${agg.function}-${agg.column}-${index}`}>
                  {index > 0 ? <View {...hairline.line} /> : null}
                  <XStack
                    alignItems="center"
                    gap="$2"
                    padding="$2"
                    overflow="hidden"
                    backgroundColor="$color2"
                    {...corners}
                    hoverStyle={{ backgroundColor: '$backgroundHover', ...corners }}
                    {...({ 'data-group-position': position } as any)}>
                    <Text
                      fontSize="$3"
                      flex={1}
                      numberOfLines={1}>
                      {agg.function}({agg.column}){agg.label && ` as "${agg.label}"`}
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
}

// Aggregation Selector Component

interface AggregationSelectorProps<_T = any> {
  columns: {
    accessorKey?: string;
    header?: string | React.ReactNode;
    id?: string;
    type?: 'string' | 'number' | 'date' | 'boolean';
  }[];
  onAddAggregation: (aggregation: AggregationConfig) => void;
}

function AggregationSelector<T = any>({ columns, onAddAggregation }: AggregationSelectorProps<T>) {
  const { knobProps } = useResolvedKnobs();
  const iconPx = groupIconSize(String(knobProps.sizeToken));
  const [selectedColumn, setSelectedColumn] = useState<string>('');
  const [selectedFunction, setSelectedFunction] = useState<AggregationFunction>('count');

  const aggregationFunctions: {
    value: AggregationFunction;
    label: string;
    icon: React.ReactNode;
  }[] = [
    { value: 'count', label: 'Count', icon: <HashIcon size={iconPx} /> },
    { value: 'sum', label: 'Sum', icon: <PlusIcon size={iconPx} /> },
    { value: 'avg', label: 'Average', icon: <CalculatorIcon size={iconPx} /> },
    { value: 'min', label: 'Minimum', icon: <MinusIcon size={iconPx} /> },
    { value: 'max', label: 'Maximum', icon: <CaretUpIcon size={iconPx} /> },
  ];

  // Convert columns to forms Select options
  const columnOptions = useMemo(
    () =>
      columns.map((column) => {
        const key = column.accessorKey ?? column.id ?? '';
        return {
          value: key,
          label: typeof column.header === 'string' ? column.header : key,
        };
      }),
    [columns],
  );

  // Convert aggregation functions to forms Select options
  const functionOptions = useMemo(
    () =>
      aggregationFunctions.map((func) => ({
        value: func.value,
        label: func.label,
      })),
    [],
  );

  const handleAdd = () => {
    if (!selectedColumn) {
      return;
    }

    const column = columns.find((col) => (col.accessorKey ?? col.id) === selectedColumn);
    const aggregation: AggregationConfig = {
      column: selectedColumn,
      function: selectedFunction,
      label: `${selectedFunction} of ${column?.header ?? selectedColumn}`,
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
            onValueChange={(v) => {
              if (typeof v === 'string') {
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
            onValueChange={(v) => {
              if (typeof v === 'string') {
                setSelectedFunction(v as AggregationFunction);
              }
            }}
            options={functionOptions}
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
}

// Data Grouping Utilities

export function groupData<T>(data: T[], groupByColumns: string[], aggregations: AggregationConfig[], maxDepth = 5) {
  if (!groupByColumns.length) {
    return null;
  }

  const grouped = new Map<string, { items: T[]; key: any; path: any[] }>();

  // Group data by the first column. Nullish coalescing (not ||) so falsy
  // values like 0, false, and "" form their own groups instead of all
  // collapsing into a shared "null" bucket.
  data.forEach((item) => {
    const firstGroupValue = (item as any)[groupByColumns[0]];
    const key = String(firstGroupValue ?? 'null');

    if (!grouped.has(key)) {
      grouped.set(key, {
        items: [],
        key: firstGroupValue,
        path: [firstGroupValue],
      });
    }

    const groupData = grouped.get(key);
    if (groupData) {
      groupData.items.push(item);
    }
  });

  // Convert to GroupedData format
  const result = [...grouped.entries()].map(([key, group]) => {
    const aggregationsResult: Record<string, any> = {};

    // Calculate aggregations
    aggregations.forEach((agg) => {
      aggregationsResult[agg.column] ??= {};

      const values = group.items.map((item) => (item as any)[agg.column]).filter((val) => val != null);

      switch (agg.function) {
        case 'count': {
          aggregationsResult[agg.column].count = group.items.length;
          break;
        }
        case 'sum': {
          aggregationsResult[agg.column].sum = values.reduce((sum, val) => sum + (Number(val) || 0), 0);
          break;
        }
        case 'avg': {
          const sum = values.reduce((sum, val) => sum + (Number(val) || 0), 0);
          aggregationsResult[agg.column].avg = values.length > 0 ? Math.round((sum / values.length) * 100) / 100 : 0;
          break;
        }
        case 'min': {
          // Skip non-numeric values (e.g. date strings) — one bad value must
          // not poison the whole aggregate with NaN.
          const nums = values.map(Number).filter(Number.isFinite);
          aggregationsResult[agg.column].min = nums.length > 0 ? Math.min(...nums) : 0;
          break;
        }
        case 'max': {
          const nums = values.map(Number).filter(Number.isFinite);
          aggregationsResult[agg.column].max = nums.length > 0 ? Math.max(...nums) : 0;
          break;
        }
        case 'custom': {
          aggregationsResult[agg.column].custom = agg.customFunction ? agg.customFunction(values) : null;
          break;
        }
      }
    });

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
}

function getGroupKey(group: GroupedData): string {
  return group.path.join(' → ');
}

// Hook for Grouping

export interface UseGroupingOptions<T = any> {
  data: T[];
  columns: {
    accessorKey?: string;
    header?: string | React.ReactNode;
    id?: string;
    type?: 'string' | 'number' | 'date' | 'boolean';
  }[];
  initialConfig?: Partial<GroupingConfig>;
}

export interface UseGroupingReturn<T = any> {
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

export function useGrouping<T = any>({ data, initialConfig = {} }: UseGroupingOptions<T>): UseGroupingReturn<T> {
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
      groups.forEach((group) => {
        allKeys.add(getGroupKey(group));
        if (group.children) {
          collectKeys(group.children);
        }
      });
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
}
