/**
 * Frappe Data field — thin adapter over forms Input.
 *
 * Design-law lives on this file: compose Input, do not fork its chrome.
 * D/R/E/Q/S/C and the DEFAULT-class field box all inherit.
 */
import type { FormFieldProps, FieldComponentProps } from '@repo/forms';
import { Input as FormsInput } from '@repo/forms';
import type { DeepKeys } from '@tanstack/form-core';
import type { ComponentProps } from 'react';
import { useProps } from 'tamagui';

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- TanStack form data shape; its keys are the doctype's fields, unknown to this adapter
type FieldData = Record<string, unknown>;
// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- opaque pass-through bag forwarded verbatim to the forms Input
type PassThroughProps = Record<string, unknown>;

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- TanStack form data shape; its keys are the doctype's fields, unknown to this adapter
export type DataProps<TData extends FieldData = FieldData, TName extends string = string> = Omit<
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
    // oxlint-disable-next-line sonarjs/max-union-size -- one member per Frappe text fieldtype this adapter renders
    type?: 'data' | 'small_text' | 'long_text' | 'text_editor';
    placeholder?: string;
    disabled?: boolean;
    readOnly?: boolean;
    skeleton?: boolean;
    compact?: boolean;
    maxLength?: number;
    // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- opaque pass-through bag forwarded verbatim to the forms Input
    inputProps?: PassThroughProps;
  };

export const Data = <TData extends FieldData = FieldData, TName extends string = string>(
  props: DataProps<TData, TName>,
) => {
  const {
    defaultValue,
    form,
    inputProps,
    name,
    onBlur,
    onChange,
    placeholder,
    validators,
    disabled,
    value,
    type = 'data',
    maxLength,
    ...fieldProps
  } = useProps(props);
  const isMultiline = type === 'long_text' || type === 'text_editor' || type === 'small_text';

  return (
    <FormsInput
      name={name}
      form={form}
      validators={validators}
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
      value={value}
      onChangeText={onChange}
      onBlur={onBlur}
      placeholder={placeholder}
      disabled={disabled}
      multiline={isMultiline}
      maxLength={maxLength ?? (isMultiline ? undefined : 140)}
      // SAFETY: inputProps is the consumer's pass-through bag, forwarded to Input unchanged as before
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
      inputProps={inputProps as ComponentProps<typeof FormsInput>['inputProps']}
    />
  );
};
