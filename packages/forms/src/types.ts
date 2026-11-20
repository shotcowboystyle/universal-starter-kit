import type { Href } from '@repo/router';
import type { AnyFormApi } from '@tanstack/react-form';
import type { ReactNode } from 'react';

import type { FieldValidators } from './shared/utils';

// ---------------------------------------------------------------------------
// Link resolver types
// ---------------------------------------------------------------------------

/** Resolves a field value to a Link href. Returns null for no link. */
export type LinkResolver<TValue = unknown> = (value: TValue) => Href | null;

/** Resolves a ChildTable cell value to a Link href. Per-column. */
export type ChildTableLinkResolver<TRow, TValue = unknown> = (
  value: TValue,
  row: TRow,
  rowIndex: number,
) => Href | null;

// ---------------------------------------------------------------------------
// Compatibility types for TanStack Form v1
// ---------------------------------------------------------------------------

/** Compatibility type for Validator which doesn't exist in v1: a sync validator returning an error or undefined, or no validator. */
export type Validator<TData, TError = unknown> = ((args: { value: TData }) => TError | undefined) | undefined;

export type { AnyFieldApi, AnyFormApi } from '@tanstack/react-form';

/**
 * Minimal form interface that captures the essential methods used by field components.
 * This avoids the complex generic variance issues with FormApi's 12+ type parameters.
 */
export interface MinimalFormApi<TData = object> {
  store?: {
    state?: {
      values?: TData;
    };
  };
  getFieldMeta?: (fieldName: string) => { errors?: readonly (string | undefined)[] } | undefined;
  setFieldValue?: (field: string, value: TData[keyof TData]) => void;
}

/**
 * Type-safe field state from TanStack Form FieldApi.
 */
export interface FieldState<TValue = unknown> {
  value: TValue;
  meta: {
    errors: readonly (string | undefined)[];
    errorMap: Record<string, string | undefined>;
    isValidating: boolean;
    isTouched: boolean;
    isDirty: boolean;
    isPristine: boolean;
  };
}

/**
 * Essential field API methods used by field components.
 * This captures the runtime API surface without the complex generic constraints.
 */
export interface SimpleFieldApi<TValue = unknown> {
  state: FieldState<TValue>;
  handleChange: (value: TValue) => void;
  handleBlur: () => void;
  getValue: () => TValue;
  setValue: (value: TValue) => void;
  name: string;
}

export interface FieldComponentProps<
  _TParentData = object,
  TName extends string = string,
  _TFieldValidator = unknown,
  _TFormValidator = unknown,
  TData = unknown,
> {
  children?: ReactNode;
  form?: AnyFormApi;
  mode?: 'value' | 'array';
  name?: TName;
  defaultValue?: TData;
  preserveValue?: boolean;
  validators?: FieldValidators;
}

// ---------------------------------------------------------------------------
// Web-specific HTML input attributes
// ---------------------------------------------------------------------------

/**
 * Web-specific HTML input type attribute values.
 * These are valid HTML5 input types that may not be typed in React Native UI libraries.
 */
export type WebInputType =
  | 'text'
  | 'password'
  | 'email'
  | 'number'
  | 'tel'
  | 'url'
  | 'search'
  | 'date'
  | 'datetime-local'
  | 'time'
  | 'month'
  | 'week'
  | 'color'
  | 'file'
  | 'hidden'
  | 'range';

/**
 * Web-specific HTML input mode attribute values.
 * Controls which keyboard is shown on mobile devices.
 */
export type WebInputMode = 'none' | 'text' | 'decimal' | 'numeric' | 'tel' | 'search' | 'email' | 'url';

/**
 * Web-specific HTML input attributes that may not be typed in cross-platform UI libraries.
 * Use spread to pass these to Input components: {...webInputProps}
 */
export interface WebInputProps {
  type?: WebInputType;
  inputMode?: WebInputMode;
  autoComplete?: string;
  pattern?: string;
  min?: string | number;
  max?: string | number;
  step?: string | number;
  list?: string;
  multiple?: boolean;
  accept?: string;
}

// ---------------------------------------------------------------------------
// Color value type for dynamic backgroundColor
// ---------------------------------------------------------------------------

/**
 * Color value that can be either a theme token (e.g., "$red10") or a raw CSS color.
 * This allows dynamic colors while maintaining type safety.
 */
export type ColorValue =
  | `$${string}`
  | `#${string}`
  | `rgb(${string})`
  | `rgba(${string})`
  | `hsl(${string})`
  | `hsla(${string})`
  | 'transparent'
  | 'inherit'
  | 'currentColor';
