import { InMemoryFixtureProvider } from '@repo/frappe';
import { action } from '@repo/storybook';
import { DataTable } from '@repo/table';
import type { DataTableColumn } from '@repo/table';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { YStack } from 'tamagui';

import { fieldtypeToTableField, getFieldComponent } from '../field-registry';
import { FrappeStoryProvider } from '../frappe-story-target';
import { FrappeProvider } from '../FrappeProvider';

import { Link } from './Link';
import type { LinkProps } from './Link';

export default {
  title: 'FrappeUI/Link',
  component: Link,
  tags: ['!test'],
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Frappe Link field: a backend-searching combobox over a target doctype. Fixture stories are network-hermetic (G-15/D-05): documents come from InMemoryFixtureProvider and search_link / get_link_title / getdoctype from an in-story fetch mock, so nothing leaves the machine. Live stories run against the dev bench through the Storybook proxy; when the bench is down they degrade to an honest in-dropdown search error.',
      },
    },
  },
  argTypes: {
    label: { control: 'text' },
    value: { control: 'text' },
    doctype: { control: 'text' },
    disabled: { control: 'boolean' },
    required: { control: 'boolean' },
    error: { control: 'text' },
    allowCreate: { control: 'boolean' },
    showDescription: { control: 'boolean' },
  },
};

// ---------------------------------------------------------------------------
// Hermetic story host (G-15 story honesty / D-05).
//
// Default stories previously pointed at https://demo.frappe.cloud. The fixture
// provider can serve documents, but Link still resolves titles and suggestions
// over HTTP — so those stories fired real cross-origin requests the browser
// rejected with CORS, poisoning Kitchen Sink / TestFlight. MOCK_HOST keeps the
// same code path (real fetch, real search_link / get_link_title / getdoctype
// shapes) without leaving the machine.
// ---------------------------------------------------------------------------

const MOCK_HOST = 'https://frappelink.mock.test';
const JOHN_CONTACT = 'CONTACT-001';
const JANE_EMAIL = 'jane@example.com';

const contactMeta = () => ({
  name: 'Contact',
  // FixtureDoc requires `doctype`; a DocType meta doc's own doctype is DocType.
  doctype: 'DocType',
  module: 'Contacts',
  title_field: 'first_name',
  fields: [
    { fieldname: 'first_name', fieldtype: 'Data', label: 'First Name', required: 1 },
    { fieldname: 'last_name', fieldtype: 'Data', label: 'Last Name' },
    { fieldname: 'email_id', fieldtype: 'Data', label: 'Email' },
  ],
  permissions: [{ role: 'All', read: 1, write: 1, create: 1 }],
});

interface Contact {
  name: string;
  doctype: string;
  first_name: string;
  last_name: string;
  email_id: string;
}

const contactFixtures: Contact[] = [
  {
    name: JOHN_CONTACT,
    doctype: 'Contact',
    first_name: 'John',
    last_name: 'Doe',
    email_id: 'john@example.com',
  },
  {
    name: 'CONTACT-002',
    doctype: 'Contact',
    first_name: 'Jane',
    last_name: 'Smith',
    email_id: JANE_EMAIL,
  },
  {
    name: 'CONTACT-003',
    doctype: 'Contact',
    first_name: 'Amit',
    last_name: 'Patel',
    email_id: 'amit@example.com',
  },
];

const contactLinks = contactFixtures.map((doc) => ({
  value: doc.name,
  label: `${doc.first_name} ${doc.last_name}`,
  description: `${doc.first_name} ${doc.last_name}`,
}));

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- each mocked Frappe method replies with its own payload shape
const jsonResponse = (body: unknown, status = 200): Response => Response.json(body, { status });

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
  const w: Window & { __frappeLinkMockFetch?: boolean } = window;
  if (w.__frappeLinkMockFetch) {
    return;
  }
  w.__frappeLinkMockFetch = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = requestUrl(input);
    if (urlStr.startsWith(MOCK_HOST)) {
      const url = new URL(urlStr);
      if (url.pathname.includes('frappe.desk.form.load.getdoctype')) {
        return jsonResponse({ docs: [contactMeta()] });
      }
      if (url.pathname.includes('frappe.desk.search.search_link')) {
        const txt = (url.searchParams.get('txt') ?? '').toLowerCase();
        const message = contactLinks.filter(
          (item) => !txt || item.value.toLowerCase().includes(txt) || item.description.toLowerCase().includes(txt),
        );
        return jsonResponse({ message });
      }
      if (url.pathname.includes('frappe.desk.search.get_link_title')) {
        const docname = url.searchParams.get('docname') ?? '';
        const hit = contactLinks.find((item) => item.value === docname);
        return jsonResponse({ message: hit?.description ?? docname });
      }
      if (url.pathname.includes('frappe.sessions.get_csrf_token')) {
        return jsonResponse({ message: 'mock-csrf' });
      }
      const metaMatch = /^\/api\/resource\/DocType\/(?<doctype>.+)$/u.exec(url.pathname);
      if (metaMatch) {
        return jsonResponse({ data: contactMeta() });
      }
      return jsonResponse({ data: [], message: [] });
    }
    return await realFetch(input as RequestInfo, init);
  };
})();

// oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- story args carry Storybook controls beyond LinkProps
type StoryProps = LinkProps & Record<string, unknown>;

const Controlled = (props: Omit<StoryProps, 'onChange'>) => {
  const [value, setValue] = useState(props.value ?? '');
  return (
    <Link
      {...(props as any)}
      value={value}
      onChange={(v: string) => {
        setValue(v);
        action('onChange')(v);
      }}
    />
  );
};

const contactFixturesProvider = () =>
  new InMemoryFixtureProvider({
    Contact: contactFixtures,
    DocType: [contactMeta()],
  });

const withProvider = (node: ReactNode) => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={contactFixturesProvider()}>
    <YStack maxWidth={420}>{node}</YStack>
  </FrappeProvider>
);

export const Main = (args: StoryProps) => withProvider(<Controlled {...args} />);
Main.args = { label: 'Contact', doctype: 'Contact' } as Partial<StoryProps>;
Main.storyName = 'Main';

export const WithValue = (args: StoryProps) => withProvider(<Controlled {...args} />);
WithValue.args = {
  label: 'Preselected contact',
  doctype: 'Contact',
  value: JOHN_CONTACT,
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
        label="Disabled + error"
        disabled
        error="Broken while disabled"
      />
      <Controlled
        {...args}
        label="Required"
        required
      />
      <Controlled
        {...args}
        label="Error"
        error="Value does not match the required format"
      />
      <Controlled
        {...args}
        label="Allow create"
        allowCreate
        onCreateNew={action('onCreateNew')}
      />
    </YStack>,
  );
States.args = { doctype: 'Contact' } as Partial<StoryProps>;

/** Contract probe: helperText / readOnly / skeleton / compact ride the shared field contract. */
export const ContractProbe = (args: StoryProps) =>
  withProvider(
    <YStack
      gap="$4"
      maxWidth={420}>
      <Controlled
        {...args}
        label="readOnly+helper probe"
        {...({ readOnly: true, helperText: 'help', value: JOHN_CONTACT } as any)}
      />
      <Controlled
        {...args}
        label="skeleton probe"
        {...({ skeleton: true } as any)}
      />
      <Controlled
        {...args}
        label="compact probe"
        {...({ compact: true } as any)}
      />
    </YStack>,
  );
ContractProbe.args = { doctype: 'Contact' } as Partial<StoryProps>;

// ---------------------------------------------------------------------------
// Live bench stories (Storybook dev-server proxy, auth injected server-side)
// ---------------------------------------------------------------------------

/**
 * LIVE standalone field: search Users on the real bench. Type to watch
 * debounced search_link requests; results show value + description.
 */
const renderLive = (args: StoryProps) => (
  <FrappeStoryProvider>
    <YStack maxWidth={420}>
      <Controlled {...args} />
    </YStack>
  </FrappeStoryProvider>
);

export const Live = (args: StoryProps) => renderLive(args);
Live.args = { label: 'User', doctype: 'User' } as Partial<StoryProps>;
Live.parameters = {
  docs: {
    description: {
      story:
        'Backend search against the live bench: each debounced keystroke issues frappe.desk.search.search_link (observe the network log — the option set is server data, not client filtering). Picking a result commits the doc name through onChange.',
    },
  },
};

/**
 * LIVE with a preset foreign key: the display title resolves on mount via
 * get_link_title (before any search has run).
 */
export const LiveWithValue = (args: StoryProps) => renderLive(args);
LiveWithValue.args = {
  label: 'Assigned to',
  doctype: 'User',
  value: 'Administrator',
} as Partial<StoryProps>;

/**
 * LIVE schema-form path: the registry Link adapter (what FrappeForm renders
 * for a Link df) wired controlled, exactly as SchemaForm drives it.
 */
const RegistryLinkAdapter = getFieldComponent('Link')!;

const ControlledAdapter = () => {
  const [value, setValue] = useState('');
  return (
    <RegistryLinkAdapter
      label="Allocated To"
      value={value}
      onChange={(v: any) => {
        setValue(v);
        action('onChange')(v);
      }}
      fieldMeta={{ type: 'Link', name: 'allocated_to', options: 'User' }}
    />
  );
};

export const LiveFormAdapter = () => (
  <FrappeStoryProvider>
    <YStack maxWidth={420}>
      <ControlledAdapter />
    </YStack>
  </FrappeStoryProvider>
);
LiveFormAdapter.parameters = {
  docs: {
    description: {
      story:
        'The registry adapter FrappeForm/SchemaForm renders for Link doc-fields (doctype from df.options), driven controlled through the canonical onChange(value) contract.',
    },
  },
};

/**
 * LIVE cell editor: a DataTable column mapped through fieldtypeToTableField
 * ("Link") — chromeless in-cell combobox, popover editor, backend search;
 * picking a value commits the row immediately.
 */
interface LinkCellRow {
  id: number;
  description: string;
  allocated_to: string;
}

const linkCellRows: LinkCellRow[] = [
  { id: 1, description: 'Review PR', allocated_to: 'Administrator' },
  { id: 2, description: 'Ship release', allocated_to: '' },
  { id: 3, description: 'Write docs', allocated_to: '' },
];

const linkCellColumns: DataTableColumn<LinkCellRow>[] = [
  { accessorKey: 'description', header: 'Description', field: 'input' },
  {
    accessorKey: 'allocated_to',
    header: 'Allocated To (Link: User)',
    ...fieldtypeToTableField('Link', 'User'),
  } as DataTableColumn<LinkCellRow>,
];

const LiveCellStory = () => {
  const [data, setData] = useState(linkCellRows);
  return (
    <DataTable
      data={data}
      columns={linkCellColumns}
      onDataChange={(next) => {
        setData(next);
        action('onDataChange')(next);
      }}
      showRowNumbers
      aria-label="Link cell editor table"
    />
  );
};

export const LiveCell = () => (
  <FrappeStoryProvider>
    <LiveCellStory />
  </FrappeStoryProvider>
);
LiveCell.parameters = {
  docs: {
    description: {
      story:
        'Link inside a table cell: the registry maps the Link fieldtype to a chromeless in-cell combobox (custom cell render). The editor opens as a popover over the anchor (LC-06), search hits the bench per debounced keystroke, and picking a value commits the row (single-value picker semantics).',
    },
  },
};

// Fixture-backed twin of LiveCell — network-hermetic (MOCK_HOST, never demo.frappe.cloud).
const IN_TABLE_HOST = 'https://frappe-intable.mock.test';
const userFixtures = new InMemoryFixtureProvider({
  User: [
    { name: 'Administrator', doctype: 'User', full_name: 'Administrator' },
    { name: 'Guest', doctype: 'User', full_name: 'Guest' },
    { name: JANE_EMAIL, doctype: 'User', full_name: 'Jane Example' },
  ],
});

interface LinkInTableRow {
  id: string;
  label: string;
  allocated_to: string;
}

export const InTable = () => {
  const [data, setData] = useState<LinkInTableRow[]>([
    { id: '1', label: 'Alpha', allocated_to: 'Administrator' },
    { id: '2', label: 'Beta', allocated_to: JANE_EMAIL },
    { id: '3', label: 'Gamma', allocated_to: '' },
  ]);
  const columns: DataTableColumn<LinkInTableRow>[] = [
    { accessorKey: 'label', header: 'Row' },
    {
      accessorKey: 'allocated_to',
      header: 'Allocated To',
      ...fieldtypeToTableField('Link', 'User'),
    },
  ];
  return (
    <FrappeProvider
      baseURL={IN_TABLE_HOST}
      fixtures={userFixtures}>
      <YStack
        width="100%"
        height={280}>
        <DataTable
          data={data}
          columns={columns}
          enablePagination={false}
          onDataChange={setData}
        />
      </YStack>
    </FrappeProvider>
  );
};
InTable.storyName = 'In table';
