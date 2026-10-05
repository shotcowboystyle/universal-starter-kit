/**
 * Meter — position within bounds (disk, quota, seats, battery, signal).
 *
 * Progress is activity toward completion; Meter is position within bounds.
 * A Progress bar ends and leaves the screen; a Meter persists, and full is
 * an incident, not an achievement. role="meter", never progressbar.
 *
 * Extracted from ProgressCard (`views/Dashboard.tsx`). The dashboard card
 * keeps its chrome and composes this rail.
 */
import { defaultKnobs, usePresetContext, useResolvedKnobs } from '@repo/theme';
import type { GetProps } from 'tamagui';
import { Text, View, XStack, YStack, isWeb, styled } from 'tamagui';

import { Skeleton } from '../Skeleton';

import {
  METER_RADIUS_CLASS,
  METER_TICK,
  METER_TRACK,
  METER_ZONE_PAINT,
  UNKNOWN_VALUE,
  formatMeterValue,
  meterFillRatio,
  meterTrackHeightPx,
  resolveMeterRailRadius,
  resolveMeterZone,
  type MeterFormat,
  type MeterLayout,
} from './meter';

export {
  METER_RADIUS_CLASS,
  METER_ZONE_PAINT,
  formatMeterValue,
  meterTrackHeightPx,
  resolveMeterRailRadius,
  resolveMeterZone,
} from './meter';
export type { MeterFormat, MeterLayout, MeterZone } from './meter';

const MeterRoot = styled(YStack, {
  name: 'Meter',
});

const Rail = styled(View, {
  name: 'MeterRail',
  position: 'relative',
  overflow: 'hidden',
  width: '100%',
  flexShrink: 0,
});

const Fill = styled(View, {
  name: 'MeterFill',
  position: 'absolute',
  top: 0,
  bottom: 0,
  left: 0,
});

const Tick = styled(View, {
  name: 'MeterTick',
  position: 'absolute',
  top: 0,
  bottom: 0,
  width: 1,
});

const Segment = styled(View, {
  name: 'MeterSegment',
  flexShrink: 0,
});

export interface MeterProps extends Omit<GetProps<typeof MeterRoot>, 'children'> {
  /** Current level. Omit / null / non-finite → unknown (em dash, no fill). */
  value?: number | null;
  /** Inclusive lower bound. Declared, never assumed 0…100. */
  min: number;
  /** Inclusive upper bound. Declared, never assumed 0…100. */
  max: number;
  /** HTML meter `low` — first cut. With `high`/`optimum` declares zones. */
  low?: number;
  /** HTML meter `high` — second cut. */
  high?: number;
  /** Names the good end so battery inverts without new chrome. */
  optimum?: number;
  /** Field label (adjacent layout). Also the default aria-label. */
  label?: string;
  /** Unit that never leaves the value, e.g. `"GB"`. */
  unit?: string;
  /** `number` = "6.2 of 8 GB"; `percent` trails the bar when inline. */
  format?: MeterFormat;
  /** Override the visible value (ProgressCard keeps its own formatter). */
  valueLabel?: string;
  /** Override aria-valuetext (default keeps the unit). */
  valueText?: string;
  /** adjacent (default) · inline (percent after the bar) · bare (rail only). */
  layout?: MeterLayout;
  /** Discrete capacity (seats, slots). Count is data, not a knob. */
  segments?: number;
  /** Skeleton at the same track height. */
  loading?: boolean;
  disabled?: boolean;
}

function tickLeftPercent(cut: number, min: number, max: number): number | null {
  if (max === min) {
    return null;
  }
  if (cut <= min || cut >= max) {
    return null;
  }
  return ((cut - min) / (max - min)) * 100;
}

function defaultValueText(opts: {
  value?: number | null;
  visible: string;
  unit?: string;
  format?: MeterFormat;
}): string {
  if (opts.value == null || !Number.isFinite(opts.value)) {
    return UNKNOWN_VALUE;
  }
  if (opts.format === 'percent') {
    return opts.visible;
  }
  if (opts.unit) {
    return `${opts.visible} used`;
  }
  return opts.visible;
}

/**
 * Bounded-quantity display. Inert — no tab stop, no focus ring. The input
 * twin is Slider.
 */
export function Meter({
  value,
  min,
  max,
  low,
  high,
  optimum,
  label,
  unit,
  format = 'number',
  valueLabel,
  valueText,
  layout = 'adjacent',
  segments,
  loading = false,
  disabled = false,
  ...props
}: MeterProps) {
  const { knobProps } = useResolvedKnobs({ component: 'Meter' });
  const preset = usePresetContext();
  const stop = preset?.preset.knobs.borderRadius ?? defaultKnobs.borderRadius;
  const size = (preset?.preset.knobs.size ?? defaultKnobs.size) as 'small' | 'medium' | 'large';
  const outlined = knobProps.outlined;
  const trackH = meterTrackHeightPx(size);
  const railRadius = resolveMeterRailRadius(stop);
  // Spread the fragment (AGENTS.md). Hardcoded 1px ignored the borderWidth knob.
  const outlineChrome = outlined ? { ...knobProps.inputSurface, borderColor: '$color6' as const } : { borderWidth: 0 };
  const paintedBorder = outlined ? knobProps.inputSurface.borderWidth : 0;
  const known = value != null && Number.isFinite(value);
  const zone = known ? resolveMeterZone({ value: value, min, max, low, high, optimum }) : 'ok';
  const paint = METER_ZONE_PAINT[zone];
  const valueInk = 'value' in paint ? paint.value : knobProps.textAccentColor;
  const ratio = meterFillRatio(value, min, max);
  const visible = formatMeterValue({ value, min, max, unit, format, valueLabel });
  const valuetext = valueText ?? defaultValueText({ value, visible, unit, format });
  const discrete = typeof segments === 'number' && Number.isFinite(segments) && segments > 0 ? Math.round(segments) : 0;
  const span = max - min;
  const filledCount =
    known && discrete > 0 && span !== 0
      ? Math.max(0, Math.min(discrete, Math.round((value - min) / (span / discrete))))
      : 0;

  const valueNode =
    layout === 'bare' ? null : (
      <Text
        {...knobProps.label}
        fontFamily="$mono"
        color={valueInk}
        whiteSpace="nowrap"
        data-meter-value=""
        data-meter-value-color={valueInk}
        {...(isWeb ? { style: { fontVariantNumeric: 'tabular-nums' } } : null)}>
        {visible}
      </Text>
    );

  const ticks =
    discrete > 0
      ? null
      : [low, high].map((cut, i) => {
          if (cut === undefined) {
            return null;
          }
          const left = tickLeftPercent(cut, min, max);
          if (left == null) {
            return null;
          }
          return <Tick key={`${cut}-${i}`} left={`${left}%`} backgroundColor={METER_TICK} data-meter-tick="" />;
        });

  const railEl = loading ? (
    <Skeleton variant="rounded" height={trackH} width="100%" />
  ) : discrete > 0 ? (
    <XStack gap={3} data-meter-segments={discrete} opacity={disabled ? 0.5 : 1}>
      {Array.from({ length: discrete }, (_, i) => (
        <Segment
          key={i}
          width={19}
          height={trackH}
          borderRadius={railRadius}
          {...outlineChrome}
          backgroundColor={i < filledCount ? paint.fill : outlined ? 'transparent' : METER_TRACK}
        />
      ))}
    </XStack>
  ) : (
    <Rail
      height={trackH}
      minHeight={trackH}
      borderRadius={railRadius}
      {...outlineChrome}
      backgroundColor={outlined ? 'transparent' : METER_TRACK}
      opacity={disabled ? 0.5 : 1}
      role="meter"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={known ? value : undefined}
      aria-valuetext={valuetext}
      data-meter-radius-class={METER_RADIUS_CLASS}
      data-meter-rail-radius={railRadius}
      data-meter-border-width={paintedBorder}
      data-meter-zone={zone}
      data-meter-fill={known && ratio != null ? paint.fill : undefined}
      data-meter-track-height={trackH}>
      {known && ratio != null ? (
        <Fill
          width={`${ratio * 100}%`}
          backgroundColor={paint.fill}
          {...(knobProps.transition ? { transition: knobProps.transition } : { transition: 'none' })}
        />
      ) : null}
      {ticks}
    </Rail>
  );

  // Segmented rails still owe role=meter — park it on the segment row host.
  const segmentedMeter =
    !loading && discrete > 0 ? (
      <View
        role="meter"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={known ? value : undefined}
        aria-valuetext={valuetext}
        data-meter-radius-class={METER_RADIUS_CLASS}
        data-meter-rail-radius={railRadius}
        data-meter-border-width={paintedBorder}
        data-meter-zone={zone}
        data-meter-fill={known ? paint.fill : undefined}
        data-meter-track-height={trackH}>
        {railEl}
      </View>
    ) : (
      railEl
    );

  if (layout === 'bare') {
    return (
      <MeterRoot width="100%" {...props}>
        {segmentedMeter}
      </MeterRoot>
    );
  }

  if (layout === 'inline') {
    return (
      <MeterRoot width="100%" {...props}>
        <XStack alignItems="center" {...knobProps.gap}>
          <View flex={1} minWidth={0}>
            {segmentedMeter}
          </View>
          {valueNode}
        </XStack>
      </MeterRoot>
    );
  }

  return (
    <MeterRoot width="100%" {...knobProps.gap} {...props}>
      {label || valueNode ? (
        <XStack justifyContent="space-between" alignItems="baseline" {...knobProps.gap}>
          {label ? (
            <Text {...knobProps.body} flex={1} numberOfLines={1}>
              {label}
            </Text>
          ) : (
            <View flex={1} />
          )}
          {valueNode}
        </XStack>
      ) : null}
      {segmentedMeter}
    </MeterRoot>
  );
}
