import { ClockIcon, XIcon } from '@phosphor-icons/react';
import { useResolvedKnobs } from '@repo/theme';
import type { ReactNode } from 'react';
import { View, isWeb } from 'tamagui';

import { Input as InputParts } from '../../InputParts';
import { formCommonColors } from '../../shared/colorRamps';
import { t } from '../../shared/t';
import { TimeWheels } from '../../shared/TimeColumn';

export type TimeFormat = '12h' | '24h';

const timeStringRegex = /^([01]?\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export function isValidTimeString(value: string): boolean {
  return timeStringRegex.test(value.trim());
}

export function parseTimeString(value: string): { h: number; m: number; s: number } {
  if (!value) {
    return { h: 0, m: 0, s: 0 };
  }
  const parts = value.split(':');
  return {
    h: Math.max(0, Math.min(23, Number.parseInt(parts[0] || '0', 10) || 0)),
    m: Math.max(0, Math.min(59, Number.parseInt(parts[1] || '0', 10) || 0)),
    s: Math.max(0, Math.min(59, Number.parseInt(parts[2] || '0', 10) || 0)),
  };
}

export function toTimeString(h: number, m: number, s?: number): string {
  const base = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return s !== undefined ? `${base}:${String(s).padStart(2, '0')}` : base;
}

export function formatTimeDisplay(value: string, format: TimeFormat, showSeconds: boolean): string {
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
}

export function to24Hour(displayH: number, period: 'AM' | 'PM'): number {
  const wrapped = ((displayH - 1) % 12) + 1;
  if (period === 'AM') {
    return wrapped === 12 ? 0 : wrapped;
  }
  return wrapped === 12 ? 12 : wrapped + 12;
}

export function to12Hour(h24: number): { h: number; period: 'AM' | 'PM' } {
  return {
    h: h24 % 12 === 0 ? 12 : h24 % 12,
    period: h24 >= 12 ? 'PM' : 'AM',
  };
}

export function TimePanel({
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
}) {
  const { knobProps } = useResolvedKnobs({ compact: true });
  const { h, m, s } = parseTimeString(value);

  return (
    <View width="100%" {...knobProps.panelPadding} data-testid="time-picker-panel">
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
}

export function TimePickerClearButton({ onClear, disabled }: { onClear: () => void; disabled?: boolean }) {
  return (
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
}

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

export function TimePickerInputTrigger({
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
}: TimePickerInputTriggerProps) {
  return (
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
          <InputParts.Icon adornment="leading" color={formCommonColors.muted}>
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
            onKeyPress={
              disabled
                ? undefined
                : (e: { nativeEvent?: { key?: string }; key?: string; preventDefault?: () => void }) => {
                    const key = e?.nativeEvent?.key ?? e?.key;
                    if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
                      e?.preventDefault?.();
                      onOpen();
                    }
                  }
            }
          />
        </InputParts.Section>
        {value && isWeb ? (
          <InputParts.Section>
            <TimePickerClearButton onClear={onClear} disabled={disabled} />
          </InputParts.Section>
        ) : null}
      </InputParts.Box>
    </View>
  );
}
