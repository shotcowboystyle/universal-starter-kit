import { InMemoryFixtureProvider } from '@repo/frappe';
import { action } from '@repo/storybook';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { YStack } from 'tamagui';

import { FrappeProvider } from '../FrappeProvider';

import { Link } from './Link';
import type { LinkProps } from './Link';
import { LinkTree } from './LinkTree';

export default {
  title: 'FrappeUI/LinkTree',
  component: LinkTree,
  tags: ['!test'],
  parameters: {
    status: { type: 'beta' },
    docs: {
      description: {
        component:
          'Schema Link whose target DocType is a tree (Account, Item Group, Territory). Loads the forest the same way FrappeTreeView does, then renders TreeSelect. Link.tsx routes here when useDocTypeMeta().is_tree is set; control="combobox" ejects back to search_link.',
      },
    },
  },
  argTypes: {
    label: { control: 'text' },
    value: { control: 'text' },
    doctype: { control: 'text' },
    disabled: { control: 'boolean' },
    required: { control: 'boolean' },
    readOnly: { control: 'boolean' },
    error: { control: 'text' },
  },
};

const MOCK_HOST = 'https://frappe-linktree.mock.test';

interface Region {
  name: string;
  doctype: string;
  region_name: string;
  parent_region: string;
}

const regionDocs: Region[] = [
  { name: 'North', doctype: 'QaRegion', region_name: 'Northern Region', parent_region: '' },
  { name: 'South', doctype: 'QaRegion', region_name: 'Southern Region', parent_region: '' },
  { name: 'West', doctype: 'QaRegion', region_name: 'Western Region', parent_region: '' },
  {
    name: 'North A',
    doctype: 'QaRegion',
    region_name: 'North Sub-Region A',
    parent_region: 'North',
  },
  {
    name: 'North B',
    doctype: 'QaRegion',
    region_name: 'North Sub-Region B',
    parent_region: 'North',
  },
  {
    name: 'North A1',
    doctype: 'QaRegion',
    region_name: 'North Leaf A1',
    parent_region: 'North A',
  },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function regionMeta(name: string) {
  return {
    name,
    module: 'QA',
    title_field: 'region_name',
    is_tree: 1,
    fields: [
      { fieldname: 'region_name', fieldtype: 'Data', label: 'Region Name', in_list_view: 1 },
      { fieldname: 'parent_region', fieldtype: 'Link', label: 'Parent Region', options: name },
    ],
    permissions: [{ role: 'All', read: 1, write: 1, create: 1 }],
  };
}

(() => {
  if (typeof window === 'undefined') {
    return;
  }
  const w = window as unknown as Record<string, unknown>;
  if (w.__frappeLinkTreeMockFetch) {
    return;
  }
  w.__frappeLinkTreeMockFetch = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (urlStr.startsWith(MOCK_HOST)) {
      const url = new URL(urlStr);
      if (url.pathname.includes('frappe.desk.form.load.getdoctype')) {
        return jsonResponse({ docs: [regionMeta('QaRegion')] });
      }
      if (url.pathname.includes('frappe.desk.search.get_link_title')) {
        const docname = url.searchParams.get('docname') ?? '';
        const hit = regionDocs.find((row) => row.name === docname);
        return jsonResponse({ message: hit?.region_name ?? docname });
      }
      if (url.pathname.includes('frappe.sessions.get_csrf_token')) {
        return jsonResponse({ message: 'mock-csrf' });
      }
      const metaMatch = /^\/api\/resource\/DocType\/(.+)$/.exec(url.pathname);
      if (metaMatch) {
        return jsonResponse({ data: regionMeta(decodeURIComponent(metaMatch[1])) });
      }
      return jsonResponse({ data: [], message: [] });
    }
    return await realFetch(input as RequestInfo, init);
  };
})();

function host(children: ReactNode, docs: Region[] = regionDocs) {
  return (
    <FrappeProvider
      baseURL={MOCK_HOST}
      fixtures={new InMemoryFixtureProvider({ QaRegion: docs })}>
      {children}
    </FrappeProvider>
  );
}

function ControlledTree(props: Omit<LinkProps, 'onChange' | 'doctype'> & { doctype?: string }) {
  const [value, setValue] = useState(props.value ?? '');
  return (
    <LinkTree
      label="Region"
      doctype="QaRegion"
      {...props}
      value={value}
      onChange={(next) => {
        setValue(next);
        action('onChange')(next);
      }}
    />
  );
}

export const Default = (args: Partial<LinkProps>) => host(<ControlledTree {...args} />);
Default.args = {
  label: 'Region',
  placeholder: 'Select a region',
};
Default.storyName = 'Main';

export const AllStates = () =>
  host(
    <YStack
      gap="$4"
      width={400}>
      <ControlledTree label="Default" />
      <ControlledTree
        label="With Value"
        value="North A"
      />
      <ControlledTree
        label="Required"
        required
      />
      <ControlledTree
        label="With Error"
        error="Pick a leaf region"
      />
      <ControlledTree
        label="Disabled"
        value="South"
        disabled
      />
      <ControlledTree
        label="Read Only"
        value="West"
        readOnly
      />
    </YStack>,
  );

export const Empty = () => host(<ControlledTree label="Region (empty forest)" />, []);
Empty.parameters = {
  docs: {
    description: {
      story:
        'Tree DocType with no rows: TreeSelect still mounts with the placeholder and an empty forest, so the field never degrades to a blank or a spinner that never settles.',
    },
  },
};

export const Nested = () =>
  host(
    <YStack
      gap="$4"
      width={400}>
      <ControlledTree
        label="Leaf, three levels deep"
        value="North A1"
      />
      <ControlledTree
        label="Branch, two levels deep"
        value="North A"
      />
    </YStack>,
  );
Nested.parameters = {
  docs: {
    description: {
      story:
        "North > North A > North A1: a stored link to a nested node resolves through the loaded forest, so the trigger shows the node's title_field, not its name.",
    },
  },
};

export const ViaLink = () => {
  const [value, setValue] = useState('North A');
  return host(
    <YStack
      gap="$4"
      width={400}>
      <Link
        label="Region (through Link, is_tree)"
        doctype="QaRegion"
        value={value}
        onChange={(next) => {
          setValue(next);
          action('onChange')(next);
        }}
      />
    </YStack>,
  );
};
ViaLink.storyName = 'Via Link';
ViaLink.parameters = {
  docs: {
    description: {
      story:
        'Resolves through Link with a tree DocType so a lost LinkTree import shows up as a Combobox on this board instead of only in Link.tree.spec.tsx.',
    },
  },
};
