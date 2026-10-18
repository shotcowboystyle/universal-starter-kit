// The kanban view and its board controls (MPO-414): a saved Kanban Board
// drives the columns, the picker switches and creates boards, a doctype with
// no board falls back to its Select field, the column "+" prefills the new
// record, and cards move or get added only as the session's rights allow
// (MPO-390).

import { setTimeout as sleep } from 'node:timers/promises';

import { InMemoryFixtureProvider } from '@repo/frappe';
import { renderWithProviders } from '@repo/test-utils';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BackofficeProvider } from '../config/BackofficeProvider';
import { createMemoryNavigator } from '../navigation/navigator';

import { KanbanView } from './KanbanView';

// happy-dom has no layout, so the column virtualizer would draw no cards.
// oxlint-disable-next-line vitest/prefer-import-in-mock -- the virtualizer stub is partial; the real module type rejects it in a typed factory
vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: (opts: { count: number; estimateSize: () => number }) => {
    const size = opts.estimateSize();
    const items = Array.from({ length: opts.count }, (_, index) => ({
      index,
      key: String(index),
      start: index * size,
      end: (index + 1) * size,
      size,
    }));
    return {
      getVirtualItems: () => items,
      getTotalSize: () => opts.count * size,
      measureElement: () => {},
      scrollToIndex: () => {},
    };
  },
}));

const taskMeta = (name: string, withSelect = true) => ({
  name,
  doctype: 'DocType',
  module: 'QA',
  title_field: 'subject',
  fields: [
    { fieldname: 'subject', fieldtype: 'Data', label: 'Subject', in_list_view: 1 },
    ...(withSelect
      ? [
          {
            fieldname: 'status',
            fieldtype: 'Select',
            label: 'Status',
            options: 'Open\nWorking\nDone',
            in_list_view: 1,
          },
          {
            fieldname: 'priority',
            fieldtype: 'Select',
            label: 'Priority',
            options: 'High\nMedium\nLow',
            in_list_view: 1,
          },
        ]
      : []),
  ],
  permissions: [{ role: 'All', read: 1 }],
});

const tasks = [
  ['QABT-001', 'triage inbox', 'Open', 'High'],
  ['QABT-002', 'ship release', 'Working', 'Medium'],
  ['QABT-003', 'write docs', 'Done', 'Low'],
].map(([name, subject, status, priority]) => ({
  name,
  doctype: 'QaBoardTask',
  subject,
  status,
  priority,
}));

const savedBoards = [
  {
    name: 'QA Task Board',
    doctype: 'Kanban Board',
    kanban_board_name: 'QA Task Board',
    reference_doctype: 'QaBoardTask',
    field_name: 'status',
    columns: [
      { column_name: 'Done', status: 'Active', indicator: 'Green' },
      { column_name: 'Open', status: 'Active', indicator: 'Blue' },
      { column_name: 'Working', status: 'Active', indicator: 'Orange' },
      { column_name: 'Retired', status: 'Archived', indicator: 'Gray' },
    ],
  },
  {
    name: 'Priority Lane',
    doctype: 'Kanban Board',
    kanban_board_name: 'Priority Lane',
    reference_doctype: 'QaBoardTask',
    field_name: 'priority',
    columns: [
      { column_name: 'High', status: 'Active', indicator: 'Red' },
      { column_name: 'Medium', status: 'Active', indicator: 'Orange' },
      { column_name: 'Low', status: 'Active', indicator: 'Gray' },
    ],
  },
];

const moveMeta = {
  name: 'Poke Move',
  doctype: 'DocType',
  title_field: 'move_name',
  fields: [
    { fieldname: 'move_name', fieldtype: 'Data', label: 'Move Name', in_list_view: 1 },
    {
      fieldname: 'category',
      fieldtype: 'Select',
      label: 'Category',
      options: 'Physical\nSpecial',
      in_list_view: 1,
    },
  ],
  permissions: [
    { role: 'Pokemon Editor', read: 1, write: 1, create: 1, delete: 1 },
    { role: 'Guest', read: 1 },
  ],
};

let run = 0;

const renderFixtureKanban = (doctype: string, board?: string) => {
  run += 1;
  const fixtures = new InMemoryFixtureProvider({
    DocType: [taskMeta('QaBoardTask'), taskMeta('QaBoardLoose'), taskMeta('QaBoardNone', false)],
    'Kanban Board': savedBoards.map((entry) => ({ ...entry })),
    QaBoardTask: tasks,
    QaBoardLoose: tasks.map((task) => ({ ...task, doctype: 'QaBoardLoose' })),
  });
  const navigation = createMemoryNavigator('/backoffice');
  renderWithProviders(
    <BackofficeProvider
      frappe={{ baseURL: `https://kanban-view-${run}.spec.test`, fixtures }}
      navigation={navigation}>
      <KanbanView
        doctype={doctype}
        board={board}
      />
    </BackofficeProvider>,
  );
  return { navigation, fixtures };
};

const renderBenchKanban = (roles: string[]) => {
  run += 1;
  let rolesAnswered = false;
  vi.stubGlobal('fetch', async (input: string | URL | Request) => {
    const url = new URL(String(input instanceof Request ? input.url : input));
    const method = url.pathname.replace(/^\/api\/method\//u, '');
    if (method === 'frappe.auth.get_logged_user') {
      return Response.json({ message: 'user@pokemon.test' });
    }
    if (method === 'frappe.core.doctype.user.user.get_roles') {
      rolesAnswered = true;
      return Response.json({ message: roles });
    }
    if (method === 'frappe.desk.form.load.getdoctype') {
      return Response.json({ docs: [moveMeta] });
    }
    if (url.pathname === `/api/resource/${encodeURIComponent('Poke Move')}`) {
      return Response.json({
        data: [{ name: 'm1', doctype: 'Poke Move', move_name: 'tackle', category: 'Physical' }],
      });
    }
    return Response.json({ data: [], message: [] });
  });
  renderWithProviders(
    <BackofficeProvider
      frappe={{ baseURL: `https://kanban-view-bench-${run}.spec.test` }}
      navigation={createMemoryNavigator('/backoffice')}>
      <KanbanView doctype="Poke Move" />
    </BackofficeProvider>,
  );
  return { rolesAnswered: () => rolesAnswered };
};

const draggable = (title: string): boolean =>
  Boolean(screen.getByText(title).closest('[data-kanban-draggable="true"]'));

const settle = async (ms = 300) => {
  await act(async () => {
    await sleep(ms);
  });
};

const precedes = (first: HTMLElement, second: HTMLElement): boolean =>
  // oxlint-disable-next-line eslint/no-bitwise -- compareDocumentPosition returns a DOM position bitmask
  Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);

describe('<KanbanView />', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("draws the saved board's active columns in its order and opens a card's form", async () => {
    const { navigation } = renderFixtureKanban('QaBoardTask');
    const card = await screen.findByText('ship release', {}, { timeout: 5000 });
    const done = screen.getByLabelText('Add card to Done');
    const open = screen.getByLabelText('Add card to Open');
    const working = screen.getByLabelText('Add card to Working');
    expect(precedes(done, open) && precedes(open, working)).toBe(true);
    expect(screen.queryByLabelText('Add card to Retired')).toBeNull();
    fireEvent.click(card);
    await waitFor(() => {
      expect(navigation.getLocation().path).toBe('/backoffice/qaboardtask/QABT-002');
    });
  });

  it('opens a new record prefilled with the column from its +', async () => {
    const { navigation } = renderFixtureKanban('QaBoardTask');
    fireEvent.click(await screen.findByLabelText('Add card to Working', {}, { timeout: 5000 }));
    expect(navigation.getLocation().path).toBe('/backoffice/qaboardtask/new');
    expect(JSON.parse(String(navigation.getLocation().params.d))).toStrictEqual({ status: 'Working' });
  });

  it('switches to another saved board from the picker', async () => {
    const { navigation } = renderFixtureKanban('QaBoardTask');
    fireEvent.click(await screen.findByLabelText('Switch board', {}, { timeout: 5000 }));
    fireEvent.click(await screen.findByText('Priority Lane', {}, { timeout: 5000 }));
    await waitFor(() => {
      expect(navigation.getLocation().params.board).toBe('Priority Lane');
    });
    expect(navigation.getLocation().path).toBe('/backoffice/qaboardtask/view/kanban');
  });

  it("creates a board from the picker's New board dialog and switches to it", async () => {
    const { navigation, fixtures } = renderFixtureKanban('QaBoardTask');
    fireEvent.click(await screen.findByLabelText('Switch board', {}, { timeout: 5000 }));
    fireEvent.click(await screen.findByText('New board…', {}, { timeout: 5000 }));
    await expect(screen.findByText('New kanban board', {}, { timeout: 5000 })).resolves.toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: /board name/iu }), {
      target: { value: 'Release Train' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create board' }));
    await waitFor(() => {
      expect(navigation.getLocation().params.board).toBe('Release Train');
    });
    const created = await fixtures.getDoc('Kanban Board', 'Release Train');
    expect(created).toMatchObject({ reference_doctype: 'QaBoardTask', field_name: 'status' });
  });

  it('falls back to the status Select with a create-board call to action', async () => {
    renderFixtureKanban('QaBoardLoose');
    await expect(screen.findByText('No kanban board configured', {}, { timeout: 5000 })).resolves.toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create board' })).toBeTruthy();
    await expect(screen.findByLabelText('Add card to Open', {}, { timeout: 5000 })).resolves.toBeTruthy();
  });

  it('offers the list back when there is no board and no Select field', async () => {
    const { navigation } = renderFixtureKanban('QaBoardNone');
    await expect(screen.findByText('No Select field to board by', {}, { timeout: 5000 })).resolves.toBeTruthy();
    fireEvent.click(screen.getByText('Back to list'));
    expect(navigation.getLocation().path).toBe('/backoffice/qaboardnone');
  });

  it('lets an editor move and add cards on a live bench', async () => {
    const bench = renderBenchKanban(['Pokemon Editor', 'Guest']);
    await screen.findByText('tackle', {}, { timeout: 5000 });
    await waitFor(
      () => {
        expect(bench.rolesAnswered()).toBe(true);
      },
      { timeout: 5000 },
    );
    await waitFor(() => {
      expect(draggable('tackle')).toBe(true);
    });
    expect(screen.getByLabelText('Add card to Physical')).toBeTruthy();
  });

  it('lets a reader neither move nor add cards on a live bench', async () => {
    const bench = renderBenchKanban(['Guest']);
    await screen.findByText('tackle', {}, { timeout: 5000 });
    await settle();
    expect(draggable('tackle')).toBe(false);
    expect(screen.queryByLabelText('Add card to Physical')).toBeNull();
    expect(bench.rolesAnswered()).toBe(true);
  });
});
