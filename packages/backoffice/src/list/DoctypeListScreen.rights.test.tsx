// The backoffice list offers New and the write/delete bulk actions only as
// far as the session's roles grant them on the doctype (MPO-390), measured
// against a live-shaped bench: getdoctype for meta, the session RPCs for the
// user and roles, and empty answers for everything else the list asks.
import { setTimeout as delay } from 'node:timers/promises';

import { renderWithProviders } from '@repo/test-utils';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BackofficeProvider } from '../config/BackofficeProvider';
import { createMemoryNavigator } from '../navigation/navigator';

import { DoctypeListScreen } from './DoctypeListScreen';

const doctype = 'Poke Move';

const meta = {
  name: doctype,
  doctype: 'DocType',
  title_field: 'move_name',
  fields: [{ fieldname: 'move_name', fieldtype: 'Data', label: 'Move Name', in_list_view: 1 }],
  permissions: [
    { role: 'Pokemon Editor', read: 1, write: 1, create: 1, delete: 1 },
    { role: 'Guest', read: 1 },
  ],
};

let run = 0;
let roles: string[] = [];
let sessionAnswered = false;

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- fixture JSON bodies are arbitrary
const json = (body: unknown, status = 200) => Response.json(body, { status });

const renderList = () =>
  renderWithProviders(
    <BackofficeProvider
      frappe={{ baseURL: `https://list-rights-${run}.spec.test` }}
      navigation={createMemoryNavigator('/backoffice')}>
      <DoctypeListScreen doctype={doctype} />
    </BackofficeProvider>,
  );

const settle = async () => {
  await waitFor(() => {
    expect(sessionAnswered).toBe(true);
  });
  await act(async () => {
    await delay(50);
  });
};

const selectRow = async () => {
  const checkbox = await waitFor(() => screen.getAllByLabelText(/^Select row a1b2c3$/u)[0], {
    timeout: 5000,
  });
  fireEvent.click(checkbox);
};

const bulkActionLabels = (): string[] =>
  Array.from(document.querySelectorAll('[role="button"], button'), (node) => node.textContent?.trim()).filter(
    (label): label is string => label === 'Bulk Edit' || label === 'Delete',
  );

describe('DoctypeListScreen rights', () => {
  beforeEach(() => {
    run += 1;
    sessionAnswered = false;
    vi.stubGlobal('fetch', async (input: string | URL | Request) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      const method = url.pathname.replace(/^\/api\/method\//u, '');
      if (method === 'frappe.auth.get_logged_user') {
        return json({ message: 'user@pokemon.test' });
      }
      if (method === 'frappe.core.doctype.user.user.get_roles') {
        sessionAnswered = true;
        return json({ message: roles });
      }
      if (method === 'frappe.desk.form.load.getdoctype') {
        return json({ docs: [meta] });
      }
      if (method === 'frappe.client.get_count') {
        return json({ message: 1 });
      }
      if (url.pathname === `/api/resource/${encodeURIComponent(doctype)}`) {
        return json({ data: [{ name: 'a1b2c3', doctype, move_name: 'tackle' }] });
      }
      return json({ data: [], message: [] });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('offers an editor New, Bulk Edit and Delete', async () => {
    roles = ['Pokemon Editor', 'Guest'];
    renderList();
    await waitFor(() => {
      expect(screen.getByLabelText(`New ${doctype}`)).toBeTruthy();
    });
    await selectRow();
    await waitFor(() => {
      expect(bulkActionLabels()).toStrictEqual(['Bulk Edit', 'Delete']);
    });
  });

  it('offers a reader no New, no Bulk Edit and no Delete', async () => {
    roles = ['Guest'];
    renderList();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: doctype })).toBeTruthy();
    });
    await settle();
    expect(screen.queryByLabelText(`New ${doctype}`)).toBeNull();
    await selectRow();
    await act(async () => {
      await delay(50);
    });
    expect(bulkActionLabels()).toStrictEqual([]);
  });
});
