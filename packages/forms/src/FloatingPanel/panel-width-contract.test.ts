/**
 * Text listboxes match the field width; intrinsic editors size to their content.
 *
 * The runtime half is covered in `use-floating-panel.test.tsx`. This is the
 * source half, and it exists because the defect it guards is invisible at
 * runtime unless someone opens that one picker at that one field width:
 * DatePicker measured 262px of calendar under a 289px trigger purely because
 * the call site said `fitContent`.
 *
 * Calendar grids take fit-content: a full-width field wrapper is
 * unrelated to seven day columns and must not create a mostly empty popup.
 * Text listboxes retain at-least-trigger; icon/button launchers may also hug.
 * The Icon glyph grid pins to its field exactly (match-trigger): fixed 64px
 * cells wrap into more columns on a wider field instead of stretching.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const fieldsDir = path.resolve(import.meta.dirname, '..', 'fields');

/** Pickers whose trigger is a form FIELD: the panel may never be narrower. */
// Geolocation always resolved to at-least-trigger (it passed `fitContent={false}`); it now says so explicitly.
const fieldTriggerPickers = ['TimePicker/catalog.tsx', 'ColorPicker/parts.tsx', 'Geolocation/index.tsx'];

/** Field-triggered pickers pinned to the field's width exactly. */
const matchTriggerPickers = ['Icon/index.tsx'];

const intrinsicGridPickers = ['DatePicker/parts.tsx', 'DatePicker/DatetimePicker.catalog.tsx'];

const read = (relative: string): string => readFileSync(path.resolve(fieldsDir, relative), 'utf-8');

describe('FloatingPanel width contract', () => {
  it.each(intrinsicGridPickers)('%s hugs its calendar grid', (relative) => {
    expect(read(relative)).toContain('widthMode="fit-content"');
  });

  it.each(fieldTriggerPickers)('%s declares at-least-trigger', (relative) => {
    const source = read(relative);
    expect(source).toContain('widthMode="at-least-trigger"');
  });

  it.each(matchTriggerPickers)('%s declares match-trigger', (relative) => {
    expect(read(relative)).toContain('widthMode="match-trigger"');
  });

  it.each([...fieldTriggerPickers, ...matchTriggerPickers])(
    '%s no longer passes the fitContent boolean',
    (relative) => {
      const source = read(relative);
      expect(source).not.toMatch(/^[ \t]*fitContent[ \t]*$/mu);
      expect(source).not.toMatch(/fitContent=\{?true/u);
    },
  );
});
