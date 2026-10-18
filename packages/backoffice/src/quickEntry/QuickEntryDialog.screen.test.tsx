// Desk quick entry (MPO-414): required fields validate inline, Create inserts
// and hands back the server name, and doctypes that do not quick-enter route
// to the full form without drawing the dialog.
import { InMemoryFixtureProvider } from '@repo/frappe';
import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BackofficeProvider } from '../config/BackofficeProvider';
import type { BackofficeFrappeConfig } from '../config/BackofficeProvider';
import { createMemoryNavigator } from '../navigation/navigator';
import type { DoctypeMeta } from '../shared/use-doctype-meta';

import { QuickEntryDialog } from './QuickEntryDialog';

const todoMeta: DoctypeMeta = {
  name: 'ToDo',
  module: 'Desk',
  quick_entry: 1,
  autoname: 'hash',
  fields: [
    { fieldname: 'description', fieldtype: 'Small Text', label: 'Description', required: 1 },
    {
      fieldname: 'priority',
      fieldtype: 'Select',
      label: 'Priority',
      options: 'High\nMedium\nLow',
      bold: 1,
      default: 'Medium',
    },
    { fieldname: 'status', fieldtype: 'Select', label: 'Status', options: 'Open\nClosed' },
  ],
  permissions: [{ role: 'All', read: 1, write: 1, create: 1 }],
};

const invoiceMeta: DoctypeMeta = {
  name: 'Sales Invoice',
  module: 'Accounts',
  quick_entry: 0,
  fields: [{ fieldname: 'customer', fieldtype: 'Data', label: 'Customer', required: 1 }],
  permissions: [{ role: 'All', read: 1, write: 1, create: 1 }],
};

let host = 0;

const renderDialog = (meta: DoctypeMeta, frappe: Partial<BackofficeFrappeConfig> = {}) => {
  host += 1;
  const onOpenChange = vi.fn<(open: boolean) => void>();
  const onCreated = vi.fn<(name: string) => void>();
  const onEditFullForm = vi.fn<() => void>();
  const fixtures = new InMemoryFixtureProvider({ [meta.name]: [] });
  renderWithProviders(
    <BackofficeProvider
      frappe={{ baseURL: `https://quick-entry-${host}.screen.spec.test`, fixtures, ...frappe }}
      navigation={createMemoryNavigator('/backoffice')}>
      <QuickEntryDialog
        doctype={meta.name}
        open
        onOpenChange={onOpenChange}
        onCreated={onCreated}
        onEditFullForm={onEditFullForm}
        metaOverride={meta}
      />
    </BackofficeProvider>,
  );
  return { fixtures, onOpenChange, onCreated, onEditFullForm };
};

const descriptionInput = (): HTMLTextAreaElement | HTMLInputElement => {
  const field = screen.getByLabelText('Description', { exact: false });
  return (
    field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement
      ? field
      : field.querySelector('textarea, input')
  ) as HTMLTextAreaElement;
};

describe(QuickEntryDialog, () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('holds Create while a required field is empty', async () => {
    const { onCreated, onOpenChange } = renderDialog(todoMeta);
    fireEvent.click(await screen.findByTestId('quick-entry-create'));
    await expect(screen.findByText('Description is required')).resolves.toBeTruthy();
    expect(onCreated).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('inserts the draft and hands back the created name', async () => {
    const { fixtures, onCreated, onOpenChange } = renderDialog(todoMeta);
    await screen.findByTestId('quick-entry-form');
    fireEvent.change(descriptionInput(), { target: { value: 'Call the vendor' } });
    fireEvent.click(screen.getByTestId('quick-entry-create'));
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledOnce();
    });
    const created = await fixtures.getList('ToDo');
    expect(created).toHaveLength(1);
    expect(created[0]?.description).toBe('Call the vendor');
    expect(onCreated).toHaveBeenCalledWith(created[0]?.name);
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('shows a server rejection inline and stays open', async () => {
    vi.stubGlobal('fetch', async (input: string | URL | Request) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      if (url.pathname.endsWith('.create_doc')) {
        return Response.json(
          {
            exc_type: 'ValidationError',
            exception: 'frappe.exceptions.ValidationError: Vendor calls are closed today',
          },
          { status: 417 },
        );
      }
      return Response.json({ data: [] });
    });
    // oxlint-disable-next-line sonarjs/no-undefined-assignment -- undefined overrides the default fixtures so the live fetch path runs
    const { onCreated, onOpenChange } = renderDialog(todoMeta, { fixtures: undefined });
    await screen.findByTestId('quick-entry-form');
    fireEvent.change(descriptionInput(), { target: { value: 'Call the vendor' } });
    fireEvent.click(screen.getByTestId('quick-entry-create'));
    const error = await screen.findByTestId('quick-entry-error', {}, { timeout: 5000 });
    expect(error.textContent).toBe('Vendor calls are closed today');
    expect(onCreated).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('routes a doctype that does not quick-enter to the full form', async () => {
    const { onEditFullForm, onOpenChange } = renderDialog(invoiceMeta);
    await waitFor(() => {
      expect(onEditFullForm).toHaveBeenCalledOnce();
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(screen.queryByTestId('quick-entry-form')).toBeNull();
    expect(screen.queryByText('New Sales Invoice')).toBeNull();
  });

  it('escapes to the full form from the footer', async () => {
    const { onEditFullForm, onOpenChange } = renderDialog(todoMeta);
    fireEvent.click(await screen.findByTestId('quick-entry-edit-full-form'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onEditFullForm).toHaveBeenCalledOnce();
  });
});
