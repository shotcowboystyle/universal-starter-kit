/**
 * Frappe Long Text / Text — thin adapter over forms TextArea.
 * Design-law lives on this file: compose TextArea, do not fork Input chrome.
 */
import type { FormFieldProps, FieldComponentProps } from '@repo/forms';
import { TextArea } from '@repo/forms';
import type { DeepKeys } from '@tanstack/form-core';
import { useProps } from 'tamagui';

export type LongTextProps<
  TData extends Record<string, unknown> = Record<string, unknown>,
  TName extends string = string,
> = Omit<
  FormFieldProps<TData, TName extends DeepKeys<TData> ? TName : DeepKeys<TData>, unknown, unknown, string>,
  'children' | 'field'
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
    maxLength?: number;
    minHeight?: number;
    textAreaProps?: Record<string, unknown>;
  };

export function LongText<
  TData extends Record<string, unknown> = Record<string, unknown>,
  TName extends string = string,
>(props: LongTextProps<TData, TName>) {
  const {
    defaultValue,
    form,
    _mode,
    name,
    onBlur,
    onChange,
    placeholder,
    _preserveValue,
    validators,
    disabled,
    value,
    maxLength,
    minHeight,
    textAreaProps,
    ...fieldProps
  } = useProps(props) as LongTextProps<TData, TName> & Record<string, unknown>;

  const minRows = typeof minHeight === 'number' && minHeight > 0 ? Math.max(4, Math.round(minHeight / 24)) : 6;

  return (
    <TextArea
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
      maxLength={maxLength}
      minRows={minRows}
      maxRows={16}
      textAreaProps={textAreaProps as any}
    />
  );
}
