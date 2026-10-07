import type { FormFieldProps, FieldComponentProps } from '@repo/forms';
import { Signature as FormsSignature } from '@repo/forms';
import { EraserIcon } from '@phosphor-icons/react';
import type { DeepKeys } from '@tanstack/form-core';
import { useProps } from 'tamagui';

export type SignatureProps<
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
    /** Base64 data URL of the signature image */
    value?: string;
    onChange?: (value: string) => void;
    disabled?: boolean;
    readOnly?: boolean;
    skeleton?: boolean;
    compact?: boolean;
    width?: number;
    height?: number;
    penColor?: string;
    backgroundColor?: string;
  };

export function Signature<
  TData extends Record<string, unknown> = Record<string, unknown>,
  TName extends string = string,
>(props: SignatureProps<TData, TName>) {
  const {
    defaultValue,
    form,
    mode: _mode,
    name,
    onBlur,
    onChange,
    preserveValue: _preserveValue,
    validators,
    disabled,
    value,
    width,
    height,
    penColor,
    backgroundColor,
    ...fieldProps
  } = useProps(props);

  return (
    <FormsSignature
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
      onChange={onChange}
      onBlur={onBlur}
      disabled={disabled}
      width={width}
      height={height}
      penColor={penColor}
      backgroundColor={backgroundColor}
      clearIcon={<EraserIcon size={16} />}
    />
  );
}
