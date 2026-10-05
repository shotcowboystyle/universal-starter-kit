import {
  Intent,
  MIN_PRESS_TARGET,
  ensureKeyboardModalityTracking,
  formatNumber,
  hairline,
  hairlineWidth,
  keyboardFocusRingProps,
  useReadableTextOn,
  useResolvedKnobs,
  wasKeyboardFocus,
} from '@repo/theme';
import React, { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { ScrollView as RNScrollView } from 'react-native';
import { Text, XStack, YStack, isWeb, type YStackProps } from 'tamagui';

import { componentColors, sectionHeading } from '../componentColors';
import { AsyncBoundary } from '../layouts/AsyncBoundary';
import { ViewSwitcher } from '../layouts/ViewSwitcher';
import { ScrollView } from '../ScrollView';
import { useTranslation } from '../shared/i18n';
import { withInterp } from '../shared/t';
import { Skeleton } from '../Skeleton';

import { formatRangeLabel } from './ganttMath';
import {
  alignMatrixRange,
  matrixCellIntensity,
  matrixCellKey,
  computeMatrixRange,
  generateBuckets,
  matrixMaxValue,
  summarizeMatrixCells,
  type MatrixBucket,
  type MatrixBucketRule,
  type MatrixCell,
  type MatrixCellSummary,
  type MatrixIntent,
  type MatrixRange,
} from './matrixMath';

// Same split as the Gantt: the grid canvas needs real scroll events to drive
// the pinned axis follower, and Tamagui's styled ScrollView does not deliver
// onScroll on native.
const CanvasScroller = (isWeb ? ScrollView : RNScrollView) as typeof ScrollView;

/**
 * Inline-END hairline rule for the label column edge (SB-M-1215 pattern
 * shared with Calendar/Gantt: tamagui's RN `borderEndWidth` does not compile
 * to working CSS on web).
 */
const hairlineEnd = isWeb
  ? {
      borderInlineEndWidth: hairlineWidth,
      borderInlineEndStyle: 'solid' as any,
      className: 'mp-hairline-ie',
    }
  : { borderEndWidth: hairlineWidth };

/** Lowest paint strength a present cell takes, so a zero stays visible. */
const FILL_FLOOR = 0.14;
/** Intensity from which the cell text switches to on-fill ink. */
const ON_FILL_INK_FROM = 0.55;
const LEGEND_STEPS = [0, 0.25, 0.5, 0.75, 1] as const;

/** One subject row of the matrix. */
export interface MatrixRow {
  /** Unique row identifier; `MatrixCell.rowId` points at it. */
  id: string;
  /** Row header text and the subject half of every cell's accessible name. */
  label: string;
  /** Any additional data */
  [key: string]: unknown;
}

/** Which intersection a press was about. `summary` is undefined for an empty bucket. */
export interface MatrixCellRef {
  row: MatrixRow;
  bucket: MatrixBucket;
  summary: MatrixCellSummary | undefined;
}

/** A legend entry beyond the built-in ramp: a solid swatch with a label. */
export interface MatrixLegendItem {
  label: string;
  intent?: MatrixIntent;
  color?: string;
}

export interface MatrixViewProps extends Omit<YStackProps, 'children'> {
  /** Subjects, one row each, in display order. */
  rows: MatrixRow[];
  /** Data points; the view folds them into (row, bucket) intersections. */
  cells: MatrixCell[];
  /** Initial bucket rule the column axis is generated from (default: 'month'). */
  rule?: MatrixBucketRule;
  /** Called when the rule changes via the switcher. */
  onRuleChange?: (rule: MatrixBucketRule) => void;
  /**
   * Explicit window, snapped to bucket boundaries. Omitted, the window is
   * exactly the buckets the data spans (no padding).
   */
  range?: MatrixRange;
  /** First day of week for week alignment: 0 = Sunday, 1 = Monday (default: 0) */
  firstDayOfWeek?: 0 | 1;
  /** Called when a cell is pressed (pointer, or Enter/Space on a focused cell). Empty buckets press too. */
  onCellPress?: (ref: MatrixCellRef) => void;
  /** Visible cell text (default: the summed value, else the point count). */
  formatCell?: (summary: MatrixCellSummary) => string;
  /** Whether data is loading (skeleton shows only while there are no rows) */
  isLoading?: boolean;
  /** Failed load. Wins over the empty state. */
  error?: boolean | string | Error | ReactNode | null;
  /** Retry handler for the default error UI. */
  onRetry?: () => void;
  /** Title for the default empty state */
  emptyTitle?: string;
  /** Description for the default empty state */
  emptyDescription?: string;
  /** Height of the grid in pixels (default steps with the size knob) */
  height?: number;
  /** Width of the subject column in pixels (default: 180) */
  labelWidth?: number;
  /** Width of one bucket column in pixels (default steps with the size knob; never below the press target) */
  columnWidth?: number;
  /** Header text of the subject column (default: "Subject"). */
  subjectLabel?: string;
  /** Show the day/week/month rule switcher (default: true) */
  showRuleSwitcher?: boolean;
  /** Show the legend strip under the grid (default: true) */
  showLegend?: boolean;
  /** Extra legend entries after the built-in empty + ramp swatches. */
  legendItems?: MatrixLegendItem[];
}

// ── Fill resolution ───────────────────────────────────────────

/**
 * Semantic intents ride their hue sub-theme (`<Intent name>` → `$color9`);
 * the default identity stays on `$accentBackground`. Explicit
 * colors pass through untouched (Axiom 11).
 */
function CellIntentWrap({ intent, children }: { intent?: MatrixIntent; children: ReactNode }) {
  if (!intent || intent === 'accent') {
    return <>{children}</>;
  }
  return <Intent name={intent}>{children}</Intent>;
}

function resolveFill(color: string | undefined, intent: MatrixIntent | undefined): string {
  return color ?? (intent && intent !== 'accent' ? '$color9' : '$accentBackground');
}

function fillOpacity(intensity: number): number {
  return FILL_FLOOR + (1 - FILL_FLOOR) * intensity;
}

// ── Cell ──────────────────────────────────────────────────────

interface MatrixCellBoxProps {
  row: MatrixRow;
  bucket: MatrixBucket;
  summary: MatrixCellSummary | undefined;
  intensity: number;
  fill: string;
  text: string;
  name: string;
  width: number;
  height: number;
  lastColumn: boolean;
  onPress?: () => void;
}

function MatrixCellBox({
  row,
  bucket,
  summary,
  intensity,
  fill,
  text,
  name,
  width,
  height,
  lastColumn,
  onPress,
}: MatrixCellBoxProps) {
  const { knobProps } = useResolvedKnobs();
  const readable = useReadableTextOn(fill);
  const [keyboardRing, setKeyboardRing] = useState(false);
  const empty = summary === undefined;
  const state = summary === undefined ? 'empty' : summary.value === 0 ? 'zero' : 'value';
  const ink = !empty && intensity >= ON_FILL_INK_FROM && readable ? readable : '$color';
  const pressable = onPress !== undefined;
  return (
    <YStack
      width={width}
      height={height}
      alignItems="center"
      justifyContent="center"
      position="relative"
      overflow="hidden"
      {...(lastColumn ? null : hairlineEnd)}
      borderColor={componentColors.divider}
      cursor={pressable ? 'pointer' : undefined}
      hoverStyle={pressable ? { backgroundColor: componentColors.interactive.hover } : undefined}
      pressStyle={pressable ? { opacity: 0.8 } : undefined}
      role={pressable ? 'button' : undefined}
      tabIndex={pressable ? 0 : undefined}
      aria-label={name}
      // One ring on the cell (the perceived control), keyboard-only.
      {...(keyboardRing ? keyboardFocusRingProps : { outlineWidth: 0 })}
      onFocus={
        pressable
          ? () => {
              setKeyboardRing(wasKeyboardFocus());
            }
          : undefined
      }
      onBlur={
        pressable
          ? () => {
              setKeyboardRing(false);
            }
          : undefined
      }
      onPress={onPress}
      onKeyDown={
        pressable
          ? (((ke: any) => {
              if (ke.key !== 'Enter' && ke.key !== ' ') {
                return;
              }
              ke.preventDefault?.();
              onPress();
            }) as any)
          : undefined
      }
      {...{
        'data-matrix-cell': `${row.id}:${bucket.key}`,
        'data-matrix-cell-state': state,
        ...(summary?.intent ? { 'data-matrix-cell-intent': summary.intent } : null),
      }}>
      {!empty && (
        <YStack
          position="absolute"
          top={0}
          left={0}
          right={0}
          bottom={0}
          backgroundColor={fill as any}
          opacity={fillOpacity(intensity)}
          pointerEvents="none"
          {...{ 'data-matrix-fill': String(intensity) }}
        />
      )}
      <Text
        {...knobProps.label}
        color={empty ? componentColors.text.subtle : ink}
        numberOfLines={1}
        pointerEvents="none"
        zIndex={1}
        aria-hidden>
        {empty ? '·' : text}
      </Text>
    </YStack>
  );
}

// ── Legend ────────────────────────────────────────────────────

function LegendSwatch({ intensity, fill, empty }: { intensity?: number; fill?: string; empty?: boolean }) {
  const { knobProps } = useResolvedKnobs();
  return (
    <YStack
      width={14}
      height={14}
      {...knobProps.borderRadius}
      position="relative"
      overflow="hidden"
      alignItems="center"
      justifyContent="center"
      borderWidth={hairlineWidth}
      borderColor={componentColors.surface.border}
      {...{ 'data-matrix-legend-swatch': empty ? 'empty' : String(intensity ?? 1) }}>
      {empty ? (
        <Text fontSize={10} lineHeight={10} color={componentColors.text.subtle} aria-hidden>
          ·
        </Text>
      ) : (
        <YStack
          position="absolute"
          top={0}
          left={0}
          right={0}
          bottom={0}
          backgroundColor={(fill ?? '$accentBackground') as any}
          opacity={fillOpacity(intensity ?? 1)}
        />
      )}
    </YStack>
  );
}

// ── Loading skeleton (mirrors the real anatomy) ────────

const SKELETON_ROWS = [96, 72, 112, 64, 88] as const;

function MatrixSkeleton({
  labelWidth,
  columnWidth,
  rowHeight,
}: {
  labelWidth: number;
  columnWidth: number;
  rowHeight: number;
}) {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  const edgePad = knobProps.panelPadding.padding;
  const columns = [0, 1, 2, 3, 4, 5];
  return (
    <YStack
      width="100%"
      aria-busy
      aria-label={t('Loading')}
      {...{ 'data-matrix-skeleton': 'true', 'data-async-skeleton': 'matrix' }}>
      <XStack height={rowHeight} alignItems="center" {...hairline.bottom} borderColor="$borderColor">
        <XStack width={labelWidth} paddingHorizontal={edgePad}>
          <Skeleton width={64} height={12} />
        </XStack>
        {columns.map((column) => (
          <XStack key={column} width={columnWidth} justifyContent="center">
            <Skeleton width={Math.max(24, columnWidth - 24)} height={12} />
          </XStack>
        ))}
      </XStack>
      {SKELETON_ROWS.map((labelSkeletonWidth, index) => (
        <XStack
          key={index}
          height={rowHeight}
          alignItems="center"
          {...(index < SKELETON_ROWS.length - 1 ? hairline.bottom : null)}
          borderColor={componentColors.divider}>
          <XStack width={labelWidth} paddingHorizontal={edgePad}>
            <Skeleton width={labelSkeletonWidth} height={12} />
          </XStack>
          {columns.map((column) => (
            <XStack key={column} width={columnWidth} justifyContent="center">
              {(column + index) % 3 === 0 ? null : (
                <Skeleton
                  variant="rounded"
                  width={Math.max(16, columnWidth - 16)}
                  height={Math.max(10, rowHeight - 20)}
                />
              )}
            </XStack>
          ))}
        </XStack>
      ))}
    </YStack>
  );
}

// ── MatrixView ────────────────────────────────────────────────

/**
 * Generic matrix view: one row per subject, one column per time bucket, one
 * cell per intersection carrying a value and a paint strength rather than a
 * record. Account by month, person by week, service by day.
 *
 * The column axis is GENERATED from a bucket rule (day / week / month) over
 * the data's range, using the Gantt's own tick placement and day math
 * (`ganttMath`), so it is a real axis and not a hand-declared column set.
 * A cell paints its fill at an intensity: explicit, or the summed value
 * scaled against the grid's max, or full strength for bare presence. A real
 * zero paints at the floor of the ramp; a bucket nothing landed in paints
 * nothing and shows a dot, so an absence never reads as a zero. Every cell
 * has a full accessible name and, with `onCellPress`, is a button.
 *
 * The header row stays pinned while rows scroll vertically (labels and rows
 * share one vertical scroller so alignment is structural); the subject
 * column stays pinned while the grid scrolls horizontally, the header strip
 * being a scroll-follower of the grid scroller, which works on web and
 * native alike (the Gantt mechanism). Loading / empty / error are honest
 * first-class states (Axiom 6) via AsyncBoundary.
 *
 * @example
 * ```tsx
 * <MatrixView
 *   rows={accounts.map((a) => ({ id: a.id, label: a.name }))}
 *   cells={statements.map((s) => ({ rowId: s.account, date: s.date, value: s.count }))}
 *   rule="month"
 *   onCellPress={({ row, bucket }) => openStatements(row.id, bucket.start)}
 * />
 * ```
 */
export function MatrixView({
  rows,
  cells,
  rule: initialRule = 'month',
  onRuleChange,
  range: rangeProp,
  firstDayOfWeek = 0,
  onCellPress,
  formatCell,
  isLoading = false,
  error = null,
  onRetry,
  emptyTitle,
  emptyDescription,
  height: heightProp,
  labelWidth = 180,
  columnWidth: columnWidthProp,
  subjectLabel,
  showRuleSwitcher = true,
  showLegend = true,
  legendItems,
  ...stackProps
}: MatrixViewProps) {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  const [rule, setRule] = useState<MatrixBucketRule>(initialRule);
  if (typeof document !== 'undefined') {
    ensureKeyboardModalityTracking();
  }

  // ── Knob-derived geometry (size/space step the density) ──────────
  const sz = knobProps.sizeToken;
  const height = heightProp ?? (sz === '$3' ? 400 : sz === '$5' ? 560 : 480);
  // Cell paint is the press target: never below 44px on either axis.
  const rowHeight = Math.max(MIN_PRESS_TARGET, sz === '$3' ? 44 : sz === '$5' ? 56 : 48);
  const columnWidth = Math.max(MIN_PRESS_TARGET, columnWidthProp ?? (sz === '$3' ? 56 : sz === '$5' ? 72 : 64));
  const axisHeight = sz === '$3' ? 40 : sz === '$5' ? 52 : 46;

  // ── Axis + cells ─────────────────────────────────────────────────────────
  const range = useMemo(
    () =>
      rangeProp
        ? alignMatrixRange(rangeProp, rule, firstDayOfWeek)
        : computeMatrixRange(
            cells.map((cell) => cell.date),
            rule,
            firstDayOfWeek,
          ),
    [rangeProp, cells, rule, firstDayOfWeek],
  );
  const buckets = useMemo(() => generateBuckets(range, rule, firstDayOfWeek), [range, rule, firstDayOfWeek]);
  const summaries = useMemo(() => summarizeMatrixCells(cells, rule, firstDayOfWeek), [cells, rule, firstDayOfWeek]);
  const maxValue = useMemo(() => {
    const rowIds = new Set(rows.map((row) => row.id));
    const bucketKeys = new Set(buckets.map((bucket) => bucket.key));
    return matrixMaxValue(
      Array.from(summaries.values()).filter(
        (summary) => rowIds.has(summary.rowId) && bucketKeys.has(summary.bucketKey),
      ),
    );
  }, [summaries, rows, buckets]);
  const gridWidth = buckets.length * columnWidth;
  const rangeLabel = useMemo(() => formatRangeLabel(range), [range]);

  const changeRule = useCallback(
    (next: MatrixBucketRule) => {
      setRule(next);
      onRuleChange?.(next);
    },
    [onRuleChange],
  );

  const cellText = useCallback(
    (summary: MatrixCellSummary): string => {
      if (formatCell) {
        return formatCell(summary);
      }
      if (summary.label !== undefined) {
        return summary.label;
      }
      return formatNumber(summary.value ?? summary.count);
    },
    [formatCell],
  );

  // ── Pinned-axis sync (the Gantt follower) ────────────────────────────────
  const axisScrollRef = useRef<any>(null);
  const handleCanvasScroll = useCallback((event: any) => {
    const x = event?.nativeEvent?.contentOffset?.x ?? 0;
    axisScrollRef.current?.scrollTo?.({ x, animated: false });
  }, []);

  // Manual mirroring is not implemented here; force the scrollers LTR so the
  // follower offsets stay 0-at-content-start on web.
  const scrollerDirection = { direction: 'ltr' as const };
  const showSkeleton = !error && isLoading && rows.length === 0;

  return (
    <AsyncBoundary
      loading={
        showSkeleton ? (
          <MatrixSkeleton labelWidth={labelWidth} columnWidth={columnWidth} rowHeight={rowHeight} />
        ) : (
          false
        )
      }
      empty={!error && !isLoading && rows.length === 0}
      error={error}
      onRetry={onRetry}
      emptyTitle={emptyTitle ?? t('No subjects')}
      emptyDescription={emptyDescription}
      {...stackProps}>
      <YStack
        height={height}
        overflow="hidden"
        backgroundColor="$background"
        elevation={knobProps.elevation}
        {...knobProps.containerRadius}
        {...{
          'data-matrix-view': rule,
          'data-size': knobProps.size,
          'data-density': knobProps.density,
        }}>
        {/* Header */}
        <XStack
          {...knobProps.panelPadding}
          alignItems="center"
          justifyContent="space-between"
          {...knobProps.gap}
          {...hairline.bottom}
          borderColor="$borderColor">
          <Text {...knobProps.heading} {...sectionHeading} numberOfLines={1}>
            {rangeLabel}
          </Text>
          {showRuleSwitcher && (
            <ViewSwitcher
              views={[
                { type: 'day', label: t('Day') },
                { type: 'week', label: t('Week') },
                { type: 'month', label: t('Month') },
              ]}
              currentView={rule}
              onViewChange={(val) => {
                changeRule(val as MatrixBucketRule);
              }}
            />
          )}
        </XStack>

        {/* Pinned axis row: the subject header cell + the bucket header strip
            stay put while rows scroll vertically. The strip follows the grid
            scroller, so headers and cells can never drift apart. */}
        <XStack {...hairline.bottom} borderColor="$borderColor" {...{ 'data-matrix-axis-row': 'true' }}>
          <XStack
            width={labelWidth}
            flexShrink={0}
            height={axisHeight}
            alignItems="center"
            paddingHorizontal={knobProps.panelPadding.padding}
            {...hairlineEnd}
            borderColor="$borderColor"
            {...{ backgroundColor: componentColors.surface.background }}>
            <Text {...knobProps.label} color={knobProps.textAccentColor} numberOfLines={1}>
              {subjectLabel ?? t('Subject')}
            </Text>
          </XStack>
          <ScrollView
            ref={axisScrollRef}
            horizontal
            flex={1}
            scrollEnabled={false}
            showsHorizontalScrollIndicator={false}
            style={scrollerDirection as any}>
            <XStack
              width={gridWidth}
              height={axisHeight}
              {...{
                backgroundColor: componentColors.surface.background,
                'data-matrix-axis': rule,
              }}>
              {buckets.map((bucket, index) => (
                <XStack
                  key={bucket.key}
                  width={columnWidth}
                  height={axisHeight}
                  alignItems="center"
                  justifyContent="center"
                  {...(index === buckets.length - 1 ? null : hairlineEnd)}
                  borderColor={componentColors.divider}
                  aria-label={bucket.name}
                  {...{ 'data-matrix-column': bucket.key }}>
                  <Text {...knobProps.label} color={knobProps.textAccentColor} numberOfLines={1}>
                    {bucket.label}
                  </Text>
                </XStack>
              ))}
            </XStack>
          </ScrollView>
        </XStack>

        {/* Body: subject labels + grid share one vertical scroller so rows stay
            aligned; the grid owns its horizontal scroller. */}
        <ScrollView flex={1}>
          <XStack {...{ 'data-matrix-scroll-body': 'true' }}>
            <YStack
              width={labelWidth}
              flexShrink={0}
              {...hairlineEnd}
              borderColor="$borderColor"
              {...{ 'data-matrix-labels': 'true' }}>
              {rows.map((row, index) => (
                <XStack
                  key={row.id}
                  height={rowHeight}
                  alignItems="center"
                  paddingHorizontal={knobProps.panelPadding.padding}
                  {...(index === rows.length - 1 ? null : hairline.bottom)}
                  borderColor={componentColors.divider}
                  {...{ 'data-matrix-row-label': row.id }}>
                  <Text {...knobProps.body} numberOfLines={1} color="$color">
                    {row.label}
                  </Text>
                </XStack>
              ))}
            </YStack>

            <CanvasScroller
              keyboardShouldPersistTaps="handled"
              horizontal
              {...(isWeb ? { flex: 1 } : null)}
              showsHorizontalScrollIndicator
              onScroll={handleCanvasScroll}
              scrollEventThrottle={16}
              style={(isWeb ? scrollerDirection : [{ flex: 1 }, scrollerDirection]) as any}>
              <YStack width={gridWidth} {...{ 'data-matrix-canvas': 'true' }}>
                {rows.map((row, rowIndex) => (
                  <XStack
                    key={row.id}
                    height={rowHeight}
                    {...(rowIndex === rows.length - 1 ? null : hairline.bottom)}
                    borderColor={componentColors.divider}
                    {...{ 'data-matrix-row': row.id }}>
                    {buckets.map((bucket, columnIndex) => {
                      const summary = summaries.get(matrixCellKey(row.id, bucket.key));
                      const intensity = summary ? matrixCellIntensity(summary, maxValue) : 0;
                      const fill = resolveFill(summary?.color, summary?.intent);
                      const text = summary ? cellText(summary) : t('No data');
                      const name = withInterp(t('{{subject}}, {{bucket}}: {{value}}'), {
                        subject: row.label,
                        bucket: bucket.name,
                        value: text,
                      });
                      return (
                        <CellIntentWrap key={bucket.key} intent={summary?.color ? undefined : summary?.intent}>
                          <MatrixCellBox
                            row={row}
                            bucket={bucket}
                            summary={summary}
                            intensity={intensity}
                            fill={fill}
                            text={text}
                            name={name}
                            width={columnWidth}
                            height={rowHeight}
                            lastColumn={columnIndex === buckets.length - 1}
                            onPress={
                              onCellPress
                                ? () => {
                                    onCellPress({ row, bucket, summary });
                                  }
                                : undefined
                            }
                          />
                        </CellIntentWrap>
                      );
                    })}
                  </XStack>
                ))}
              </YStack>
            </CanvasScroller>
          </XStack>
        </ScrollView>

        {showLegend && (
          <XStack
            {...knobProps.panelPadding}
            alignItems="center"
            flexWrap="wrap"
            {...knobProps.gap}
            {...hairline.top}
            borderColor="$borderColor"
            {...{ 'data-matrix-legend': 'true' }}>
            <XStack alignItems="center" gap="$1.5">
              <LegendSwatch empty />
              <Text {...knobProps.label} color={knobProps.textAccentColor}>
                {t('No data')}
              </Text>
            </XStack>
            <XStack alignItems="center" gap="$1.5">
              <Text {...knobProps.label} color={knobProps.textAccentColor}>
                {t('Less')}
              </Text>
              {LEGEND_STEPS.map((step) => (
                <LegendSwatch key={step} intensity={step} />
              ))}
              <Text {...knobProps.label} color={knobProps.textAccentColor}>
                {t('More')}
              </Text>
            </XStack>
            {legendItems?.map((item, index) => (
              <CellIntentWrap key={`${item.label}-${index}`} intent={item.color ? undefined : item.intent}>
                <XStack alignItems="center" gap="$1.5">
                  <LegendSwatch fill={resolveFill(item.color, item.intent)} />
                  <Text {...knobProps.label} color={knobProps.textAccentColor}>
                    {item.label}
                  </Text>
                </XStack>
              </CellIntentWrap>
            ))}
          </XStack>
        )}
      </YStack>
    </AsyncBoundary>
  );
}
