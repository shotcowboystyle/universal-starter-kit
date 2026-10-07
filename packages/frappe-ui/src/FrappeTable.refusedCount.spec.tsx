// LC-96 (MPO-477): Frappe refuses frappe.client.get_count to Guest while
// /api/resource still lists the rows Guest may read. The infinite server
// table loads page 0 as rows and count together, so the refused count failed
// the whole page and a readable list showed no rows.
import type { DataTableColumn } from '@repo/table';
import { renderWithProviders } from '@repo/test-utils';
import { act, cleanup, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { FrappeProvider } from './FrappeProvider';
import { FrappeTable } from './FrappeTable';

const doctype = 'Pokemon';

interface Pokemon {
  name: string;
  doctype: string;
  pokemon_name: string;
}

const columns: DataTableColumn<Partial<Pokemon>>[] = [
  { id: 'name', accessorKey: 'name', header: 'ID' },
  { id: 'pokemon_name', accessorKey: 'pokemon_name', header: 'Pokemon Name' },
];

const filterFields = [{ id: 'pokemon_name', label: 'Pokemon Name', type: 'text' as const }];
const readOnly = { create: false, write: false, delete: false };
const settle = { timeout: 8000 };

let run = 0;
let countAnswer: 'refused' | 'broken' = 'refused';
let countReads = 0;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeAll(async () => {
  await i18next.use(initReactI18next).init({
    lng: 'en',
    interpolation: { escapeValue: false },
    resources: { en: { translation: {} } },
  });
});

beforeEach(() => {
  run += 1;
  countAnswer = 'refused';
  countReads = 0;
  vi.stubGlobal('fetch', async (input: string | URL | Request) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    if (url.pathname === '/api/method/frappe.client.get_count') {
      countReads += 1;
      return countAnswer === 'refused'
        ? json({ exc_type: 'PermissionError', exception: 'Not permitted' }, 403)
        : json({ exc_type: 'ValidationError', exception: 'Count timed out' }, 417);
    }
    if (url.pathname === `/api/resource/${doctype}`) {
      return json({
        data: [
          { name: 'bulbasaur', pokemon_name: 'Bulbasaur' },
          { name: 'ivysaur', pokemon_name: 'Ivysaur' },
        ],
      });
    }
    return json({ exc_type: 'PermissionError' }, 403);
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderTable() {
  return renderWithProviders(
    <FrappeProvider
      baseURL={`https://refused-count-${run}.spec.test`}
      realtime={false}>
      <FrappeTable<Pokemon>
        doctype={doctype}
        columns={columns}
        filterableFields={filterFields}
        rights={readOnly}
        serverSide
        enablePagination
        paginationMode="infinite"
      />
    </FrappeProvider>,
  );
}

describe('FrappeTable infinite server mode with the count refused', () => {
  it('lists the rows without a total', async () => {
    renderTable();
    await waitFor(() => {
      expect(screen.getByText('Bulbasaur')).toBeTruthy();
    }, settle);
    expect(screen.getByText('Ivysaur')).toBeTruthy();
    expect(screen.queryByText(/Error loading/)).toBeNull();
  });

  it('still fails the page on a count that failed for another reason', async () => {
    countAnswer = 'broken';
    renderTable();
    await waitFor(() => {
      expect(countReads).toBe(1);
    }, settle);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    expect(screen.queryByText('Bulbasaur')).toBeNull();
  });
});
