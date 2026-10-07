import { InMemoryFixtureProvider } from '@repo/frappe';
import { action } from '@repo/storybook';
import { Text, XStack, YStack } from 'tamagui';

import { FrappeList } from './FrappeList';
import { FrappeProvider } from './FrappeProvider';
import { FrappeStoryProvider } from './frappeStoryTarget';

export default {
  title: 'FrappeUI/FrappeList',
  component: FrappeList,
  tags: ['!test'],
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'List over useFrappePagination → useFrappeCollection / useLiveQuery. Fixture stories are network-hermetic (G-15/D-05): documents come from InMemoryFixtureProvider and DocType meta from an in-story fetch mock, so nothing leaves the machine. The separately-named Live story is the live-bench arm — it targets STORYBOOK_FRAPPE_URL when reachable and falls back to fixtures otherwise.',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Hermetic story host (G-15 story honesty / D-05, closes UX-P18).
//
// Fixture-backed stories previously pointed at https://demo.frappe.cloud. The
// fixture provider serves the *collection*, but FrappeList still resolves
// DocType meta over HTTP — so every one of those stories fired a real
// cross-origin request that the browser rejected with a CORS error, poisoning
// the console for every automated probe. MOCK_HOST keeps the same code path
// (real fetch, real meta shape) without leaving the machine.
// ---------------------------------------------------------------------------

const MOCK_HOST = 'https://frappelist.mock.test';

function todoMetaRaw(name: string) {
  return {
    name,
    module: 'Desk',
    title_field: 'description',
    fields: [
      { fieldname: 'description', fieldtype: 'Data', label: 'Description', in_list_view: 1 },
      {
        fieldname: 'status',
        fieldtype: 'Select',
        label: 'Status',
        options: 'Open\nWorking\nCompleted',
        in_list_view: 1,
        in_standard_filter: 1,
      },
      {
        fieldname: 'priority',
        fieldtype: 'Select',
        label: 'Priority',
        options: 'Low\nMedium\nHigh',
        in_list_view: 1,
        in_standard_filter: 1,
      },
      { fieldname: 'date', fieldtype: 'Date', label: 'Due Date' },
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
  if (w.__frappeListMockFetch) {
    return;
  }
  w.__frappeListMockFetch = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (urlStr.startsWith(MOCK_HOST)) {
      const url = new URL(urlStr);
      if (url.pathname === '/api/method/frappe.desk.form.load.getdoctype') {
        const doctype = url.searchParams.get('doctype') ?? 'ToDo';
        return jsonResponse({ docs: [todoMetaRaw(doctype)] });
      }
      const metaMatch = /^\/api\/resource\/DocType\/(.+)$/.exec(url.pathname);
      if (metaMatch) {
        return jsonResponse({ data: todoMetaRaw(decodeURIComponent(metaMatch[1])) });
      }
      if (url.pathname === '/api/resource/DocType') {
        return jsonResponse({ data: [{ name: 'ToDo', module: 'Desk' }] });
      }
      // Everything else (guest field-peek, counts): empty, never the network.
      return jsonResponse({ data: [] });
    }
    return await realFetch(input as RequestInfo, init);
  };
})();

interface ToDo {
  name: string;
  doctype: string;
  description: string;
  status: string;
  date: string;
  priority: string;
}

const todoFixtures: ToDo[] = Array.from({ length: 100 }, (_, i) => ({
  name: `TODO-${String(i + 1).padStart(3, '0')}`,
  doctype: 'ToDo',
  description: `Task ${i + 1}: ${['Review document', 'Update code', 'Write tests', 'Fix bug', 'Deploy app'][i % 5]}`,
  status: ['Open', 'Working', 'Completed'][i % 3],
  date: `2026-01-${String((i % 28) + 1).padStart(2, '0')}`,
  priority: ['Low', 'Medium', 'High'][i % 3],
}));

export const Default = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({ ToDo: todoFixtures.slice(0, 10) })}>
    <FrappeList<ToDo>
      doctype="ToDo"
      renderItem={(doc) => (
        <YStack
          gap="$0.5"
          paddingVertical="$2"
          paddingHorizontal="$3">
          <XStack
            gap="$2"
            alignItems="center">
            <Text
              fontSize="$2"
              color="$color10"
              minWidth={80}>
              Task:
            </Text>
            <Text fontSize="$3">{doc.description ?? '-'}</Text>
          </XStack>
          <XStack
            gap="$2"
            alignItems="center">
            <Text
              fontSize="$2"
              color="$color10"
              minWidth={80}>
              Status:
            </Text>
            <Text fontSize="$3">{doc.status ?? '-'}</Text>
          </XStack>
        </YStack>
      )}
      onItemClick={action('onItemClick')}
    />
  </FrappeProvider>
);
Default.parameters = {
  docs: {
    description: {
      story: 'Basic list showing ToDo items with renderItem function.',
    },
  },
};

Default.storyName = 'Main';
export const WithCustomFieldRenderer = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({ ToDo: todoFixtures.slice(0, 10) })}>
    <FrappeList<ToDo>
      doctype="ToDo"
      renderItem={(doc) => (
        <YStack
          gap="$0.5"
          paddingVertical="$2"
          paddingHorizontal="$3">
          <XStack
            gap="$2"
            alignItems="center">
            <Text
              fontSize="$2"
              color="$color10"
              minWidth={80}>
              Task:
            </Text>
            <Text fontSize="$3">{doc.description ?? '-'}</Text>
          </XStack>
          <XStack
            gap="$2"
            alignItems="center">
            <Text
              fontSize="$2"
              color="$color10"
              minWidth={80}>
              Status:
            </Text>
            <Text
              paddingHorizontal="$2"
              paddingVertical="$1"
              backgroundColor={
                doc.status === 'Completed' ? '$green4' : doc.status === 'Working' ? '$yellow4' : '$blue4'
              }
              borderRadius="$2"
              fontSize="$2">
              {doc.status}
            </Text>
          </XStack>
          <XStack
            gap="$2"
            alignItems="center">
            <Text
              fontSize="$2"
              color="$color10"
              minWidth={80}>
              Priority:
            </Text>
            <Text fontSize="$3">{doc.priority ?? '-'}</Text>
          </XStack>
        </YStack>
      )}
      onItemClick={action('onItemClick')}
    />
  </FrappeProvider>
);
WithCustomFieldRenderer.parameters = {
  docs: {
    description: {
      story: 'List with custom rendering for status badges.',
    },
  },
};

// ---------------------------------------------------------------------------
// Live bench story — real ToDo doctype over the live data path
// ---------------------------------------------------------------------------

/**
 * Live list against the real bench (STORYBOOK_FRAPPE_URL, default the local
 * dev bench proxied by the Storybook dev server). Items are driven by
 * realtime subscriptions: external creates insert per sort, doc_update
 * patches the item in place, doc_deleted evicts it — no reload. Falls back
 * to fixtures when the bench is unreachable.
 */
export const Live = () => (
  <FrappeStoryProvider fixtures={new InMemoryFixtureProvider({ ToDo: todoFixtures.slice(0, 10) })}>
    <FrappeList<ToDo>
      doctype="ToDo"
      fields={['name', 'description', 'status', 'priority']}
      renderItem={(doc) => (
        <YStack
          gap="$0.5"
          paddingVertical="$2"
          paddingHorizontal="$3">
          <Text fontSize="$3">{doc.description ?? '-'}</Text>
          <Text
            fontSize="$2"
            color="$color10">
            {doc.status ?? '-'} · {doc.priority ?? '-'}
          </Text>
        </YStack>
      )}
      onItemClick={action('onItemClick')}
      height={480}
    />
  </FrappeStoryProvider>
);
Live.parameters = {
  docs: {
    description: {
      story:
        'Live wiring through useFrappePagination → useFrappeCollection + useLiveQuery: realtime doc_update/list_update patch items in place, doc_deleted evicts, reconnects backfill. Shows a reconnect pill while the socket is down and an honest error panel on permission/network failure. Fixture fallback when the bench is down.',
    },
  },
};

// ---------------------------------------------------------------------------
// Honest async states (Axiom 6 / W9): loading ≠ empty ≠ error
// ---------------------------------------------------------------------------

/** Fixture provider whose list fetch never resolves — holds the real collection in loading. */
class PendingFixtureProvider extends InMemoryFixtureProvider {
  async getList(): Promise<never[]> {
    return await new Promise(() => {});
  }
}

const renderTodo = (doc: Partial<ToDo>) => (
  <YStack
    gap="$0.5"
    paddingVertical="$2"
    paddingHorizontal="$3">
    <Text fontSize="$3">{doc.description ?? '-'}</Text>
  </YStack>
);

/** Collection stuck syncing: the underlying List renders its list skeleton (LC-20 / DG-ST-02). */
export const Loading = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new PendingFixtureProvider()}>
    <FrappeList<ToDo>
      doctype="ToDo"
      renderItem={renderTodo}
      height={400}
    />
  </FrappeProvider>
);

/** Zero documents, no failure — "No ToDo records found" (empty ≠ error). */
export const Empty = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({ ToDo: [] })}>
    <FrappeList<ToDo>
      doctype="ToDo"
      renderItem={renderTodo}
      height={400}
    />
  </FrappeProvider>
);

/**
 * Failed load — error chrome with retry wins over empty (DG-ST-01). The `error`
 * prop passes through to the underlying List. The live query path also sets
 * its own error state now: useFrappePagination surfaces initial-sync failures
 * (permission/network) via onSyncError and FrappeList renders them as an
 * AsyncBoundary error panel.
 */
export const LoadError = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({ ToDo: [] })}>
    <FrappeList<ToDo>
      doctype="ToDo"
      renderItem={renderTodo}
      error="Failed to load ToDo records."
      onRetry={action('onRetry')}
      height={400}
    />
  </FrappeProvider>
);

/**
 * Documents exist but the active filters match nothing — no-results ≠ empty
 * (Axiom 6 HONEST STATE). The fixture provider honors `filters`, so the
 * collection really queries and really comes back empty; the consumer names
 * the filter context in `emptyMessage`.
 */
export const NoResults = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({ ToDo: todoFixtures.slice(0, 10) })}>
    <FrappeList<ToDo>
      doctype="ToDo"
      filters={[['status', '=', 'Cancelled']]}
      renderItem={renderTodo}
      emptyMessage="No ToDo records match the current filters"
      height={400}
    />
  </FrappeProvider>
);

export const VirtualScrolling = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={new InMemoryFixtureProvider({ ToDo: todoFixtures })}>
    <FrappeList<ToDo>
      doctype="ToDo"
      renderItem={(doc) => (
        <YStack
          gap="$0.5"
          paddingVertical="$2"
          paddingHorizontal="$3">
          <XStack
            gap="$2"
            alignItems="center">
            <Text
              fontSize="$2"
              color="$color10"
              minWidth={80}>
              ID:
            </Text>
            <Text fontSize="$3">{doc.name ?? '-'}</Text>
          </XStack>
          <XStack
            gap="$2"
            alignItems="center">
            <Text
              fontSize="$2"
              color="$color10"
              minWidth={80}>
              Task:
            </Text>
            <Text fontSize="$3">{doc.description ?? '-'}</Text>
          </XStack>
          <XStack
            gap="$2"
            alignItems="center">
            <Text
              fontSize="$2"
              color="$color10"
              minWidth={80}>
              Status:
            </Text>
            <Text fontSize="$3">{doc.status ?? '-'}</Text>
          </XStack>
          <XStack
            gap="$2"
            alignItems="center">
            <Text
              fontSize="$2"
              color="$color10"
              minWidth={80}>
              Priority:
            </Text>
            <Text fontSize="$3">{doc.priority ?? '-'}</Text>
          </XStack>
        </YStack>
      )}
      height={400}
      estimateSize={50}
      onItemClick={action('onItemClick')}
    />
  </FrappeProvider>
);
VirtualScrolling.parameters = {
  docs: {
    description: {
      story: 'List with virtual scrolling for 100 items - only visible items are rendered.',
    },
  },
};
