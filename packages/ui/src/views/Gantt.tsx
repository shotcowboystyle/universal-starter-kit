import { Button } from '@repo/forms';
import {
  Intent,
  MIN_PRESS_TARGET,
  ensureKeyboardModalityTracking,
  formatAbsoluteDate,
  formatDayOfMonth,
  formatMonthYear,
  hairline,
  hairlineWidth,
  keyboardFocusRingProps,
  useReadableTextOn,
  useResolvedKnobs,
  wasKeyboardFocus,
} from '@repo/theme';
import React, { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ScrollView as RNScrollView } from 'react-native';
import { Text, XStack, YStack, isWeb, type YStackProps } from 'tamagui';

import { componentColors, sectionHeading } from '../componentColors';
import { useDirection } from '../hooks/useDirection';
import { AsyncBoundary } from '../layouts/AsyncBoundary';
import { ViewSwitcher } from '../layouts/ViewSwitcher';
import { ScrollView } from '../ScrollView';
import { useTranslation } from '../shared/i18n';
import { withInterp } from '../shared/t';
import { Skeleton } from '../Skeleton';

import {
  addDays,
  barGeometry,
  clampResizeDayDelta,
  computeGanttRange,
  dateLineX,
  dateToX,
  dayDiff,
  dxToDayDelta,
  formatRangeLabel,
  formatSpanLabel,
  ganttTaskAccessibleLabel,
  generateTicks,
  isBoundedSpan,
  openBarGeometry,
  openSpanExtents,
  openSpanLabelParts,
  rangeDays,
  resizeSpanByDays,
  scrollAnchorX,
  shiftSpanByDays,
  spanInclusiveDays,
  startOfDay,
  todayLineX,
  type GanttOpenSpan,
  type GanttRange,
  type GanttResizeEdge,
  type GanttSpan,
  type GanttZoom,
} from './ganttMath';

// The chart canvas needs real scroll events to drive the pinned axis follower,
// but Tamagui's styled ScrollView does not deliver onScroll on native — use the
// raw RN ScrollView there (web keeps the Tamagui scroller unchanged).
const CanvasScroller = (isWeb ? ScrollView : RNScrollView) as typeof ScrollView;

/**
 * One drawn span on a Gantt row: a duration bar, or an open-ended one.
 *
 * BOTH BOUNDS ARE OPTIONAL, and an absent bound means the span is open at
 * that end — not that the caller forgot it. Each of the three shapes paints
 * differently, because a viewer must never read an edge nobody chose:
 *
 * | `start` | `end` | drawn as |
 * |---|---|---|
 * | set | set | a capped bar between the two dates (inclusive whole days) |
 * | set | absent | a bar from `start`, uncapped, running off the chart's end edge with a `»` |
 * | absent | set | a bar to `end`, uncapped, running off the chart's start edge with a `«` |
 * | absent | absent | a thin half-height RAIL across the whole chart, `«` and `»` at both ends |
 *
 * The rail is a different SHAPE on purpose. Painting an eternal span as a
 * full-width BAR would put two capped edges on screen at the chart's own
 * padding, and the reader would take that padding for a decision.
 *
 * Rescheduling needs both bounds. A span missing either one gets no drag
 * session, no resize handles and no keyboard moves — there is no second
 * edge to preserve a duration against. `progress` is likewise ignored on an
 * open span: a percentage of an unknown duration says nothing.
 */
export interface GanttTaskSpan {
  /**
   * Stable id, unique within the task. Used as the React key, the drag
   * session key and the `data-gantt-bar` attribute. Optional: a row's spans
   * fall back to `<task id>#<index>`.
   */
  id?: string;
  /** Span start date. Absent = open at the start. */
  start?: Date;
  /** Span end date (midnight ends are inclusive whole days — Frappe date fields). Absent = open at the end. */
  end?: Date;
  /**
   * Explicit bar color (hex/rgb/token). Passes through untouched — the
   * literal is the value (Axiom 11). Wins over `intent`.
   */
  color?: string;
  /** Semantic bar intent rendered via the theme ramps. */
  intent?: 'accent' | 'error' | 'warning' | 'success';
  /**
   * Optional completion 0–100. Paints a darker overlay on the bar (Frappe
   * Gantt / MS Project progress). Omitted or 0 shows an empty bar. Ignored
   * on an open-ended span.
   */
  progress?: number;
  /** Bar label, when it should differ from the row's title. */
  title?: string;
}

/**
 * A Gantt task rendered as one row.
 *
 * The row carries ONE span by default — the task's own `start`/`end`, which
 * is what every caller before `spans` existed passes — or SEVERAL when
 * `spans` is set. Several is for one logical subject that ships a variant
 * per period: three rules named `..._2026`, `..._2027`, `..._2028` are one
 * emitter and want one row carrying three strips, not three unrelated rows.
 */
export interface GanttTask extends GanttTaskSpan {
  /** Unique task identifier */
  id: string;
  /** Task title shown in the label column and the bar's accessible name */
  title: string;
  /**
   * Several spans on this one row. When set and non-empty it REPLACES the
   * task's own `start`/`end` as the thing drawn; the label column still
   * shows one row. Leave it off for the one-bar-per-row shape, which is
   * unchanged in every respect down to the `data-gantt-bar` attribute.
   */
  spans?: GanttTaskSpan[];
  /** Any additional data */
  [key: string]: unknown;
}

/**
 * Which span of a row a callback is about.
 *
 * A single-span row reports `index: 0` and `key: task.id`, so a caller that
 * never sets `spans` can keep ignoring this argument entirely.
 */
export interface GanttSpanRef {
  /** The span itself — the task object for a single-span row. */
  span: GanttTaskSpan;
  /** Position within `task.spans`, or 0 for a single-span row. */
  index: number;
  /** Stable key: `span.id`, else `task.id` (single-span) or `<task id>#<index>`. */
  key: string;
}

/** New start/end range produced by a bar drag-move. */
export interface GanttItemMoveRange {
  start: Date;
  end: Date;
}

/**
 * Props for the generic GanttView component.
 */
export interface GanttViewProps extends Omit<YStackProps, 'children'> {
  /** Tasks to display (one row per task) */
  tasks: GanttTask[];
  /** Initial zoom level (default: 'week') */
  zoom?: GanttZoom;
  /** Called when the zoom level changes via the switcher */
  onZoomChange?: (zoom: GanttZoom) => void;
  /** Called when a task bar is pressed */
  onItemPress?: (task: GanttTask) => void;
  /**
   * Called when a bar is rescheduled onto new dates — by a horizontal drag
   * (whole bar moves, duration preserved), by keyboard arrows on a focused
   * bar (ArrowLeft/ArrowRight = 1 day, Shift = 7 days), or by an edge-resize
   * drag (start or end adjusts independently, duration changes; web
   * pointer only). All paths preserve wall-clock times and snap to whole
   * days. Web drags use pointer tracking (Escape cancels); native uses the
   * responder system (best-effort — scroll locks while dragging).
   *
   * `span` names WHICH span of a multi-span row moved. A single-span row
   * reports `{ index: 0, key: task.id }` and the span object IS the task, so
   * a two-argument handler stays correct and needs no change.
   *
   * Only fully-bounded spans reschedule: an open-ended one has no second
   * edge to hold a duration against, so it is never dragged and this never
   * fires for it.
   */
  onItemMove?: (task: GanttTask, range: GanttItemMoveRange, span?: GanttSpanRef) => void;
  /**
   * Enable bar rescheduling — pointer drag, keyboard arrows, and edge
   * resize (default: enabled when onItemMove is provided).
   */
  enableItemDrag?: boolean;
  /** Whether data is loading (skeleton shows only while there are no tasks) */
  isLoading?: boolean;
  /**
   * Failed load. Wins over the empty state — never shows
   * empty chrome.
   */
  error?: boolean | string | Error | ReactNode | null;
  /** Retry handler for the default error UI. */
  onRetry?: () => void;
  /** Title for the default empty state */
  emptyTitle?: string;
  /** Description for the default empty state */
  emptyDescription?: string;
  /** Height of the chart in pixels (default steps with the size knob) */
  height?: number;
  /** Width of the task-label column in pixels (default: 180) */
  labelWidth?: number;
  /** Show the today line (default: true) */
  showToday?: boolean;
  /** Show the "Today" scroll button (default: true) */
  showNavigation?: boolean;
  /** Show the zoom-level switcher (default: true) */
  showZoomSwitcher?: boolean;
  /** First day of week for week alignment: 0 = Sunday, 1 = Monday (default: 0) */
  firstDayOfWeek?: 0 | 1;
  /** Date scrolled into view on mount (defaults to today) */
  initialDate?: Date;
  /**
   * Controlled marker date — a playhead the caller owns.
   *
   * Independent of both `showToday`, which pins a line to the real today and
   * cannot move, and `initialDate`, which only picks the mount scroll
   * position. Set it and a marker line paints across the axis and the rows
   * with a grab handle on the axis; leave it unset and nothing renders. The
   * component never moves it on its own — it draws exactly the date it is
   * given, which is what makes an as-of view possible.
   */
  markerDate?: Date;
  /**
   * Called when the marker is scrubbed: drag its axis handle, or focus the
   * handle and press ArrowLeft/ArrowRight (Shift = 7 days). Fires per whole
   * day crossed, not per pointer move, and Escape mid-drag fires once more
   * with the date the drag started from.
   */
  onMarkerDateChange?: (date: Date) => void;
  /**
   * Enable scrubbing the marker (default: enabled when `onMarkerDateChange`
   * is provided). A marker with no callback still renders, read-only.
   */
  enableMarkerDrag?: boolean;
  /** Accessible name for the marker handle (default: "Marker"). */
  markerLabel?: string;
}

/**
 * The spans a row draws, in paint order.
 *
 * A task with no `spans` IS its own single span and takes the task id as its
 * key, so every data attribute, drag session and callback on the
 * one-bar-per-row path is exactly what it was before `spans` existed.
 */
/** The span as a closed duration, or null when either bound is open. */
function boundedSpan(ref: GanttSpanRef): GanttSpan | null {
  const span = ref.span;
  return isBoundedSpan(span) ? { start: span.start, end: span.end } : null;
}

function resolveSpans(task: GanttTask): GanttSpanRef[] {
  const list = task.spans;
  if (!list || list.length === 0) {
    return [{ span: task, index: 0, key: task.id }];
  }
  return list.map((span, index) => ({ span, index, key: span.id ?? `${task.id}#${index}` }));
}

// ── Interaction constants (gesture recognition, not animation timing) ──

/** Pixels of pointer travel before a press becomes a drag (clicks stay clicks below this). */
const DRAG_THRESHOLD_PX = 4;
/** Touch pointers lift after a hold instead of a travel threshold. */
const TOUCH_LONG_PRESS_MS = 300;
/** Touch travel allowed before a pending long-press yields to scrolling. */
const TOUCH_SLOP_PX = 8;

/**
 * Inline-END hairline rule for the label column edge (same SB-M-1215 pattern
 * as Calendar/Sidebar: tamagui's RN `borderEndWidth` does not compile to
 * working CSS on web, so web takes CSS logical props + the low-DPI fallback
 * class; native takes the RN logical prop).
 */
const hairlineEnd = isWeb
  ? {
      borderInlineEndWidth: hairlineWidth,
      borderInlineEndStyle: 'solid' as any,
      className: 'mp-hairline-ie',
    }
  : { borderEndWidth: hairlineWidth };

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function clampProgress(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  return Math.min(100, Math.max(0, value));
}

/** Month bands for the dual-level axis (Frappe Gantt upper header). */
function monthBands(range: GanttRange, pxPerDay: number): { x: number; width: number; label: string; key: string }[] {
  const total = rangeDays(range);
  const bands: { x: number; width: number; label: string; key: string }[] = [];
  let i = 0;
  while (i < total) {
    const date = addDays(startOfDay(range.start), i);
    const nextMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1);
    const endIdx = Math.min(total, Math.max(i + 1, dayDiff(range.start, nextMonth)));
    bands.push({
      x: i * pxPerDay,
      width: (endIdx - i) * pxPerDay,
      label: formatMonthYear(date),
      key: `${date.getFullYear()}-${date.getMonth()}`,
    });
    i = endIdx;
  }
  return bands;
}

function weekendColumns(range: GanttRange, pxPerDay: number): { x: number; width: number; key: string }[] {
  const total = rangeDays(range);
  const cols: { x: number; width: number; key: string }[] = [];
  for (let i = 0; i < total; i++) {
    const date = addDays(startOfDay(range.start), i);
    if (!isWeekend(date)) {
      continue;
    }
    cols.push({
      x: i * pxPerDay,
      width: pxPerDay,
      key: date.toISOString(),
    });
  }
  return cols;
}

// ── Loading skeleton (mirrors the real anatomy) ────────

/** Deterministic per-index bar offsets/widths (never Math.random). */
const SKELETON_BARS = [
  { x: 24, width: 120 },
  { x: 96, width: 180 },
  { x: 180, width: 140 },
  { x: 64, width: 220 },
  { x: 240, width: 110 },
] as const;

function GanttSkeleton({ labelWidth, rowHeight }: { labelWidth: number; rowHeight: number }) {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  const edgePad = knobProps.panelPadding.padding;
  return (
    <YStack width="100%" aria-busy aria-label={t('Loading')} {...{ 'data-gantt-skeleton': 'true' }}>
      <XStack height={rowHeight} alignItems="center" {...hairline.bottom} borderColor="$borderColor">
        <XStack width={labelWidth} paddingHorizontal={edgePad}>
          <Skeleton width={64} height={12} />
        </XStack>
        <Skeleton width={220} height={12} />
      </XStack>
      {SKELETON_BARS.map((bar, i) => (
        <XStack
          key={i}
          height={rowHeight}
          alignItems="center"
          {...(i < SKELETON_BARS.length - 1 ? hairline.bottom : null)}
          borderColor={componentColors.divider}>
          <XStack width={labelWidth} paddingHorizontal={edgePad}>
            <Skeleton width={i % 2 === 0 ? 96 : 72} height={12} />
          </XStack>
          <YStack paddingLeft={bar.x}>
            <Skeleton variant="rounded" width={bar.width} height={Math.max(10, rowHeight - 20)} />
          </YStack>
        </XStack>
      ))}
    </YStack>
  );
}

// ── Bar fill resolution ───────────────────────────────────────

/**
 * Semantic intents ride their hue sub-theme (`<Intent name>` → `$color9`,
 * tint-independent); the default/accent identity stays on the base
 * theme's `$accentBackground`. Explicit `color` values pass through
 * untouched — they are values, not chrome (Axiom 11).
 */
function BarIntentWrap({ intent, children }: { intent?: GanttTask['intent']; children: ReactNode }) {
  if (!intent || intent === 'accent') {
    return <>{children}</>;
  }
  return <Intent name={intent}>{children}</Intent>;
}

/** Title ink on a filled bar — paper or ink, whichever clears AA on the fill. */
function GanttBarLabel({ title, fill }: { title: string; fill: string }) {
  const { knobProps } = useResolvedKnobs();
  const ink = useReadableTextOn(fill);
  return (
    <Text
      color={ink ?? '$color1'}
      {...knobProps.label}
      numberOfLines={1}
      paddingHorizontal={knobProps.control.paddingHorizontal}
      pointerEvents="none"
      zIndex={1}
      aria-hidden>
      {`${title}\u200b`}
    </Text>
  );
}

/** Open-end mark: the bar label's ink, so it reads on every fill. */
function GanttOpenEdgeMark({
  fill,
  glyph,
  side,
  edge,
}: {
  fill: string;
  glyph: string;
  side: { left: number } | { right: number };
  edge: 'start' | 'end';
}) {
  const { knobProps } = useResolvedKnobs();
  const ink = useReadableTextOn(fill);
  return (
    <Text
      position="absolute"
      {...side}
      {...knobProps.label}
      color={ink ?? '$color12'}
      opacity={0.75}
      pointerEvents="none"
      aria-hidden
      {...{ [`data-gantt-open-${edge}`]: 'true' }}>
      {glyph}
    </Text>
  );
}

/** Row-identity label: selected fill gets readable on-accent ink. */
function GanttTaskName({ title, selected, body }: { title: string; selected: boolean; body: object }) {
  const ink = useReadableTextOn(selected ? '$accentBackground' : undefined);
  return (
    <Text {...body} numberOfLines={1} color={selected && ink ? ink : '$color'}>
      {title}
    </Text>
  );
}

// ── GanttView ─────────────────────────────────────────────────

/**
 * Generic Gantt view: one row per task, a horizontal time axis with
 * day/week/month zoom levels, duration bars positioned from start/end dates,
 * and a today line. Bars press to `onItemPress`; with `onItemMove` they drag
 * horizontally with 1:1 pointer tracking (A-GESTURE), a snapped drop preview
 * and live date label, and whole-day snapping on release (the commit
 * jump tweens on web). Focused bars also reschedule from the keyboard
 * (ArrowLeft/ArrowRight = 1 day, Shift+Arrow = 7 days — an aria-live region
 * announces the new range), and edge handles resize start/end independently
 * with the same snapped-preview + Escape-cancel semantics (web pointer;
 * native resize deferred). Loading / empty / error are honest first-class
 * states (Axiom 6) via AsyncBoundary.
 *
 * The time axis stays pinned while rows scroll vertically (labels and rows
 * share one vertical scroller so alignment is structural); the label column
 * stays pinned while the canvas scrolls horizontally — the axis strip is a
 * scroll-follower synchronized with the canvas scroller, which works on web
 * and native alike.
 *
 * Under RTL (`useDirection()`), the timeline mirrors: time flows
 * right→left, the axis/bars/today line reflect, and drag/keyboard deltas
 * invert so "toward earlier dates" always matches the visual direction.
 * Native RTL follows `I18nManager` (best-effort — not device-verified).
 *
 * Three things make it a TRACK view as well as a schedule. A span's bounds
 * are both optional, and the missing side paints as an uncapped edge (or, with
 * neither bound, a half-height rail) instead of an invented date. A row can
 * carry SEVERAL spans via `task.spans`, so one subject that ships a variant
 * per period reads as one row. And `markerDate` is a controlled playhead the
 * caller owns — scrubbed by dragging its handle on the axis or by arrows on
 * the focused handle, reported through `onMarkerDateChange` — independent of
 * the today line, which stays pinned to the real today.
 *
 * @example
 * ```tsx
 * <GanttView
 *   tasks={tasks}
 *   zoom="week"
 *   onItemPress={(task) => openTask(task)}
 *   onItemMove={(task, range) => reschedule(task, range)}
 * />
 * ```
 *
 * @example A track view: open-ended spans, several per row, a scrubbed marker.
 * ```tsx
 * <GanttView
 *   tasks={[
 *     { id: "fed", title: "Federal true-up", spans: [
 *       { id: "2026", start: jan(2026), end: dec(2026) },
 *       { id: "2027", start: jan(2027), end: dec(2027) },
 *     ] },
 *     { id: "vat", title: "VAT", start: jan(2025) },   // no end: open at the end
 *     { id: "base", title: "Base policy" },            // no dates: a rail
 *   ]}
 *   markerDate={asOf}
 *   onMarkerDateChange={setAsOf}
 * />
 * ```
 */
export function GanttView({
  tasks,
  zoom: initialZoom = 'week',
  onZoomChange,
  onItemPress,
  onItemMove,
  enableItemDrag,
  isLoading = false,
  error = null,
  onRetry,
  emptyTitle,
  emptyDescription,
  height: heightProp,
  labelWidth = 180,
  showToday = true,
  showNavigation = true,
  showZoomSwitcher = true,
  firstDayOfWeek = 0,
  initialDate,
  markerDate,
  onMarkerDateChange,
  enableMarkerDrag,
  markerLabel,
  ...stackProps
}: GanttViewProps) {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  const [zoom, setZoom] = useState<GanttZoom>(initialZoom);
  if (typeof document !== 'undefined') {
    ensureKeyboardModalityTracking();
  }

  // ── Direction (RTL mirrors the canvas; deltas invert) ────────────────────
  const rtl = useDirection() === 'rtl';
  // Physical→logical sign: +1 physical-right is "later" in LTR, "earlier" in RTL.
  const dirSign = rtl ? -1 : 1;
  const dirSignRef = useRef(dirSign);
  dirSignRef.current = dirSign;
  /** Mirror an LTR canvas offset: same value anchored from the other edge. */
  const canvasPos = useCallback((x: number) => (rtl ? { right: x } : { left: x }), [rtl]);

  // Keyboard-reschedule announcements (Kanban/TreeView announcer pattern).
  const [announcement, setAnnouncement] = useState('');
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [focusedBarId, setFocusedBarId] = useState<string | null>(null);
  const [barKeyboardRing, setBarKeyboardRing] = useState(false);

  // ── Knob-derived geometry (size/space step the density) ──────────
  const sz = knobProps.sizeToken;
  const height = heightProp ?? (sz === '$3' ? 400 : sz === '$5' ? 560 : 480);
  // Row paint is the press target: never below 44px, even at compact.
  const rowHeight = Math.max(MIN_PRESS_TARGET, sz === '$3' ? 44 : sz === '$5' ? 56 : 48);
  // Dual-level axis (month band + day numbers) — Frappe Gantt upper/lower header.
  const axisHeight = sz === '$3' ? 40 : sz === '$5' ? 52 : 46;
  const pxPerDay =
    zoom === 'day'
      ? sz === '$3'
        ? 48
        : sz === '$5'
          ? 80
          : 64
      : zoom === 'week'
        ? sz === '$3'
          ? 18
          : sz === '$5'
            ? 30
            : 24
        : sz === '$3'
          ? 6
          : sz === '$5'
            ? 10
            : 8;
  const space = knobProps.space;
  const barInset = space === 'small' ? 4 : space === 'large' ? 9 : 6;
  const barHeight = Math.max(10, rowHeight - barInset * 2);
  // An eternal span is a RAIL, not a bar: half the height, no caps. The
  // shape is the message — a full-width capped bar would put two chosen-
  // looking edges on the chart's own padding.
  const railHeight = Math.max(4, Math.round(barHeight / 2));
  const transition = knobProps.transition;
  // Layout props (left) only tween on web — the RN driver cannot animate
  // layout, so native keeps committed jumps instant (Axiom 4 note).
  const webLayoutTransition = isWeb ? transition : undefined;

  // ── Chart range + axis ───────────────────────────────────────────────────
  // Every span on every row, in one flat list. Open spans contribute only
  // the date they actually name (an eternal one contributes nothing, so it
  // cannot stretch the axis), and the marker joins them so it always has
  // somewhere to land — the same courtesy computeGanttRange pays today.
  const spans = useMemo<GanttSpan[]>(() => {
    const flat: GanttOpenSpan[] = [];
    for (const task of tasks) {
      for (const ref of resolveSpans(task)) {
        flat.push(ref.span);
      }
    }
    if (markerDate !== undefined) {
      flat.push({ start: markerDate, end: markerDate });
    }
    return openSpanExtents(flat);
  }, [tasks, markerDate]);
  const range = useMemo(
    () => computeGanttRange(spans, zoom, new Date(), firstDayOfWeek),
    [spans, zoom, firstDayOfWeek],
  );
  const chartWidth = rangeDays(range) * pxPerDay;
  const ticks = useMemo(
    () => generateTicks(range, zoom, pxPerDay, firstDayOfWeek),
    [range, zoom, pxPerDay, firstDayOfWeek],
  );
  const todayX = showToday ? todayLineX(range, pxPerDay) : null;
  const rangeLabel = useMemo(() => formatRangeLabel(range), [range]);
  const months = useMemo(() => monthBands(range, pxPerDay), [range, pxPerDay]);
  const weekends = useMemo(() => weekendColumns(range, pxPerDay), [range, pxPerDay]);
  const todayColX = showToday ? dateToX(startOfDay(new Date()), range.start, pxPerDay) : null;

  const changeZoom = useCallback(
    (next: GanttZoom) => {
      setZoom(next);
      onZoomChange?.(next);
    },
    [onZoomChange],
  );

  // ── Scroll-to-date (mount + Today button) + pinned-axis sync ─────────────
  const hScrollRef = useRef<any>(null);
  const axisScrollRef = useRef<any>(null);
  const canvasViewportRef = useRef<number | null>(null);
  // Re-anchor in either direction once the canvas viewport has been measured.
  const pendingAnchorRef = useRef<Date | null>(null);

  const scrollToDate = useCallback(
    (date: Date, animated: boolean) => {
      const viewportWidth = canvasViewportRef.current;
      if (viewportWidth === null) {
        pendingAnchorRef.current = date;
      }
      const x = scrollAnchorX(date, range.start, pxPerDay, {
        labelWidth,
        chartWidth,
        viewportWidth,
        rtl,
      });
      hScrollRef.current?.scrollTo?.({ x, animated });
      // Keep the pinned axis strip in step even where programmatic scrolls
      // don't emit onScroll.
      axisScrollRef.current?.scrollTo?.({ x, animated: false });
    },
    [range.start, pxPerDay, labelWidth, rtl, chartWidth],
  );
  const scrollToDateRef = useRef(scrollToDate);
  scrollToDateRef.current = scrollToDate;

  useEffect(() => {
    // Land near the interesting period instead of the padded range start.
    scrollToDateRef.current(initialDate ?? new Date(), false);
    // Re-anchor when the scale changes (zoom flip re-lays the whole canvas)
    // or the direction flips (the whole canvas mirrors).
  }, [zoom, initialDate, rtl]);

  /** Canvas scroll drives the pinned axis strip (follower is not scrollable). */
  const handleCanvasScroll = useCallback((event: any) => {
    const x = event?.nativeEvent?.contentOffset?.x ?? 0;
    axisScrollRef.current?.scrollTo?.({ x, animated: false });
  }, []);

  const handleCanvasLayout = useCallback((event: any) => {
    const width = event?.nativeEvent?.layout?.width;
    if (typeof width !== 'number' || !Number.isFinite(width) || width <= 0) {
      return;
    }
    canvasViewportRef.current = width;
    const pending = pendingAnchorRef.current;
    if (pending) {
      pendingAnchorRef.current = null;
      scrollToDateRef.current(pending, false);
    }
  }, []);

  // ── Bar drag (web pointer session / native responder) ────────────────────
  const dragEnabled = (enableItemDrag ?? onItemMove !== undefined) && onItemMove !== undefined;
  const hasDom = isWeb && typeof window !== 'undefined' && typeof document !== 'undefined';
  const webDragEnabled = dragEnabled && hasDom;
  const nativeDragEnabled = dragEnabled && !isWeb;

  // Sessions key on the SPAN key, not the task id — a row can carry several
  // spans and only the grabbed one moves. For a single-span row the span key
  // IS the task id, so this is the same value it always was.
  const [drag, setDrag] = useState<{ key: string; dx: number; dayDelta: number } | null>(null);
  // Edge-resize session (web pointer only): logicalDx is clamped so the bar
  // never shrinks below one inclusive day.
  const [resize, setResize] = useState<{
    key: string;
    edge: GanttResizeEdge;
    logicalDx: number;
    dayDelta: number;
  } | null>(null);
  // Set after a drag ends so the trailing click doesn't fire onItemPress.
  const suppressClickRef = useRef(false);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const nativeSessionRef = useRef<{
    task: GanttTask;
    ref: GanttSpanRef;
    span: GanttSpan;
    startX: number;
    dragging: boolean;
    liftTimer: ReturnType<typeof setTimeout> | null;
  } | null>(null);

  useEffect(() => () => dragCleanupRef.current?.(), []);

  const suppressNextClick = useCallback(() => {
    suppressClickRef.current = true;
    setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  }, []);

  const commitDrag = useCallback(
    (task: GanttTask, ref: GanttSpanRef, span: GanttSpan, dayDelta: number) => {
      if (dayDelta !== 0) {
        onItemMove?.(task, shiftSpanByDays(span, dayDelta), ref);
      }
    },
    [onItemMove],
  );

  // Web: window-level pointer session with travel threshold (mouse/pen) or
  // long-press (touch) activation and Escape cancellation — the Calendar
  // view's session contract, reduced to a single horizontal axis.
  const handleBarPointerDown = useCallback(
    (
      task: GanttTask,
      ref: GanttSpanRef,
      e: {
        button?: number;
        clientX: number;
        clientY: number;
        pointerType?: string;
        stopPropagation?: () => void;
      },
    ) => {
      if (!webDragEnabled) {
        return;
      }
      const span = boundedSpan(ref);
      if (!span) {
        return;
      }
      if (e.button !== undefined && e.button !== 0) {
        return;
      }
      e.stopPropagation?.();
      dragCleanupRef.current?.();

      const isTouch = e.pointerType === 'touch';
      const startX = e.clientX;
      const startY = e.clientY;
      let active = false;
      let ended = false;
      let liftArmed = !isTouch;
      let prevUserSelect = '';
      let longPressTimer: ReturnType<typeof setTimeout> | null = null;

      // Pointer dx is physical; the day delta is logical (inverts under RTL).
      const toDayDelta = (dx: number) => dirSignRef.current * dxToDayDelta(dx, pxPerDay);

      const activate = (dx: number) => {
        if (active) {
          return;
        }
        active = true;
        prevUserSelect = document.body.style.userSelect;
        document.body.style.userSelect = 'none';
        setDrag({ key: ref.key, dx, dayDelta: toDayDelta(dx) });
      };

      const teardown = () => {
        if (ended) {
          return;
        }
        ended = true;
        if (longPressTimer) {
          clearTimeout(longPressTimer);
        }
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('keydown', onKey, true);
        if (active) {
          document.body.style.userSelect = prevUserSelect;
        }
        setDrag(null);
        dragCleanupRef.current = null;
      };

      const onMove = (me: PointerEvent) => {
        const dx = me.clientX - startX;
        if (!active) {
          const travel = Math.hypot(me.clientX - startX, me.clientY - startY);
          if (isTouch && !liftArmed) {
            // Still waiting on the long press — a real swipe yields to scrolling.
            if (travel > TOUCH_SLOP_PX) {
              teardown();
            }
            return;
          }
          if (travel < DRAG_THRESHOLD_PX) {
            return;
          }
          activate(dx);
          return;
        }
        setDrag({ key: ref.key, dx, dayDelta: toDayDelta(dx) });
      };

      const onUp = (ue: PointerEvent) => {
        const wasActive = active;
        const dayDelta = toDayDelta(ue.clientX - startX);
        teardown();
        if (!wasActive) {
          return;
        }
        suppressNextClick();
        commitDrag(task, ref, span, dayDelta);
      };

      const onKey = (ke: KeyboardEvent) => {
        if (ke.key !== 'Escape' || !active) {
          return;
        }
        ke.stopPropagation();
        teardown();
        // Escape cancel: pointer is still down — keep suppressing until release.
        suppressClickRef.current = true;
        window.addEventListener(
          'pointerup',
          () =>
            setTimeout(() => {
              suppressClickRef.current = false;
            }, 0),
          { once: true },
        );
      };

      if (isTouch) {
        longPressTimer = setTimeout(() => {
          liftArmed = true;
          activate(0);
        }, TOUCH_LONG_PRESS_MS);
      }

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('keydown', onKey, true);
      dragCleanupRef.current = teardown;
    },
    [webDragEnabled, pxPerDay, commitDrag, suppressNextClick],
  );

  // Native: responder-based horizontal drag. The move is a pure dx→dayDelta
  // mapping (no hit-testing needed), so this is a full best-effort path —
  // scroll locks once the drag activates.
  const handleNativeGrant = useCallback(
    (task: GanttTask, ref: GanttSpanRef, e: { nativeEvent?: { pageX?: number } }) => {
      if (!nativeDragEnabled) {
        return;
      }
      const span = boundedSpan(ref);
      if (!span) {
        return;
      }
      // Long-press lift (Kanban/Calendar parity): a stationary hold arms the
      // drag and locks scroll BEFORE any movement, because on iOS the
      // ScrollView's pan gesture is recognized natively and would win any
      // move-threshold race against the JS responder system.
      const session = {
        task,
        ref,
        span,
        startX: e.nativeEvent?.pageX ?? 0,
        dragging: false,
        liftTimer: null as ReturnType<typeof setTimeout> | null,
      };
      session.liftTimer = setTimeout(() => {
        session.liftTimer = null;
        if (nativeSessionRef.current !== session) {
          return;
        }
        session.dragging = true;
        setDrag({ key: ref.key, dx: 0, dayDelta: 0 });
      }, TOUCH_LONG_PRESS_MS);
      nativeSessionRef.current = session;
    },
    [nativeDragEnabled],
  );

  const handleNativeMove = useCallback(
    (e: { nativeEvent?: { pageX?: number } }) => {
      const session = nativeSessionRef.current;
      if (!session) {
        return;
      }
      const dx = (e.nativeEvent?.pageX ?? 0) - session.startX;
      if (!session.dragging) {
        // Pre-lift movement = scroll intent: cancel the pending lift and yield
        // (the termination request then returns true, freeing the ScrollView).
        if (Math.abs(dx) >= TOUCH_SLOP_PX) {
          if (session.liftTimer) {
            clearTimeout(session.liftTimer);
          }
          nativeSessionRef.current = null;
        }
        return;
      }
      setDrag({
        key: session.ref.key,
        dx,
        dayDelta: dirSignRef.current * dxToDayDelta(dx, pxPerDay),
      });
    },
    [pxPerDay],
  );

  const handleNativeRelease = useCallback(
    (e: { nativeEvent?: { pageX?: number } }) => {
      const session = nativeSessionRef.current;
      nativeSessionRef.current = null;
      if (!session) {
        return;
      }
      if (session.liftTimer) {
        clearTimeout(session.liftTimer);
      }
      if (!session.dragging) {
        // Treat as a tap — responders steal onPress when drag is enabled.
        onItemPress?.(session.task);
        return;
      }
      const dayDelta = dirSignRef.current * dxToDayDelta((e.nativeEvent?.pageX ?? 0) - session.startX, pxPerDay);
      setDrag(null);
      commitDrag(session.task, session.ref, session.span, dayDelta);
    },
    [onItemPress, pxPerDay, commitDrag],
  );

  const handleNativeTerminate = useCallback(() => {
    const session = nativeSessionRef.current;
    if (session?.liftTimer) {
      clearTimeout(session.liftTimer);
    }
    nativeSessionRef.current = null;
    setDrag(null);
  }, []);

  // Web edge-resize session: same activation threshold, Escape-cancel, and
  // snapped-preview semantics as the move drag (the live edge tracks
  // the pointer 1:1, the preview shows the whole-day commit). Native resize
  // is deferred (handles render on web only).
  const handleResizePointerDown = useCallback(
    (
      task: GanttTask,
      ref: GanttSpanRef,
      edge: GanttResizeEdge,
      e: {
        button?: number;
        clientX: number;
        clientY: number;
        stopPropagation?: () => void;
      },
    ) => {
      if (!webDragEnabled) {
        return;
      }
      const span = boundedSpan(ref);
      if (!span) {
        return;
      }
      if (e.button !== undefined && e.button !== 0) {
        return;
      }
      // A handle press must not start a whole-bar move session.
      e.stopPropagation?.();
      dragCleanupRef.current?.();

      const maxShrinkPx = (spanInclusiveDays(span) - 1) * pxPerDay;
      const startX = e.clientX;
      const sign = dirSignRef.current;
      let active = false;
      let ended = false;
      let prevUserSelect = '';

      const clampLogicalDx = (dx: number) => {
        const logicalDx = dx * sign;
        return edge === 'start' ? Math.min(logicalDx, maxShrinkPx) : Math.max(logicalDx, -maxShrinkPx);
      };

      const toDayDelta = (dx: number) => clampResizeDayDelta(span, edge, dxToDayDelta(clampLogicalDx(dx), pxPerDay));

      const teardown = () => {
        if (ended) {
          return;
        }
        ended = true;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('keydown', onKey, true);
        if (active) {
          document.body.style.userSelect = prevUserSelect;
        }
        setResize(null);
        dragCleanupRef.current = null;
      };

      const onMove = (me: PointerEvent) => {
        const dx = me.clientX - startX;
        if (!active) {
          if (Math.abs(dx) < DRAG_THRESHOLD_PX) {
            return;
          }
          active = true;
          prevUserSelect = document.body.style.userSelect;
          document.body.style.userSelect = 'none';
        }
        setResize({ key: ref.key, edge, logicalDx: clampLogicalDx(dx), dayDelta: toDayDelta(dx) });
      };

      const onUp = (ue: PointerEvent) => {
        const wasActive = active;
        const dayDelta = toDayDelta(ue.clientX - startX);
        teardown();
        if (!wasActive) {
          return;
        }
        suppressNextClick();
        if (dayDelta !== 0) {
          onItemMove?.(task, resizeSpanByDays(span, edge, dayDelta), ref);
        }
      };

      const onKey = (ke: KeyboardEvent) => {
        if (ke.key !== 'Escape' || !active) {
          return;
        }
        ke.stopPropagation();
        teardown();
        // Escape cancel: pointer is still down — keep suppressing until release.
        suppressClickRef.current = true;
        window.addEventListener(
          'pointerup',
          () =>
            setTimeout(() => {
              suppressClickRef.current = false;
            }, 0),
          { once: true },
        );
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('keydown', onKey, true);
      dragCleanupRef.current = teardown;
    },
    [webDragEnabled, pxPerDay, onItemMove, suppressNextClick],
  );

  const getBarDragProps = useCallback(
    (task: GanttTask, ref: GanttSpanRef): Record<string, unknown> => {
      // An open-ended span has no second edge to hold a duration against, so
      // it gets no session at all rather than a drag that invents one.
      if (!boundedSpan(ref)) {
        return {};
      }
      if (webDragEnabled) {
        return {
          onPointerDown: (e: any) => {
            handleBarPointerDown(task, ref, e);
          },
        };
      }
      if (nativeDragEnabled) {
        return {
          // Claim the touch so moves continue outside the bar (ScrollView-safe once dragging).
          onStartShouldSetResponder: () => true,
          onMoveShouldSetResponder: () => true,
          onResponderTerminationRequest: () => !nativeSessionRef.current?.dragging,
          onResponderGrant: (e: any) => {
            handleNativeGrant(task, ref, e);
          },
          onResponderMove: handleNativeMove,
          onResponderRelease: handleNativeRelease,
          onResponderTerminate: handleNativeTerminate,
        };
      }
      return {};
    },
    [
      webDragEnabled,
      nativeDragEnabled,
      handleBarPointerDown,
      handleNativeGrant,
      handleNativeMove,
      handleNativeRelease,
      handleNativeTerminate,
    ],
  );

  // ── Keyboard rescheduling (focused bar, discrete jumps) ──────────
  const handleBarKeyboardMove = useCallback(
    (task: GanttTask, ref: GanttSpanRef, key: 'ArrowLeft' | 'ArrowRight', shiftKey: boolean) => {
      const span = boundedSpan(ref);
      if (!span) {
        return;
      }
      const physical = key === 'ArrowRight' ? 1 : -1;
      // Physical arrow direction maps to a logical day delta (inverts in RTL).
      const dayDelta = physical * dirSignRef.current * (shiftKey ? 7 : 1);
      const next = shiftSpanByDays(span, dayDelta);
      onItemMove?.(task, next, ref);
      setAnnouncement(
        withInterp(t('{{title}} moved to {{range}}'), {
          title: ref.span.title ?? task.title,
          range: formatSpanLabel(next),
        }),
      );
    },
    [onItemMove, t],
  );

  // ── Controlled marker (a playhead the caller owns) ───────────────────────
  const markerDragEnabled = (enableMarkerDrag ?? onMarkerDateChange !== undefined) && onMarkerDateChange !== undefined;
  const [markerDragging, setMarkerDragging] = useState(false);
  // The date the scrub STARTED from. Every emitted date is that date plus a
  // whole-day delta, never the last emitted one — otherwise a controlled
  // caller that applies each scrub would compound its own updates.
  const markerGrantRef = useRef<Date | null>(null);
  const markerEmittedRef = useRef<number | null>(null);
  const markerSessionRef = useRef<{ startX: number } | null>(null);

  /** Emit a whole-day offset from the grant date, once per day crossed. */
  const emitMarker = useCallback(
    (dayDelta: number) => {
      const base = markerGrantRef.current;
      if (!base) {
        return;
      }
      const next = addDays(base, dayDelta);
      if (markerEmittedRef.current === next.getTime()) {
        return;
      }
      markerEmittedRef.current = next.getTime();
      onMarkerDateChange?.(next);
    },
    [onMarkerDateChange],
  );

  const openMarkerSession = useCallback(() => {
    if (markerDate === undefined) {
      return false;
    }
    const base = startOfDay(markerDate);
    markerGrantRef.current = base;
    markerEmittedRef.current = base.getTime();
    return true;
  }, [markerDate]);

  // Web: the bar drag's session contract on a single control — travel
  // threshold, 1:1 tracking, Escape restores the date the drag started from.
  const handleMarkerPointerDown = useCallback(
    (e: { button?: number; clientX: number; stopPropagation?: () => void }) => {
      if (!markerDragEnabled || !hasDom) {
        return;
      }
      if (e.button !== undefined && e.button !== 0) {
        return;
      }
      if (!openMarkerSession()) {
        return;
      }
      e.stopPropagation?.();
      dragCleanupRef.current?.();

      const startX = e.clientX;
      let active = false;
      let ended = false;
      let prevUserSelect = '';
      const toDayDelta = (dx: number) => dirSignRef.current * dxToDayDelta(dx, pxPerDay);

      const teardown = () => {
        if (ended) {
          return;
        }
        ended = true;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('keydown', onKey, true);
        if (active) {
          document.body.style.userSelect = prevUserSelect;
        }
        setMarkerDragging(false);
        markerGrantRef.current = null;
        dragCleanupRef.current = null;
      };

      const onMove = (me: PointerEvent) => {
        const dx = me.clientX - startX;
        if (!active) {
          if (Math.abs(dx) < DRAG_THRESHOLD_PX) {
            return;
          }
          active = true;
          prevUserSelect = document.body.style.userSelect;
          document.body.style.userSelect = 'none';
          setMarkerDragging(true);
        }
        emitMarker(toDayDelta(dx));
      };

      const onUp = () => {
        teardown();
      };

      const onKey = (ke: KeyboardEvent) => {
        if (ke.key !== 'Escape' || !active) {
          return;
        }
        ke.stopPropagation();
        emitMarker(0);
        teardown();
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('keydown', onKey, true);
      dragCleanupRef.current = teardown;
    },
    [markerDragEnabled, hasDom, openMarkerSession, emitMarker, pxPerDay],
  );

  // Native: the axis strip does not scroll, so the handle can claim the touch
  // immediately — no long-press lift to arbitrate against a scroller.
  const markerNativeProps = useMemo<Record<string, unknown>>(() => {
    if (!markerDragEnabled || isWeb) {
      return {};
    }
    return {
      onStartShouldSetResponder: () => true,
      onMoveShouldSetResponder: () => true,
      onResponderTerminationRequest: () => false,
      onResponderGrant: (e: any) => {
        if (!openMarkerSession()) {
          return;
        }
        markerSessionRef.current = { startX: e?.nativeEvent?.pageX ?? 0 };
        setMarkerDragging(true);
      },
      onResponderMove: (e: any) => {
        const session = markerSessionRef.current;
        if (!session) {
          return;
        }
        const dx = (e?.nativeEvent?.pageX ?? 0) - session.startX;
        emitMarker(dirSignRef.current * dxToDayDelta(dx, pxPerDay));
      },
      onResponderRelease: () => {
        markerSessionRef.current = null;
        markerGrantRef.current = null;
        setMarkerDragging(false);
      },
      onResponderTerminate: () => {
        markerSessionRef.current = null;
        markerGrantRef.current = null;
        setMarkerDragging(false);
      },
    };
  }, [markerDragEnabled, openMarkerSession, emitMarker, pxPerDay]);

  const handleMarkerKeyboardMove = useCallback(
    (key: 'ArrowLeft' | 'ArrowRight', shiftKey: boolean) => {
      if (!markerDragEnabled || markerDate === undefined) {
        return;
      }
      const physical = key === 'ArrowRight' ? 1 : -1;
      const dayDelta = physical * dirSignRef.current * (shiftKey ? 7 : 1);
      const next = addDays(startOfDay(markerDate), dayDelta);
      markerEmittedRef.current = next.getTime();
      onMarkerDateChange?.(next);
      setAnnouncement(withInterp(t('Marker moved to {{date}}'), { date: formatAbsoluteDate(next) }));
    },
    [markerDragEnabled, markerDate, onMarkerDateChange, t],
  );

  const markerX = markerDate === undefined ? null : dateLineX(range, pxPerDay, markerDate);
  const markerName = markerLabel ?? t('Marker');

  // ── Bar rendering ─────────────────────────────────────────────────────────

  /**
   * The bar's spoken name. Bounded spans keep the exact wording they had
   * ("Design review, Mar 10 – Mar 12"); the open shapes say which end is
   * open in words, because "…" is silence to a screen reader.
   */
  const spanAccessibleName = (title: string, span: GanttOpenSpan): string => {
    if (isBoundedSpan(span)) {
      return ganttTaskAccessibleLabel({ title, start: span.start, end: span.end });
    }
    const parts = openSpanLabelParts(span);
    if (parts.start !== undefined) {
      return withInterp(t('{{title}}, from {{start}}, no end'), { title, start: parts.start });
    }
    if (parts.end !== undefined) {
      return withInterp(t('{{title}}, until {{end}}, no start'), { title, end: parts.end });
    }
    return withInterp(t('{{title}}, always, no dates'), { title });
  };

  const renderBar = (task: GanttTask, ref: GanttSpanRef) => {
    const span = ref.span;
    const barKey = ref.key;
    const bounded = boundedSpan(ref);
    const geom = openBarGeometry(span, range, pxPerDay);
    const activeDrag = drag && drag.key === barKey ? drag : null;
    const dragging = activeDrag !== null;
    const activeResize = resize && resize.key === barKey ? resize : null;
    const resizing = activeResize !== null;
    const sessionLive = dragging || resizing;
    const dayDelta = activeDrag?.dayDelta ?? activeResize?.dayDelta ?? 0;
    const previewSpan =
      bounded && activeDrag
        ? shiftSpanByDays(bounded, dayDelta)
        : bounded && activeResize
          ? resizeSpanByDays(bounded, activeResize.edge, activeResize.dayDelta)
          : null;
    const previewGeom = previewSpan ? barGeometry(previewSpan, range.start, pxPerDay) : null;
    // Live geometry: a move rides a pure transform; a resize tracks the
    // dragged edge 1:1 (the opposite edge stays put in both directions).
    const liveWidth = activeResize
      ? Math.max(
          6,
          activeResize.edge === 'end' ? geom.width + activeResize.logicalDx : geom.width - activeResize.logicalDx,
        )
      : geom.width;
    const liveTransformX = activeDrag
      ? activeDrag.dx
      : activeResize && activeResize.edge === 'start'
        ? activeResize.logicalDx * dirSign
        : 0;
    const barColor = span.color ?? task.color;
    const barIntent = span.intent ?? task.intent;
    const barTitle = span.title ?? task.title;
    const fill = barColor ?? (barIntent && barIntent !== 'accent' ? '$color9' : '$accentBackground');
    // Progress is a fraction of a DURATION; an open span has none, so a bar
    // that claimed 40% of forever would be inventing the denominator.
    const progress = bounded ? clampProgress(span.progress ?? task.progress) : null;
    const showLabel = !geom.eternal && liveWidth >= 44;
    const isBarFocused = focusedBarId === barKey;
    const showHandles = hoveredId === task.id || sessionLive;
    // Edge handles map physical sides to logical edges (mirrored under RTL).
    const handleWidth = bounded ? (geom.width >= 24 ? 8 : geom.width >= 12 ? 4 : 0) : 0;
    const physicalLeftEdge: GanttResizeEdge = rtl ? 'end' : 'start';
    const physicalRightEdge: GanttResizeEdge = rtl ? 'start' : 'end';
    // An open END is physically on the right in LTR and on the left in RTL —
    // the chevron follows the mirror, and so does which glyph it is.
    const openStartSide = rtl ? { right: 2 } : { left: 2 };
    const openEndSide = rtl ? { left: 2 } : { right: 2 };
    const squareStart = rtl
      ? { borderTopRightRadius: 0, borderBottomRightRadius: 0 }
      : { borderTopLeftRadius: 0, borderBottomLeftRadius: 0 };
    const squareEnd = rtl
      ? { borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }
      : { borderTopRightRadius: 0, borderBottomRightRadius: 0 };
    const height = geom.eternal ? railHeight : barHeight;

    return (
      <BarIntentWrap key={barKey} intent={barColor ? undefined : barIntent}>
        {/* Snapped drop preview (the raw bar tracks the pointer 1:1). */}
        {sessionLive && dayDelta !== 0 && previewGeom && (
          <YStack
            position="absolute"
            {...canvasPos(previewGeom.x)}
            width={previewGeom.width}
            top={barInset}
            height={barHeight}
            {...knobProps.borderRadius}
            borderWidth={knobProps.inputSurface.borderWidth}
            borderColor="$accentColor"
            backgroundColor="$accentBackground"
            opacity={0.25}
            pointerEvents="none"
            {...{ 'data-gantt-drop-preview': barKey }}
          />
        )}
        <YStack
          position="absolute"
          {...canvasPos(geom.x)}
          width={liveWidth}
          top={barInset + (barHeight - height) / 2}
          height={height}
          x={liveTransformX}
          zIndex={sessionLive ? 3 : 1}
          {...knobProps.borderRadius}
          {...(geom.openStart ? squareStart : null)}
          {...(geom.openEnd ? squareEnd : null)}
          backgroundColor={fill as any}
          // A rail reads as chrome, not as a duration somebody set.
          opacity={sessionLive ? 0.85 : geom.eternal ? 0.55 : 1}
          hoverStyle={{ opacity: sessionLive ? 0.85 : geom.eternal ? 0.7 : 0.9 }}
          pressStyle={{ opacity: 0.8 }}
          cursor={bounded && webDragEnabled ? 'grab' : onItemPress ? 'pointer' : undefined}
          justifyContent="center"
          // Committed/reverted geometry jumps tween on web; the live
          // drag/resize tracking stays 1:1 (no transition while the session
          // is live).
          transition={(sessionLive ? undefined : webLayoutTransition) as any}
          role="button"
          tabIndex={0}
          aria-label={spanAccessibleName(barTitle, span)}
          // One ring on the bar (the perceived control), keyboard-only.
          {...(isBarFocused && barKeyboardRing ? keyboardFocusRingProps : { outlineWidth: 0 })}
          onFocus={() => {
            setFocusedBarId(barKey);
            setBarKeyboardRing(wasKeyboardFocus());
          }}
          onBlur={() => {
            setFocusedBarId((id) => (id === barKey ? null : id));
            setBarKeyboardRing(false);
          }}
          // Tamagui forwards onHoverIn/onHoverOut at runtime; the RN-flavored
          // View prop type omits them (house Record cast).
          {...({
            onHoverIn: () => {
              setHoveredId(task.id);
            },
            onHoverOut: () => {
              setHoveredId((id) => (id === task.id ? null : id));
            },
          } as Record<string, unknown>)}
          onKeyDown={
            ((ke: any) => {
              if (ke.key === 'Enter' || ke.key === ' ') {
                ke.preventDefault?.();
                ke.stopPropagation?.();
                onItemPress?.(task);
                return;
              }
              if ((ke.key === 'ArrowLeft' || ke.key === 'ArrowRight') && dragEnabled && bounded) {
                ke.preventDefault?.();
                ke.stopPropagation?.();
                handleBarKeyboardMove(task, ref, ke.key, ke.shiftKey === true);
              }
            }) as any
          }
          {...{ 'data-gantt-bar': barKey }}
          {...(geom.eternal ? { 'data-gantt-rail': 'true' } : null)}
          {...(geom.openStart || geom.openEnd
            ? {
                'data-gantt-span-open': geom.eternal ? 'both' : geom.openStart ? 'start' : 'end',
              }
            : null)}
          {...(nativeDragEnabled ? null : getBarDragProps(task, ref))}
          // Native drag responders own the tap → press is handled on release.
          onPress={
            nativeDragEnabled && bounded
              ? undefined
              : (e) => {
                  (e as any)?.stopPropagation?.();
                  if (suppressClickRef.current) {
                    return;
                  }
                  onItemPress?.(task);
                }
          }>
          {progress != null && progress > 0 && (
            <YStack
              position="absolute"
              top={0}
              bottom={0}
              {...(rtl ? { right: 0 } : { left: 0 })}
              width={`${progress}%`}
              backgroundColor="$color12"
              opacity={0.22}
              pointerEvents="none"
              {...{ 'data-gantt-progress': String(progress) }}
            />
          )}
          {showLabel && <GanttBarLabel title={barTitle} fill={fill} />}

          {/* "This end is not an end" — a mark, never a cap. */}
          {geom.openStart && (
            <GanttOpenEdgeMark fill={fill} glyph={rtl ? '»' : '«'} side={openStartSide} edge="start" />
          )}
          {geom.openEnd && <GanttOpenEdgeMark fill={fill} glyph={rtl ? '«' : '»'} side={openEndSide} edge="end" />}

          {/* Live date label while dragging (honest preview of the commit). */}
          {previewSpan && (
            <XStack
              position="absolute"
              top={-(axisHeight - 6)}
              {...(rtl ? { right: 0 } : { left: 0 })}
              backgroundColor="$background"
              {...knobProps.borderRadius}
              borderWidth={knobProps.inputSurface.borderWidth}
              borderColor="$borderColor"
              paddingHorizontal={knobProps.control.paddingHorizontal}
              pointerEvents="none"
              zIndex={4}
              {...{ 'data-gantt-drag-label': 'true' }}>
              <Text {...knobProps.label} color="$color" numberOfLines={1}>
                {formatSpanLabel(previewSpan)}
              </Text>
            </XStack>
          )}

          {/* Edge-resize handles (web pointer; native resize deferred). */}
          {webDragEnabled && handleWidth > 0 && (
            <>
              <YStack
                position="absolute"
                left={0}
                top={0}
                bottom={0}
                width={handleWidth}
                cursor="ew-resize"
                backgroundColor={showHandles ? '$color12' : 'transparent'}
                opacity={showHandles ? 0.28 : 0}
                onPointerDown={(e: any) => {
                  handleResizePointerDown(task, ref, physicalLeftEdge, e);
                }}
                {...{ 'data-gantt-resize-handle': physicalLeftEdge }}
              />
              <YStack
                position="absolute"
                right={0}
                top={0}
                bottom={0}
                width={handleWidth}
                cursor="ew-resize"
                backgroundColor={showHandles ? '$color12' : 'transparent'}
                opacity={showHandles ? 0.28 : 0}
                onPointerDown={(e: any) => {
                  handleResizePointerDown(task, ref, physicalRightEdge, e);
                }}
                {...{ 'data-gantt-resize-handle': physicalRightEdge }}
              />
            </>
          )}

          {/* Native drag surface: responders live on a plain fill view because
              the bar's Tamagui pressability would clobber them (Kanban keeps
              its drag responders off the pressable Card the same way). */}
          {nativeDragEnabled && bounded && (
            <YStack
              position="absolute"
              top={0}
              left={0}
              right={0}
              bottom={0}
              zIndex={5}
              {...getBarDragProps(task, ref)}
            />
          )}
        </YStack>
      </BarIntentWrap>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const scrollLocked = drag !== null || resize !== null || markerDragging;
  const majorGridColor = '$borderColor';
  const minorGridColor = componentColors.divider;
  // Manual mirroring owns RTL inside the horizontal scrollers: force their
  // scroll math to LTR so contentOffset.x stays 0-at-content-start on web.
  const scrollerDirection = { direction: 'ltr' as const };

  const showSkeleton = !error && isLoading && tasks.length === 0;

  return (
    <AsyncBoundary
      loading={showSkeleton ? <GanttSkeleton labelWidth={labelWidth} rowHeight={rowHeight} /> : false}
      empty={!error && !isLoading && tasks.length === 0}
      error={error}
      onRetry={onRetry}
      emptyTitle={emptyTitle ?? t('No tasks')}
      emptyDescription={emptyDescription}
      {...stackProps}>
      <YStack
        height={height}
        overflow="hidden"
        backgroundColor="$background"
        // Panel-tier lift follows the elevation knob (the gantt frame
        // is a themed surface, same as Calendar / Kanban columns).
        elevation={knobProps.elevation}
        // Container clip: the frame rounds and clips; rows stay square.
        {...knobProps.containerRadius}
        {...{
          'data-gantt-view': zoom,
          'data-size': knobProps.size,
          'data-density': knobProps.density,
        }}>
        {/* Header */}
        {(showNavigation || showZoomSwitcher) && (
          <XStack
            {...knobProps.panelPadding}
            alignItems="center"
            justifyContent="space-between"
            {...knobProps.gap}
            {...hairline.bottom}
            borderColor="$borderColor">
            {showNavigation && (
              <Button
                size={knobProps.sizeToken}
                onPress={() => {
                  scrollToDate(new Date(), true);
                }}>
                {t('Today')}
              </Button>
            )}

            {/* Range title is the panel's section heading — shared scale. */}
            <Text {...knobProps.heading} {...sectionHeading} numberOfLines={1}>
              {rangeLabel}
            </Text>

            {showZoomSwitcher && (
              /* Canonical fused view picker. */
              <ViewSwitcher
                views={[
                  { type: 'day', label: t('Day') },
                  { type: 'week', label: t('Week') },
                  { type: 'month', label: t('Month') },
                ]}
                currentView={zoom}
                onViewChange={(val) => {
                  changeZoom(val as GanttZoom);
                }}
              />
            )}
          </XStack>
        )}

        {/* Pinned axis row: the "Task" header cell + the time-axis strip stay
            put while rows scroll vertically. The strip is a scroll-follower
            of the canvas scroller (works web + native), so the tick grid and
            bars can never drift apart horizontally. */}
        <XStack {...hairline.bottom} borderColor="$borderColor" {...{ 'data-gantt-axis-row': 'true' }}>
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
              {t('Task')}
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
              width={chartWidth}
              height={axisHeight}
              position="relative"
              {...{
                backgroundColor: componentColors.surface.background,
                'data-gantt-axis': zoom,
              }}>
              {weekends.map((col) => (
                <YStack
                  key={`axis-we-${col.key}`}
                  position="absolute"
                  {...canvasPos(col.x)}
                  top={0}
                  bottom={0}
                  width={col.width}
                  backgroundColor={componentColors.interactive.background}
                  opacity={0.7}
                  pointerEvents="none"
                />
              ))}
              {todayColX !== null && (
                <YStack
                  position="absolute"
                  {...canvasPos(todayColX)}
                  top={0}
                  bottom={0}
                  width={pxPerDay}
                  backgroundColor="$accentBackground"
                  opacity={0.16}
                  pointerEvents="none"
                />
              )}
              {months.map((band) =>
                band.width < 36 ? null : (
                  <Text
                    key={band.key}
                    position="absolute"
                    {...(rtl ? { right: band.x + 4 } : { left: band.x + 4 })}
                    top={2}
                    width={Math.max(0, band.width - 8)}
                    {...knobProps.label}
                    color={knobProps.textAccentColor}
                    numberOfLines={1}>
                    {band.label}
                  </Text>
                ),
              )}
              {ticks.map((tick) => (
                <Text
                  key={tick.date.toISOString()}
                  position="absolute"
                  {...(rtl ? { right: tick.x + 4 } : { left: tick.x + 4 })}
                  top={axisHeight / 2}
                  {...knobProps.label}
                  color={knobProps.textAccentColor}
                  numberOfLines={1}>
                  {formatDayOfMonth(tick.date)}
                </Text>
              ))}
              <YStack
                position="absolute"
                left={0}
                right={0}
                top={axisHeight / 2}
                height={hairlineWidth}
                backgroundColor={componentColors.divider}
                pointerEvents="none"
              />
              {/* The marker is scrubbed on the AXIS, never on the rows — a
                  press inside a row stays a press on that bar. */}
              {markerX !== null && (
                <>
                  <YStack
                    position="absolute"
                    {...canvasPos(markerX - 1)}
                    top={0}
                    bottom={0}
                    width={2}
                    backgroundColor="$color12"
                    opacity={0.9}
                    pointerEvents="none"
                  />
                  <YStack
                    position="absolute"
                    {...canvasPos(markerX - 12)}
                    top={0}
                    bottom={0}
                    width={24}
                    alignItems="center"
                    justifyContent="flex-end"
                    paddingBottom={2}
                    zIndex={4}
                    cursor={markerDragEnabled ? 'ew-resize' : undefined}
                    role="slider"
                    tabIndex={markerDragEnabled ? 0 : -1}
                    aria-label={markerName}
                    aria-valuetext={markerDate ? formatAbsoluteDate(markerDate) : undefined}
                    {...(markerDragEnabled && hasDom
                      ? {
                          onPointerDown: (e: any) => {
                            handleMarkerPointerDown(e);
                          },
                        }
                      : null)}
                    {...markerNativeProps}
                    onKeyDown={
                      ((ke: any) => {
                        if (ke.key !== 'ArrowLeft' && ke.key !== 'ArrowRight') {
                          return;
                        }
                        ke.preventDefault?.();
                        ke.stopPropagation?.();
                        handleMarkerKeyboardMove(ke.key, ke.shiftKey === true);
                      }) as any
                    }
                    {...{ 'data-gantt-marker-handle': 'true' }}>
                    <YStack
                      width={11}
                      height={9}
                      borderRadius={2}
                      backgroundColor="$color12"
                      opacity={markerDragging ? 1 : 0.9}
                      pointerEvents="none"
                    />
                  </YStack>
                </>
              )}
            </XStack>
          </ScrollView>
        </XStack>

        {/* Body: labels + chart share one vertical scroller so rows stay
            aligned; the chart owns its horizontal scroller so bars never
            paint past the frame. */}
        <ScrollView flex={1} scrollEnabled={!scrollLocked}>
          <XStack {...{ 'data-gantt-scroll-body': 'true' }}>
            {/* Task label column */}
            <YStack width={labelWidth} flexShrink={0} {...hairlineEnd} borderColor="$borderColor">
              {tasks.map((task, index) => {
                const refs = resolveSpans(task);
                // A row is "selected" when any of ITS spans holds focus — for
                // a single-span row that is still `focusedBarId === task.id`.
                const selected = refs.some((ref) => ref.key === focusedBarId);
                const hovered = hoveredId === task.id;
                const last = index === tasks.length - 1;
                const firstKey = refs[0]?.key ?? task.id;
                return (
                  <XStack
                    key={task.id}
                    height={rowHeight}
                    alignItems="center"
                    paddingHorizontal={knobProps.panelPadding.padding}
                    {...(last ? null : hairline.bottom)}
                    borderColor={minorGridColor}
                    backgroundColor={
                      selected ? '$accentBackground' : hovered ? componentColors.interactive.background : 'transparent'
                    }
                    cursor={onItemPress ? 'pointer' : undefined}
                    // Tamagui forwards onHoverIn/onHoverOut at runtime; the
                    // RN-flavored View prop type omits them (house Record cast).
                    {...({
                      onHoverIn: () => {
                        setHoveredId(task.id);
                      },
                      onHoverOut: () => {
                        setHoveredId((id) => (id === task.id ? null : id));
                      },
                    } as Record<string, unknown>)}
                    onPress={
                      onItemPress
                        ? () => {
                            if (suppressClickRef.current) {
                              return;
                            }
                            setFocusedBarId(firstKey);
                            setBarKeyboardRing(false);
                            onItemPress(task);
                          }
                        : () => {
                            setFocusedBarId(firstKey);
                            setBarKeyboardRing(false);
                          }
                    }
                    {...{ 'data-gantt-row-label': task.id }}>
                    <GanttTaskName title={task.title} selected={selected} body={knobProps.body} />
                  </XStack>
                );
              })}
            </YStack>

            {/* Timeline chart. On native the scroller is the raw RN ScrollView:
                Tamagui's styled ScrollView does not deliver onScroll there, and
                the pinned axis follower depends on it. */}
            <CanvasScroller
              keyboardShouldPersistTaps="handled"
              ref={hScrollRef}
              horizontal
              {...(isWeb ? { flex: 1 } : null)}
              scrollEnabled={!scrollLocked}
              showsHorizontalScrollIndicator
              onScroll={handleCanvasScroll}
              scrollEventThrottle={16}
              onLayout={handleCanvasLayout}
              style={(isWeb ? scrollerDirection : [{ flex: 1 }, scrollerDirection]) as any}>
              <YStack width={chartWidth} position="relative" {...{ 'data-gantt-chart': 'true' }}>
                {/* Rows + grid + today line */}
                <YStack position="relative" {...{ 'data-gantt-body': 'true' }}>
                  {weekends.map((col) => (
                    <YStack
                      key={`body-we-${col.key}`}
                      position="absolute"
                      {...canvasPos(col.x)}
                      top={0}
                      bottom={0}
                      width={col.width}
                      backgroundColor={componentColors.interactive.background}
                      opacity={0.55}
                      pointerEvents="none"
                      {...{ 'data-gantt-weekend': col.key }}
                    />
                  ))}
                  {todayColX !== null && (
                    <YStack
                      position="absolute"
                      {...canvasPos(todayColX)}
                      top={0}
                      bottom={0}
                      width={pxPerDay}
                      backgroundColor="$accentBackground"
                      opacity={0.12}
                      pointerEvents="none"
                      {...{ 'data-gantt-today-col': 'true' }}
                    />
                  )}
                  {/* Vertical grid lines (under the rows) */}
                  {ticks.map((tick) => (
                    <YStack
                      key={tick.date.toISOString()}
                      position="absolute"
                      {...canvasPos(tick.x)}
                      top={0}
                      bottom={0}
                      width={hairlineWidth}
                      backgroundColor={tick.major ? majorGridColor : minorGridColor}
                      pointerEvents="none"
                    />
                  ))}

                  {/* Task rows */}
                  {tasks.map((task, index) => {
                    const refs = resolveSpans(task);
                    const selected = refs.some((ref) => ref.key === focusedBarId);
                    const hovered = hoveredId === task.id;
                    const last = index === tasks.length - 1;
                    return (
                      <XStack
                        key={task.id}
                        height={rowHeight}
                        position="relative"
                        {...(last ? null : hairline.bottom)}
                        borderColor={minorGridColor}
                        backgroundColor={selected || hovered ? componentColors.interactive.background : 'transparent'}
                        // Tamagui forwards onHoverIn/onHoverOut at runtime; the
                        // RN-flavored View prop type omits them (house Record cast).
                        {...({
                          onHoverIn: () => {
                            setHoveredId(task.id);
                          },
                          onHoverOut: () => {
                            setHoveredId((id) => (id === task.id ? null : id));
                          },
                        } as Record<string, unknown>)}
                        {...{ 'data-gantt-row': task.id }}>
                        {refs.map((ref) => renderBar(task, ref))}
                      </XStack>
                    );
                  })}

                  {/* Marker line (controlled — the caller owns the date) */}
                  {markerX !== null && (
                    <YStack
                      position="absolute"
                      {...canvasPos(markerX - 1)}
                      top={0}
                      bottom={0}
                      width={2}
                      backgroundColor="$color12"
                      opacity={markerDragging ? 0.95 : 0.75}
                      pointerEvents="none"
                      zIndex={2}
                      {...{ 'data-gantt-marker': 'true' }}
                    />
                  )}

                  {/* Today line (above bars, non-interactive) */}
                  {todayX !== null && (
                    <YStack
                      position="absolute"
                      {...canvasPos(todayX - 1)}
                      top={0}
                      bottom={0}
                      width={2}
                      backgroundColor="$accentBackground"
                      opacity={0.9}
                      pointerEvents="none"
                      zIndex={2}
                      {...{ 'data-gantt-today': 'true' }}
                    />
                  )}
                </YStack>
              </YStack>
            </CanvasScroller>
          </XStack>
        </ScrollView>

        {/* Screen-reader announcements for keyboard rescheduling (visually
            hidden — Kanban/TreeView announcer pattern). */}
        <YStack
          position="absolute"
          width={1}
          height={1}
          overflow="hidden"
          opacity={0}
          pointerEvents="none"
          aria-live="assertive"
          aria-atomic
          {...{ 'data-gantt-live': 'true' }}>
          <Text>{announcement}</Text>
        </YStack>
      </YStack>
    </AsyncBoundary>
  );
}
