// A Keycloak-signed-in reader hands the provider its token as a getter
// (MPO-399). Every request the list makes must carry that bearer: the bench
// answers a tokenless call as Guest (403), which is how the header count
// read "0 results" beside a full page of rows.
import { renderWithProviders } from '@repo/test-utils';
import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BackofficeProvider } from '../config/BackofficeProvider';
import { createMemoryNavigator } from '../navigation/navigator';

import { DoctypeListScreen } from './DoctypeListScreen';

const doctype = 'Pokemon';
const bearer = 'Bearer kc-access-token';

const meta = {
  name: doctype,
  doctype: 'DocType',
  title_field: 'pokemon_name',
  fields: [{ fieldname: 'pokemon_name', fieldtype: 'Data', label: 'Pokemon Name', in_list_view: 1 }],
  permissions: [{ role: 'Pokemon Reader', read: 1 }],
};

let run = 0;
let calls: { path: string; authorization: string | null }[] = [];

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
    const headers = new Headers(input instanceof Request ? input.headers : init?.headers);
    const authorization = headers.get('Authorization');
    calls.push({ path: `${url.pathname}${url.search}`, authorization });
    if (authorization !== bearer) {
      return json({ exc_type: 'PermissionError' }, 403);
    }
    const method = url.pathname.replace(/^\/api\/method\//, '');
    if (method === 'frappe.auth.get_logged_user') {
      return json({ message: 'ash@pokemon.test' });
    }
    if (method === 'frappe.core.doctype.user.user.get_roles') {
      return json({ message: ['Pokemon Reader'] });
    }
    if (method === 'frappe.desk.form.load.getdoctype') {
      return json({ docs: [meta] });
    }
    if (method === 'frappe.client.get_count') {
      return json({ message: 21 });
    }
    if (url.pathname === `/api/resource/${doctype}`) {
      return json({ data: [{ name: 'bulbasaur', doctype, pokemon_name: 'Bulbasaur' }] });
    }
    return json({ data: [], message: [] });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('DoctypeListScreen auth', () => {
  it("sends the provider's token getter on every call, the header count included", async () => {
    renderWithProviders(
      <BackofficeProvider
        frappe={{
          baseURL: `https://list-auth-${run}.spec.test`,
          auth: { useToken: true, type: 'Bearer', token: async () => 'kc-access-token' },
        }}
        navigation={createMemoryNavigator('/backoffice')}>
        <DoctypeListScreen doctype={doctype} />
      </BackofficeProvider>,
    );

    await waitFor(
      () => {
        expect(screen.getByText('21 results')).toBeTruthy();
      },
      { timeout: 5000 },
    );
    const counts = calls.filter((call) => call.path.includes('frappe.client.get_count'));
    expect(counts.length).toBeGreaterThan(0);
    expect(calls.filter((call) => call.authorization !== bearer)).toEqual([]);
  });
});
