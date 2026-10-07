import { InMemoryFixtureProvider } from '@repo/frappe';
import { action } from '@repo/storybook';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { YStack } from 'tamagui';

import { FrappeProvider } from '../FrappeProvider';
import { FrappeStoryProvider } from '../frappeStoryTarget';

import { TableMultiSelect } from './TableMultiSelect';
import type { TableMultiSelectProps } from './TableMultiSelect';

export default {
  title: 'FrappeUI/TableMultiSelect',
  component: TableMultiSelect,
  tags: ['!test'],
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          "Frappe Table MultiSelect field: multi-select over a doctype's documents. Fixture stories are network-hermetic (G-15/D-05): documents come from InMemoryFixtureProvider and DocType meta from an in-story fetch mock, so nothing leaves the machine. The separately-named Live story is the live-bench arm — it targets STORYBOOK_FRAPPE_URL when reachable and falls back to fixtures otherwise.",
      },
    },
  },
  argTypes: {
    label: { control: 'text' },
    doctype: { control: 'text' },
    disabled: { control: 'boolean' },
    required: { control: 'boolean' },
    maxSelections: { control: 'number' },
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

const MOCK_HOST = 'https://frappetms.mock.test';

function tagMetaRaw(name: string) {
  return {
    name,
    module: 'Core',
    title_field: 'name',
    fields: [{ fieldname: 'name', fieldtype: 'Data', label: 'Name', in_list_view: 1 }],
    permissions: [{ role: 'All', read: 1, write: 1, create: 1 }],
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

(() => {
  if (typeof window === 'undefined') {
    return;
  }
  const w = window as unknown as Record<string, unknown>;
  if (w.__frappeTmsMockFetch) {
    return;
  }
  w.__frappeTmsMockFetch = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (urlStr.startsWith(MOCK_HOST)) {
      const url = new URL(urlStr);
      if (url.pathname === '/api/method/frappe.desk.form.load.getdoctype') {
        const doctype = url.searchParams.get('doctype') ?? 'Tag';
        return jsonResponse({ docs: [tagMetaRaw(doctype)] });
      }
      const metaMatch = /^\/api\/resource\/DocType\/(.+)$/.exec(url.pathname);
      if (metaMatch) {
        return jsonResponse({ data: tagMetaRaw(decodeURIComponent(metaMatch[1])) });
      }
      if (url.pathname === '/api/resource/DocType') {
        return jsonResponse({ data: [{ name: 'Tag', module: 'Core' }] });
      }
      // CSRF /app bootstrap, guest field-peek, counts: empty, never the network.
      return jsonResponse({ data: [] });
    }
    return await realFetch(input as RequestInfo, init);
  };
})();

const fixtures = new InMemoryFixtureProvider({
  Tag: [
    { name: 'urgent', doctype: 'Tag' },
    { name: 'backlog', doctype: 'Tag' },
    { name: 'customer', doctype: 'Tag' },
    {
      name: 'very-long-tag-name-that-should-wrap-or-truncate-gracefully-in-the-row',
      doctype: 'Tag',
    },
  ],
});

type StoryProps = TableMultiSelectProps & Record<string, unknown>;

function Controlled(props: Omit<StoryProps, 'onChange'>) {
  const [value, setValue] = useState<string[]>((props.value as string[]) ?? []);
  return (
    <TableMultiSelect
      {...(props as any)}
      value={value}
      onChange={(v: string[]) => {
        setValue(v);
        action('onChange')(v);
      }}
    />
  );
}

const withProvider = (node: ReactNode) => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={fixtures}>
    {node}
  </FrappeProvider>
);

export const Main = (args: StoryProps) => withProvider(<Controlled {...args} />);
Main.args = { label: 'Tags', doctype: 'Tag' } as Partial<StoryProps>;
Main.storyName = 'Main';

export const WithSelections = (args: StoryProps) => withProvider(<Controlled {...args} />);
WithSelections.args = {
  label: 'Preselected tags',
  doctype: 'Tag',
  value: ['urgent', 'customer'],
} as Partial<StoryProps>;

export const UnknownSelections = (args: StoryProps) => withProvider(<Controlled {...args} />);
UnknownSelections.args = {
  label: 'Unknown selection values',
  doctype: 'Tag',
  value: ['does-not-exist', 'urgent'],
} as Partial<StoryProps>;

export const MaxSelections = (args: StoryProps) => withProvider(<Controlled {...args} />);
MaxSelections.args = {
  label: 'Max 2 selections',
  doctype: 'Tag',
  value: ['urgent', 'backlog'],
  maxSelections: 2,
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
        value={['urgent']}
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
States.args = { doctype: 'Tag' } as Partial<StoryProps>;

/**
 * Live multi-select against the real bench (STORYBOOK_FRAPPE_URL). Falls
 * back to fixtures when the bench is unreachable.
 */
export const Live = (args: StoryProps) => (
  <FrappeStoryProvider fixtures={fixtures}>
    <Controlled {...args} />
  </FrappeStoryProvider>
);
Live.args = { label: 'Tags', doctype: 'Tag' } as Partial<StoryProps>;
Live.parameters = {
  docs: {
    description: {
      story:
        'Live Table MultiSelect: useFrappeCollection + useLiveQuery against the bench when STORYBOOK_FRAPPE_URL is reachable; fixture fallback otherwise.',
    },
  },
};
