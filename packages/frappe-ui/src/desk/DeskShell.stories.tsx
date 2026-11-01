import { InMemoryFixtureProvider } from '@repo/frappe';
import { action } from '@repo/storybook';
import { sizeRecipeEscape } from '@repo/theme';
import { Text, YStack } from '@repo/ui';

import { FrappeProvider } from '../FrappeProvider';

import { DeskShell } from './DeskShell';
import type { DeskShellProps } from './DeskShell';

const frameHeight = sizeRecipeEscape(640, 'story canvas: a fixed-height frame for a full-height screen to fill');

export default {
  title: 'FrappeUI/Desk/DeskShell',
  component: DeskShell,
  tags: ['!test'],
  parameters: {
    status: { type: 'stable' },
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Top-level desk layout: Awesomebar header, DeskSidebar nav, breadcrumbs and main content. Navigation search is served by an in-story fetch mock. Shell chrome rides house Button, phosphor icons, and surface/heading/gap/panelPadding knobs (R-NONE inverted-L).',
      },
    },
  },
  argTypes: {
    showSidebar: { control: 'boolean' },
    showAwesomebar: { control: 'boolean' },
  },
};

const MOCK_HOST = 'https://deskshell.mock.test';

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- any JSON-serializable mock payload
const jsonResponse = (body: unknown, status = 200): Response => Response.json(body, { status });

const doctypeList = [
  { name: 'Todo', module: 'Desk' },
  { name: 'Todo Item', module: 'Desk' },
  { name: 'Sales Order', module: 'Selling' },
  { name: 'Sales Invoice', module: 'Accounts' },
  { name: 'Note', module: 'Desk' },
];

(() => {
  // Install once per page: a window flag survives story re-renders and HMR.
  if (Object.hasOwn(window, '__deskShellMockFetch')) {
    return;
  }
  Reflect.set(window, '__deskShellMockFetch', true);
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = input instanceof Request ? input.url : input.toString();
    if (urlStr.startsWith(MOCK_HOST)) {
      const url = new URL(urlStr);
      if (url.pathname === '/api/resource/DocType') {
        return jsonResponse({ data: doctypeList });
      }
      if (url.pathname === '/api/method/frappe.utils.global_search.search') {
        return jsonResponse({
          message: [
            { doctype: 'Todo', name: 'TODO-001', content: 'Buy milk' },
            { doctype: 'Sales Order', name: 'SO-0001', content: 'ACME Corp order' },
          ],
        });
      }
      return jsonResponse({ data: [] });
    }
    return await realFetch(input as RequestInfo, init);
  };
})();

const content = (blocks: number) => (
  <YStack
    padding="$4"
    gap="$3">
    {Array.from({ length: blocks }, (_, i) => (
      <YStack
        key={i}
        padding="$4"
        borderWidth={1}
        borderColor="$borderColor"
        borderRadius="$3"
        backgroundColor="$color2">
        <Text>Content block {i + 1}</Text>
      </YStack>
    ))}
  </YStack>
);

export const Main = (args: Partial<DeskShellProps>) => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({})}>
    <YStack height={frameHeight}>
      <DeskShell
        breadcrumbs={[{ label: 'Desk', href: '/desk' }, { label: 'Todo' }]}
        onNavigate={action('onNavigate')}
        activePath="/desk/Todo"
        {...args}>
        {content(3)}
      </DeskShell>
    </YStack>
  </FrappeProvider>
);
Main.args = { showSidebar: true, showAwesomebar: true };
Main.storyName = 'Main';

export const NoSidebar = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({})}>
    <YStack height={frameHeight}>
      <DeskShell
        showSidebar={false}
        onNavigate={action('onNavigate')}>
        {content(2)}
      </DeskShell>
    </YStack>
  </FrappeProvider>
);

export const NoAwesomebar = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({})}>
    <YStack height={frameHeight}>
      <DeskShell
        showAwesomebar={false}
        onNavigate={action('onNavigate')}>
        {content(2)}
      </DeskShell>
    </YStack>
  </FrappeProvider>
);

/** Long page content must scroll inside the main area, header staying fixed. */
export const LongContent = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({})}>
    <YStack height={frameHeight}>
      <DeskShell
        breadcrumbs={[{ label: 'Desk', href: '/desk' }, { label: 'Long' }]}
        onNavigate={action('onNavigate')}>
        {content(30)}
      </DeskShell>
    </YStack>
  </FrappeProvider>
);

/** No breadcrumbs, no provider config: shell must still render header + nav + content. */
export const Bare = () => (
  <YStack height={frameHeight}>
    <DeskShell onNavigate={action('onNavigate')}>{content(1)}</DeskShell>
  </YStack>
);

/** Compact viewport: rail collapses to a phosphor toggle + overlay drawer. */
export const Narrow = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({})}>
    <YStack height={frameHeight}>
      <DeskShell
        breadcrumbs={[{ label: 'Desk', href: '/desk' }, { label: 'Todo' }]}
        onNavigate={action('onNavigate')}
        activePath="/desk/Todo">
        {content(3)}
      </DeskShell>
    </YStack>
  </FrappeProvider>
);
Narrow.parameters = {
  viewport: { defaultViewport: 'mobile1' },
};
Narrow.storyName = 'Narrow';
