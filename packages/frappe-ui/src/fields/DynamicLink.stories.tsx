import { InMemoryFixtureProvider } from '@repo/frappe';
import { action } from '@repo/storybook';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { YStack } from 'tamagui';

import { FrappeStoryProvider } from '../frappe-story-target';
import { FrappeProvider } from '../FrappeProvider';

import { DynamicLink } from './DynamicLink';
import type { DynamicLinkProps } from './DynamicLink';

export default {
  title: 'FrappeUI/DynamicLink',
  component: DynamicLink,
  tags: ['!test'],
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Frappe Dynamic Link field: doctype selector + document selector. Fixture stories are network-hermetic (G-15/D-05): documents come from InMemoryFixtureProvider and DocType meta from an in-story fetch mock, so nothing leaves the machine. The separately-named Live story is the live-bench arm — it targets STORYBOOK_FRAPPE_URL when reachable and falls back to fixtures otherwise.',
      },
    },
  },
  argTypes: {
    label: { control: 'text' },
    value: { control: 'text' },
    doctypeFieldValue: { control: 'text' },
    disabled: { control: 'boolean' },
    required: { control: 'boolean' },
  },
};

// ---------------------------------------------------------------------------
// Hermetic story host (G-15 story honesty / D-05).
//
// Fixture-backed stories previously pointed at https://demo.frappe.cloud. The
// fixture provider serves the *collection*, but DocType meta still resolves
// over HTTP — so those stories fired a real cross-origin request. MOCK_HOST
// keeps the same code path (real fetch, real meta shape) without leaving the
// machine.
// ---------------------------------------------------------------------------

const MOCK_HOST = 'https://frappedynamiclink.mock.test';

const doctypeMeta = (name: string) => ({
  name,
  doctype: 'DocType',
  module: name === 'Task' || name === 'ToDo' ? 'Projects' : 'Contacts',
  title_field: 'name',
  fields: [{ fieldname: 'name', fieldtype: 'Data', label: 'Name', in_list_view: 1 }],
  permissions: [{ role: 'All', read: 1, write: 1, create: 1 }],
});

type MockBody = { docs: unknown[] } | { data: unknown; message?: unknown[] } | { message: string };

// Response.json sets the same `Content-Type: application/json` header.
const jsonResponse = (body: MockBody, status = 200): Response => Response.json(body, { status });

const requestUrl = (input: RequestInfo | URL): string => {
  if (input instanceof URL) {
    return input.toString();
  }
  if (input instanceof Request) {
    return input.url;
  }
  return input;
};

(() => {
  if (typeof window === 'undefined') {
    return;
  }
  const w: Window & { __frappeDynamicLinkMockFetch?: boolean } = window;
  if (w.__frappeDynamicLinkMockFetch === true) {
    return;
  }
  w.__frappeDynamicLinkMockFetch = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = requestUrl(input);
    if (urlStr.startsWith(MOCK_HOST)) {
      const url = new URL(urlStr);
      if (url.pathname === '/api/method/frappe.desk.form.load.getdoctype') {
        const doctype = url.searchParams.get('doctype') ?? 'Contact';
        return jsonResponse({ docs: [doctypeMeta(doctype)] });
      }
      const metaMatch = /^\/api\/resource\/DocType\/(?<doctype>.+)$/u.exec(url.pathname);
      if (metaMatch) {
        return jsonResponse({ data: doctypeMeta(decodeURIComponent(metaMatch[1])) });
      }
      if (url.pathname === '/api/resource/DocType') {
        return jsonResponse({
          data: [
            { name: 'Contact', module: 'Contacts' },
            { name: 'Task', module: 'Projects' },
          ],
        });
      }
      // Everything else (guest field-peek, counts): empty, never the network.
      return jsonResponse({ data: [] });
    }
    return await realFetch(input as RequestInfo, init);
  };
})();

const fixtures = new InMemoryFixtureProvider({
  Contact: [
    { name: 'CONTACT-001', doctype: 'Contact' },
    { name: 'CONTACT-002', doctype: 'Contact' },
  ],
  Task: [
    { name: 'TASK-001', doctype: 'Task' },
    { name: 'TASK-002', doctype: 'Task' },
    { name: 'TASK-003', doctype: 'Task' },
  ],
  DocType: [doctypeMeta('Contact'), doctypeMeta('Task')],
});

const liveFixtures = new InMemoryFixtureProvider({
  ToDo: [
    { name: 'TODO-001', doctype: 'ToDo' },
    { name: 'TODO-002', doctype: 'ToDo' },
  ],
  User: [
    { name: 'Administrator', doctype: 'User' },
    { name: 'Guest', doctype: 'User' },
  ],
  DocType: [doctypeMeta('ToDo'), doctypeMeta('User')],
});

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- Storybook args may carry arbitrary extra controls alongside the field props
type StoryProps = DynamicLinkProps & Record<string, unknown>;

const Controlled = (props: Omit<StoryProps, 'onChange'>) => {
  const [value, setValue] = useState(props.value ?? '');
  return (
    <DynamicLink
      {...(props as any)}
      value={value}
      onChange={(v: string) => {
        setValue(v);
        action('onChange')(v);
      }}
      onDoctypeChange={action('onDoctypeChange')}
    />
  );
};

const withProvider = (node: ReactNode) => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={fixtures}>
    {node}
  </FrappeProvider>
);

export const Main = (args: StoryProps) => withProvider(<Controlled {...args} />);
Main.args = {
  label: 'Reference',
  doctypes: ['Contact', 'Task'],
} as Partial<StoryProps>;
Main.storyName = 'Main';

export const PreselectedDoctype = (args: StoryProps) => withProvider(<Controlled {...args} />);
PreselectedDoctype.args = {
  label: 'Task reference',
  doctypes: ['Contact', 'Task'],
  doctypeFieldValue: 'Task',
  value: 'TASK-002',
} as Partial<StoryProps>;

export const EmptyDoctypes = (args: StoryProps) => withProvider(<Controlled {...args} />);
EmptyDoctypes.args = {
  label: 'No doctypes configured',
  doctypes: [],
} as Partial<StoryProps>;

export const States = (args: StoryProps) =>
  withProvider(
    <YStack
      gap="$4"
      maxWidth={420}>
      <Controlled
        {...args}
        label="Disabled"
        disabled
      />
      <Controlled
        {...args}
        label="Required"
        required
      />
      <Controlled
        {...args}
        label="error probe (no error prop on this adapter)"
        {...({ error: 'This should show but cannot' } as any)}
      />
    </YStack>,
  );
States.args = { doctypes: ['Contact', 'Task'] } as Partial<StoryProps>;

// oxlint-disable-next-line sonarjs/todo-tag -- names a stock Frappe doctype, not a task marker
/** Live Dynamic Link on the stock ToDo and User doctypes, against the real
 * bench (STORYBOOK_FRAPPE_URL, default the local dev bench proxied by the
 * Storybook dev server). Falls back to fixtures when the bench is unreachable.
 */
export const Live = (args: StoryProps) => (
  <FrappeStoryProvider fixtures={liveFixtures}>
    <YStack maxWidth={420}>
      <Controlled {...args} />
    </YStack>
  </FrappeStoryProvider>
);
Live.args = {
  label: 'Reference',
  doctypes: ['ToDo', 'User'],
} as Partial<StoryProps>;
Live.parameters = {
  docs: {
    description: {
      story:
        'Live Dynamic Link over stock ToDo and User: picking a doctype lists documents from the bench (or fixtures when the bench is down).',
    },
  },
};
