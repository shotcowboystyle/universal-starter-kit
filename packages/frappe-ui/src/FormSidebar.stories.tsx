import {
  BellIcon,
  ChatCircleIcon,
  ClockIcon,
  HeartIcon,
  PaperclipIcon,
  TagIcon,
  UsersIcon,
} from '@phosphor-icons/react';
// Catalog Button (LC-56 story honesty): stories compose catalog controls, never raw tamagui ones.
import { Button, Switch } from '@repo/forms';
import { InMemoryFixtureProvider } from '@repo/frappe';
import { action } from '@repo/storybook';
import { Attachments, Tags } from '@repo/ui';
import type { AttachmentItem, TagItem } from '@repo/ui';
import React from 'react';
import { Text, XStack, YStack } from 'tamagui';

import { FormSidebar } from './FormSidebar';
import type { SidebarMetadataEntry, SidebarPerson, SidebarSection } from './FormSidebar';
import { FrappeForm } from './FrappeForm';
import { FrappeProvider } from './FrappeProvider';
import { FrappeStoryProvider, LiveToDoGate, frappeStoriesLive } from './frappeStoryTarget';

// hex-escape: generated image fixtures are data, not paint

export default {
  title: 'FrappeUI/FormSidebar',
  component: FormSidebar,
  tags: ['!test'],
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'Generic form-view sidebar: image (add/replace/remove affordances), configurable sections (assignments, shares, tags) with add/remove callbacks, metadata footer. Desk-style tags/attachments/follow sections compose through `section.render` with catalog primitives.',
      },
    },
  },
};

const people = [
  { id: 'u1', label: 'jane@example.com', sublabel: 'Owner' },
  { id: 'u2', label: 'john@example.com' },
];

const sections: SidebarSection[] = [
  {
    key: 'assigned',
    title: 'Assigned To',
    items: people,
    onAdd: action('onAdd assigned'),
    onRemoveItem: action('onRemoveItem assigned'),
  },
  {
    key: 'shared',
    title: 'Shared With',
    items: [{ id: 'u3', label: 'sam@example.com' }],
    onAdd: action('onAdd shared'),
    onRemoveItem: action('onRemoveItem shared'),
  },
  {
    key: 'tags',
    title: 'Tags',
    emptyText: 'No tags yet',
  },
];

const metadata: SidebarMetadataEntry[] = [
  { label: 'Created by jane@example.com' },
  { label: 'Modified 2 hours ago', icon: <ClockIcon size={14} /> },
  { label: '3 comments', icon: <ChatCircleIcon size={14} /> },
  { label: '2 attachments', icon: <PaperclipIcon size={14} /> },
  { label: '1 tag', icon: <TagIcon size={14} /> },
];

const svgImage = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#4a90d9"/><circle cx="100" cy="100" r="60" fill="#fff"/></svg>',
)}`;

const altSvgImage = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#37a169"/><rect x="50" y="50" width="100" height="100" fill="#fff"/></svg>',
)}`;

export const Main = () => (
  <FormSidebar
    imageUrl={svgImage}
    onImageAdd={action('onImageAdd')}
    onImageRemove={action('onImageRemove')}
    sections={sections}
    metadata={metadata}
  />
);
Main.storyName = 'Main';

/** No image, no sections, no metadata: must render an empty shell without crashing. */
export const Empty = () => <FormSidebar />;

/** Sections with zero items fall back to their emptyText. */
export const EmptySections = () => (
  <FormSidebar
    sections={[
      { key: 'assigned', title: 'Assigned To', items: [], onAdd: action('onAdd') },
      { key: 'shared', title: 'Shared With', items: [] },
    ]}
    metadata={[{ label: 'Created by admin' }]}
  />
);

/** Long user identifiers must truncate inside the fixed 280px rail. */
export const LongLabels = () => (
  <FormSidebar
    sections={[
      {
        key: 'assigned',
        title: 'Assigned To',
        items: [
          {
            id: 'u1',
            label:
              'extremely.long.email.address.that.never.seems.to.end@some-very-long-subdomain.example-corporation.com',
            sublabel: "A very long sublabel describing this person's role in the organization",
          },
        ],
        onRemoveItem: action('onRemoveItem'),
      },
    ]}
    metadata={[
      {
        label:
          'Created by extremely.long.email.address.that.never.seems.to.end@some-very-long-subdomain.example-corporation.com on 2026-01-01 at 12:34:56',
      },
    ]}
  />
);

/** Broken image URL: falls back to a labeled placeholder (layout preserved), Replace stays reachable. */
export const BrokenImage = () => (
  <FormSidebar
    imageUrl="https://broken.invalid/missing.png"
    onImageAdd={action('onImageAdd')}
    sections={[{ key: 'assigned', title: 'Assigned To', items: people }]}
    metadata={metadata.slice(0, 2)}
  />
);

/** No image set + onImageAdd: renders the dashed "Add image" placeholder button. */
export const ImagePlaceholder = () => (
  <FormSidebar
    onImageAdd={action('onImageAdd')}
    sections={[{ key: 'assigned', title: 'Assigned To', items: people }]}
    metadata={metadata.slice(0, 2)}
  />
);

/** Custom render section overrides items/emptyText. */
export const CustomRender = () => (
  <FormSidebar
    sections={[
      {
        key: 'custom',
        title: 'Custom Section',
        render: () => (
          <YStack
            data-testid="custom-render"
            padding="$2"
            backgroundColor="$color3">
            <Text fontSize="$2">Custom content</Text>
          </YStack>
        ),
      },
    ]}
  />
);

/** Full add/remove round-trip with mocked state: + appends a person, X removes, image cycles add → replace → remove. */
export const AddRemoveFlow = () => {
  const [imageUrl, setImageUrl] = React.useState<string | undefined>();
  const [assigned, setAssigned] = React.useState<SidebarPerson[]>([people[0]]);

  const addPerson = () => {
    const n = assigned.length + 1;
    setAssigned([...assigned, { id: `u${Date.now()}`, label: `user${n}@example.com` }]);
    action('onAdd assigned')();
  };
  const removePerson = (item: SidebarPerson) => {
    setAssigned(assigned.filter((p) => p.id !== item.id));
    action('onRemoveItem assigned')(item);
  };
  const changeImage = () => {
    setImageUrl(imageUrl === svgImage ? altSvgImage : svgImage);
    action('onImageAdd')();
  };
  const removeImage = () => {
    setImageUrl(undefined);
    action('onImageRemove')();
  };

  return (
    <FormSidebar
      imageUrl={imageUrl}
      onImageAdd={changeImage}
      onImageRemove={removeImage}
      sections={[
        {
          key: 'assigned',
          title: 'Assigned To',
          items: assigned,
          emptyText: 'No one assigned',
          onAdd: addPerson,
          onRemoveItem: removePerson,
        },
      ]}
      metadata={[{ label: 'Created by jane@example.com' }]}
    />
  );
};

/** Frappe Desk parity: assignments, attachments, shares, tags and a follow/like row composed from catalog primitives via section.render. */
export const DeskParity = () => {
  const [assigned, setAssigned] = React.useState<SidebarPerson[]>(people);
  const [shared, setShared] = React.useState<SidebarPerson[]>([
    { id: 'u3', label: 'sam@example.com', sublabel: 'Read' },
    { id: 'u4', label: 'ana@example.com', sublabel: 'Write' },
  ]);
  const [tags, setTags] = React.useState<TagItem[]>([
    { id: 't1', label: 'urgent' },
    { id: 't2', label: 'billing' },
  ]);
  const [attachments, setAttachments] = React.useState<AttachmentItem[]>([
    { id: 'f1', fileName: 'quarterly-report.pdf', fileUrl: '/files/q.pdf', fileSize: 245_760 },
    // data URI so the thumbnail renders offline instead of 404ing
    { id: 'f2', fileName: 'diagram.png', fileUrl: altSvgImage, isImage: true, fileSize: 51_200 },
  ]);
  const [following, setFollowing] = React.useState(true);
  const [liked, setLiked] = React.useState(false);

  const deskSections: SidebarSection[] = [
    {
      key: 'assigned',
      title: 'Assigned To',
      icon: <UsersIcon size={14} />,
      items: assigned,
      emptyText: 'No one assigned',
      onAdd: () => {
        setAssigned((prev) => [...prev, { id: `u${Date.now()}`, label: `user${prev.length + 1}@example.com` }]);
      },
      onRemoveItem: (item) => {
        setAssigned((prev) => prev.filter((p) => p.id !== item.id));
      },
    },
    {
      key: 'attachments',
      title: 'Attachments',
      icon: <PaperclipIcon size={14} />,
      render: () => (
        <Attachments
          compact
          items={attachments}
          onRemove={(a) => {
            setAttachments((prev) => prev.filter((x) => x.id !== a.id));
          }}
          onAdd={(file) => {
            setAttachments((prev) => [
              ...prev,
              { id: `f${Date.now()}`, fileName: file.name, fileUrl: '#', fileSize: file.size },
            ]);
          }}
          onAttachmentClick={action('onAttachmentClick')}
          enableDownload={false}
          enablePreview={false}
        />
      ),
    },
    {
      key: 'shared',
      title: 'Shared With',
      icon: <UsersIcon size={14} />,
      items: shared,
      emptyText: 'Not shared',
      onAdd: () => {
        setShared((prev) => [
          ...prev,
          { id: `s${Date.now()}`, label: `guest${prev.length + 1}@example.com`, sublabel: 'Read' },
        ]);
      },
      onRemoveItem: (item) => {
        setShared((prev) => prev.filter((p) => p.id !== item.id));
      },
    },
    {
      key: 'tags',
      title: 'Tags',
      icon: <TagIcon size={14} />,
      render: () => (
        <Tags
          tags={tags}
          suggestions={[
            { id: 't3', label: 'follow-up' },
            { id: 't4', label: 'customer' },
          ]}
          onAdd={(name) => {
            setTags((prev) => [...prev, { id: `t${Date.now()}`, label: name }]);
          }}
          onRemove={(tag) => {
            setTags((prev) => prev.filter((x) => x.id !== tag.id));
          }}
          enableAdd
        />
      ),
    },
    {
      key: 'follow',
      title: 'Follow',
      icon: <BellIcon size={14} />,
      render: () => (
        <XStack
          alignItems="center"
          justifyContent="space-between">
          <Button
            size="$1"
            chromeless
            icon={HeartIcon}
            aria-label={liked ? 'Unlike document' : 'Like document'}
            onPress={() => {
              setLiked((v) => !v);
            }}
            theme={liked ? 'red' : undefined}>
            {liked ? 'Liked' : 'Like'}
          </Button>
          <Switch
            size="$2"
            checked={following}
            onChange={setFollowing}
            switchProps={{ 'aria-label': 'Follow document' } as never}
          />
        </XStack>
      ),
    },
  ];

  return (
    <FormSidebar
      imageUrl={svgImage}
      onImageAdd={action('onImageAdd')}
      onImageRemove={action('onImageRemove')}
      sections={deskSections}
      metadata={metadata}
    />
  );
};

// ---------------------------------------------------------------------------
// Live bench story — sidebar data plumbing over the live data path
// ---------------------------------------------------------------------------

/**
 * Getdoctype-shaped ToDo meta for the fixture fallback, mirroring the bench's
 * own ToDo (title_field `description`, the Reference section, the two fields
 * the story hides). Schema mode cannot render without meta, so the documented
 * "falls back to fixtures when the bench is down" promise needs this entry —
 * without it the offline story only ever showed a failed meta request.
 */
const todoFixtureMeta = {
  name: 'ToDo',
  doctype: 'DocType',
  module: 'Desk',
  title_field: 'description',
  sort_field: 'modified',
  sort_order: 'DESC',
  fields: [
    { fieldname: 'description_and_status', fieldtype: 'Section Break' },
    {
      fieldname: 'status',
      fieldtype: 'Select',
      label: 'Status',
      options: 'Open\nClosed\nCancelled',
      in_list_view: 1,
    },
    {
      fieldname: 'priority',
      fieldtype: 'Select',
      label: 'Priority',
      options: 'High\nMedium\nLow',
      in_list_view: 1,
    },
    { fieldname: 'column_break_2', fieldtype: 'Column Break' },
    { fieldname: 'color', fieldtype: 'Color', label: 'Color' },
    { fieldname: 'date', fieldtype: 'Date', label: 'Due Date', in_list_view: 1 },
    { fieldname: 'allocated_to', fieldtype: 'Link', label: 'Allocated To', options: 'User' },
    { fieldname: 'description_section', fieldtype: 'Section Break' },
    { fieldname: 'description', fieldtype: 'Text Editor', label: 'Description', required: 1 },
    { fieldname: 'section_break_6', fieldtype: 'Section Break', label: 'Reference' },
    {
      fieldname: 'reference_type',
      fieldtype: 'Link',
      label: 'Reference Type',
      options: 'DocType',
      in_list_view: 1,
    },
    {
      fieldname: 'reference_name',
      fieldtype: 'Dynamic Link',
      label: 'Reference Name',
      options: 'reference_type',
    },
    { fieldname: 'column_break_10', fieldtype: 'Column Break' },
    { fieldname: 'role', fieldtype: 'Link', label: 'Role', options: 'Role' },
    { fieldname: 'assigned_by', fieldtype: 'Link', label: 'Assigned By', options: 'User' },
    {
      fieldname: 'assigned_by_full_name',
      fieldtype: 'Read Only',
      label: 'Assigned By Full Name',
    },
    { fieldname: 'sender', fieldtype: 'Data', label: 'Sender', options: 'Email' },
    {
      fieldname: 'assignment_rule',
      fieldtype: 'Link',
      label: 'Assignment Rule',
      options: 'Assignment Rule',
      read_only: 1,
    },
  ],
  permissions: [{ role: 'All', read: 1, write: 1 }],
};

// ---------------------------------------------------------------------------
// Hermetic Live fallback (G-15 story honesty / D-05, closes UX-P18).
//
// FrappeStoryProvider's offline arm still targets demo.frappe.cloud as
// baseURL. Native / Kitchen Sink / TestFlight never have the bench, so that
// host fires CORS-failing getdoctype requests even with fixtures. MOCK_HOST
// keeps the same code path (real fetch, real meta shape) without leaving the
// machine. The live arm still uses FrappeStoryProvider when the bench is up.
// ---------------------------------------------------------------------------

const MOCK_HOST = 'https://frappeformsidebar.mock.test';

const liveSidebarFixtures = new InMemoryFixtureProvider({
  DocType: [todoFixtureMeta],
  ToDo: [
    {
      name: 'TODO-LIVE-001',
      doctype: 'ToDo',
      description: 'Fixture fallback todo (bench unreachable)',
      status: 'Open',
      priority: 'Medium',
      _assign: '["jane@example.com"]',
    },
  ],
});

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
  if (w.__frappeFormSidebarMockFetch) {
    return;
  }
  w.__frappeFormSidebarMockFetch = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (urlStr.startsWith(MOCK_HOST)) {
      const url = new URL(urlStr);
      if (url.pathname === '/api/method/frappe.desk.form.load.getdoctype') {
        const doctype = url.searchParams.get('doctype') ?? 'ToDo';
        const meta = doctype === 'ToDo' ? todoFixtureMeta : { ...todoFixtureMeta, name: doctype };
        return jsonResponse({ docs: [meta] });
      }
      const metaMatch = /^\/api\/resource\/DocType\/(.+)$/.exec(url.pathname);
      if (metaMatch) {
        const doctype = decodeURIComponent(metaMatch[1]);
        const meta = doctype === 'ToDo' ? todoFixtureMeta : { ...todoFixtureMeta, name: doctype };
        return jsonResponse({ data: meta });
      }
      if (url.pathname === '/api/resource/DocType') {
        return jsonResponse({ data: [{ name: 'ToDo', module: 'Desk' }] });
      }
      // Everything else (DocShare, guest field-peek, counts): empty, never the network.
      return jsonResponse({ data: [] });
    }
    return await realFetch(input as RequestInfo, init);
  };
})();

/**
 * Live sidebar plumbing: renders FrappeForm (schema mode + showSidebar)
 * against the real bench ToDo doctype so the sidebar's assignments
 * (`_assign`), shares (DocShare) and metadata reflect realtime changes to
 * the open document in place. The `name` arg selects the document
 * (harnesses pass a real doc name via URL args). When live with no arg,
 * LiveToDoGate resolves a real ToDo so the story does not 404 on a
 * hash-named doctype. Falls back to MOCK_HOST + fixtures when the bench is
 * down — native never needs the bench or demo.frappe.cloud.
 */
export const Live = (args: { name?: string }) => {
  const form = (
    <LiveToDoGate name={args.name}>
      {(name) => (
        <FrappeForm
          doctype="ToDo"
          name={name}
          showSidebar
          hideFields={['assigned_by_full_name', 'sender']}
        />
      )}
    </LiveToDoGate>
  );
  if (frappeStoriesLive) {
    return <FrappeStoryProvider>{form}</FrappeStoryProvider>;
  }
  return (
    <FrappeProvider
      baseURL={MOCK_HOST}
      fixtures={liveSidebarFixtures}>
      {form}
    </FrappeProvider>
  );
};
Live.args = { name: '' };
Live.argTypes = { name: { control: 'text' } };
Live.parameters = {
  docs: {
    description: {
      story:
        'Live sidebar over the real bench: assignments (_assign), shares (DocShare subscription) and metadata update in place when the open ToDo changes on the server. Opens a real bench ToDo so the live arm is not a 404. Administrator sees live DocShare rows; an ordinary Desk User is refused DocShare (403) and the Shared With section degrades — that is expected, not a product failure. When the bench is down (Kitchen Sink / TestFlight / native) the fallback uses MOCK_HOST https://frappeformsidebar.mock.test plus fixtures so DocType meta never hits demo.frappe.cloud.',
    },
  },
};
