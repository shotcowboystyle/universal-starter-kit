import type { FormFieldProps, FieldComponentProps } from '@repo/forms';
import { MentionInput } from '@repo/forms';
import type { DeepKeys } from '@tanstack/form-core';
import { useProps } from 'tamagui';

export interface MentionItem {
  id: string;
  display: string;
  avatar?: string;
  description?: string;
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- caller-owned extra data carried with a mention
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
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- form data shape is caller-defined; mirrors FormFieldProps' default
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

export const MentionInputField = <
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- form data shape is caller-defined; mirrors FormFieldProps' default
  TData extends Record<string, unknown> = Record<string, unknown>,
  TName extends string = string,
>(
  props: MentionInputFieldProps<TData, TName>,
) => {
  // SAFETY: useProps only expands Tamagui shorthands/media props; the keys remain MentionInputFieldProps'
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type, typescript/no-unsafe-type-assertion -- see SAFETY above; extra keys flow into fieldProps
  const resolvedProps = useProps(props) as MentionInputFieldProps<TData, TName> & Record<string, unknown>;
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
  } = resolvedProps;

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
};
