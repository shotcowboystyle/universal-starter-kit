import type { Dispatch, SetStateAction } from 'react';
import { useEffect } from 'react';

import { coerceToDate } from './utils';

/**
 * Mirrors the TanStack field value into a picker's display state
 * (`selectedDate` / `selectedDatetime`). Without it the form branch only
 * ever showed the mount-time value, so a value applied AFTER first paint
 * (create-mode engine seeding, form.setFieldValue, live server merge) never
 * rendered. Display-only: never calls onChange/onValueChange (a
 * programmatic value application is not a user edit). Rendered inside the
 * Field render prop, which re-renders on field state changes (hooks cannot
 * live in the render prop itself — same extraction as Stepper/PhoneInput
 * renderers).
 */
export function DatePickerFieldValueSync({
  value,
  onSync,
}: {
  value: unknown;
  onSync: Dispatch<SetStateAction<Date | null>>;
}) {
  useEffect(() => {
    const next = coerceToDate(value);
    // Keep the previous Date identity when the instant is unchanged so the
    // sync never churns downstream effects (close-on-select watches state).
    onSync((prev) =>
      prev === next || (prev !== null && next !== null && prev.getTime() === next.getTime()) ? prev : next,
    );
  }, [value, onSync]);
  return null;
}

/**
 * Shape-agnostic variant for pickers whose display state is not a single
 * Date (MonthPicker's {month,year}, MultiDatePicker's Date[],
 * DateRangePicker's {start,end}): mirrors the live TanStack field value into
 * the picker's adoption callback whenever it changes (including mount, so a
 * Field-level defaultValue displays too). Each picker's `onSync` owns its
 * coercion + identity-preserving equality guard, and must never emit
 * onChange from this path (a programmatic value application is not
 * a user edit).
 */
export function FieldValueSync({ value, onSync }: { value: unknown; onSync: (value: unknown) => void }) {
  useEffect(() => {
    onSync(value);
  }, [value, onSync]);
  return null;
}
