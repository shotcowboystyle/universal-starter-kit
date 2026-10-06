import { Intent } from '@repo/theme';
import type { KnobProps } from '@repo/theme';
import { getSize } from '@tamagui/get-token';
import type { ComponentProps, ReactNode } from 'react';
import { Progress as TamaguiProgress, Text, View, XStack, getVariableValue, isWeb, styled, useTheme } from 'tamagui';
import type { LabelProps, SizeTokens, ProgressProps as TamaguiProgressProps } from 'tamagui';

import { Field, FieldLayout, useFieldDescribedBy } from '../../FieldLayout';
import { formControlColors } from '../../shared/color-ramps';
import { bidiIsolate, t } from '../../shared/t';
import { useIsInTableCell } from '../../shared/table-cell-context';
import type { ElevationWrapperProps, FieldValidators } from '../../shared/utils';
import {
  getElevationWrapperProps,
  getFieldError,
  mergeFieldHandler,
  useFormField,
  useResolvedValidators,
} from '../../shared/utils';
import { Skeleton } from '../../Skeleton';
import type { AnyFormApi } from '../../types';

type BlurHandler = NonNullable<ComponentProps<typeof FieldLayout>['onBlur']>;

const hasErrorValue = (error: string | boolean | undefined): boolean =>
  error !== undefined && error !== false && error !== '';

const ProgressFrame = styled(TamaguiProgress, {
  backgroundColor: formControlColors.background,
  overflow: 'hidden',
  variants: {
    outlined: {
      true: {
        backgroundColor: 'transparent',
      },
    },
  } as const,
});

const ProgressIndicator = styled(TamaguiProgress.Indicator, {
  backgroundColor: formControlColors.border,
});

/** Semantic indicator intent — matches the theme's Intent union. */
export type ProgressIntent = 'accent' | 'error' | 'warning' | 'success';

/**
 * Tamagui Progress size is 0.25 × the size token (a thin track, not a 44px
 * input). Skeleton height must use the same formula so the skeleton anatomy matches.
 */
const trackHeightPx = (size: SizeTokens): number => {
  try {
    const raw: unknown = getVariableValue(getSize(size));
    const n = Number(raw);
    if (!Number.isFinite(n)) {
      return 11;
    }
    return Math.round(n * 0.25);
  } catch {
    return 11;
  }
};

const resolveMax = (max: number | undefined): number =>
  max !== undefined && Number.isFinite(max) && max > 0 ? max : 100;

const clampProgress = (value: number, max: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(max, Math.max(0, value));
};

const indicatorMotion = (transition: KnobProps['transition']) => {
  // `transition` only — the tamagui 1.x `animation` prop is silently dropped
  // on 2.x (convention lint). Named motion rides the knob; `none` is an
  // explicit stop so Tamagui's Indicator default cannot keep tweening.
  if (transition == null || transition === '') {
    return { transition: 'none' as const };
  }
  return { transition };
};

/**
 * Semantic hue fill: `$color9`, the hue's tint-independent solid step (the
 * Gantt-bar recipe), rendered INSIDE `<Intent name>` so it resolves on
 * the hue sub-theme. Captured as a concrete value (Button focus-ring
 * precedent) rather than passed as a token: a `$color9` token on the
 * indicator itself would re-resolve inside Tamagui's auto-applied
 * `ProgressIndicator` COMPONENT sub-theme, whose re-ramped `color9` is a
 * pale wash — not the hue solid. useTheme() subscribes, so scheme changes
 * stay live.
 */
const HueFillIndicator = ({ transition }: { transition: KnobProps['transition'] }) => {
  const theme = useTheme();
  const fill = String(theme.color9?.val ?? '');
  return (
    <ProgressIndicator
      {...(fill === '' ? undefined : { backgroundColor: fill })}
      {...indicatorMotion(transition)}
    />
  );
};

export interface ProgressProps {
  name?: string;
  form?: AnyFormApi;
  validators?: FieldValidators;
  label?: ReactNode;
  labelProps?: Omit<LabelProps, 'htmlFor' | 'ref'>;
  helperText?: string;
  error?: string | boolean;
  required?: boolean;
  readOnly?: boolean;
  size?: SizeTokens;
  id?: string;
  value?: number;
  defaultValue?: number;
  max?: number;
  /**
   * Canonical change prop. Progress is display-only — the field
   * never mutates from user input — but the contract still accepts
   * `onChange(value)` so wiring it never silently no-ops at the type layer.
   */
  onChange?: (value: number) => void;
  onBlur?: BlurHandler;
  progressProps?: Omit<TamaguiProgressProps, 'value' | 'max' | 'id' | 'children'>;
  /**
   * Semantic indicator fill resolved via the theme ramps: `accent`
   * fills with the base theme's `$accentBackground`; `error`/`warning`/
   * `success` ride their hue sub-theme's `$color9`. Omit to keep the gray
   * form ramp.
   */
  intent?: ProgressIntent;
  /** When true, renders a skeleton placeholder instead of the progress bar */
  skeleton?: boolean;
  /** When true, applies compact density (tighter layout gaps; control size unchanged) */
  compact?: boolean;
  /**
   * Visible percent beside the track (Primer / Polaris text pairing).
   * Defaults on when a field label is present; unlabeled embeds and table
   * cells stay bar-only unless this is forced on.
   */
  showValue?: boolean;
}

interface ProgressTrackProps {
  id: string;
  label?: ReactNode;
  progressValue: number;
  max: number;
  required?: boolean;
  readOnly?: boolean;
  hasError?: boolean;
  intent?: ProgressIntent;
  size?: SizeTokens;
  sizeToken: SizeTokens;
  knobProps: KnobProps;
  elevationWrapperProps: ElevationWrapperProps;
  progressProps?: ProgressProps['progressProps'];
  showValue: boolean;
  blurHandler?: BlurHandler;
}

const ProgressTrack = ({
  id,
  label,
  progressValue,
  max,
  required,
  readOnly,
  hasError,
  intent,
  size,
  sizeToken,
  knobProps,
  elevationWrapperProps,
  progressProps,
  showValue,
  blurHandler,
}: ProgressTrackProps) => {
  const describedBy = useFieldDescribedBy();
  const trackSize = size ?? sizeToken;
  const percent = Math.round((progressValue / max) * 100);
  const motion = indicatorMotion(knobProps.transition);
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- label is ReactNode; only a non-empty string can serve as aria-label
  const name = typeof label === 'string' && label !== '' ? label : t('Progress');
  const valueTextProps = isWeb
    ? { 'aria-hidden': true, style: { fontVariantNumeric: 'tabular-nums' } }
    : { accessible: false };

  const progressElement = (
    <ProgressFrame
      size={trackSize}
      overflow="hidden"
      outlined={knobProps.outlined}
      {...knobProps.borderRadius}
      {...(knobProps.outlined ? knobProps.inputSurface : { borderWidth: 0 })}
      {...(knobProps.outlined ? { borderColor: formControlColors.boundary } : undefined)}
      aria-label={name}
      aria-describedby={describedBy}
      aria-readonly={readOnly === true ? true : undefined}
      // Tamagui's size variant pins minWidth ≈ height×20 (~220px). Zero it
      // after `size` so the track fills the cell / form column.
      width="100%"
      minWidth={0}
      {...progressProps}
      id={id}
      value={progressValue}
      max={max}
      {...(blurHandler === undefined ? undefined : { onBlur: blurHandler })}
      aria-required={required === true ? true : undefined}
      aria-invalid={hasError === true ? true : undefined}>
      {intent !== undefined && intent !== 'accent' ? (
        <Intent name={intent}>
          <HueFillIndicator transition={knobProps.transition} />
        </Intent>
      ) : (
        // `accent` rides the base theme's `$accentBackground` — the exact
        // fill the bespoke XP bar used (the "accent" sub-theme is the SOLID
        // ramp, wrong for a fill; same reasoning as Gantt bars / Toast).
        // undefined keeps the styled default (gray form ramp) untouched.
        <ProgressIndicator
          backgroundColor={intent === 'accent' ? '$accentBackground' : undefined}
          {...motion}
        />
      )}
    </ProgressFrame>
  );

  const bar =
    elevationWrapperProps.elevation !== undefined && elevationWrapperProps.elevation !== 0 ? (
      <View
        {...elevationWrapperProps}
        borderRadius={knobProps.borderRadius.borderRadius}
        flex={1}
        minWidth={0}
        width="100%">
        {progressElement}
      </View>
    ) : (
      <View
        flex={1}
        minWidth={0}
        width="100%">
        {progressElement}
      </View>
    );

  return (
    <XStack
      {...knobProps.gap}
      alignItems="center"
      width="100%">
      {bar}
      {showValue ? (
        <Text
          {...knobProps.body}
          color={knobProps.textAccentColor}
          minWidth={40}
          textAlign="right"
          flexShrink={0}
          {...valueTextProps}>
          {bidiIsolate(`${percent}%`)}
        </Text>
      ) : null}
    </XStack>
  );
};

export const Progress = ({
  name,
  form: formProp,
  validators,
  label,
  labelProps,
  helperText,
  error,
  required,
  readOnly,
  size,
  id: idProp,
  value,
  defaultValue,
  max,
  onChange: _onChange,
  onBlur,
  progressProps,
  intent,
  skeleton,
  compact,
  showValue: showValueProp,
}: ProgressProps) => {
  const { resolvedForm, knobProps, elevation, id } = useFormField({
    form: formProp,
    id: idProp,
    compact,
  });
  const resolvedValidators = useResolvedValidators(required, validators, label, name);
  const resolvedMax = resolveMax(max);
  const inTableCell = useIsInTableCell();
  const showValue = showValueProp ?? (Boolean(label) && !inTableCell);
  const elevationWrapperProps = inTableCell ? {} : getElevationWrapperProps(knobProps, elevation);
  const trackSize = size ?? knobProps.sizeToken;

  const skeletonTrack = (
    <XStack
      {...knobProps.gap}
      alignItems="center"
      width="100%">
      <Skeleton
        variant="rounded"
        width="100%"
        height={trackHeightPx(trackSize)}
        flex={1}
      />
      {showValue ? (
        <Skeleton
          variant="text"
          width={40}
        />
      ) : null}
    </XStack>
  );

  if (skeleton) {
    if (inTableCell) {
      return skeletonTrack;
    }
    return (
      <FieldLayout
        id={id}
        label={label}
        size={size}
        knobProps={knobProps}>
        {skeletonTrack}
      </FieldLayout>
    );
  }

  const renderTrack = (rawValue: number, blurHandler?: BlurHandler, hasError = false) => (
    <ProgressTrack
      id={id}
      label={label}
      progressValue={clampProgress(rawValue, resolvedMax)}
      max={resolvedMax}
      required={required}
      readOnly={readOnly}
      hasError={hasError}
      intent={intent}
      size={size}
      sizeToken={knobProps.sizeToken}
      knobProps={knobProps}
      elevationWrapperProps={elevationWrapperProps}
      progressProps={progressProps}
      showValue={showValue}
      blurHandler={blurHandler}
    />
  );

  if (resolvedForm == null || name === undefined || name === '') {
    const track = renderTrack(value ?? defaultValue ?? 0, undefined, hasErrorValue(error));
    if (inTableCell) {
      return track;
    }
    return (
      <FieldLayout
        id={id}
        label={label}
        labelProps={labelProps}
        error={error}
        required={required}
        helperText={helperText}
        size={size}
        knobProps={knobProps}>
        {track}
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
        const track = renderTrack(
          field.state.value ?? 0,
          mergeFieldHandler(field, 'handleBlur', onBlur),
          hasErrorValue(resolvedError),
        );
        if (inTableCell) {
          return track;
        }
        return (
          <FieldLayout
            id={id}
            label={label}
            labelProps={labelProps}
            error={resolvedError}
            required={required}
            helperText={helperText}
            size={size}
            knobProps={knobProps}>
            {track}
          </FieldLayout>
        );
      }}
    </Field>
  );
};
