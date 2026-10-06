/**
 * Field edit-mode classification.
 *
 * `inline`  → field renders directly in the table cell at row height.
 * `popover` → field's full UI lives in a floating popover anchored to the cell;
 *             cell shows a compact trigger.
 * `modal`   → field's UI is too big for inline or popover (drop zone, signature
 *             pad, rich text editor); cell shows a summary chip and clicking
 *             opens a centered modal (web) or sheet (native).
 *
 * Used by DataTableCell to decide how to mount each field type. Centralized
 * here rather than as static props on every field so the routing is in one
 * place; if a field's natural shape changes, update one map entry.
 */

import type { FieldDisplayType } from './index';

export type EditMode = 'inline' | 'popover' | 'modal';

export const FIELD_EDIT_MODE: Record<FieldDisplayType, EditMode> = {
  // Plain inline text/number/boolean controls
  input: 'inline',
  textarea: 'inline',
  stepper: 'inline',
  slider: 'inline',
  checkbox: 'inline',
  switch: 'inline',
  rating: 'inline',
  progress: 'inline',
  otp: 'inline',

  // Popover-anchored selectors
  select: 'popover',
  combobox: 'popover',
  radiogroup: 'popover',
  togglegroup: 'popover',
  datepicker: 'popover',
  datetimepicker: 'popover',
  timepicker: 'popover',
  daterangepicker: 'popover',
  multidatepicker: 'popover',
  duration: 'popover',
  colorpicker: 'popover',
  phoneinput: 'popover',

  // Modal/sheet — too tall for inline or popover
  // (barcode: the camera scanner surface is a full panel)
  barcode: 'modal',
  fileupload: 'modal',
  signature: 'modal',
  mentioninput: 'modal',
  geolocation: 'modal',
  image: 'modal',
  richtexteditor: 'modal',
  markdowneditor: 'modal',
  codeeditor: 'modal',

  // Caller-provided render
  custom: 'inline',
};

export function getEditMode(field: FieldDisplayType | undefined): EditMode {
  if (!field) {
    return 'inline';
  }
  return FIELD_EDIT_MODE[field] ?? 'inline';
}
