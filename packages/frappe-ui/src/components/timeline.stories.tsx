import { InMemoryFixtureProvider } from '@repo/frappe';
import { action } from '@repo/storybook';
import { formatAbsoluteDateTime } from '@repo/theme';

import { FrappeStoryProvider } from '../frappe-story-target';
import { FrappeProvider } from '../FrappeProvider';

import { Timeline } from './timeline';
import type { FrappeComment, FrappeVersion } from './timeline';

export default {
  title: 'FrappeUI/FrappeTimeline',
  component: Timeline,
  tags: ['!test'],
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'Frappe bridge for the generic Timeline: merges Comment and Version documents into TimelineEntry[], sorted newest-first. Fixture stories are network-hermetic (G-15/D-05): documents come from InMemoryFixtureProvider and DocType meta from an in-story fetch mock, so nothing leaves the machine. The separately-named Live story is the live-bench arm — it targets STORYBOOK_FRAPPE_URL when reachable and falls back to fixtures otherwise.',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Hermetic story host (G-15 story honesty / D-05).
//
// Fixture-backed stories previously pointed at https://demo.frappe.cloud. The
// fixture provider serves the *collection*, but DocType meta still resolves
// over HTTP — so those stories fired a real cross-origin request the browser
// rejected with CORS. MOCK_HOST keeps the same code path (real fetch, real
// meta shape) without leaving the machine.
// ---------------------------------------------------------------------------

const MOCK_HOST = 'https://frappetimeline.mock.test';

const commentMetaRaw = (name: string) => ({
  name,
  module: 'Core',
  title_field: 'content',
  fields: [
    { fieldname: 'comment_type', fieldtype: 'Select', label: 'Comment Type' },
    { fieldname: 'content', fieldtype: 'Text Editor', label: 'Content' },
    { fieldname: 'comment_by', fieldtype: 'Data', label: 'Comment By' },
    { fieldname: 'reference_doctype', fieldtype: 'Link', label: 'Reference Document Type' },
    { fieldname: 'reference_name', fieldtype: 'Dynamic Link', label: 'Reference Name' },
    { fieldname: 'creation', fieldtype: 'Datetime', label: 'Created On' },
  ],
  permissions: [{ role: 'All', read: 1, write: 1, create: 1 }],
});

const versionMetaRaw = (name: string) => ({
  name,
  module: 'Core',
  fields: [
    { fieldname: 'ref_doctype', fieldtype: 'Link', label: 'Reference Document Type' },
    { fieldname: 'docname', fieldtype: 'Dynamic Link', label: 'Document Name' },
    { fieldname: 'data', fieldtype: 'Code', label: 'Data' },
    { fieldname: 'creation', fieldtype: 'Datetime', label: 'Created On' },
  ],
  permissions: [{ role: 'All', read: 1 }],
});

const metaFor = (doctype: string) => {
  if (doctype === 'Version') {
    return versionMetaRaw(doctype);
  }
  return commentMetaRaw(doctype);
};

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- serializes any mock payload; the story owns its shape
const jsonResponse = (body: unknown, status = 200): Response => Response.json(body, { status });

const urlOf = (input: RequestInfo | URL): string => {
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
  const w: Window & { __frappeTimelineMockFetch?: boolean } = window;
  if (w.__frappeTimelineMockFetch === true) {
    return;
  }
  w.__frappeTimelineMockFetch = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = urlOf(input);
    if (urlStr.startsWith(MOCK_HOST)) {
      const url = new URL(urlStr);
      if (url.pathname === '/api/method/frappe.desk.form.load.getdoctype') {
        const doctype = url.searchParams.get('doctype') ?? 'Comment';
        return jsonResponse({ docs: [metaFor(doctype)] });
      }
      const metaMatch = /^\/api\/resource\/DocType\/(?<doctype>.+)$/u.exec(url.pathname);
      if (metaMatch) {
        return jsonResponse({ data: metaFor(decodeURIComponent(metaMatch[1])) });
      }
      if (url.pathname === '/api/resource/DocType') {
        return jsonResponse({
          data: [
            { name: 'Comment', module: 'Core' },
            { name: 'Version', module: 'Core' },
          ],
        });
      }
      // Everything else (guest field-peek, counts): empty, never the network.
      return jsonResponse({ data: [] });
    }
    return await realFetch(input as RequestInfo, init);
  };
})();

const now = Date.now();
const iso = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString();

const commentFixtures: FrappeComment[] = [
  {
    name: 'COMM-001',
    doctype: 'Comment',
    comment_type: 'Comment',
    content: 'Looks good to me, shipping it.',
    comment_by: 'jane@example.com',
    reference_doctype: 'Task',
    reference_name: 'TASK-001',
    creation: iso(5),
  },
  {
    name: 'COMM-002',
    doctype: 'Comment',
    comment_type: 'Attachment',
    content: 'added attachment report.pdf',
    comment_by: 'john@example.com',
    reference_doctype: 'Task',
    reference_name: 'TASK-001',
    creation: iso(120),
  },
  {
    name: 'COMM-003',
    doctype: 'Comment',
    comment_type: 'Assignment',
    content: 'assigned to jane@example.com',
    owner: 'admin@example.com',
    reference_doctype: 'Task',
    reference_name: 'TASK-001',
    creation: iso(60 * 24),
  },
  {
    name: 'COMM-004',
    doctype: 'Comment',
    comment_type: 'Info',
    content: 'document was submitted',
    reference_doctype: 'Task',
    reference_name: 'TASK-001',
    creation: iso(60 * 48),
  },
];

const versionFixtures: FrappeVersion[] = [
  {
    name: 'VER-001',
    doctype: 'Version',
    ref_doctype: 'Task',
    docname: 'TASK-001',
    owner: 'jane@example.com',
    data: JSON.stringify({
      changed: [['status', 'Open', 'Working']],
      added: [['priority', 'High']],
      removed: [['old_field', 'junk']],
    }),
    creation: iso(30),
  },
  {
    name: 'VER-002',
    doctype: 'Version',
    ref_doctype: 'Task',
    docname: 'TASK-001',
    owner: 'john@example.com',
    data: '{not valid json at all',
    creation: iso(90),
  },
];

const makeFixtures = () => new InMemoryFixtureProvider({ Comment: commentFixtures, Version: versionFixtures });

export const Main = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={makeFixtures()}>
    <Timeline
      doctype="Task"
      docname="TASK-001"
      label="Activity"
      onAddComment={action('onAddComment')}
      onEntryClick={action('onEntryClick')}
    />
  </FrappeProvider>
);
Main.storyName = 'Main';

/** Version/attachment/assignment entries hidden; only plain comments remain. */
export const CommentsOnly = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={makeFixtures()}>
    <Timeline
      doctype="Task"
      docname="TASK-001"
      label="Comments"
      showVersions={false}
      showAttachments={false}
      showAssignments={false}
      onAddComment={action('onAddComment')}
    />
  </FrappeProvider>
);

/** No entries at all: base Timeline empty state plus comment input. */
export const Empty = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={makeFixtures()}>
    <Timeline
      doctype="Task"
      docname="TASK-EMPTY"
      label="Activity"
      onAddComment={action('onAddComment')}
    />
  </FrappeProvider>
);

/** enableAddComment=false must remove the comment composer. */
export const ReadOnly = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={makeFixtures()}>
    <Timeline
      doctype="Task"
      docname="TASK-001"
      label="Activity"
      enableAddComment={false}
    />
  </FrappeProvider>
);

/**
 * The formatTimestamp eject overrides the per-class register defaults —
 * demoed with the house absolute register pinned to always show the year
 * (LC-12: even an ejected formatter speaks a human register, never raw ISO).
 */
export const AbsoluteTimestamps = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={makeFixtures()}>
    <Timeline
      doctype="Task"
      docname="TASK-001"
      label="Activity"
      formatTimestamp={(ts) => formatAbsoluteDateTime(ts, { year: 'always' })}
    />
  </FrappeProvider>
);

/** Compact mode forwards to the base component. */
export const Compact = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={makeFixtures()}>
    <Timeline
      doctype="Task"
      docname="TASK-001"
      label="Activity"
      compact
    />
  </FrappeProvider>
);

// ---------------------------------------------------------------------------
// Live bench story — real Comment/Version documents over the live data path
// ---------------------------------------------------------------------------

/**
 * Live timeline against the real bench (STORYBOOK_FRAPPE_URL, default the
 * local dev bench proxied by the Storybook dev server). Subscribes to
 * Comment and Version filtered by the target document so desk comments and
 * version rows appear in place. Falls back to fixtures when the bench is
 * unreachable.
 */
export const Live = (args: { doctype?: string; docname?: string }) => (
  <FrappeStoryProvider fixtures={makeFixtures()}>
    <Timeline
      doctype={args.doctype ?? 'Task'}
      docname={args.docname ?? 'TASK-001'}
      label="Activity"
      onAddComment={action('onAddComment')}
      onEntryClick={action('onEntryClick')}
    />
  </FrappeStoryProvider>
);
Live.args = { doctype: '', docname: '' };
Live.argTypes = { doctype: { control: 'text' }, docname: { control: 'text' } };
Live.parameters = {
  docs: {
    description: {
      story:
        'Live Comment/Version feed over the real bench: realtime list_update events insert/evict rows in place. Fixture fallback (Task/TASK-001) when the bench is down.',
    },
  },
};
