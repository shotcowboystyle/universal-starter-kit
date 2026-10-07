import type { FormFieldProps, FieldComponentProps } from '@repo/forms';
import { Rating as FormsRating } from '@repo/forms';
import { StarIcon } from '@phosphor-icons/react';
import type { DeepKeys } from '@tanstack/form-core';
import { useProps } from 'tamagui';

export type RatingProps<
  TData extends Record<string, unknown> = Record<string, unknown>,
  TName extends string = string,
> = Omit<
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
    onChange?: (value: number) => void;
    disabled?: boolean;
    readOnly?: boolean;
    skeleton?: boolean;
    compact?: boolean;
    maxStars?: number;
  };

export function Rating<TData extends Record<string, unknown> = Record<string, unknown>, TName extends string = string>(
  props: RatingProps<TData, TName>,
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
    maxStars,
    ...fieldProps
  } = useProps(props);

  return (
    <FormsRating
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
      maxStars={maxStars}
      starIcon={StarIcon}
    />
  );
}
