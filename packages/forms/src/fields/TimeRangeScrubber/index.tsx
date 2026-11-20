import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react';
import {
  defaultKnobs,
  ensureFocusVisibleRing,
  ensureKeyboardModalityTracking,
  FOCUS_RING_HALO_OFFSET,
  formatAbsoluteDateTime,
  pressTargetHitSlop,
  usePresetContext,
  wasKeyboardFocus,
} from '@repo/theme';
import type { BorderRadius } from '@repo/theme';
import { useCallback, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode, RefObject } from 'react';
import type { LabelProps, SizeTokens, TamaguiElement, TransitionProp } from 'tamagui';
import { Text, View, XStack, YStack, isWeb, useTheme } from 'tamagui';

import { Field, FieldLayout } from '../../FieldLayout';
import { FloatingPanel } from '../../FloatingPanel';
import { formInputColors } from '../../shared/color-ramps';
import { t } from '../../shared/t';
import { getFieldError, useFormField, useResolvedValidators } from '../../shared/utils';
import type { FieldValidators } from '../../shared/utils';
import { Skeleton } from '../../Skeleton';
import type { AnyFormApi } from '../../types';
import type { DateRange } from '../DatePicker/DateRangePicker';

import {
  AXIS_BAND,
  BRUSH_BAND_HEIGHT,
  BRUSH_HANDLE,
  CAP_HEIGHT,
  CAP_RADIUS,
  CHIP_HEIGHT,
  CHIP_RADIUS,
  DEFAULT_QUICK_RANGES,
  DEFAULT_TRAILING_WINDOW_MS,
  FRAME_TICK,
  KEY_TICK,
  PLAYHEAD_WIDTH,
  TOUCH_HOLD_MS,
  activityUnder,
  applyQuickRange,
  assertAbsoluteDateRange,
  clampCapLeft,
  clampRangeToWindow,
  defaultWindow,
  formatDurationMs,
  fractionToTime,
  getScrubberGripRenderSize,
  keysInTrailingWindow,
  latestFrameAtOrBefore,
  matchingQuickRange,
  nearestFrame,
  nudgeWindow,
  rectHitSlop,
  resolveScrubberRadius,
  resolveScrubberTransition,
  snapTime,
  stepTime,
  timeToFraction,
} from './geometry';
import type { ActivitySpan, QuickRange, ScrubberSession, SnapTo, TimeWindow } from './geometry';

export type { DateRange } from '../DatePicker/DateRangePicker';
export {
  AXIS_BAND,
  DEFAULT_QUICK_RANGES,
  DEFAULT_TRAILING_WINDOW_MS,
  TOUCH_HOLD_MS,
  applyQuickRange,
  assertAbsoluteDateRange,
  clampCapLeft,
  getScrubberGripRenderSize,
  resolveScrubberRadius,
} from './geometry';
export type { ActivitySpan, QuickRange, SnapTo, TimeWindow } from './geometry';

const ACTIVITY_BAR_HEIGHT = 7;

const NO_FRAMES: Date[] = [];
const NO_ACTIVITY: ActivitySpan[] = [];
const NO_KEYS: Date[] = [];

export interface TimeRangeScrubberProps {
  name?: string;
  form?: AnyFormApi;
  validators?: FieldValidators;
  label?: ReactNode;
  labelProps?: Omit<LabelProps, 'htmlFor' | 'ref'>;
  helperText?: string;
  error?: string | boolean;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  size?: SizeTokens;
  id?: string;
  skeleton?: boolean;
  compact?: boolean;
  /** DateRangePicker value — `{ start: Date | null; end: Date | null }`. */
  value?: DateRange | null;
  defaultValue?: DateRange | null;
  onChange?: (value: DateRange | null) => void;
  onBlur?: (...args: unknown[]) => void;
  /** Visible axis window. Defaults to the value, or the last 30 minutes. */
  window?: TimeWindow;
  onWindowChange?: (next: TimeWindow) => void;
  /** Transient playhead. Beside the value, never inside it. */
  scrubTime?: Date | null;
  defaultScrubTime?: Date | null;
  onScrub?: (time: Date) => void;
  frames?: Date[];
  activity?: ActivitySpan[];
  keys?: Date[];
  /** Keys lane reads `[t−N, t]`. Default 10 s. */
  trailingWindow?: number;
  snapTo?: SnapTo;
  gridStepMs?: number;
  quickRanges?: readonly QuickRange[];
  /** Overflow chips open a FloatingPanel (cover contract). */
  maxVisibleQuickRanges?: number;
  /** Test seam so quick ranges write deterministic absolute dates. */
  now?: Date;
  'aria-label'?: string;
}

type DragRole = 'grip' | 'brush-start' | 'brush-end';

const useRadiusStop = (): BorderRadius => {
  const ctx = usePresetContext();
  return ctx?.preset.knobs.borderRadius ?? defaultKnobs.borderRadius;
};

const formatClock = (date: Date): string =>
  date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

const formatRangeReadout = (range: DateRange | null): string => {
  if (!range?.start || !range.end) {
    return '';
  }
  const startText = formatAbsoluteDateTime(range.start, {
    year: 'always',
    seconds: true,
    hour12: false,
  });
  const sameDay = range.start.toDateString() === range.end.toDateString();
  const endText = sameDay
    ? formatClock(range.end)
    : formatAbsoluteDateTime(range.end, { year: 'always', seconds: true, hour12: false });
  const span = formatDurationMs(range.end.getTime() - range.start.getTime());
  return `${startText} – ${endText} · ${span}`;
};

const isString = (value: unknown): value is string => typeof value === 'string';

const BRUSH_START = 'brush-start';

const isObject = (value: unknown): value is object => typeof value === 'object' && value !== null;

const CURSOR_LOCKED = 'not-allowed';

const describePlayhead = (time: Date): string => t('Playhead at {{time}}', { time: formatClock(time) });

const describeRange = (range: DateRange): string =>
  t('Range {{start}} to {{end}}', {
    start: range.start ? formatClock(range.start) : t('none'),
    end: range.end ? formatClock(range.end) : t('none'),
  });

interface ScrubberKeyContext {
  locked: boolean;
  gridStepMs: number;
  frames: Date[];
  liftOriginRef: { current: Date | null };
  scrubRef: { current: Date };
  rangeRef: { current: DateRange | null };
  windowRef: { current: TimeWindow };
  emitScrub: (next: Date, nextSession: ScrubberSession) => Date;
  emitRange: (next: DateRange, nextSession: ScrubberSession) => DateRange;
  speak: (message: string) => void;
}

/** The range a keyboard edit starts from: the value, or the whole window when none is set. */
const currentRange = (ctx: ScrubberKeyContext): DateRange => ctx.rangeRef.current ?? ctx.windowRef.current;

const liftOrDrop = (ctx: ScrubberKeyContext, role: DragRole) => {
  if (ctx.liftOriginRef.current) {
    ctx.liftOriginRef.current = null;
    ctx.speak(t('Dropped'));
    return;
  }
  ctx.liftOriginRef.current =
    role === 'grip' ? ctx.scrubRef.current : (ctx.rangeRef.current?.start ?? ctx.scrubRef.current);
  ctx.speak(t('Lifted'));
};

const cancelLift = (ctx: ScrubberKeyContext, role: DragRole) => {
  const origin = ctx.liftOriginRef.current;
  ctx.liftOriginRef.current = null;
  if (!origin) {
    return;
  }
  if (role === 'grip') {
    ctx.emitScrub(origin, 'jump');
  } else {
    ctx.emitRange({ start: origin, end: ctx.rangeRef.current?.end ?? origin }, 'jump');
  }
  ctx.speak(t('Cancelled'));
};

const jumpToWindowEdge = (ctx: ScrubberKeyContext, role: DragRole, key: 'Home' | 'End') => {
  const target = key === 'Home' ? ctx.windowRef.current.start : ctx.windowRef.current.end;
  if (role === 'grip') {
    ctx.emitScrub(target, 'jump');
    ctx.speak(describePlayhead(target));
    return;
  }
  const current = currentRange(ctx);
  const next = role === BRUSH_START ? { start: target, end: current.end } : { start: current.start, end: target };
  ctx.speak(describeRange(ctx.emitRange(next, 'jump')));
};

const jumpToFrame = (ctx: ScrubberKeyContext, key: '[' | ']') => {
  const next = nearestFrame(ctx.scrubRef.current, ctx.frames, key === ']' ? 1 : -1);
  if (!next) {
    return;
  }
  ctx.emitScrub(next, 'jump');
  ctx.speak(describePlayhead(next));
};

const stepByArrow = (ctx: ScrubberKeyContext, role: DragRole, direction: 1 | -1, shift: boolean) => {
  const session: ScrubberSession = ctx.liftOriginRef.current ? 'drag' : 'jump';
  if (role === 'grip') {
    const next = stepTime(ctx.scrubRef.current, direction, ctx.gridStepMs, shift);
    ctx.speak(describePlayhead(ctx.emitScrub(next, session)));
    return;
  }
  const current = currentRange(ctx);
  const edge =
    role === BRUSH_START ? (current.start ?? ctx.windowRef.current.start) : (current.end ?? ctx.windowRef.current.end);
  const moved = stepTime(edge, direction, ctx.gridStepMs, shift);
  const next = role === BRUSH_START ? { start: moved, end: current.end } : { start: current.start, end: moved };
  ctx.speak(describeRange(ctx.emitRange(next, session)));
};

const ARROW_DIRECTION = new Map<string, 1 | -1>([
  ['ArrowLeft', -1],
  ['ArrowDown', -1],
  ['ArrowRight', 1],
  ['ArrowUp', 1],
]);

const handleScrubberKey = (ctx: ScrubberKeyContext, role: DragRole, event: KeyboardEvent) => {
  if (ctx.locked) {
    return;
  }
  const { key } = event;
  const direction = ARROW_DIRECTION.get(key);
  if (key === ' ' || key === 'Enter') {
    event.preventDefault();
    liftOrDrop(ctx, role);
  } else if (key === 'Escape') {
    event.preventDefault();
    cancelLift(ctx, role);
  } else if (key === 'Home' || key === 'End') {
    event.preventDefault();
    jumpToWindowEdge(ctx, role, key);
  } else if (key === '[' || key === ']') {
    event.preventDefault();
    jumpToFrame(ctx, key);
  } else if (direction !== undefined) {
    event.preventDefault();
    stepByArrow(ctx, role, direction, event.shiftKey);
  }
};

const brushTabIndex = (part: DragRole): number => (part === BRUSH_START ? 2 : 3);

/** Last-rendered values, readable from event handlers without re-subscribing them. */
const useLatestRef = <T,>(value: T) => {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
};

const TimeRangeChip = ({
  label,
  selected,
  disabled,
  onPress,
  part = 'quick-range',
  tabIndex = 0,
}: {
  label: ReactNode;
  selected?: boolean;
  disabled?: boolean;
  onPress: () => void;
  part?: string;
  tabIndex?: number;
}) => (
  <View
    height={CHIP_HEIGHT}
    paddingHorizontal={7}
    borderRadius={CHIP_RADIUS}
    borderWidth={1}
    borderColor={selected ? '$color11' : '$borderColor'}
    backgroundColor={selected ? '$color11' : 'transparent'}
    justifyContent="center"
    alignItems="center"
    cursor={disabled ? CURSOR_LOCKED : 'pointer'}
    opacity={disabled ? 0.5 : 1}
    focusable={!disabled}
    tabIndex={disabled ? -1 : tabIndex}
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Tamagui View renders on native too, where role is the only button semantic
    role="button"
    data-part={part}
    onPress={disabled ? undefined : onPress}
    hoverStyle={disabled ? undefined : { borderColor: '$borderColorHover' }}>
    <Text
      fontSize={12}
      lineHeight={22}
      color={selected ? '$color1' : '$color11'}
      fontFamily="$body">
      {label}
    </Text>
  </View>
);

interface WindowNudgeProps {
  label: string;
  locked: boolean;
  onPress: () => void;
  children: ReactNode;
}

const WindowNudge = ({ label, locked, onPress, children }: WindowNudgeProps) => (
  <View
    height={CHIP_HEIGHT}
    width={28}
    alignItems="center"
    justifyContent="center"
    borderRadius={CHIP_RADIUS}
    borderWidth={1}
    borderColor="$borderColor"
    cursor={locked ? CURSOR_LOCKED : 'pointer'}
    tabIndex={-1}
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Tamagui View renders on native too, where role is the only button semantic
    role="button"
    aria-label={label}
    onPress={locked ? undefined : onPress}>
    {children}
  </View>
);

interface QuickRangeRowProps {
  visibleRanges: readonly QuickRange[];
  overflowRanges: readonly QuickRange[];
  selectedRange: QuickRange | null;
  locked: boolean;
  moreOpen: boolean;
  onMoreOpenChange: (open: boolean) => void;
  onPick: (range: QuickRange) => void;
}

const QuickRangeRow = ({
  visibleRanges,
  overflowRanges,
  selectedRange,
  locked,
  moreOpen,
  onMoreOpenChange,
  onPick,
}: QuickRangeRowProps) => (
  <XStack
    alignItems="center"
    gap={2}
    flexWrap="wrap"
    data-part="quick-range-row">
    {visibleRanges.map((range, index) => (
      <TimeRangeChip
        key={range.label}
        label={range.label}
        selected={selectedRange?.label === range.label}
        disabled={locked}
        tabIndex={4 + index}
        onPress={() => {
          onPick(range);
        }}
      />
    ))}
    {overflowRanges.length > 0 ? (
      <FloatingPanel
        open={moreOpen}
        onOpenChange={onMoreOpenChange}
        disabled={locked}
        widthMode="at-least-trigger"
        contentPadding="default"
        trigger=<TimeRangeChip
          part="quick-range-more"
          label={t('More')}
          selected={moreOpen}
          disabled={locked}
          onPress={() => {
            onMoreOpenChange(true);
          }}
        />>
        <YStack
          gap="$2"
          data-part="quick-range-menu"
          padding="$2">
          {overflowRanges.map((range) => (
            <TimeRangeChip
              key={range.label}
              label={range.label}
              selected={selectedRange?.label === range.label}
              disabled={locked}
              onPress={() => {
                onPick(range);
              }}
            />
          ))}
        </YStack>
      </FloatingPanel>
    ) : null}
  </XStack>
);

interface ReadoutRowProps {
  value: DateRange | null;
  frameAt: Date | null;
  scrubTime: Date;
}

const ReadoutRow = ({ value, frameAt, scrubTime }: ReadoutRowProps) => {
  const frameStale = frameAt ? formatDurationMs(scrubTime.getTime() - frameAt.getTime()) : t('none');
  return (
    <XStack
      alignItems="baseline"
      gap="$3"
      justifyContent="flex-end"
      flexWrap="wrap">
      <Text
        fontFamily="$mono"
        fontSize={12}
        lineHeight={22}
        color="$color12"
        data-part="readout"
        data-start={value?.start?.toISOString() ?? ''}
        data-end={value?.end?.toISOString() ?? ''}>
        {formatRangeReadout(value)}
      </Text>
      {frameAt ? (
        <Text
          fontFamily="$mono"
          fontSize={12}
          lineHeight={22}
          color="$color11"
          data-part="frame-stale">
          {`${t('frame')} −${frameStale}`}
        </Text>
      ) : null}
    </XStack>
  );
};

interface LaneProps {
  windowValue: TimeWindow;
}

const leftPct = (time: Date, windowValue: TimeWindow) => `${timeToFraction(time, windowValue) * 100}%`;

const ActivityLane = ({
  activity,
  activityAt,
  windowValue,
}: LaneProps & { activity: ActivitySpan[]; activityAt: ActivitySpan | null | undefined }) =>
  activity.length > 0 ? (
    <View
      position="relative"
      height={21}
      data-part="activity-lane"
      data-activity={activityAt?.label ?? (activityAt ? 'active' : '')}>
      {activity.map((span) => (
        <View
          key={`${span.start.toISOString()}-${span.end.toISOString()}`}
          position="absolute"
          left={leftPct(span.start, windowValue)}
          width={`${Math.max(0, timeToFraction(span.end, windowValue) - timeToFraction(span.start, windowValue)) * 100}%`}
          top="50%"
          y={-ACTIVITY_BAR_HEIGHT / 2}
          height={ACTIVITY_BAR_HEIGHT}
          backgroundColor="$color6"
          borderRadius={0}
          data-part="activity"
        />
      ))}
    </View>
  ) : null;

const KeysLane = ({ keys, trailingKeys, windowValue }: LaneProps & { keys: Date[]; trailingKeys: readonly Date[] }) =>
  keys.length > 0 ? (
    <View
      position="relative"
      height={28}
      data-part="keys-lane">
      {keys.map((key) => {
        const inside = trailingKeys.some((item) => item.getTime() === key.getTime());
        return (
          <View
            key={key.toISOString()}
            position="absolute"
            left={leftPct(key, windowValue)}
            width={KEY_TICK.width}
            height={KEY_TICK.height}
            top={7}
            backgroundColor="$color11"
            opacity={inside ? 1 : 0.45}
            borderRadius={0}
            data-part="key-tick"
          />
        );
      })}
    </View>
  ) : null;

interface CapPillProps {
  scrubTime: Date;
  scrubFraction: number;
  capLeft: number | null;
  onTrackLayout: (width: number) => void;
  onCapLayout: (width: number) => void;
}

/** The clock pill that rides above the playhead, clamped inside the rail. */
const CapPill = ({ scrubTime, scrubFraction, capLeft, onTrackLayout, onCapLayout }: CapPillProps) => (
  <XStack
    height={CAP_HEIGHT}
    position="relative"
    width="100%"
    onLayout={(event) => {
      onTrackLayout(event.nativeEvent.layout.width);
    }}>
    <View
      position="absolute"
      left={capLeft ?? `${scrubFraction * 100}%`}
      x={capLeft == null ? '-50%' : 0}
      height={CAP_HEIGHT}
      paddingHorizontal={10}
      flexDirection="row"
      alignItems="center"
      justifyContent="center"
      overflow="hidden"
      maxHeight={CAP_HEIGHT}
      borderRadius={CAP_RADIUS}
      borderWidth={1}
      borderColor="$borderColor"
      backgroundColor="$color2"
      onLayout={(event) => {
        onCapLayout(event.nativeEvent.layout.width);
      }}
      data-part="cap">
      <Text
        fontFamily="$mono"
        fontSize={12}
        lineHeight={16}
        color="$color12"
        numberOfLines={1}
        ellipsizeMode="clip"
        whiteSpace="nowrap">
        {formatClock(scrubTime)}
      </Text>
    </View>
  </XStack>
);

interface AxisTrackProps {
  windowValue: TimeWindow;
  frames: Date[];
  activity: ActivitySpan[];
  brush: DateRange;
  bandRadius: number;
}

/** The baseline, the activity extent, frame ticks and the brushed band. */
const AxisTrack = ({ windowValue, frames, activity, brush, bandRadius }: AxisTrackProps) => (
  <>
    <View
      position="absolute"
      left={0}
      right={0}
      top="50%"
      height={1}
      backgroundColor="$color5"
      y={-0.5}
    />
    {activity.length === 0 && frames.length === 0 ? null : (
      <View
        position="absolute"
        left={0}
        width={`${timeToFraction(windowValue.end, windowValue) * 100}%`}
        top="50%"
        height={1}
        backgroundColor="$color7"
        y={-0.5}
      />
    )}
    {frames.map((frame) => (
      <View
        key={frame.toISOString()}
        position="absolute"
        left={leftPct(frame, windowValue)}
        width={FRAME_TICK.width}
        height={FRAME_TICK.height}
        top="50%"
        y={-FRAME_TICK.height}
        backgroundColor="$color11"
        borderRadius={0}
        data-part="frame-tick"
      />
    ))}
    <View
      position="absolute"
      left={leftPct(brush.start ?? windowValue.start, windowValue)}
      width={`${Math.max(0, timeToFraction(brush.end ?? windowValue.end, windowValue) - timeToFraction(brush.start ?? windowValue.start, windowValue)) * 100}%`}
      top="50%"
      y={-BRUSH_BAND_HEIGHT / 2}
      height={BRUSH_BAND_HEIGHT}
      backgroundColor={formInputColors.background.focus}
      borderRadius={bandRadius}
      data-part="brush-band"
      data-radius-class="binary"
      data-radius={String(bandRadius)}
    />
  </>
);

/** What every draggable part (grip and both brush handles) needs from the control. */
interface HandleShared {
  windowValue: TimeWindow;
  locked: boolean;
  disabled: boolean | undefined;
  readOnly: boolean | undefined;
  hasError: boolean;
  session: ScrubberSession;
  transition: 'none' | 'quick';
  dragRoleRef: { current: DragRole | null };
  onKey: (role: DragRole, event: KeyboardEvent) => void;
  startPointer: (role: DragRole, clientX: number, pointerType?: string) => void;
  applyDrag: (clientX: number) => void;
  clearHold: () => void;
  setKbFocus: (updater: string | null | ((prev: string | null) => string | null)) => void;
}

const ariaFlag = (flag = false): true | undefined => (flag ? true : undefined);

interface BrushHandleProps extends HandleShared {
  part: 'brush-start' | 'brush-end';
  time: Date;
  ring: ReturnType<typeof ensureFocusVisibleRing> | undefined;
  handleRadius: number;
}

const BrushHandle = ({
  part,
  time,
  ring,
  handleRadius,
  windowValue,
  locked,
  disabled,
  readOnly,
  hasError,
  session,
  transition,
  dragRoleRef,
  onKey,
  startPointer,
  applyDrag,
  clearHold,
  setKbFocus,
}: BrushHandleProps) => (
  <View
    position="absolute"
    left={leftPct(time, windowValue)}
    x="-50%"
    top="50%"
    y={-BRUSH_HANDLE.height / 2}
    width={BRUSH_HANDLE.width}
    height={BRUSH_HANDLE.height}
    backgroundColor="$color11"
    borderRadius={handleRadius}
    cursor={locked ? CURSOR_LOCKED : 'ew-resize'}
    zIndex={4}
    tabIndex={locked ? -1 : brushTabIndex(part)}
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- no native element carries slider semantics on a Tamagui View
    role="slider"
    aria-label={part === BRUSH_START ? t('Range start') : t('Range end')}
    aria-valuemin={windowValue.start.getTime()}
    aria-valuemax={windowValue.end.getTime()}
    aria-valuenow={time.getTime()}
    aria-disabled={ariaFlag(disabled)}
    aria-readonly={ariaFlag(readOnly)}
    aria-invalid={ariaFlag(hasError)}
    data-part={part}
    data-radius-class="binary"
    data-radius={String(handleRadius)}
    data-session={session}
    data-transition={transition}
    hitSlop={rectHitSlop(BRUSH_HANDLE.width, BRUSH_HANDLE.height)}
    {...ring}
    onFocus={() => {
      if (isWeb && wasKeyboardFocus()) {
        setKbFocus(part);
      }
    }}
    onBlur={() => {
      setKbFocus((prev) => (prev === part ? null : prev));
    }}
    onKeyDown={(event) => {
      onKey(part, event);
    }}
    onPointerDown={(event) => {
      if (isWeb) {
        setKbFocus(null);
      }
      startPointer(part, event.clientX, event.pointerType);
    }}
    onPointerMove={(event) => {
      if (dragRoleRef.current === part) {
        applyDrag(event.clientX);
      }
    }}
    onPointerUp={clearHold}
    onPointerCancel={clearHold}
  />
);

interface GripHandleProps extends HandleShared {
  name: string;
  scrubTime: Date;
  gripSize: number;
  gripRadius: number;
  focus: ReturnType<typeof ensureFocusVisibleRing> | undefined;
}

const GripHandle = ({
  name,
  scrubTime,
  gripSize,
  gripRadius,
  focus,
  windowValue,
  locked,
  disabled,
  readOnly,
  hasError,
  session,
  transition,
  dragRoleRef,
  onKey,
  startPointer,
  applyDrag,
  clearHold,
  setKbFocus,
}: GripHandleProps) => (
  <View
    position="absolute"
    left={leftPct(scrubTime, windowValue)}
    x="-50%"
    top="50%"
    y={-gripSize / 2}
    width={gripSize}
    height={gripSize}
    borderRadius={gripRadius}
    borderWidth={2}
    borderColor="$color11"
    backgroundColor="$color12"
    shadowOpacity={0}
    {...(isWeb ? { boxShadow: 'none' } : undefined)}
    cursor={locked ? CURSOR_LOCKED : 'grab'}
    zIndex={5}
    tabIndex={locked ? -1 : 1}
    // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- no native element carries slider semantics on a Tamagui View
    role="slider"
    aria-label={t('{{name}} playhead', { name })}
    aria-valuemin={windowValue.start.getTime()}
    aria-valuemax={windowValue.end.getTime()}
    aria-valuenow={scrubTime.getTime()}
    aria-disabled={ariaFlag(disabled)}
    aria-readonly={ariaFlag(readOnly)}
    aria-invalid={ariaFlag(hasError)}
    data-part="grip"
    data-radius-class="binary"
    data-radius={String(gripRadius)}
    data-session={session}
    data-transition={transition}
    hitSlop={pressTargetHitSlop(gripSize)}
    transition={transition}
    {...focus}
    onFocus={() => {
      if (isWeb && wasKeyboardFocus()) {
        setKbFocus('grip');
      }
    }}
    onBlur={() => {
      setKbFocus((prev) => (prev === 'grip' ? null : prev));
    }}
    onKeyDown={(event) => {
      onKey('grip', event);
    }}
    onPointerDown={(event) => {
      if (isWeb) {
        setKbFocus(null);
      }
      startPointer('grip', event.clientX, event.pointerType);
    }}
    onPointerMove={(event) => {
      if (dragRoleRef.current === 'grip') {
        applyDrag(event.clientX);
      }
    }}
    onPointerUp={clearHold}
    onPointerCancel={clearHold}
  />
);

interface PointerDragInput {
  railRef: RefObject<TamaguiElement | null>;
  scrubRef: { current: Date };
  rangeRef: { current: DateRange | null };
  windowRef: { current: TimeWindow };
  emitScrub: (next: Date, nextSession: ScrubberSession) => Date;
  emitRange: (next: DateRange, nextSession: ScrubberSession) => DateRange;
  speak: (message: string) => void;
  locked: boolean;
  session: ScrubberSession;
  setSession: (next: ScrubberSession) => void;
}

/** Pointer-drag plumbing: which part is held, the touch-hold delay, and the window listeners while dragging. */
const usePointerDrag = ({
  railRef,
  scrubRef,
  rangeRef,
  windowRef,
  emitScrub,
  emitRange,
  speak,
  locked,
  session,
  setSession,
}: PointerDragInput) => {
  const dragRoleRef = useRef<DragRole | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pointerTime = useCallback(
    (clientX: number) => {
      const rail = railRef.current;
      if (!(rail instanceof HTMLElement)) {
        return scrubRef.current;
      }
      const rect = rail.getBoundingClientRect();
      if (!rect.width) {
        return scrubRef.current;
      }
      return fractionToTime((clientX - rect.left) / rect.width, windowRef.current);
    },
    [railRef, scrubRef, windowRef],
  );

  const applyDrag = useCallback(
    (clientX: number) => {
      const role = dragRoleRef.current;
      if (role === null) {
        return;
      }
      const next = pointerTime(clientX);
      if (role === 'grip') {
        speak(describePlayhead(emitScrub(next, 'drag')));
        return;
      }
      const current = rangeRef.current ?? windowRef.current;
      const updated =
        role === BRUSH_START
          ? { start: next, end: current.end ?? windowRef.current.end }
          : { start: current.start ?? windowRef.current.start, end: next };
      speak(describeRange(emitRange(updated, 'drag')));
    },
    [emitRange, emitScrub, pointerTime, rangeRef, speak, windowRef],
  );

  // The drag listeners re-subscribe only when the session flips; they always call the latest `applyDrag`.
  const onDragMove = useEffectEvent((clientX: number) => {
    applyDrag(clientX);
  });

  useEffect(() => {
    if (session !== 'drag' || !isWeb) {
      // oxlint-disable-next-line unicorn/no-useless-undefined -- the effect returns a cleanup on other paths; a bare return trips consistent-return
      return undefined;
    }
    const move = (event: PointerEvent) => {
      onDragMove(event.clientX);
    };
    const up = () => {
      dragRoleRef.current = null;
      setSession('idle');
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [session, setSession]);

  const clearHold = useCallback(() => {
    if (holdTimerRef.current !== null) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      clearHold();
    },
    [clearHold],
  );

  const startPointer = (role: DragRole, clientX: number, pointerType?: string) => {
    if (locked) {
      return;
    }
    clearHold();
    const begin = () => {
      dragRoleRef.current = role;
      applyDrag(clientX);
    };
    // Touch must hold before lift so swipe-scroll survives.
    if (pointerType === 'touch') {
      holdTimerRef.current = setTimeout(begin, TOUCH_HOLD_MS);
      return;
    }
    begin();
  };

  return { dragRoleRef, applyDrag, startPointer, clearHold };
};

interface TimeRangeScrubberControlProps {
  id: string;
  labelText?: string;
  ariaLabel?: string;
  disabled?: boolean;
  readOnly?: boolean;
  hasError: boolean;
  size?: SizeTokens;
  sizeToken: string;
  transitionToken: string | undefined;
  value: DateRange | null;
  onChange?: (value: DateRange | null) => void;
  windowValue: TimeWindow;
  onWindowChange?: (next: TimeWindow) => void;
  scrubTime: Date;
  onScrub?: (time: Date) => void;
  frames: Date[];
  activity: ActivitySpan[];
  keys: Date[];
  trailingWindowMs: number;
  snapTo: SnapTo;
  gridStepMs: number;
  quickRanges: readonly QuickRange[];
  maxVisibleQuickRanges: number;
  /** Clock read when a quick range is applied (the `now` test seam, or the real time). */
  getNow: () => Date;
}

const TimeRangeScrubberControl = ({
  id,
  labelText,
  ariaLabel,
  disabled,
  readOnly,
  hasError,
  size,
  sizeToken,
  transitionToken,
  value,
  onChange,
  windowValue,
  onWindowChange,
  scrubTime,
  onScrub,
  frames,
  activity,
  keys,
  trailingWindowMs,
  snapTo,
  gridStepMs,
  quickRanges,
  maxVisibleQuickRanges,
  getNow,
}: TimeRangeScrubberControlProps) => {
  if (isWeb) {
    ensureKeyboardModalityTracking();
  }
  const radiusStop = useRadiusStop();
  const theme = useTheme();
  const reducedMotion = transitionToken === undefined || transitionToken === '';
  const gripSize = getScrubberGripRenderSize(size == null ? sizeToken : String(size));
  const gripRadius = resolveScrubberRadius(radiusStop, gripSize);
  const handleRadius = resolveScrubberRadius(radiusStop, Math.min(BRUSH_HANDLE.width, BRUSH_HANDLE.height));
  const bandRadius = resolveScrubberRadius(radiusStop, BRUSH_BAND_HEIGHT);
  const [session, setSession] = useState<ScrubberSession>('idle');
  const [kbFocus, setKbFocus] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [announce, setAnnounce] = useState('');
  const [capTrackWidth, setCapTrackWidth] = useState(0);
  const [capWidth, setCapWidth] = useState(0);
  const railRef = useRef<TamaguiElement>(null);
  const liftOriginRef = useRef<Date | null>(null);
  const rangeRef = useLatestRef(value);
  const scrubRef = useLatestRef(scrubTime);
  const windowRef = useLatestRef(windowValue);

  const transition = resolveScrubberTransition(session, transitionToken, reducedMotion);
  const locked = disabled === true || readOnly === true;
  const brush = value?.start && value.end ? value : { start: windowValue.start, end: windowValue.end };
  const selectedRange = matchingQuickRange(value, quickRanges);
  const visibleRanges = quickRanges.slice(0, maxVisibleQuickRanges);
  const overflowRanges = quickRanges.slice(maxVisibleQuickRanges);
  const trailingKeys = keysInTrailingWindow(keys, scrubTime, trailingWindowMs);
  const frameAt = latestFrameAtOrBefore(frames, scrubTime);
  const activityAt = activityUnder(activity, scrubTime);
  const outlineVal: unknown = theme.outlineColor?.val;
  const fieldThemeOutline = isString(outlineVal) ? outlineVal : '$outlineColor';
  // Halo: circular thumb. At offset 0 the band is concentric with
  // the handle's own edge and reads as a thicker handle, not a ring around it.
  const focusRing = ensureFocusVisibleRing({
    outlineColor: fieldThemeOutline,
    outlineOffset: FOCUS_RING_HALO_OFFSET,
  });

  const emitScrub = useCallback(
    (next: Date, nextSession: ScrubberSession) => {
      const snapped = snapTime(next, snapTo, { frames, gridStepMs });
      const clamped = fractionToTime(timeToFraction(snapped, windowRef.current), windowRef.current);
      setSession(nextSession);
      onScrub?.(clamped);
      return clamped;
    },
    [frames, gridStepMs, onScrub, snapTo, windowRef],
  );

  const emitRange = useCallback(
    (next: DateRange, nextSession: ScrubberSession) => {
      const clamped = clampRangeToWindow(assertAbsoluteDateRange(next), windowRef.current);
      setSession(nextSession);
      onChange?.(clamped);
      return clamped;
    },
    [onChange, windowRef],
  );

  const speak = useCallback((message: string) => {
    setAnnounce(message);
  }, []);

  const { dragRoleRef, applyDrag, startPointer, clearHold } = usePointerDrag({
    railRef,
    scrubRef,
    rangeRef,
    windowRef,
    emitScrub,
    emitRange,
    speak,
    locked,
    session,
    setSession,
  });

  const applyQuick = (range: QuickRange) => {
    if (locked) {
      return;
    }
    const now = getNow();
    const next = applyQuickRange(range, now);
    emitRange(next, 'jump');
    onWindowChange?.(defaultWindow(now, next));
    if (next.end) {
      emitScrub(next.end, 'jump');
    }
    setMoreOpen(false);
    speak(t('Range {{label}}', { label: range.label }));
  };

  const onHandleKey = (role: DragRole, event: KeyboardEvent) => {
    handleScrubberKey(
      {
        locked,
        gridStepMs,
        frames,
        liftOriginRef,
        scrubRef,
        rangeRef,
        windowRef,
        emitScrub,
        emitRange,
        speak,
      },
      role,
      event,
    );
  };

  const scrubFraction = timeToFraction(scrubTime, windowValue);
  const capLeft = clampCapLeft(scrubFraction, capTrackWidth, capWidth);
  const name = ariaLabel ?? labelText ?? t('Time range');
  const handleShared: HandleShared = {
    windowValue,
    locked,
    disabled,
    readOnly,
    hasError,
    session,
    transition,
    dragRoleRef,
    onKey: onHandleKey,
    startPointer,
    applyDrag,
    clearHold,
    setKbFocus,
  };

  return (
    <YStack
      gap={7}
      width="100%"
      id={id}
      data-testid="time-range-scrubber"
      opacity={disabled ? 0.5 : 1}>
      <ReadoutRow
        value={value}
        frameAt={frameAt}
        scrubTime={scrubTime}
      />
      <XStack
        alignItems="center"
        gap={7}>
        <WindowNudge
          label={t('Earlier window')}
          locked={locked}
          onPress={() => onWindowChange?.(nudgeWindow(windowValue, -1))}>
          <CaretLeftIcon
            size={16}
            color="currentColor"
          />
        </WindowNudge>
        <QuickRangeRow
          visibleRanges={visibleRanges}
          overflowRanges={overflowRanges}
          selectedRange={selectedRange}
          locked={locked}
          moreOpen={moreOpen}
          onMoreOpenChange={setMoreOpen}
          onPick={applyQuick}
        />
        <WindowNudge
          label={t('Later window')}
          locked={locked}
          onPress={() => onWindowChange?.(nudgeWindow(windowValue, 1))}>
          <CaretRightIcon
            size={16}
            color="currentColor"
          />
        </WindowNudge>
      </XStack>
      <View
        ref={railRef}
        data-testid="trs-rail"
        position="relative"
        width="100%"
        minHeight={AXIS_BAND}>
        <YStack gap={4}>
          <CapPill
            scrubTime={scrubTime}
            scrubFraction={scrubFraction}
            capLeft={capLeft}
            onTrackLayout={setCapTrackWidth}
            onCapLayout={setCapWidth}
          />
          <View
            position="relative"
            height={AXIS_BAND}
            data-part="frames-lane">
            <AxisTrack
              windowValue={windowValue}
              frames={frames}
              activity={activity}
              brush={brush}
              bandRadius={bandRadius}
            />
            <BrushHandle
              {...handleShared}
              part="brush-start"
              time={brush.start ?? windowValue.start}
              ring={kbFocus === 'brush-start' ? focusRing : undefined}
              handleRadius={handleRadius}
            />
            <BrushHandle
              {...handleShared}
              part="brush-end"
              time={brush.end ?? windowValue.end}
              ring={kbFocus === 'brush-end' ? focusRing : undefined}
              handleRadius={handleRadius}
            />
            <View
              position="absolute"
              left={leftPct(scrubTime, windowValue)}
              x="-50%"
              top={0}
              bottom={0}
              width={PLAYHEAD_WIDTH}
              backgroundColor="$color12"
              zIndex={3}
              data-part="playhead"
            />
            <GripHandle
              {...handleShared}
              name={name}
              scrubTime={scrubTime}
              gripSize={gripSize}
              gripRadius={gripRadius}
              focus={kbFocus === 'grip' ? focusRing : undefined}
            />
          </View>
        </YStack>
        <ActivityLane
          activity={activity}
          activityAt={activityAt}
          windowValue={windowValue}
        />
        <KeysLane
          keys={keys}
          trailingKeys={trailingKeys}
          windowValue={windowValue}
        />
      </View>
      {isWeb ? (
        <span
          aria-live="polite"
          aria-atomic="true"
          style={{
            position: 'absolute',
            width: 1,
            height: 1,
            overflow: 'hidden',
            clip: 'rect(0 0 0 0)',
          }}>
          {announce}
        </span>
      ) : (
        <Text accessibilityLiveRegion="polite">{announce}</Text>
      )}
    </YStack>
  );
};

/** The scrubber's tween token, or undefined when the knob carries no transition (reduced motion). */
const motionToken = (transition: TransitionProp | null | undefined): string | undefined => {
  if (transition == null || transition === '') {
    return undefined;
  }
  // oxlint-disable-next-line typescript/no-base-to-string -- spring configs stringify to a non-empty token, which is all the scrubber needs to treat motion as on
  return String(transition);
};

export const TimeRangeScrubber = ({
  name,
  form: formProp,
  validators,
  label,
  labelProps,
  helperText,
  error,
  required,
  disabled,
  readOnly,
  size,
  id: idProp,
  skeleton,
  compact,
  value: valueProp,
  defaultValue,
  onChange,
  onBlur,
  window: windowProp,
  onWindowChange,
  scrubTime: scrubProp,
  defaultScrubTime,
  onScrub,
  frames = NO_FRAMES,
  activity = NO_ACTIVITY,
  keys = NO_KEYS,
  trailingWindow = DEFAULT_TRAILING_WINDOW_MS,
  snapTo = 'none',
  gridStepMs = 1000,
  quickRanges = DEFAULT_QUICK_RANGES,
  maxVisibleQuickRanges = Number.POSITIVE_INFINITY,
  now: nowProp,
  'aria-label': ariaLabel,
}: TimeRangeScrubberProps) => {
  const { resolvedForm, knobProps, id } = useFormField({
    form: formProp,
    id: idProp,
    compact,
  });
  const resolvedValidators = useResolvedValidators(required, validators, label, name, (value) => {
    if (!isObject(value)) {
      return true;
    }
    const start: unknown = 'start' in value ? value.start : undefined;
    const end: unknown = 'end' in value ? value.end : undefined;
    return start == null && end == null;
  });
  const getNow = () => nowProp ?? new Date();
  const [internalValue, setInternalValue] = useState<DateRange | null>(() => valueProp ?? defaultValue ?? null);
  const [internalWindow, setInternalWindow] = useState<TimeWindow>(
    () => windowProp ?? defaultWindow(getNow(), valueProp ?? defaultValue ?? null),
  );
  const [internalScrub, setInternalScrub] = useState<Date>(() => {
    const initialValue = valueProp ?? defaultValue;
    const explicit = scrubProp ?? defaultScrubTime ?? initialValue?.end;
    return explicit ?? (windowProp ?? defaultWindow(getNow(), initialValue ?? null)).end;
  });

  useEffect(() => {
    if (valueProp === undefined) {
      return;
    }
    // oxlint-disable-next-line react/set-state-in-effect -- mirrors the controlled prop so internal state keeps it when the consumer hands control back
    setInternalValue(valueProp);
  }, [valueProp]);

  useEffect(() => {
    if (windowProp === undefined) {
      return;
    }
    // oxlint-disable-next-line react/set-state-in-effect -- mirrors the controlled prop so internal state keeps it when the consumer hands control back
    setInternalWindow(windowProp);
  }, [windowProp]);

  useEffect(() => {
    if (scrubProp == null) {
      return;
    }
    // oxlint-disable-next-line react/set-state-in-effect -- mirrors the controlled prop so internal state keeps it when the consumer hands control back
    setInternalScrub(scrubProp);
  }, [scrubProp]);

  const value = valueProp === undefined ? internalValue : valueProp;
  const windowValue = windowProp ?? internalWindow;
  const scrubTime = scrubProp ?? internalScrub;
  const liveTransition = motionToken(knobProps.transition);

  const handleChange = (next: DateRange | null, fieldChange?: (value: DateRange | null) => void) => {
    if (valueProp === undefined) {
      setInternalValue(next);
    }
    fieldChange?.(next);
    onChange?.(next);
  };

  const handleWindow = (next: TimeWindow) => {
    if (windowProp === undefined) {
      setInternalWindow(next);
    }
    onWindowChange?.(next);
  };

  const handleScrub = (next: Date) => {
    if (scrubProp === undefined) {
      setInternalScrub(next);
    }
    onScrub?.(next);
  };

  if (skeleton) {
    return (
      <FieldLayout
        id={id}
        label={label}
        size={size}
        knobProps={knobProps}>
        <Skeleton
          variant="rounded"
          width="100%"
          height={AXIS_BAND}
        />
      </FieldLayout>
    );
  }

  const control = (current: DateRange | null, fieldChange?: (value: DateRange | null) => void, hasError = false) => (
    <TimeRangeScrubberControl
      id={id}
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- ReactNode has no discriminant; only a string label can name the slider
      labelText={typeof label === 'string' ? label : undefined}
      ariaLabel={ariaLabel}
      disabled={disabled}
      readOnly={readOnly}
      hasError={hasError}
      size={size}
      sizeToken={knobProps.sizeToken}
      transitionToken={liveTransition}
      value={current}
      onChange={(next) => {
        handleChange(next, fieldChange);
      }}
      windowValue={windowValue}
      onWindowChange={handleWindow}
      scrubTime={scrubTime}
      onScrub={handleScrub}
      frames={frames}
      activity={activity}
      keys={keys}
      trailingWindowMs={trailingWindow}
      snapTo={snapTo}
      gridStepMs={gridStepMs}
      quickRanges={quickRanges}
      maxVisibleQuickRanges={maxVisibleQuickRanges}
      getNow={getNow}
    />
  );

  if (resolvedForm == null || name === undefined || name === '') {
    return (
      <FieldLayout
        id={id}
        label={label}
        labelProps={labelProps}
        error={error}
        required={required}
        helperText={helperText}
        size={size}
        knobProps={knobProps}
        disabled={disabled}
        onBlur={onBlur}>
        {control(value, undefined, Boolean(error))}
      </FieldLayout>
    );
  }

  return (
    <Field
      form={resolvedForm}
      name={name}
      defaultValue={defaultValue}
      validators={resolvedValidators}>
      {(field) => {
        const resolvedError = getFieldError(field, error);
        const fieldValue = (valueProp === undefined ? field.state.value : valueProp) ?? null;
        return (
          <FieldLayout
            id={id}
            label={label}
            labelProps={labelProps}
            error={resolvedError}
            required={required}
            helperText={helperText}
            size={size}
            knobProps={knobProps}
            disabled={disabled}>
            {control(
              fieldValue,
              (next) => {
                field.handleChange(next);
              },
              Boolean(resolvedError),
            )}
          </FieldLayout>
        );
      }}
    </Field>
  );
};
