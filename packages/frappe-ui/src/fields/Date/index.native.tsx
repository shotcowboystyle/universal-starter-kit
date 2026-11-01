import DateTimePicker from '@react-native-community/datetimepicker';
import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import {
  Button,
  Field,
  FieldLayout,
  Skeleton,
  formCommonColors,
  getFieldError,
  mergeFieldHandler,
  useFormField,
  useResolvedValidators,
} from '@repo/forms';
import { platform } from '@repo/platform';
import { formatAbsoluteDate, formatAbsoluteDateTime, formatTimeOfDay } from '@repo/theme';
import { useContext, useState } from 'react';
import { Modal, Pressable, StyleSheet, useColorScheme, useWindowDimensions, View as RNView } from 'react-native';
import { SafeAreaInsetsContext, initialWindowMetrics } from 'react-native-safe-area-context';
import { Text, View, XStack, YStack, useProps, useTheme, useThemeName } from 'tamagui';

import { useKeyboardInset } from '../../shared/use-keyboard-inset';

import { datePickerHeight, dateSheetBottomPadding, dateSheetMaxHeight } from './sheet-keyboard';
import type { DateProps } from './types';
import { fromFrappeDateValue, toFrappeDateValue } from './wire';

/**
 * Design-law: trigger and sheet actions are house Button. The OS picker stays
 * `Modal animationType="fade"` so the scrim plants in place (MPO-62); the
 * sheet caps above the keyboard via inset padding (MPO-64).
 */

export type { DateProps } from './types';

type FieldType = 'date' | 'datetime' | 'time';

/**
 * Display value for the trigger — the house registers (LC-12 render channel),
 * so the native picker reads the same voice as the web picker, table date
 * cells and the timeline. A picker is an editing surface, so the year is
 * always shown.
 */
const isErrorShown = (error: string | boolean | undefined): boolean =>
  error !== undefined && error !== false && error !== '';

const defaultPlaceholder = (type: FieldType): string => {
  if (type === 'time') {
    return 'Select time';
  }
  return type === 'datetime' ? 'Select date & time' : 'Select date';
};

const formatDisplayValue = (value: string, type: FieldType): string => {
  if (!value) {
    return '';
  }
  try {
    const date = fromFrappeDateValue(value, type);
    if (type === 'time') {
      return formatTimeOfDay(date);
    }
    if (type === 'datetime') {
      return formatAbsoluteDateTime(date, { year: 'always' });
    }
    return formatAbsoluteDate(date, { year: 'always' });
  } catch {
    return value;
  }
};

/**
 * The form branch stores what the picker committed (a `Date`, matching the
 * web half); the standalone branch is handed the Frappe wire string. Both
 * arrive here so the rest of the component reads one shape.
 */
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- form state holds the committed Date, the standalone prop a wire string; this normalizes both
const toWireValue = (raw: unknown, type: FieldType): string => {
  if (raw == null || raw === '') {
    return '';
  }
  if (raw instanceof Date) {
    return Number.isNaN(raw.getTime()) ? '' : toFrappeDateValue(raw, type);
  }
  // oxlint-disable-next-line typescript/no-base-to-string -- what remains is a wire string (or a number from loose form state); String() passes it through
  return String(raw);
};

/** What the picker opens on: the current value, else now. */
const seedDate = (wire: string, type: FieldType): Date => {
  if (!wire) {
    return new Date();
  }
  try {
    const parsed = fromFrappeDateValue(wire, type);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  } catch {
    return new Date();
  }
};

/**
 * The OS picker renders itself, so the only styling channel it exposes is
 * light/dark plus an accent — see the R-IDENTITY declaration for this part.
 * Read the app theme first and fall back to the OS scheme, the same order
 * the native rich-text editor uses.
 */
const useNativePickerScheme = (): 'light' | 'dark' => {
  const themeName = useThemeName();
  const osScheme = useColorScheme();
  if (themeName) {
    return themeName.startsWith('dark') ? 'dark' : 'light';
  }
  return osScheme === 'dark' ? 'dark' : 'light';
};

/**
 * Native `Date` field for iOS and Android.
 *
 * Resolution picks this file over `index.tsx` on native, so the field is the
 * real OS picker: the iOS 14+ calendar for dates (`inline`), the wheel for
 * times, and the Material dialog on Android. Declared as `Date` rather than
 * written as `function Date` so the global `Date` constructor stays reachable
 * inside this module.
 */
// oxlint-disable-next-line react-doctor/no-giant-component -- one OS-picker state machine shared by the Android dialog and the iOS sheet; splitting it is a separate refactor
const DateField = <
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- form data shape is caller-defined; mirrors FormFieldProps' default
  TData extends Record<string, unknown> = Record<string, unknown>,
  TName extends string = string,
>(
  props: DateProps<TData, TName>,
) => {
  // SAFETY: useProps only expands Tamagui shorthands/media props; the keys remain DateProps'
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- useProps widens the bag; extra keys are ignored
  const resolvedProps = useProps(props) as DateProps<TData, TName> & Record<string, unknown>;
  const {
    compact,
    defaultValue,
    disabled,
    error: errorProp,
    form,
    helperText,
    id: idProp,
    // oxlint-disable-next-line sonarjs/no-unused-vars -- destructured out: the OS picker has no host input to receive them
    inputProps: _inputProps,
    label,
    labelProps,
    maxDate,
    minDate,
    mode,
    name,
    onBlur,
    onChange,
    placeholder,
    preserveValue,
    readOnly,
    required,
    size,
    skeleton,
    type = 'date',
    validators,
    value,
  } = resolvedProps;

  const { resolvedForm, knobProps, id } = useFormField({ form, id: idProp, compact });
  const resolvedValidators = useResolvedValidators(required, validators, label, name);
  const themeVariant = useNativePickerScheme();
  const theme = useTheme();
  // oxlint-disable-next-line typescript/no-unsafe-assignment -- Tamagui types a theme value's `val` as any; the accent token resolves to a color string
  const accentColor: string | undefined = theme.accentBackground?.val;
  // MPO-64 leftover: the sheet must end ABOVE the keyboard, not run under it.
  const keyboardInset = useKeyboardInset();
  const { height: windowHeight } = useWindowDimensions();
  const topInset = useContext(SafeAreaInsetsContext)?.top ?? initialWindowMetrics?.insets.top ?? 0;
  const maxHeight = dateSheetMaxHeight(windowHeight, keyboardInset, topInset);

  const [showPicker, setShowPicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [tempDate, setTempDate] = useState<Date | null>(null);

  const fieldType: FieldType = type;
  const isIOS = platform.isIos;
  const sheetBottomPadding = dateSheetBottomPadding(keyboardInset, isIOS);
  const pickerMode: 'date' | 'time' =
    fieldType === 'time' || (fieldType === 'datetime' && showTimePicker) ? 'time' : 'date';
  // iOS 14 made the calendar the date presentation and left the wheel to time;
  // `spinner` for a date is Apple's legacy style. `inline` rather than
  // `compact` because the picker already lives in a sheet with its own
  // Cancel/Done — `compact` would be a field that opens a second popover.
  const iosDisplay = pickerMode === 'time' ? 'spinner' : 'inline';

  const closePicker = () => {
    setShowPicker(false);
    setShowTimePicker(false);
    setTempDate(null);
  };

  // oxlint-disable-next-line eslint/complexity -- JSX visibility switches for the Android dialog and the iOS sheet; the handlers are already split out
  const renderControl = (
    wire: string,
    hasError: boolean,
    // oxlint-disable-next-line anti-slop/no-unknown-parameters -- TanStack's handleChange is typed by the form's value type, which this field does not own
    commit?: (value: unknown) => void,
    blur?: () => void,
  ) => {
    const seed = seedDate(wire, fieldType);
    const displayValue = formatDisplayValue(wire, fieldType);
    const resolvedPlaceholder = placeholder ?? defaultPlaceholder(fieldType);

    const emit = (picked: Date) => {
      // No `previousValue`: the native picker chooses date and time itself,
      // so there is no earlier time part to preserve (the web half's case).
      commit?.(picked);
      onChange?.(toFrappeDateValue(picked, fieldType));
    };

    const openPicker = () => {
      if (disabled || readOnly) {
        return;
      }
      setTempDate(seed);
      setShowPicker(true);
      setShowTimePicker(false);
    };

    const cancel = () => {
      closePicker();
      blur?.();
    };

    /** Android commits on the dialog's own OK; datetime runs date then time. */
    const handleAndroidChange = (event: DateTimePickerEvent, selected?: Date) => {
      if (event.type === 'dismissed') {
        cancel();
        return;
      }
      if (event.type !== 'set' || !selected) {
        return;
      }
      if (fieldType === 'datetime' && !showTimePicker) {
        setTempDate(selected);
        setShowPicker(false);
        setShowTimePicker(true);
        setTimeout(() => {
          setShowPicker(true);
        }, 100);
        return;
      }
      const picked =
        fieldType === 'datetime' && tempDate
          ? new Date(
              tempDate.getFullYear(),
              tempDate.getMonth(),
              tempDate.getDate(),
              selected.getHours(),
              selected.getMinutes(),
            )
          : selected;
      emit(picked);
      closePicker();
      blur?.();
    };

    /** iOS stages into `tempDate`; the sheet's Done commits. */
    const handleIOSChange = (_event: DateTimePickerEvent, selected?: Date) => {
      if (!selected) {
        return;
      }
      if (fieldType === 'datetime' && showTimePicker && tempDate) {
        setTempDate(
          new Date(
            tempDate.getFullYear(),
            tempDate.getMonth(),
            tempDate.getDate(),
            selected.getHours(),
            selected.getMinutes(),
          ),
        );
        return;
      }
      setTempDate(selected);
    };

    const confirm = () => {
      emit(tempDate ?? seed);
      closePicker();
      blur?.();
    };

    return (
      <YStack {...knobProps.gap}>
        <Button
          onPress={openPicker}
          disabled={disabled ?? readOnly}
          justifyContent="flex-start"
          size={size ?? knobProps.sizeToken}
          {...knobProps.borderRadius}
          borderColor={hasError ? '$red8' : '$borderColor'}
          backgroundColor={disabled ? '$color4' : '$background'}
          // oxlint-disable-next-line anti-slop/no-runtime-typeof -- label is a ReactNode; only a string can be the accessible name
          aria-label={typeof label === 'string' ? label : undefined}
          aria-invalid={hasError || undefined}
          aria-required={required ?? undefined}>
          <Text color={displayValue ? formCommonColors.text : formCommonColors.muted}>
            {displayValue || resolvedPlaceholder}
          </Text>
        </Button>

        {/* Android: the Material dialog is its own window. */}
        {showPicker && !isIOS && (
          <DateTimePicker
            value={tempDate ?? seed}
            mode={pickerMode}
            display="default"
            onChange={handleAndroidChange}
            minimumDate={fieldType === 'time' ? undefined : minDate}
            maximumDate={fieldType === 'time' ? undefined : maxDate}
          />
        )}

        {/* iOS: the picker has no chrome of its own, so it rides a sheet. */}
        {showPicker && isIOS && (
          <Modal
            transparent
            animationType="fade"
            visible={showPicker}
            onRequestClose={cancel}>
            {/*
              A plain padded column, not KeyboardAvoidingView: inside a Modal
              the latter pads the container while the sheet keeps its own
              fixed height, so the sheet overflows off the TOP instead of
              shrinking (MPO-64). Fade keeps the scrim planted (MPO-62);
              only the panel sits at the bottom, capped above the keyboard.
            */}
            <RNView style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: keyboardInset }}>
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={cancel}>
                <View
                  pointerEvents="none"
                  flex={1}
                  backgroundColor="$shadow6"
                />
              </Pressable>
              <Pressable
                onPress={(e) => {
                  e.stopPropagation();
                }}>
                <YStack
                  {...knobProps.elevatedSurface}
                  // Bottom sheet: the two off-screen corners eject from the
                  // surface fragment's radius, the visible pair keeps it.
                  borderBottomLeftRadius={0}
                  borderBottomRightRadius={0}
                  maxHeight={maxHeight}
                  flexShrink={1}
                  minHeight={0}
                  paddingBottom={sheetBottomPadding}>
                  <XStack
                    justifyContent="space-between"
                    {...knobProps.panelPadding}>
                    <Button
                      size="$3"
                      chromeless
                      onPress={cancel}>
                      <Text color={formCommonColors.text}>Cancel</Text>
                    </Button>

                    {fieldType === 'datetime' && !showTimePicker && (
                      <Button
                        size="$3"
                        chromeless
                        onPress={() => {
                          setShowTimePicker(true);
                        }}>
                        <Text color="$accentBackground">Next</Text>
                      </Button>
                    )}

                    {(fieldType !== 'datetime' || showTimePicker) && (
                      <Button
                        size="$3"
                        chromeless
                        onPress={confirm}>
                        <Text color="$accentBackground">Done</Text>
                      </Button>
                    )}
                  </XStack>

                  <YStack
                    {...knobProps.panelPadding}
                    flexShrink={1}
                    minHeight={0}>
                    <DateTimePicker
                      value={tempDate ?? seed}
                      mode={pickerMode}
                      display={iosDisplay}
                      themeVariant={themeVariant}
                      accentColor={accentColor}
                      onChange={handleIOSChange}
                      minimumDate={fieldType === 'time' ? undefined : minDate}
                      maximumDate={fieldType === 'time' ? undefined : maxDate}
                      style={{
                        width: '100%',
                        height: datePickerHeight(pickerMode, maxHeight),
                      }}
                    />
                  </YStack>
                </YStack>
              </Pressable>
            </RNView>
          </Modal>
        )}
      </YStack>
    );
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
          height={knobProps.sizeToken}
        />
      </FieldLayout>
    );
  }

  if (!resolvedForm || name === undefined || name === '') {
    return (
      <FieldLayout
        id={id}
        label={label}
        labelProps={labelProps}
        error={errorProp}
        helperText={helperText}
        required={required}
        size={size}
        knobProps={knobProps}
        onBlur={onBlur}
        // LC-40: FieldLayout owns the dimWhole assembly dim (keepLabel pins
        // the sibling label/helper readable) — it needs the disabled state.
        disabled={disabled}>
        {renderControl(toWireValue(value, fieldType), isErrorShown(errorProp), undefined, onBlur)}
      </FieldLayout>
    );
  }

  return (
    <Field
      defaultValue={defaultValue}
      form={resolvedForm}
      mode={mode}
      name={name}
      preserveValue={preserveValue}
      validators={resolvedValidators}>
      {(field) => {
        const resolvedError = getFieldError(field, errorProp);
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
            disabled={disabled}>
            {renderControl(
              toWireValue(value ?? field.state.value, fieldType),
              isErrorShown(resolvedError),
              mergeFieldHandler(field, 'handleChange'),
              mergeFieldHandler(field, 'handleBlur', onBlur),
            )}
          </FieldLayout>
        );
      }}
    </Field>
  );
};

export { DateField as Date };
