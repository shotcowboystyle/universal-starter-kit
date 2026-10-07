import type { FormFieldProps, FieldComponentProps } from '@repo/forms';
import { Barcode as FormsBarcode } from '@repo/forms';
import { BarcodeIcon, CameraIcon, XIcon } from '@phosphor-icons/react';
import type { DeepKeys } from '@tanstack/form-core';
import { useProps } from 'tamagui';

export type BarcodeProps<
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
    disabled?: boolean;
    readOnly?: boolean;
    skeleton?: boolean;
    compact?: boolean;
    enableScan?: boolean;
    formats?: string[];
  };

export function Barcode<TData extends Record<string, unknown> = Record<string, unknown>, TName extends string = string>(
  props: BarcodeProps<TData, TName>,
) {
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
    enableScan,
    formats: _formats,
    ...fieldProps
  } = useProps(props);

  return (
    <FormsBarcode
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
      enableScan={enableScan}
      barcodeIcon={<BarcodeIcon size={18} />}
      scanIcon={<CameraIcon size={18} />}
      stopIcon={<XIcon size={18} />}
    />
  );
}
