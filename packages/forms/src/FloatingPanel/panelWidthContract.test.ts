/**
 * Text listboxes match the field width; intrinsic editors size to their content.
 *
 * The runtime half is covered in `useFloatingPanel.test.tsx`. This is the
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
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const fieldsDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'fields');

/** Pickers whose trigger is a form FIELD: the panel may never be narrower. */
const fieldShapedPickers = ['TimePicker/catalog.tsx', 'ColorPicker/parts.tsx'];

/** Field-triggered pickers pinned to the field's width exactly. */
const matchTriggerPickers = ['Icon/index.tsx'];

const intrinsicGridPickers = ['DatePicker/parts.tsx', 'DatePicker/DatetimePicker.catalog.tsx'];

/** Panels opened from an icon/button trigger, where fit-content is correct. */
const buttonShapedPickers = ['Geolocation/index.tsx'];

function read(relative: string): string {
  return readFileSync(resolve(fieldsDir, relative), 'utf8');
}

describe('FloatingPanel width contract', () => {
  it.each(intrinsicGridPickers)('%s hugs its calendar grid', (relative) => {
    expect(read(relative)).toContain('widthMode="fit-content"');
  });

  it.each(fieldShapedPickers)('%s declares at-least-trigger', (relative) => {
    const source = read(relative);
    expect(source).toContain('widthMode="at-least-trigger"');
  });

  it.each(matchTriggerPickers)('%s declares match-trigger', (relative) => {
    expect(read(relative)).toContain('widthMode="match-trigger"');
  });

  it.each([...fieldShapedPickers, ...matchTriggerPickers])('%s no longer passes the fitContent boolean', (relative) => {
    const source = read(relative);
    expect(source).not.toMatch(/^\s*fitContent\s*$/m);
    expect(source).not.toMatch(/fitContent=\{?true/);
  });

  it.each(buttonShapedPickers)('%s keeps fit-content deliberately', (relative) => {
    const source = read(relative);
    // Asserted, not merely tolerated: if this stops being true the exemption
    // list is stale and someone must re-judge it rather than delete a line.
    expect(source).toMatch(/fitContent/);
  });
});
