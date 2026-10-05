import { Button, FloatingPanel, Input, zIndex } from '@repo/forms';
import {
  formatCalendarDate,
  formatDayLong,
  formatTimeOfDay,
  getMonthNames,
  getWeekdayNames,
  hairline,
  hairlineWidth,
  keyboardFocusRingProps,
  type KnobProps,
  MIN_PRESS_TARGET,
  pressTargetHitSlop,
  radiusClassProps,
  ensureFocusVisibleRing,
  ensureKeyboardModalityTracking,
  useReadableTextOn,
  useResolvedKnobs,
  wasKeyboardFocus,
} from '@repo/theme';
import React, { useState, useMemo, useCallback, useEffect, useId, useRef } from 'react';
import { AnimatePresence, Text, XStack, YStack, isWeb, styled, type YStackProps } from 'tamagui';

import { componentColors, sectionHeading } from '../componentColors';
import { useDirection } from '../hooks/useDirection';
import { ViewSwitcher } from '../layouts/ViewSwitcher';
import { ScrollView } from '../ScrollView';
import { useTranslation } from '../shared/i18n';
import { withInterp } from '../shared/t';

import {
  MINUTES_PER_DAY,
  computeResizeRange,
  createRangeFromDrag,
  eventAccessibleLabel,
  formatTimeRangeLabel,
  layoutDayBlocks,
  minutesOfDay,
  minutesToY,
  moveFocusDate,
  moveFocusSlot,
  moveRangeToSlot,
  snapMinutes,
  yToMinutes,
  type CalendarRange,
} from './calendarMath';

/**
 * Calendar view type.
 */
export type CalendarViewType = 'month' | 'week' | 'day';

/**
 * A calendar event.
 */
export interface CalendarEvent {
  /** Unique event identifier */
  id: string;
  /** Event title */
  title: string;
  /** Start date/time */
  start: Date;
  /** Optional end date/time */
  end?: Date;
  /** Optional color for the event badge */
  color?: string;
  /** Any additional data */
  [key: string]: unknown;
}

/**
 * New start/end range produced by an event drag-move.
 */
export interface CalendarEventMoveRange {
  start: Date;
  end: Date;
}

/** Draft payload emitted when a drag-to-create editor commits. */
export interface CalendarEventDraft {
  title: string;
  start: Date;
  end: Date;
}

/**
 * Inline-END hairline rule (P-16 RTL mirroring): grid column separators sit
 * on the logical end edge so the grid mirrors with the writing direction.
 * Web needs the CSS-logical props + the low-DPI fallback class (tamagui's RN
 * borderEndWidth does not compile to working CSS on web — SB-M-1215 pattern,
 * same as Sidebar); native takes the RN logical prop.
 */
const hairlineEnd = isWeb
  ? {
      borderInlineEndWidth: hairlineWidth,
      borderInlineEndStyle: 'solid' as any,
      className: 'mp-hairline-ie',
    }
  : { borderEndWidth: hairlineWidth };

/**
 * Interior grid-cell separators as OPTICS hairlines (device-pixel rules with
 * the low-DPI fallback classes from the theme's hairline treatment). Edges
 * are LOGICAL: `end` draws the inline-end rule, so interior-only separators
 * stay interior under RTL (no doubled rule against the panel frame).
 */
function gridCellEdges(end: boolean, bottom: boolean) {
  const className = [end && 'mp-hairline-ie', bottom && 'mp-hairline-b'].filter(Boolean).join(' ') || undefined;
  return {
    ...(end ? hairlineEnd : null),
    borderBottomWidth: bottom ? hairlineWidth : 0,
    ...(isWeb && className ? { className } : null),
  };
}

/**
 * Readable chip text for an event's fill.
 * White text on mid-tone brand hexes (#10b981, #f59e0b) measures 2-3.7:1 —
 * pick black/white by WCAG relative luminance instead.
 *
 * An event with no color paints `$accentBackground`, and its text is
 * `onAccent`: the fill's readable anchor, which the caller resolves with
 * `useReadableTextOn("$accentBackground")`. `$accentColor` is accent ink for
 * the page, not for the fill; on it the fallback chip measured 1.76:1 in light
 * and 3.84:1 in dark. A token color keeps `$accentColor`.
 *
 * The dark candidate is pure black: the old #1a1a1a candidate was scored
 * against ideal black (L=0) but rendered at L=0.0103, overstating its own
 * contrast — measured 4.11:1 on #8B5CF6 while claiming 4.96 (Axiom 15:
 * foreground on fills is luminance-COMPUTED, and the computation must match
 * the rendered pixels). Black keeps every sanctioned step-9 solid ≥ 4.5:1.
 */
export function eventChipTextColor(bg?: string, onAccent?: string): string {
  if (!bg) {
    return onAccent ?? '$accentColor';
  }
  if (!bg.startsWith('#')) {
    return '$accentColor';
  }
  const hex = bg.slice(1);
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex.slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = Number.parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const contrastWhite = 1.05 / (luminance + 0.05);
  const contrastBlack = (luminance + 0.05) / 0.05;
  return contrastWhite >= contrastBlack ? '#ffffff' : '#000000';
}

/**
 * Props for the generic Calendar component.
 */
export interface CalendarProps extends Omit<YStackProps, 'children'> {
  /** Array of events to display */
  events: CalendarEvent[];
  /** Custom render function for event badges */
  renderEvent?: (event: CalendarEvent) => React.ReactNode;
  /** Called when a date cell is selected */
  onDateSelect?: (date: Date) => void;
  /** Called when an event is clicked */
  onEventClick?: (event: CalendarEvent) => void;
  /**
   * Called when an event chip is dragged onto another day (month view /
   * all-day strip) or another time slot (week/day time grid).
   * Web uses pointer + DOM hit-testing; native uses the responder system +
   * measureInWindow hit-testing (best-effort — see calendar native DnD notes).
   * Day-level moves preserve the event's time-of-day and calendar-day span
   * (see {@link computeEventMoveRange}); slot-level moves preserve duration.
   */
  onEventMove?: (event: CalendarEvent, range: CalendarEventMoveRange) => void;
  /**
   * Called when an event is resized from its top/bottom handle in the
   * week/day time grid (web pointer only). Enables the resize handles.
   */
  onEventResize?: (event: CalendarEvent, range: CalendarEventMoveRange) => void;
  /**
   * Called when a drag-to-create editor commits (outside click / Escape —
   * live-commit, no Apply button). Enables press-drag on the empty
   * time grid and Enter-to-create on the focused slot.
   */
  onEventCreate?: (draft: CalendarEventDraft) => void;
  /** Enable drag of event chips (default: enabled when onEventMove is provided) */
  enableEventDrag?: boolean;
  /** Calendar view type (default: 'month') */
  viewType?: CalendarViewType;
  /** Initial date to display (defaults to today) */
  initialDate?: Date;
  /** Height of the calendar in pixels (default: 600) */
  height?: number;
  /** Show navigation controls (default: true) */
  showNavigation?: boolean;
  /** Show view type switcher (default: true) */
  showViewSwitcher?: boolean;
  /** First day of week: 0 = Sunday, 1 = Monday (default: 0) */
  firstDayOfWeek?: 0 | 1;
  /** Time-grid snap increment in minutes (default: 30) */
  slotMinutes?: number;
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function getMonthDays(date: Date, firstDayOfWeek: 0 | 1): Date[] {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  let startOffset = firstDay.getDay() - firstDayOfWeek;
  if (startOffset < 0) {
    startOffset += 7;
  }

  const totalDays = startOffset + lastDay.getDate();
  const totalRows = Math.ceil(totalDays / 7);
  const totalCells = totalRows * 7;

  const days: Date[] = [];
  for (let i = 0; i < totalCells; i++) {
    days.push(new Date(year, month, 1 - startOffset + i));
  }
  return days;
}

function getWeekDays(date: Date, firstDayOfWeek: 0 | 1): Date[] {
  const days: Date[] = [];
  const dayOfWeek = date.getDay();
  let startOffset = dayOfWeek - firstDayOfWeek;
  if (startOffset < 0) {
    startOffset += 7;
  }

  const startDate = new Date(date);
  startDate.setDate(date.getDate() - startOffset);

  for (let i = 0; i < 7; i++) {
    const day = new Date(startDate);
    day.setDate(startDate.getDate() + i);
    days.push(day);
  }
  return days;
}

/** Day-grid key ("2026-03-10") — the local calendar day, never a UTC one. */
function formatDateKey(date: Date): string {
  return formatCalendarDate(date);
}

function addMonths(date: Date, delta: number): Date {
  const next = new Date(date);
  next.setDate(1);
  next.setMonth(next.getMonth() + delta);
  const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(date.getDate(), lastDay));
  return next;
}

function isSameDay(d1: Date, d2: Date): boolean {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

const MS_PER_DAY = 86_400_000;

/**
 * Compute the new start/end range for an event dropped on `targetDay`.
 *
 * Shifts the event by whole calendar days: time-of-day of both start and end
 * is preserved, and multi-day events keep their day span. (Across a DST
 * boundary this preserves wall-clock times rather than exact millisecond
 * duration.) Events without an `end` get a zero-duration range
 * (`end` equals `start`).
 */
export function computeEventMoveRange(event: CalendarEvent, targetDay: Date): CalendarEventMoveRange {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  // Round: start-of-day deltas are not exact multiples of 24h across DST.
  const dayDelta = Math.round((startOfDay(targetDay).getTime() - startOfDay(event.start).getTime()) / MS_PER_DAY);
  const shiftDays = (d: Date) =>
    new Date(
      d.getFullYear(),
      d.getMonth(),
      d.getDate() + dayDelta,
      d.getHours(),
      d.getMinutes(),
      d.getSeconds(),
      d.getMilliseconds(),
    );
  const start = shiftDays(event.start);
  const end = event.end ? shiftDays(event.end) : new Date(start.getTime());
  return { start, end };
}

/** Window-space rect for a day cell used by native drag hit-testing. */
export interface CalendarDayLayout {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Find the day key whose layout contains `(pageX, pageY)`.
 * Used by native drag (no `document.elementFromPoint`).
 */
export function findDayKeyAtPoint(pageX: number, pageY: number, layouts: readonly CalendarDayLayout[]): string | null {
  // Half-open intervals so shared edges between adjacent cells don't double-hit.
  for (const layout of layouts) {
    if (pageX >= layout.x && pageX < layout.x + layout.width && pageY >= layout.y && pageY < layout.y + layout.height) {
      return layout.key;
    }
  }
  return null;
}

interface MeasurableDayNode {
  measureInWindow?: (cb: (x: number, y: number, width: number, height: number) => void) => void;
}

function measureDayLayouts(refs: Map<string, MeasurableDayNode>, cb: (layouts: CalendarDayLayout[]) => void) {
  const entries = [...refs.entries()];
  if (entries.length === 0) {
    cb([]);
    return;
  }
  const layouts: CalendarDayLayout[] = [];
  let remaining = entries.length;
  for (const [key, node] of entries) {
    if (typeof node.measureInWindow !== 'function') {
      if (--remaining === 0) {
        cb(layouts);
      }
      continue;
    }
    node.measureInWindow((x, y, width, height) => {
      layouts.push({ key, x, y, width, height });
      if (--remaining === 0) {
        cb(layouts);
      }
    });
  }
}

function dayKeyToDate(key: string): Date {
  const [ty, tm, td] = key.split('-').map(Number);
  return new Date(ty, tm - 1, td);
}

function dateAtMinutes(day: Date, minutes: number): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minutes);
}

/** Timed events render as positioned blocks; untimed live in day/all-day rows. */
function isTimedEvent(event: CalendarEvent): boolean {
  return (
    event.end !== undefined &&
    event.end.getTime() > event.start.getTime() &&
    isSameDay(event.start, event.end) &&
    event.allDay !== true
  );
}

/** Pixels of pointer travel before a press becomes a drag (clicks stay clicks below this). */
const DRAG_THRESHOLD_PX = 4;
/** Touch pointers lift after a hold instead of a travel threshold. */
const TOUCH_LONG_PRESS_MS = 300;
/** Touch travel allowed before a pending long-press yields to scrolling. */
const TOUCH_SLOP_PX = 8;
/** Single-light lift shadow shared with FloatingPanel (Axiom 14 overlay tier). */
const LIFT_SHADOW = '0px 8px 28px rgba(0,0,0,0.18), 0px 2px 6px rgba(0,0,0,0.08)';
/** Minimum rendered height for a timed block (short events stay visible). */
const MIN_BLOCK_PX = 18;
/** Resize handle hit zone (Axiom 12 touch-target floor). */
const RESIZE_ZONE_PX = MIN_PRESS_TARGET;
/** Month-view chip visual floor (hit slop fills the 44px target). */
const MONTH_CHIP_MIN_PX = 24;

interface NestedControlBox {
  width: number;
  height: number;
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
}

type NestedLabel = KnobProps['label'];

/**
 * Compact day-number disc (Apple / Polaris / FullCalendar): nestedControl
 * box below the 44px floor, label type (never sizeToken-as-font), today =
 * fill, keyboard focus = ring on this disc only.
 */
function DayNumberDisc({
  date,
  today,
  inMonth,
  focused,
  onAccent,
  nestedPx,
  nestedHitSlop,
  nestedBox,
  label,
}: {
  date: Date;
  today: boolean;
  inMonth: boolean;
  focused: boolean;
  onAccent?: string;
  nestedPx: number;
  nestedHitSlop: { top: number; bottom: number; left: number; right: number };
  nestedBox: NestedControlBox;
  label: NestedLabel;
}) {
  const { knobProps } = useResolvedKnobs();
  return (
    <YStack
      {...nestedBox}
      flexShrink={0}
      borderRadius={nestedPx / 2}
      {...radiusClassProps('R-PILL', 'Calendar today marker')}
      alignItems="center"
      justifyContent="center"
      backgroundColor={today ? '$accentBackground' : 'transparent'}
      hitSlop={nestedHitSlop}
      {...(focused && wasKeyboardFocus() ? keyboardFocusRingProps : { outlineWidth: 0 })}
      {...(today && { 'data-calendar-today': 'true' })}
      {...({
        'data-nested-px': nestedPx,
        'data-calendar-day-disc': 'true',
      } as any)}>
      <Text
        {...label}
        fontWeight={today ? '700' : label.fontWeight}
        color={today ? (onAccent ?? '$accentColor') : inMonth ? '$color' : knobProps.textAccentColor}
        textAlign="center">
        {date.getDate()}
      </Text>
    </YStack>
  );
}

function getHours(): number[] {
  return Array.from({ length: 24 }, (_, i) => i);
}

/** Hour ticks speak the house time-of-day register without minutes ("2 PM"). */
function formatHour(hour: number): string {
  return formatTimeOfDay(new Date(2000, 0, 1, hour, 0, 0), { minutes: false });
}

const weekdayNames = getWeekdayNames();
const monthNames = getMonthNames();
const hours = getHours();

// ---------------------------------------------------------------------------
// Shared web pointer session runner
// ---------------------------------------------------------------------------

interface WebPointerSessionOptions {
  pointerType?: string;
  startX: number;
  startY: number;
  /** Travel needed before the session activates (mouse/pen). */
  thresholdPx?: number;
  /** Session became live (lift). */
  onActivate: (pt: { x: number; y: number }) => void;
  /** Pointer moved while live. */
  onMove: (pt: { x: number; y: number }) => void;
  /** Pointer released while live. */
  onCommit: (pt: { x: number; y: number }) => void;
  /** Escape pressed while live (pointer may still be down). */
  onCancel: () => void;
  /** Pointer released before the session activated (plain tap/click). */
  onTapInstead?: () => void;
  /** Session fully torn down (always fires exactly once). */
  onSettled?: (activated: boolean, escaped: boolean) => void;
}

/**
 * Window-level pointer session with threshold (mouse/pen) or long-press
 * (touch) activation, Escape cancellation, and text-selection locking.
 * Returns a cleanup that cancels the session.
 */
function startWebPointerSession(options: WebPointerSessionOptions): () => void {
  const threshold = options.thresholdPx ?? DRAG_THRESHOLD_PX;
  const isTouch = options.pointerType === 'touch';
  let active = false;
  let ended = false;
  let escaped = false;
  let liftArmed = !isTouch;
  let last = { x: options.startX, y: options.startY };
  let prevUserSelect = '';
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;

  const preventTouchScroll = (te: TouchEvent) => {
    if (active) {
      te.preventDefault();
    }
  };

  const activate = (pt: { x: number; y: number }) => {
    if (active) {
      return;
    }
    active = true;
    prevUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    options.onActivate(pt);
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
    window.removeEventListener('touchmove', preventTouchScroll);
    if (active) {
      document.body.style.userSelect = prevUserSelect;
    }
    options.onSettled?.(active, escaped);
  };

  const onMove = (me: PointerEvent) => {
    last = { x: me.clientX, y: me.clientY };
    if (!active) {
      const travel = Math.hypot(me.clientX - options.startX, me.clientY - options.startY);
      if (isTouch && !liftArmed) {
        // Still waiting on the long press — a real swipe yields to scrolling.
        if (travel > TOUCH_SLOP_PX) {
          teardown();
        }
        return;
      }
      if (travel < threshold) {
        return;
      }
      activate(last);
    }
    options.onMove(last);
  };

  const onUp = (ue: PointerEvent) => {
    last = { x: ue.clientX, y: ue.clientY };
    const wasActive = active;
    teardown();
    if (wasActive) {
      options.onCommit(last);
    } else {
      options.onTapInstead?.();
    }
  };

  const onKey = (ke: KeyboardEvent) => {
    if (ke.key !== 'Escape' || !active) {
      return;
    }
    ke.stopPropagation();
    escaped = true;
    const cancel = options.onCancel;
    teardown();
    cancel();
  };

  if (isTouch) {
    longPressTimer = setTimeout(() => {
      liftArmed = true;
      activate(last);
    }, TOUCH_LONG_PRESS_MS);
    window.addEventListener('touchmove', preventTouchScroll, { passive: false });
  }

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('keydown', onKey, true);
  return teardown;
}

// ---------------------------------------------------------------------------
// Now indicator (week/day time grid)
// ---------------------------------------------------------------------------

function NowIndicator({ hourHeight }: { hourHeight: number }) {
  const [now, setNow] = useState(() => new Date());
  // The dot anchors the line's inline START (the hour-gutter side): a
  // JS-positioned physical inset, mirrored via the direction source.
  const isRTL = useDirection() === 'rtl';
  useEffect(() => {
    const id = setInterval(() => {
      setNow(new Date());
    }, 60_000);
    return () => {
      clearInterval(id);
    };
  }, []);
  const y = minutesToY(minutesOfDay(now), hourHeight);
  return (
    <XStack
      position="absolute"
      left={0}
      right={0}
      top={y - 1}
      height={2}
      backgroundColor="$accentBackground"
      pointerEvents="none"
      zIndex={3}
      {...{ 'data-calendar-now': 'true' }}>
      <YStack
        {...radiusClassProps('R-PILL', 'Calendar now-marker dot')}
        position="absolute"
        {...(isRTL ? { right: -3 } : { left: -3 })}
        top={-3}
        width={8}
        height={8}
        borderRadius={4}
        backgroundColor="$accentBackground"
      />
    </XStack>
  );
}

// ---------------------------------------------------------------------------
// FLIP-settle ghost (drop / cancel tween back)
// ---------------------------------------------------------------------------

interface SettleGhostState {
  key: number;
  title: string;
  color?: string;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

function SettleGhost({
  settle,
  transition,
  borderRadius,
  onDone,
}: {
  settle: SettleGhostState;
  transition: string | undefined;
  borderRadius: Record<string, unknown>;
  onDone: () => void;
}) {
  const onAccent = useReadableTextOn('$accentBackground');
  const [moved, setMoved] = useState(false);
  useEffect(() => {
    // Double rAF so the ghost paints at `from` before the tween retargets it
    // (the drop is a discrete jump — it animates).
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setMoved(true);
      });
    });
    const timer = setTimeout(onDone, 480);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(timer);
    };
  }, [onDone]);
  return (
    <YStack
      pointerEvents="none"
      {...borderRadius}
      backgroundColor={(settle.color || '$accentBackground') as any}
      padding="$1"
      transition={transition as any}
      x={moved ? settle.to.x - settle.from.x : 0}
      y={moved ? settle.to.y - settle.from.y : 0}
      scale={moved ? 1 : 1.03}
      opacity={moved ? 0.6 : 0.95}
      {...({
        'data-calendar-settle-ghost': 'true',
        style: {
          position: 'fixed',
          left: settle.from.x,
          top: settle.from.y,
          zIndex: zIndex.sheet,
          maxWidth: 220,
          boxShadow: LIFT_SHADOW,
        },
      } as any)}>
      <Text fontSize="$2" numberOfLines={1} color={eventChipTextColor(settle.color, onAccent)}>
        {settle.title}
      </Text>
    </YStack>
  );
}

// ---------------------------------------------------------------------------
// Directional slide surface (view/period switches)
// ---------------------------------------------------------------------------

/**
 * Slide-capable body surface for view/period switches. AnimatePresence picks
 * the variant per transition (`enterVariant`/`exitVariant`) so enter and exit
 * are PAIRED and the exiting period animates with the direction
 * chosen at nav time — not a stale style captured on its own render.
 * Offsets are physical px; the caller mirrors them with `useDirection` so
 * "next" always enters from the reading-direction end (RTL-correct).
 */
const CalendarSlide = styled(YStack, {
  variants: {
    fromStart: { true: { x: -24, opacity: 0 } },
    fromEnd: { true: { x: 24, opacity: 0 } },
    fade: { true: { opacity: 0 } },
  } as const,
});

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

/**
 * Generic calendar component.
 *
 * Month view is a day grid with honest "+N more" overflow (Axiom 6); week and
 * day views are real time grids with a now indicator, event drag (A-GESTURE
 * 1:1 tracking with FLIP settle on drop), edge resize with grid
 * snapping, and drag-to-create that opens a live-commit FloatingPanel editor
 * (no Apply button). View and period switches animate with
 * `knobProps.transition` (Axiom 4); `animation: none` renders every switch
 * instantly. Keyboard: arrows move day/slot focus, Enter opens or creates
 * (Axiom 12); an aria-live region announces period changes.
 *
 * @example
 * ```tsx
 * <Calendar
 *   events={events}
 *   onDateSelect={(date) => console.log(date)}
 *   onEventClick={(event) => console.log(event)}
 *   onEventMove={(event, range) => reschedule(event, range)}
 *   onEventResize={(event, range) => reschedule(event, range)}
 *   onEventCreate={(draft) => createEvent(draft)}
 * />
 * ```
 */
export function Calendar({
  events,
  renderEvent,
  onDateSelect,
  onEventClick,
  onEventMove,
  onEventResize,
  onEventCreate,
  enableEventDrag,
  viewType: initialViewType = 'month',
  initialDate,
  height = 600,
  showNavigation = true,
  showViewSwitcher = true,
  firstDayOfWeek = 0,
  slotMinutes = 30,
  ...stackProps
}: CalendarProps) {
  const { t } = useTranslation();
  const { knobProps } = useResolvedKnobs();
  // Day cells sit on a denser surface — compact nestedControl + label,
  // never the page control height as a disc or as fontSize.
  const { knobProps: nestedKnobs } = useResolvedKnobs({ compact: true });
  const { px: nestedPx, hitSlop: nestedHitSlop, ...nestedBox } = nestedKnobs.nestedControl;
  // UX-P03 / Axiom 15: the today/selected disc paints `$accentBackground`, so
  // its date glyph needs a luminance-computed foreground — `$accentColor` (the
  // deep on-page accent) measured 1.76:1 on the accent fill.
  const onAccent = useReadableTextOn('$accentBackground');
  const calendarId = useId();
  // Directional glyph/geometry source (RTL): slide offsets are physical px,
  // so "next" must be mirrored to enter from the reading-direction end.
  const isRTL = useDirection() === 'rtl';
  const [currentDate, setCurrentDate] = useState<Date>(initialDate ?? new Date());
  const [view, setView] = useState<CalendarViewType>(initialViewType);

  const sz = knobProps.sizeToken;
  const hourHeight = sz === '$3' ? 48 : sz === '$5' ? 80 : 64;
  // Week-row COMFORT floor, not fixed height: rows flex to share the panel
  // height so a month fits without slicing its last row mid-cell; the floor
  // steps density with the size knob and relaxes before the grid ever
  // slices (see monthRowMinHeight below).
  const monthCellMinHeight = sz === '$3' ? 64 : sz === '$5' ? 96 : 76;
  // Grid-cell inset and chip gap follow the space knob (SP-PAD:
  // the 2px hardcoded inset read as chips bleeding into hairlines).
  const space = knobProps.space;
  const cellPad = space === 'small' ? 2 : space === 'large' ? 7 : 4;
  const chipGap = space === 'small' ? 2 : space === 'large' ? 5 : 3;
  // Hard per-row floor: a day cell must fit its day disc plus one event chip
  // (content-derived, not a raw px dial).
  const monthRowHardFloor = cellPad * 2 + nestedPx + chipGap + MONTH_CHIP_MIN_PX;
  // Measured month-grid viewport (ScrollView onLayout) drives the fit logic.
  const [monthBodyHeight, setMonthBodyHeight] = useState(0);
  // Positioned time-grid overlays (blocks, handles, sketches, cursor) keep a
  // 2px breathing gap on the INLINE END (toward the next day's separator).
  // They are JS-positioned absolutes, so the physical pair mirrors via the
  // direction source rather than CSS logical props (rtl-audit rule-of-thumb).
  const overlayInset = isRTL ? { left: 2, right: 0 } : { left: 0, right: 2 };
  const transition = knobProps.transition;
  // Layout props (top/height) only tween on web — the RN driver cannot
  // animate layout, so native keeps those jumps instant (Axiom 4 note).
  const webLayoutTransition = isWeb ? transition : undefined;

  // -------------------------------------------------------------------------
  // View / period transition state (Axiom 4: discrete jumps animate)
  // -------------------------------------------------------------------------
  const navDirectionRef = useRef(0);
  const hasNavigatedRef = useRef(false);

  const periodKey =
    view === 'month'
      ? `${currentDate.getFullYear()}-${currentDate.getMonth()}`
      : view === 'week'
        ? formatDateKey(getWeekDays(currentDate, firstDayOfWeek)[0])
        : formatDateKey(currentDate);
  const motionKey = `${view}:${periodKey}`;

  // -------------------------------------------------------------------------
  // Event drag-and-drop
  // Web: window pointer listeners + document.elementFromPoint
  // Native: RN responder system + measureInWindow day-cell hit testing
  // -------------------------------------------------------------------------
  const dragEnabled = enableEventDrag ?? onEventMove !== undefined;
  // Web still needs a DOM for hit-testing / window listeners.
  const hasDom = isWeb && typeof window !== 'undefined' && typeof document !== 'undefined';
  const webDragEnabled = dragEnabled && hasDom;
  const nativeDragEnabled = dragEnabled && !isWeb;
  const webResizeEnabled = onEventResize !== undefined && hasDom;
  const webCreateEnabled = onEventCreate !== undefined && hasDom;

  const [dragGhost, setDragGhost] = useState<{
    event: CalendarEvent;
    x: number;
    y: number;
  } | null>(null);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);
  const [slotTarget, setSlotTarget] = useState<{
    dayKey: string;
    startMin: number;
    durationMin: number;
  } | null>(null);
  const [settle, setSettle] = useState<SettleGhostState | null>(null);
  const [resizePreview, setResizePreview] = useState<{
    id: string;
    start: Date;
    end: Date;
  } | null>(null);
  const [createDraft, setCreateDraft] = useState<{
    dayKey: string;
    start: Date;
    end: Date;
  } | null>(null);
  const [editorState, setEditorState] = useState<{
    dayKey: string;
    start: Date;
    end: Date;
  } | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [overflowDayKey, setOverflowDayKey] = useState<string | null>(null);
  const [scrollLocked, setScrollLocked] = useState(false);
  const [draggingEventId, setDraggingEventId] = useState<string | null>(null);

  // Set after a drag ends so the trailing click doesn't fire onEventClick/onDateSelect.
  const suppressClickRef = useRef(false);
  const dragSessionCleanupRef = useRef<(() => void) | null>(null);
  const slotTargetRef = useRef<typeof slotTarget>(null);
  const resizePreviewRef = useRef<typeof resizePreview>(null);
  const editorStateRef = useRef<typeof editorState>(null);
  const draftTitleRef = useRef('');
  const dayRefs = useRef(new Map<string, MeasurableDayNode>());
  const containerNodeRef = useRef<MeasurableDayNode | null>(null);
  const containerOffsetRef = useRef({ x: 0, y: 0 });
  const nativeSessionRef = useRef<{
    event: CalendarEvent;
    startX: number;
    startY: number;
    dragging: boolean;
    layouts: CalendarDayLayout[];
  } | null>(null);

  slotTargetRef.current = slotTarget;
  resizePreviewRef.current = resizePreview;
  editorStateRef.current = editorState;
  draftTitleRef.current = draftTitle;

  const registerDayRef = useCallback((key: string, node: MeasurableDayNode | null) => {
    if (node) {
      dayRefs.current.set(key, node);
    } else {
      dayRefs.current.delete(key);
    }
  }, []);

  const refreshContainerOffset = useCallback(() => {
    containerNodeRef.current?.measureInWindow?.((x, y) => {
      containerOffsetRef.current = { x, y };
    });
  }, []);

  useEffect(() => () => dragSessionCleanupRef.current?.(), []);

  const clearSettle = useCallback(() => {
    setSettle(null);
  }, []);

  const suppressNextClick = useCallback(() => {
    suppressClickRef.current = true;
    setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  }, []);

  const beginSettle = useCallback(
    (event: CalendarEvent, from: { x: number; y: number }, to: { x: number; y: number }) => {
      if (!transition || !hasDom) {
        return;
      }
      setSettle({
        key: Date.now(),
        title: event.title,
        color: event.color,
        from,
        to,
      });
    },
    [transition, hasDom],
  );

  const commitMoveToKey = useCallback(
    (event: CalendarEvent, key: string | null) => {
      if (!key) {
        return;
      }
      const targetDay = dayKeyToDate(key);
      if (!isSameDay(targetDay, event.start)) {
        onEventMove?.(event, computeEventMoveRange(event, targetDay));
      }
    },
    [onEventMove],
  );

  // ── Web event move drag (day mode: month cells / all-day strip; ──────────
  // ── slot mode: time-grid columns) ─────────────────────────────────────────
  const handleEventPointerDown = useCallback(
    (
      event: CalendarEvent,
      e: {
        button?: number;
        clientX: number;
        clientY: number;
        pointerType?: string;
        currentTarget?: unknown;
        stopPropagation?: () => void;
      },
      mode: 'day' | 'slot',
    ) => {
      if (!webDragEnabled) {
        return;
      }
      if (e.button !== undefined && e.button !== 0) {
        return;
      }
      // Don't let a chip/block press start the column's drag-to-create session.
      e.stopPropagation?.();
      dragSessionCleanupRef.current?.();

      const chipEl = e.currentTarget as HTMLElement | undefined;
      const originRect = chipEl?.getBoundingClientRect?.() ?? null;
      const durationMin = event.end
        ? Math.max(slotMinutes, (event.end.getTime() - event.start.getTime()) / 60000)
        : slotMinutes;
      const grabOffsetMin = mode === 'slot' && originRect ? yToMinutes(e.clientY - originRect.top, hourHeight) : 0;

      const findDayKey = (x: number, y: number): string | null => {
        const el = document.elementFromPoint?.(x, y);
        const dayEl = el?.closest?.('[data-calendar-day]');
        return dayEl?.getAttribute('data-calendar-day') ?? null;
      };

      const findSlotTarget = (x: number, y: number) => {
        const el = document.elementFromPoint?.(x, y);
        const colEl = el?.closest?.('[data-calendar-timecol]') as HTMLElement | null;
        if (!colEl) {
          return null;
        }
        const dayKey = colEl.getAttribute('data-calendar-timecol');
        if (!dayKey) {
          return null;
        }
        const rect = colEl.getBoundingClientRect();
        const raw = yToMinutes(y - rect.top, hourHeight) - grabOffsetMin;
        const startMin = Math.max(0, Math.min(MINUTES_PER_DAY - durationMin, snapMinutes(raw, slotMinutes, 'round')));
        return { dayKey, startMin, durationMin, rect };
      };

      const endVisuals = () => {
        setDragGhost(null);
        setDropTargetKey(null);
        setSlotTarget(null);
        setDraggingEventId(null);
        setScrollLocked(false);
        dragSessionCleanupRef.current = null;
      };

      let lastPoint = { x: e.clientX, y: e.clientY };
      const cleanup = startWebPointerSession({
        pointerType: e.pointerType,
        startX: e.clientX,
        startY: e.clientY,
        onActivate: (pt) => {
          lastPoint = pt;
          setDraggingEventId(event.id);
          setScrollLocked(true);
          setDragGhost({ event, x: pt.x, y: pt.y });
        },
        onMove: (pt) => {
          lastPoint = pt;
          setDragGhost({ event, x: pt.x, y: pt.y });
          if (mode === 'slot') {
            const target = findSlotTarget(pt.x, pt.y);
            setSlotTarget(target ? { dayKey: target.dayKey, startMin: target.startMin, durationMin } : null);
            setDropTargetKey(target ? null : findDayKey(pt.x, pt.y));
          } else {
            setDropTargetKey(findDayKey(pt.x, pt.y));
          }
        },
        onCommit: (pt) => {
          endVisuals();
          suppressNextClick();
          const ghostFrom = { x: pt.x + 12, y: pt.y + 12 };
          if (mode === 'slot') {
            const target = findSlotTarget(pt.x, pt.y);
            if (target) {
              const targetDay = dayKeyToDate(target.dayKey);
              const range = moveRangeToSlot(event, targetDay, target.startMin);
              if (range.start.getTime() !== event.start.getTime()) {
                onEventMove?.(event, range);
              }
              beginSettle(event, ghostFrom, {
                x: target.rect.left + 2,
                y: target.rect.top + minutesToY(target.startMin, hourHeight),
              });
              return;
            }
          }
          const dayKey = findDayKey(pt.x, pt.y);
          if (dayKey) {
            commitMoveToKey(event, dayKey);
            const cellEl = document.querySelector(`[data-calendar-day="${dayKey}"]`);
            const rect = cellEl?.getBoundingClientRect?.();
            if (rect) {
              beginSettle(event, ghostFrom, { x: rect.left + 4, y: rect.top + 24 });
            }
            return;
          }
          // No target: animate back home (same as cancel).
          if (originRect) {
            beginSettle(event, ghostFrom, { x: originRect.left, y: originRect.top });
          }
        },
        onCancel: () => {
          const ghost = { x: lastPoint.x + 12, y: lastPoint.y + 12 };
          endVisuals();
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
          if (originRect) {
            beginSettle(event, ghost, { x: originRect.left, y: originRect.top });
          }
        },
        onSettled: (activated) => {
          if (!activated) {
            endVisuals();
          }
        },
      });
      dragSessionCleanupRef.current = cleanup;
    },
    [webDragEnabled, slotMinutes, hourHeight, onEventMove, commitMoveToKey, beginSettle, suppressNextClick],
  );

  // ── Web event resize (time grid; snap jumps tween) ─────────────────
  const handleResizePointerDown = useCallback(
    (
      event: CalendarEvent,
      edge: 'start' | 'end',
      e: {
        button?: number;
        clientX: number;
        clientY: number;
        pointerType?: string;
        currentTarget?: unknown;
        stopPropagation?: () => void;
      },
    ) => {
      if (!webResizeEnabled) {
        return;
      }
      if (e.button !== undefined && e.button !== 0) {
        return;
      }
      e.stopPropagation?.();
      dragSessionCleanupRef.current?.();

      const handleEl = e.currentTarget as HTMLElement | undefined;
      const colEl = handleEl?.closest?.('[data-calendar-timecol]') as HTMLElement | null;
      const colRect = colEl?.getBoundingClientRect?.();
      if (!colRect) {
        return;
      }

      const applyPreview = (pt: { x: number; y: number }) => {
        const raw = yToMinutes(pt.y - colRect.top, hourHeight);
        const range = computeResizeRange(event, edge, raw, slotMinutes);
        setResizePreview({ id: event.id, start: range.start, end: range.end });
      };

      const cleanup = startWebPointerSession({
        pointerType: e.pointerType,
        startX: e.clientX,
        startY: e.clientY,
        thresholdPx: 1,
        onActivate: (pt) => {
          setScrollLocked(true);
          applyPreview(pt);
        },
        onMove: applyPreview,
        onCommit: () => {
          const preview = resizePreviewRef.current;
          setResizePreview(null);
          setScrollLocked(false);
          dragSessionCleanupRef.current = null;
          suppressNextClick();
          if (!preview) {
            return;
          }
          const prevEnd = event.end ?? event.start;
          if (preview.start.getTime() !== event.start.getTime() || preview.end.getTime() !== prevEnd.getTime()) {
            onEventResize?.(event, { start: preview.start, end: preview.end });
          }
        },
        onCancel: () => {
          // Preview reverts — the block tweens back to its committed geometry.
          setResizePreview(null);
          setScrollLocked(false);
          dragSessionCleanupRef.current = null;
          suppressClickRef.current = true;
          window.addEventListener(
            'pointerup',
            () =>
              setTimeout(() => {
                suppressClickRef.current = false;
              }, 0),
            { once: true },
          );
        },
        onSettled: (activated) => {
          if (!activated) {
            setResizePreview(null);
            setScrollLocked(false);
            dragSessionCleanupRef.current = null;
          }
        },
      });
      dragSessionCleanupRef.current = cleanup;
    },
    [webResizeEnabled, hourHeight, slotMinutes, onEventResize, suppressNextClick],
  );

  // ── Editor (drag-to-create; FloatingPanel, live commit) ───────
  const openEditor = useCallback((dayKey: string, range: CalendarRange) => {
    setCreateDraft(null);
    setDraftTitle('');
    setEditorState({ dayKey, start: range.start, end: range.end });
  }, []);

  const commitEditor = useCallback(() => {
    const state = editorStateRef.current;
    if (!state) {
      return;
    }
    setEditorState(null);
    setCreateDraft(null);
    setDraftTitle('');
    onEventCreate?.({
      title: draftTitleRef.current.trim() || t('New event'),
      start: state.start,
      end: state.end,
    });
  }, [onEventCreate, t]);

  // ── Web drag-to-create on the empty time grid ─────────────────────────────
  const handleGridPointerDown = useCallback(
    (
      day: Date,
      e: {
        button?: number;
        clientX: number;
        clientY: number;
        pointerType?: string;
        currentTarget?: unknown;
      },
    ) => {
      if (!hasDom) {
        return;
      }
      if (e.button !== undefined && e.button !== 0) {
        return;
      }
      if (editorStateRef.current) {
        return;
      }
      dragSessionCleanupRef.current?.();

      const colEl = e.currentTarget as HTMLElement | undefined;
      const colRect = colEl?.getBoundingClientRect?.();
      if (!colRect) {
        return;
      }
      const dayKey = formatDateKey(day);
      const anchorRaw = yToMinutes(e.clientY - colRect.top, hourHeight);
      let created = false;
      // The session closure owns the latest sketched range — state updaters
      // must stay pure, so the commit path never reads it back from state.
      let lastRange: CalendarRange | null = null;

      const cleanup = startWebPointerSession({
        pointerType: e.pointerType,
        startX: e.clientX,
        startY: e.clientY,
        onActivate: (pt) => {
          if (!webCreateEnabled) {
            return;
          }
          created = true;
          setScrollLocked(true);
          const raw = yToMinutes(pt.y - colRect.top, hourHeight);
          const range = createRangeFromDrag(day, anchorRaw, raw, slotMinutes);
          lastRange = range;
          setCreateDraft({ dayKey, start: range.start, end: range.end });
        },
        onMove: (pt) => {
          if (!webCreateEnabled) {
            return;
          }
          const raw = yToMinutes(pt.y - colRect.top, hourHeight);
          const range = createRangeFromDrag(day, anchorRaw, raw, slotMinutes);
          lastRange = range;
          setCreateDraft({ dayKey, start: range.start, end: range.end });
        },
        onCommit: () => {
          setScrollLocked(false);
          dragSessionCleanupRef.current = null;
          suppressNextClick();
          if (!created) {
            return;
          }
          const range = lastRange ?? createRangeFromDrag(day, anchorRaw, anchorRaw, slotMinutes);
          // Defer past the release's trailing click: the live-commit panel
          // dismisses on outside press, and the drag's own click
          // would otherwise flash-commit the editor before it can be used.
          // The sketch stays mounted until openEditor swaps it in.
          setTimeout(() => {
            openEditor(dayKey, range);
          }, 0);
        },
        onCancel: () => {
          setCreateDraft(null);
          setScrollLocked(false);
          dragSessionCleanupRef.current = null;
        },
        onTapInstead: () => {
          dragSessionCleanupRef.current = null;
          if (suppressClickRef.current) {
            return;
          }
          const startMin = snapMinutes(anchorRaw, slotMinutes, 'floor');
          onDateSelect?.(dateAtMinutes(day, startMin));
        },
        onSettled: (activated) => {
          if (!activated) {
            dragSessionCleanupRef.current = null;
          }
        },
      });
      dragSessionCleanupRef.current = cleanup;
    },
    [hasDom, webCreateEnabled, hourHeight, slotMinutes, onDateSelect, openEditor, suppressNextClick],
  );

  // ── Native drag (best-effort responder path, day granularity) ────────────
  const endNativeSession = useCallback(
    (opts: { commit: boolean; pageX?: number; pageY?: number }) => {
      const session = nativeSessionRef.current;
      nativeSessionRef.current = null;
      setScrollLocked(false);
      setDragGhost(null);
      setDropTargetKey(null);
      setDraggingEventId(null);
      if (!session?.dragging) {
        return;
      }
      suppressClickRef.current = true;
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
      if (!opts.commit || opts.pageX === undefined || opts.pageY === undefined) {
        return;
      }
      // Remeasure on release — layouts can be stale if anything shifted.
      measureDayLayouts(dayRefs.current, (layouts) => {
        const key =
          findDayKeyAtPoint(opts.pageX!, opts.pageY!, layouts) ??
          findDayKeyAtPoint(opts.pageX!, opts.pageY!, session.layouts);
        commitMoveToKey(session.event, key);
      });
    },
    [commitMoveToKey],
  );

  const handleNativeGrant = useCallback(
    (event: CalendarEvent, e: { nativeEvent?: { pageX?: number; pageY?: number } }) => {
      if (!nativeDragEnabled) {
        return;
      }
      const pageX = e.nativeEvent?.pageX ?? 0;
      const pageY = e.nativeEvent?.pageY ?? 0;
      nativeSessionRef.current = {
        event,
        startX: pageX,
        startY: pageY,
        dragging: false,
        layouts: [],
      };
    },
    [nativeDragEnabled],
  );

  const handleNativeMove = useCallback(
    (e: { nativeEvent?: { pageX?: number; pageY?: number } }) => {
      const session = nativeSessionRef.current;
      if (!session) {
        return;
      }
      const pageX = e.nativeEvent?.pageX ?? 0;
      const pageY = e.nativeEvent?.pageY ?? 0;
      if (!session.dragging) {
        if (Math.hypot(pageX - session.startX, pageY - session.startY) < DRAG_THRESHOLD_PX) {
          return;
        }
        session.dragging = true;
        setScrollLocked(true);
        setDraggingEventId(session.event.id);
        refreshContainerOffset();
        measureDayLayouts(dayRefs.current, (layouts) => {
          if (nativeSessionRef.current) {
            nativeSessionRef.current.layouts = layouts;
          }
        });
      }
      setDragGhost({
        event: session.event,
        x: pageX - containerOffsetRef.current.x + 12,
        y: pageY - containerOffsetRef.current.y + 12,
      });
      setDropTargetKey(findDayKeyAtPoint(pageX, pageY, session.layouts));
    },
    [refreshContainerOffset],
  );

  const handleNativeRelease = useCallback(
    (e: { nativeEvent?: { pageX?: number; pageY?: number } }) => {
      const session = nativeSessionRef.current;
      if (!session) {
        return;
      }
      if (!session.dragging) {
        // Treat as a tap — responders steal onPress when drag is enabled.
        nativeSessionRef.current = null;
        onEventClick?.(session.event);
        return;
      }
      endNativeSession({
        commit: true,
        pageX: e.nativeEvent?.pageX,
        pageY: e.nativeEvent?.pageY,
      });
    },
    [endNativeSession, onEventClick],
  );

  const handleNativeTerminate = useCallback(() => {
    endNativeSession({ commit: false });
  }, [endNativeSession]);

  const getEventDragProps = useCallback(
    (event: CalendarEvent, mode: 'day' | 'slot' = 'day') => {
      const base = { 'data-calendar-event': event.id } as Record<string, unknown>;
      if (webDragEnabled) {
        return {
          ...base,
          onPointerDown: (e: any) => {
            handleEventPointerDown(event, e, mode);
          },
        };
      }
      if (nativeDragEnabled) {
        return {
          ...base,
          // Claim the touch so moves continue outside the chip (ScrollView-safe once dragging).
          onStartShouldSetResponder: () => true,
          onMoveShouldSetResponder: () => true,
          onResponderTerminationRequest: () => !nativeSessionRef.current?.dragging,
          onResponderGrant: (e: any) => {
            handleNativeGrant(event, e);
          },
          onResponderMove: handleNativeMove,
          onResponderRelease: handleNativeRelease,
          onResponderTerminate: handleNativeTerminate,
        };
      }
      return base;
    },
    [
      webDragEnabled,
      nativeDragEnabled,
      handleEventPointerDown,
      handleNativeGrant,
      handleNativeMove,
      handleNativeRelease,
      handleNativeTerminate,
    ],
  );

  // Group events by date key
  const eventsByDate = useMemo(() => {
    const grouped: Record<string, CalendarEvent[]> = {};
    for (const event of events) {
      const key = formatDateKey(event.start);
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(event);
    }
    return grouped;
  }, [events]);

  // -------------------------------------------------------------------------
  // Navigation (direction feeds the slide transition)
  // -------------------------------------------------------------------------
  const goToPrevious = useCallback(() => {
    navDirectionRef.current = -1;
    hasNavigatedRef.current = true;
    setCurrentDate((prev) => {
      if (view === 'month') {
        return addMonths(prev, -1);
      }
      const next = new Date(prev);
      if (view === 'week') {
        next.setDate(prev.getDate() - 7);
      } else {
        next.setDate(prev.getDate() - 1);
      }
      return next;
    });
  }, [view]);

  const goToNext = useCallback(() => {
    navDirectionRef.current = 1;
    hasNavigatedRef.current = true;
    setCurrentDate((prev) => {
      if (view === 'month') {
        return addMonths(prev, 1);
      }
      const next = new Date(prev);
      if (view === 'week') {
        next.setDate(prev.getDate() + 7);
      } else {
        next.setDate(prev.getDate() + 1);
      }
      return next;
    });
  }, [view]);

  const goToToday = useCallback(() => {
    navDirectionRef.current = 0;
    hasNavigatedRef.current = true;
    setCurrentDate(new Date());
  }, []);

  const changeView = useCallback((next: CalendarViewType) => {
    navDirectionRef.current = 0;
    hasNavigatedRef.current = true;
    setView(next);
  }, []);

  // Title
  const displayTitle = useMemo(() => {
    if (view === 'month') {
      return `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    }
    if (view === 'week') {
      const weekDays = getWeekDays(currentDate, firstDayOfWeek);
      const start = weekDays[0];
      const end = weekDays[6];
      if (start.getMonth() === end.getMonth()) {
        return `${monthNames[start.getMonth()]} ${start.getDate()} - ${end.getDate()}, ${start.getFullYear()}`;
      }
      return `${monthNames[start.getMonth()]} ${start.getDate()} - ${monthNames[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`;
    }
    return `${weekdayNames[currentDate.getDay()]}, ${monthNames[currentDate.getMonth()]} ${currentDate.getDate()}, ${currentDate.getFullYear()}`;
  }, [currentDate, view, firstDayOfWeek]);

  // -------------------------------------------------------------------------
  // Keyboard focus + screen-reader announcements (Axiom 12)
  // -------------------------------------------------------------------------
  const [focusedDate, setFocusedDate] = useState<Date | null>(null);
  const [focusedSlotMin, setFocusedSlotMin] = useState(9 * 60);
  const [announcement, setAnnouncement] = useState('');
  if (typeof document !== 'undefined') {
    ensureKeyboardModalityTracking();
  }
  const handleBodyFocus = useCallback(() => {
    if (!wasKeyboardFocus()) {
      return;
    }
    setFocusedDate((prev) => prev ?? currentDate);
  }, [currentDate]);

  useEffect(() => {
    // aria-live: announce period/view changes only after user navigation.
    if (hasNavigatedRef.current) {
      setAnnouncement(displayTitle);
    }
  }, [displayTitle]);

  const focusedDayKey = focusedDate ? formatDateKey(focusedDate) : null;

  const focusCellId = focusedDayKey
    ? view === 'month'
      ? `${calendarId}-day-${focusedDayKey}`
      : `${calendarId}-slot-cursor`
    : undefined;

  const handleBodyKeyDown = useCallback(
    (e: { key: string; preventDefault?: () => void; stopPropagation?: () => void }) => {
      if (editorStateRef.current) {
        return;
      }
      const key = e.key;
      const arrows = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
      if (arrows.includes(key)) {
        e.preventDefault?.();
        const base = focusedDate ?? currentDate;
        if (!focusedDate) {
          setFocusedDate(base);
          setAnnouncement(formatDayLong(base));
          return;
        }
        if (view !== 'month' && (key === 'ArrowUp' || key === 'ArrowDown')) {
          const nextMin = moveFocusSlot(focusedSlotMin, key, slotMinutes);
          setFocusedSlotMin(nextMin);
          setAnnouncement(
            `${formatDayLong(base)}, ${formatTimeRangeLabel(
              dateAtMinutes(base, nextMin),
              dateAtMinutes(base, nextMin + slotMinutes),
            )}`,
          );
          return;
        }
        // Horizontal arrows follow the VISUAL axis (WAI-ARIA grid pattern):
        // under RTL the next day sits to the LEFT, so swap left/right before
        // the direction-agnostic date math in moveFocusDate.
        const logicalKey =
          isRTL && key === 'ArrowLeft' ? 'ArrowRight' : isRTL && key === 'ArrowRight' ? 'ArrowLeft' : key;
        const next = moveFocusDate(base, logicalKey as any, view);
        setFocusedDate(next);
        setAnnouncement(formatDayLong(next));
        // Crossing the visible period navigates it (direction-aware slide).
        const delta = next.getTime() - base.getTime();
        if (view === 'month' && next.getMonth() !== currentDate.getMonth()) {
          navDirectionRef.current = delta > 0 ? 1 : -1;
          hasNavigatedRef.current = true;
          setCurrentDate(next);
        } else if (view === 'week') {
          const visible = getWeekDays(currentDate, firstDayOfWeek).map(formatDateKey);
          if (!visible.includes(formatDateKey(next))) {
            navDirectionRef.current = delta > 0 ? 1 : -1;
            hasNavigatedRef.current = true;
            setCurrentDate(next);
          }
        } else if (view === 'day' && !isSameDay(next, currentDate)) {
          navDirectionRef.current = delta > 0 ? 1 : -1;
          hasNavigatedRef.current = true;
          setCurrentDate(next);
        }
        return;
      }
      if (key === 'Enter' && focusedDate) {
        e.preventDefault?.();
        if (view === 'month') {
          onDateSelect?.(focusedDate);
          return;
        }
        const start = dateAtMinutes(focusedDate, focusedSlotMin);
        if (onEventCreate) {
          openEditor(formatDateKey(focusedDate), {
            start,
            end: dateAtMinutes(focusedDate, focusedSlotMin + slotMinutes),
          });
        } else {
          onDateSelect?.(start);
        }
      }
    },
    [
      focusedDate,
      currentDate,
      view,
      focusedSlotMin,
      slotMinutes,
      firstDayOfWeek,
      isRTL,
      onDateSelect,
      onEventCreate,
      openEditor,
    ],
  );

  // -------------------------------------------------------------------------
  // Shared event chip / block a11y + press wiring
  // -------------------------------------------------------------------------
  const eventA11yProps = useCallback(
    (event: CalendarEvent) =>
      ({
        role: 'button',
        tabIndex: 0,
        'aria-label': eventAccessibleLabel(event),
        outlineWidth: 0,
        focusStyle: { outlineWidth: 0 },
        focusVisibleStyle: ensureFocusVisibleRing({ outlineOffset: -2 }),
        onKeyDown: (ke: any) => {
          if (ke.key === 'Enter' || ke.key === ' ') {
            ke.preventDefault?.();
            ke.stopPropagation?.();
            onEventClick?.(event);
          }
        },
      }) as Record<string, unknown>,
    [onEventClick],
  );

  const renderEventBadge = useCallback(
    (event: CalendarEvent, compact = false) => {
      const dragProps = getEventDragProps(event, 'day') as any;
      const lifted = draggingEventId === event.id;
      if (renderEvent) {
        if (!dragEnabled) {
          // Custom renderers often return fragments/arrays; keep a stable key here.
          return <React.Fragment key={event.id}>{renderEvent(event)}</React.Fragment>;
        }
        // Wrap custom content so it stays draggable (FrappeCalendar always
        // bridges renderEvent, so drag must not depend on the default chip).
        return (
          <YStack key={event.id} cursor={webDragEnabled ? 'grab' : undefined} opacity={lifted ? 0.4 : 1} {...dragProps}>
            {renderEvent(event)}
          </YStack>
        );
      }
      return (
        <YStack
          key={event.id}
          {...knobProps.borderRadius}
          backgroundColor={(event.color || '$accentBackground') as any}
          padding={compact ? '$1' : '$2'}
          // Month-view chips measured 23px tall — floor the visual
          // box at 24 and fill the rest of the 44 target with hit slop (real
          // 44 chips would break stacked chips inside month cells).
          minHeight={MONTH_CHIP_MIN_PX}
          justifyContent="center"
          hitSlop={pressTargetHitSlop(compact ? MONTH_CHIP_MIN_PX : 32)}
          opacity={lifted ? 0.4 : 1}
          hoverStyle={{ opacity: lifted ? 0.4 : 0.9 }}
          pressStyle={{ opacity: 0.8 }}
          cursor={webDragEnabled ? 'grab' : 'pointer'}
          {...eventA11yProps(event)}
          {...dragProps}
          // Native drag responders own the tap → click is handled on release.
          onPress={
            nativeDragEnabled
              ? undefined
              : (e) => {
                  (e as any)?.stopPropagation?.();
                  if (suppressClickRef.current) {
                    return;
                  }
                  onEventClick?.(event);
                }
          }>
          <Text
            {...knobProps.body}
            fontSize={compact ? '$1' : '$2'}
            numberOfLines={compact ? 1 : 2}
            color={eventChipTextColor(event.color, onAccent)}>
            {event.title}
          </Text>
        </YStack>
      );
    },
    [
      renderEvent,
      onEventClick,
      knobProps.borderRadius,
      dragEnabled,
      webDragEnabled,
      nativeDragEnabled,
      getEventDragProps,
      eventA11yProps,
      draggingEventId,
      onAccent,
    ],
  );

  // -------------------------------------------------------------------------
  // Month view
  // -------------------------------------------------------------------------
  const MONTH_VISIBLE_EVENTS = 3;

  const renderMonthView = () => {
    const monthDays = getMonthDays(currentDate, firstDayOfWeek);
    const totalWeeks = Math.ceil(monthDays.length / 7);

    // Fit-first row floor (frame containment): the comfort floor
    // (size-stepped density) holds while the whole month fits the measured
    // body; when it would slice the last week at the panel edge, rows relax
    // to the hard floor so the month fits whole. Only below the hard floor
    // does the grid scroll — and then the window is sized to a whole-row
    // boundary, so no week row is sliced mid-row at rest.
    let monthRowMinHeight = monthCellMinHeight;
    if (monthBodyHeight > 0 && totalWeeks * monthCellMinHeight > monthBodyHeight) {
      monthRowMinHeight =
        totalWeeks * monthRowHardFloor <= monthBodyHeight
          ? monthRowHardFloor
          : monthBodyHeight / Math.max(1, Math.floor(monthBodyHeight / monthRowHardFloor));
    }

    const weekdayHeaders: string[] = [];
    for (let i = 0; i < 7; i++) {
      weekdayHeaders.push(weekdayNames[(firstDayOfWeek + i) % 7]);
    }

    return (
      <YStack
        flex={1}
        role="grid"
        aria-label={t('Calendar')}
        tabIndex={0}
        aria-activedescendant={focusCellId}
        onFocus={handleBodyFocus}
        onKeyDown={handleBodyKeyDown as any}
        outlineWidth={0}
        {...{ 'data-calendar-body': view }}>
        <XStack {...hairline.bottom} borderColor="$borderColor" role="row">
          {weekdayHeaders.map((day) => (
            <YStack
              key={day}
              flex={1}
              padding="$2"
              alignItems="center"
              role="columnheader"
              {...{ backgroundColor: componentColors.surface.background }}>
              <Text {...nestedKnobs.label} fontWeight="500" color={knobProps.textAccentColor}>
                {day}
              </Text>
            </YStack>
          ))}
        </XStack>
        {/* flexGrow content: week rows stretch to share the panel height so a
            5/6-week month fits without slicing the last row; scroll engages
            only below the per-row hard floor. */}
        <ScrollView
          flex={1}
          scrollEnabled={!scrollLocked}
          contentContainerStyle={{ flexGrow: 1 }}
          onLayout={(e) => {
            const next = e.nativeEvent.layout.height;
            setMonthBodyHeight((prev) => (prev === next ? prev : next));
          }}>
          <YStack flex={1}>
            {Array.from({ length: totalWeeks }).map((_, weekIndex, weeks) => (
              // basis:auto (not flex={1}): rows grow from their content and
              // share only the EXTRA space, so a crowded cell can never be
              // sliced by a fixed row share; scroll engages past the floor.
              <XStack
                key={weekIndex}
                flexGrow={1}
                flexShrink={0}
                flexBasis="auto"
                minHeight={monthRowMinHeight}
                role="row">
                {monthDays.slice(weekIndex * 7, (weekIndex + 1) * 7).map((day, dayIndex) => {
                  const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                  const dayKey = formatDateKey(day);
                  const dayEvents = eventsByDate[dayKey] || [];
                  const isDropTarget = dragGhost !== null && dropTargetKey === dayKey;
                  const isFocused = focusedDayKey === dayKey;
                  const hiddenCount = dayEvents.length - MONTH_VISIBLE_EVENTS;
                  const today = isToday(day);

                  return (
                    <YStack
                      key={day.toISOString()}
                      id={`${calendarId}-day-${dayKey}`}
                      {...({ role: 'gridcell' } as any)}
                      aria-selected={isFocused || undefined}
                      aria-label={
                        dayEvents.length > 0
                          ? `${formatDayLong(day)}, ${withInterp(t('{{count}} events'), {
                              count: dayEvents.length,
                            })}`
                          : formatDayLong(day)
                      }
                      ref={
                        nativeDragEnabled
                          ? (node: MeasurableDayNode | null) => {
                              registerDayRef(dayKey, node);
                            }
                          : undefined
                      }
                      flex={1}
                      minHeight={monthRowMinHeight}
                      // Interior hairline separators only — the panel frame
                      // owns the outer edge (OPTICS: one device pixel, no
                      // doubled rules at the last column/row).
                      {...gridCellEdges(dayIndex < 6, weekIndex < weeks.length - 1)}
                      borderColor="$borderColor"
                      backgroundColor={
                        isDropTarget
                          ? '$accentBackground'
                          : isCurrentMonth
                            ? '$background'
                            : componentColors.surface.background
                      }
                      padding={cellPad}
                      gap={chipGap}
                      outlineWidth={0}
                      {...{ 'data-calendar-day': dayKey }}
                      onPress={() => {
                        if (suppressClickRef.current) {
                          return;
                        }
                        onDateSelect?.(day);
                      }}
                      cursor="pointer"
                      hoverStyle={{ backgroundColor: componentColors.surface.background }}>
                      <XStack justifyContent="flex-end" paddingInlineEnd="$1">
                        <DayNumberDisc
                          date={day}
                          today={today}
                          inMonth={isCurrentMonth}
                          focused={isFocused}
                          onAccent={onAccent}
                          nestedPx={nestedPx}
                          nestedHitSlop={nestedHitSlop}
                          nestedBox={nestedBox}
                          label={nestedKnobs.label}
                        />
                      </XStack>
                      <YStack gap={chipGap}>
                        {dayEvents.slice(0, MONTH_VISIBLE_EVENTS).map((event) => renderEventBadge(event, true))}
                        {hiddenCount > 0 && (
                          <FloatingPanel
                            open={overflowDayKey === dayKey}
                            onOpenChange={(open) => {
                              setOverflowDayKey(open ? dayKey : null);
                            }}
                            fitContent
                            trigger={
                              <XStack
                                role="button"
                                aria-label={withInterp(t('Show all {{count}} events'), {
                                  count: dayEvents.length,
                                })}
                                cursor="pointer"
                                paddingInlineStart="$1"
                                hitSlop={nestedHitSlop}
                                // Web: keep the "+N more" press from also selecting
                                // the day cell. Native must not stop propagation —
                                // the sheet trigger's own press lives on a parent.
                                onPress={isWeb ? (e: any) => e?.stopPropagation?.() : undefined}
                                hoverStyle={{ opacity: 0.7 }}
                                {...{ 'data-calendar-overflow': String(hiddenCount) }}>
                                <Text fontSize="$1" color={knobProps.textAccentColor}>
                                  {withInterp(t('+{{count}} more'), { count: hiddenCount })}
                                </Text>
                              </XStack>
                            }>
                            <YStack gap="$1" minWidth={220} {...{ 'data-calendar-overflow-panel': dayKey }}>
                              <Text {...knobProps.heading} fontSize="$3">
                                {formatDayLong(day)}
                              </Text>
                              {dayEvents.map((event) => renderEventBadge(event, false))}
                            </YStack>
                          </FloatingPanel>
                        )}
                      </YStack>
                    </YStack>
                  );
                })}
              </XStack>
            ))}
          </YStack>
        </ScrollView>
      </YStack>
    );
  };

  // -------------------------------------------------------------------------
  // Time grid (week + day views)
  // -------------------------------------------------------------------------
  const timeGridScrollRef = useRef<any>(null);
  const gridHeight = 24 * hourHeight;

  useEffect(() => {
    if (view === 'month') {
      return;
    }
    // Land on the working morning (or the now line) instead of midnight.
    const target = Math.max(0, minutesToY(7 * 60, hourHeight) - 8);
    timeGridScrollRef.current?.scrollTo?.({ y: target, animated: false });
  }, [view, hourHeight]);

  const renderTimedBlock = (event: CalendarEvent, layout: { column: number; columns: number }) => {
    const preview = resizePreview?.id === event.id ? resizePreview : null;
    const start = preview ? preview.start : event.start;
    const end = preview ? preview.end : (event.end ?? event.start);
    const startMin = minutesOfDay(start);
    const endMin = Math.max(startMin + slotMinutes, startMin + (end.getTime() - start.getTime()) / 60000);
    const top = minutesToY(startMin, hourHeight);
    const blockHeight = Math.max(MIN_BLOCK_PX, minutesToY(endMin - startMin, hourHeight));
    const widthPct = 100 / layout.columns;
    // Overlap columns progress in READING direction (P-16): the physical
    // left offset is JS-computed %, so mirror it from the direction source.
    const leftPct = (isRTL ? layout.columns - 1 - layout.column : layout.column) * widthPct;
    const lifted = draggingEventId === event.id;
    const zoneInner = Math.min(RESIZE_ZONE_PX / 2, blockHeight / 2);
    const dragProps = getEventDragProps(event, 'slot') as any;

    return (
      <YStack
        key={event.id}
        position="absolute"
        top={top}
        height={blockHeight}
        left={`${leftPct}%` as any}
        width={`${widthPct}%` as any}
        paddingInlineEnd={2}
        zIndex={preview ? 4 : 2}
        // Committed/reverted/snapped geometry jumps tween on web.
        transition={webLayoutTransition as any}>
        <YStack
          flex={1}
          {...knobProps.borderRadius}
          backgroundColor={(event.color || '$accentBackground') as any}
          padding="$1"
          overflow="hidden"
          opacity={lifted ? 0.4 : 1}
          borderWidth={1}
          borderColor="$background"
          cursor={webDragEnabled ? 'grab' : 'pointer'}
          {...eventA11yProps(event)}
          {...dragProps}
          onPress={
            nativeDragEnabled
              ? undefined
              : (e) => {
                  (e as any)?.stopPropagation?.();
                  if (suppressClickRef.current) {
                    return;
                  }
                  onEventClick?.(event);
                }
          }>
          {renderEvent ? (
            renderEvent(event)
          ) : (
            <>
              <Text fontSize="$1" fontWeight="600" numberOfLines={1} color={eventChipTextColor(event.color, onAccent)}>
                {event.title}
              </Text>
              {blockHeight >= 34 && (
                <Text fontSize="$1" numberOfLines={1} color={eventChipTextColor(event.color, onAccent)}>
                  {formatTimeRangeLabel(start, end)}
                </Text>
              )}
            </>
          )}
        </YStack>

        {/* Resize handles: 44px hit zones straddling each edge (Axiom 12). */}
        {webResizeEnabled && (
          <>
            <YStack
              position="absolute"
              {...overlayInset}
              top={-RESIZE_ZONE_PX / 2}
              height={RESIZE_ZONE_PX / 2 + zoneInner}
              cursor="ns-resize"
              zIndex={3}
              justifyContent="flex-end"
              alignItems="center"
              paddingBottom={2}
              opacity={0}
              hoverStyle={{ opacity: 1 }}
              onPointerDown={(e: any) => {
                handleResizePointerDown(event, 'start', e);
              }}
              {...{ 'data-calendar-resize': `start:${event.id}` }}>
              <YStack width={28} height={3} borderRadius={2} backgroundColor="$accentColor" />
            </YStack>
            <YStack
              position="absolute"
              {...overlayInset}
              bottom={-RESIZE_ZONE_PX / 2}
              height={RESIZE_ZONE_PX / 2 + zoneInner}
              cursor="ns-resize"
              zIndex={3}
              justifyContent="flex-start"
              alignItems="center"
              paddingTop={2}
              opacity={0}
              hoverStyle={{ opacity: 1 }}
              onPointerDown={(e: any) => {
                handleResizePointerDown(event, 'end', e);
              }}
              {...{ 'data-calendar-resize': `end:${event.id}` }}>
              <YStack width={28} height={3} borderRadius={2} backgroundColor="$accentColor" />
            </YStack>
          </>
        )}

        {/* Live duration label while resizing. */}
        {preview && (
          <YStack
            position="absolute"
            top={-26}
            alignSelf="center"
            backgroundColor="$background"
            {...knobProps.borderRadius}
            borderWidth={1}
            borderColor="$borderColor"
            paddingHorizontal="$2"
            zIndex={5}
            pointerEvents="none"
            {...{ 'data-calendar-resize-label': 'true' }}>
            <Text fontSize="$1" color="$color">
              {formatTimeRangeLabel(preview.start, preview.end)}
            </Text>
          </YStack>
        )}
      </YStack>
    );
  };

  const renderTimeGrid = (days: Date[]) => {
    return (
      <YStack
        flex={1}
        role="grid"
        aria-label={t('Calendar')}
        tabIndex={0}
        aria-activedescendant={focusCellId}
        onFocus={handleBodyFocus}
        onKeyDown={handleBodyKeyDown as any}
        outlineWidth={0}
        {...{ 'data-calendar-body': view }}>
        {/* Day headers */}
        <XStack {...hairline.bottom} borderColor="$borderColor">
          <YStack width={56} />
          {days.map((day) => (
            <YStack
              key={day.toISOString()}
              flex={1}
              padding="$2"
              alignItems="center"
              minHeight={MIN_PRESS_TARGET}
              cursor="pointer"
              {...{ backgroundColor: componentColors.surface.background }}
              onPress={() => {
                if (suppressClickRef.current) {
                  return;
                }
                onDateSelect?.(day);
              }}>
              <Text {...nestedKnobs.label} fontWeight="500" color={knobProps.textAccentColor}>
                {weekdayNames[day.getDay()]}
              </Text>
              <DayNumberDisc
                date={day}
                today={isToday(day)}
                inMonth
                focused={false}
                onAccent={onAccent}
                nestedPx={nestedPx}
                nestedHitSlop={nestedHitSlop}
                nestedBox={nestedBox}
                label={nestedKnobs.label}
              />
            </YStack>
          ))}
        </XStack>

        {/* All-day / untimed strip (also the day-granularity drop row) */}
        <XStack {...hairline.bottom} borderColor="$borderColor" minHeight={MIN_PRESS_TARGET}>
          <YStack width={56} justifyContent="center" alignItems="flex-end" paddingInlineEnd="$2">
            <Text fontSize="$1" color={knobProps.textAccentColor}>
              {t('All day')}
            </Text>
          </YStack>
          {days.map((day) => {
            const dayKey = formatDateKey(day);
            const dayEvents = (eventsByDate[dayKey] || []).filter((ev) => !isTimedEvent(ev));
            const isDropTarget = dragGhost !== null && dropTargetKey === dayKey;
            return (
              <YStack
                key={day.toISOString()}
                flex={1}
                {...hairlineEnd}
                borderColor="$borderColor"
                padding="$1"
                gap="$1"
                backgroundColor={isDropTarget ? '$accentBackground' : undefined}
                {...{ 'data-calendar-day': dayKey }}
                ref={
                  nativeDragEnabled
                    ? (node: MeasurableDayNode | null) => {
                        registerDayRef(`allday:${dayKey}`, node);
                      }
                    : undefined
                }
                onPress={() => {
                  if (suppressClickRef.current) {
                    return;
                  }
                  onDateSelect?.(day);
                }}>
                {dayEvents.map((event) => renderEventBadge(event, true))}
              </YStack>
            );
          })}
        </XStack>

        {/* Time grid body */}
        <ScrollView ref={timeGridScrollRef} flex={1} scrollEnabled={!scrollLocked}>
          <XStack>
            {/* Hour gutter */}
            <YStack width={56}>
              {hours.map((hour) => (
                <YStack key={hour} height={hourHeight} alignItems="flex-end" paddingInlineEnd="$2">
                  <Text fontSize="$1" color={knobProps.textAccentColor}>
                    {formatHour(hour)}
                  </Text>
                </YStack>
              ))}
            </YStack>

            {days.map((day) => {
              const dayKey = formatDateKey(day);
              const dayEvents = (eventsByDate[dayKey] || []).filter(isTimedEvent);
              const blocks = layoutDayBlocks(
                dayEvents.map((ev) => ({
                  id: ev.id,
                  startMin: minutesOfDay(ev.start),
                  endMin: Math.min(
                    MINUTES_PER_DAY,
                    Math.max(
                      minutesOfDay(ev.start) + slotMinutes,
                      minutesOfDay(ev.start) + ((ev.end?.getTime() ?? ev.start.getTime()) - ev.start.getTime()) / 60000,
                    ),
                  ),
                })),
              );
              const byId = new Map(dayEvents.map((ev) => [ev.id, ev]));
              const isSlotTargetDay = slotTarget?.dayKey === dayKey;
              const draftHere = createDraft?.dayKey === dayKey ? createDraft : null;
              const editorHere = editorState?.dayKey === dayKey ? editorState : null;
              const focusHere = view !== 'month' && focusedDayKey === dayKey;

              return (
                <YStack
                  key={day.toISOString()}
                  flex={1}
                  height={gridHeight}
                  position="relative"
                  {...hairlineEnd}
                  borderColor="$borderColor"
                  {...{ 'data-calendar-timecol': dayKey }}
                  ref={
                    nativeDragEnabled
                      ? (node: MeasurableDayNode | null) => {
                          registerDayRef(dayKey, node);
                        }
                      : undefined
                  }
                  onPointerDown={
                    hasDom
                      ? (e: any) => {
                          handleGridPointerDown(day, e);
                        }
                      : undefined
                  }>
                  {/* Hour lines */}
                  {hours.map((hour) => (
                    <YStack
                      key={hour}
                      height={hourHeight}
                      {...hairline.bottom}
                      borderColor={componentColors.divider}
                      pointerEvents="none"
                    />
                  ))}

                  {/* Timed events */}
                  {blocks.map((block) => {
                    const event = byId.get(block.id);
                    if (!event) {
                      return null;
                    }
                    return renderTimedBlock(event, block);
                  })}

                  {/* Drop-target slot highlight (ramp tint) */}
                  {isSlotTargetDay && slotTarget && (
                    <YStack
                      position="absolute"
                      {...overlayInset}
                      top={minutesToY(slotTarget.startMin, hourHeight)}
                      height={Math.max(MIN_BLOCK_PX, minutesToY(slotTarget.durationMin, hourHeight))}
                      backgroundColor="$accentBackground"
                      opacity={0.25}
                      {...knobProps.borderRadius}
                      borderWidth={1}
                      borderColor="$accentColor"
                      pointerEvents="none"
                      zIndex={1}
                      {...{ 'data-calendar-slot-target': 'true' }}
                    />
                  )}

                  {/* Drag-to-create sketch */}
                  {draftHere && !editorHere && (
                    <YStack
                      position="absolute"
                      {...overlayInset}
                      top={minutesToY(minutesOfDay(draftHere.start), hourHeight)}
                      height={Math.max(
                        MIN_BLOCK_PX,
                        minutesToY((draftHere.end.getTime() - draftHere.start.getTime()) / 60000, hourHeight),
                      )}
                      backgroundColor="$accentBackground"
                      opacity={0.45}
                      {...knobProps.borderRadius}
                      borderWidth={1}
                      borderColor="$accentColor"
                      pointerEvents="none"
                      zIndex={4}
                      transition={webLayoutTransition as any}
                      {...{ 'data-calendar-create-draft': 'true' }}>
                      <Text fontSize="$1" color="$accentColor" padding="$1" numberOfLines={1}>
                        {formatTimeRangeLabel(draftHere.start, draftHere.end)}
                      </Text>
                    </YStack>
                  )}

                  {/* Draft block + live-commit editor */}
                  {editorHere && (
                    <YStack
                      position="absolute"
                      {...overlayInset}
                      top={minutesToY(minutesOfDay(editorHere.start), hourHeight)}
                      height={Math.max(
                        MIN_BLOCK_PX + 6,
                        minutesToY((editorHere.end.getTime() - editorHere.start.getTime()) / 60000, hourHeight),
                      )}
                      zIndex={5}>
                      <FloatingPanel
                        open
                        onOpenChange={(open) => {
                          if (!open) {
                            commitEditor();
                          }
                        }}
                        fitContent
                        trigger={
                          <YStack
                            {...knobProps.borderRadius}
                            height="100%"
                            backgroundColor="$accentBackground"
                            opacity={0.9}
                            borderWidth={1}
                            borderColor="$accentColor"
                            padding="$1"
                            overflow="hidden"
                            {...{ 'data-calendar-editor-block': 'true' }}>
                            <Text fontSize="$1" fontWeight="600" color="$accentColor" numberOfLines={1}>
                              {draftTitle || t('New event')}
                            </Text>
                          </YStack>
                        }>
                        <YStack gap="$2" minWidth={240} {...{ 'data-calendar-create-editor': 'true' }}>
                          <Input
                            label={t('Title')}
                            placeholder={t('New event')}
                            value={draftTitle}
                            onChangeText={setDraftTitle}
                            inputProps={{ autoFocus: true } as any}
                          />
                          <Text fontSize="$2" color={knobProps.textAccentColor}>
                            {`${formatDayLong(editorHere.start)}, ${formatTimeRangeLabel(
                              editorHere.start,
                              editorHere.end,
                            )}`}
                          </Text>
                          <Text fontSize="$1" color={knobProps.textAccentColor}>
                            {t('Changes apply when the editor closes')}
                          </Text>
                        </YStack>
                      </FloatingPanel>
                    </YStack>
                  )}

                  {/* Keyboard slot cursor (discrete moves tween — Axiom 4) */}
                  {focusHere && wasKeyboardFocus() && (
                    <YStack
                      id={`${calendarId}-slot-cursor`}
                      {...({ role: 'gridcell' } as any)}
                      aria-label={`${formatDayLong(day)}, ${formatTimeRangeLabel(
                        dateAtMinutes(day, focusedSlotMin),
                        dateAtMinutes(day, focusedSlotMin + slotMinutes),
                      )}`}
                      position="absolute"
                      {...overlayInset}
                      top={minutesToY(focusedSlotMin, hourHeight)}
                      height={minutesToY(slotMinutes, hourHeight)}
                      {...knobProps.borderRadius}
                      {...keyboardFocusRingProps}
                      pointerEvents="none"
                      zIndex={3}
                      transition={webLayoutTransition as any}
                      {...{ 'data-calendar-slot-cursor': 'true' }}
                    />
                  )}

                  {/* Now indicator */}
                  {isToday(day) && <NowIndicator hourHeight={hourHeight} />}
                </YStack>
              );
            })}
          </XStack>
        </ScrollView>
      </YStack>
    );
  };

  const renderWeekView = () => renderTimeGrid(getWeekDays(currentDate, firstDayOfWeek));
  const renderDayView = () => renderTimeGrid([currentDate]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  // Enter/exit variants need a live transition token — at
  // animation:none we omit all three so switches are instant (AnimatePresence
  // then unmounts the leaving period between frames). Physical direction
  // mirrors under RTL so "next" enters from the reading end.
  // `initial={false}` keeps first paint settled (mount is not a jump).
  const physicalDir = navDirectionRef.current * (isRTL ? -1 : 1);
  const bodyEnterVariant = !transition
    ? undefined
    : physicalDir > 0
      ? 'fromEnd'
      : physicalDir < 0
        ? 'fromStart'
        : 'fade';
  const bodyExitVariant = !transition
    ? undefined
    : physicalDir > 0
      ? 'fromStart'
      : physicalDir < 0
        ? 'fromEnd'
        : 'fade';

  return (
    <YStack
      height={height}
      position="relative"
      overflow="hidden"
      backgroundColor="$background"
      // Panel-tier lift follows the elevation knob (the calendar frame
      // is a themed surface, same as Dashboard cards / Kanban columns).
      elevation={knobProps.elevation}
      ref={
        nativeDragEnabled
          ? (node: MeasurableDayNode | null) => {
              containerNodeRef.current = node;
              refreshContainerOffset();
            }
          : undefined
      }
      onLayout={nativeDragEnabled ? refreshContainerOffset : undefined}
      {...stackProps}>
      {/* Header */}
      {(showNavigation || showViewSwitcher) && (
        <XStack
          {...knobProps.panelPadding}
          alignItems="center"
          justifyContent="space-between"
          {...hairline.bottom}
          borderColor="$borderColor">
          {showNavigation && (
            <XStack gap="$2" alignItems="center">
              <Button size={knobProps.sizeToken} onPress={goToPrevious} aria-label={t('Previous')}>
                {'<'}
              </Button>
              <Button size={knobProps.sizeToken} onPress={goToToday}>
                {t('Today')}
              </Button>
              <Button size={knobProps.sizeToken} onPress={goToNext} aria-label={t('Next')}>
                {'>'}
              </Button>
            </XStack>
          )}

          {/* Period title is the panel's section heading — shared scale;
              family still follows the heading font knob. */}
          <Text {...knobProps.heading} {...sectionHeading}>
            {displayTitle}
          </Text>

          {showViewSwitcher && (
            /* Canonical fused view picker: brings
               the 44px press-target floor + hitSlop (SP-FIXED) and the
               keyboard focus ring the hand-rolled ToggleGroup lacked. */
            <ViewSwitcher
              views={[
                { type: 'month', label: t('Month') },
                { type: 'week', label: t('Week') },
                { type: 'day', label: t('Day') },
              ]}
              currentView={view}
              onViewChange={(val) => {
                changeView(val as CalendarViewType);
              }}
            />
          )}
        </XStack>
      )}

      {/* aria-live region: period + focus announcements (visually hidden) */}
      <YStack
        position="absolute"
        width={1}
        height={1}
        overflow="hidden"
        opacity={0}
        pointerEvents="none"
        aria-live="polite"
        {...{ 'data-calendar-live': 'true' }}>
        <Text>{announcement}</Text>
      </YStack>

      {/* Calendar Body — view/period switches slide+fade with PAIRED
          enter/exit: the leaving period exits toward where it came
          from while the new one slides in from the reading-direction end.
          Children are keyed per period inside one persistent AnimatePresence
          (keying the presence itself would drop the exit — the old wrapper
          unmounts before it can animate). `fullscreen` keeps both periods
          overlaid during the crossfade instead of stacking in flow. */}
      <YStack flex={1} overflow="hidden" position="relative">
        <AnimatePresence initial={false} enterVariant={bodyEnterVariant} exitVariant={bodyExitVariant}>
          <CalendarSlide
            key={motionKey}
            fullscreen
            x={0}
            opacity={1}
            transition={transition as any}
            {...{ 'data-calendar-motion': motionKey }}>
            {view === 'month' && renderMonthView()}
            {view === 'week' && renderWeekView()}
            {view === 'day' && renderDayView()}
          </CalendarSlide>
        </AnimatePresence>
      </YStack>

      {/* Drag ghost following the pointer / finger (lifted: shadow + scale) */}
      {dragGhost && (
        <YStack
          pointerEvents="none"
          {...knobProps.borderRadius}
          backgroundColor={(dragGhost.event.color || '$accentBackground') as any}
          padding="$1"
          opacity={0.95}
          scale={1.03}
          {...({
            'data-calendar-drag-ghost': true,
            ...(isWeb
              ? {
                  style: {
                    position: 'fixed',
                    left: dragGhost.x + 12,
                    top: dragGhost.y + 12,
                    // Sheet tier (Axiom 14): the ghost tracks the pointer
                    // above page content and sticky chrome.
                    zIndex: zIndex.sheet,
                    maxWidth: 220,
                    boxShadow: LIFT_SHADOW,
                  },
                }
              : {
                  position: 'absolute',
                  left: dragGhost.x,
                  top: dragGhost.y,
                  zIndex: zIndex.sheet,
                  maxWidth: 220,
                  shadowColor: '$shadowColor',
                  shadowOffset: { width: 0, height: 6 },
                  shadowRadius: 12,
                  shadowOpacity: 0.3,
                  elevation: 8,
                }),
          } as any)}>
          <Text fontSize="$2" numberOfLines={1} color={eventChipTextColor(dragGhost.event.color, onAccent)}>
            {dragGhost.event.title}
          </Text>
        </YStack>
      )}

      {/* FLIP settle: drop/cancel tweens the ghost into its final slot */}
      {settle && isWeb && (
        <SettleGhost
          key={settle.key}
          settle={settle}
          transition={transition as any}
          borderRadius={knobProps.borderRadius as any}
          onDone={clearSettle}
        />
      )}
    </YStack>
  );
}
