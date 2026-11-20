import { CaretDownIcon, GlobeIcon } from '@phosphor-icons/react';
import { useTouchSurface, ensureCompositeFocusRing, useGlyphColor, sizeRecipeForToken } from '@repo/theme';
import type { KnobProps } from '@repo/theme';
import type { DeepKeys, DeepValue } from '@tanstack/form-core';
import type { ComponentProps, FocusEventHandler, ReactNode } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { TamaguiElement, Input, SizeTokens } from 'tamagui';
import { isWeb, useProps, Text, View, XStack } from 'tamagui';

import { Field, FieldLayout } from '../../FieldLayout';
import type { FieldLayoutProps, FormFieldProps } from '../../FieldLayout';
import { Input as InputParts } from '../../InputParts';
import { formButtonColors, formCommonColors } from '../../shared/color-ramps';
import { t } from '../../shared/t';
import { useIsInTableCell } from '../../shared/table-cell-context';
import { getFieldError, mergeFieldHandler, useFormField, useResolvedValidators } from '../../shared/utils';
import { Skeleton } from '../../Skeleton';
import type { SimpleFieldApi, Validator, FieldComponentProps } from '../../types';
import { Combobox } from '../Combobox';

import { dialCodes } from './dial-codes';
import {
  caretIndexForDigitCount,
  caretSizeForToken,
  countryCodeToFlag,
  dialOf,
  digitsOnly,
  examplePlaceholder,
  flagSizeForToken,
  formatNational,
  getCountryOptions,
  parsePhone,
  toE164,
} from './phone';

const PHONE_RING_STYLE_ID = 'mp-phone-input-ring';
const phoneInputCss = `/* LC-71: flag+dial are adornments of one control. Ring lives on the Box. */
.mp-phone-input [data-testid="combobox-trigger"] {
  outline: none !important;
  box-shadow: none !important;
}
.mp-phone-input [data-testid="combobox-trigger"]:focus,
.mp-phone-input [data-testid="combobox-trigger"]:focus-visible {
  outline: none !important;
}
.mp-phone-input input,
.mp-phone-input .mp-input-area,
.mp-phone-input .mp-input-area:focus,
.mp-phone-input .mp-input-area:focus-visible {
  outline: none !important;
  box-shadow: none !important;
}`;

const ensurePhoneInputCss = () => {
  if (typeof document === 'undefined') {
    return;
  }
  if (document.querySelector(`#${PHONE_RING_STYLE_ID}`)) {
    return;
  }
  const tag = document.createElement('style');
  tag.id = PHONE_RING_STYLE_ID;
  tag.textContent = phoneInputCss;
  document.head.append(tag);
};

export type PhoneInputProps<
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- default mirrors FormFieldProps/FieldComponentProps; untyped forms have no owner shape
  TParentData = Record<string, unknown>,
  TName extends DeepKeys<TParentData> = DeepKeys<TParentData>,
  TFieldValidator extends Validator<DeepValue<TParentData, TName>> = undefined,
  TFormValidator extends Validator<TParentData> = undefined,
  TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>,
> = Omit<
  FormFieldProps<TParentData, TName, TFieldValidator, TFormValidator, TData>,
  'children' | 'field' | 'onChange'
> &
  Partial<
    Omit<FieldComponentProps<TParentData, TName, TFieldValidator, TFormValidator, TData>, 'children' | 'validators'>
  > & {
    validators?: Parameters<typeof useResolvedValidators>[1];
    readOnly?: boolean;
    defaultCountry?: string;
    showFlags?: boolean;
    placeholder?: string;
    inputProps?: Omit<ComponentProps<typeof Input>, 'value' | 'onChangeText' | 'ref'>;
    value?: string;
    onChange?: (value: string) => void;
    skeleton?: boolean;
    compact?: boolean;
  };

interface PhoneInputFieldRendererProps<TData> {
  field: SimpleFieldApi<TData>;
  serialized: string;
  hydrate: (raw: string) => void;
  errorProp?: string | boolean;
  size?: SizeTokens;
  sizeToken: string;
  knobProps: KnobProps;
  onBlur?: FocusEventHandler<HTMLDivElement>;
  id?: string;
  label?: ReactNode;
  labelProps?: FieldLayoutProps['labelProps'];
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
  renderPhoneRow: (hasError?: boolean) => ReactNode;
}

// oxlint-disable-next-line anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters -- form field values and defaultValue are caller-typed (TData); only a string can seed the phone
const stringOrEmpty = (value: unknown): string => (typeof value === 'string' ? value : '');

const hasErrorValue = (error: string | boolean | undefined): boolean =>
  error !== undefined && error !== false && error !== '';

interface CaretHost {
  setSelectionRange: (start: number, end: number) => void;
}

const isCaretHost = (node: TamaguiElement | null): node is TamaguiElement & CaretHost =>
  node != null && 'setSelectionRange' in node && typeof node.setSelectionRange === 'function';

const resolveCaretHost = (node: TamaguiElement | null): CaretHost | null => {
  if (isCaretHost(node)) {
    return node;
  }
  if (typeof document !== 'undefined' && document.activeElement instanceof HTMLInputElement) {
    return document.activeElement;
  }
  return null;
};

const PhoneInputFieldRenderer = <TData,>({
  field,
  serialized,
  hydrate,
  errorProp,
  size,
  sizeToken,
  knobProps,
  onBlur,
  id,
  label,
  labelProps,
  helperText,
  required,
  disabled,
  renderPhoneRow,
}: PhoneInputFieldRendererProps<TData>) => {
  const lastSyncedRef = useRef<string>('');
  const didInitRef = useRef(false);

  useEffect(() => {
    const fieldValue = stringOrEmpty(field.state.value);
    if (fieldValue !== lastSyncedRef.current) {
      lastSyncedRef.current = fieldValue;
      // oxlint-disable-next-line react-doctor/no-pass-data-to-parent -- hydrate is this field's own state setter; the form value is the source of truth and must flow into the phone state
      hydrate(fieldValue);
    }
  }, [field.state.value, hydrate]);

  useEffect(() => {
    if (!didInitRef.current) {
      didInitRef.current = true;
      const fieldValue = stringOrEmpty(field.state.value);
      lastSyncedRef.current = fieldValue;
      if (fieldValue) {
        // oxlint-disable-next-line react-doctor/no-pass-data-to-parent -- initial seed of the phone state from the form value
        hydrate(fieldValue);
      }
      return;
    }
    if (serialized !== lastSyncedRef.current) {
      lastSyncedRef.current = serialized;
      // SAFETY: the phone field always stores its serialized E.164 string; TData is the caller's declared value type for that same field.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- generic TData cannot be proven to be string
      field.handleChange(serialized as TData);
    }
  }, [field, serialized, hydrate]);

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
      onBlur={mergeFieldHandler(field, 'handleBlur', onBlur)}
      disabled={disabled}>
      <InputParts size={sizeToken}>{renderPhoneRow(hasErrorValue(resolvedError))}</InputParts>
    </FieldLayout>
  );
};

interface CountryTriggerProps {
  code: string;
  disabled?: boolean;
  showFlags: boolean;
  flagSize: number;
  caretSize: number;
  glyphColor: ReturnType<typeof useGlyphColor>;
  knobProps: KnobProps;
  inTableCell: boolean;
}

const CountryTrigger = ({
  code,
  disabled,
  showFlags,
  flagSize,
  caretSize,
  glyphColor,
  knobProps,
  inTableCell,
}: CountryTriggerProps) => (
  <XStack
    data-testid="phone-country"
    alignItems="center"
    gap="$1.5"
    // size-recipe-escape: zero-reset — the country trigger rides inside Input.Box, which owns the inset
    paddingHorizontal={0}
    height="100%"
    cursor={disabled ? 'not-allowed' : 'pointer'}
    hoverStyle={disabled ? undefined : { backgroundColor: formButtonColors.background.hover }}>
    {showFlags ? (
      <Text
        fontSize={flagSize}
        lineHeight={flagSize + 4}
        userSelect="none">
        {countryCodeToFlag(code)}
      </Text>
    ) : (
      <InputParts.Icon color="$placeholderColor">
        <GlobeIcon />
      </InputParts.Icon>
    )}
    <Text
      data-testid="phone-dial"
      data-text-class="T-VALUE"
      fontFamily={knobProps.body.fontFamily}
      fontWeight={knobProps.body.fontWeight}
      // T-VALUE: dial is the country-code value, never textAccent / muted
      color="$color"
      userSelect="none">
      +{dialOf(code)}
    </Text>
    {inTableCell ? null : (
      <CaretDownIcon
        size={caretSize}
        color={glyphColor}
      />
    )}
  </XStack>
);

interface PhoneInputSkeletonProps {
  id: string;
  label?: ReactNode;
  labelProps?: FieldLayoutProps['labelProps'];
  size?: SizeTokens;
  sizeToken: string;
  flagSize: number;
  knobProps: KnobProps;
  disabled?: boolean;
}

const PhoneInputSkeleton = ({
  id,
  label,
  labelProps,
  size,
  sizeToken,
  flagSize,
  knobProps,
  disabled,
}: PhoneInputSkeletonProps) => {
  const hydrationTouch = useTouchSurface();
  const controlH = sizeRecipeForToken(sizeToken, { touch: hydrationTouch }).height;
  return (
    <FieldLayout
      id={id}
      label={label}
      labelProps={labelProps}
      size={size}
      knobProps={knobProps}
      disabled={disabled}>
      <InputParts size={sizeToken}>
        <InputParts.Box disabled>
          <InputParts.Section>
            <Skeleton
              variant="rounded"
              width={flagSize + 48}
              height={Math.max(16, controlH - 12)}
            />
          </InputParts.Section>
          <InputParts.Section>
            <Skeleton
              variant="rounded"
              width="100%"
              height={Math.max(16, controlH - 12)}
            />
          </InputParts.Section>
        </InputParts.Box>
      </InputParts>
    </FieldLayout>
  );
};

export const PhoneInput = <
  TParentData,
  TName extends DeepKeys<TParentData>,
  TFieldValidator extends Validator<DeepValue<TParentData, TName>> = undefined,
  TFormValidator extends Validator<TParentData> = undefined,
  TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>,
>(
  props: PhoneInputProps<TParentData, TName, TFieldValidator, TFormValidator, TData>,
) => {
  const {
    defaultValue,
    form,
    inputProps,
    defaultCountry = 'US',
    showFlags = true,
    placeholder: placeholderProp,
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
    onChange,
    value: valueProp,
    skeleton,
    compact,
    id: idProp,
  } = useProps(props);

  const { resolvedForm, knobProps, id } = useFormField({ form, id: idProp, compact });
  const resolvedValidators = useResolvedValidators(required, validators, label, name);
  const inTableCell = useIsInTableCell();
  const countryOptions = useMemo(() => getCountryOptions(), []);
  const sizeToken = String(size ?? '') || knobProps.sizeToken;
  const flagSize = flagSizeForToken(sizeToken);
  const caretSize = caretSizeForToken(sizeToken);
  const glyphColor = useGlyphColor();

  const seed = valueProp ?? stringOrEmpty(defaultValue);
  const initial = parsePhone(seed, defaultCountry);
  const [regionCode, setRegionCode] = useState(initial.region);
  const [national, setNational] = useState(initial.national);
  const serialized = toE164(regionCode, national);
  const display = formatNational(regionCode, national);
  const placeholder = placeholderProp ?? examplePlaceholder(regionCode);

  const areaRef = useRef<TamaguiElement | null>(null);
  const pendingCaretDigits = useRef<number | null>(null);
  const regionCodeRef = useRef(regionCode);
  useLayoutEffect(() => {
    regionCodeRef.current = regionCode;
  }, [regionCode]);

  const hydrate = useCallback(
    (raw: string) => {
      const parsed = parsePhone(raw, regionCodeRef.current || defaultCountry);
      setRegionCode(parsed.region);
      setNational(parsed.national);
    },
    [defaultCountry],
  );

  const isControlled = valueProp != null;
  useEffect(() => {
    if (!isControlled) {
      return;
    }
    const parsed = parsePhone(valueProp, regionCodeRef.current || defaultCountry);
    setRegionCode(parsed.region);
    setNational(parsed.national);
  }, [isControlled, valueProp, defaultCountry]);

  const onChangeRef = useRef(onChange);
  useLayoutEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  const isFormBound = resolvedForm != null && name != null && name !== '';
  const standaloneSyncedRef = useRef(serialized);
  useEffect(() => {
    if (isFormBound) {
      return;
    }
    if (serialized === standaloneSyncedRef.current) {
      return;
    }
    standaloneSyncedRef.current = serialized;
    onChangeRef.current?.(serialized);
  }, [serialized, isFormBound]);

  useLayoutEffect(() => {
    const caretDigits = pendingCaretDigits.current;
    if (caretDigits == null) {
      return;
    }
    const host = resolveCaretHost(areaRef.current);
    if (host != null) {
      const idx = caretIndexForDigitCount(display, caretDigits);
      host.setSelectionRange(idx, idx);
    }
    pendingCaretDigits.current = null;
  }, [display]);

  const handlePhoneChange = (text: string) => {
    if (disabled || readOnly) {
      return;
    }
    const el =
      typeof document !== 'undefined' && document.activeElement instanceof HTMLInputElement
        ? document.activeElement
        : null;
    const caret = el?.selectionStart ?? text.length;
    pendingCaretDigits.current = digitsOnly(text.slice(0, caret)).length;
    if (text.trim().startsWith('+')) {
      const parsed = parsePhone(text, regionCode);
      setRegionCode(parsed.region);
      setNational(parsed.national);
      return;
    }
    const next = digitsOnly(text).slice(0, Math.max(4, 15 - dialOf(regionCode).length));
    setNational(next);
  };

  const handleRegionChange = (next: string) => {
    if (next === '' || !dialCodes.has(next) || next === regionCode) {
      return;
    }
    setRegionCode(next);
  };

  if (isWeb) {
    ensureCompositeFocusRing();
    ensurePhoneInputCss();
  }

  const isInert = disabled === true || readOnly === true;

  const renderPhoneRow = (hasError = false) => (
    <InputParts.Box
      disabled={disabled}
      data-testid="phone-box"
      {...(isWeb
        ? {
            className: inTableCell ? 'mp-phone-input' : 'mp-phone-input mp-composite-ring-deep',
          }
        : undefined)}>
      <InputParts.Section>
        {/* Letter (fuzz RULE): closed country trigger paints 23px; segment radius is 0/9/9/0. Box keeps the 44 press floor. Do not retune those onto size/radius knobs. */}
        <View
          data-focus-skip
          flexDirection="row"
          alignItems="stretch"
          flexGrow={0}
          flexShrink={0}
          gap="$1.5"
          {...(readOnly ? { pointerEvents: 'none' as const } : undefined)}>
          <Combobox
            triggerSizing="content"
            options={countryOptions}
            value={regionCode}
            onChange={(val) => {
              handleRegionChange(Array.isArray(val) ? (val[0] ?? '') : val);
            }}
            searchPlaceholder={t('Search countries...')}
            emptyMessage={t('No countries found.')}
            popoverWidth={320}
            tabIndex={isInert ? -1 : 0}
            disabled={isInert}
            aria-label={t('Country code')}
            // oxlint-disable-next-line react/no-unstable-nested-components -- Combobox `trigger` is a render prop invoked with the selection, not a component type
            trigger={(selected) => (
              <CountryTrigger
                code={(Array.isArray(selected) ? selected[0] : selected)?.value ?? regionCode}
                disabled={disabled}
                showFlags={showFlags}
                flagSize={flagSize}
                caretSize={caretSize}
                glyphColor={glyphColor}
                knobProps={knobProps}
                inTableCell={inTableCell}
              />
            )}
          />
          {inTableCell ? null : (
            <View
              alignSelf="stretch"
              paddingVertical="$1.5">
              <View
                data-testid="phone-divider"
                width={1}
                flexGrow={1}
                backgroundColor={formCommonColors.divider}
              />
            </View>
          )}
        </View>
      </InputParts.Section>
      <InputParts.Section>
        <InputParts.Area
          ref={areaRef}
          id={id}
          keyboardType="phone-pad"
          autoComplete="tel"
          inputMode="tel"
          value={display}
          onChangeText={handlePhoneChange}
          placeholder={placeholder}
          disabled={disabled}
          {...(readOnly ? { readOnly: true } : {})}
          aria-required={required === true || undefined}
          aria-invalid={hasError || undefined}
          aria-readonly={readOnly === true || undefined}
          // SAFETY: InputParts.Area is the tamagui Input styled for this control, and inputProps is typed from that same Input minus value/onChangeText/ref.
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- only the Omit key list differs between the two prop types
          {...(inputProps as ComponentProps<typeof InputParts.Area>)}
          data-testid="phone-input"
          data-text-class="T-VALUE"
          color="$color"
        />
      </InputParts.Section>
    </InputParts.Box>
  );

  if (skeleton) {
    return (
      <PhoneInputSkeleton
        id={id}
        label={label}
        labelProps={labelProps}
        size={size}
        sizeToken={sizeToken}
        flagSize={flagSize}
        knobProps={knobProps}
        disabled={disabled}
      />
    );
  }

  if (!isFormBound) {
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
        <InputParts size={sizeToken}>{renderPhoneRow(hasErrorValue(errorProp))}</InputParts>
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
      {(field) => (
        <PhoneInputFieldRenderer
          field={field}
          serialized={serialized}
          hydrate={hydrate}
          errorProp={errorProp}
          size={size}
          sizeToken={sizeToken}
          knobProps={knobProps}
          onBlur={onBlur}
          id={id}
          label={label}
          labelProps={labelProps}
          helperText={helperText}
          required={required}
          disabled={disabled}
          renderPhoneRow={renderPhoneRow}
        />
      )}
    </Field>
  );
};
