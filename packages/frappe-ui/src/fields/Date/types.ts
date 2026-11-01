import type { FormFieldProps, FieldComponentProps } from '@repo/forms';
import type { DeepKeys } from '@tanstack/form-core';

/**
 * The public contract for the frappe-ui `Date` field.
 *
 * The package exports one `Date`, and the two platform halves
 * (`index.tsx` / `index.native.tsx`) both satisfy this type, so a consumer
 * never sees a different prop surface depending on where the code runs. The
 * type lives in its own module for the same reason `TextEditor` keeps one:
 * neither half can import it from the other without resolving to itself.
 */
export type DateProps<
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- mirrors the TParentData constraint of FormFieldProps/FieldComponentProps
  TData extends Record<string, unknown> = Record<string, unknown>,
  TName extends string = string,
> = Omit<
  FormFieldProps<TData, TName extends DeepKeys<TData> ? TName : DeepKeys<TData>, unknown, unknown, string>,
  // "onChange": FormFieldProps carries the DOM ChangeEventHandler from
  // YStackProps; this field exposes a canonical value callback instead.
  'children' | 'field' | 'onChange'
> &
  Partial<
    Omit<
      FieldComponentProps<TData, TName extends DeepKeys<TData> ? TName : DeepKeys<TData>, unknown, unknown, string>,
      'children'
    >
  > & {
    /** Frappe wire value: `YYYY-MM-DD`, `YYYY-MM-DD HH:mm:ss`, or `HH:mm:ss`. */
    value?: string;
    onChange?: (value: string) => void;
    type?: 'date' | 'datetime' | 'time';
    disabled?: boolean;
    readOnly?: boolean;
    skeleton?: boolean;
    compact?: boolean;
    /** Overrides the type-derived default ("Select date" / "…time"). */
    placeholder?: string;
    minDate?: Date;
    maxDate?: Date;
    // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- open-ended prop bag spread onto the underlying input
    inputProps?: Record<string, unknown>;
  };
