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
import type { ReactNode } from 'react';
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
} from './meter';
import type { MeterFormat, MeterLayout, MeterZone } from './meter';

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

const tickLeftPercent = (cut: number, min: number, max: number): number | null => {
  if (max === min) {
    return null;
  }
  if (cut <= min || cut >= max) {
    return null;
  }
  return ((cut - min) / (max - min)) * 100;
};

const defaultValueText = (opts: {
  value?: number | null;
  visible: string;
  unit?: string;
  format?: MeterFormat;
}): string => {
  if (opts.value == null || !Number.isFinite(opts.value)) {
    return UNKNOWN_VALUE;
  }
  if (opts.format === 'percent') {
    return opts.visible;
  }
  if (opts.unit !== undefined && opts.unit !== '') {
    return `${opts.visible} used`;
  }
  return opts.visible;
};

type MeterKnobProps = ReturnType<typeof useResolvedKnobs>['knobProps'];

interface MeterState {
  known: boolean;
  zone: MeterZone;
  ratio: number | null;
  discrete: number;
  filledCount: number;
  valueNow: number | undefined;
}

const resolveMeterState = (
  opts: Pick<MeterProps, 'value' | 'min' | 'max' | 'low' | 'high' | 'optimum' | 'segments'>,
): MeterState => {
  const { value, min, max, low, high, optimum, segments } = opts;
  const known = value != null && Number.isFinite(value);
  const zone = known ? resolveMeterZone({ value, min, max, low, high, optimum }) : 'ok';
  const discrete = segments != null && Number.isFinite(segments) && segments > 0 ? Math.round(segments) : 0;
  const span = max - min;
  const filledCount =
    known && discrete > 0 && span !== 0
      ? Math.max(0, Math.min(discrete, Math.round((value - min) / (span / discrete))))
      : 0;
  return {
    known,
    zone,
    ratio: meterFillRatio(value, min, max),
    discrete,
    filledCount,
    valueNow: known ? value : undefined,
  };
};

const useMeterSizing = () => {
  const preset = usePresetContext();
  const stop = preset?.preset.knobs.borderRadius ?? defaultKnobs.borderRadius;
  // SAFETY: the preset size knob is one of the three size stops; meterTrackHeightPx maps exactly those.
  const size = (preset?.preset.knobs.size ?? defaultKnobs.size) as 'small' | 'medium' | 'large';
  return { trackH: meterTrackHeightPx(size), railRadius: resolveMeterRailRadius(stop) };
};

const trackColor = (outlined: boolean) => (outlined ? 'transparent' : METER_TRACK);

interface MeterTicksProps {
  low?: number;
  high?: number;
  min: number;
  max: number;
}

const MeterTicks = ({ low, high, min, max }: MeterTicksProps) => (
  <>
    {(
      [
        ['low', low],
        ['high', high],
      ] as const
    ).map(([name, cut]) => {
      if (cut === undefined) {
        return null;
      }
      const left = tickLeftPercent(cut, min, max);
      if (left == null) {
        return null;
      }
      return (
        <Tick
          key={name}
          left={`${left}%`}
          backgroundColor={METER_TICK}
          data-meter-tick=""
        />
      );
    })}
  </>
);

interface MeterRailProps extends MeterTicksProps {
  state: MeterState;
  label?: string;
  valuetext: string;
  trackH: number;
  railRadius: number;
  outlined: boolean;
  paintedBorder: MeterKnobProps['inputSurface']['borderWidth'];
  outlineChrome: object;
  transition: MeterKnobProps['transition'];
  disabled: boolean;
  loading: boolean;
}

const meterSemantics = (p: MeterRailProps) => ({
  'aria-label': p.label,
  'aria-valuemin': p.min,
  'aria-valuemax': p.max,
  'aria-valuetext': p.valuetext,
  'data-meter-radius-class': METER_RADIUS_CLASS,
  'data-meter-rail-radius': p.railRadius,
  'data-meter-border-width': p.paintedBorder,
  'data-meter-zone': p.state.zone,
  'data-meter-track-height': p.trackH,
});

const MeterSegments = (p: MeterRailProps) => {
  const paint = METER_ZONE_PAINT[p.state.zone];
  return (
    <XStack
      gap={3}
      data-meter-segments={p.state.discrete}
      opacity={p.disabled ? 0.5 : 1}>
      {Array.from({ length: p.state.discrete }, (_, i) => (
        <Segment
          // oxlint-disable-next-line react-doctor/no-array-index-as-key -- fixed-length positional slots; the list never reorders or filters
          key={i}
          width={19}
          height={p.trackH}
          borderRadius={p.railRadius}
          {...p.outlineChrome}
          backgroundColor={i < p.state.filledCount ? paint.fill : trackColor(p.outlined)}
        />
      ))}
    </XStack>
  );
};

const MeterContinuousRail = (p: MeterRailProps) => {
  const paint = METER_ZONE_PAINT[p.state.zone];
  const { known, ratio } = p.state;
  const transition = p.transition ?? 'none';
  return (
    <Rail
      height={p.trackH}
      minHeight={p.trackH}
      borderRadius={p.railRadius}
      {...p.outlineChrome}
      backgroundColor={trackColor(p.outlined)}
      opacity={p.disabled ? 0.5 : 1}
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- tamagui views cannot render a native <meter>
      role="meter"
      aria-valuenow={p.state.valueNow}
      {...meterSemantics(p)}
      data-meter-fill={known && ratio != null ? paint.fill : undefined}>
      {known && ratio != null ? (
        <Fill
          width={`${ratio * 100}%`}
          backgroundColor={paint.fill}
          transition={transition}
        />
      ) : null}
      <MeterTicks
        low={p.low}
        high={p.high}
        min={p.min}
        max={p.max}
      />
    </Rail>
  );
};

const MeterRail = (p: MeterRailProps): ReactNode => {
  if (p.loading) {
    return (
      <Skeleton
        variant="rounded"
        height={p.trackH}
        width="100%"
      />
    );
  }
  if (p.state.discrete === 0) {
    return <MeterContinuousRail {...p} />;
  }
  // Segmented rails still owe role=meter — park it on the segment row host.
  return (
    <View
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- tamagui views cannot render a native <meter>
      role="meter"
      aria-valuenow={p.state.valueNow}
      {...meterSemantics(p)}
      data-meter-fill={p.state.known ? METER_ZONE_PAINT[p.state.zone].fill : undefined}>
      <MeterSegments {...p} />
    </View>
  );
};

interface MeterReadoutProps {
  visible: string;
  valueInk: MeterKnobProps['textAccentColor'];
  labelProps: MeterKnobProps['label'];
}

const MeterReadout = ({ visible, valueInk, labelProps }: MeterReadoutProps) => (
  <Text
    {...labelProps}
    fontFamily="$mono"
    color={valueInk}
    whiteSpace="nowrap"
    data-meter-value=""
    data-meter-value-color={valueInk}
    {...(isWeb ? { style: { fontVariantNumeric: 'tabular-nums' } } : null)}>
    {visible}
  </Text>
);

const hasText = (text: string | undefined): text is string => text !== undefined && text !== '';

/**
 * Bounded-quantity display. Inert — no tab stop, no focus ring. The input
 * twin is Slider.
 */
export const Meter = ({
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
}: MeterProps) => {
  const { knobProps } = useResolvedKnobs({ component: 'Meter' });
  const { trackH, railRadius } = useMeterSizing();
  const { outlined } = knobProps;
  // Spread the fragment (AGENTS.md). Hardcoded 1px ignored the borderWidth knob.
  const outlineChrome = outlined ? { ...knobProps.inputSurface, borderColor: '$color6' as const } : { borderWidth: 0 };
  const paintedBorder = outlined ? knobProps.inputSurface.borderWidth : 0;
  const state = resolveMeterState({ value, min, max, low, high, optimum, segments });
  const paint = METER_ZONE_PAINT[state.zone];
  const valueInk = 'value' in paint ? paint.value : knobProps.textAccentColor;
  const visible = formatMeterValue({ value, min, max, unit, format, valueLabel });
  const valuetext = valueText ?? defaultValueText({ value, visible, unit, format });

  const valueNode =
    layout === 'bare' ? null : (
      <MeterReadout
        visible={visible}
        valueInk={valueInk}
        labelProps={knobProps.label}
      />
    );

  const segmentedMeter = (
    <MeterRail
      state={state}
      label={label}
      valuetext={valuetext}
      trackH={trackH}
      railRadius={railRadius}
      outlined={outlined}
      paintedBorder={paintedBorder}
      outlineChrome={outlineChrome}
      transition={knobProps.transition}
      disabled={disabled}
      loading={loading}
      low={low}
      high={high}
      min={min}
      max={max}
    />
  );

  if (layout === 'bare') {
    return (
      <MeterRoot
        width="100%"
        {...props}>
        {segmentedMeter}
      </MeterRoot>
    );
  }

  if (layout === 'inline') {
    return (
      <MeterRoot
        width="100%"
        {...props}>
        <XStack
          alignItems="center"
          {...knobProps.gap}>
          <View
            flex={1}
            minWidth={0}>
            {segmentedMeter}
          </View>
          {valueNode}
        </XStack>
      </MeterRoot>
    );
  }

  return (
    <MeterRoot
      width="100%"
      {...knobProps.gap}
      {...props}>
      {hasText(label) || valueNode ? (
        <XStack
          justifyContent="space-between"
          alignItems="baseline"
          {...knobProps.gap}>
          {hasText(label) ? (
            <Text
              {...knobProps.body}
              flex={1}
              numberOfLines={1}>
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
};
