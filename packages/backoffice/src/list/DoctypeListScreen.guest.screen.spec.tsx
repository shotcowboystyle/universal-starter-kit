// LC-96 on the desk list (MPO-477), the list twin of MPO-473. Signed out,
// pokemon's bench refuses getdoctype, get_count and every desk RPC to Guest
// while Guest can still read the rows through /api/resource, and the desk list
// stopped at its own "Could not load Pokemon". The bench below answers the way
// Frappe's is_whitelisted refuses Guest (one message, a <details> summary and
// body) and answers or refuses the rows per test.
import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BackofficeProvider } from '../config/BackofficeProvider';
import { createMemoryNavigator } from '../navigation/navigator';

import { DoctypeListScreen } from './DoctypeListScreen';

const doctype = 'Pokemon';

const rows = [
  {
    name: 'bulbasaur',
    owner: 'Administrator',
    creation: '2026-09-27 13:56:40.000000',
    modified: '2026-09-27 13:56:40.000000',
    modified_by: 'Administrator',
    docstatus: 0,
    idx: 0,
    _liked_by: null,
    _assign: null,
    _user_tags: null,
    _comments: null,
    pokemon_name: 'Bulbasaur',
    species: 'Seed Pokémon',
    base_experience: 64,
  },
  {
    name: 'ivysaur',
    owner: 'Administrator',
    creation: '2026-09-27 13:56:41.000000',
    modified: '2026-09-27 13:56:41.000000',
    modified_by: 'Administrator',
    docstatus: 0,
    idx: 0,
    _liked_by: null,
    _assign: null,
    _user_tags: null,
    _comments: null,
    pokemon_name: 'Ivysaur',
    species: 'Seed Pokémon',
    base_experience: 142,
  },
];

const refusal = (method: string) => ({
  message: `<details><summary>You are not permitted to access this resource. Login to access</summary>Function <strong>${method}</strong> is not whitelisted.</details>`,
  title: 'Method Not Allowed',
  indicator: 'red',
  raise_exception: 1,
});

const settle = { timeout: 8000 };

let run = 0;
let metaAnswer: 'refused' | 'broken' = 'refused';
let rowsReadable = true;
let metaReads = 0;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function refused(method: string) {
  const message = refusal(method);
  return json(
    {
      exc_type: 'PermissionError',
      exception: `frappe.exceptions.PermissionError: ${message.message}`,
      _server_messages: JSON.stringify([JSON.stringify(message)]),
    },
    403,
  );
}

beforeEach(() => {
  run += 1;
  metaAnswer = 'refused';
  rowsReadable = true;
  metaReads = 0;
  vi.stubGlobal('fetch', async (input: string | URL | Request) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const method = url.pathname.replace(/^\/api\/method\//, '');
    if (method === 'frappe.desk.form.load.getdoctype') {
      metaReads += 1;
      return metaAnswer === 'refused'
        ? refused(method)
        : json({ exc_type: 'ValidationError', exception: 'Pokemon is being migrated' }, 417);
    }
    if (url.pathname.startsWith('/api/method/')) {
      return refused(method);
    }
    if (url.pathname === `/api/resource/${doctype}`) {
      if (!rowsReadable) {
        return json({ exc_type: 'PermissionError', exception: 'Not permitted' }, 403);
      }
      const limit = Number(url.searchParams.get('limit_page_length') ?? rows.length);
      return json({ data: rows.slice(0, limit || rows.length) });
    }
    return refused(url.pathname);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderList() {
  return renderWithProviders(
    <BackofficeProvider
      frappe={{ baseURL: `https://desk-list-guest-${run}.spec.test` }}
      navigation={createMemoryNavigator('/backoffice')}>
      <DoctypeListScreen doctype={doctype} />
    </BackofficeProvider>,
  );
}

function button(name: string): HTMLElement | undefined {
  return [...document.querySelectorAll('[role="button"], button')].find(
    (node) => node.getAttribute('aria-label') === name || node.textContent?.trim() === name,
  ) as HTMLElement | undefined;
}

describe('DoctypeListScreen with DocType meta refused (LC-96)', () => {
  it("lists the rows Guest can read, laid out from a record's own fields", async () => {
    renderList();
    await waitFor(() => {
      expect(screen.getByText('Bulbasaur')).toBeTruthy();
    }, settle);
    expect(screen.getByText('Ivysaur')).toBeTruthy();
    expect(screen.getByText('142')).toBeTruthy();
    expect(screen.queryByText(/Could not load/)).toBeNull();
    expect(screen.queryByText(/Error loading/)).toBeNull();
    expect(metaReads).toBe(1);
  });

  it('offers nothing that needs the refused meta or a write right', async () => {
    renderList();
    await waitFor(() => {
      expect(screen.getByText('Bulbasaur')).toBeTruthy();
    }, settle);
    expect(button(`New ${doctype}`)).toBeUndefined();
    expect(screen.queryAllByLabelText(/^Select row/)).toEqual([]);
    expect(button('Add to liked')).toBeUndefined();
    expect(screen.queryByLabelText('List filters sidebar')).toBeNull();
    expect(button('Sort')).toBeUndefined();
    expect(screen.queryByText(/\d+ results?$/)).toBeNull();
    fireEvent.click(screen.getByTestId('list-view-switcher'));
    await waitFor(() => {
      expect(screen.getByRole('menu')).toBeTruthy();
    }, settle);
    const views = [...document.querySelectorAll('[role="menuitemcheckbox"]')].map((node) => node.textContent?.trim());
    expect(views).toEqual(['List', 'Report']);
  });

  it("says the reader can't open the list when no row is readable, with no retry", async () => {
    rowsReadable = false;
    renderList();
    const state = await screen.findByTestId('frappe-list-not-permitted', {}, settle);
    expect(state.textContent).toContain(`You can't open the ${doctype} list`);
    const lines = [...state.querySelectorAll('p')].map((node) => node.textContent);
    expect(lines).toContain('You are not permitted to access this resource. Login to access');
    expect(lines).toContain('Function frappe.desk.form.load.getdoctype is not whitelisted.');
    expect(screen.queryByText(/Could not load/)).toBeNull();
    expect(screen.queryByRole('button', { name: /retry/i })).toBeNull();
  });

  it('keeps a meta read that failed for another reason a retryable error', async () => {
    metaAnswer = 'broken';
    renderList();
    await waitFor(() => {
      expect(screen.getByText(/Pokemon is being migrated/)).toBeTruthy();
    }, settle);
    expect(screen.queryByTestId('frappe-list-not-permitted')).toBeNull();
    const retry = screen.getByRole('button', { name: /retry/i });
    fireEvent.click(retry);
    await waitFor(() => {
      expect(metaReads).toBe(2);
    }, settle);
  });
});
