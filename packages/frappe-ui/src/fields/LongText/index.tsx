/**
 * Frappe Long Text / Text — thin adapter over forms TextArea.
 * Design-law lives on this file: compose TextArea, do not fork Input chrome.
 */
import type { FormFieldProps, FieldComponentProps } from '@repo/forms';
import { TextArea } from '@repo/forms';
import type { DeepKeys } from '@tanstack/form-core';
import type { ComponentProps } from 'react';
import { useProps } from 'tamagui';

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- TanStack form data shape; its keys are the doctype's fields, unknown to this adapter
type FieldData = Record<string, unknown>;
// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- opaque pass-through bag forwarded verbatim to the forms TextArea
type PassThroughProps = Record<string, unknown>;

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- TanStack form data shape; its keys are the doctype's fields, unknown to this adapter
export type LongTextProps<TData extends FieldData = FieldData, TName extends string = string> = Omit<
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
    // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- opaque pass-through bag forwarded verbatim to the forms TextArea
    textAreaProps?: PassThroughProps;
  };

export const LongText = <TData extends FieldData = FieldData, TName extends string = string>(
  props: LongTextProps<TData, TName>,
) => {
  const {
    defaultValue,
    form,
    name,
    onBlur,
    onChange,
    placeholder,
    validators,
    disabled,
    value,
    maxLength,
    minHeight,
    textAreaProps,
    ...fieldProps
  } = useProps(props);

  const minRows = minHeight !== undefined && minHeight > 0 ? Math.max(4, Math.round(minHeight / 24)) : 6;

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
      onChange={onChange}
      onBlur={onBlur}
      placeholder={placeholder}
      disabled={disabled}
      maxLength={maxLength}
      minRows={minRows}
      maxRows={16}
      // SAFETY: textAreaProps is the consumer's pass-through bag, forwarded to TextArea unchanged as before
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
      textAreaProps={textAreaProps as ComponentProps<typeof TextArea>['textAreaProps']}
    />
  );
};
