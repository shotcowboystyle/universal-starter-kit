// FrappeTable offers editing, Add Row and row delete only as far as the
// session's roles grant write, create and delete on the doctype (MPO-390).
// Cells are fields by default, so without write they must render read-only
// instead of inputs whose edits the bench would refuse.
import { setTimeout as sleep } from 'node:timers/promises';

import type { DataTableColumn } from '@repo/table';
import { renderWithProviders } from '@repo/test-utils';
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { FrappeProvider } from './FrappeProvider';
import { FrappeTable } from './FrappeTable';

const doctype = 'Poke Move';

const meta = {
  name: doctype,
  doctype: 'DocType',
  title_field: 'move_name',
  fields: [{ fieldname: 'move_name', fieldtype: 'Data', label: 'Move Name' }],
  permissions: [
    { role: 'Pokemon Editor', read: 1, write: 1, create: 1, delete: 1 },
    { role: 'Guest', read: 1 },
  ],
};

interface Move {
  name: string;
  doctype: string;
  move_name?: string;
}

const columns: DataTableColumn<Partial<Move>>[] = [
  { id: 'move_name', accessorKey: 'move_name', header: 'Move Name', field: 'input' },
];

let run = 0;
let bench = '';
let roles: string[] = [];
let sessionAnswered = false;
let requests: string[] = [];

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- the stubbed fetch answers with arbitrary JSON payloads
const json = (body: unknown, status = 200) => Response.json(body, { status });

const renderTable = (props: Partial<Parameters<typeof FrappeTable<Move>>[0]> = {}) =>
  renderWithProviders(
    <FrappeProvider
      baseURL={bench}
      realtime={false}>
      <FrappeTable<Move>
        doctype={doctype}
        columns={columns}
        layout="table"
        showAddRow
        showDeleteRow
        {...props}
      />
    </FrappeProvider>,
  );

// A surface that never asks for the session is judged on what it shows.
const settle = async () => {
  try {
    await waitFor(
      () => {
        expect(sessionAnswered).toBe(true);
      },
      { timeout: 1500 },
    );
  } catch {
    // Safe to continue: a surface that never asks for the session is judged on what it shows
  }
  await act(async () => {
    await sleep(20);
  });
};

const showsTackle = (container: HTMLElement): boolean =>
  [...container.querySelectorAll('[role="row"]')].some(
    (row) =>
      row.textContent?.includes('tackle') || [...row.querySelectorAll('input')].some((node) => node.value === 'tackle'),
  );

const cellInputs = (container: HTMLElement): HTMLInputElement[] => [
  ...container.querySelectorAll<HTMLInputElement>('[role="row"] input'),
];

describe('FrappeTable rights', () => {
  beforeAll(async () => {
    // oxlint-disable-next-line import/no-named-as-default-member -- chained setup on the default instance is i18next's documented API
    await i18next.use(initReactI18next).init({
      lng: 'en',
      interpolation: { escapeValue: false },
      resources: { en: { translation: {} } },
    });
  });
  beforeEach(() => {
    run += 1;
    bench = `http://table-rights-${run}.spec.test`;
    sessionAnswered = false;
    requests = [];
    vi.stubGlobal('fetch', async (input: string | URL | Request) => {
      const url = new URL(String(input instanceof Request ? input.url : input));
      const method = url.pathname.replace(/^\/api\/method\//u, '');
      requests.push(method);
      if (method === 'frappe.auth.get_logged_user') {
        return json({ message: 'someone@pokemon.test' });
      }
      if (method === 'frappe.core.doctype.user.user.get_roles') {
        sessionAnswered = true;
        return json({ message: roles });
      }
      if (method === 'frappe.desk.form.load.getdoctype') {
        return json({ docs: [meta] });
      }
      if (url.pathname === `/api/resource/${encodeURIComponent(doctype)}`) {
        return json({ data: [{ name: 'a1b2c3', doctype, move_name: 'tackle' }] });
      }
      return json({ data: [], message: [] });
    });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('gives an editor input cells, Add Row and row delete', async () => {
    roles = ['Pokemon Editor', 'Guest'];
    const { container } = renderTable();
    await waitFor(() => {
      expect(cellInputs(container).map((node) => node.value)).toContain('tackle');
    });
    expect(screen.getByLabelText('Add Row')).toBeTruthy();
    expect(screen.getAllByLabelText(/^Delete row 1$/u).length).toBeGreaterThan(0);
  });

  it('gives a reader read-only cells, no Add Row and no row delete', async () => {
    roles = ['Guest'];
    const { container } = renderTable();
    await waitFor(() => {
      expect(showsTackle(container)).toBe(true);
    });
    await settle();
    expect(cellInputs(container)).toStrictEqual([]);
    expect(screen.queryByLabelText('Add Row')).toBeNull();
    expect(screen.queryAllByLabelText(/^Delete row 1$/u)).toStrictEqual([]);
  });

  it('takes rights from the host without reading meta or the session', async () => {
    roles = ['Pokemon Editor'];
    const { container } = renderTable({
      rights: { create: false, write: false, delete: false },
      filterableFields: [{ id: 'move_name', label: 'Move Name', type: 'text' }],
    });
    await waitFor(() => {
      expect(showsTackle(container)).toBe(true);
    });
    expect(cellInputs(container)).toStrictEqual([]);
    expect(screen.queryByLabelText('Add Row')).toBeNull();
    expect(requests).not.toContain('frappe.desk.form.load.getdoctype');
    expect(requests).not.toContain('frappe.core.doctype.user.user.get_roles');
  });
});
