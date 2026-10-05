import { renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import { cleanup } from '@testing-library/react';
import { AlertDialog, Dialog, Theme } from 'tamagui';
import { afterEach, describe, expect, it } from 'vitest';

import { Button } from './Button';
import { AlertDialogContent, DialogContent } from './surfaces';

afterEach(cleanup);

// ── What this file measures, and why not the class list ──────────────────
//
// Acceptance: "DialogContent paints the reference overlay shadow" and "a
// spec asserts the dialog shadow differs from the Button shadow".
//
// The obvious probe — read the frame's `_bxsh-*` atom — passes on a frame
// that paints something else entirely. `resolveKnobs.elevationPaint` emits
// its web paint as `style: { boxShadow }`, an INLINE style, and Tamagui only
// stamps `!important` on PSEUDO atoms (`getCSSStylesAtomic`: `const
// important = !!pseudo`). A base atom therefore loses the cascade to any
// inline style on the same node. Measured on `6eb0995`, before this lane:
//
//   class  _bxsh-0px12px24px…                      (the reference value — dead)
//   style  0 3px 6px rgba(0,0,0,0.15), 0 2px 4px … (the `$2` value — painted)
//
// So these assert the INLINE style, which is what a browser paints, and read
// the class only to prove the two now agree. Reading the class alone is the
// same hole earlier fixes all fell through, one layer further in:
// the fragment reaches the frame and still never reaches the pixel.

/** Reference dialog shadow: the overlay ladder's `$5` stop. */
const dialogStopPaint = '0 12px 24px rgba(0,0,0,0.12)';
/** Same geometry and alpha, hue inverted — dark elevation forbids a dark umbra. */
const dialogStopPaintDark = '0 12px 24px rgba(255,255,255,0.12)';
/** Reference popper shadow: the overlay ladder's `$3` stop. */
const popperStopPaint = '0 4px 8px rgba(0,0,0,0.10), 0 12px 32px rgba(0,0,0,0.08)';
/** `webShadowLight.$2` — the overlay ladder's default `small` stop. */
const overlaySmallPaint = '0 3px 6px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.10)';
/** `webShadowLight.$4` — the control stop at elevation large. */
const controlLargePaint = '0 10px 20px rgba(0,0,0,0.15), 0 3px 6px rgba(0,0,0,0.10)';

function frame(id: string): HTMLElement {
  const el = document.querySelector(`[data-testid="${id}"]`);
  if (!el) {
    throw new Error(`no frame rendered for ${id}`);
  }
  return el as HTMLElement;
}

/** The value a browser paints: the inline style wins over every base atom. */
function paintedShadow(id: string): string {
  return frame(id).style.boxShadow;
}

function shadowAtoms(id: string): string[] {
  return String(frame(id).className || '')
    .split(/\s+/)
    .filter((c) => c.startsWith('_bxsh-'))
    .sort();
}

function bgAtoms(id: string): string[] {
  return String(frame(id).className || '')
    .split(/\s+/)
    .filter((c) => c.startsWith('_bg-'));
}

function renderDialogsBesideAButton(elevation?: 'small' | 'medium' | 'large') {
  renderWithProviders(
    <Preset overrides={elevation ? { elevation } : undefined}>
      <Button testID="control">Save</Button>
      <Dialog modal open>
        <Dialog.Portal>
          <DialogContent testID="dialog">dialog</DialogContent>
        </Dialog.Portal>
      </Dialog>
      <AlertDialog open>
        <AlertDialog.Portal>
          <AlertDialogContent testID="alertdialog">confirm</AlertDialogContent>
        </AlertDialog.Portal>
      </AlertDialog>
    </Preset>,
  );
}

describe('overlay elevation is a different distance off the surface', () => {
  it('DialogContent paints the overlay ladder, reaching the reference dialog shadow at large', () => {
    renderDialogsBesideAButton('large');
    expect(paintedShadow('dialog')).toBe(dialogStopPaint);
    expect(paintedShadow('dialog')).not.toBe(paintedShadow('control'));
    expect(paintedShadow('control')).toBe(controlLargePaint);
  });

  it("at medium the overlay paints the reference popper stop, not the control's $2", () => {
    renderDialogsBesideAButton('medium');
    expect(paintedShadow('dialog')).toBe(popperStopPaint);
    expect(paintedShadow('dialog')).not.toBe(paintedShadow('control'));
  });

  it('at the default stop the control is flat and the overlay still lifts', () => {
    renderDialogsBesideAButton();
    expect(paintedShadow('control')).toBe('');
    expect(paintedShadow('dialog')).toBe(overlaySmallPaint);
  });

  it('the atom and the inline style agree — no dead class under a different live paint', () => {
    renderDialogsBesideAButton('large');
    // The atom half alone does not discriminate (a class can name one shadow
    // while the inline style paints another), so pair it with the painted value.
    expect(shadowAtoms('dialog')).toHaveLength(1);
    expect(shadowAtoms('dialog')[0]).toMatch(/^_bxsh-0px12px24px/);
    expect(paintedShadow('dialog')).toContain('12px 24px');
    expect(shadowAtoms('dialog')).not.toEqual(shadowAtoms('control'));
  });

  it('AlertDialogContent wears the same ladder stop as DialogContent — one dialog row, one distance', () => {
    // Tamagui's AlertDialog.Content IS Dialog.Content, and the reference
    // carries a single dialog row. confirm-dialog-{destructive,gated,warning}
    // render through this frame.
    renderDialogsBesideAButton('large');
    expect(paintedShadow('alertdialog')).toBe(dialogStopPaint);
    expect(paintedShadow('alertdialog')).toBe(paintedShadow('dialog'));
  });

  it('dark inverts the hue and keeps the reference geometry; the ground steps up the ramp', () => {
    renderWithProviders(
      <Theme name="dark">
        <Preset overrides={{ elevation: 'large' }}>
          <Dialog modal open>
            <Dialog.Portal>
              <DialogContent testID="dialog">dialog</DialogContent>
            </Dialog.Portal>
          </Dialog>
        </Preset>
      </Theme>,
    );
    // Dark elevation tint: light-coloured shadow, never a black umbra.
    expect(paintedShadow('dialog')).toBe(dialogStopPaintDark);
    expect(paintedShadow('dialog')).not.toMatch(/rgba\(0,\s*0,\s*0/);
    // resolveKnobs owns the dark ground: `overlayFill` steps the filled rest
    // fill up the ramp under dark + elevation.
    expect(bgAtoms('dialog')).toEqual(['_bg-color4']);
  });
});
