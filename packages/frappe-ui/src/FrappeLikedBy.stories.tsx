import { InMemoryFixtureProvider } from '@repo/frappe';
import { action } from '@repo/storybook';

import { FrappeLikedBy } from './FrappeLikedBy';
import { FrappeProvider } from './FrappeProvider';
import { FrappeStoryProvider, LiveToDoGate, frappeStoriesLive } from './frappeStoryTarget';
import type { FrappeUserDoc } from './frappeUsers';

export default {
  title: 'FrappeUI/FrappeLikedBy',
  component: FrappeLikedBy,
  tags: ['!test'],
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'Heart / like toggle for one document: count + avatar cluster from the `_liked_by` JSON field, optimistic toggle via the whitelisted `frappe.desk.like.toggle_like` method (fixtures emulate it with an optimistic collection update), live doc subscription so out-of-band likes update in place. Fixture stories are network-hermetic (G-15/D-05): documents come from InMemoryFixtureProvider and DocType meta from an in-story fetch mock, so nothing leaves the machine. The separately-named Live story is the live-bench arm.',
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
// rejected with CORS, poisoning the console for every automated probe.
// MOCK_HOST keeps the same code path (real fetch, real meta shape) without
// leaving the machine; ERR_HOST is the deliberate failure host for LoadError.
// ---------------------------------------------------------------------------

const MOCK_HOST = 'https://frappelikedby.mock.test';
const ERR_HOST = 'https://forbidden.frappelikedby.mock.test';

function likedByMetaRaw(name: string) {
  return {
    name,
    module: name === 'User' ? 'Core' : name === 'ToDo' ? 'Desk' : 'Projects',
    title_field: name === 'User' ? 'full_name' : 'subject',
    fields: [
      { fieldname: 'subject', fieldtype: 'Data', label: 'Subject', in_list_view: 1 },
      { fieldname: '_liked_by', fieldtype: 'Text', label: 'Liked By', hidden: 1 },
      { fieldname: 'full_name', fieldtype: 'Data', label: 'Full Name' },
      { fieldname: 'user_image', fieldtype: 'Attach Image', label: 'User Image', hidden: 1 },
    ],
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
  if (w.__frappeLikedByMockFetch) {
    return;
  }
  w.__frappeLikedByMockFetch = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (urlStr.startsWith(ERR_HOST)) {
      return jsonResponse({ message: 'Not permitted' }, 403);
    }
    if (urlStr.startsWith(MOCK_HOST)) {
      const url = new URL(urlStr);
      if (url.pathname === '/api/method/frappe.desk.form.load.getdoctype') {
        const doctype = url.searchParams.get('doctype') ?? 'Task';
        return jsonResponse({ docs: [likedByMetaRaw(decodeURIComponent(doctype))] });
      }
      const metaMatch = /^\/api\/resource\/DocType\/(.+)$/.exec(url.pathname);
      if (metaMatch) {
        return jsonResponse({ data: likedByMetaRaw(decodeURIComponent(metaMatch[1])) });
      }
      if (url.pathname === '/api/resource/DocType') {
        return jsonResponse({
          data: [
            { name: 'Task', module: 'Projects' },
            { name: 'ToDo', module: 'Desk' },
            { name: 'User', module: 'Core' },
          ],
        });
      }
      // Everything else (guest field-peek, counts, likes RPC): empty, never the network.
      return jsonResponse({ data: [] });
    }
    return await realFetch(input as RequestInfo, init);
  };
})();

const userFixtures: FrappeUserDoc[] = [
  { name: 'Administrator', doctype: 'User', full_name: 'Administrator' },
  { name: 'jane@example.com', doctype: 'User', full_name: 'Jane Doe' },
  { name: 'john@example.com', doctype: 'User', full_name: 'John Smith' },
  { name: 'maria@example.com', doctype: 'User', full_name: 'Maria Garcia' },
  { name: 'amit@example.com', doctype: 'User', full_name: 'Amit Patel' },
  { name: 'li@example.com', doctype: 'User', full_name: 'Li Wei' },
];

const makeFixtures = () =>
  new InMemoryFixtureProvider({
    Task: [
      {
        name: 'TASK-001',
        doctype: 'Task',
        _liked_by: JSON.stringify(['Administrator', 'jane@example.com']),
      },
      { name: 'TASK-002', doctype: 'Task', _liked_by: '[]' },
      {
        name: 'TASK-003',
        doctype: 'Task',
        _liked_by: JSON.stringify([
          'Administrator',
          'jane@example.com',
          'john@example.com',
          'maria@example.com',
          'amit@example.com',
          'li@example.com',
        ]),
      },
    ],
    // The live story's doctype. `Task` ships with ERPNext, not frappe, so a
    // frappe-only bench answers `/api/resource/Task/TASK-001` with a 500
    // ImportError instead of a document — the live arm has to name a doctype
    // every bench actually has, and this fixture keeps its offline fallback
    // rendering.
    ToDo: [
      {
        name: 'TODO-LIVE-001',
        doctype: 'ToDo',
        _liked_by: JSON.stringify(['Administrator', 'jane@example.com']),
      },
    ],
    User: userFixtures,
  });

/** Liked by the current user: filled heart, count 2, two avatars. Toggling flips optimistically. */
export const Main = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={makeFixtures()}>
    <FrappeLikedBy
      doctype="Task"
      name="TASK-001"
      currentUser="Administrator"
      onToggle={action('onToggle')}
    />
  </FrappeProvider>
);
Main.storyName = 'Main';

/** Current user has not liked the doc: outline heart, existing likes still render. */
export const NotLiked = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={makeFixtures()}>
    <FrappeLikedBy
      doctype="Task"
      name="TASK-001"
      currentUser="john@example.com"
      onToggle={action('onToggle')}
    />
  </FrappeProvider>
);

/** Zero likes: outline heart only — no count, no avatars. */
export const NoLikes = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={makeFixtures()}>
    <FrappeLikedBy
      doctype="Task"
      name="TASK-002"
      currentUser="Administrator"
    />
  </FrappeProvider>
);

/** Six likers with maxAvatars=3: three avatars + a "+3" overflow bubble. */
export const ManyLikes = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={makeFixtures()}>
    <FrappeLikedBy
      doctype="Task"
      name="TASK-003"
      currentUser="Administrator"
      maxAvatars={3}
    />
  </FrappeProvider>
);

/** Avatar cluster suppressed — heart + count only. */
export const WithoutAvatars = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={makeFixtures()}>
    <FrappeLikedBy
      doctype="Task"
      name="TASK-001"
      currentUser="Administrator"
      showAvatars={false}
    />
  </FrappeProvider>
);

/** disabled: list renders, the heart does not toggle. */
export const Disabled = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={makeFixtures()}>
    <FrappeLikedBy
      doctype="Task"
      name="TASK-001"
      currentUser="Administrator"
      disabled
    />
  </FrappeProvider>
);

/** No FrappeProvider: config undefined, collection never created (no crash). */
export const WithoutProvider = () => (
  <FrappeLikedBy
    doctype="Task"
    name="TASK-001"
  />
);

/** Fixture provider whose fetches never resolve — holds the doc subscription
 * in loading. The name-filtered doc subscription fetches through getDoc (the
 * single-doc path), so that must hang too — getList alone only covers list
 * subscriptions. */
class PendingFixtureProvider extends InMemoryFixtureProvider {
  async getList(): Promise<never[]> {
    return await new Promise(() => {});
  }
  async getDoc(): Promise<never> {
    return await new Promise(() => {});
  }
}

/** Doc subscription still syncing — skeleton chrome, never "zero likes" (LC-20 / DG-ST-02). */
export const Loading = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new PendingFixtureProvider()}>
    <FrappeLikedBy
      doctype="Task"
      name="TASK-001"
      currentUser="Administrator"
    />
  </FrappeProvider>
);

/**
 * Live doc subscription against an unreachable host with no fixtures: the
 * failed initial sync surfaces as error chrome with Retry instead of
 * masquerading as "no likes" (DG-ST-01 / Axiom 6). The failure is served
 * hermetically — the in-story mock answers ERR_HOST with 403.
 */
export const LoadError = () => (
  <FrappeProvider baseURL={ERR_HOST}>
    <FrappeLikedBy
      doctype="Task"
      name="TASK-001"
    />
  </FrappeProvider>
);

// ---------------------------------------------------------------------------
// Live bench story — real _liked_by over the live data path
// ---------------------------------------------------------------------------

/**
 * Live likes against the real bench: subscribes to the target document and
 * toggles through the whitelisted `toggle_like` method (session user
 * resolved via `get_logged_user` through the Storybook proxy). Falls back
 * to fixtures when the bench is down.
 */
export const Live = (args: { doctype?: string; docname?: string }) => (
  <FrappeStoryProvider fixtures={makeFixtures()}>
    <LiveToDoGate name={args.docname}>
      {(name) => (
        <FrappeLikedBy
          doctype={args.doctype ?? 'ToDo'}
          name={name}
          // Live mode resolves the session user via get_logged_user; the fixture
          // fallback has no session, so pin one for interactivity.
          currentUser={frappeStoriesLive ? undefined : 'Administrator'}
          onToggle={action('onToggle')}
        />
      )}
    </LiveToDoGate>
  </FrappeStoryProvider>
);
Live.args = { doctype: '', docname: '' };
Live.argTypes = { doctype: { control: 'text' }, docname: { control: 'text' } };
Live.parameters = {
  docs: {
    description: {
      story:
        'Live like toggle over the real bench ToDo (not ERPNext Task — a frappe-only bench 500s ImportError on Task). Optimistic flip, `toggle_like` POST, revert on failure; out-of-band likes stream in via the doc subscription. Pass a real `docname` or let the story resolve/seed a readable ToDo. Fixture fallback (ToDo/TODO-LIVE-001) when the bench is down.',
    },
  },
};
