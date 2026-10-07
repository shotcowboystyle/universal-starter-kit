/**
 * MPO-64 leftover: the frappe-ui Date iOS sheet must use the same keyboard
 * cap as FloatingPanel / SheetModal. KeyboardAvoidingView cannot shrink a
 * fixed-height calendar, so the cap is the only thing that keeps the sheet
 * above the suggestion strip.
 */
import { describe, expect, it } from 'vitest';

import {
  datePickerHeight,
  dateSheetBottomPadding,
  dateSheetMaxHeight,
  DATE_PICKER_CALENDAR_HEIGHT,
  DATE_SHEET_BACKDROP_STRIP,
  DATE_SHEET_MIN_HEIGHT,
} from './sheetKeyboard';

describe(dateSheetMaxHeight, () => {
  it('uses the 85% detent when the keyboard is down', () => {
    expect(dateSheetMaxHeight(800, 0, 47)).toBe(Math.round(800 * 0.85));
  });

  it('caps to the space above the keyboard, less the 48pt backdrop strip', () => {
    expect(dateSheetMaxHeight(800, 400, 0)).toBe(800 - 400 - DATE_SHEET_BACKDROP_STRIP);
    expect(dateSheetMaxHeight(800, 400, 0)).toBeLessThan(dateSheetMaxHeight(800, 0, 0));
  });

  it('keeps the backdrop strip below the status bar, not inside it', () => {
    const windowHeight = 874;
    const keyboardInset = 335;
    const topInset = 62;
    const sheetTop = windowHeight - keyboardInset - dateSheetMaxHeight(windowHeight, keyboardInset, topInset);
    expect(sheetTop - topInset).toBe(DATE_SHEET_BACKDROP_STRIP);
  });

  it('never collapses below the minimum sheet height', () => {
    expect(dateSheetMaxHeight(800, 700, 47)).toBe(DATE_SHEET_MIN_HEIGHT);
  });
});

describe(datePickerHeight, () => {
  it('keeps the calendar grid when the sheet is tall enough', () => {
    expect(datePickerHeight('date', 700)).toBe(DATE_PICKER_CALENDAR_HEIGHT);
  });

  it('shrinks the calendar so the sheet can sit above the keyboard', () => {
    const maxHeight = dateSheetMaxHeight(800, 400, 47);
    const height = datePickerHeight('date', maxHeight);
    expect(height).toBeLessThan(DATE_PICKER_CALENDAR_HEIGHT);
    expect(height).toBeLessThanOrEqual(maxHeight);
  });
});

describe(dateSheetBottomPadding, () => {
  it('drops the home-indicator inset while the keyboard covers it', () => {
    expect(dateSheetBottomPadding(0, true)).toBe(24);
    expect(dateSheetBottomPadding(336, true)).toBe(8);
    expect(dateSheetBottomPadding(0, false)).toBe(16);
  });
});
