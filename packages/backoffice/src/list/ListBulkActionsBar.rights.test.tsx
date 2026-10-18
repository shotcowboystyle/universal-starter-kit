// The bulk actions bar offers Bulk Edit / Submit / Cancel / Delete only as
// far as the session's roles grant them on the doctype (MPO-428), measured
// against a live-shaped bench: the session RPCs for the user and roles, with
// meta (and its DocPerm rows) passed in as a prop, so the bar never asks for
// meta itself.
import { setTimeout as delay } from 'node:timers/promises';

import { renderWithProviders } from '@repo/test-utils';
import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BackofficeProvider } from '../config/BackofficeProvider';
import { createMemoryNavigator } from '../navigation/navigator';
import type { DoctypeMeta } from '../shared/use-doctype-meta';

import { ListBulkActionsBar } from './ListBulkActionsBar';

const doctype = 'QA Submittable';

const meta: DoctypeMeta = {
  name: doctype,
  is_submittable: 1,
  fields: [{ fieldname: 'subject', fieldtype: 'Data', label: 'Subject' }],
  permissions: [
    {
      role: 'Pokemon Editor',
      read: 1,
      write: 1,
      create: 1,
      delete: 1,
      submit: 1,
      cancel: 1,
    },
    { role: 'Pokemon Writer', read: 1, write: 1, create: 1 },
    { role: 'Guest', read: 1 },
  ],
};

let run = 0;
let roles: string[] = [];
let sessionAnswered = false;
let requested: string[] = [];

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- fixture JSON bodies are arbitrary
const json = (body: unknown, status = 200) => Response.json(body, { status });

const renderBar = (barMeta: DoctypeMeta = meta) =>
  renderWithProviders(
    <BackofficeProvider
      frappe={{ baseURL: `https://list-bulk-rights-${run}.spec.test` }}
      navigation={createMemoryNavigator('/backoffice')}>
      <ListBulkActionsBar
        doctype={barMeta.name}
        meta={barMeta}
        selectedNames={['SUB-001', 'SUB-002']}
        onClearSelection={() => {}}
        onActionComplete={() => {}}
      />
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

const writeActionLabels = (): string[] => {
  const root = within(document.body);
  return ['Bulk Edit', 'Submit', 'Cancel', 'Delete'].filter(
    (label) => root.queryByRole('button', { name: label }) !== null,
  );
};

describe('ListBulkActionsBar rights', () => {
  beforeEach(() => {
    run += 1;
    sessionAnswered = false;
    requested = [];
    vi.stubGlobal('fetch', async (input: string | URL | Request) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      const method = url.pathname.replace(/^\/api\/method\//u, '');
      requested.push(method);
      if (method === 'frappe.auth.get_logged_user') {
        return json({ message: 'user@pokemon.test' });
      }
      if (method === 'frappe.core.doctype.user.user.get_roles') {
        sessionAnswered = true;
        return json({ message: roles });
      }
      return json({ data: [], message: [] });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('offers an editor Bulk Edit, Submit, Cancel and Delete', async () => {
    roles = ['Pokemon Editor', 'Guest'];
    renderBar();
    await settle();
    await waitFor(() => {
      expect(writeActionLabels()).toStrictEqual(['Bulk Edit', 'Submit', 'Cancel', 'Delete']);
    });
    expect(screen.getByText('2 selected')).toBeTruthy();
    expect(requested.filter((method) => method.includes('getdoctype'))).toStrictEqual([]);
  });

  it('offers a writer without delete Bulk Edit alone', async () => {
    roles = ['Pokemon Writer', 'Guest'];
    renderBar();
    await settle();
    await waitFor(() => {
      expect(writeActionLabels()).toStrictEqual(['Bulk Edit']);
    });
  });

  it("keeps Submit and Cancel off a doctype that isn't submittable, even for an editor", async () => {
    roles = ['Pokemon Editor', 'Guest'];
    renderBar({ ...meta, name: 'QA Plain', is_submittable: 0 });
    await settle();
    await waitFor(() => {
      expect(writeActionLabels()).toStrictEqual(['Bulk Edit', 'Delete']);
    });
  });

  it('offers a reader none of Bulk Edit, Submit, Cancel or Delete', async () => {
    roles = ['Guest'];
    renderBar();
    await settle();
    expect(writeActionLabels()).toStrictEqual([]);
    expect(screen.getByText('2 selected')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeTruthy();
  });
});
