/**
 * Frappe Read Only — formatted value display.
 * Design-law: FieldLayout slot order, label/body fragments (not sizeToken as
 * fontSize), form color ramps. Literal hex on Color is value data (Axiom 11).
 */
import { FieldLayout, Skeleton, formatDateText, formatNumericText, formCommonColors } from '@repo/forms';
import { formatCurrency, formatPercent, formatTimeOfDay, useResolvedKnobs } from '@repo/theme';
import { useMemo } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import type { YStackProps } from 'tamagui';

export type ReadOnlyType =
  | 'Data'
  | 'Int'
  | 'Float'
  | 'Currency'
  | 'Percent'
  | 'Date'
  | 'Datetime'
  | 'Time'
  | 'Check'
  | 'Select'
  | 'Link'
  | 'Color'
  | 'Text'
  | 'SmallText'
  | 'LongText';

type ReadOnlyValue = string | number | boolean | null;

type NumericReadOnlyType = 'Int' | 'Float' | 'Currency' | 'Percent';

export interface ReadOnlyProps extends Omit<YStackProps, 'children'> {
  label?: string;
  value?: ReadOnlyValue;
  type?: ReadOnlyType;
  currencySymbol?: string;
  precision?: number;
  dateFormat?: string;
  datetimeFormat?: string;
  timeFormat?: string;
  emptyText?: string;
  linkHref?: string;
  onLinkPress?: () => void;
  helperText?: string;
  readOnly?: boolean;
  skeleton?: boolean;
  compact?: boolean;
}

/**
 * Time cells speak the house time-of-day register (LC-12 render channel) —
 * one voice whether the value arrives as a clock string ("14:30:00") or a
 * datetime, instead of the wire string passing straight through in one
 * branch and an en-GB conversion in the other.
 */
const formatTime = (value: string, _format?: string): string => {
  if (!value) {
    return '';
  }
  return formatTimeOfDay(value);
};

const formatNumeric = (value: number, type: NumericReadOnlyType, precision: number, currencySymbol: string): string => {
  if (Number.isNaN(value)) {
    return '';
  }
  switch (type) {
    case 'Int': {
      return formatNumericText(Math.round(value), { precision: 0 });
    }
    case 'Float': {
      return formatNumericText(value, { precision });
    }
    case 'Currency': {
      // The money register resolves a symbol to its ISO code itself and
      // prefixes anything it doesn't know.
      return formatCurrency(value, { precision, symbol: currencySymbol });
    }
    case 'Percent': {
      return formatPercent(value, { precision });
    }
    default: {
      return value.toString();
    }
  }
};

interface FormatOptions {
  currencySymbol: string;
  precision: number;
  dateFormat?: string;
  datetimeFormat?: string;
  timeFormat?: string;
}

const NUMERIC_TYPES: ReadonlySet<ReadOnlyType> = new Set<NumericReadOnlyType>(['Int', 'Float', 'Currency', 'Percent']);

const isNumericType = (type: ReadOnlyType): type is NumericReadOnlyType => NUMERIC_TYPES.has(type);

const formatText = (text: string, type: ReadOnlyType, options: FormatOptions): string => {
  if (type === 'Date') {
    return text === '' ? '' : formatDateText(text, { dateFormat: options.dateFormat });
  }
  if (type === 'Datetime') {
    return text === '' ? '' : formatDateText(text, { withTime: true, dateFormat: options.datetimeFormat });
  }
  if (type === 'Time') {
    return formatTime(text, options.timeFormat);
  }
  if (type === 'Color') {
    return text.toUpperCase();
  }
  return text;
};

const formatValue = (value: ReadOnlyValue | undefined, type: ReadOnlyType, options: FormatOptions): string => {
  if (value === undefined || value === null) {
    return '';
  }
  if (type === 'Check') {
    const checked = Boolean(value);
    return checked ? 'Yes' : 'No';
  }
  if (isNumericType(type)) {
    return formatNumeric(
      // oxlint-disable-next-line anti-slop/no-runtime-typeof, unicorn/prefer-number-coercion -- picks the number arm of the declared value union; parseFloat keeps Frappe's lenient "12.5 kg" parse
      typeof value === 'number' ? value : Number.parseFloat(String(value)),
      type,
      options.precision,
      options.currencySymbol,
    );
  }
  return formatText(String(value), type, options);
};

export const ReadOnly = ({
  label,
  value,
  type = 'Data',
  currencySymbol = '$',
  precision = 2,
  dateFormat,
  datetimeFormat,
  timeFormat,
  emptyText = '-',
  linkHref,
  onLinkPress,
  helperText,
  readOnly: _readOnly,
  skeleton = false,
  compact = false,
  ...stackProps
}: ReadOnlyProps) => {
  const { knobProps } = useResolvedKnobs();
  const displayValue = useMemo(() => {
    const formatted = formatValue(value, type, {
      currencySymbol,
      precision,
      dateFormat,
      datetimeFormat,
      timeFormat,
    });
    return formatted || emptyText;
  }, [value, type, currencySymbol, precision, dateFormat, datetimeFormat, timeFormat, emptyText]);
  const isEmpty = value === undefined || value === null || value === '';

  if (skeleton) {
    return (
      <YStack {...stackProps}>
        <FieldLayout label={label}>
          <Skeleton
            variant="rounded"
            width="100%"
            height={compact ? 28 : 36}
          />
        </FieldLayout>
      </YStack>
    );
  }

  const valueColor = isEmpty ? formCommonColors.muted : formCommonColors.text;

  const renderColorSwatch = () => {
    if (type !== 'Color' || isEmpty) {
      return null;
    }
    const colorValue = String(value);
    if (!/^#(?:[0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/u.test(colorValue)) {
      return null;
    }
    return (
      <XStack
        width="$1"
        height="$1"
        {...knobProps.containerRadius}
        borderWidth={1}
        borderColor={formCommonColors.divider}
        backgroundColor={colorValue}
        marginInlineEnd="$2"
      />
    );
  };

  const renderValue = () => {
    if (type === 'Color' && !isEmpty) {
      return (
        <XStack alignItems="center">
          {renderColorSwatch()}
          <Text
            {...knobProps.body}
            color={valueColor}
            fontFamily="$mono">
            {displayValue}
          </Text>
        </XStack>
      );
    }
    const hasLinkTarget = (linkHref !== undefined && linkHref !== '') || onLinkPress !== undefined;
    if (type === 'Link' && hasLinkTarget && !isEmpty) {
      return (
        <Text
          {...knobProps.body}
          color="$accentColor"
          textDecorationLine="underline"
          cursor="pointer"
          onPress={onLinkPress}
          hoverStyle={{ opacity: 0.8 }}>
          {displayValue}
        </Text>
      );
    }
    if (type === 'Check') {
      const checked = Boolean(value);
      return (
        <XStack
          alignItems="center"
          gap="$2">
          <XStack
            width="$0.75"
            height="$0.75"
            // A read-only check box is R-SCALE like any other control: the
            // pinned `$1` outlived the knob at `borderRadius:none` (LC-60).
            // Radius-only fragment — the border/fill below are this part's own
            // (LC-55 FRAGMENT-LICENSE).
            {...knobProps.containerRadius}
            borderWidth={1}
            borderColor={checked ? '$green10' : formCommonColors.divider}
            backgroundColor={checked ? '$green5' : '$color3'}
            alignItems="center"
            justifyContent="center">
            {checked ? (
              <Text
                fontSize="$1"
                color="$green10">
                {'\u2713'}
              </Text>
            ) : null}
          </XStack>
          <Text
            {...knobProps.body}
            color={valueColor}>
            {displayValue}
          </Text>
        </XStack>
      );
    }
    if (type === 'LongText' || type === 'Text' || type === 'SmallText') {
      return (
        <Text
          {...knobProps.body}
          color={valueColor}
          whiteSpace="pre-wrap">
          {displayValue}
        </Text>
      );
    }
    return (
      <Text
        {...knobProps.body}
        color={valueColor}>
        {displayValue}
      </Text>
    );
  };

  return (
    <YStack {...stackProps}>
      <FieldLayout
        label={label}
        helperText={helperText}>
        <XStack
          {...knobProps.surface}
          {...knobProps.borderRadius}
          paddingVertical={compact ? '$1' : '$2'}
          paddingHorizontal={compact ? '$2' : '$3'}
          minHeight={compact ? '$2.5' : '$3.5'}
          alignItems="center">
          {renderValue()}
        </XStack>
      </FieldLayout>
    </YStack>
  );
};
