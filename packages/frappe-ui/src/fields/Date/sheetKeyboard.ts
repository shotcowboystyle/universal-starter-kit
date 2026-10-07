/**
 * MPO-64 leftover: same keyboard cap as FloatingPanel / SheetModal.
 *
 * The Date iOS sheet used to give the calendar a fixed 360pt height inside a
 * Modal. KeyboardAvoidingView cannot shrink that shape — it pads the container
 * and the sheet overflows off the top. Cap the sheet to the space between the
 * status bar and the keyboard (less a strip of backdrop) and shrink the picker
 * to fit.
 */

export const DATE_SHEET_MAX_HEIGHT_RATIO = 0.85;
export const DATE_SHEET_BACKDROP_STRIP = 48;
export const DATE_SHEET_MIN_HEIGHT = 180;
export const DATE_SHEET_CHROME = 96;
export const DATE_PICKER_CALENDAR_HEIGHT = 360;
export const DATE_PICKER_WHEEL_HEIGHT = 200;
const minPickerHeight = 120;

export function dateSheetMaxHeight(windowHeight: number, keyboardInset: number, topInset: number): number {
  const available = Math.max(0, windowHeight - keyboardInset);
  return Math.max(
    DATE_SHEET_MIN_HEIGHT,
    Math.round(Math.min(windowHeight * DATE_SHEET_MAX_HEIGHT_RATIO, available - topInset - DATE_SHEET_BACKDROP_STRIP)),
  );
}

/** Home-indicator clearance; drop it while the keyboard already covers that band. */
export function dateSheetBottomPadding(keyboardInset: number, isIos: boolean): number {
  if (keyboardInset > 0) {
    return 8;
  }
  return isIos ? 24 : 16;
}

export function datePickerHeight(mode: 'date' | 'time', maxHeight: number): number {
  const preferred = mode === 'time' ? DATE_PICKER_WHEEL_HEIGHT : DATE_PICKER_CALENDAR_HEIGHT;
  return Math.min(preferred, Math.max(minPickerHeight, maxHeight - DATE_SHEET_CHROME));
}
