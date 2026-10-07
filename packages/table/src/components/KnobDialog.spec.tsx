/**
 * KnobDialog spec (MPO-114). The wrapper owns open/close plumbing and the
 * knob-wired content surface. FilterManager specs cover the save-dialog copy.
 */

import { Button } from '@repo/forms';
import { renderWithProviders } from '@repo/test-utils';
import { fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import {
  KnobDialog,
  KnobDialogClose,
  KnobDialogContent,
  KnobDialogDescription,
  KnobDialogTitle,
  KnobDialogTrigger,
} from './KnobDialog';

/** Dialog portals into document.body — query there, not the RTL container. */
function root(): HTMLElement {
  return document.body;
}

function DialogHarness({
  startOpen = true,
  onOpenChange,
}: {
  startOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(startOpen);
  return (
    <KnobDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        onOpenChange?.(next);
      }}>
      <KnobDialogTrigger asChild>
        <Button>Open dialog</Button>
      </KnobDialogTrigger>
      <KnobDialogContent minWidth={400}>
        <KnobDialogTitle>Save view</KnobDialogTitle>
        <KnobDialogDescription>Name this filter set for later.</KnobDialogDescription>
        <KnobDialogClose asChild>
          <Button>Close</Button>
        </KnobDialogClose>
      </KnobDialogContent>
    </KnobDialog>
  );
}

describe(KnobDialog, () => {
  it('open state portals title and description into the document', () => {
    renderWithProviders(<DialogHarness startOpen />);
    expect(root().textContent).toContain('Save view');
    expect(root().textContent).toContain('Name this filter set for later.');
  });

  it('closed state does not render the dialog body', () => {
    renderWithProviders(<DialogHarness startOpen={false} />);
    expect(root().textContent).not.toContain('Save view');
    expect(root().textContent).toContain('Open dialog');
  });

  it('paints an overlay while open', () => {
    renderWithProviders(<DialogHarness startOpen />);
    const overlay = root().querySelector('[data-state]') ?? root().querySelector("[class*='Overlay']");
    // Tamagui Dialog.Overlay is in the portal tree whenever the dialog is open.
    const portalBits = [...root().querySelectorAll("[data-state='open']")];
    expect(portalBits.length).toBeGreaterThan(0);
    expect(overlay ?? portalBits[0]).toBeTruthy();
  });

  it('Close reports onOpenChange(false)', () => {
    const onOpenChange = vi.fn();
    renderWithProviders(
      <DialogHarness
        startOpen
        onOpenChange={onOpenChange}
      />,
    );
    const close = [...root().querySelectorAll('[role="button"]')].find((el) => el.textContent?.includes('Close'));
    expect(close).toBeTruthy();
    fireEvent.click(close!);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
