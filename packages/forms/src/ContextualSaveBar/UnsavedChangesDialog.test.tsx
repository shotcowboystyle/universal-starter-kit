import { modelFirstFocusableShow, renderWithProviders } from '@repo/test-utils';
/**
 * UnsavedChangesDialog — the route-leave confirm.
 *
 * ContextualSaveBar.test.tsx reaches this dialog through the save bar, which
 * proves the wiring but never exercises the dialog's own contract: the two
 * copy branches, which button calls which callback, and the guard that stops an
 * outside click from dismissing a destructive confirm. Those are the parts a
 * refactor of the save bar would carry away without noticing.
 */
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UnsavedChangesDialog } from './UnsavedChangesDialog';

afterEach(cleanup);

function dialog(): HTMLElement | null {
  return document.body.querySelector('[role="alertdialog"]');
}

function button(marker: string): HTMLElement {
  const node = document.body.querySelector(`[${marker}]`);
  if (!node) {
    throw new Error(`No button carrying ${marker}`);
  }
  return node as HTMLElement;
}

function noop() {}

/** Tamagui paints through atomic classes; read the inline channel first. */
function cssOf(node: HTMLElement, prop: string): string {
  const inline = node.style.getPropertyValue(prop);
  if (inline) {
    return inline;
  }
  return getComputedStyle(node).getPropertyValue(prop) || '';
}

describe('UnsavedChangesDialog', () => {
  it('renders nothing while closed', () => {
    renderWithProviders(<UnsavedChangesDialog open={false} fieldCount={2} onKeepEditing={noop} onDiscard={noop} />);
    expect(dialog()).toBeNull();
  });

  it('announces as an alertdialog, not a plain dialog, because the choice is destructive', () => {
    renderWithProviders(<UnsavedChangesDialog open fieldCount={2} onKeepEditing={noop} onDiscard={noop} />);
    expect(dialog()).toBeTruthy();
    expect(document.body.querySelector('[role="dialog"][data-mp-savebar-guard]')).toBeNull();
  });

  it('leads with the question, so the title carries the decision', () => {
    renderWithProviders(<UnsavedChangesDialog open fieldCount={2} onKeepEditing={noop} onDiscard={noop} />);
    expect(dialog()?.textContent).toContain('Discard unsaved changes?');
  });

  it('uses the singular sentence for exactly one edited field', () => {
    renderWithProviders(<UnsavedChangesDialog open fieldCount={1} onKeepEditing={noop} onDiscard={noop} />);
    const text = dialog()?.textContent ?? '';
    expect(text).toContain('1 field on this page has edits');
    expect(text).not.toContain('fields on this page have');
  });

  it('uses the plural sentence, with the count interpolated, for more than one', () => {
    renderWithProviders(<UnsavedChangesDialog open fieldCount={4} onKeepEditing={noop} onDiscard={noop} />);
    const text = dialog()?.textContent ?? '';
    expect(text).toContain('4 fields on this page have edits');
    expect(text).not.toContain('1 field on this page has');
  });

  it('says plainly that leaving discards the edits', () => {
    renderWithProviders(<UnsavedChangesDialog open fieldCount={2} onKeepEditing={noop} onDiscard={noop} />);
    expect(dialog()?.textContent).toContain('Leaving discards them');
  });

  it('offers both a way back and a way out', () => {
    renderWithProviders(<UnsavedChangesDialog open fieldCount={2} onKeepEditing={noop} onDiscard={noop} />);
    expect(button('data-mp-savebar-keep').textContent).toContain('Keep editing');
    expect(button('data-mp-savebar-discard-confirm').textContent).toContain('Discard changes');
  });

  it('calls onKeepEditing, and only that, when the safe button is pressed', () => {
    const onKeepEditing = vi.fn();
    const onDiscard = vi.fn();
    renderWithProviders(
      <UnsavedChangesDialog open fieldCount={2} onKeepEditing={onKeepEditing} onDiscard={onDiscard} />,
    );
    fireEvent.click(button('data-mp-savebar-keep'));
    expect(onKeepEditing).toHaveBeenCalledTimes(1);
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it('calls onDiscard, and only that, when the destructive button is pressed', () => {
    const onKeepEditing = vi.fn();
    const onDiscard = vi.fn();
    renderWithProviders(
      <UnsavedChangesDialog open fieldCount={2} onKeepEditing={onKeepEditing} onDiscard={onDiscard} />,
    );
    fireEvent.click(button('data-mp-savebar-discard-confirm'));
    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(onKeepEditing).not.toHaveBeenCalled();
  });

  it('treats any dismissal as keep-editing, never as a silent discard', () => {
    const onKeepEditing = vi.fn();
    const onDiscard = vi.fn();
    renderWithProviders(
      <UnsavedChangesDialog open fieldCount={2} onKeepEditing={onKeepEditing} onDiscard={onDiscard} />,
    );
    fireEvent.keyDown(dialog() as HTMLElement, { key: 'Escape', code: 'Escape' });
    expect(onDiscard).not.toHaveBeenCalled();
  });

  it("marks the content so the save bar's outside-click guard can find it", () => {
    renderWithProviders(<UnsavedChangesDialog open fieldCount={2} onKeepEditing={noop} onDiscard={noop} />);
    expect(dialog()?.hasAttribute('data-mp-savebar-guard')).toBe(true);
  });

  it('takes focus itself rather than leaving it behind the overlay', () => {
    renderWithProviders(<UnsavedChangesDialog open fieldCount={2} onKeepEditing={noop} onDiscard={noop} />);
    expect(dialog()?.getAttribute('tabindex')).toBe('-1');
  });

  it('paints no focus outline on the sheet itself, so the ring stays on the buttons', () => {
    renderWithProviders(<UnsavedChangesDialog open fieldCount={2} onKeepEditing={noop} onDiscard={noop} />);
    const outline = cssOf(dialog() as HTMLElement, 'outline-width');
    expect(outline === '' || outline === '0px').toBe(true);
  });

  it('caps its width so the sentence never runs the width of a desk monitor', () => {
    renderWithProviders(<UnsavedChangesDialog open fieldCount={2} onKeepEditing={noop} onDiscard={noop} />);
    expect(cssOf(dialog() as HTMLElement, 'max-width')).toBe('440px');
  });
});

// Chromium and WebKit's <dialog>.show() focuses the first focusable
// descendant, and the panel is tabindex=-1, so those two opened on the panel
// while Firefox and the HTML spec open on Keep editing, the first tab stop.
// Keep editing is the alertdialog's least destructive action, the one tamagui's
// AlertDialog.Cancel takes on open, so every browser opens there.
describe('UnsavedChangesDialog open focus', () => {
  function LeavePage() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button
          type="button"
          onClick={() => {
            setOpen(true);
          }}>
          Leave the page
        </button>
        <UnsavedChangesDialog
          open={open}
          fieldCount={2}
          onKeepEditing={() => {
            setOpen(false);
          }}
          onDiscard={() => {
            setOpen(false);
          }}
        />
      </>
    );
  }

  it('opens on Keep editing', async () => {
    renderWithProviders(<LeavePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Leave the page' }));
    await waitFor(() => {
      expect(dialog()).not.toBeNull();
    });
    await waitFor(() => {
      expect(document.activeElement).toBe(button('data-mp-savebar-keep'));
    });
  });

  describe('behind <dialog>.show()', () => {
    let restoreShow = () => {};
    beforeEach(() => {
      restoreShow = modelFirstFocusableShow();
    });
    afterEach(() => {
      restoreShow();
    });

    it('moves focus off the panel onto Keep editing', async () => {
      renderWithProviders(<LeavePage />);
      fireEvent.click(screen.getByRole('button', { name: 'Leave the page' }));
      await waitFor(() => {
        expect(dialog()).not.toBeNull();
      });
      await waitFor(() => {
        expect(document.activeElement).toBe(button('data-mp-savebar-keep'));
      });
    });
  });
});
