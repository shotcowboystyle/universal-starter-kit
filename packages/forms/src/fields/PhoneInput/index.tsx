import { CaretDownIcon, GlobeIcon } from '@phosphor-icons/react';
import { useTouchSurface } from '@repo/theme';
import { ensureCompositeFocusRing, useGlyphColor } from '@repo/theme';
import type { DeepKeys, DeepValue } from '@tanstack/form-core';
import type { ComponentProps, FocusEventHandler, ReactNode } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { TamaguiElement } from 'tamagui';
import { isWeb, useProps } from 'tamagui';
import { Input, Text, View, XStack } from 'tamagui';

import { Field, FieldLayout } from '../../fieldLayout';
import type { FormFieldProps } from '../../fieldLayout';
import { Input as InputParts } from '../../InputParts';
import { formButtonColors, formCommonColors } from '../../shared/colorRamps';
import { t } from '../../shared/t';
import { useIsInTableCell } from '../../shared/tableCellContext';
import {
  getFieldError,
  getFieldHeight,
  mergeFieldHandler,
  useFormField,
  useResolvedValidators,
} from '../../shared/utils';
import { Skeleton } from '../../Skeleton';
import type { SimpleFieldApi, Validator } from '../../types';
import type { FieldComponentProps } from '../../types';
import { Combobox } from '../Combobox';

import { dialCodes } from './dialCodes';
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

function ensurePhoneInputCss() {
  if (typeof document === 'undefined') {
    return;
  }
  if (document.getElementById(PHONE_RING_STYLE_ID)) {
    return;
  }
  const tag = document.createElement('style');
  tag.id = PHONE_RING_STYLE_ID;
  tag.textContent = phoneInputCss;
  document.head.appendChild(tag);
}

export type PhoneInputProps<
  TParentData = Record<string, unknown>,
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
  field: {
    state: { value: unknown; meta: { errors: readonly (string | undefined)[] } };
    handleChange: (value: TData) => void;
    handleBlur: () => void;
  };
  serialized: string;
  hydrate: (raw: string) => void;
  errorProp?: string | boolean;
  size?: string;
  knobProps: { sizeToken: string };
  onBlur?: FocusEventHandler<HTMLDivElement>;
  id?: string;
  label?: ReactNode;
  labelProps?: any;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
  renderPhoneRow: (hasError?: boolean) => ReactNode;
}

function PhoneInputFieldRenderer<TData>({
  field,
  serialized,
  hydrate,
  errorProp,
  size,
  knobProps,
  onBlur,
  id,
  label,
  labelProps,
  helperText,
  required,
  disabled,
  renderPhoneRow,
}: PhoneInputFieldRendererProps<TData>) {
  const lastSyncedRef = useRef<string>('');
  const didInitRef = useRef(false);

  useEffect(() => {
    const fieldValue = (field.state.value as string) ?? '';
    if (fieldValue !== lastSyncedRef.current) {
      lastSyncedRef.current = fieldValue;
      hydrate(fieldValue);
    }
  }, [field.state.value, hydrate]);

  useEffect(() => {
    if (!didInitRef.current) {
      didInitRef.current = true;
      const fieldValue = (field.state.value as string) ?? '';
      lastSyncedRef.current = fieldValue;
      if (fieldValue) {
        hydrate(fieldValue);
      }
      return;
    }
    if (serialized !== lastSyncedRef.current) {
      lastSyncedRef.current = serialized;
      field.handleChange(serialized as TData);
    }
  }, [field, serialized, hydrate]);

  const resolvedError = getFieldError(field as SimpleFieldApi<any>, errorProp);

  return (
    <FieldLayout
      id={id}
      label={label}
      labelProps={labelProps}
      error={resolvedError}
      helperText={helperText}
      required={required}
      size={size as any}
      knobProps={knobProps as any}
      onBlur={mergeFieldHandler(field as SimpleFieldApi<any>, 'handleBlur', onBlur)}
      disabled={disabled}>
      <InputParts size={size || knobProps.sizeToken}>{renderPhoneRow(!!resolvedError)}</InputParts>
    </FieldLayout>
  );
}

export function PhoneInput<
  TParentData,
  TName extends DeepKeys<TParentData>,
  TFieldValidator extends Validator<DeepValue<TParentData, TName>> | undefined = undefined,
  TFormValidator extends Validator<TParentData> | undefined = undefined,
  TData extends DeepValue<TParentData, TName> = DeepValue<TParentData, TName>,
>(props: PhoneInputProps<TParentData, TName, TFieldValidator, TFormValidator, TData>) {
  const hydrationTouch = useTouchSurface();
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
    ..._restProps
  } = useProps(props);

  const { resolvedForm, knobProps, id } = useFormField({ form, id: idProp, compact });
  const resolvedValidators = useResolvedValidators(required, validators, label, name);
  const inTableCell = useIsInTableCell();
  const countryOptions = useMemo(() => getCountryOptions(), []);
  const sizeToken = (size || knobProps.sizeToken) as string;
  const flagSize = flagSizeForToken(sizeToken);
  const caretSize = caretSizeForToken(sizeToken);
  const glyphColor = useGlyphColor();

  const seed = typeof valueProp === 'string' ? valueProp : typeof defaultValue === 'string' ? defaultValue : '';
  const initial = parsePhone(seed, defaultCountry);
  const [regionCode, setRegionCode] = useState(initial.region);
  const [national, setNational] = useState(initial.national);
  const serialized = toE164(regionCode, national);
  const display = formatNational(regionCode, national);
  const placeholder = placeholderProp ?? examplePlaceholder(regionCode);

  const areaRef = useRef<TamaguiElement | null>(null);
  const pendingCaretDigits = useRef<number | null>(null);
  const regionCodeRef = useRef(regionCode);
  regionCodeRef.current = regionCode;

  const hydrate = useCallback(
    (raw: string) => {
      const parsed = parsePhone(raw, regionCodeRef.current || defaultCountry);
      setRegionCode(parsed.region);
      setNational(parsed.national);
    },
    [defaultCountry],
  );

  const isControlled = typeof valueProp === 'string';
  useEffect(() => {
    if (!isControlled) {
      return;
    }
    const parsed = parsePhone(valueProp, regionCodeRef.current || defaultCountry);
    setRegionCode(parsed.region);
    setNational(parsed.national);
  }, [isControlled, valueProp, defaultCountry]);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const standaloneSyncedRef = useRef(serialized);
  useEffect(() => {
    if (resolvedForm && name) {
      return;
    }
    if (serialized === standaloneSyncedRef.current) {
      return;
    }
    standaloneSyncedRef.current = serialized;
    onChangeRef.current?.(serialized);
  }, [serialized, resolvedForm, name]);

  useLayoutEffect(() => {
    if (pendingCaretDigits.current == null) {
      return;
    }
    const node = areaRef.current as unknown as {
      setSelectionRange?: (a: number, b: number) => void;
    };
    const host =
      node && typeof node.setSelectionRange === 'function'
        ? node
        : typeof document !== 'undefined' && document.activeElement instanceof HTMLInputElement
          ? document.activeElement
          : null;
    if (host && typeof host.setSelectionRange === 'function') {
      const idx = caretIndexForDigitCount(display, pendingCaretDigits.current);
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
    if (!next || !dialCodes[next] || next === regionCode) {
      return;
    }
    setRegionCode(next);
  };

  if (isWeb) {
    ensureCompositeFocusRing();
    ensurePhoneInputCss();
  }

  const renderPhoneRow = (hasError?: boolean) => (
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
              handleRegionChange(typeof val === 'string' ? val : (val[0] ?? ''));
            }}
            searchPlaceholder={t('Search countries...')}
            emptyMessage={t('No countries found.')}
            popoverWidth={320}
            tabIndex={disabled || readOnly ? -1 : 0}
            disabled={disabled || readOnly}
            aria-label={t('Country code')}
            trigger={(selected) => {
              const opt = Array.isArray(selected) ? selected[0] : selected;
              const code = opt?.value ?? regionCode;
              return (
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
                    <Text fontSize={flagSize} lineHeight={flagSize + 4} userSelect="none">
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
                  {inTableCell ? null : <CaretDownIcon size={caretSize} color={glyphColor} />}
                </XStack>
              );
            }}
          />
          {inTableCell ? null : (
            <View alignSelf="stretch" paddingVertical="$1.5">
              <View data-testid="phone-divider" width={1} flexGrow={1} backgroundColor={formCommonColors.divider} />
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
          aria-required={required || undefined}
          aria-invalid={hasError || undefined}
          aria-readonly={readOnly || undefined}
          {...(inputProps as ComponentProps<typeof InputParts.Area>)}
          data-testid="phone-input"
          data-text-class="T-VALUE"
          color="$color"
        />
      </InputParts.Section>
    </InputParts.Box>
  );

  if (skeleton) {
    const controlH = getFieldHeight(sizeToken as any, 1, hydrationTouch);
    return (
      <FieldLayout
        id={id}
        label={label}
        labelProps={labelProps}
        size={size}
        knobProps={knobProps as any}
        disabled={disabled}>
        <InputParts size={sizeToken}>
          <InputParts.Box disabled>
            <InputParts.Section>
              <Skeleton variant="rounded" width={flagSize + 48} height={Math.max(16, controlH - 12)} />
            </InputParts.Section>
            <InputParts.Section>
              <Skeleton variant="rounded" width="100%" height={Math.max(16, controlH - 12)} />
            </InputParts.Section>
          </InputParts.Box>
        </InputParts>
      </FieldLayout>
    );
  }

  if (!resolvedForm || !name) {
    return (
      <FieldLayout
        id={id}
        label={label}
        labelProps={labelProps}
        error={errorProp}
        helperText={helperText}
        required={required}
        size={size}
        knobProps={knobProps as any}
        onBlur={onBlur}
        disabled={disabled}>
        <InputParts size={sizeToken}>{renderPhoneRow(!!errorProp)}</InputParts>
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
          size={size as string | undefined}
          knobProps={knobProps as { sizeToken: string }}
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
}
