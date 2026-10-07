// The form menu's input dialogs (MPO-414): each confirm stays gated until
// its input is usable, then hands the trimmed value to the caller.
import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BackofficeProvider } from '../config/BackofficeProvider';
import { createMemoryNavigator } from '../navigation/navigator';

import { AssignDialog, EmailDialog, JumpToFieldDialog, RenameDialog } from './FormDialogs';

afterEach(() => {
  vi.restoreAllMocks();
});

function button(label: string): HTMLElement {
  const found = [...document.body.querySelectorAll('[role="button"], button')].find((node) =>
    node.textContent?.trim().startsWith(label),
  );
  if (!found) {
    throw new Error(`no button ${label}`);
  }
  return found as HTMLElement;
}

function input(label: string): HTMLInputElement | HTMLTextAreaElement {
  const field = screen.getByLabelText(label);
  return (
    field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement
      ? field
      : field.querySelector('input, textarea')
  ) as HTMLInputElement;
}

function gated(label: string): boolean {
  return button(label).getAttribute('aria-disabled') === 'true';
}

describe(RenameDialog, () => {
  it('renames only to a different, trimmed name', () => {
    const onRename = vi.fn();
    renderWithProviders(
      <RenameDialog
        open
        onOpenChange={() => {}}
        currentName="TODO-0001"
        onRename={onRename}
      />,
    );
    expect(gated('Rename')).toBe(true);
    fireEvent.change(input('New name'), { target: { value: '  TODO-0001  ' } });
    expect(gated('Rename')).toBe(true);
    fireEvent.change(input('New name'), { target: { value: '  TODO-0042 ' } });
    expect(gated('Rename')).toBe(false);
    fireEvent.click(button('Rename'));
    expect(onRename).toHaveBeenCalledWith('TODO-0042');
  });
});

describe(EmailDialog, () => {
  it('sends only with recipients and a subject', () => {
    const onSend = vi.fn();
    renderWithProviders(
      <EmailDialog
        open
        onOpenChange={() => {}}
        defaultSubject="ToDo TODO-0001"
        onSend={onSend}
      />,
    );
    expect(input('Subject').value).toBe('ToDo TODO-0001');
    expect(gated('Send')).toBe(true);
    fireEvent.change(input('To (comma-separated emails)'), {
      target: { value: ' jane@example.com ' },
    });
    fireEvent.change(input('Message'), { target: { value: 'See attached.' } });
    fireEvent.click(button('Send'));
    expect(onSend).toHaveBeenCalledWith({
      recipients: 'jane@example.com',
      subject: 'ToDo TODO-0001',
      content: 'See attached.',
    });
  });
});

describe(AssignDialog, () => {
  it('will not assign before a user is picked', () => {
    const onAssign = vi.fn();
    renderWithProviders(
      <BackofficeProvider
        frappe={{ baseURL: 'https://form-dialogs.screen.spec.test' }}
        navigation={createMemoryNavigator('/backoffice')}>
        <AssignDialog
          open
          onOpenChange={() => {}}
          onAssign={onAssign}
        />
      </BackofficeProvider>,
    );
    expect(screen.getByText('Assign to')).toBeTruthy();
    expect(gated('Assign')).toBe(true);
    fireEvent.click(button('Assign'));
    expect(onAssign).not.toHaveBeenCalled();
  });
});

describe(JumpToFieldDialog, () => {
  const fields = [
    { name: 'customer', label: 'Customer', tabKey: 'details', tabLabel: 'Details' },
    { name: 'due_date', label: 'Due Date', tabKey: 'details', tabLabel: 'Details' },
    { name: 'terms', label: 'Payment Terms', tabKey: 'terms', tabLabel: 'Terms' },
  ];

  it('filters fields by label or fieldname and jumps to a picked one', () => {
    const onJump = vi.fn();
    renderWithProviders(
      <JumpToFieldDialog
        open
        onOpenChange={() => {}}
        fields={fields}
        onJump={onJump}
      />,
    );
    fireEvent.change(input('Search fields…'), { target: { value: 'due' } });
    expect(screen.queryByText('Customer')).toBeNull();
    fireEvent.click(screen.getByText('Due Date'));
    expect(onJump).toHaveBeenCalledWith(fields[1]);
  });

  it('jumps to the first match on confirm and gates an empty result', () => {
    const onJump = vi.fn();
    renderWithProviders(
      <JumpToFieldDialog
        open
        onOpenChange={() => {}}
        fields={fields}
        onJump={onJump}
      />,
    );
    fireEvent.change(input('Search fields…'), { target: { value: 'terms' } });
    fireEvent.click(button('Jump'));
    expect(onJump).toHaveBeenCalledWith(fields[2]);
    fireEvent.change(input('Search fields…'), { target: { value: 'nothing like it' } });
    expect(gated('Jump')).toBe(true);
  });
});
