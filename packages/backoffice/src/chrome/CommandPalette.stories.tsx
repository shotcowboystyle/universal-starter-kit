import { Text, YStack } from '@repo/ui';
// OWNER: backoffice screens workstream (MPO-189).
// CommandPalette stories (MOD-01). The Awesomebar story only shows the
// TRIGGER; these mount the palette itself, open, so the section model
// (recent → actions → navigation → documents) and the roving highlight are
// visible without a keystroke.
//
// Fixtures do the work: the DocType + Workspace catalog is read straight
// from the fixture provider (awesomebar-data's fixture branch), recent come
// from the shared desk store seeded below, and only the document section
// needs the desk full-text RPC — answered by a fetch mock scoped to this
// story's mock host.
import { Button } from '@repo/forms';
import { InMemoryFixtureProvider } from '@repo/frappe';
import { storage } from '@repo/store';
import { sizeRecipeEscape } from '@repo/theme';
import { useState } from 'react';
import type { ReactNode } from 'react';

import { BackofficeProvider } from '../config/BackofficeProvider';
import { createMemoryNavigator } from '../navigation/navigator';

import { CommandPalette } from './CommandPalette';

const frameHeight = sizeRecipeEscape(620, 'story canvas: a fixed-height frame for a full-height screen to fill');

const meta = {
  title: 'Screens/Backoffice/CommandPalette',
  component: CommandPalette,
  tags: ['!test'],
  parameters: {
    status: { type: 'stable' },
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Linear / Spotlight / Frappe awesomebar in one surface: an empty query lists recent documents; typing adds contextual actions for the best doctype match (New / List / Report / Kanban), workspace and doctype navigation, and document hits from the desk full-text index. Keyboard-first — the search input is the single tab stop, arrows move one roving highlight across sections, Enter opens, Escape closes and returns focus. Two containers, one model: a centered modal overlay on wide web, a full-height sheet below the medium breakpoint.',
      },
    },
  },
};
export default meta;

const MOCK_HOST = 'https://backoffice-command-palette.mock.test';

const doctypes = ['ToDo', 'ToDo Template', 'Note', 'User', 'Role', 'Sales Order', 'Sales Invoice', 'Item'];

const workspaces = [
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
  {
    name: 'selling',
    doctype: 'Workspace',
    title: 'Selling',
    icon: 'sell',
    parent_page: '',
    public: 1,
    for_user: '',
    sequence_id: 2,
    module: 'Selling',
    is_hidden: 0,
  },
];

const makeFixtures = () =>
  new InMemoryFixtureProvider({
    DocType: doctypes.map((name) => ({ name, doctype: 'DocType' })),
    Workspace: workspaces,
    'Notification Log': [],
  });

/**
 * Recents ride the SHARED desk store — the same key frappe-ui's DeskSidebar
 * writes — so an empty query has something to show. Seeded once, web only.
 */
(() => {
  if (typeof window === 'undefined') {
    return;
  }
  const w = window as unknown as Record<string, unknown>;
  if (w.__commandPaletteRecentsSeeded) {
    return;
  }
  w.__commandPaletteRecentsSeeded = true;
  void storage.setItem(
    'frappe-desk-recent',
    JSON.stringify([
      { label: 'SO-0042 · Sales Order', path: '/backoffice/sales-order/SO-0042' },
      { label: 'TD-0007 · ToDo', path: '/backoffice/todo/TD-0007' },
      { label: 'Selling', path: '/backoffice/selling' },
    ]),
  );
})();

/**
 * Document hits need frappe.utils.global_search.search; everything else on
 * the mock host answers empty (and the session probe answers null, so the
 * inert host never mints a truthy user).
 */
(() => {
  if (typeof window === 'undefined') {
    return;
  }
  const w = window as unknown as Record<string, unknown>;
  if (w.__commandPaletteMockFetch) {
    return;
  }
  w.__commandPaletteMockFetch = true;
  const realFetch = window.fetch.bind(window);
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (!urlStr.startsWith(MOCK_HOST)) {
      return await realFetch(input as RequestInfo, init);
    }
    const { pathname } = new URL(urlStr);
    if (pathname.endsWith('frappe.utils.global_search.search')) {
      return json({
        message: [
          {
            doctype: 'ToDo',
            name: 'TD-0007',
            content: 'Description: pay the rent ||| Status: Open',
          },
          {
            doctype: 'Sales Order',
            name: 'SO-0042',
            content: 'Customer: ACME Corp ||| Status: To Deliver',
          },
        ],
      });
    }
    if (pathname.endsWith('frappe.auth.get_logged_user')) {
      return json({ message: null });
    }
    return json({ data: [], message: [] });
  };
})();

function Host({ children }: { children: ReactNode }) {
  return (
    <BackofficeProvider
      frappe={{ baseURL: MOCK_HOST, fixtures: makeFixtures() }}
      navigation={createMemoryNavigator('/backoffice')}>
      <YStack
        flex={1}
        height={frameHeight}
        padding="$4"
        gap="$3"
        backgroundColor="$color2">
        {children}
      </YStack>
    </BackofficeProvider>
  );
}

/**
 * Open on an empty query: the Recents section from the shared desk store.
 * Type to fill Actions / Navigation / Documents; Escape closes.
 */
export const Overlay = () => {
  const [open, setOpen] = useState(true);
  return (
    <Host>
      <Text>Page behind the palette.</Text>
      <Button
        onPress={() => {
          setOpen(true);
        }}>
        Open palette
      </Button>
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
      />
    </Host>
  );
};
Overlay.storyName = 'Main';

/**
 * Closed: the palette owns no trigger of its own (the navbar awesomebar and
 * the Mod+K shortcut open it), so the closed state is the host page with
 * nothing painted over it.
 */
export const Closed = () => {
  const [open, setOpen] = useState(false);
  return (
    <Host>
      <Text>Nothing is painted over the page while the palette is closed.</Text>
      <Button
        onPress={() => {
          setOpen(true);
        }}>
        Open palette
      </Button>
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
      />
    </Host>
  );
};

/**
 * The compact container. The palette picks its container from the VIEWPORT,
 * not a prop (useLayoutSizeClass): below the medium breakpoint — and on
 * native always — the same section model renders as a full-height
 * SheetModal instead of the centered overlay. Narrow the preview pane (or
 * pick a phone viewport) to see this arm switch containers; it is the same
 * story otherwise, which is the point.
 */
export const CompactSheet = () => {
  const [open, setOpen] = useState(true);
  return (
    <Host>
      <Text>Narrow the preview below the medium breakpoint to get the sheet container.</Text>
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
      />
    </Host>
  );
};
