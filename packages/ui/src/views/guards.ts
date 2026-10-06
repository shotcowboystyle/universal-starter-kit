import type { ReactNode } from 'react';

/** Runtime type guards for values that arrive from consumers untyped at the seam. */
export const isString = (value: unknown): value is string => typeof value === 'string';

export const isNumber = (value: unknown): value is number => typeof value === 'number';

/** Strings and numbers render as text; any other node renders as itself. */
export const isPlainText = (value: unknown): value is string | number => isString(value) || isNumber(value);

/** `value`, or `fallback` when it is undefined or the empty string. */
export const orDefault = (value: string | undefined, fallback: string): string =>
  value === undefined || value === '' ? fallback : value;

/** React's own truthiness for a slot: null, undefined, false, 0, NaN and '' render nothing. */
export const hasNode: (node: ReactNode) => boolean = Boolean;

/** True for a string with at least one character. */
export const isNonEmpty = (value: string | undefined): value is string => value !== undefined && value !== '';

/** Bounds-checked read: `undefined` for a negative or past-the-end index (a bare `.at(-1)` would wrap). */
export const elementAt = <E>(items: readonly E[], index: number): E | undefined =>
  index < 0 ? undefined : items.at(index);
