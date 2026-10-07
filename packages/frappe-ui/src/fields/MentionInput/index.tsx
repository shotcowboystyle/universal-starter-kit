import type { FormFieldProps, FieldComponentProps } from '@repo/forms';
import { MentionInput } from '@repo/forms';
import type { DeepKeys } from '@tanstack/form-core';
import { useProps } from 'tamagui';

export interface MentionItem {
  id: string;
  display: string;
  avatar?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface MentionConfig {
  trigger: string;
  data: MentionItem[];
  allowSpace?: boolean;
  insertSpace?: boolean;
  menuHeight?: number;
  menuWidth?: number;
}

export interface MentionValue {
  text: string;
  mentions: {
    type: string;
    id: string;
    display: string;
    position: number;
    length: number;
  }[];
}

export type MentionInputFieldProps<
  TData extends Record<string, unknown> = Record<string, unknown>,
  TName extends string = string,
> = Omit<
  FormFieldProps<TData, TName extends DeepKeys<TData> ? TName : DeepKeys<TData>, unknown, unknown, MentionValue>,
  'children' | 'field'
> &
  Partial<
    Omit<
      FieldComponentProps<
        TData,
        TName extends DeepKeys<TData> ? TName : DeepKeys<TData>,
        unknown,
        unknown,
        MentionValue
      >,
      'children'
    >
  > & {
    value?: MentionValue;
    onChange?: (value: MentionValue) => void;
    disabled?: boolean;
    readOnly?: boolean;
    skeleton?: boolean;
    compact?: boolean;
    mentions: MentionConfig[];
    placeholder?: string;
    onMentionSelect?: (mention: MentionItem, trigger: string) => void;
  };

export function MentionInputField<
  TData extends Record<string, unknown> = Record<string, unknown>,
  TName extends string = string,
>(props: MentionInputFieldProps<TData, TName>) {
  const {
    defaultValue,
    form,
    _mode,
    name,
    _preserveValue,
    validators,
    disabled,
    value,
    onChange,
    mentions,
    placeholder,
    onMentionSelect,
    ...fieldProps
  } = useProps(props) as MentionInputFieldProps<TData, TName> & Record<string, unknown>;

  return (
    <MentionInput
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
      disabled={disabled}
      value={value}
      onChange={onChange}
      mentions={mentions ?? []}
      placeholder={placeholder}
      onMentionSelect={onMentionSelect}
    />
  );
}
