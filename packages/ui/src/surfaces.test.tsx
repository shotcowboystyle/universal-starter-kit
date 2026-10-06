import { readFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { Input } from '@repo/forms';
import { modelFirstFocusableShow, renderWithProviders } from '@repo/test-utils';
import { Preset } from '@repo/theme';
import type { Knobs } from '@repo/theme';
import { defaultConfig } from '@tamagui/config/v5';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AlertDialog, Card as TamaguiCard, createTamagui, Dialog, Popover, Sheet, TamaguiProvider } from 'tamagui';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Button } from './Button';
import {
  Card,
  CardFooter,
  CardHeader,
  DialogContent,
  DialogShowFocus,
  AlertDialogContent,
  AlertDialogOverlay,
  KnobCard,
  KnobDialogContent,
  KnobPanel,
  KnobPopoverContent,
  KnobSheetFrame,
  Panel,
  PopoverContent,
  SheetFrame,
} from './surfaces';

import {
  AlertDialogContent as PkgAlertDialogContent,
  AlertDialogOverlay as PkgAlertDialogOverlay,
  Card as PkgCard,
  CardFooter as PkgCardFooter,
  CardHeader as PkgCardHeader,
  DialogContent as PkgDialogContent,
  KnobCard as PkgKnobCard,
  KnobPanel as PkgKnobPanel,
  Panel as PkgPanel,
  PopoverContent as PkgPopoverContent,
  SheetFrame as PkgSheetFrame,
} from './index';

describe('surfaces package exports', () => {
  afterEach(cleanup);

  it('package Card is the themed surface, not the tamagui primitive', () => {
    expect(PkgCard).toBe(Card);
    expect(PkgCard).not.toBe(TamaguiCard);
  });

  it('package statics resolve to the themed header/footer', () => {
    expect(PkgCard.Header).toBe(CardHeader);
    expect(PkgCard.Footer).toBe(CardFooter);
    expect(PkgCardHeader).toBe(CardHeader);
    expect(PkgCardFooter).toBe(CardFooter);
  });

  it('package DialogContent/PopoverContent/SheetFrame/Panel are the themed surfaces', () => {
    expect(PkgDialogContent).toBe(DialogContent);
    expect(PkgDialogContent).not.toBe(Dialog.Content);
    expect(PkgPopoverContent).toBe(PopoverContent);
    expect(PkgPopoverContent).not.toBe(Popover.Content);
    expect(PkgSheetFrame).toBe(SheetFrame);
    expect(PkgSheetFrame).not.toBe(Sheet.Frame);
    expect(PkgPanel).toBe(Panel);
    expect(PkgAlertDialogContent).toBe(AlertDialogContent);
    expect(PkgAlertDialogOverlay).toBe(AlertDialogOverlay);
  });

  // oxlint-disable typescript/no-deprecated -- this test exists to prove the deprecated Knob* aliases still resolve
  it('deprecated Knob* aliases still point at the renamed components', () => {
    expect(KnobCard).toBe(Card);
    expect(KnobDialogContent).toBe(DialogContent);
    expect(KnobPopoverContent).toBe(PopoverContent);
    expect(KnobSheetFrame).toBe(SheetFrame);
    expect(KnobPanel).toBe(Panel);
    expect(PkgKnobCard).toBe(Card);
    expect(PkgKnobPanel).toBe(Panel);
  });
  // oxlint-enable typescript/no-deprecated
});

describe('SheetFrame overlay chrome', () => {
  afterEach(cleanup);

  it('binds elevatedSurface, $background, and transition — not surface-without-elevation', () => {
    const src = readFileSync(path.join(import.meta.dirname, 'surfaces.tsx'), 'utf-8');
    const start = src.indexOf('// ── SheetFrame');
    const end = src.indexOf('// ── SheetModal');
    const sheet = src.slice(start, end);
    expect(sheet).toContain('elevatedSurface');
    expect(sheet).toMatch(/backgroundColor: ['"]\$background['"]/u);
    expect(sheet).toContain('knobProps.transition');
    expect(sheet).toContain('containerRadius');
    expect(sheet).not.toContain('knobProps.surface');
    expect(sheet).not.toMatch(/#[0-9A-Fa-f]{3,8}/u);
  });
});

describe('DialogContent overlay elevation', () => {
  afterEach(cleanup);

  it('binds the overlay ladder through elevatedSurface with elevate=false, and hardcodes no shadow', () => {
    const src = readFileSync(path.join(import.meta.dirname, 'surfaces.tsx'), 'utf-8');
    const start = src.indexOf('// ── DialogContent');
    const end = src.indexOf('// ── DialogOverlay');
    const dialog = src.slice(start, end);
    expect(dialog).toContain('elevate={false}');
    expect(dialog).not.toContain('overlayElevationShadow');
    expect(dialog).not.toContain('rgba(0,0,0,0.12)');
    expect(dialog).toContain('elevatedSurface');
    expect(dialog).toContain('containerRadius');
    expect(dialog).toContain('panelPadding');
  });
});

// ── Render proofs ────────────────────────────────────────────────────────
//
// The source-text assertions above prove the CALL SITE. These prove the
// FRAME, which is the distinction earlier fixes all fell through:
// a fragment that exists in source and dies on the way to the frame reads
// identical to one that never existed.
//
// happy-dom cannot cascade Tamagui's class CSS, so — as in Button.test.tsx —
// these read the atomic classes the knob emits. The atom name is hashed from
// the VALUE, so the class IS the value, and no theme config is needed: what
// the fragment addresses is visible in the class name itself.
//
// Measured both ways on 2026-09-01 by reverting each defect in the working
// tree and re-running (see the MR description):
//
//   surface addressing   defect `$color1`  -> `_bg-color1`
//                        fixed  `$background` -> `_bg-background`
//   dialog elevation     defect Button/control `$1` -> `_bxsh-0px1px2px…`
//                        fixed  reference           -> `_bxsh-0px12px24px…`
//
// The reference value is the overlay ladder's `$5` stop, which the
// dialog reaches at elevation large; the control paints `$4` there.
//
// A "differs from the Button" assertion does NOT discriminate: the Button
// paints `0 6px 12px` from its own source in both states, so that comparison
// passes with the defect present. Assert against the CONTROL stop.

const atomsWithPrefix = (el: Element | null, prefix: string): string[] => {
  if (!el) {
    return [];
  }
  return (el as HTMLElement).className
    .split(/\s+/u)
    .filter((c) => c.startsWith(prefix))
    .toSorted();
};

/** The `$4` control paint at elevation large — `webShadowLight.$4`, "0 10px 20px …". */
const controlStopShadowAtom = /^_bxsh-0px10px20px/u;
/** The `$5` overlay stop at elevation large — reference dialog shadow, "0 12px 24px …". */
const overlayStopShadowAtom = /^_bxsh-0px12px24px/u;

describe('surfaces address $background at the FRAME', () => {
  afterEach(cleanup);

  it('Card, Panel and DialogContent all paint _bg-background, never a raw ramp step', () => {
    renderWithProviders(
      <Preset>
        <Card testID="mpo-card">card</Card>
        <Panel testID="mpo-panel">panel</Panel>
        <Dialog
          modal
          open>
          <Dialog.Portal>
            <DialogContent testID="mpo-dialog">dialog</DialogContent>
          </Dialog.Portal>
        </Dialog>
      </Preset>,
    );

    for (const id of ['mpo-card', 'mpo-panel', 'mpo-dialog']) {
      const frame = document.querySelector(`[data-testid="${id}"]`);
      expect(frame, `${id} frame`).toBeTruthy();
      const bg = atomsWithPrefix(frame, '_bg-');
      expect(bg, `${id} background atom`).toStrictEqual(['_bg-background']);
      expect(bg.join(' '), `${id} must not address a raw ramp step`).not.toMatch(/_bg-color[12]\b/u);
    }
  });
});

describe('DialogContent paints the OVERLAY elevation stop, not the control one', () => {
  afterEach(cleanup);

  it('renders the reference shadow at elevation large and not the Button $4 stop', () => {
    renderWithProviders(
      <Preset overrides={{ elevation: 'large' }}>
        <Button testID="mpo-button-control">Save</Button>
        <Dialog
          modal
          open>
          <Dialog.Portal>
            <DialogContent testID="mpo-dialog-overlay">body</DialogContent>
          </Dialog.Portal>
        </Dialog>
      </Preset>,
    );

    const dialog = document.querySelector('[data-testid="mpo-dialog-overlay"]');
    const button = document.querySelector('[data-testid="mpo-button-control"]');
    expect(dialog, 'DialogContent frame').toBeTruthy();
    expect(button, 'Button frame').toBeTruthy();

    const dialogShadow = atomsWithPrefix(dialog, '_bxsh-');
    expect(dialogShadow, 'DialogContent paints exactly one shadow atom').toHaveLength(1);
    expect(dialogShadow[0], 'dialog wears the §8 overlay shadow').toMatch(overlayStopShadowAtom);
    expect(dialogShadow[0], 'dialog must not wear the $4 control stop').not.toMatch(controlStopShadowAtom);
    expect(dialogShadow, 'dialog and control are different distances off the surface').not.toStrictEqual(
      atomsWithPrefix(button, '_bxsh-'),
    );
  });
});

// ── Overlay child-clip cap ───────────────────────────────────────────────
//
// Axiom 1 CLIP files "children positioned toward the corners (Card, Panel,
// Dialog)" under R-SCALE + clip cap: radius rides the scale, capped by the
// container's own padding. R-SCALE is the immunity axis, CONTAINER-CAP the
// resolution axis — a rule naming only R-SCALE is
// not a second ruling. `elevatedSurface` carries the UNCAPPED scale token,
// so each padded overlay must spread `containerRadius` AFTER it; four did
// and PopoverContent did not, rendering a 50px corner on an 18px inset.

const noop = () => {};

const recordAndPrevent = (seen: boolean[]) => (event: Event) => {
  seen.push(event.defaultPrevented);
  event.preventDefault();
};

const focusSaveInstead = (event: Event) => {
  event.preventDefault();
  screen.getByRole('button', { name: 'Save' }).focus();
};

const overlayCapConfig = createTamagui(defaultConfig);

const overlayCapCorners = [
  'borderTopLeftRadius',
  'borderTopRightRadius',
  'borderBottomRightRadius',
  'borderBottomLeftRadius',
] as const;

const overlayCapCases = Object.entries({ medium: 9, large: 16, full: 50 }).flatMap(([borderRadius, stop]) =>
  Object.entries({ small: 13, medium: 18, large: 32 }).map(([space, inset]) => ({
    borderRadius,
    space,
    cappedPx: `${Math.min(stop, inset)}px`,
  })),
);

describe('overlay containers take the Axiom 1 child-clip cap', () => {
  afterEach(cleanup);

  it('PopoverContent spreads containerRadius after elevatedSurface, as its four siblings do', () => {
    const src = readFileSync(path.join(import.meta.dirname, 'surfaces.tsx'), 'utf-8');
    const popover = src.slice(src.indexOf('// ── PopoverContent'), src.indexOf('// ── SheetFrame'));
    const elevated = popover.indexOf('knobProps.elevatedSurface');
    const capped = popover.indexOf('knobProps.containerRadius');
    expect(elevated, 'PopoverContent binds elevatedSurface').toBeGreaterThan(-1);
    expect(capped, 'PopoverContent binds containerRadius').toBeGreaterThan(-1);
    expect(capped, 'the cap must spread AFTER the uncapped scale token').toBeGreaterThan(elevated);
  });

  it.each(overlayCapCases)(
    'caps every overlay frame at $cappedPx for borderRadius=$borderRadius/space=$space',
    ({ borderRadius, space, cappedPx }) => {
      render(
        <TamaguiProvider
          config={overlayCapConfig}
          defaultTheme="light">
          <Preset
            overrides={{
              borderRadius: borderRadius as Knobs['borderRadius'],
              space: space as Knobs['space'],
              density: 'comfortable',
            }}>
            <Dialog
              modal
              open>
              <Dialog.Portal>
                <DialogContent testID="cap-dialog">dialog</DialogContent>
              </Dialog.Portal>
            </Dialog>
            <AlertDialog
              modal
              open>
              <AlertDialog.Portal>
                <AlertDialogContent testID="cap-alertdialog">alert</AlertDialogContent>
              </AlertDialog.Portal>
            </AlertDialog>
            <Popover open>
              <PopoverContent testID="cap-popover">popover</PopoverContent>
            </Popover>
            <Sheet open>
              <SheetFrame testID="cap-sheet">sheet</SheetFrame>
            </Sheet>
            <Panel testID="cap-panel">panel</Panel>
          </Preset>
        </TamaguiProvider>,
      );

      for (const id of ['cap-dialog', 'cap-alertdialog', 'cap-popover', 'cap-sheet', 'cap-panel']) {
        const frame = document.querySelector(`[data-testid="${id}"]`);
        expect(frame, `${id} frame`).toBeTruthy();
        const style = getComputedStyle(frame!);
        for (const corner of overlayCapCorners) {
          expect(style[corner], `${id} ${corner}`).toBe(cappedPx);
        }
      }
    },
  );
});

// Tamagui's FocusScope checks "focus already inside?" before an idle
// wait of up to 200 ms, then focuses the first tabbable that does not hold
// focus. A click into the name field during that wait had focus moved on to
// the Save button, so every keystroke after it missed the field.
const SaveAsPopover = () => (
  <Popover>
    <Popover.Trigger asChild>
      <button type="button">Save As</button>
    </Popover.Trigger>
    <PopoverContent>
      <input aria-label="Report name" />
      <button type="button">Save</button>
    </PopoverContent>
  </Popover>
);

describe('PopoverContent open focus', () => {
  afterEach(cleanup);

  it('keeps focus on a field focused right after open', async () => {
    renderWithProviders(<SaveAsPopover />);
    fireEvent.click(screen.getByRole('button', { name: 'Save As' }));
    const field = await waitFor(() => screen.getByLabelText('Report name'));
    field.focus();
    expect(document.activeElement).toBe(field);
    await sleep(300);
    expect(document.activeElement).toBe(field);
  });

  it('focuses the first tabbable on open', async () => {
    renderWithProviders(<SaveAsPopover />);
    fireEvent.click(screen.getByRole('button', { name: 'Save As' }));
    const field = await waitFor(() => screen.getByLabelText('Report name'));
    await waitFor(() => {
      expect(document.activeElement).toBe(field);
    });
  });
});

// DialogContent mounts the same FocusScope. In browsers its native
// <dialog>.show() focuses inside first; jsdom has no show(), so the deferred
// pass ran and moved focus off a field focused right after open.
const RenameDialog = ({ onOpenAutoFocus }: { onOpenAutoFocus?: (event: Event) => void }) => (
  <Dialog modal>
    <Dialog.Trigger asChild>
      <button type="button">Rename</button>
    </Dialog.Trigger>
    <Dialog.Portal>
      <DialogContent onOpenAutoFocus={onOpenAutoFocus}>
        <input aria-label="Name" />
        <input aria-label="Notes" />
        <button type="button">Save</button>
      </DialogContent>
    </Dialog.Portal>
  </Dialog>
);

describe('DialogContent open focus', () => {
  afterEach(cleanup);

  it.each(['Name', 'Notes'])('keeps focus on the %s field focused right after open', async (label) => {
    renderWithProviders(<RenameDialog />);
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const field = await waitFor(() => screen.getByLabelText(label));
    field.focus();
    expect(document.activeElement).toBe(field);
    await sleep(300);
    expect(document.activeElement).toBe(field);
  });

  it('focuses the first tabbable on open', async () => {
    renderWithProviders(<RenameDialog />);
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const field = await waitFor(() => screen.getByLabelText('Name'));
    await waitFor(() => {
      expect(document.activeElement).toBe(field);
    });
  });

  it("runs the caller's onOpenAutoFocus first and lets it opt out", async () => {
    const seen: boolean[] = [];
    renderWithProviders(<RenameDialog onOpenAutoFocus={recordAndPrevent(seen)} />);
    const trigger = screen.getByRole('button', { name: 'Rename' });
    trigger.focus();
    fireEvent.click(trigger);
    await waitFor(() => screen.getByLabelText('Name'));
    await sleep(300);
    expect(seen).toStrictEqual([false]);
    expect(document.activeElement).toBe(trigger);
  });
});

// AlertDialogContent needs no house handler: tamagui's AlertDialog.Content
// prevents the FocusScope open pass and focuses its Cancel action in the same
// step, so there is no deferred focus to race.
const RenameAlertDialog = () => (
  <AlertDialog>
    <AlertDialog.Trigger asChild>
      <button type="button">Rename</button>
    </AlertDialog.Trigger>
    <AlertDialog.Portal>
      <AlertDialogContent>
        <input aria-label="Name" />
        <AlertDialog.Cancel asChild>
          <button type="button">Cancel</button>
        </AlertDialog.Cancel>
        <button type="button">Save</button>
      </AlertDialogContent>
    </AlertDialog.Portal>
  </AlertDialog>
);

describe('AlertDialogContent open focus', () => {
  afterEach(cleanup);

  it('focuses its Cancel action on open', async () => {
    renderWithProviders(<RenameAlertDialog />);
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const cancel = await waitFor(() => screen.getByText('Cancel'));
    await waitFor(() => {
      expect(document.activeElement).toBe(cancel);
    });
  });

  it('keeps focus on a field focused right after open', async () => {
    renderWithProviders(<RenameAlertDialog />);
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const field = await waitFor(() => screen.getByLabelText('Name'));
    field.focus();
    await sleep(300);
    expect(document.activeElement).toBe(field);
  });
});

// In Chromium and WebKit, <dialog>.show() focuses the first focusable
// descendant, a tabindex=-1 frame included, where Firefox and the HTML spec
// take the first tab stop. The house Input's group frame is tabindex=-1, so it
// took focus, FocusScope then saw focus inside and never ran the open focus,
// and typing went nowhere. jsdom has no show(), so modelFirstFocusableShow
// stands in for Chromium's.

const NameDialog = ({
  helpFirst,
  onOpenAutoFocus,
}: {
  helpFirst?: boolean;
  onOpenAutoFocus?: (event: Event) => void;
}) => (
  <Dialog modal>
    <Dialog.Trigger asChild>
      <button type="button">Rename</button>
    </Dialog.Trigger>
    <Dialog.Portal>
      <DialogContent onOpenAutoFocus={onOpenAutoFocus}>
        {helpFirst ? <button type="button">Help</button> : null}
        <Input inputProps={{ 'aria-label': 'Name' }} />
        <button type="button">Save</button>
      </DialogContent>
    </Dialog.Portal>
  </Dialog>
);

describe('DialogContent open focus behind <dialog>.show()', () => {
  let restoreShow = noop;
  beforeEach(() => {
    restoreShow = modelFirstFocusableShow();
  });
  afterEach(() => {
    restoreShow();
    cleanup();
  });

  it("moves focus off the house Input's group frame onto its field", async () => {
    renderWithProviders(<NameDialog />);
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const field = await waitFor(() => screen.getByLabelText('Name'));
    expect(field.closest("[tabindex='-1']")).not.toBeNull();
    await waitFor(() => {
      expect(document.activeElement).toBe(field);
    });
  });

  it("runs the caller's onOpenAutoFocus, which can pick another target", async () => {
    renderWithProviders(<NameDialog onOpenAutoFocus={focusSaveInstead} />);
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const save = await waitFor(() => screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(document.activeElement).toBe(save);
    });
  });

  it('leaves focus on a tab stop the browser picked', async () => {
    renderWithProviders(<NameDialog helpFirst />);
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const help = await waitFor(() => screen.getByRole('button', { name: 'Help' }));
    await sleep(300);
    expect(document.activeElement).toBe(help);
  });
});

describe('AlertDialogContent open focus behind <dialog>.show()', () => {
  let restoreShow = noop;
  beforeEach(() => {
    restoreShow = modelFirstFocusableShow();
  });
  afterEach(() => {
    restoreShow();
    cleanup();
  });

  it("moves focus off the house Input's group frame onto its field", async () => {
    renderWithProviders(
      <AlertDialog>
        <AlertDialog.Trigger asChild>
          <button type="button">Rename</button>
        </AlertDialog.Trigger>
        <AlertDialog.Portal>
          <AlertDialogContent>
            <Input inputProps={{ 'aria-label': 'Name' }} />
            <AlertDialog.Cancel asChild>
              <button type="button">Cancel</button>
            </AlertDialog.Cancel>
          </AlertDialogContent>
        </AlertDialog.Portal>
      </AlertDialog>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
    const field = await waitFor(() => screen.getByLabelText('Name'));
    expect(field.closest("[tabindex='-1']")).not.toBeNull();
    await waitFor(() => {
      expect(document.activeElement).toBe(field);
    });
  });
});

describe('DialogShowFocus in a raw Dialog.Content', () => {
  let restoreShow = noop;
  beforeEach(() => {
    restoreShow = modelFirstFocusableShow();
  });
  afterEach(() => {
    restoreShow();
    cleanup();
  });

  it("moves focus off the house Input's group frame onto its field", async () => {
    renderWithProviders(
      <Dialog modal>
        <Dialog.Trigger asChild>
          <button type="button">Save Filter</button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Content>
            <Input inputProps={{ 'aria-label': 'Filter Name' }} />
            <button type="button">Save</button>
            <DialogShowFocus />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save Filter' }));
    const field = await waitFor(() => screen.getByLabelText('Filter Name'));
    expect(field.closest("[tabindex='-1']")).not.toBeNull();
    await waitFor(() => {
      expect(document.activeElement).toBe(field);
    });
  });
});
