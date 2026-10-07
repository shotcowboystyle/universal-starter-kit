import { InMemoryFixtureProvider } from '@repo/frappe';
import { renderWithProviders } from '@repo/test-utils';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
// The alternate views' shared header (MPO-414): the switcher offers what the
// doctype's meta supports and navigates there, and New is offered only as far
// as the newDoc capability and the session's create right allow (MPO-390).
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BackofficeProvider } from '../config/BackofficeProvider';
import type { BackofficeCapabilities } from '../config/capabilities';
import { createMemoryNavigator } from '../navigation/navigator';
import type { MemoryNavigator } from '../navigation/navigator';
import type { BackofficeView } from '../navigation/paths';

import { ViewHeader } from './ViewHeader';

const plainMeta = {
  name: 'QaHeaderNote',
  doctype: 'DocType',
  module: 'QA',
  fields: [{ fieldname: 'subject', fieldtype: 'Data', label: 'Subject', in_list_view: 1 }],
  permissions: [{ role: 'All', read: 1 }],
};

const imageMeta = {
  name: 'QaHeaderProduct',
  doctype: 'DocType',
  module: 'QA',
  title_field: 'product_name',
  image_field: 'photo',
  fields: [
    { fieldname: 'product_name', fieldtype: 'Data', label: 'Product Name', in_list_view: 1 },
    { fieldname: 'photo', fieldtype: 'Attach Image', label: 'Photo' },
  ],
  permissions: [{ role: 'All', read: 1 }],
};

const moveMeta = {
  name: 'Poke Move',
  doctype: 'DocType',
  title_field: 'move_name',
  fields: [{ fieldname: 'move_name', fieldtype: 'Data', label: 'Move Name', in_list_view: 1 }],
  permissions: [
    { role: 'Pokemon Editor', read: 1, write: 1, create: 1, delete: 1 },
    { role: 'Guest', read: 1 },
  ],
};

let run = 0;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderFixtureHeader(
  doctype: string,
  view: BackofficeView,
  capabilities?: BackofficeCapabilities,
): MemoryNavigator {
  run += 1;
  const navigation = createMemoryNavigator('/backoffice');
  renderWithProviders(
    <BackofficeProvider
      frappe={{
        baseURL: `https://view-header-${run}.spec.test`,
        fixtures: new InMemoryFixtureProvider({ DocType: [plainMeta, imageMeta] }),
      }}
      navigation={navigation}
      capabilities={capabilities}>
      <ViewHeader
        doctype={doctype}
        view={view}
      />
    </BackofficeProvider>,
  );
  return navigation;
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function renderBenchHeader(roles: string[]) {
  run += 1;
  let rolesAnswered = false;
  vi.stubGlobal('fetch', async (input: string | URL | Request) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const method = url.pathname.replace(/^\/api\/method\//, '');
    if (method === 'frappe.auth.get_logged_user') {
      return json({ message: 'user@pokemon.test' });
    }
    if (method === 'frappe.core.doctype.user.user.get_roles') {
      rolesAnswered = true;
      return json({ message: roles });
    }
    if (method === 'frappe.desk.form.load.getdoctype') {
      return json({ docs: [moveMeta] });
    }
    return json({ data: [], message: [] });
  });
  renderWithProviders(
    <BackofficeProvider
      frappe={{ baseURL: `https://view-header-bench-${run}.spec.test` }}
      navigation={createMemoryNavigator('/backoffice')}>
      <ViewHeader
        doctype="Poke Move"
        view="report"
      />
    </BackofficeProvider>,
  );
  return {
    rolesAnswered: () => rolesAnswered,
    settle: async () => {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 300));
      });
    },
  };
}

async function openSwitcher() {
  fireEvent.click(await screen.findByTestId('list-view-switcher', {}, { timeout: 5000 }));
  await screen.findByRole('menu', {}, { timeout: 5000 });
}

function offeredViews(): string[] {
  return Array.from(document.querySelectorAll('[role="menuitemcheckbox"]'), (node) => node.textContent?.trim() ?? '');
}

describe('<ViewHeader />', () => {
  it('titles the page with the doctype', async () => {
    renderFixtureHeader('QaHeaderNote', 'report');
    await expect(screen.findByRole('heading', { name: 'QaHeaderNote' })).resolves.toBeTruthy();
  });

  it("offers Image only when the doctype's meta has an image field", async () => {
    renderFixtureHeader('QaHeaderProduct', 'report');
    await openSwitcher();
    await waitFor(() => {
      expect(offeredViews()).toContain('Image');
    });
  });

  it('leaves Image and Tree out for a plain doctype', async () => {
    renderFixtureHeader('QaHeaderNote', 'report');
    await openSwitcher();
    await waitFor(() => {
      expect(offeredViews()).toContain('Report');
    });
    expect(offeredViews()).not.toContain('Image');
    expect(offeredViews()).not.toContain('Tree');
  });

  it('navigates to the view picked in the switcher', async () => {
    const navigation = renderFixtureHeader('QaHeaderProduct', 'report');
    await openSwitcher();
    const image = await waitFor(() => {
      const item = [...document.querySelectorAll('[role="menuitemcheckbox"]')].find(
        (node) => node.textContent?.trim() === 'Image',
      );
      expect(item).toBeTruthy();
      return item as HTMLElement;
    });
    fireEvent.click(image);
    await waitFor(() => {
      expect(navigation.getLocation().path).toBe('/backoffice/qaheaderproduct/view/image');
    });
  });

  it('opens a new record from New, and hides New when the newDoc capability is off', async () => {
    const navigation = renderFixtureHeader('QaHeaderNote', 'report');
    fireEvent.click(await screen.findByLabelText('New QaHeaderNote', {}, { timeout: 5000 }));
    expect(navigation.getLocation().path).toBe('/backoffice/qaheadernote/new');

    renderFixtureHeader('QaHeaderProduct', 'report', { newDoc: false });
    await screen.findByRole('heading', { name: 'QaHeaderProduct' });
    expect(screen.queryByLabelText('New QaHeaderProduct')).toBeNull();
  });

  it('offers an editor New on a live bench', async () => {
    renderBenchHeader(['Pokemon Editor', 'Guest']);
    await expect(screen.findByLabelText('New Poke Move', {}, { timeout: 5000 })).resolves.toBeTruthy();
  });

  it('offers a reader no New on a live bench', async () => {
    const bench = renderBenchHeader(['Guest']);
    await screen.findByRole('heading', { name: 'Poke Move' });
    await bench.settle();
    expect(screen.queryByLabelText('New Poke Move')).toBeNull();
    expect(bench.rolesAnswered()).toBe(true);
  });
});
