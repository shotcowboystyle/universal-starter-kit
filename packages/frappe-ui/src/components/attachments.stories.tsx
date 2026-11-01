import { InMemoryFixtureProvider } from '@repo/frappe';
import { action } from '@repo/storybook';

import { FrappeStoryProvider } from '../frappe-story-target';
import { FrappeProvider } from '../FrappeProvider';

import { Attachments } from './attachments';
import type { FrappeFile } from './attachments';

export default {
  title: 'FrappeUI/FrappeAttachments',
  component: Attachments,
  tags: ['!test'],
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'Frappe bridge for the generic Attachments component: maps File documents (filtered by attached_to_doctype/name) into AttachmentItem[] and forwards every other prop. Fixture stories are network-hermetic (G-15/D-05): documents come from InMemoryFixtureProvider and DocType meta from an in-story fetch mock, so nothing leaves the machine. The separately-named Live story is the live-bench arm — it targets STORYBOOK_FRAPPE_URL when reachable and falls back to fixtures otherwise.',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Hermetic story host (G-15 story honesty / D-05, closes UX-P18).
//
// Fixture-backed stories previously pointed at https://demo.frappe.cloud. The
// fixture provider serves the *collection*, but DocType meta still resolves
// over HTTP — so those stories fired a real cross-origin request the browser
// rejected with CORS. MOCK_HOST keeps the same code path (real fetch, real
// meta shape) without leaving the machine.
// ---------------------------------------------------------------------------

const MOCK_HOST = 'https://frappeattachments.mock.test';

const fileMetaRaw = (name: string) => ({
  name,
  module: 'Core',
  title_field: 'file_name',
  fields: [
    { fieldname: 'file_name', fieldtype: 'Data', label: 'File Name', in_list_view: 1 },
    { fieldname: 'file_url', fieldtype: 'Attach', label: 'File URL' },
    { fieldname: 'file_size', fieldtype: 'Int', label: 'File Size', in_list_view: 1 },
    { fieldname: 'file_type', fieldtype: 'Data', label: 'File Type' },
    { fieldname: 'is_private', fieldtype: 'Check', label: 'Is Private' },
    {
      fieldname: 'attached_to_doctype',
      fieldtype: 'Link',
      label: 'Attached To DocType',
      options: 'DocType',
    },
    { fieldname: 'attached_to_name', fieldtype: 'Data', label: 'Attached To Name' },
    { fieldname: 'attached_to_field', fieldtype: 'Data', label: 'Attached To Field' },
    { fieldname: 'creation', fieldtype: 'Datetime', label: 'Created On' },
    { fieldname: 'modified', fieldtype: 'Datetime', label: 'Last Modified' },
  ],
  permissions: [{ role: 'All', read: 1, write: 1, create: 1 }],
});

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
  const w: Window & { __frappeAttachmentsMockFetch?: boolean } = window;
  if (w.__frappeAttachmentsMockFetch === true) {
    return;
  }
  w.__frappeAttachmentsMockFetch = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = urlOf(input);
    if (urlStr.startsWith(MOCK_HOST)) {
      const url = new URL(urlStr);
      if (url.pathname === '/api/method/frappe.desk.form.load.getdoctype') {
        const doctype = url.searchParams.get('doctype') ?? 'File';
        return jsonResponse({ docs: [fileMetaRaw(doctype)] });
      }
      const metaMatch = /^\/api\/resource\/DocType\/(?<doctype>.+)$/u.exec(url.pathname);
      if (metaMatch) {
        return jsonResponse({ data: fileMetaRaw(decodeURIComponent(metaMatch[1])) });
      }
      if (url.pathname === '/api/resource/DocType') {
        return jsonResponse({ data: [{ name: 'File', module: 'Core' }] });
      }
      // Everything else (guest field-peek, counts): empty, never the network.
      return jsonResponse({ data: [] });
    }
    return await realFetch(input as RequestInfo, init);
  };
})();

// 1x1 PNG so the image thumbnail does not GET /files/diagram.png off the
// Storybook origin (that 404 was the recorded fuzz FAIL). file_type is the
// MIME the thumbnail recognises; file_name keeps the .png extension for the
// type well. Same byte string as FrappeFileUpload.stories.
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const fileFixtures: FrappeFile[] = [
  {
    name: 'FILE-001',
    doctype: 'File',
    file_name: 'quarterly-report.pdf',
    file_url: '/files/quarterly-report.pdf',
    file_size: 245_760,
    file_type: 'PDF',
    attached_to_doctype: 'Task',
    attached_to_name: 'TASK-001',
    creation: '2026-01-05 10:00:00',
  },
  {
    name: 'FILE-002',
    doctype: 'File',
    file_name: 'diagram.png',
    file_url: TINY_PNG,
    file_size: 51_200,
    file_type: 'image/png',
    attached_to_doctype: 'Task',
    attached_to_name: 'TASK-001',
    attached_to_field: 'design_attachment',
    creation: '2026-01-06 11:00:00',
  },
  {
    name: 'FILE-003',
    doctype: 'File',
    file_name: 'other-doc-file.txt',
    file_url: '/files/other-doc-file.txt',
    file_size: 1024,
    file_type: 'TXT',
    attached_to_doctype: 'Task',
    attached_to_name: 'TASK-999',
    creation: '2026-01-07 12:00:00',
  },
];

const makeFixtures = () => new InMemoryFixtureProvider({ File: fileFixtures });

export const Main = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={makeFixtures()}>
    <Attachments
      doctype="Task"
      docname="TASK-001"
      label="Attachments"
      onAdd={action('onAdd')}
      onRemove={action('onRemove')}
      onDownload={action('onDownload')}
      onAttachmentClick={action('onAttachmentClick')}
    />
  </FrappeProvider>
);
Main.storyName = 'Main';

/** fieldname filter must narrow to files attached to that specific field. */
export const FieldScoped = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={makeFixtures()}>
    <Attachments
      doctype="Task"
      docname="TASK-001"
      fieldname="design_attachment"
      label="Design"
    />
  </FrappeProvider>
);

/** No files match: the base component's empty state must show. */
export const Empty = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={makeFixtures()}>
    <Attachments
      doctype="Task"
      docname="TASK-NO-FILES"
      label="Attachments"
    />
  </FrappeProvider>
);

/** disabled forwards to the base component (no add/remove affordances). */
export const Disabled = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={makeFixtures()}>
    <Attachments
      doctype="Task"
      docname="TASK-001"
      label="Attachments"
      disabled
    />
  </FrappeProvider>
);

/** No FrappeProvider: config undefined, collection never created, empty state (no crash). */
export const WithoutProvider = () => (
  <Attachments
    doctype="Task"
    docname="TASK-001"
    label="Attachments"
  />
);

/** Fixture provider whose list fetch never resolves — holds the File subscription in loading. */
class PendingFixtureProvider extends InMemoryFixtureProvider {
  // oxlint-disable-next-line eslint/class-methods-use-this -- overrides the FixtureProvider instance method
  async getList(): Promise<never[]> {
    // oxlint-disable-next-line promise/avoid-new, eslint/no-empty-function -- a promise that never settles holds the subscription in loading
    return await new Promise(() => {});
  }
}

/**
 * File subscription still syncing — the base component's row-shaped skeleton
 * twin, never empty chrome (LC-20 / DG-ST-02).
 */
export const Loading = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new PendingFixtureProvider()}>
    <Attachments
      doctype="Task"
      docname="TASK-001"
      label="Attachments"
    />
  </FrappeProvider>
);

/** Fixture provider whose initial list fetch rejects — the failed-sync path. */
class FailingFixtureProvider extends InMemoryFixtureProvider {
  // Promise<never[]> stays assignable to the generic base getList (same
  // pattern as PendingFixtureProvider above); ReturnType<> erased the type
  // parameter to its constraint and broke FixtureProvider conformance.
  // oxlint-disable-next-line eslint/class-methods-use-this -- overrides the FixtureProvider instance method
  async getList(): Promise<never[]> {
    throw new Error('File subscription failed');
  }
}

/**
 * The initial File sync fails (fixture rejects deterministically — no real
 * network, so the story renders identically behind proxies/offline): the
 * failure surfaces as error chrome with Retry instead of masquerading as
 * "no attachments" (DG-ST-01 / Axiom 6). Retry re-creates the collection and
 * re-runs the initial sync (recovery is covered by tests/attachments.spec).
 */
export const LoadError = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new FailingFixtureProvider()}>
    <Attachments
      doctype="Task"
      docname="TASK-001"
      label="Attachments"
      onAdd={action('onAdd')}
    />
  </FrappeProvider>
);

// ---------------------------------------------------------------------------
// Live bench story — real File documents over the live data path
// ---------------------------------------------------------------------------

/**
 * Live attachment list against the real bench: subscribes to the File
 * doctype filtered by attached_to_doctype/name, so uploads and deletions on
 * the server appear in place without a reload. The doctype/docname args
 * select the target document (harnesses pass a real doc via URL args).
 * Falls back to fixtures when the bench is down.
 */
export const Live = (args: { doctype?: string; docname?: string }) => (
  <FrappeStoryProvider fixtures={makeFixtures()}>
    <Attachments
      doctype={args.doctype ?? 'Task'}
      docname={args.docname ?? 'TASK-001'}
      label="Attachments"
      onAttachmentClick={action('onAttachmentClick')}
    />
  </FrappeStoryProvider>
);
Live.args = { doctype: '', docname: '' };
Live.argTypes = { doctype: { control: 'text' }, docname: { control: 'text' } };
Live.parameters = {
  docs: {
    description: {
      story:
        'Live attachment list over the real bench File doctype: realtime list_update events insert/evict rows in place. Fixture fallback (Task/TASK-001) when the bench is down.',
    },
  },
};
