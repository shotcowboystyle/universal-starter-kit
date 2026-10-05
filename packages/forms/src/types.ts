import type { Href } from '@repo/router';
import type { FieldApi } from '@tanstack/form-core';
import type { FormApi } from '@tanstack/react-form';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Link resolver types
// ---------------------------------------------------------------------------

/** Resolves a field value to a Link href. Returns null for no link. */
export type LinkResolver = (value: unknown) => Href | null;

/** Resolves a ChildTable cell value to a Link href. Per-column. */
export type ChildTableLinkResolver<TRow> = (value: unknown, row: TRow, rowIndex: number) => Href | null;

// ---------------------------------------------------------------------------
// Compatibility types for TanStack Form v1
// ---------------------------------------------------------------------------

/**
 * Compatibility type for Validator which doesn't exist in v1.
 * Using `any` because TanStack Form's validator types are complex and require flexibility.
 */
export type Validator<_TData, _TError = unknown> = any;

/**
 * Simplified FieldApi type that covers the most common use cases.
 * TanStack Form v1 has 23 generic parameters on FieldApi, making it impractical
 * to fully type in most situations. This simplified version captures the
 * essential API surface for field components.
 */
export type AnyFieldApi<TValue = unknown> = FieldApi<
  Record<string, unknown>, // TParentData
  string, // TName
  TValue, // TData
  undefined, // TOnMount
  undefined, // TOnChange
  undefined, // TOnChangeAsync
  undefined, // TOnBlur
  undefined, // TOnBlurAsync
  undefined, // TOnSubmit
  undefined, // TOnSubmitAsync
  undefined, // TOnDynamic
  undefined, // TOnDynamicAsync
  undefined, // TFormOnMount
  undefined, // TFormOnChange
  undefined, // TFormOnChangeAsync
  undefined, // TFormOnBlur
  undefined, // TFormOnBlurAsync
  undefined, // TFormOnSubmit
  undefined, // TFormOnSubmitAsync
  undefined, // TFormOnDynamic
  undefined, // TFormOnDynamicAsync
  undefined, // TFormOnServer
  unknown // TParentSubmitMeta
>;

/**
 * Minimal form interface that captures the essential methods used by field components.
 * This avoids the complex generic variance issues with FormApi's 12+ type parameters.
 */
export interface MinimalFormApi<TData = Record<string, unknown>> {
  store?: {
    state?: {
      values?: TData;
    };
  };
  getFieldMeta?: (fieldName: string) => { errors?: readonly (string | undefined)[] } | undefined;
  setFieldValue?: (field: string, value: unknown) => void;
}

/**
 * AnyFormApi accepts any FormApi instance regardless of validator configuration.
 *
 * TanStack Form's FormApi has 12+ type parameters for validators, and TypeScript's
 * variance rules make it impossible to create a permissive type using `unknown`.
 * Using `any` for validator parameters is the only way to accept forms with any
 * validator configuration while maintaining the TData type parameter for type safety.
 */
export type AnyFormApi<TData = Record<string, unknown>> = FormApi<
  TData,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
>;

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
  _TParentData = Record<string, unknown>,
  TName extends string = string,
  _TFieldValidator = any,
  _TFormValidator = any,
  TData = unknown,
> {
  children?: ReactNode;
  form?: FormApi<any, any, any, any, any, any, any, any, any, any, any, any>;
  mode?: 'value' | 'array';
  name?: TName;
  defaultValue?: TData;
  preserveValue?: boolean;
  validators?: any;
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
