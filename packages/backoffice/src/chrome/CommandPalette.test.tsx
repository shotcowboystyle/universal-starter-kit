import { setTimeout as delay } from 'node:timers/promises';

import { InMemoryFixtureProvider } from '@repo/frappe';
import { renderWithProviders } from '@repo/test-utils';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BackofficeProvider } from '../config/BackofficeProvider';
import type { BackofficeProviderProps } from '../config/BackofficeProvider';
import { createMemoryNavigator } from '../navigation/navigator';
import { BackofficeShell } from '../shell/BackofficeShell';

import type { RecentItem } from './awesomebar-data';
import { CommandPalette } from './CommandPalette';

// The shared desk recent store rides @repo/store, which the
// vitest module graph duplicates (inlined vs externalized resolutions), so a
// spec-side storage write never reaches the copy the palette reads. Stub the
// read seam instead; the store round-trip is covered by the store package.
const recentsSeed = { items: [] as RecentItem[] };
vi.mock(import('./awesomebar-data'), async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, readRecentItems: async () => recentsSeed.items };
});

// Unique host per spec file: the awesomebar catalog cache is module-global
// and keyed by baseURL, so sharing a host with other spec files would leak
// their fixture catalogs in here.
const MOCK_HOST = 'https://backoffice-palette.mock.test';

const makeFixtures = () =>
  new InMemoryFixtureProvider({
    DocType: [
      { name: 'ToDo', doctype: 'DocType' },
      { name: 'ToDo Template', doctype: 'DocType' },
      { name: 'Note', doctype: 'DocType' },
      { name: 'User', doctype: 'DocType' },
    ],
    Workspace: [
      {
        name: 'todos',
        doctype: 'Workspace',
        title: 'Todos',
        icon: 'tool',
        parent_page: '',
        public: 1,
        for_user: '',
        sequence_id: 1,
        module: 'Automation',
        is_hidden: 0,
      },
    ],
    'Notification Log': [],
  });

const GLOBAL_SEARCH_HITS = [
  {
    doctype: 'ToDo',
    name: 'TD-0001',
    content: 'Description: pay the rent ||| Status: Open',
  },
];

const stubFetch = () => {
  const fetchMock = vi.fn<typeof fetch>(async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes('frappe.utils.global_search.search')) {
      return Response.json(
        { message: GLOBAL_SEARCH_HITS },
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return Response.json({}, { status: 404, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const renderShell = (props: Partial<BackofficeProviderProps> = {}) => {
  const navigation = props.navigation ?? createMemoryNavigator('/backoffice');
  return {
    navigation,
    ...renderWithProviders(
      <BackofficeProvider
        frappe={{ baseURL: MOCK_HOST, fixtures: makeFixtures() }}
        navigation={navigation}
        {...props}>
        <BackofficeShell>
          <div>page body</div>
        </BackofficeShell>
      </BackofficeProvider>,
    ),
  };
};

/** Open the palette through the navbar trigger and return its search input. */
const openPalette = async () => {
  fireEvent.click(screen.getByTestId('backoffice-awesomebar'));
  const palette = await screen.findByTestId('backoffice-command-palette');
  const input = palette.querySelector('input');
  if (!input) {
    throw new Error('palette input not found');
  }
  return { palette, input };
};

/** Labels are split across match-highlight spans; read the concatenated label. */
const optionLabel = (el: Element): string => el.querySelector('.is_Text')?.textContent ?? '';

const findOption = (label: string, root: ParentNode = document): Element => {
  const found = [...root.querySelectorAll('[role="option"]')].find((el) => optionLabel(el) === label);
  expect(found, `option "${label}"`).toBeTruthy();
  return found!;
};

const queryOption = (label: string): Element | null =>
  [...document.querySelectorAll('[role="option"]')].find((el) => optionLabel(el) === label) ?? null;

// ---------------------------------------------------------------------------
// Standalone mount (MPO-189) — the shape CommandPalette.stories.tsx uses:
// the palette controlled directly, with no shell and no trigger, so the
// section model is reachable without the navbar.
// ---------------------------------------------------------------------------

const renderStandalone = (open = true) => {
  const navigation = createMemoryNavigator('/backoffice');
  const onOpenChange = vi.fn<(open: boolean) => void>();
  return {
    navigation,
    onOpenChange,
    ...renderWithProviders(
      <BackofficeProvider
        frappe={{ baseURL: MOCK_HOST, fixtures: makeFixtures() }}
        navigation={navigation}>
        <CommandPalette
          open={open}
          onOpenChange={onOpenChange}
        />
      </BackofficeProvider>,
    ),
  };
};

describe(CommandPalette, () => {
  beforeEach(() => {
    stubFetch();
    recentsSeed.items = [{ label: 'My ToDo', path: '/backoffice/todo/x' }];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    recentsSeed.items = [];
  });

  describe('CommandPalette sections', () => {
    it('composes sections in order: recent → actions → navigation → documents', async () => {
      renderShell();
      const { input } = await openPalette();

      fireEvent.change(input, { target: { value: 'todo' } });

      // Documents arrive after the 300ms debounce + stubbed RPC.
      await waitFor(
        () => {
          expect(screen.getByTestId('backoffice-palette-section-documents')).toBeTruthy();
        },
        { timeout: 3000 },
      );

      const sectionNodes = [
        ...document.querySelectorAll<HTMLElement>('[data-testid^="backoffice-palette-section-"]'),
      ].map((node) => node.dataset.testid);
      expect(sectionNodes).toStrictEqual([
        'backoffice-palette-section-recent',
        'backoffice-palette-section-actions',
        'backoffice-palette-section-navigation',
        'backoffice-palette-section-documents',
      ]);

      // Recents: the stored visit matching the query.
      const recent = screen.getByTestId('backoffice-palette-section-recent');
      findOption('My ToDo', recent);

      // Actions: contextual commands for the top doctype match.
      const actions = screen.getByTestId('backoffice-palette-section-actions');
      findOption('New ToDo', actions);
      findOption('ToDo List', actions);

      // Navigation: matching workspace + further doctype matches.
      const navigation = screen.getByTestId('backoffice-palette-section-navigation');
      findOption('Todos', navigation);
      findOption('ToDo Template', navigation);

      // Documents: global-search hit with its doctype badge + snippet.
      const documents = screen.getByTestId('backoffice-palette-section-documents');
      expect(within(documents).getByText('TD-0001')).toBeTruthy();
      expect(within(documents).getByText(/pay the rent/u)).toBeTruthy();
    });

    it('empty query shows recent only (skip empty sections, hint when no recent)', async () => {
      renderShell();
      await openPalette();

      await expect(screen.findByTestId('backoffice-palette-section-recent')).resolves.toBeTruthy();
      expect(screen.queryByTestId('backoffice-palette-section-actions')).toBeNull();
      expect(screen.queryByTestId('backoffice-palette-section-navigation')).toBeNull();
      expect(screen.queryByTestId('backoffice-palette-section-documents')).toBeNull();
    });
  });

  describe('CommandPalette keyboard', () => {
    it('arrows move the roving highlight and Enter navigates via the navigator', async () => {
      const { navigation } = renderShell();
      const { input } = await openPalette();

      fireEvent.change(input, { target: { value: 'note' } });

      // Actions for the top match render synchronously from the catalog.
      await waitFor(() => findOption('New Note'));

      // items[0] = "New Note"; ArrowDown → items[1] = "Note List".
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      await waitFor(() => findOption('Note List'));
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(navigation.getLocation().path).toBe('/backoffice/note');
      // COMMIT class: the pick closed the palette.
      await waitFor(() => {
        expect(screen.queryByTestId('backoffice-command-palette')).toBeNull();
      });
    });

    it('Escape closes the palette and returns focus to the trigger (D-22)', async () => {
      renderShell();
      const trigger = screen.getByTestId('backoffice-awesomebar');
      trigger.focus();
      const { input } = await openPalette();

      fireEvent.keyDown(input, { key: 'Escape' });

      await waitFor(() => {
        expect(screen.queryByTestId('backoffice-command-palette')).toBeNull();
      });
      await waitFor(() => {
        expect(document.activeElement).toBe(trigger);
      });
    });

    it('Home/End jump the highlight to the first/last row', async () => {
      renderShell();
      const { input } = await openPalette();
      fireEvent.change(input, { target: { value: 'note' } });
      await waitFor(() => findOption('New Note'));

      fireEvent.keyDown(input, { key: 'End' });
      await waitFor(() => {
        const selected = document.querySelector('[role="option"][aria-selected="true"]');
        expect(selected?.textContent).toMatch(/Note/u);
        const options = document.querySelectorAll('[role="option"]');
        expect(selected).toBe([...options].at(-1));
      });

      fireEvent.keyDown(input, { key: 'Home' });
      await waitFor(() => {
        const selected = document.querySelector('[role="option"][aria-selected="true"]');
        expect(selected).toBe(document.querySelectorAll('[role="option"]')[0]);
      });
    });

    it('Mod+K on the input toggles the palette closed (Linear)', async () => {
      renderShell();
      const { input } = await openPalette();
      fireEvent.keyDown(input, { key: 'k', ctrlKey: true });
      await waitFor(() => {
        expect(screen.queryByTestId('backoffice-command-palette')).toBeNull();
      });
    });

    it('fuzzy subsequence still ranks the top doctype (tdo → ToDo)', async () => {
      renderShell();
      const { input } = await openPalette();
      fireEvent.change(input, { target: { value: 'tdo' } });
      await waitFor(() => findOption('New ToDo'));
      expect(document.querySelector("[data-match='true']")).toBeTruthy();
    });
  });

  describe('CommandPalette capability + scoping', () => {
    it('awesomebar capability off → no trigger and the palette never mounts', async () => {
      renderShell({ capabilities: { awesomebar: false } });

      expect(screen.queryByTestId('backoffice-awesomebar')).toBeNull();

      // The shell shortcut (Mod+K) is not wired when the capability is off.
      fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true });
      await delay(50);
      expect(screen.queryByTestId('backoffice-command-palette')).toBeNull();
    });

    it('Mod+K opens the palette when the capability is on', async () => {
      renderShell();

      fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true });

      await expect(screen.findByTestId('backoffice-command-palette')).resolves.toBeTruthy();
    });

    it('doctype deny scoping removes actions, navigation rows, and document hits', async () => {
      const fetchMock = globalThis.fetch as ReturnType<typeof vi.fn>;
      renderShell({ doctypes: { deny: ['ToDo'] } });
      const { input } = await openPalette();

      fireEvent.change(input, { target: { value: 'todo' } });

      // oxlint-disable-next-line sonarjs/todo-tag -- names the Frappe doctype, not a task marker
      // Top allowed match becomes "ToDo Template" — its commands render…
      await waitFor(() => findOption('New ToDo Template'));
      // …while the denied doctype's exact commands never do.
      expect(queryOption('New ToDo')).toBeNull();
      expect(queryOption('ToDo List')).toBeNull();

      // Wait for the debounced global search to settle, then assert the denied
      // doctype's document hit was scoped out.
      await waitFor(
        () => {
          expect(
            fetchMock.mock.calls.some((call) => String(call[0]).includes('frappe.utils.global_search.search')),
          ).toBe(true);
        },
        { timeout: 3000 },
      );
      await waitFor(
        () => {
          expect(screen.queryByText('Searching…')).toBeNull();
        },
        { timeout: 3000 },
      );
      expect(screen.queryByText('TD-0001')).toBeNull();
      expect(screen.queryByTestId('backoffice-palette-section-documents')).toBeNull();
    });
  });

  describe('CommandPalette standalone (story shape)', () => {
    it('mounts open with no shell and no trigger, showing recent', async () => {
      renderStandalone();
      const palette = await screen.findByTestId('backoffice-command-palette');
      expect(palette).toBeTruthy();
      await expect(screen.findByTestId('backoffice-palette-section-recent')).resolves.toBeTruthy();
      // No navbar in this shape — the palette owns no trigger of its own.
      expect(screen.queryByTestId('backoffice-awesomebar')).toBeNull();
    });

    it('open={false} paints nothing', () => {
      renderStandalone(false);
      expect(screen.queryByTestId('backoffice-command-palette')).toBeNull();
    });

    it('a pick navigates through the provider navigator and asks the host to close', async () => {
      const { navigation, onOpenChange } = renderStandalone();
      const palette = await screen.findByTestId('backoffice-command-palette');
      const input = palette.querySelector('input');
      if (!input) {
        throw new Error('palette input not found');
      }

      fireEvent.change(input, { target: { value: 'note' } });
      await waitFor(() => findOption('New Note'));
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(navigation.getLocation().path).toBe('/backoffice/note/new');
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
