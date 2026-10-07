// useFrappeFacets — fixture-mode counts (InMemoryFixtureProvider +
// matchesFilters), live-mode RPC payloads (scoped fetch mock over the two
// desk endpoints), the exclude-own-field rule, stale-while-visible
// revalidation, and the promoted desk-parity helpers.
import { InMemoryFixtureProvider } from '@repo/frappe';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FrappeProvider } from './FrappeProvider';
import {
  NO_TAGS_LABEL,
  filtersExcludingField,
  isFacetFilterActive,
  scrubUserFacetRows,
  toggleFacetFilter,
  useFrappeFacets,
} from './useFrappeFacets';
import type { FrappeFacetFilters } from './useFrappeFacets';

const FIXTURE_HOST = 'https://facets.spec.test';

const taskDocs = [
  {
    name: 'TASK-1',
    doctype: 'QaTask',
    owner: 'alice@example.com',
    _assign: '["alice@example.com"]',
    _user_tags: 'urgent,backend',
    status: 'Open',
    module: 'Core',
  },
  {
    name: 'TASK-2',
    doctype: 'QaTask',
    owner: 'alice@example.com',
    _assign: '["bob@example.com","alice@example.com"]',
    _user_tags: 'urgent',
    status: 'Open',
    module: 'Core',
  },
  {
    name: 'TASK-3',
    doctype: 'QaTask',
    owner: 'bob@example.com',
    _assign: '',
    _user_tags: '',
    status: 'Working',
    module: 'Website',
  },
  {
    name: 'TASK-4',
    doctype: 'QaTask',
    owner: 'carol@example.com',
    _assign: '["alice@example.com"]',
    _user_tags: 'frontend',
    status: 'Closed',
    module: 'Core',
  },
];

function fixtureWrapper(): ({ children }: { children: ReactNode }) => ReactNode {
  const fixtures = new InMemoryFixtureProvider({ QaTask: taskDocs });
  return ({ children }: { children: ReactNode }) => (
    <FrappeProvider
      baseURL={FIXTURE_HOST}
      fixtures={fixtures}>
      {children}
    </FrappeProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe(useFrappeFacets, () => {
  describe('fixture mode', () => {
    it('counts assignments from the JSON-array _assign column', async () => {
      const { result } = renderHook(() => useFrappeFacets('QaTask', []), {
        wrapper: fixtureWrapper(),
      });
      await waitFor(() => {
        expect(result.current.assigned.isLoading).toBe(false);
      });
      expect(result.current.assigned.options).toEqual([
        { value: 'alice@example.com', count: 3 },
        { value: 'bob@example.com', count: 1 },
      ]);
    });

    it('counts owners sorted by count then value', async () => {
      const { result } = renderHook(() => useFrappeFacets('QaTask', []), {
        wrapper: fixtureWrapper(),
      });
      await waitFor(() => {
        expect(result.current.owner.isLoading).toBe(false);
      });
      expect(result.current.owner.options).toEqual([
        { value: 'alice@example.com', count: 2 },
        { value: 'bob@example.com', count: 1 },
        { value: 'carol@example.com', count: 1 },
      ]);
    });

    it('splits comma tags and appends the synthetic No Tags row', async () => {
      const { result } = renderHook(() => useFrappeFacets('QaTask', []), {
        wrapper: fixtureWrapper(),
      });
      await waitFor(() => {
        expect(result.current.tags.isLoading).toBe(false);
      });
      expect(result.current.tags.options).toEqual([
        { value: 'urgent', count: 2 },
        { value: 'backend', count: 1 },
        { value: 'frontend', count: 1 },
        { value: NO_TAGS_LABEL, count: 1, isNoTags: true },
      ]);
    });

    it('serves the status facet when statusFieldname is set', async () => {
      const { result } = renderHook(() => useFrappeFacets('QaTask', [], { statusFieldname: 'status' }), {
        wrapper: fixtureWrapper(),
      });
      await waitFor(() => {
        expect(result.current.status.isLoading).toBe(false);
      });
      expect(result.current.status.options).toEqual([
        { value: 'Open', count: 2 },
        { value: 'Closed', count: 1 },
        { value: 'Working', count: 1 },
      ]);
    });

    it('keeps the status facet idle without a statusFieldname', async () => {
      const { result } = renderHook(() => useFrappeFacets('QaTask', []), {
        wrapper: fixtureWrapper(),
      });
      await waitFor(() => {
        expect(result.current.assigned.isLoading).toBe(false);
      });
      expect(result.current.status).toEqual({ isLoading: false, isStale: false });
    });

    it('serves arbitrary column facets (e.g. module)', async () => {
      const { result } = renderHook(() => useFrappeFacets('QaTask', [], { columns: ['module'] }), {
        wrapper: fixtureWrapper(),
      });
      await waitFor(() => {
        expect(result.current.columns.module?.isLoading).toBe(false);
      });
      expect(result.current.columns.module?.options).toEqual([
        { value: 'Core', count: 3 },
        { value: 'Website', count: 1 },
      ]);
    });

    it("excludes each facet's own fieldname from the applied filters", async () => {
      // A filter on owner narrows the OTHER facets but not the owner facet
      // itself (desk group-by sidebar parity).
      const filters: FrappeFacetFilters = [['owner', '=', 'alice@example.com']];
      const { result } = renderHook(() => useFrappeFacets('QaTask', filters), {
        wrapper: fixtureWrapper(),
      });
      await waitFor(() => {
        expect(result.current.owner.isLoading).toBe(false);
      });
      await waitFor(() => {
        expect(result.current.tags.isLoading).toBe(false);
      });
      // Owner facet ignores its own filter — all three owners stay counted.
      expect(result.current.owner.options?.length).toBe(3);
      // Tags facet respects it — only alice's two tasks contribute.
      expect(result.current.tags.options).toEqual([
        { value: 'urgent', count: 2 },
        { value: 'backend', count: 1 },
      ]);
    });

    it('revalidates stale-while-visible on a filter change', async () => {
      const wrapper = fixtureWrapper();
      const { result, rerender } = renderHook(
        ({ filters }: { filters: FrappeFacetFilters }) => useFrappeFacets('QaTask', filters),
        { wrapper, initialProps: { filters: [] as FrappeFacetFilters } },
      );
      await waitFor(() => {
        expect(result.current.tags.isLoading).toBe(false);
      });
      const before = result.current.tags.options;
      expect(before?.length).toBeGreaterThan(0);

      rerender({ filters: [['status', '=', 'Open']] });
      // The prior options stay VISIBLE while the refetch is in flight —
      // isStale flags the revalidation, isLoading stays false.
      expect(result.current.tags.options).toBe(before);
      expect(result.current.tags.isLoading).toBe(false);
      await waitFor(() => {
        expect(result.current.tags.isStale).toBe(false);
      });
      expect(result.current.tags.options).toEqual([
        { value: 'urgent', count: 2 },
        { value: 'backend', count: 1 },
      ]);
    });

    it('resets hard on a doctype swap (no stale foreign options)', async () => {
      const fixtures = new InMemoryFixtureProvider({
        QaTask: taskDocs,
        QaNote: [{ name: 'NOTE-1', doctype: 'QaNote', owner: 'dave@example.com' }],
      });
      const wrapper = ({ children }: { children: ReactNode }) => (
        <FrappeProvider
          baseURL={FIXTURE_HOST}
          fixtures={fixtures}>
          {children}
        </FrappeProvider>
      );
      const { result, rerender } = renderHook(({ doctype }: { doctype: string }) => useFrappeFacets(doctype, []), {
        wrapper,
        initialProps: { doctype: 'QaTask' },
      });
      await waitFor(() => {
        expect(result.current.owner.isLoading).toBe(false);
      });
      rerender({ doctype: 'QaNote' });
      // Hard reset: the swap must not show QaTask owners under QaNote.
      expect(result.current.owner.options).toBeUndefined();
      expect(result.current.owner.isLoading).toBe(true);
      await waitFor(() => {
        expect(result.current.owner.isLoading).toBe(false);
      });
      expect(result.current.owner.options).toEqual([{ value: 'dave@example.com', count: 1 }]);
    });

    it('refresh() refetches in place', async () => {
      const fixtures = new InMemoryFixtureProvider({ QaTask: taskDocs });
      const getList = vi.spyOn(fixtures, 'getList');
      const wrapper = ({ children }: { children: ReactNode }) => (
        <FrappeProvider
          baseURL={FIXTURE_HOST}
          fixtures={fixtures}>
          {children}
        </FrappeProvider>
      );
      const { result } = renderHook(() => useFrappeFacets('QaTask', []), { wrapper });
      await waitFor(() => {
        expect(result.current.assigned.isLoading).toBe(false);
      });
      const callsBefore = getList.mock.calls.length;
      act(() => {
        result.current.refresh();
      });
      await waitFor(() => {
        expect(getList.mock.calls.length).toBeGreaterThan(callsBefore);
      });
      await waitFor(() => {
        expect(result.current.assigned.isStale).toBe(false);
      });
      expect(result.current.assigned.options?.length).toBe(2);
    });
  });

  describe('live mode (desk RPC payloads)', () => {
    const LIVE_HOST = 'https://facets-live.spec.test';

    function mockDeskEndpoints() {
      return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
        const url = String(input);
        if (!url.startsWith(LIVE_HOST)) {
          throw new Error(`unexpected fetch ${url}`);
        }
        const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, string>;
        if (url.includes('frappe.desk.listview.get_group_by_count')) {
          const rows =
            body.field === 'assigned_to'
              ? [
                  { name: 'alice@example.com', count: 3 },
                  { name: 'Administrator', count: 2 },
                  { name: null, count: 5 },
                  { name: 'bob@example.com', count: 0 },
                ]
              : [
                  { name: 'carol@example.com', count: 4 },
                  { name: 'Guest', count: 1 },
                ];
          return new Response(JSON.stringify({ message: rows }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url.includes('frappe.desk.reportview.get_sidebar_stats')) {
          const stats = JSON.parse(body.stats) as string[];
          const fieldname = stats[0];
          const entries =
            fieldname === '_user_tags'
              ? [
                  ['urgent', 2],
                  [NO_TAGS_LABEL, 1],
                ]
              : [
                  ['Website', 1],
                  ['Core', 3],
                ];
          return new Response(JSON.stringify({ message: { stats: { [fieldname]: entries } } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        throw new Error(`unexpected method ${url}`);
      });
    }

    function liveWrapper({ children }: { children: ReactNode }) {
      return <FrappeProvider baseURL={LIVE_HOST}>{children}</FrappeProvider>;
    }

    it('maps get_group_by_count rows and drops null/zero groups unscrubbed', async () => {
      mockDeskEndpoints();
      const { result } = renderHook(() => useFrappeFacets('QaTask', []), {
        wrapper: liveWrapper,
      });
      await waitFor(() => {
        expect(result.current.assigned.isLoading).toBe(false);
      });
      // Null groups and zero counts dropped; Administrator KEPT (the scrub
      // is a render-time concern — scrubUserFacetRows).
      expect(result.current.assigned.options).toEqual([
        { value: 'alice@example.com', count: 3 },
        { value: 'Administrator', count: 2 },
      ]);
      await waitFor(() => {
        expect(result.current.owner.isLoading).toBe(false);
      });
      expect(result.current.owner.options).toEqual([
        { value: 'carol@example.com', count: 4 },
        { value: 'Guest', count: 1 },
      ]);
    });

    it("JSON-encodes the RPC params and excludes each facet's own field", async () => {
      const fetchMock = mockDeskEndpoints();
      const filters: FrappeFacetFilters = [
        ['owner', '=', 'alice@example.com'],
        ['status', '=', 'Open'],
      ];
      const { result } = renderHook(() => useFrappeFacets('QaTask', filters, { statusFieldname: 'status' }), {
        wrapper: liveWrapper,
      });
      await waitFor(() => {
        expect(result.current.status.isLoading).toBe(false);
      });

      const bodies = fetchMock.mock.calls.map(([input, init]) => ({
        url: String(input),
        body: JSON.parse(String(init?.body ?? '{}')) as Record<string, string>,
      }));
      const ownerCall = bodies.find(
        (call) =>
          call.url.includes('get_group_by_count') && call.body.field === 'owner' && call.body.current_filters !== '[]',
      );
      // The tuple on the facet's own fieldname is excluded; others survive.
      expect(ownerCall?.body.current_filters).toBe(JSON.stringify([['status', '=', 'Open']]));

      const statusCall = bodies.find(
        (call) => call.url.includes('get_sidebar_stats') && call.body.stats?.includes('status'),
      );
      // stats and filters ride as JSON-encoded STRINGS (the endpoint
      // json.loads() them and 500s on raw arrays).
      expect(statusCall?.body.stats).toBe(JSON.stringify(['status']));
      expect(statusCall?.body.filters).toBe(JSON.stringify([['owner', '=', 'alice@example.com']]));
    });

    it('maps tag stats with the synthetic No Tags row flagged', async () => {
      mockDeskEndpoints();
      const { result } = renderHook(() => useFrappeFacets('QaTask', []), {
        wrapper: liveWrapper,
      });
      await waitFor(() => {
        expect(result.current.tags.isLoading).toBe(false);
      });
      expect(result.current.tags.options).toEqual([
        { value: 'urgent', count: 2, isNoTags: false },
        { value: NO_TAGS_LABEL, count: 1, isNoTags: true },
      ]);
    });

    it('sorts column facet stats by count descending', async () => {
      mockDeskEndpoints();
      const { result } = renderHook(() => useFrappeFacets('QaTask', [], { columns: ['module'] }), {
        wrapper: liveWrapper,
      });
      await waitFor(() => {
        expect(result.current.columns.module?.isLoading).toBe(false);
      });
      expect(result.current.columns.module?.options).toEqual([
        { value: 'Core', count: 3 },
        { value: 'Website', count: 1 },
      ]);
    });

    it('surfaces per-facet errors without dropping the other facets', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes('get_group_by_count')) {
          // 403: permission errors do not retry. 5xx would sit in
          // HttpClient's backoff and leave isLoading true past waitFor.
          return new Response('boom', { status: 403 });
        }
        return new Response(JSON.stringify({ message: { stats: { _user_tags: [['urgent', 1]] } } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      });
      const { result } = renderHook(() => useFrappeFacets('QaTask', []), {
        wrapper: liveWrapper,
      });
      await waitFor(() => {
        expect(result.current.assigned.isLoading).toBe(false);
      });
      await waitFor(() => {
        expect(result.current.tags.isLoading).toBe(false);
      });
      expect(result.current.assigned.error).toBeInstanceOf(Error);
      expect(result.current.tags.error).toBeUndefined();
      expect(result.current.tags.options).toEqual([{ value: 'urgent', count: 1, isNoTags: false }]);
    });
  });

  describe('desk-parity helpers', () => {
    it("filtersExcludingField removes only the facet's own tuples", () => {
      const filters: FrappeFacetFilters = [
        ['owner', '=', 'a'],
        ['status', '=', 'Open'],
        ['owner', 'like', '%b%'],
      ];
      expect(filtersExcludingField(filters, 'owner')).toEqual([['status', '=', 'Open']]);
    });

    it('isFacetFilterActive matches tuples case-insensitively on operator', () => {
      const filters: FrappeFacetFilters = [['_assign', 'LIKE', '%alice%']];
      expect(isFacetFilterActive(filters, ['_assign', 'like', '%alice%'])).toBe(true);
      expect(isFacetFilterActive(filters, ['_assign', 'like', '%bob%'])).toBe(false);
    });

    it('toggleFacetFilter replaces same-field tuples and toggles off', () => {
      const open: FrappeFacetFilters = [['status', '=', 'Open']];
      // Replace: a different value on the same fieldname swaps in.
      expect(toggleFacetFilter(open, ['status', '=', 'Closed'])).toEqual([['status', '=', 'Closed']]);
      // Toggle off: the active tuple clears the facet.
      expect(toggleFacetFilter(open, ['status', '=', 'Open'])).toEqual([]);
      // Other fieldnames survive.
      expect(toggleFacetFilter([['owner', '=', 'a']], ['status', '=', 'Open'])).toEqual([
        ['owner', '=', 'a'],
        ['status', '=', 'Open'],
      ]);
    });

    it('scrubUserFacetRows pins the session user and hides system users', () => {
      const rows = [
        { value: 'Administrator', count: 9 },
        { value: 'alice@example.com', count: 3 },
        { value: 'Guest', count: 2 },
        { value: 'bob@example.com', count: 1 },
      ];
      // Session user pinned first ("Me"); Guest/Administrator scrubbed.
      expect(scrubUserFacetRows(rows, 'alice@example.com')).toEqual([
        { value: 'alice@example.com', count: 3 },
        { value: 'bob@example.com', count: 1 },
      ]);
      // Unknown session: untouched (Administrator-only benches keep rows).
      expect(scrubUserFacetRows(rows)).toEqual(rows);
    });
  });
});
