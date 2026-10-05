import { formatCurrency, formatNumber, formatPercent, useResolvedKnobs } from '@repo/theme';
import React, { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Text, XStack, YStack, isWeb, type YStackProps, H2, H3, H4, H5, H6 } from 'tamagui';

import { BarChart } from '../charts/BarChart';
import { ChartDataView } from '../charts/ChartDataView';
import { LineChart } from '../charts/LineChart';
import { PieChart } from '../charts/PieChart';
import { Sparkline } from '../charts/Sparkline';
import { componentColors, sectionHeading } from '../componentColors';
import { AsyncBoundary } from '../layouts/AsyncBoundary';
import { Meter } from '../Meter';
import { ScrollView } from '../ScrollView';
import { useTranslation } from '../shared/i18n';
import { Card } from '../surfaces';

/**
 * Card sub-titles read at the ONE
 * shared 20px section scale and step through sequential heading levels. A
 * chart/KPI card is a section under the page H1, so it defaults to level 2.
 */
const SECTION_HEADING_TAGS = { 2: H2, 3: H3, 4: H4, 5: H5, 6: H6 } as const;
export type CardHeadingLevel = 2 | 3 | 4 | 5 | 6;

function splitNestedControl(nested: {
  px: number;
  hitSlop: { top: number; bottom: number; left: number; right: number };
  width: number;
  height: number;
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
}) {
  const { px, hitSlop, ...box } = nested;
  return { px, hitSlop, box };
}

function trendFill(color: string): string {
  if (color === componentColors.semantic.success) {
    return '$green4';
  }
  if (color === componentColors.semantic.error) {
    return '$red4';
  }
  return '$color4';
}

function trendInk(color: string): string {
  // Step 11 clears the page, but falls below AA on the status pill's step 4 wash.
  if (color === componentColors.semantic.success) {
    return '$green12';
  }
  if (color === componentColors.semantic.error) {
    return '$red12';
  }
  return color;
}

// ============================================================================
// Types
// ============================================================================

/**
 * Trend direction for KPI cards.
 */
export type TrendDirection = 'up' | 'down' | 'neutral';

/**
 * Chart types supported by the dashboard.
 */
export type ChartType = 'bar' | 'line' | 'pie';

/**
 * Data point for charts.
 */
export interface ChartDataPoint {
  label: string;
  value: number;
  color?: string;
}

/**
 * Configuration for a KPI card.
 */
export interface KPICardConfig {
  id: string;
  title: string;
  value: number | string;
  previousValue?: number;
  trend?: TrendDirection;
  trendValue?: string | number;
  /**
   * Which trend direction is *good* (Axiom 9 — the
   * schema chooses the register). Trend COLOR is derived from `trend ×
   * goodDirection`: an improving metric is `success`, a worsening one is
   * `error`. `"none"` — and *omitted* — paint the trend neutral (direction
   * without sentiment): a metric whose polarity the system doesn't know
   * must not wear a verdict color, so a falling "Overdue Balance" is only
   * painted red when the screen explicitly declares `goodDirection: "up"`,
   * never by guess.
   */
  goodDirection?: 'up' | 'down' | 'none';
  format?: 'number' | 'currency' | 'percent';
  currencySymbol?: string;
  icon?: React.ReactNode;
  color?: string;
  onClick?: () => void;
  /**
   * Grafana Stat / Polaris metric sparkline. Nested-scale height;
   * series color stays on the chart identity palette.
   */
  sparkline?: number[];
}

/**
 * Configuration for a chart.
 */
export interface ChartConfig {
  id: string;
  title: string;
  type: ChartType;
  data: ChartDataPoint[];
  height?: number;
  showLegend?: boolean;
  showLabels?: boolean;
  colors?: string[];
}

/**
 * Dashboard bar-gauge card. The rail is Meter — position within bounds,
 * not Progress (activity toward completion). See `Meter`.
 */
export interface ProgressConfig {
  id: string;
  title: string;
  value: number;
  max?: number;
  format?: 'number' | 'percent';
  color?: string;
}

/**
 * Frappe workspace shortcut: label + nested count pill.
 */
export interface ShortcutConfig {
  id: string;
  title: string;
  count?: number | string;
  icon?: React.ReactNode;
  color?: string;
  onClick?: () => void;
}

/**
 * Frappe link card / Polaris resource list / Grafana table-lite.
 */
export interface DashboardListItem {
  id: string;
  label: string;
  meta?: string;
  onClick?: () => void;
}

export interface ListConfig {
  id: string;
  title: string;
  items: DashboardListItem[];
}

/**
 * Dashboard widget configuration.
 *
 * Catalog (Frappe workspace + Grafana-lite + Polaris metrics):
 * number card (`kpi`), plot (`chart`), bar gauge (`progress`), shortcut,
 * link list, and an escape hatch (`custom`).
 */
export interface DashboardWidget {
  id: string;
  type: 'kpi' | 'chart' | 'custom' | 'progress' | 'shortcut' | 'list';
  colSpan?: number;
  rowSpan?: number;
  kpiConfig?: KPICardConfig;
  chartConfig?: ChartConfig;
  progressConfig?: ProgressConfig;
  shortcutConfig?: ShortcutConfig;
  listConfig?: ListConfig;
  content?: ReactNode;
}

/**
 * Props for the generic Dashboard component.
 */
export interface DashboardProps extends Omit<YStackProps, 'children'> {
  /** Widget configurations */
  widgets: DashboardWidget[];
  /** Custom render function for widgets */
  renderWidget?: (widget: DashboardWidget) => React.ReactNode;
  /** Dashboard title */
  title?: string;
  /** Dashboard description */
  description?: string;
  /** Number of columns in the grid (default: 4) */
  columns?: number;
  /** Gap between widgets in pixels (default: 16) */
  gap?: number;
  /** Padding around the dashboard in pixels (default: 16) */
  padding?: number;
  /** Whether dashboard data is loading. */
  isLoading?: boolean;
  /**
   * Failed load. Wins over empty widgets; KPI/count chrome
   * in `chrome` is suppressed on failure.
   */
  error?: boolean | string | Error | ReactNode | null;
  /** Retry handler for the default error UI. */
  onRetry?: () => void;
  /** Message when widgets array is empty. */
  emptyMessage?: string;
}

// ============================================================================
// Shared card chrome
// ============================================================================

function useWidgetChrome(onPress?: YStackProps['onPress']) {
  const resolved = useResolvedKnobs();
  const { knobProps, control } = resolved;
  const nested = splitNestedControl(knobProps.nestedControl);
  const interactive = onPress
    ? {
        cursor: 'pointer' as const,
        hoverStyle: control.hoverKnobProps,
        pressStyle: control.pressKnobProps,
        focusVisibleStyle: control.focusVisibleKnobProps,
        onPress,
        role: 'button' as const,
      }
    : undefined;
  return { knobProps, control, nested, interactive };
}

function NestedIconWell({
  color,
  box,
  px,
  radius,
  children,
}: {
  color?: string;
  box: ReturnType<typeof splitNestedControl>['box'];
  px: number;
  radius: object;
  children: ReactNode;
}) {
  return (
    <YStack
      {...box}
      {...radius}
      alignItems="center"
      justifyContent="center"
      backgroundColor={(color || '$accentBackground') as any}
      overflow="hidden"
      data-nested-px={px}>
      {children}
    </YStack>
  );
}

function TrendPill({
  symbol,
  value,
  color,
  px,
  radius,
  label,
}: {
  symbol: string;
  value?: string | number;
  color: string;
  px: number;
  radius: object;
  label: object;
}) {
  return (
    <XStack
      height={px}
      minHeight={px}
      maxHeight={px}
      paddingHorizontal="$2"
      alignItems="center"
      gap="$1"
      backgroundColor={trendFill(color)}
      {...radius}
      data-nested-px={px}>
      <Text {...label} color={trendInk(color)}>
        {symbol}
      </Text>
      {value != null && value !== '' && (
        <Text {...label} color={trendInk(color)}>
          {value}
        </Text>
      )}
    </XStack>
  );
}

// ============================================================================
// KPI Card Component
// ============================================================================

export interface KPICardProps extends Omit<YStackProps, 'children'> {
  config: KPICardConfig;
}

/**
 * The one sentinel resolver for trend sentiment color:
 * color encodes sentiment — `trend × goodDirection` —
 * never direction alone. Undeclared or `"none"` sentiment renders the
 * neutral tier; a metric whose polarity the system doesn't know must not
 * wear a verdict color.
 *
 * The neutral ink is passed in, not looked up. It is ordinary
 * secondary text, so the caller hands over `knobProps.textAccentColor` —
 * a static tier here could not see the `textAccent` knob.
 */
export function resolveTrendColor(
  trend: TrendDirection | undefined,
  goodDirection: KPICardConfig['goodDirection'],
  neutral: string,
): string {
  if (!trend || trend === 'neutral') {
    return neutral;
  }
  if (!goodDirection || goodDirection === 'none') {
    return neutral;
  }
  return trend === goodDirection ? componentColors.semantic.success : componentColors.semantic.error;
}

/**
 * KPI card — Frappe number card + Grafana Stat + Polaris metric.
 * Nested icon well and trend pill use `nestedControl`; the value
 * never takes `sizeToken` as fontSize (that token is a control height).
 */
export function KPICard({ config, ...stackProps }: KPICardProps) {
  const { t } = useTranslation();
  const { onPress: consumerOnPress, ...cardProps } = stackProps;
  const onPress = Object.hasOwn(stackProps, 'onPress') ? consumerOnPress : config.onClick;
  const { knobProps, nested, interactive } = useWidgetChrome(onPress);
  const { px, box } = nested;
  const [dataActionSize, setDataActionSize] = useState({ width: 0, height: 44 });
  const [dataHeaderHeight, setDataHeaderHeight] = useState(44);
  const hasDataView = Boolean(config.sparkline?.length);
  const formatMetric = useCallback(
    (num: number) => {
      if (config.format === 'currency') {
        return formatCurrency(num, {
          symbol: config.currencySymbol || '$',
          fractionDigits: 'auto',
        });
      }
      if (config.format === 'percent') {
        return formatPercent(num);
      }
      return formatNumber(num);
    },
    [config.format, config.currencySymbol],
  );
  const formattedValue = useMemo(
    () => (typeof config.value === 'string' ? config.value : formatMetric(config.value)),
    [config.value, formatMetric],
  );

  const trendColor = useMemo(
    () => resolveTrendColor(config.trend, config.goodDirection, knobProps.textAccentColor),
    [config.trend, config.goodDirection, knobProps.textAccentColor],
  );

  const trendSymbol = useMemo(() => {
    if (config.trend === 'up') {
      return '↑';
    }
    if (config.trend === 'down') {
      return '↓';
    }
    return '—';
  }, [config.trend]);

  const content = (
    <>
      <XStack
        justifyContent="space-between"
        alignItems="center"
        {...knobProps.gap}
        onLayout={
          hasDataView
            ? (event) => {
                setDataHeaderHeight(event.nativeEvent.layout.height);
              }
            : undefined
        }>
        <Text {...knobProps.label} color={knobProps.textAccentColor} flex={1}>
          {config.title}
        </Text>
        {config.icon ? (
          <NestedIconWell color={config.color} box={box} px={px} radius={knobProps.borderRadius}>
            {config.icon}
          </NestedIconWell>
        ) : null}
        {hasDataView ? (
          <YStack width={dataActionSize.width} height={dataActionSize.height} pointerEvents="none" />
        ) : null}
      </XStack>

      <Text fontSize="$8" color="$color" {...knobProps.heading}>
        {formattedValue}
      </Text>

      {config.sparkline && config.sparkline.length > 0 ? (
        <Sparkline data={config.sparkline} height={px} title={config.title} valueFormatter={formatMetric} />
      ) : null}

      {(config.trend || config.trendValue) && (
        <XStack gap="$2" alignItems="center" flexWrap="wrap">
          <TrendPill
            symbol={trendSymbol}
            value={config.trendValue}
            color={trendColor}
            px={px}
            radius={knobProps.borderRadius}
            label={knobProps.label}
          />
          {config.previousValue !== undefined && (
            <Text {...knobProps.label} color={knobProps.textAccentColor}>
              {t('vs {{previousValue}}', { previousValue: formatMetric(config.previousValue) })}
            </Text>
          )}
        </XStack>
      )}
    </>
  );
  if (!hasDataView) {
    return (
      <Card width="100%" elevation={knobProps.elevation} {...knobProps.surface} {...interactive} {...stackProps}>
        {content}
      </Card>
    );
  }
  return (
    <ChartDataView data={config.sparkline!} title={config.title} valueFormatter={formatMetric}>
      {({ action }) => (
        <Card width="100%" elevation={knobProps.elevation} {...knobProps.surface} {...cardProps}>
          <YStack position="relative">
            <YStack
              {...knobProps.gap}
              {...knobProps.containerRadius}
              {...interactive}
              focusable={Boolean(onPress)}
              {...(isWeb
                ? {
                    'data-mpo-kpi-navigation': config.id,
                    tabIndex: onPress ? 0 : undefined,
                    onKeyDown: onPress
                      ? (event: React.KeyboardEvent<HTMLElement>) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            if (!event.repeat) {
                              event.currentTarget.click();
                            }
                          }
                        }
                      : undefined,
                  }
                : {})}>
              {content}
            </YStack>
            <YStack
              position="absolute"
              top={Math.max(0, (dataHeaderHeight - dataActionSize.height) / 2)}
              right={0}
              minHeight={44}
              justifyContent="center"
              onLayout={(event) => {
                const { width, height } = event.nativeEvent.layout;
                setDataActionSize((previous) =>
                  previous.width === width && previous.height === height ? previous : { width, height },
                );
              }}>
              {action}
            </YStack>
          </YStack>
        </Card>
      )}
    </ChartDataView>
  );
}
// ============================================================================
// Chart Card Component
// ============================================================================

export interface ChartCardProps extends Omit<YStackProps, 'children'> {
  config: ChartConfig;
  colors?: string[];
  /**
   * Semantic heading level for the card title. Defaults to 2 —
   * a card is a section under the page H1. Pass 3+ when nested so DOM heading
   * levels step without skips. Visual scale is pinned by `sectionHeading`.
   */
  headingLevel?: CardHeadingLevel;
}

/**
 * Chart card component for displaying a chart with a title.
 *
 * Page line: the title renders OUTSIDE the
 * painted card — a chart card is a section, and same-rank section headings
 * share one x with flush siblings (PageSection got the same fix shape).
 * Only the chart body earns the card's panelPadding inset.
 *
 * All chart modes render the universal charts family (`../charts`) —
 * chromeless plot surfaces (SF-CARD stays with this card wrapper) that
 * resolve the canonical `useChartPalette()` themselves:
 * single-series bar/line marks paint the theme identity (accent, or the
 * tint solid under a tinted theme); pie slices take the identity-led
 * categorical palette. Explicit `config.colors` / per-point `color`
 * values are data and pass through untouched (Axiom 11).
 */
export function ChartCard({ config, colors, headingLevel = 2, ...stackProps }: ChartCardProps) {
  const { knobProps } = useResolvedKnobs();
  const HeadingTag = SECTION_HEADING_TAGS[headingLevel];
  const dataColors = config.colors ?? colors;
  const showXAxis = config.showLabels !== false;

  const renderCard = (action?: ReactNode) => (
    <YStack {...knobProps.gap} width="100%" {...stackProps}>
      <XStack alignItems="center" justifyContent="space-between" {...knobProps.gap}>
        <HeadingTag flex={1} minWidth={0} margin={0} {...knobProps.heading} {...sectionHeading}>
          {config.title}
        </HeadingTag>
        {action}
      </XStack>
      <Card elevation={knobProps.elevation} {...knobProps.surface}>
        {config.type === 'pie' ? (
          <PieChart
            data={config.data}
            height={config.height}
            donut={0.5}
            colors={dataColors}
            showLegend={config.showLegend}
            title={config.title}
          />
        ) : config.type === 'line' ? (
          <LineChart
            data={config.data}
            title={config.title}
            height={config.height}
            color={dataColors?.[0]}
            showPoints
            showXAxis={showXAxis}
            showYAxis={false}
          />
        ) : (
          <BarChart
            data={config.data}
            title={config.title}
            height={config.height}
            colors={dataColors}
            showXAxis={showXAxis}
            showYAxis={false}
          />
        )}
      </Card>
    </YStack>
  );
  return config.type === 'pie' && config.showLegend !== false ? (
    renderCard()
  ) : (
    <ChartDataView data={config.data} title={config.title}>
      {({ action }) => renderCard(action)}
    </ChartDataView>
  );
}

// ============================================================================
// Progress / Shortcut / List widgets
// ============================================================================

export interface ProgressCardProps extends Omit<YStackProps, 'children'> {
  config: ProgressConfig;
}

export function ProgressCard({ config, ...stackProps }: ProgressCardProps) {
  const { knobProps } = useWidgetChrome();
  const max = config.max && config.max > 0 ? config.max : 100;
  const pct = Math.max(0, Math.min(100, (config.value / max) * 100));
  const label = config.format === 'number' ? formatNumber(config.value) : formatPercent(Math.round(pct));

  return (
    <Card width="100%" elevation={knobProps.elevation} {...knobProps.surface} {...stackProps}>
      <Meter
        label={config.title}
        value={config.value}
        min={0}
        max={max}
        format={config.format ?? 'percent'}
        layout="adjacent"
        valueLabel={label}
      />
    </Card>
  );
}

export interface ShortcutCardProps extends Omit<YStackProps, 'children'> {
  config: ShortcutConfig;
}

export function ShortcutCard({ config, ...stackProps }: ShortcutCardProps) {
  const { knobProps, nested, interactive } = useWidgetChrome(config.onClick);
  const { px, box, hitSlop } = nested;

  return (
    <Card
      width="100%"
      elevation={knobProps.elevation}
      {...knobProps.surface}
      {...interactive}
      hitSlop={config.onClick ? hitSlop : undefined}
      {...stackProps}>
      <XStack alignItems="center" {...knobProps.gap}>
        {config.icon ? (
          <NestedIconWell color={config.color} box={box} px={px} radius={knobProps.borderRadius}>
            {config.icon}
          </NestedIconWell>
        ) : null}
        <Text {...knobProps.body} fontWeight="600" flex={1} numberOfLines={1}>
          {config.title}
        </Text>
        {config.count != null && config.count !== '' ? (
          <XStack
            height={px}
            minHeight={px}
            maxHeight={px}
            minWidth={px}
            paddingHorizontal="$2"
            alignItems="center"
            justifyContent="center"
            backgroundColor="$color4"
            {...knobProps.borderRadius}
            data-nested-px={px}>
            <Text {...knobProps.label} color={knobProps.textAccentColor}>
              {config.count}
            </Text>
          </XStack>
        ) : null}
      </XStack>
    </Card>
  );
}

export interface ListCardProps extends Omit<YStackProps, 'children'> {
  config: ListConfig;
  headingLevel?: CardHeadingLevel;
}

export function ListCard({ config, headingLevel = 2, ...stackProps }: ListCardProps) {
  const { knobProps, nested, control } = useWidgetChrome();
  const { px, hitSlop } = nested;
  const HeadingTag = SECTION_HEADING_TAGS[headingLevel];

  return (
    <YStack {...knobProps.gap} width="100%" {...stackProps}>
      <HeadingTag margin={0} {...knobProps.heading} {...sectionHeading}>
        {config.title}
      </HeadingTag>
      <Card elevation={knobProps.elevation} {...knobProps.surface}>
        {config.items.map((item) => (
          <XStack
            key={item.id}
            height={px}
            minHeight={px}
            maxHeight={px}
            alignItems="center"
            justifyContent="space-between"
            {...knobProps.gap}
            data-nested-px={px}
            cursor={item.onClick ? 'pointer' : undefined}
            hitSlop={item.onClick ? hitSlop : undefined}
            hoverStyle={item.onClick ? control.hoverKnobProps : undefined}
            pressStyle={item.onClick ? control.pressKnobProps : undefined}
            focusVisibleStyle={item.onClick ? control.focusVisibleKnobProps : undefined}
            onPress={item.onClick}
            role={item.onClick ? 'button' : undefined}>
            <Text {...knobProps.label} flex={1} numberOfLines={1}>
              {item.label}
            </Text>
            {item.meta ? (
              <Text {...knobProps.label} color={knobProps.textAccentColor}>
                {item.meta}
              </Text>
            ) : null}
          </XStack>
        ))}
      </Card>
    </YStack>
  );
}

function DefaultWidget({ widget }: { widget: DashboardWidget }) {
  switch (widget.type) {
    case 'kpi':
      return widget.kpiConfig ? <KPICard config={widget.kpiConfig} /> : null;
    case 'chart':
      return widget.chartConfig ? <ChartCard config={widget.chartConfig} /> : null;
    case 'progress':
      return widget.progressConfig ? <ProgressCard config={widget.progressConfig} /> : null;
    case 'shortcut':
      return widget.shortcutConfig ? <ShortcutCard config={widget.shortcutConfig} /> : null;
    case 'list':
      return widget.listConfig ? <ListCard config={widget.listConfig} /> : null;
    case 'custom':
      return widget.content ?? null;
    default:
      return null;
  }
}

// ============================================================================
// Main Dashboard Component
// ============================================================================

/**
 * Generic dashboard component.
 *
 * Renders a grid of KPI, progress, shortcut, list, and chart widgets using
 * the house Card surface. Accepts data purely through props — no fetching.
 *
 * @example
 * ```tsx
 * <Dashboard
 *   title="Sales Overview"
 *   widgets={[
 *     { id: 'revenue', type: 'kpi', kpiConfig: { ... } },
 *     { id: 'chart', type: 'chart', chartConfig: { ... }, colSpan: 2 },
 *   ]}
 * />
 * ```
 */
export function Dashboard({
  widgets,
  renderWidget,
  title,
  description,
  columns = 4,
  gap: gapProp,
  padding: paddingProp,
  isLoading = false,
  error = null,
  onRetry,
  emptyMessage: emptyMessageProp,
  ...stackProps
}: DashboardProps) {
  const { t } = useTranslation();
  const emptyMessage = emptyMessageProp ?? t('No widgets to display');
  const { knobProps } = useResolvedKnobs();
  const gap = gapProp ?? 16;

  const header =
    title || description ? (
      <YStack {...knobProps.gap}>
        {title && (
          <H3 margin={0} {...knobProps.heading}>
            {title}
          </H3>
        )}
        {description && (
          <Text {...knobProps.body} {...knobProps.label} color={knobProps.textAccentColor}>
            {description}
          </Text>
        )}
      </YStack>
    ) : null;

  return (
    <ScrollView>
      <YStack {...(paddingProp != null ? { padding: paddingProp } : knobProps.panelPadding)} gap={gap} {...stackProps}>
        {header}
        <AsyncBoundary
          loading={!error && isLoading && widgets.length === 0}
          empty={!error && widgets.length === 0}
          error={error}
          onRetry={onRetry}
          layout="dashboard"
          emptyTitle={emptyMessage}>
          <XStack
            flexWrap="wrap"
            gap={gap}
            {...(isWeb
              ? // CSS grid props are web-only and absent from the RN-flavored
                // View type; Tamagui forwards them to the DOM (house Record cast).
                ({
                  display: 'grid',
                  gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                } as Record<string, unknown>)
              : { marginHorizontal: -gap / 2 })}>
            {widgets.map((widget) => {
              const span = Math.min(widget.colSpan || 1, columns);
              const widthPercent = (span / columns) * 100;
              const adjustedWidth = `calc(${widthPercent}% - ${gap}px)`;

              return (
                <YStack
                  key={widget.id}
                  data-dashboard-widget={widget.type}
                  {...(isWeb
                    ? { gridColumn: `span ${span}`, minWidth: 0, width: '100%' }
                    : {
                        width: adjustedWidth as any,
                        minWidth: 200,
                        marginHorizontal: gap / 2,
                        marginBottom: gap,
                      })}>
                  {renderWidget ? renderWidget(widget) : <DefaultWidget widget={widget} />}
                </YStack>
              );
            })}
          </XStack>
        </AsyncBoundary>
      </YStack>
    </ScrollView>
  );
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Calculate trend direction based on current and previous values.
 */
export function calculateTrend(current: number, previous: number): TrendDirection {
  if (current > previous) {
    return 'up';
  }
  if (current < previous) {
    return 'down';
  }
  return 'neutral';
}

/**
 * Calculate percentage change between two values.
 */
export function calculatePercentageChange(current: number, previous: number): string {
  if (previous === 0) {
    return current > 0 ? '+100%' : '0%';
  }
  const change = ((current - previous) / previous) * 100;
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(1)}%`;
}

/**
 * Aggregate data for charts.
 */
export function aggregateData<T>(
  data: T[],
  groupByField: keyof T,
  valueField: keyof T,
  operation: 'count' | 'sum' | 'avg' = 'count',
): ChartDataPoint[] {
  const groups: Record<string, number[]> = {};

  for (const item of data) {
    const key = String(item[groupByField]);
    if (!groups[key]) {
      groups[key] = [];
    }

    if (operation === 'count') {
      groups[key].push(1);
    } else {
      const value = Number(item[valueField]) || 0;
      groups[key].push(value);
    }
  }

  return Object.entries(groups).map(([label, values]) => {
    let value: number;
    switch (operation) {
      case 'count':
        value = values.length;
        break;
      case 'sum':
        value = values.reduce((a, b) => a + b, 0);
        break;
      case 'avg':
        value = values.reduce((a, b) => a + b, 0) / values.length;
        break;
      default:
        value = values.length;
    }
    return { label, value };
  });
}
