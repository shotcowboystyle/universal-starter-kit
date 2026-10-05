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
  type BorderRadius,
} from '@repo/theme';
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { LabelProps, SizeTokens } from 'tamagui';
import { Text, View, XStack, YStack, isWeb, useTheme } from 'tamagui';

import { Field, FieldLayout } from '../../fieldLayout';
import { FloatingPanel } from '../../FloatingPanel';
import { formInputColors } from '../../shared/colorRamps';
import { t } from '../../shared/t';
import { getFieldError, mergeFieldHandler, useFormField, useResolvedValidators } from '../../shared/utils';
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
  type ActivitySpan,
  type QuickRange,
  type ScrubberSession,
  type SnapTo,
  type TimeWindow,
} from './geometry';

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
export type { ActivitySpan, QuickRange, SnapTo, TimeWindow };

const ACTIVITY_BAR_HEIGHT = 7;

export interface TimeRangeScrubberProps {
  name?: string;
  form?: AnyFormApi;
  validators?: Record<string, unknown>;
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

function useRadiusStop(): BorderRadius {
  const ctx = usePresetContext();
  return ctx?.preset.knobs.borderRadius ?? defaultKnobs.borderRadius;
}

function formatClock(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function formatRangeReadout(range: DateRange | null): string {
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
}

function TimeRangeChip({
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
}) {
  return (
    <View
      height={CHIP_HEIGHT}
      paddingHorizontal={7}
      borderRadius={CHIP_RADIUS}
      borderWidth={1}
      borderColor={selected ? '$color11' : '$borderColor'}
      backgroundColor={selected ? '$color11' : 'transparent'}
      justifyContent="center"
      alignItems="center"
      cursor={disabled ? 'not-allowed' : 'pointer'}
      opacity={disabled ? 0.5 : 1}
      focusable={!disabled}
      tabIndex={disabled ? -1 : tabIndex}
      role="button"
      data-part={part}
      onPress={disabled ? undefined : onPress}
      hoverStyle={disabled ? undefined : { borderColor: '$borderColorHover' }}>
      <Text fontSize={12} lineHeight={22} color={selected ? '$color1' : '$color11'} fontFamily="$body">
        {label}
      </Text>
    </View>
  );
}

function TimeRangeScrubberControl({
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
  now,
}: {
  id: string;
  labelText?: string;
  ariaLabel?: string;
  disabled?: boolean;
  readOnly?: boolean;
  hasError?: boolean;
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
  now: Date;
}) {
  if (isWeb) {
    ensureKeyboardModalityTracking();
  }
  const radiusStop = useRadiusStop();
  const theme = useTheme();
  const reducedMotion = !transitionToken;
  const gripSize = getScrubberGripRenderSize(size != null ? String(size) : sizeToken);
  const gripRadius = resolveScrubberRadius(radiusStop, gripSize);
  const handleRadius = resolveScrubberRadius(radiusStop, Math.min(BRUSH_HANDLE.width, BRUSH_HANDLE.height));
  const bandRadius = resolveScrubberRadius(radiusStop, BRUSH_BAND_HEIGHT);
  const [session, setSession] = useState<ScrubberSession>('idle');
  const [kbFocus, setKbFocus] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [announce, setAnnounce] = useState('');
  const [capTrackWidth, setCapTrackWidth] = useState(0);
  const [capWidth, setCapWidth] = useState(0);
  const railRef = useRef<HTMLElement | null>(null);
  const dragRoleRef = useRef<DragRole | null>(null);
  const liftOriginRef = useRef<Date | null>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rangeRef = useRef(value);
  rangeRef.current = value;
  const scrubRef = useRef(scrubTime);
  scrubRef.current = scrubTime;
  const windowRef = useRef(windowValue);
  windowRef.current = windowValue;

  const transition = resolveScrubberTransition(session, transitionToken, reducedMotion);
  const locked = !!(disabled || readOnly);
  const brush = value?.start && value.end ? value : { start: windowValue.start, end: windowValue.end };
  const selectedRange = matchingQuickRange(value, quickRanges);
  const visibleRanges = quickRanges.slice(0, maxVisibleQuickRanges);
  const overflowRanges = quickRanges.slice(maxVisibleQuickRanges);
  const trailingKeys = keysInTrailingWindow(keys, scrubTime, trailingWindowMs);
  const frameAt = latestFrameAtOrBefore(frames, scrubTime);
  const activityAt = activityUnder(activity, scrubTime);
  const fieldThemeOutline = (theme.outlineColor?.val as string | undefined) ?? '$outlineColor';
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
    [frames, gridStepMs, onScrub, snapTo],
  );

  const emitRange = useCallback(
    (next: DateRange, nextSession: ScrubberSession) => {
      const clamped = clampRangeToWindow(assertAbsoluteDateRange(next), windowRef.current);
      setSession(nextSession);
      onChange?.(clamped);
      return clamped;
    },
    [onChange],
  );

  const speak = useCallback((message: string) => {
    setAnnounce(message);
  }, []);

  const pointerTime = useCallback((clientX: number) => {
    const rail = railRef.current;
    if (!rail) {
      return scrubRef.current;
    }
    const rect = rail.getBoundingClientRect();
    if (!rect.width) {
      return scrubRef.current;
    }
    return fractionToTime((clientX - rect.left) / rect.width, windowRef.current);
  }, []);

  const applyDrag = useCallback(
    (clientX: number) => {
      const role = dragRoleRef.current;
      if (!role) {
        return;
      }
      const next = pointerTime(clientX);
      if (role === 'grip') {
        const time = emitScrub(next, 'drag');
        speak(t('Playhead at {{time}}', { time: formatClock(time) }));
        return;
      }
      const current = rangeRef.current ?? brush;
      const updated =
        role === 'brush-start'
          ? { start: next, end: current.end ?? windowRef.current.end }
          : { start: current.start ?? windowRef.current.start, end: next };
      const range = emitRange(updated, 'drag');
      speak(
        t('Range {{start}} to {{end}}', {
          start: range.start ? formatClock(range.start) : t('none'),
          end: range.end ? formatClock(range.end) : t('none'),
        }),
      );
    },
    [brush, emitRange, emitScrub, pointerTime, speak],
  );

  useEffect(() => {
    if (session !== 'drag' || !isWeb) {
      return;
    }
    const move = (event: PointerEvent) => {
      applyDrag(event.clientX);
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
  }, [applyDrag, session]);

  const clearHold = () => {
    if (holdTimerRef.current !== null) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  useEffect(
    () => () => {
      clearHold();
    },
    [],
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

  const applyQuick = (range: QuickRange) => {
    if (locked) {
      return;
    }
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
    if (locked) {
      return;
    }
    const key = event.key;
    if (key === ' ' || key === 'Enter') {
      event.preventDefault();
      if (liftOriginRef.current) {
        liftOriginRef.current = null;
        speak(t('Dropped'));
      } else {
        liftOriginRef.current = role === 'grip' ? scrubRef.current : (rangeRef.current?.start ?? scrubRef.current);
        speak(t('Lifted'));
      }
      return;
    }
    if (key === 'Escape') {
      event.preventDefault();
      const origin = liftOriginRef.current;
      liftOriginRef.current = null;
      if (origin) {
        if (role === 'grip') {
          emitScrub(origin, 'jump');
        } else {
          emitRange({ start: origin, end: rangeRef.current?.end ?? origin }, 'jump');
        }
        speak(t('Cancelled'));
      }
      return;
    }
    if (key === 'Home' || key === 'End') {
      event.preventDefault();
      const target = key === 'Home' ? windowRef.current.start : windowRef.current.end;
      if (role === 'grip') {
        emitScrub(target, 'jump');
        speak(t('Playhead at {{time}}', { time: formatClock(target) }));
      } else {
        const current = rangeRef.current ?? brush;
        const next =
          role === 'brush-start' ? { start: target, end: current.end } : { start: current.start, end: target };
        const range = emitRange(next, 'jump');
        speak(
          t('Range {{start}} to {{end}}', {
            start: range.start ? formatClock(range.start) : t('none'),
            end: range.end ? formatClock(range.end) : t('none'),
          }),
        );
      }
      return;
    }
    if (key === '[' || key === ']') {
      event.preventDefault();
      const next = nearestFrame(scrubRef.current, frames, key === ']' ? 1 : -1);
      if (!next) {
        return;
      }
      emitScrub(next, 'jump');
      speak(t('Playhead at {{time}}', { time: formatClock(next) }));
      return;
    }
    if (key !== 'ArrowLeft' && key !== 'ArrowRight' && key !== 'ArrowUp' && key !== 'ArrowDown') {
      return;
    }
    event.preventDefault();
    const direction: 1 | -1 = key === 'ArrowLeft' || key === 'ArrowDown' ? -1 : 1;
    if (role === 'grip') {
      const next = stepTime(scrubRef.current, direction, gridStepMs, event.shiftKey);
      const time = emitScrub(next, liftOriginRef.current ? 'drag' : 'jump');
      speak(t('Playhead at {{time}}', { time: formatClock(time) }));
      return;
    }
    const current = rangeRef.current ?? brush;
    const edge =
      role === 'brush-start' ? (current.start ?? windowRef.current.start) : (current.end ?? windowRef.current.end);
    const moved = stepTime(edge, direction, gridStepMs, event.shiftKey);
    const next = role === 'brush-start' ? { start: moved, end: current.end } : { start: current.start, end: moved };
    const range = emitRange(next, liftOriginRef.current ? 'drag' : 'jump');
    speak(
      t('Range {{start}} to {{end}}', {
        start: range.start ? formatClock(range.start) : t('none'),
        end: range.end ? formatClock(range.end) : t('none'),
      }),
    );
  };

  const leftPct = (time: Date) => `${timeToFraction(time, windowValue) * 100}%`;
  const scrubFraction = timeToFraction(scrubTime, windowValue);
  const capLeft = clampCapLeft(scrubFraction, capTrackWidth, capWidth);
  const gripFocus = kbFocus === 'grip' ? focusRing : undefined;
  const startFocus = kbFocus === 'brush-start' ? focusRing : undefined;
  const endFocus = kbFocus === 'brush-end' ? focusRing : undefined;
  const name = ariaLabel ?? labelText ?? t('Time range');
  const frameStale = frameAt ? formatDurationMs(scrubTime.getTime() - frameAt.getTime()) : t('none');

  const chips = (
    <XStack alignItems="center" gap={2} flexWrap="wrap" data-part="quick-range-row">
      {visibleRanges.map((range, index) => (
        <TimeRangeChip
          key={range.label}
          label={range.label}
          selected={selectedRange?.label === range.label}
          disabled={locked}
          tabIndex={4 + index}
          onPress={() => {
            applyQuick(range);
          }}
        />
      ))}
      {overflowRanges.length > 0 ? (
        <FloatingPanel
          open={moreOpen}
          onOpenChange={setMoreOpen}
          disabled={locked}
          widthMode="at-least-trigger"
          contentPadding="default"
          trigger=<TimeRangeChip
            part="quick-range-more"
            label={t('More')}
            selected={moreOpen}
            disabled={locked}
            onPress={() => {
              setMoreOpen(true);
            }}
          />>
          <YStack gap="$2" data-part="quick-range-menu" padding="$2">
            {overflowRanges.map((range) => (
              <TimeRangeChip
                key={range.label}
                label={range.label}
                selected={selectedRange?.label === range.label}
                disabled={locked}
                onPress={() => {
                  applyQuick(range);
                }}
              />
            ))}
          </YStack>
        </FloatingPanel>
      ) : null}
    </XStack>
  );

  return (
    <YStack gap={7} width="100%" id={id} data-testid="time-range-scrubber" opacity={disabled ? 0.5 : 1}>
      <XStack alignItems="baseline" gap="$3" justifyContent="flex-end" flexWrap="wrap">
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
          <Text fontFamily="$mono" fontSize={12} lineHeight={22} color="$color11" data-part="frame-stale">
            {`${t('frame')} −${frameStale}`}
          </Text>
        ) : null}
      </XStack>
      <XStack alignItems="center" gap={7}>
        <View
          height={CHIP_HEIGHT}
          width={28}
          alignItems="center"
          justifyContent="center"
          borderRadius={CHIP_RADIUS}
          borderWidth={1}
          borderColor="$borderColor"
          cursor={locked ? 'not-allowed' : 'pointer'}
          tabIndex={-1}
          role="button"
          aria-label={t('Earlier window')}
          onPress={locked ? undefined : () => onWindowChange?.(nudgeWindow(windowValue, -1))}>
          <CaretLeftIcon size={16} color="currentColor" />
        </View>
        {chips}
        <View
          height={CHIP_HEIGHT}
          width={28}
          alignItems="center"
          justifyContent="center"
          borderRadius={CHIP_RADIUS}
          borderWidth={1}
          borderColor="$borderColor"
          cursor={locked ? 'not-allowed' : 'pointer'}
          tabIndex={-1}
          role="button"
          aria-label={t('Later window')}
          onPress={locked ? undefined : () => onWindowChange?.(nudgeWindow(windowValue, 1))}>
          <CaretRightIcon size={16} color="currentColor" />
        </View>
      </XStack>
      <View ref={railRef as never} data-testid="trs-rail" position="relative" width="100%" minHeight={AXIS_BAND}>
        <YStack gap={4}>
          <XStack
            height={CAP_HEIGHT}
            position="relative"
            width="100%"
            onLayout={(event) => {
              setCapTrackWidth(event.nativeEvent.layout.width);
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
                setCapWidth(event.nativeEvent.layout.width);
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
          <View position="relative" height={AXIS_BAND} data-part="frames-lane">
            <View position="absolute" left={0} right={0} top="50%" height={1} backgroundColor="$color5" y={-0.5} />
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
                left={leftPct(frame)}
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
              left={leftPct(brush.start ?? windowValue.start)}
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
            {(
              [
                ['brush-start', brush.start ?? windowValue.start, startFocus],
                ['brush-end', brush.end ?? windowValue.end, endFocus],
              ] as const
            ).map(([part, time, ring]) => (
              <View
                key={part}
                position="absolute"
                left={leftPct(time)}
                x="-50%"
                top="50%"
                y={-BRUSH_HANDLE.height / 2}
                width={BRUSH_HANDLE.width}
                height={BRUSH_HANDLE.height}
                backgroundColor="$color11"
                borderRadius={handleRadius}
                cursor={locked ? 'not-allowed' : 'ew-resize'}
                zIndex={4}
                tabIndex={locked ? -1 : part === 'brush-start' ? 2 : 3}
                role="slider"
                aria-label={part === 'brush-start' ? t('Range start') : t('Range end')}
                aria-valuemin={windowValue.start.getTime()}
                aria-valuemax={windowValue.end.getTime()}
                aria-valuenow={time.getTime()}
                aria-disabled={disabled || undefined}
                aria-readonly={readOnly || undefined}
                aria-invalid={hasError || undefined}
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
                  onHandleKey(part, event as unknown as KeyboardEvent);
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
            ))}
            <View
              position="absolute"
              left={leftPct(scrubTime)}
              x="-50%"
              top={0}
              bottom={0}
              width={PLAYHEAD_WIDTH}
              backgroundColor="$color12"
              zIndex={3}
              data-part="playhead"
            />
            <View
              position="absolute"
              left={leftPct(scrubTime)}
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
              cursor={locked ? 'not-allowed' : 'grab'}
              zIndex={5}
              tabIndex={locked ? -1 : 1}
              role="slider"
              aria-label={t('{{name}} playhead', { name })}
              aria-valuemin={windowValue.start.getTime()}
              aria-valuemax={windowValue.end.getTime()}
              aria-valuenow={scrubTime.getTime()}
              aria-disabled={disabled || undefined}
              aria-readonly={readOnly || undefined}
              aria-invalid={hasError || undefined}
              data-part="grip"
              data-radius-class="binary"
              data-radius={String(gripRadius)}
              data-session={session}
              data-transition={transition}
              hitSlop={pressTargetHitSlop(gripSize)}
              transition={transition}
              {...gripFocus}
              onFocus={() => {
                if (isWeb && wasKeyboardFocus()) {
                  setKbFocus('grip');
                }
              }}
              onBlur={() => {
                setKbFocus((prev) => (prev === 'grip' ? null : prev));
              }}
              onKeyDown={(event) => {
                onHandleKey('grip', event as unknown as KeyboardEvent);
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
          </View>
        </YStack>
        {activity.length > 0 ? (
          <View
            position="relative"
            height={21}
            data-part="activity-lane"
            data-activity={activityAt?.label ?? (activityAt ? 'active' : '')}>
            {activity.map((span) => (
              <View
                key={`${span.start.toISOString()}-${span.end.toISOString()}`}
                position="absolute"
                left={leftPct(span.start)}
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
        ) : null}
        {keys.length > 0 ? (
          <View position="relative" height={28} data-part="keys-lane">
            {keys.map((key) => {
              const inside = trailingKeys.some((item) => item.getTime() === key.getTime());
              return (
                <View
                  key={key.toISOString()}
                  position="absolute"
                  left={leftPct(key)}
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
        ) : null}
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
}

export function TimeRangeScrubber({
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
  frames = [],
  activity = [],
  keys = [],
  trailingWindow = DEFAULT_TRAILING_WINDOW_MS,
  snapTo = 'none',
  gridStepMs = 1000,
  quickRanges = DEFAULT_QUICK_RANGES,
  maxVisibleQuickRanges = Number.POSITIVE_INFINITY,
  now: nowProp,
  'aria-label': ariaLabel,
}: TimeRangeScrubberProps) {
  const { resolvedForm, knobProps, id } = useFormField({
    form: formProp,
    id: idProp,
    compact,
  });
  const resolvedValidators = useResolvedValidators(required, validators, label, name, (value) => {
    if (value == null) {
      return true;
    }
    if (typeof value !== 'object') {
      return true;
    }
    const range = value as DateRange;
    return range.start == null && range.end == null;
  });
  const now = nowProp ?? new Date();
  const [internalValue, setInternalValue] = useState<DateRange | null>(() => valueProp ?? defaultValue ?? null);
  const [internalWindow, setInternalWindow] = useState<TimeWindow>(
    () => windowProp ?? defaultWindow(now, valueProp ?? defaultValue ?? null),
  );
  const [internalScrub, setInternalScrub] = useState<Date>(
    () =>
      scrubProp ??
      defaultScrubTime ??
      (valueProp ?? defaultValue)?.end ??
      (windowProp ?? defaultWindow(now, valueProp ?? defaultValue ?? null)).end,
  );

  useEffect(() => {
    if (valueProp === undefined) {
      return;
    }
    setInternalValue(valueProp);
  }, [valueProp]);

  useEffect(() => {
    if (windowProp === undefined) {
      return;
    }
    setInternalWindow(windowProp);
  }, [windowProp]);

  useEffect(() => {
    if (scrubProp == null) {
      return;
    }
    setInternalScrub(scrubProp);
  }, [scrubProp]);

  const value = valueProp !== undefined ? valueProp : internalValue;
  const windowValue = windowProp ?? internalWindow;
  const scrubTime = scrubProp ?? internalScrub;
  const liveTransition = knobProps.transition ? String(knobProps.transition) : undefined;

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
      <FieldLayout id={id} label={label} size={size} knobProps={knobProps}>
        <Skeleton variant="rounded" width="100%" height={AXIS_BAND} />
      </FieldLayout>
    );
  }

  const control = (
    current: DateRange | null,
    fieldChange?: (value: DateRange | null) => void,
    fieldBlur?: (...args: unknown[]) => void,
    hasError?: boolean,
  ) => (
    <TimeRangeScrubberControl
      id={id}
      labelText={typeof label === 'string' ? label : undefined}
      ariaLabel={ariaLabel}
      disabled={disabled}
      readOnly={readOnly}
      hasError={hasError}
      size={size}
      sizeToken={String(knobProps.sizeToken)}
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
      now={now}
    />
  );

  if (!resolvedForm || !name) {
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
        {control(value, undefined, onBlur, !!error)}
      </FieldLayout>
    );
  }

  return (
    <Field form={resolvedForm} name={name} defaultValue={defaultValue} validators={resolvedValidators}>
      {(field) => {
        const resolvedError = getFieldError(field, error);
        const fieldValue = (valueProp !== undefined ? valueProp : field.state.value) ?? null;
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
                field.handleChange(next as never);
              },
              mergeFieldHandler(field, 'handleBlur', onBlur),
              !!resolvedError,
            )}
          </FieldLayout>
        );
      }}
    </Field>
  );
}
