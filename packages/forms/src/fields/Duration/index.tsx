import { ClockIcon } from '@phosphor-icons/react';
import { useTouchSurface, sizeRecipeForToken } from '@repo/theme';
import type { KnobProps } from '@repo/theme';
import type { ComponentProps, ReactNode } from 'react';
import { useCallback, useState } from 'react';
import type { LabelProps, SizeTokens } from 'tamagui';
import { Text, XStack, YStack, isWeb } from 'tamagui';

import { Button } from '../../Button';
import { Field, FieldLayout } from '../../FieldLayout';
import { Input as InputParts } from '../../InputParts';
import { formCommonColors } from '../../shared/color-ramps';
import { t } from '../../shared/t';
import { useIsInTableCell } from '../../shared/table-cell-context';
import type { FieldValidators } from '../../shared/utils';
import {
  getFieldError,
  getFieldHeight,
  mergeFieldHandler,
  useFormField,
  useResolvedValidators,
} from '../../shared/utils';
import { Skeleton } from '../../Skeleton';
import type { AnyFormApi } from '../../types';

import {
  durationSegmentWidth,
  normalizeSeconds,
  parseDurationText,
  partsToSeconds,
  secondsToParts,
} from './duration-math';
import type { DurationParts } from './duration-math';

export type { DurationParts } from './duration-math';
export {
  durationSegmentWidth,
  normalizeSeconds,
  parseDurationText,
  partsToSeconds,
  secondsToParts,
} from './duration-math';

type BlurHandler = NonNullable<ComponentProps<typeof FieldLayout>['onBlur']>;

/** Structural subset of the web key event this field reads (RN-web may omit parts). */
interface KeyEventLike {
  key?: string;
  nativeEvent?: { key?: string };
  preventDefault?: () => void;
}

/** Structural subset of the web paste event this field reads. */
interface PasteEventLike {
  clipboardData?: { getData?: (type: string) => string } | null;
  preventDefault?: () => void;
}

const hasErrorValue = (error: string | boolean | undefined): boolean =>
  error !== undefined && error !== false && error !== '';

export interface DurationPreset {
  label: string;
  seconds: number;
}

const defaultPresets: DurationPreset[] = [
  { label: '15m', seconds: 900 },
  { label: '30m', seconds: 1800 },
  { label: '1h', seconds: 3600 },
  { label: '2h', seconds: 7200 },
  { label: '4h', seconds: 14_400 },
  { label: '8h', seconds: 28_800 },
];

/** Preset chips stay on the $2 row (28px). The field size knob does not reach them. */
export const DURATION_PRESET_SIZE = '$2' as const;

const DurationSegment = ({
  id,
  unit,
  ariaLabel,
  value,
  onCommit,
  onPasteDuration,
  disabled,
  readOnly,
  knobProps,
  wide,
  placeholder,
  required,
  hasError,
  sizeToken,
}: {
  id?: string;
  unit: string;
  ariaLabel: string;
  value: number;
  onCommit: (next: number) => void;
  onPasteDuration: (seconds: number) => void;
  disabled?: boolean;
  readOnly?: boolean;
  knobProps: KnobProps;
  wide?: boolean;
  placeholder?: string;
  required?: boolean;
  hasError?: boolean;
  sizeToken: string;
}) => {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (wide ? String(value) : String(value).padStart(2, '0'));
  const locked = disabled === true || readOnly === true;
  const recipe = sizeRecipeForToken(sizeToken);
  const segmentWidth = durationSegmentWidth(sizeToken, wide ? 3 : 2);

  const commitDraft = () => {
    if (draft == null) {
      return;
    }
    const n = normalizeSeconds(draft === '' ? 0 : Number(draft));
    setDraft(null);
    onCommit(n);
  };

  return (
    <XStack
      alignItems="center"
      gap={recipe.gap}
      flexGrow={0}
      flexShrink={0}
      height="100%"
      data-duration-segment={ariaLabel}>
      <InputParts.Area
        id={id}
        value={shown}
        placeholder={placeholder}
        keyboardType="numeric"
        disabled={disabled}
        readOnly={readOnly}
        aria-label={ariaLabel}
        aria-disabled={disabled === true ? true : undefined}
        aria-readonly={readOnly === true ? true : undefined}
        aria-required={required === true ? true : undefined}
        aria-invalid={hasError === true ? true : undefined}
        color={formCommonColors.text}
        textAlign="right"
        {...knobProps.controlType}
        flex={0}
        width={segmentWidth}
        minWidth={segmentWidth}
        maxWidth={segmentWidth}
        height={recipe.height}
        minHeight={0}
        maxHeight={recipe.height}
        // SAFETY: sizeToken is always a tamagui size token string (from the size prop or knobProps.sizeToken).
        size={sizeToken as SizeTokens}
        data-duration-input-height={recipe.height}
        paddingHorizontal={0}
        maxLength={wide ? 5 : 3}
        {...(isWeb && disabled ? { tabIndex: -1 } : undefined)}
        onChangeText={(text) => {
          if (locked) {
            return;
          }
          if (text !== '' && !/^\d+$/u.test(text)) {
            return;
          }
          setDraft(text);
        }}
        onBlur={locked ? undefined : commitDraft}
        onFocus={
          locked
            ? undefined
            : () => {
                setDraft(String(value));
              }
        }
        {...(isWeb
          ? {
              fontVariantNumeric: 'tabular-nums',
              onKeyDown: locked
                ? undefined
                : (e: KeyEventLike) => {
                    const key = e?.nativeEvent?.key ?? e?.key;
                    if (key === 'ArrowUp') {
                      e?.preventDefault?.();
                      setDraft(null);
                      onCommit(value + 1);
                    } else if (key === 'ArrowDown') {
                      e?.preventDefault?.();
                      setDraft(null);
                      onCommit(Math.max(0, value - 1));
                    } else if (key === 'Enter') {
                      e?.preventDefault?.();
                      commitDraft();
                    }
                  },
              onPaste: locked
                ? undefined
                : (e: PasteEventLike) => {
                    const text = e?.clipboardData?.getData?.('text') ?? '';
                    const parsed = parseDurationText(text);
                    if (parsed == null) {
                      return;
                    }
                    e?.preventDefault?.();
                    setDraft(null);
                    onPasteDuration(parsed);
                  },
            }
          : {})}
      />
      <Text
        {...knobProps.body}
        {...knobProps.controlType}
        color={formCommonColors.muted}
        textTransform="lowercase">
        {unit}
      </Text>
    </XStack>
  );
};

const DurationControl = ({
  seconds,
  onChange,
  disabled,
  readOnly,
  hideDays,
  showSeconds,
  clockIcon,
  hasError,
  id,
  hasLabel,
  placeholder,
  required,
  size,
  knobProps,
}: {
  seconds: number;
  onChange: (seconds: number) => void;
  disabled?: boolean;
  readOnly?: boolean;
  hideDays: boolean;
  showSeconds: boolean;
  clockIcon?: ReactNode | null;
  hasError?: boolean;
  id?: string;
  hasLabel?: boolean;
  placeholder?: string;
  required?: boolean;
  size?: SizeTokens;
  knobProps: KnobProps;
}) => {
  const parts = secondsToParts(seconds, hideDays);
  const effectiveSize = size === undefined || size === '' || size === 0 ? knobProps.sizeToken : size;
  const sizeToken = String(effectiveSize);
  const recipe = sizeRecipeForToken(sizeToken);
  const resolvedClock = clockIcon === undefined ? <ClockIcon size={recipe.iconSize} /> : clockIcon;

  const commitParts = useCallback(
    (patch: Partial<DurationParts>) => {
      onChange(partsToSeconds({ ...parts, ...patch }, hideDays));
    },
    [hideDays, onChange, parts],
  );

  return (
    <InputParts size={effectiveSize}>
      <InputParts.Box
        theme={hasError ? 'error' : undefined}
        elevation={undefined}
        disabled={disabled}
        // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- Box is a styled stack; swapping in a native fieldset would change its layout and default styling
        role="group"
        aria-label={hasLabel ? undefined : t('Duration')}
        data-ring-target="box"
        data-duration-box=""
        justifyContent="flex-start"
        alignItems="stretch"
        // SAFETY: sizeToken is always a tamagui size token string (from the size prop or knobProps.sizeToken).
        size={sizeToken as SizeTokens}
        height={recipe.height}
        sizeRecipeEscape="duration-box">
        <InputParts.Section
          justifyContent="flex-start"
          alignItems="stretch"
          flexGrow={1}
          flexShrink={1}
          flexBasis="auto"
          minWidth={0}>
          <XStack
            alignItems="center"
            justifyContent="flex-start"
            width="100%"
            height="100%"
            flexGrow={0}
            flexShrink={1}
            gap={recipe.gap}
            data-duration-row="">
            {resolvedClock == null ? null : <InputParts.Icon adornment="leading">{resolvedClock}</InputParts.Icon>}
            {hideDays ? null : (
              <DurationSegment
                id={id}
                unit={t('d')}
                ariaLabel={t('Days')}
                value={parts.days}
                onCommit={(days) => {
                  commitParts({ days });
                }}
                onPasteDuration={onChange}
                disabled={disabled}
                readOnly={readOnly}
                knobProps={knobProps}
                placeholder={placeholder}
                required={required}
                hasError={hasError}
                sizeToken={sizeToken}
              />
            )}
            <DurationSegment
              id={hideDays ? id : `${id}-hours`}
              unit={t('h')}
              ariaLabel={t('Hours')}
              value={parts.hours}
              onCommit={(hours) => {
                commitParts({ hours });
              }}
              onPasteDuration={onChange}
              disabled={disabled}
              readOnly={readOnly}
              knobProps={knobProps}
              wide
              placeholder={hideDays ? placeholder : undefined}
              required={required}
              hasError={hasError}
              sizeToken={sizeToken}
            />
            <DurationSegment
              id={`${id}-minutes`}
              unit={t('m')}
              ariaLabel={t('Min')}
              value={parts.minutes}
              onCommit={(minutes) => {
                commitParts({ minutes });
              }}
              onPasteDuration={onChange}
              disabled={disabled}
              readOnly={readOnly}
              knobProps={knobProps}
              required={required}
              hasError={hasError}
              sizeToken={sizeToken}
            />
            {showSeconds ? (
              <DurationSegment
                id={`${id}-seconds`}
                unit={t('s')}
                ariaLabel={t('Sec')}
                value={parts.seconds}
                onCommit={(secs) => {
                  commitParts({ seconds: secs });
                }}
                onPasteDuration={onChange}
                disabled={disabled}
                readOnly={readOnly}
                knobProps={knobProps}
                required={required}
                hasError={hasError}
                sizeToken={sizeToken}
              />
            ) : null}
          </XStack>
        </InputParts.Section>
      </InputParts.Box>
    </InputParts>
  );
};

const DurationPresets = ({
  seconds,
  presets,
  onChange,
  knobProps,
}: {
  seconds: number;
  presets: DurationPreset[];
  onChange: (seconds: number) => void;
  knobProps: KnobProps;
}) => {
  if (presets.length === 0) {
    return null;
  }
  return (
    <XStack
      {...knobProps.gap}
      flexWrap="wrap"
      data-duration-presets="">
      {presets.map((preset) => {
        const selected = seconds === preset.seconds;
        return (
          <Button
            key={preset.seconds}
            compact
            size={DURATION_PRESET_SIZE}
            outlined={!selected}
            accent={selected}
            data-duration-preset={preset.label}
            onPress={() => {
              onChange(preset.seconds);
            }}>
            {preset.label}
          </Button>
        );
      })}
    </XStack>
  );
};

export interface DurationProps {
  name?: string;
  form?: AnyFormApi;
  validators?: FieldValidators;
  label?: ReactNode;
  labelProps?: Omit<LabelProps, 'htmlFor' | 'ref'>;
  helperText?: string;
  error?: string | boolean;
  required?: boolean;
  size?: SizeTokens;
  id?: string;
  /** Duration in seconds */
  value?: number;
  defaultValue?: number;
  onChange?: (value: number) => void;
  onBlur?: BlurHandler;
  disabled?: boolean;
  readOnly?: boolean;
  /** Show seconds segment (default false) */
  showSeconds?: boolean;
  /**
   * Hide the days segment and fold days into hours (default true).
   * Pass `false` for Frappe-parity day + hour + minute entry.
   */
  hideDays?: boolean;
  /** Quick-select presets. Pass [] to hide. */
  presets?: DurationPreset[];
  placeholder?: string;
  /**
   * Leading clock affordance. Package default is the Phosphor clock.
   * Pass `null` to hide the adornment.
   */
  clockIcon?: ReactNode | null;
  /** When true, renders a skeleton placeholder instead of the duration picker */
  skeleton?: boolean;
  /** When true, applies compact density (tighter layout gaps; control size unchanged) */
  compact?: boolean;
}

export const Duration = ({
  name,
  form: formProp,
  validators,
  label,
  labelProps,
  helperText,
  error,
  required,
  size,
  id: idProp,
  value,
  defaultValue,
  onChange,
  onBlur,
  disabled,
  readOnly,
  showSeconds = false,
  hideDays = true,
  presets = defaultPresets,
  placeholder = t('Select duration'),
  clockIcon,
  skeleton,
  compact,
}: DurationProps) => {
  const hydrationTouch = useTouchSurface();
  const { resolvedForm, knobProps, id } = useFormField({
    form: formProp,
    id: idProp,
    compact,
  });
  const resolvedValidators = useResolvedValidators(required, validators, label, name);
  const isControlled = value !== undefined;
  const [internal, setInternal] = useState(() => normalizeSeconds(defaultValue ?? 0));
  const seconds = normalizeSeconds(isControlled ? value : internal);
  const inTableCell = useIsInTableCell();
  // SAFETY: the size prop and knobProps.sizeToken are both tamagui size tokens.
  const resolvedSize = (size ?? knobProps.sizeToken) as SizeTokens;
  const visualHeight = getFieldHeight(resolvedSize, 1, hydrationTouch);

  const handleChange = useCallback(
    (next: number, fieldChange?: (v: number) => void) => {
      const n = normalizeSeconds(next);
      if (!isControlled) {
        setInternal(n);
      }
      fieldChange?.(n);
      onChange?.(n);
    },
    [isControlled, onChange],
  );

  if (skeleton) {
    return (
      <FieldLayout
        id={id}
        label={label}
        size={size}
        knobProps={knobProps}>
        <InputParts size={resolvedSize}>
          <Skeleton
            variant="rounded"
            width="100%"
            height={visualHeight}
            data-duration-skeleton=""
          />
        </InputParts>
      </FieldLayout>
    );
  }

  const fieldBody = (current: number, onValueChange: (s: number) => void, hasError = false) => (
    <YStack {...knobProps.gap}>
      <DurationControl
        seconds={current}
        onChange={onValueChange}
        disabled={disabled}
        readOnly={readOnly}
        hideDays={hideDays}
        showSeconds={showSeconds}
        clockIcon={clockIcon}
        hasError={hasError}
        id={id}
        hasLabel={Boolean(label)}
        placeholder={placeholder}
        required={required}
        size={size}
        knobProps={knobProps}
      />
      {readOnly === true || disabled === true || inTableCell ? null : (
        <DurationPresets
          seconds={current}
          presets={presets}
          onChange={onValueChange}
          knobProps={knobProps}
        />
      )}
    </YStack>
  );

  if (resolvedForm == null || name === undefined || name === '') {
    return (
      <FieldLayout
        id={id}
        label={label}
        labelProps={labelProps}
        error={error}
        helperText={helperText}
        required={required}
        size={size}
        knobProps={knobProps}
        onBlur={onBlur}
        disabled={disabled}>
        {fieldBody(
          seconds,
          (s) => {
            handleChange(s);
          },
          hasErrorValue(error),
        )}
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
        const fieldValue = normalizeSeconds(field.state.value ?? 0);
        return (
          <FieldLayout
            id={id}
            label={label}
            labelProps={labelProps}
            error={resolvedError}
            helperText={helperText}
            required={required}
            size={size}
            knobProps={knobProps}
            onBlur={mergeFieldHandler(field, 'handleBlur', onBlur)}
            disabled={disabled}>
            {fieldBody(
              fieldValue,
              (s) => {
                handleChange(s, (v) => {
                  field.handleChange(v);
                });
              },
              hasErrorValue(resolvedError),
            )}
          </FieldLayout>
        );
      }}
    </Field>
  );
};
