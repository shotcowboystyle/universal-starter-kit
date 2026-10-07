// The desk form toolbar (MPO-414): one lifecycle primary per docstatus, no
// primary the session's rights withhold (MPO-390), the status pill, the ⋯
// menu and the prev/next pager.
import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FormToolbar, resolveIndicator } from './FormToolbar';
import type { FormToolbarMenuItem, FormToolbarProps } from './FormToolbar';

function props(overrides: Partial<FormToolbarProps> = {}): FormToolbarProps {
  return {
    breadcrumbs: [
      { label: 'Home', href: '/backoffice' },
      { label: 'Sales Order', href: '/backoffice/sales-order' },
      { label: 'SO-0001' },
    ],
    onNavigate: vi.fn(),
    title: 'SO-0001',
    indicator: 'draft',
    isSaving: false,
    canSave: true,
    canSubmit: true,
    canCancel: false,
    canAmend: false,
    onSave: vi.fn(),
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    onAmend: vi.fn(),
    menuItems: [],
    ...overrides,
  };
}

const primaries = ['save', 'submit', 'cancel', 'amend'] as const;

function visiblePrimaries(): string[] {
  return primaries.filter((action) => screen.queryByTestId(`form-toolbar-${action}`));
}

describe(FormToolbar, () => {
  it('offers Save on a dirty draft and Submit once it is saved', () => {
    const onSave = vi.fn();
    const onSubmit = vi.fn();
    const { rerender } = renderWithProviders(<FormToolbar {...props({ indicator: 'notSaved', onSave, onSubmit })} />);
    expect(visiblePrimaries()).toEqual(['save']);
    fireEvent.click(screen.getByTestId('form-toolbar-save'));
    expect(onSave).toHaveBeenCalledOnce();
    rerender(<FormToolbar {...props({ indicator: 'draft', onSave, onSubmit })} />);
    expect(visiblePrimaries()).toEqual(['submit']);
    fireEvent.click(screen.getByTestId('form-toolbar-submit'));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('offers Cancel on a submitted doc and Amend on a cancelled one', () => {
    const onCancel = vi.fn();
    const { rerender } = renderWithProviders(
      <FormToolbar
        {...props({ indicator: 'submitted', canSave: false, canSubmit: false, canCancel: true })}
        onCancel={onCancel}
      />,
    );
    expect(visiblePrimaries()).toEqual(['cancel']);
    fireEvent.click(screen.getByTestId('form-toolbar-cancel'));
    expect(onCancel).toHaveBeenCalledOnce();
    rerender(<FormToolbar {...props({ indicator: 'cancelled', canSave: false, canSubmit: false, canAmend: true })} />);
    expect(visiblePrimaries()).toEqual(['amend']);
  });

  it("draws no primary a reader's rights withhold", () => {
    renderWithProviders(<FormToolbar {...props({ indicator: 'notSaved', canSave: false, canSubmit: false })} />);
    expect(visiblePrimaries()).toEqual([]);
  });

  it('pills the status from meta.states before guessing a color', () => {
    const { rerender } = renderWithProviders(<FormToolbar {...props({ indicator: 'new' })} />);
    expect(screen.getByText('Not Saved')).toBeTruthy();
    const approved = resolveIndicator({
      isCreate: false,
      isDirty: false,
      docstatus: 1,
      isSubmittable: true,
      statusValue: 'Approved',
      states: [{ title: 'Approved', color: 'Green' }],
    });
    expect(approved).toEqual({ label: 'Approved', color: 'green' });
    rerender(<FormToolbar {...props({ indicator: approved })} />);
    expect(screen.getByText('Approved')).toBeTruthy();
    expect(screen.queryByText('Submitted')).toBeNull();
    rerender(<FormToolbar {...props({ indicator: 'saved' })} />);
    for (const label of ['Not Saved', 'Draft', 'Submitted', 'Cancelled', 'Approved']) {
      expect(screen.queryByText(label)).toBeNull();
    }
  });

  it('runs ⋯ menu items and holds the disabled ones', async () => {
    const onDuplicate = vi.fn();
    const onDelete = vi.fn();
    const menuItems: FormToolbarMenuItem[] = [
      { key: 'duplicate', label: 'Duplicate', icon: 'duplicate', onSelect: onDuplicate },
      {
        key: 'delete',
        label: 'Delete',
        icon: 'delete',
        destructive: true,
        disabled: true,
        disabledReason: 'No delete permission',
        onSelect: onDelete,
      },
    ];
    renderWithProviders(<FormToolbar {...props({ menuItems })} />);
    fireEvent.click(screen.getByTestId('form-toolbar-menu'));
    const item = (label: string) =>
      [...document.querySelectorAll('[role="menuitem"]')].find((node) =>
        node.textContent?.startsWith(label),
      ) as HTMLElement;
    await waitFor(() => {
      expect(item('Delete')).toBeTruthy();
    });
    expect(item('Delete').getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(item('Delete'));
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(item('Duplicate'));
    expect(onDuplicate).toHaveBeenCalledOnce();
  });

  it('pages prev/next and disables the boundary arrow instead of hiding it', () => {
    const onPrevDoc = vi.fn();
    const onNextDoc = vi.fn();
    const { rerender } = renderWithProviders(<FormToolbar {...props()} />);
    expect(screen.queryByTestId('form-toolbar-prev')).toBeNull();
    rerender(<FormToolbar {...props({ onPrevDoc, onNextDoc, prevDocDisabled: true })} />);
    fireEvent.click(screen.getByTestId('form-toolbar-prev'));
    fireEvent.click(screen.getByTestId('form-toolbar-next'));
    expect(onPrevDoc).not.toHaveBeenCalled();
    expect(onNextDoc).toHaveBeenCalledOnce();
  });
});
