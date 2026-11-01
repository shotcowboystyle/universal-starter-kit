/**
 * Frappe Color field — thin adapter over forms ColorPicker.
 *
 * Design-law lives on this file: compose ColorPicker, do not fork its chrome.
 * Canonical change is `onChange` (LC-14); a chosen hex is value data.
 */
import type { FormFieldProps, FieldComponentProps } from '@repo/forms';
import { ColorPicker as FormsColorPicker } from '@repo/forms';
import type { DeepKeys } from '@tanstack/form-core';
import { useProps } from 'tamagui';

export type ColorProps<
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- mirrors the TParentData constraint of FormFieldProps/FieldComponentProps
  TData extends Record<string, unknown> = Record<string, unknown>,
  TName extends string = string,
> = Omit<
  FormFieldProps<TData, TName extends DeepKeys<TData> ? TName : DeepKeys<TData>, unknown, unknown, string>,
  // "onChange": FormFieldProps carries the DOM ChangeEventHandler from
  // YStackProps; this field exposes a canonical value callback instead.
  'children' | 'field' | 'onChange'
> &
  Partial<
    Omit<
      FieldComponentProps<TData, TName extends DeepKeys<TData> ? TName : DeepKeys<TData>, unknown, unknown, string>,
      'children'
    >
  > & {
    value?: string;
    onChange?: (value: string) => void;
    placeholder?: string;
    disabled?: boolean;
    readOnly?: boolean;
    skeleton?: boolean;
    compact?: boolean;
    showPresets?: boolean;
    presetColors?: string[];
  };

export const Color = <
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- mirrors the TParentData constraint of FormFieldProps/FieldComponentProps
  TData extends Record<string, unknown> = Record<string, unknown>,
  TName extends string = string,
>(
  props: ColorProps<TData, TName>,
) => {
  const {
    defaultValue,
    form,
    mode,
    name,
    onBlur,
    onChange,
    preserveValue,
    validators,
    disabled,
    value,
    // hex-escape: a Color field stores hex; the placeholder shows that format and paints nothing
    placeholder = '#000000',
    presetColors,
    ...fieldProps
  } = useProps(props);

  return (
    <FormsColorPicker
      name={name}
      form={form}
      validators={validators}
      value={value}
      onChange={onChange}
      defaultValue={defaultValue}
      label={fieldProps.label}
      labelProps={fieldProps.labelProps}
      error={fieldProps.error}
      helperText={fieldProps.helperText}
      readOnly={fieldProps.readOnly}
      skeleton={fieldProps.skeleton}
      compact={fieldProps.compact}
      required={fieldProps.required}
      id={fieldProps.id}
      size={fieldProps.size}
      disabled={disabled}
      placeholder={placeholder}
      format="hex"
      presetColors={presetColors}
      onBlur={onBlur}
      mode={mode}
      preserveValue={preserveValue}
    />
  );
};
