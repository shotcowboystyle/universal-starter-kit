import { MagnifyingGlassIcon } from '@phosphor-icons/react';
import { ensureFocusVisibleRing, useAaSolidFill, useReadableTextOn, useResolvedKnobs } from '@repo/theme';
import type { DeepKeys, DeepValue } from '@tanstack/form-core';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Pressable as RNPressable } from 'react-native';
import { Text, View, XStack, YStack, isWeb, useProps } from 'tamagui';

import { Field, FieldLayout } from '../../fieldLayout';
import type { FormFieldProps } from '../../fieldLayout';
import { FloatingPanel, useViewportGtSm } from '../../FloatingPanel';
import { Input as InputParts } from '../../InputParts';
import { formCommonColors, formSelectedColors } from '../../shared/colorRamps';
import { t } from '../../shared/t';
import { useIsInTableCell } from '../../shared/tableCellContext';
import { getFieldError, mergeFieldHandler, useFormField, useResolvedValidators } from '../../shared/utils';
import { Skeleton } from '../../Skeleton';
import type { FieldComponentProps, Validator } from '../../types';

import {
  DRAWN_ICON_NAMES,
  DrawnIcon,
  filterDrawnIcons,
  isDrawnIconName,
  parseIconOptions,
  resolveIconCatalog,
  type DrawnIconName,
} from './drawnSet';

export type { DrawnIconName } from './drawnSet';
export {
  DRAWN_ICON_NAMES,
  DrawnIcon,
  filterDrawnIcons,
  isDrawnIconName,
  parseIconOptions,
  resolveIconCatalog,
} from './drawnSet';

export type IconProps<
  TParentData = unknown,
  TName extends DeepKeys<TParentData> = DeepKeys<TParentData>,
  TFieldValidator extends Validator<DeepValue<TParentData, TName>> | undefined = undefined,
  TFormValidator extends Validator<TParentData> | undefined = undefined,
  TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>,
> = Omit<
  FormFieldProps<TParentData, TName, TFieldValidator, TFormValidator, TData>,
  'children' | 'field' | 'onChange'
> &
  Partial<Omit<FieldComponentProps<TParentData, TName, TFieldValidator, TFormValidator, TData>, 'children'>> & {
    readOnly?: boolean;
    placeholder?: string;
    value?: string;
    onChange?: (value: string) => void;
    /** @deprecated Use `onChange` instead. */
    onValueChange?: (value: string) => void;
    skeleton?: boolean;
    compact?: boolean;
    /** Restrict the picker to a subset of the drawn set (df.options). */
    icons?: readonly string[];
    options?: string;
  };

const adornmentRing = ensureFocusVisibleRing({ outlineOffset: -2 });
const NESTED_GLYPH_WELL = 32;

function EmptyGlyphWell() {
  return (
    <View
      testID="icon-empty-well"
      width={16}
      height={16}
      borderWidth={1}
      borderStyle="dashed"
      borderColor="$borderColor"
      borderRadius={3}
    />
  );
}

function IconControl({
  value,
  placeholder,
  disabled,
  readOnly,
  hasError,
  required,
  id,
  hasLabel,
  a11yLabel,
  helperText,
  catalog,
  onValueChange,
  onBlurControl,
}: {
  value: string;
  placeholder: string;
  disabled?: boolean;
  readOnly?: boolean;
  hasError: boolean;
  required?: boolean;
  id?: string;
  hasLabel?: boolean;
  a11yLabel?: string;
  helperText?: string;
  catalog: readonly DrawnIconName[];
  onValueChange: (value: string) => void;
  onBlurControl?: () => void;
}) {
  const inTableCell = useIsInTableCell();
  const { knobProps } = useResolvedKnobs();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const suppressFocusOpenUntilRef = useRef(0);
  const triggerInputRef = useRef<ComponentRef<typeof InputParts.Area>>(null);
  const viewportGtSm = useViewportGtSm();
  const shouldUseSheet = !isWeb || !(typeof window !== 'undefined' && viewportGtSm);
  const drawn = isDrawnIconName(value) ? value : undefined;
  const matches = useMemo(() => filterDrawnIcons(catalog, query), [catalog, query]);
  // Ink that reads on the accent fill the selected cell carries.
  const markFill = useAaSolidFill(formSelectedColors.mark);
  const onMark = useReadableTextOn(markFill);

  const closePanel = useCallback(() => {
    // Focus restoration retries after 320ms in focusManagement.ts. Let that
    // focus return without reopening; explicit pointer/key actions still open.
    suppressFocusOpenUntilRef.current = performance.now() + 450;
    setOpen(false);
    setQuery('');
    onBlurControl?.();
  }, [onBlurControl]);

  const handlePick = useCallback(
    (name: DrawnIconName) => {
      onValueChange(name);
      closePanel();
      // Pointer capture can open before the trigger gets focus, leaving the
      // shared restore target on body. A completed pick returns to its input.
      // Other dismissals keep the user's chosen destination; native stays inert.
      if (isWeb) {
        triggerInputRef.current?.focus();
      }
    },
    [closePanel, onValueChange],
  );

  const handleClear = useCallback(() => {
    onValueChange('');
    setQuery('');
  }, [onValueChange]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (disabled || readOnly) {
        return;
      }
      if (next) {
        setOpen(true);
        return;
      }
      closePanel();
    },
    [closePanel, disabled, readOnly],
  );

  if (readOnly) {
    return (
      <View
        testID="icon-field-readonly"
        width={NESTED_GLYPH_WELL}
        height={NESTED_GLYPH_WELL}
        alignItems="center"
        justifyContent="center">
        {/* Outside InputParts.Icon, which is what injects a colour. */}
        {drawn ? <DrawnIcon name={drawn} size={16} color={formCommonColors.text} /> : <EmptyGlyphWell />}
      </View>
    );
  }

  const displayValue = open ? query : drawn ? drawn : value;
  const showClear = Boolean(value) && !disabled;

  const trigger = (
    <View>
      <InputParts
        cursor="pointer"
        onPress={
          isWeb && !disabled
            ? () => {
                setOpen(true);
              }
            : undefined
        }
        size={knobProps.sizeToken}>
        <InputParts.Box
          testID="icon-field"
          theme={hasError ? 'error' : undefined}
          disabled={disabled}
          {...(disabled ? { opacity: 0.5, pointerEvents: 'none' } : undefined)}>
          <InputParts.Icon adornment="leading">
            {drawn ? <DrawnIcon name={drawn} size={16} /> : <EmptyGlyphWell />}
          </InputParts.Icon>
          {!inTableCell && (
            <InputParts.Area
              ref={triggerInputRef}
              id={id}
              value={displayValue}
              placeholder={placeholder}
              fontFamily="$mono"
              readOnly={!open}
              disabled={disabled}
              aria-expanded={open}
              aria-haspopup="listbox"
              aria-controls={open ? `${id ?? 'icon'}-listbox` : undefined}
              aria-label={hasLabel ? undefined : t('Icon')}
              aria-required={required || undefined}
              aria-invalid={hasError || undefined}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              onChangeText={open ? setQuery : undefined}
              onFocus={() => {
                if (!disabled && performance.now() > suppressFocusOpenUntilRef.current) {
                  setOpen(true);
                }
              }}
              onKeyDown={(e) => {
                if (open || disabled) {
                  return;
                }
                if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key) || e.code === 'Space') {
                  e.preventDefault();
                  setOpen(true);
                }
              }}
            />
          )}
          {showClear && isWeb ? (
            <InputParts.Button
              data-floating-panel-action="true"
              tabIndex={0}
              aria-label={t('Clear icon')}
              disabled={disabled}
              focusVisibleStyle={adornmentRing}
              onPress={(e) => {
                e.stopPropagation();
                handleClear();
              }}>
              <InputParts.Icon>
                <DrawnIcon name="x" size={16} />
              </InputParts.Icon>
            </InputParts.Button>
          ) : (
            <InputParts.Icon adornment="trailing">
              <DrawnIcon name="chev-d" size={16} />
            </InputParts.Icon>
          )}
        </InputParts.Box>
      </InputParts>
    </View>
  );

  const sheetSearchHeader = shouldUseSheet ? (
    <InputParts size={knobProps.sizeToken}>
      <InputParts.Box>
        <InputParts.Icon adornment="leading">
          <MagnifyingGlassIcon size={16} />
        </InputParts.Icon>
        <InputParts.Area
          testID="icon-sheet-search"
          value={query}
          placeholder={t('Search icons')}
          accessibilityLabel={t('Search icons')}
          aria-label={t('Search icons')}
          fontFamily="$mono"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          onChangeText={setQuery}
        />
      </InputParts.Box>
    </InputParts>
  ) : undefined;
  const nativeClear =
    !isWeb && showClear ? (
      <InputParts.Button
        testID="icon-clear-native"
        aria-label={t('Clear icon')}
        accessibilityLabel={t('Clear icon')}
        disabled={disabled}
        onPress={(e) => {
          e.stopPropagation();
          handleClear();
        }}>
        <InputParts.Icon>
          <DrawnIcon name="x" size={16} />
        </InputParts.Icon>
      </InputParts.Button>
    ) : undefined;

  return (
    <FloatingPanel
      open={open}
      onOpenChange={handleOpenChange}
      trigger={trigger}
      triggerEnd={nativeClear}
      header={sheetSearchHeader}
      disabled={disabled}
      scrollable
      sizing="fill"
      widthMode="match-trigger"
      triggerA11y={{
        label: a11yLabel || t('Icon'),
        value: value || placeholder,
        hint: helperText,
      }}>
      <YStack
        testID="icon-panel"
        id={`${id ?? 'icon'}-listbox`}
        {...({ role: 'listbox' } as Record<string, unknown>)}
        aria-label={t('Icons')}>
        {matches.length === 0 ? (
          <Text testID="icon-no-results" color={formCommonColors.muted} fontSize="$3" textAlign="center" padding="$4">
            {t('No icon matches "{{query}}"', { query })}
          </Text>
        ) : (
          <XStack flexWrap="wrap">
            {matches.map((name) => {
              const selected = name === value;
              const cellInk = (selected && onMark) || formCommonColors.text;
              const cell = (
                <View
                  key={name}
                  {...(isWeb
                    ? ({ role: 'option', 'aria-selected': selected } as Record<string, unknown>)
                    : { pointerEvents: 'none' as const })}
                  testID={`icon-option-${name}`}
                  width={64}
                  padding="$1"
                  cursor="pointer"
                  onPress={
                    isWeb
                      ? () => {
                          handlePick(name);
                        }
                      : undefined
                  }>
                  <YStack
                    height={60}
                    alignItems="center"
                    justifyContent="center"
                    gap="$1"
                    borderRadius="$3"
                    // The selected mark is the active
                    // accent, never a neutral ramp step.
                    backgroundColor={selected ? markFill : 'transparent'}
                    hoverStyle={selected ? undefined : { backgroundColor: '$color3' }}>
                    {/* Outside InputParts.Icon, so the colour is passed here. */}
                    <DrawnIcon name={name} size={16} color={cellInk} />
                    <Text
                      fontFamily="$mono"
                      fontSize={11}
                      // $color10 measures 3.95-4.36:1, under the 4.5:1 AA floor
                      // colorRamps.ts records; step 11 is the lowest that passes.
                      color={cellInk}
                      numberOfLines={1}>
                      {name}
                    </Text>
                  </YStack>
                </View>
              );
              if (isWeb) {
                return cell;
              }
              return (
                <RNPressable
                  key={name}
                  onPress={() => {
                    handlePick(name);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={name}
                  accessibilityState={{ selected }}>
                  {cell}
                </RNPressable>
              );
            })}
          </XStack>
        )}
      </YStack>
    </FloatingPanel>
  );
}

export function Icon<
  TParentData,
  TName extends DeepKeys<TParentData>,
  TFieldValidator extends Validator<DeepValue<TParentData, TName>> | undefined = undefined,
  TFormValidator extends Validator<TParentData> | undefined = undefined,
  TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>,
>(props: IconProps<TParentData, TName, TFieldValidator, TFormValidator, TData>) {
  const {
    defaultValue,
    form,
    placeholder = t('Choose an icon'),
    mode,
    name,
    preserveValue,
    validators,
    disabled,
    readOnly,
    label,
    labelProps,
    error: errorProp,
    helperText,
    required,
    size,
    onBlur,
    value: controlledValue,
    onChange,
    onValueChange,
    skeleton,
    compact,
    id: idProp,
    icons,
    options,
  } = useProps(props);

  const catalog = useMemo(() => resolveIconCatalog(icons ?? parseIconOptions(options)), [icons, options]);

  const emitValueChange = useCallback(
    (newValue: string) => {
      onChange?.(newValue);
      onValueChange?.(newValue);
    },
    [onChange, onValueChange],
  );

  const { resolvedForm, knobProps, id } = useFormField({ form, id: idProp, compact });
  const resolvedValidators = useResolvedValidators(required, validators, label, name);
  const [standaloneValue, setStandaloneValue] = useState<string>(
    () => (controlledValue ?? (defaultValue as string)) || '',
  );

  useEffect(() => {
    if (controlledValue !== undefined) {
      setStandaloneValue(controlledValue);
    }
  }, [controlledValue]);

  const handleStandaloneChange = useCallback(
    (newValue: string) => {
      setStandaloneValue(newValue);
      emitValueChange(newValue);
    },
    [emitValueChange],
  );

  if (skeleton) {
    return (
      <InputParts size={size || knobProps.sizeToken}>
        {label ? <Skeleton variant="text" width={96} height={14} /> : null}
        <Skeleton
          variant="rounded"
          width={320}
          height={knobProps.control.height}
          borderRadius={knobProps.borderRadius.borderRadius}
        />
      </InputParts>
    );
  }

  const control = (fieldValue: string, onValue: (next: string) => void, error?: string | boolean) => (
    <IconControl
      value={fieldValue}
      placeholder={placeholder}
      disabled={disabled}
      readOnly={readOnly}
      hasError={!!error}
      required={required}
      id={id}
      hasLabel={Boolean(label)}
      a11yLabel={typeof label === 'string' ? label : undefined}
      helperText={helperText}
      catalog={catalog}
      onValueChange={onValue}
      onBlurControl={() => onBlur?.(undefined as never)}
    />
  );

  if (!resolvedForm || !name) {
    const effectiveValue = controlledValue ?? standaloneValue;
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
        disabled={disabled}>
        {control(effectiveValue, handleStandaloneChange, errorProp)}
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
        const fieldValue = (field.state.value as string) || '';
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
            {control(
              fieldValue,
              (newValue) => {
                field.handleChange(newValue as TData);
                emitValueChange(newValue);
              },
              resolvedError,
            )}
          </FieldLayout>
        );
      }}
    </Field>
  );
}
