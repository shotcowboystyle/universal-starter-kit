import { renderWithProviders } from '@repo/test-utils';
import { __resetDevWarnSeen } from '@repo/theme';
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { SizableText } from 'tamagui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetToasts } from '../Toast/store';

import { ConfirmDialog } from './ConfirmDialog';
import { getFeedback, resetFeedback } from './store';

import { notify, NotifyHost, NotifyRegion } from './index';

afterEach(() => {
  resetFeedback();
  resetToasts();
});

/** Dialog portals into document.body — query there, not the RTL container. */
function root(): HTMLElement {
  return document.body;
}

function buttonByLabel(label: string): Element {
  const buttons = Array.from(root().querySelectorAll('[role="button"]'));
  const match = buttons.find((b) => b.textContent?.includes(label));
  if (!match) {
    throw new Error(`No button with label "${label}"`);
  }
  return match;
}

function alertdialog(): Element | null {
  return root().querySelector('[role="alertdialog"]');
}

describe('ConfirmDialog', () => {
  it("inks a disabled destructive label on the error hue's $color12 text step", () => {
    renderWithProviders(
      <ConfirmDialog
        open
        destructive
        confirmDisabled
        confirmDisabledReason="Type the project name"
        title="Delete project?"
        confirmLabel="Delete"
      />,
    );
    const button = buttonByLabel('Delete');
    const label = Array.from(button.querySelectorAll('span')).find((node) => node.textContent === 'Delete');
    expect(label).toBeTruthy();
    expect(label?.className).toContain('_col-color12');
    expect(label?.className).toContain('_fow-400');
  });

  it('renders title, body, confirm, and cancel', () => {
    renderWithProviders(
      <ConfirmDialog
        open
        title="Delete customer?"
        body="This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
      />,
    );
    expect(alertdialog()).toBeTruthy();
    expect(root().textContent).toContain('Delete customer?');
    expect(root().textContent).toContain('This cannot be undone.');
    expect(buttonByLabel('Delete')).toBeTruthy();
    expect(buttonByLabel('Cancel')).toBeTruthy();
  });

  it('calls onConfirm and closes on confirm press', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const onOpenChange = vi.fn();
    renderWithProviders(
      <ConfirmDialog
        open
        title="Confirm"
        body="Proceed?"
        confirmLabel="Yes"
        onConfirm={onConfirm}
        onCancel={onCancel}
        onOpenChange={onOpenChange}
      />,
    );
    fireEvent.click(buttonByLabel('Yes'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('calls onCancel on cancel press (not onConfirm)', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const onOpenChange = vi.fn();
    renderWithProviders(
      <ConfirmDialog
        open
        title="Confirm"
        body="Proceed?"
        onConfirm={onConfirm}
        onCancel={onCancel}
        onOpenChange={onOpenChange}
      />,
    );
    fireEvent.click(buttonByLabel('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('Escape cancels', async () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <ConfirmDialog
          open={open}
          onOpenChange={setOpen}
          title="Leave?"
          body="Edits will be lost."
          onCancel={onCancel}
          onConfirm={onConfirm}
        />
      );
    }
    renderWithProviders(<Harness />);
    expect(alertdialog()).toBeTruthy();

    // Prefer targeting the dismissable content; fall back to document.
    const target = alertdialog() ?? document;
    fireEvent.keyDown(target, { key: 'Escape', code: 'Escape', keyCode: 27 });

    await waitFor(() => {
      expect(onCancel).toHaveBeenCalled();
    });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('destructive confirm sets data-tone=destructive', () => {
    renderWithProviders(<ConfirmDialog open title="Delete?" body="Permanent." confirmLabel="Delete" destructive />);
    expect(alertdialog()?.getAttribute('data-tone')).toBe('destructive');
  });

  it('warning confirm sets data-tone=warning', () => {
    renderWithProviders(<ConfirmDialog open title="Leave?" body="Unsaved." warning confirmLabel="Leave" />);
    expect(alertdialog()?.getAttribute('data-tone')).toBe('warning');
  });

  it('sets aria-modal on the alertdialog (focus-trap host)', () => {
    renderWithProviders(<ConfirmDialog open title="Modal?" body="Trap focus here." />);
    const dialog = alertdialog();
    expect(dialog).toBeTruthy();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
  });

  it('parks pointer-origin open on the panel, not a control', async () => {
    renderWithProviders(
      <ConfirmDialog open title="Leave this page?" body="Edits will be discarded." confirmLabel="Continue" />,
    );
    const dialog = alertdialog();
    expect(dialog).toBeTruthy();
    expect(dialog?.getAttribute('tabindex')).toBe('-1');

    await waitFor(() => {
      const active = document.activeElement;
      expect(active).toBeTruthy();
      // wasKeyboardFocus is pinned false in test-utils — park on the frame.
      expect(active === dialog || dialog?.contains(active)).toBe(true);
      if (active && active !== dialog) {
        expect(active.getAttribute('role')).not.toBe('button');
      }
    });
  });

  it('focuses a body text field on open (typed-confirm text entry)', async () => {
    renderWithProviders(
      <ConfirmDialog open title="Delete project?" confirmLabel="Delete" destructive>
        <input aria-label="Project name" />
      </ConfirmDialog>,
    );
    await waitFor(() => {
      const field = root().querySelector('input[aria-label="Project name"]');
      expect(document.activeElement).toBe(field);
    });
  });
});

describe('ConfirmDialog action rules', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetDevWarnSeen();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    __resetDevWarnSeen();
  });

  it('cancel stays enabled while confirm is disabled', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    renderWithProviders(
      <ConfirmDialog
        open
        title="Delete project?"
        body="Type the name to confirm."
        confirmLabel="Delete"
        confirmDisabled
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    const confirmBtn = buttonByLabel('Delete');
    expect(confirmBtn.getAttribute('data-mp-confirm-disabled')).toBe('true');
    fireEvent.click(confirmBtn);
    expect(onConfirm).not.toHaveBeenCalled();

    const cancelBtn = buttonByLabel('Cancel');
    expect(cancelBtn.getAttribute('aria-disabled')).not.toBe('true');
    expect(cancelBtn.getAttribute('data-mp-cancel-disabled-ignored')).toBeNull();
    fireEvent.click(cancelBtn);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('cancel-disabled'));
  });

  it('ignores cancelDisabled: cancel still cancels + cancel-disabled DEV warn', () => {
    const onCancel = vi.fn();
    renderWithProviders(
      <ConfirmDialog
        open
        title="Delete project?"
        body="Type the name to confirm."
        confirmLabel="Delete"
        confirmDisabled
        cancelDisabled
        onCancel={onCancel}
      />,
    );
    const cancelBtn = buttonByLabel('Cancel');
    expect(cancelBtn.getAttribute('data-mp-cancel-disabled-ignored')).toBe('true');
    expect(cancelBtn.getAttribute('aria-disabled')).not.toBe('true');
    fireEvent.click(cancelBtn);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('cancel-disabled'));
  });

  it('DEV warns dialog-too-many-actions when the body smuggles extra actions', () => {
    renderWithProviders(
      <ConfirmDialog open title="Replace file?" confirmLabel="Replace">
        <>
          <button type="button" onClick={() => {}}>
            Keep both
          </button>
          <button type="button" onClick={() => {}}>
            Open settings
          </button>
        </>
      </ConfirmDialog>,
    );
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('dialog-too-many-actions'));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('count=4'));
  });

  it('allowManyActions ejects the max-2 cap', () => {
    renderWithProviders(
      <ConfirmDialog open allowManyActions title="Replace file?" confirmLabel="Replace">
        <button type="button" onClick={() => {}}>
          Keep both
        </button>
      </ConfirmDialog>,
    );
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('dialog-too-many-actions'));
  });

  it('plain confirm/cancel pair stays under the cap (baseline)', () => {
    renderWithProviders(<ConfirmDialog open title="Save changes?" body="Plain string body." />);
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('dialog-too-many-actions'));
  });

  it('explains a gated confirm via confirmDisabledReason', () => {
    const onConfirm = vi.fn();
    renderWithProviders(
      <ConfirmDialog
        open
        title="Delete project?"
        confirmLabel="Delete"
        confirmDisabled
        confirmDisabledReason='Type "acme" to confirm.'
        onConfirm={onConfirm}
      />,
    );
    const confirmBtn = buttonByLabel('Delete');
    expect(confirmBtn.getAttribute('aria-disabled')).toBe('true');
    expect(confirmBtn.getAttribute('aria-describedby')).toBeTruthy();
    const reason = root().querySelector('[data-mp-disabled-reason]');
    expect(reason?.textContent).toContain('Type "acme" to confirm.');

    fireEvent.click(confirmBtn);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('bare-disabled'));
  });

  it('DEV-warns bare-disabled when confirm is gated without a reason', () => {
    renderWithProviders(<ConfirmDialog open title="Delete project?" confirmLabel="Delete" confirmDisabled />);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('bare-disabled'));
  });
});

describe('notify() blocking → ConfirmDialog', () => {
  it('error+blocking presents a destructive ConfirmDialog via NotifyHost', async () => {
    const onPress = vi.fn();
    renderWithProviders(
      <NotifyHost toastViewport={false}>
        <div>host</div>
      </NotifyHost>,
    );

    act(() => {
      notify({
        severity: 'error',
        scope: 'page',
        blocking: true,
        title: 'Delete 3 rows?',
        body: 'This cannot be undone.',
        action: { label: 'Delete', onPress },
      });
    });

    await waitFor(() => {
      expect(alertdialog()).toBeTruthy();
    });
    expect(root().textContent).toContain('Delete 3 rows?');
    expect(root().textContent).toContain('This cannot be undone.');
    expect(getFeedback()[0]?.surface).toBe('dialog');
    expect(alertdialog()?.getAttribute('data-tone')).toBe('destructive');

    fireEvent.click(buttonByLabel('Delete'));
    expect(onPress).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(getFeedback().find((e) => e.surface === 'dialog')).toBeUndefined();
    });
  });

  it('warning+blocking Cancel dismisses without running action', async () => {
    const onPress = vi.fn();
    renderWithProviders(
      <NotifyHost toastViewport={false}>
        <div>host</div>
      </NotifyHost>,
    );

    act(() => {
      notify({
        severity: 'warning',
        scope: 'page',
        blocking: true,
        title: 'Unsaved changes',
        body: 'Leave anyway?',
        action: { label: 'Leave anyway', onPress },
      });
    });

    await waitFor(() => {
      expect(alertdialog()).toBeTruthy();
    });

    fireEvent.click(buttonByLabel('Cancel'));
    expect(onPress).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(getFeedback().find((e) => e.surface === 'dialog')).toBeUndefined();
    });
  });
});

function atoms(el: Element, prefixes: string[]): string[] {
  return String((el as HTMLElement).className || '')
    .split(' ')
    .filter((c) => prefixes.some((p) => c.startsWith(p)))
    .sort();
}

function weightAtoms(el: Element): string[] {
  return atoms(el, ['_fow-']);
}

describe('ConfirmDialog action labels — weight 400 on the TEXT NODE', () => {
  afterEach(cleanup);

  it('Continue and Cancel are weight 400 on the text node, never the press floor', () => {
    renderWithProviders(<SizableText fontWeight="400">pin-400</SizableText>);
    const explicit400 = weightAtoms(screen.getByText('pin-400'));
    cleanup();
    renderWithProviders(<SizableText fontWeight="600">pin-600</SizableText>);
    const explicit600 = weightAtoms(screen.getByText('pin-600'));
    cleanup();

    renderWithProviders(
      <ConfirmDialog
        open
        title="Leave this page?"
        body="Edits will be discarded."
        confirmLabel="Continue"
        cancelLabel="Cancel"
      />,
    );

    for (const label of ['Continue', 'Cancel']) {
      const floor = buttonByLabel(label) as HTMLElement;
      const textNode = screen.getByText(label);
      expect(textNode).not.toBe(floor);
      expect(floor.contains(textNode)).toBe(true);
      const weight = weightAtoms(textNode);
      expect(weight.length).toBeGreaterThan(0);
      expect(weight.join(' ')).not.toMatch(/600|weight-6|fow-6/);
      expect(weight).toEqual(explicit400);
      expect(weight).not.toEqual(explicit600);
      expect(weightAtoms(floor)).toHaveLength(0);
    }
    expect(alertdialog()?.getAttribute('data-density')).toBeTruthy();
    expect(alertdialog()?.getAttribute('data-size')).toBeTruthy();
  });
});

describe('NotifyHost action labels — weight 400 on the TEXT NODE', () => {
  afterEach(cleanup);

  it('banner Retry is weight 400 on the text node', () => {
    renderWithProviders(<SizableText fontWeight="400">Retry</SizableText>);
    const explicit400 = weightAtoms(screen.getByText('Retry'));
    cleanup();
    renderWithProviders(<SizableText fontWeight="600">Retry</SizableText>);
    const explicit600 = weightAtoms(screen.getByText('Retry'));
    cleanup();

    renderWithProviders(
      <NotifyHost toastViewport={false}>
        <div>host</div>
      </NotifyHost>,
    );
    act(() => {
      notify({
        severity: 'error',
        scope: 'page',
        title: 'Save failed',
        body: 'The server rejected the request.',
        action: { label: 'Retry', onPress: vi.fn() },
      });
    });

    const textNode = screen.getByText('Retry');
    const weight = weightAtoms(textNode);
    expect(weight.length).toBeGreaterThan(0);
    expect(weight.join(' ')).not.toMatch(/600|weight-6|fow-6/);
    expect(weight).toEqual(explicit400);
    expect(weight).not.toEqual(explicit600);
  });

  it('inline section Retry is weight 400 on the text node', () => {
    renderWithProviders(<SizableText fontWeight="400">Retry</SizableText>);
    const explicit400 = weightAtoms(screen.getByText('Retry'));
    cleanup();

    renderWithProviders(
      <NotifyHost toastViewport={false}>
        <NotifyRegion scope="section" />
      </NotifyHost>,
    );
    act(() => {
      notify({
        severity: 'info',
        scope: 'section',
        title: 'Address check',
        body: 'Confirm the shipping address.',
        action: { label: 'Retry', onPress: vi.fn() },
      });
    });

    const textNode = screen.getByText('Retry');
    expect(textNode.tagName).not.toBe('BUTTON');
    const weight = weightAtoms(textNode);
    expect(weight.length).toBeGreaterThan(0);
    expect(weight).toEqual(explicit400);
    expect(weight.join(' ')).not.toMatch(/600|weight-6|fow-6/);
  });
});
