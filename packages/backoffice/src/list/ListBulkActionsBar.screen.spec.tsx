// ListBulkActionsBar over a selection (MPO-414): the bar's gates, its
// confirm-guarded delete and docstatus RPCs, the Bulk Edit dialog it opens,
// and the host list actions it offers for the doctype on screen.
// Fixture mode withholds no session rights (MPO-428); reader/editor coverage
// lives in ListBulkActionsBar.rights.spec.tsx.
import { InMemoryFixtureProvider } from '@repo/frappe';
import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BackofficeProvider } from '../config/BackofficeProvider';
import type { BackofficeActions } from '../config/BackofficeProvider';
import type { BackofficeCapabilities } from '../config/capabilities';
import { createMemoryNavigator } from '../navigation/navigator';
import type { DoctypeMeta } from '../shared/useDoctypeMeta';

import { ListBulkActionsBar } from './ListBulkActionsBar';

const todoMeta: DoctypeMeta = {
  name: 'ToDo',
  fields: [
    { fieldname: 'description', fieldtype: 'Data', label: 'Description' },
    { fieldname: 'status', fieldtype: 'Select', label: 'Status', options: 'Open\nClosed' },
  ],
};

interface Call {
  method: string;
  path: string;
  body: Record<string, unknown>;
}

let run = 0;
let calls: Call[] = [];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  run += 1;
  calls = [];
  vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const raw = typeof init?.body === 'string' ? init.body : '';
    calls.push({
      method: (init?.method ?? 'GET').toUpperCase(),
      path: decodeURIComponent(url.pathname),
      body: raw.startsWith('{') ? (JSON.parse(raw) as Record<string, unknown>) : {},
    });
    if (url.pathname.endsWith('submit_cancel_or_update_docs')) {
      return json({ message: [] });
    }
    return json({ message: 'ok', data: {} });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

interface BarOptions {
  meta?: DoctypeMeta;
  names?: string[];
  capabilities?: BackofficeCapabilities;
  actions?: BackofficeActions;
}

function renderBar({ meta = todoMeta, names = ['TD-001', 'TD-002'], capabilities, actions }: BarOptions = {}) {
  const onClearSelection = vi.fn();
  const onActionComplete = vi.fn();
  const view = renderWithProviders(
    <BackofficeProvider
      frappe={{
        baseURL: `https://list-bulk-${run}.spec.test`,
        fixtures: new InMemoryFixtureProvider({}),
      }}
      navigation={createMemoryNavigator('/backoffice/ToDo')}
      capabilities={capabilities}
      actions={actions}>
      <ListBulkActionsBar
        doctype={meta.name}
        meta={meta}
        selectedNames={names}
        onClearSelection={onClearSelection}
        onActionComplete={onActionComplete}
      />
    </BackofficeProvider>,
  );
  return { ...view, onClearSelection, onActionComplete };
}

function button(name: string, root: HTMLElement = document.body) {
  return within(root).getByRole('button', { name });
}

async function dialog() {
  return await screen.findByRole('alertdialog');
}

describe(ListBulkActionsBar, () => {
  it('counts the selection and offers the desk bulk actions', () => {
    renderBar();
    expect(screen.getByText('2 selected')).toBeTruthy();
    for (const name of ['Bulk Edit', 'Export CSV', 'Assign To', 'Add Tags', 'Delete']) {
      expect(button(name)).toBeTruthy();
    }
    expect(screen.queryByRole('button', { name: 'Submit' })).toBeNull();
  });

  it('renders nothing without a selection or with bulk actions switched off', () => {
    const empty = renderBar({ names: [] });
    expect(screen.queryByText(/selected/)).toBeNull();
    empty.unmount();
    renderBar({ capabilities: { bulkActions: false } });
    expect(screen.queryByText('2 selected')).toBeNull();
  });

  it('drops Assign To and Add Tags when their capabilities are off', () => {
    renderBar({ capabilities: { assignments: false, tags: false } });
    expect(screen.getByText('2 selected')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Assign To' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add Tags' })).toBeNull();
  });

  it('deletes each selected document only after the confirm, then clears and refreshes', async () => {
    const { onClearSelection, onActionComplete } = renderBar();
    fireEvent.click(button('Delete'));
    const confirm = await dialog();
    expect(within(confirm).getByText('Permanently delete 2 ToDo document(s)?')).toBeTruthy();
    expect(calls.some((call) => call.method !== 'GET')).toBe(false);
    fireEvent.click(button('Delete', confirm));
    await waitFor(() => {
      expect(onActionComplete).toHaveBeenCalledOnce();
    });
    expect(onClearSelection).toHaveBeenCalledOnce();
    const deleted = calls
      .filter((call) => call.method === 'DELETE' || call.path.endsWith('delete_doc'))
      .map((call) => (call.method === 'DELETE' ? call.path.split('/').pop() : call.body.name));
    expect(deleted.sort()).toEqual(['TD-001', 'TD-002']);
  });

  it('submits a submittable selection through the bulk docstatus RPC', async () => {
    const { onActionComplete } = renderBar({
      meta: { ...todoMeta, name: 'QA Submittable', is_submittable: 1 },
      names: ['SUB-001', 'SUB-002'],
    });
    expect(button('Cancel')).toBeTruthy();
    fireEvent.click(button('Submit'));
    const confirm = await dialog();
    expect(within(confirm).getByText('Submit 2 QA Submittable document(s)?')).toBeTruthy();
    fireEvent.click(button('Submit', confirm));
    await waitFor(() => {
      expect(onActionComplete).toHaveBeenCalledOnce();
    });
    const rpc = calls.find((call) => call.path.endsWith('submit_cancel_or_update_docs'));
    expect(rpc?.body).toMatchObject({
      doctype: 'QA Submittable',
      docnames: JSON.stringify(['SUB-001', 'SUB-002']),
      action: 'submit',
    });
  });

  it('opens Bulk Edit over the selection, with Update held until a field is picked', async () => {
    renderBar({ names: ['TD-001'] });
    fireEvent.click(button('Bulk Edit'));
    const edit = await dialog();
    expect(within(edit).getByText('Set one field on 1 selected document')).toBeTruthy();
    expect(button('Update', edit).getAttribute('aria-disabled')).toBe('true');
  });

  it('offers only the host list actions scoped to this doctype', () => {
    const archive = vi.fn();
    renderBar({
      actions: {
        list: [
          { id: 'archive', label: 'Archive', onPress: archive },
          { id: 'reset', label: 'Reset Password', doctypes: ['User'], onPress: vi.fn() },
        ],
      },
    });
    expect(screen.queryByRole('button', { name: 'Reset Password' })).toBeNull();
    fireEvent.click(button('Archive'));
    expect(archive).toHaveBeenCalledWith({ doctype: 'ToDo', selection: ['TD-001', 'TD-002'] });
  });
});
