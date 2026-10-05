/**
 * @vitest-environment jsdom
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DestructiveAction, type DestructiveConfirmContext } from './DestructiveAction';
import { __resetActionDevWarnSeen } from './devWarn';
import { resolveDestructiveSeverity, severityRequiresConfirm, severityUsesDangerTone } from './severity';

/** Dialog portals into document.body — query there, not the RTL container. */
function root(): HTMLElement {
  return document.body;
}

function alertdialog(): Element | null {
  return root().querySelector('[role="alertdialog"]');
}

function dialogButtonByLabel(label: string): Element {
  const scope = alertdialog() ?? root();
  const buttons = Array.from(scope.querySelectorAll('[role="button"]'));
  const exact = buttons.find((b) => b.textContent?.trim() === label);
  if (exact) {
    return exact;
  }
  const match = buttons.find((b) => b.textContent?.includes(label));
  if (!match) {
    throw new Error(`No dialog button with label "${label}"`);
  }
  return match;
}

describe('resolveDestructiveSeverity', () => {
  it('defaults to medium when no hints', () => {
    expect(resolveDestructiveSeverity()).toBe('medium');
  });

  it('derives high from cascades / bulk+irreversible', () => {
    expect(resolveDestructiveSeverity({ cascades: true })).toBe('high');
    expect(resolveDestructiveSeverity({ bulk: true, irreversible: true })).toBe('high');
  });

  it('honors explicit severity over hints', () => {
    expect(resolveDestructiveSeverity({ severity: 'low', cascades: true })).toBe('low');
  });

  it('maps tiers to confirm + danger', () => {
    expect(severityRequiresConfirm('low')).toBe(false);
    expect(severityRequiresConfirm('medium')).toBe(true);
    expect(severityUsesDangerTone('low')).toBe(false);
    expect(severityUsesDangerTone('high')).toBe(true);
  });
});

describe('DestructiveAction', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetActionDevWarnSeen();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    __resetActionDevWarnSeen();
  });

  it('renders verb+noun label and danger tone by default (medium)', () => {
    renderWithProviders(
      <DestructiveAction verb="Delete" noun="pipeline" confirm={async () => false} onAction={() => {}} />,
    );
    expect(screen.getByText('Delete pipeline')).toBeInTheDocument();
  });

  it('default path opens ConfirmDialog; cancel does not call onAction', async () => {
    const onAction = vi.fn();
    renderWithProviders(<DestructiveAction verb="Delete" noun="pipeline" onAction={onAction} />);
    fireEvent.click(screen.getByText('Delete pipeline'));
    await waitFor(() => {
      expect(alertdialog()).toBeTruthy();
    });
    expect(root().textContent).toContain('Delete pipeline?');
    expect(alertdialog()?.getAttribute('data-tone')).toBe('destructive');
    expect(dialogButtonByLabel('Delete')).toBeTruthy();
    fireEvent.click(dialogButtonByLabel('Cancel'));
    await waitFor(() => {
      expect(alertdialog()).toBeNull();
    });
    expect(onAction).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('bare-destructive-without-confirm'));
  });

  it('default ConfirmDialog confirm runs onAction', async () => {
    const onAction = vi.fn();
    renderWithProviders(
      <DestructiveAction verb="Delete" noun="pipeline" consequence="This cannot be undone." onAction={onAction} />,
    );
    fireEvent.click(screen.getByText('Delete pipeline'));
    await waitFor(() => {
      expect(alertdialog()).toBeTruthy();
    });
    expect(root().textContent).toContain('This cannot be undone.');
    fireEvent.click(dialogButtonByLabel('Delete'));
    await waitFor(() => {
      expect(onAction).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(alertdialog()).toBeNull();
    });
  });

  it('calls onAction only after confirm returns true', async () => {
    const onAction = vi.fn();
    const confirm = vi.fn(async (_ctx: DestructiveConfirmContext) => true);
    renderWithProviders(<DestructiveAction verb="Delete" noun="row" confirm={confirm} onAction={onAction} />);
    fireEvent.click(screen.getByText('Delete row'));
    await waitFor(() => {
      expect(confirm).toHaveBeenCalledTimes(1);
    });
    expect(confirm.mock.calls[0][0].confirmLabel).toBe('Delete');
    expect(confirm.mock.calls[0][0].actionLabel).toBe('Delete row');
    await waitFor(() => {
      expect(onAction).toHaveBeenCalledTimes(1);
    });
    expect(alertdialog()).toBeNull();
  });

  it('does not call onAction when confirm returns false', async () => {
    const onAction = vi.fn();
    renderWithProviders(<DestructiveAction verb="Delete" confirm={async () => false} onAction={onAction} />);
    fireEvent.click(screen.getByText('Delete'));
    await waitFor(() => {
      expect(onAction).not.toHaveBeenCalled();
    });
  });

  it('low severity skips confirm and danger tone', async () => {
    const onAction = vi.fn();
    const confirm = vi.fn(async () => true);
    renderWithProviders(<DestructiveAction severity="low" verb="Remove" confirm={confirm} onAction={onAction} />);
    fireEvent.click(screen.getByText('Remove'));
    await waitFor(() => {
      expect(onAction).toHaveBeenCalledTimes(1);
    });
    expect(confirm).not.toHaveBeenCalled();
    expect(alertdialog()).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('high severity passes expectedText into confirm context', async () => {
    const confirm = vi.fn(async (_ctx: DestructiveConfirmContext) => false);
    renderWithProviders(
      <DestructiveAction
        severity="high"
        verb="Delete"
        noun="acme"
        confirmationText="acme"
        confirm={confirm}
        onAction={() => {}}
      />,
    );
    fireEvent.click(screen.getByText('Delete acme'));
    await waitFor(() => {
      expect(confirm).toHaveBeenCalled();
    });
    expect(confirm.mock.calls[0][0].expectedText).toBe('acme');
    expect(confirm.mock.calls[0][0].severity).toBe('high');
  });

  it('high default path requires typed expectedText before confirm', async () => {
    const onAction = vi.fn();
    renderWithProviders(
      <DestructiveAction
        severity="high"
        verb="Delete"
        noun="project"
        confirmationText="my-project"
        consequence="Permanent."
        onAction={onAction}
      />,
    );
    fireEvent.click(screen.getByText('Delete project'));
    await waitFor(() => {
      expect(alertdialog()).toBeTruthy();
    });
    expect(root().textContent).toContain('Type "my-project" to confirm.');
    expect(dialogButtonByLabel('Delete').getAttribute('data-mp-confirm-disabled')).toBe('true');
    fireEvent.click(dialogButtonByLabel('Delete'));
    expect(onAction).not.toHaveBeenCalled();

    const input =
      (alertdialog()?.querySelector('[data-mp-confirm-expected]') as HTMLElement | null) ??
      (alertdialog()?.querySelector('input') as HTMLElement | null);
    expect(input).toBeTruthy();
    fireEvent.change(input!, { target: { value: 'my-project' } });

    await waitFor(() => {
      expect(dialogButtonByLabel('Delete').getAttribute('data-mp-confirm-disabled')).not.toBe('true');
    });
    fireEvent.click(dialogButtonByLabel('Delete'));
    await waitFor(() => {
      expect(onAction).toHaveBeenCalledTimes(1);
    });
  });

  it('disabledReason blocks action and sets aria-disabled', () => {
    const onAction = vi.fn();
    renderWithProviders(
      <DestructiveAction
        verb="Delete"
        confirm={async () => true}
        onAction={onAction}
        disabledReason="Only owners can remove this"
      />,
    );
    const btn = screen.getByText('Delete');
    const frame = btn.closest('[aria-disabled="true"]');
    expect(frame).toBeTruthy();
    // The reason renders as visible text wired via aria-describedby.
    expect(screen.getByText('Only owners can remove this')).toBeInTheDocument();
    expect(frame?.getAttribute('aria-describedby')).toBeTruthy();
    fireEvent.click(btn);
    expect(onAction).not.toHaveBeenCalled();
  });

  it('typed-confirm gate explains the disabled confirm', async () => {
    const onAction = vi.fn();
    renderWithProviders(
      <DestructiveAction
        severity="high"
        verb="Delete"
        noun="project"
        confirmationText="my-project"
        onAction={onAction}
      />,
    );
    fireEvent.click(screen.getByText('Delete project'));
    await waitFor(() => {
      expect(alertdialog()).toBeTruthy();
    });

    const confirm = dialogButtonByLabel('Delete');
    expect(confirm.getAttribute('aria-disabled')).toBe('true');
    expect(confirm.getAttribute('aria-describedby')).toBeTruthy();
    const reason = alertdialog()?.querySelector('[data-mp-disabled-reason]');
    expect(reason?.textContent).toContain('Type "my-project" to confirm.');
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringContaining('bare-disabled'));

    // Typing the expected text clears the gate and the reason affordance.
    const input = alertdialog()?.querySelector('input') as HTMLElement;
    fireEvent.change(input, { target: { value: 'my-project' } });
    await waitFor(() => {
      expect(alertdialog()?.querySelector('[data-mp-disabled-reason]')).toBeNull();
    });
    fireEvent.click(dialogButtonByLabel('Delete'));
    await waitFor(() => {
      expect(onAction).toHaveBeenCalledTimes(1);
    });
  });

  it('typed-confirm field is a Tamagui Input (native-safe), not a raw HTML input with #ccc', async () => {
    renderWithProviders(
      <DestructiveAction
        severity="high"
        verb="Delete"
        noun="project"
        confirmationText="my-project"
        onAction={() => undefined}
      />,
    );
    fireEvent.click(screen.getByText('Delete project'));
    await waitFor(() => {
      expect(alertdialog()).toBeTruthy();
    });
    const marked = alertdialog()?.querySelector('[data-mp-confirm-expected]');
    expect(marked).toBeTruthy();
    const input =
      marked instanceof HTMLInputElement ? marked : (marked?.querySelector('input') as HTMLInputElement | null);
    expect(input).toBeTruthy();
    expect(input!.getAttribute('style') ?? input!.style.cssText).not.toMatch(/#ccc/i);
    expect(alertdialog()?.querySelector('[data-mp-confirm-prompt]')?.textContent).toContain(
      'Type "my-project" to confirm.',
    );
  });

  it('typed-confirm TSX has no HTML span/input hosts', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/actions/DestructiveAction.tsx'), 'utf8');
    expect(src).not.toMatch(/<span[\s>]/);
    expect(src).not.toMatch(/<input[\s>]/);
  });
});
