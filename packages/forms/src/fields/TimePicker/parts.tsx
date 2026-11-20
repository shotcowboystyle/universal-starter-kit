import { ClockIcon, XIcon } from '@phosphor-icons/react';
import { useResolvedKnobs } from '@repo/theme';
import type { ReactNode } from 'react';
import { View, isWeb } from 'tamagui';

import { Input as InputParts } from '../../InputParts';
import { formCommonColors } from '../../shared/color-ramps';
import { t } from '../../shared/t';
import { TimeWheels } from '../../shared/TimeColumn';

export type TimeFormat = '12h' | '24h';

const timeStringRegex = /^(?<hour>[01]?\d|2[0-3]):[0-5]\d(?<seconds>:[0-5]\d)?$/u;

// oxlint-disable-next-line react-doctor/only-export-components -- time helpers are co-located with the picker parts by design; consumers import both from './parts'
export const isValidTimeString = (value: string): boolean => timeStringRegex.test(value.trim());

type FieldError = string | boolean | undefined;

/** First non-empty error: `primary` unless it is unset/false/empty, then `fallback`. */
// oxlint-disable-next-line react-doctor/only-export-components -- time helpers are co-located with the picker parts by design; consumers import both from './parts'
export const firstError = (primary: FieldError, fallback: FieldError): FieldError =>
  primary === undefined || primary === false || primary === '' ? fallback : primary;

const clampTimePart = (raw: string | undefined, max: number): number => {
  // oxlint-disable-next-line unicorn/prefer-number-coercion -- parseInt tolerates trailing junk ("12abc" -> 12) where Number() would give NaN
  const parsed = Number.parseInt(raw === undefined || raw === '' ? '0' : raw, 10);
  return Math.max(0, Math.min(max, Number.isNaN(parsed) ? 0 : parsed));
};

// oxlint-disable-next-line react-doctor/only-export-components -- time helpers are co-located with the picker parts by design; consumers import both from './parts'
export const parseTimeString = (value: string) => {
  if (!value) {
    return { h: 0, m: 0, s: 0 };
  }
  const parts = value.split(':');
  return {
    h: clampTimePart(parts[0], 23),
    m: clampTimePart(parts[1], 59),
    s: clampTimePart(parts[2], 59),
  };
};

// oxlint-disable-next-line react-doctor/only-export-components -- time helpers are co-located with the picker parts by design; consumers import both from './parts'
export const toTimeString = (h: number, m: number, s?: number): string => {
  const base = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return s === undefined ? base : `${base}:${String(s).padStart(2, '0')}`;
};

// oxlint-disable-next-line react-doctor/only-export-components -- time helpers are co-located with the picker parts by design; consumers import both from './parts'
export const to12Hour = (h24: number) =>
  ({
    h: h24 % 12 === 0 ? 12 : h24 % 12,
    period: h24 >= 12 ? 'PM' : 'AM',
  }) satisfies { h: number; period: 'AM' | 'PM' };

// oxlint-disable-next-line react-doctor/only-export-components -- time helpers are co-located with the picker parts by design; consumers import both from './parts'
export const formatTimeDisplay = (value: string, format: TimeFormat, showSeconds: boolean): string => {
  if (!value) {
    return '';
  }
  const { h, m, s } = parseTimeString(value);
  const secSuffix = showSeconds ? `:${String(s).padStart(2, '0')}` : '';
  if (format === '24h') {
    return `${toTimeString(h, m)}${secSuffix}`;
  }
  const { h: displayH, period } = to12Hour(h);
  return `${displayH}:${String(m).padStart(2, '0')}${secSuffix} ${period}`;
};

// oxlint-disable-next-line react-doctor/only-export-components -- time helpers are co-located with the picker parts by design; consumers import both from './parts'
export const to24Hour = (displayH: number, period: 'AM' | 'PM'): number => {
  const wrapped = ((displayH - 1) % 12) + 1;
  if (period === 'AM') {
    return wrapped === 12 ? 0 : wrapped;
  }
  return wrapped === 12 ? 12 : wrapped + 12;
};

export const TimePanel = ({
  value,
  onChange,
  timeFormat,
  minuteStep,
  showSeconds,
}: {
  value: string;
  onChange: (time: string) => void;
  timeFormat: TimeFormat;
  minuteStep: number;
  showSeconds: boolean;
}) => {
  const { knobProps } = useResolvedKnobs({ compact: true });
  const { h, m, s } = parseTimeString(value);

  return (
    <View
      width="100%"
      {...knobProps.panelPadding}
      data-testid="time-picker-panel">
      <TimeWheels
        hour24={h}
        minute={m}
        second={s}
        timeFormat={timeFormat}
        minuteStep={minuteStep}
        showSeconds={showSeconds}
        onChange={(hour24, minute, second) => {
          onChange(showSeconds ? toTimeString(hour24, minute, second) : toTimeString(hour24, minute));
        }}
      />
    </View>
  );
};

export const TimePickerClearButton = ({ onClear, disabled }: { onClear: () => void; disabled?: boolean }) => (
  <InputParts.Button
    data-testid="time-picker-clear"
    aria-label={t('Clear time')}
    disabled={disabled}
    onPress={(e) => {
      e.stopPropagation();
      onClear();
    }}>
    <InputParts.Icon>
      <XIcon />
    </InputParts.Icon>
  </InputParts.Button>
);

interface TimePickerInputTriggerProps {
  value: string;
  placeholder: string;
  disabled?: boolean;
  error?: boolean;
  id?: string;
  clockIcon?: ReactNode;
  onOpen: () => void;
  onClear: () => void;
  'aria-label'?: string;
  'aria-required'?: boolean;
  'aria-invalid'?: boolean;
  'aria-readonly'?: boolean;
}

interface TriggerKeyEvent {
  nativeEvent?: { key?: string };
  key?: string;
  preventDefault?: () => void;
}

const openOnActivationKey = (e: TriggerKeyEvent, onOpen: () => void): void => {
  const key = e?.nativeEvent?.key ?? e?.key;
  if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
    e?.preventDefault?.();
    onOpen();
  }
};

export const TimePickerInputTrigger = ({
  value,
  placeholder,
  disabled,
  error,
  id,
  clockIcon,
  onOpen,
  onClear,
  'aria-label': ariaLabel,
  'aria-required': ariaRequired,
  'aria-invalid': ariaInvalid,
  'aria-readonly': ariaReadonly,
}: TimePickerInputTriggerProps) => (
  <View
    flexDirection="row"
    alignItems="center"
    width="100%"
    cursor={disabled ? 'not-allowed' : 'pointer'}
    data-testid="time-picker-trigger"
    pointerEvents={isWeb ? undefined : 'none'}>
    <InputParts.Box
      theme={error ? 'error' : undefined}
      // Yoga has no intrinsic TextInput width: without this the empty
      // trigger collapses to its clock glyph on native.
      {...(isWeb ? undefined : { flex: 1, minWidth: 0 })}
      elevation={undefined}
      onPress={isWeb && !disabled ? onOpen : undefined}
      {...(disabled ? { opacity: 0.5, pointerEvents: 'none' as const } : undefined)}>
      <InputParts.Section data-testid="time-picker-glyph">
        <InputParts.Icon
          adornment="leading"
          color={formCommonColors.muted}>
          {clockIcon ?? <ClockIcon />}
        </InputParts.Icon>
      </InputParts.Section>
      <InputParts.Section>
        <InputParts.Area
          readOnly
          pointerEvents="none"
          id={id}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          color={formCommonColors.text}
          placeholderTextColor={formCommonColors.muted}
          aria-label={ariaLabel}
          aria-required={ariaRequired}
          aria-invalid={ariaInvalid}
          aria-readonly={ariaReadonly}
          // oxlint-disable-next-line typescript/no-deprecated -- RN TextInput only exposes onKeyPress; onKeyDown/onKeyUp do not exist on native
          onKeyPress={
            disabled
              ? undefined
              : (e: TriggerKeyEvent) => {
                  openOnActivationKey(e, onOpen);
                }
          }
        />
      </InputParts.Section>
      {value && isWeb ? (
        <InputParts.Section>
          <TimePickerClearButton
            onClear={onClear}
            disabled={disabled}
          />
        </InputParts.Section>
      ) : null}
    </InputParts.Box>
  </View>
);
