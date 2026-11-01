import type { FormFieldProps, FieldComponentProps } from '@repo/forms';
import { RadioGroup as FormsRadioGroup } from '@repo/forms';
import type { DeepKeys } from '@tanstack/form-core';
import type { ComponentProps, ReactNode } from 'react';
import { useProps } from 'tamagui';

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- TanStack form data shape; its keys are the doctype's fields, unknown to this adapter
type FieldData = Record<string, unknown>;
// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- opaque pass-through bag forwarded verbatim to the forms RadioGroup
type PassThroughProps = Record<string, unknown>;

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- TanStack form data shape; its keys are the doctype's fields, unknown to this adapter
export type RadioGroupFieldProps<TData extends FieldData = FieldData, TName extends string = string> = Omit<
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
    options?: { label: string; value: string }[];
    orientation?: 'horizontal' | 'vertical';
    disabled?: boolean;
    readOnly?: boolean;
    skeleton?: boolean;
    compact?: boolean;
    children?: ReactNode;
    // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- opaque pass-through bag forwarded verbatim to the forms RadioGroup
    radioGroupProps?: PassThroughProps;
  };

export const RadioGroupField = <TData extends FieldData = FieldData, TName extends string = string>(
  props: RadioGroupFieldProps<TData, TName>,
) => {
  const {
    radioGroupProps,
    defaultValue,
    form,
    name,
    onBlur,
    onChange,
    validators,
    disabled,
    value,
    options,
    orientation,
    children,
    ...fieldProps
  } = useProps(props);

  return (
    <FormsRadioGroup
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
      options={options}
      orientation={orientation}
      // SAFETY: radioGroupProps is the consumer's pass-through bag, forwarded to RadioGroup unchanged as before
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see SAFETY above
      radioGroupProps={radioGroupProps as ComponentProps<typeof FormsRadioGroup>['radioGroupProps']}>
      {children}
    </FormsRadioGroup>
  );
};
