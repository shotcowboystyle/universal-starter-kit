import type { FormFieldProps, FieldComponentProps } from '@repo/forms';
import { Progress as FormsProgress } from '@repo/forms';
import type { DeepKeys } from '@tanstack/form-core';
import type { ComponentProps } from 'react';
import { useProps } from 'tamagui';

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- TanStack form data shape; its keys are the doctype's fields, unknown to this adapter
type FieldData = Record<string, unknown>;
// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- opaque pass-through bag forwarded verbatim to the forms Progress
type PassThroughProps = Record<string, unknown>;

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- TanStack form data shape; its keys are the doctype's fields, unknown to this adapter
export type ProgressFieldProps<TData extends FieldData = FieldData, TName extends string = string> = Omit<
  FormFieldProps<TData, TName extends DeepKeys<TData> ? TName : DeepKeys<TData>, unknown, unknown, number>,
  'children' | 'field'
> &
  Partial<
    Omit<
      FieldComponentProps<TData, TName extends DeepKeys<TData> ? TName : DeepKeys<TData>, unknown, unknown, number>,
      'children'
    >
  > & {
    value?: number;
    max?: number;
    // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- opaque pass-through bag forwarded verbatim to the forms Progress
    progressProps?: PassThroughProps;
    readOnly?: boolean;
    skeleton?: boolean;
    compact?: boolean;
  };

export const ProgressField = <TData extends FieldData = FieldData, TName extends string = string>(
  props: ProgressFieldProps<TData, TName>,
) => {
  const { progressProps, defaultValue, form, name, validators, value, max, ...fieldProps } = useProps(props);

  return (
    <FormsProgress
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
      max={max}
      // SAFETY: progressProps is the consumer's pass-through bag, forwarded to Progress unchanged as before
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
      progressProps={progressProps as ComponentProps<typeof FormsProgress>['progressProps']}
    />
  );
};
