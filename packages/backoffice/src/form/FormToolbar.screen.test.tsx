// The desk form toolbar (MPO-414): one lifecycle primary per docstatus, no
// primary the session's rights withhold (MPO-390), the status pill, the ⋯
// menu and the prev/next pager.
import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FormToolbar, resolveIndicator } from './FormToolbar';
import type { FormToolbarMenuItem, FormToolbarProps } from './FormToolbar';

const props = (overrides: Partial<FormToolbarProps> = {}): FormToolbarProps => ({
  breadcrumbs: [
    { label: 'Home', href: '/backoffice' },
    { label: 'Sales Order', href: '/backoffice/sales-order' },
    { label: 'SO-0001' },
  ],
  onNavigate: vi.fn<() => void>(),
  title: 'SO-0001',
  indicator: 'draft',
  isSaving: false,
  canSave: true,
  canSubmit: true,
  canCancel: false,
  canAmend: false,
  onSave: vi.fn<() => void>(),
  onSubmit: vi.fn<() => void>(),
  onCancel: vi.fn<() => void>(),
  onAmend: vi.fn<() => void>(),
  menuItems: [],
  ...overrides,
});

const menuItem = (label: string) =>
  [...document.querySelectorAll('[role="menuitem"]')].find((node) =>
    node.textContent?.startsWith(label),
  ) as HTMLElement;

const primaries = ['save', 'submit', 'cancel', 'amend'] as const;

const visiblePrimaries = (): string[] => primaries.filter((action) => screen.queryByTestId(`form-toolbar-${action}`));

describe(FormToolbar, () => {
  it('offers Save on a dirty draft and Submit once it is saved', () => {
    const onSave = vi.fn<() => void>();
    const onSubmit = vi.fn<() => void>();
    const { rerender } = renderWithProviders(<FormToolbar {...props({ indicator: 'notSaved', onSave, onSubmit })} />);
    expect(visiblePrimaries()).toStrictEqual(['save']);
    fireEvent.click(screen.getByTestId('form-toolbar-save'));
    expect(onSave).toHaveBeenCalledOnce();
    rerender(<FormToolbar {...props({ indicator: 'draft', onSave, onSubmit })} />);
    expect(visiblePrimaries()).toStrictEqual(['submit']);
    fireEvent.click(screen.getByTestId('form-toolbar-submit'));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('offers Cancel on a submitted doc and Amend on a cancelled one', () => {
    const onCancel = vi.fn<() => void>();
    const { rerender } = renderWithProviders(
      <FormToolbar
        {...props({ indicator: 'submitted', canSave: false, canSubmit: false, canCancel: true })}
        onCancel={onCancel}
      />,
    );
    expect(visiblePrimaries()).toStrictEqual(['cancel']);
    fireEvent.click(screen.getByTestId('form-toolbar-cancel'));
    expect(onCancel).toHaveBeenCalledOnce();
    rerender(<FormToolbar {...props({ indicator: 'cancelled', canSave: false, canSubmit: false, canAmend: true })} />);
    expect(visiblePrimaries()).toStrictEqual(['amend']);
  });

  it("draws no primary a reader's rights withhold", () => {
    renderWithProviders(<FormToolbar {...props({ indicator: 'notSaved', canSave: false, canSubmit: false })} />);
    expect(visiblePrimaries()).toStrictEqual([]);
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
    expect(approved).toStrictEqual({ label: 'Approved', color: 'green' });
    rerender(<FormToolbar {...props({ indicator: approved })} />);
    expect(screen.getByText('Approved')).toBeTruthy();
    expect(screen.queryByText('Submitted')).toBeNull();
    rerender(<FormToolbar {...props({ indicator: 'saved' })} />);
    for (const label of ['Not Saved', 'Draft', 'Submitted', 'Cancelled', 'Approved']) {
      expect(screen.queryByText(label)).toBeNull();
    }
  });

  it('runs ⋯ menu items and holds the disabled ones', async () => {
    const onDuplicate = vi.fn<() => void>();
    const onDelete = vi.fn<() => void>();
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
    await waitFor(() => {
      expect(menuItem('Delete')).toBeTruthy();
    });
    expect(menuItem('Delete').getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(menuItem('Delete'));
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.click(menuItem('Duplicate'));
    expect(onDuplicate).toHaveBeenCalledOnce();
  });

  it('pages prev/next and disables the boundary arrow instead of hiding it', () => {
    const onPrevDoc = vi.fn<() => void>();
    const onNextDoc = vi.fn<() => void>();
    const { rerender } = renderWithProviders(<FormToolbar {...props()} />);
    expect(screen.queryByTestId('form-toolbar-prev')).toBeNull();
    rerender(<FormToolbar {...props({ onPrevDoc, onNextDoc, prevDocDisabled: true })} />);
    fireEvent.click(screen.getByTestId('form-toolbar-prev'));
    fireEvent.click(screen.getByTestId('form-toolbar-next'));
    expect(onPrevDoc).not.toHaveBeenCalled();
    expect(onNextDoc).toHaveBeenCalledOnce();
  });
});
