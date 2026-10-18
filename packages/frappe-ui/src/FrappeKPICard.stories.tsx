import { CurrencyDollarIcon } from '@phosphor-icons/react';
import { InMemoryFixtureProvider } from '@repo/frappe';
import { action } from '@repo/storybook';
import { sizeRecipeEscape } from '@repo/theme';
// KPICard comes from the components catalog — the frappe-ui barrel
// re-exports it from there directly (./FrappeDashboard no longer bounces
// catalog names it does not define).
import { KPICard } from '@repo/ui';
import { XStack } from 'tamagui';

import { FrappeKPICard } from './FrappeKPICard';
import { FrappeProvider } from './FrappeProvider';
import { FrappeStoryProvider } from './frappeStoryTarget';

export default {
  title: 'FrappeUI/FrappeKPICard',
  component: KPICard,
  tags: ['!test'],
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          "KPICard as re-exported by @repo/frappe-ui (the 'Frappe KPICard' bridge). It is the same component object as the components-package KPICard; these stories exercise the bridge surface and value edge cases. Live aggregate stories are network-hermetic (G-15/D-05): counts come from InMemoryFixtureProvider and DocType meta from an in-story fetch mock, so nothing leaves the machine. The separately-named Live story is the live-bench arm.",
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Hermetic story host (G-15 story honesty / D-05, closes UX-P18).
//
// LiveToDoCount previously wrapped FrappeStoryProvider, whose fallback
// baseURL is https://demo.frappe.cloud (and which is a no-op on native
// Kitchen Sink / TestFlight). Fixture rows then never reached
// useFrappeAggregate, and any DocType-meta fetch CORS-failed. MOCK_HOST
// keeps the same code path (real fetch, real meta shape) without leaving
// the machine; counts render from InMemoryFixtureProvider.
// ---------------------------------------------------------------------------

const MOCK_HOST = 'https://frappekpicard.mock.test';

function todoMetaRaw(name: string) {
  return {
    name,
    module: 'Desk',
    title_field: 'description',
    fields: [
      { fieldname: 'description', fieldtype: 'Text Editor', label: 'Description', in_list_view: 1 },
      {
        fieldname: 'status',
        fieldtype: 'Select',
        label: 'Status',
        options: 'Open\nClosed',
        in_list_view: 1,
        in_standard_filter: 1,
      },
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
  if (w.__frappeKpiCardMockFetch) {
    return;
  }
  w.__frappeKpiCardMockFetch = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (urlStr.startsWith(MOCK_HOST)) {
      const url = new URL(urlStr);
      if (url.pathname === '/api/method/frappe.desk.form.load.getdoctype') {
        const doctype = url.searchParams.get('doctype') ?? 'ToDo';
        return jsonResponse({ docs: [todoMetaRaw(decodeURIComponent(doctype))] });
      }
      const metaMatch = /^\/api\/resource\/DocType\/(.+)$/.exec(url.pathname);
      if (metaMatch) {
        return jsonResponse({ data: todoMetaRaw(decodeURIComponent(metaMatch[1])) });
      }
      if (url.pathname === '/api/resource/DocType') {
        return jsonResponse({ data: [{ name: 'ToDo', module: 'Desk' }] });
      }
      // Everything else (guest field-peek, counts): empty, never the network.
      // Scalar counts still come from InMemoryFixtureProvider, not this body.
      return jsonResponse({ data: [] });
    }
    return await realFetch(input as RequestInfo, init);
  };
})();

export const Main = () => (
  <KPICard
    config={{
      id: 'revenue',
      title: 'Total Revenue',
      value: 125_000,
      format: 'currency',
      currencySymbol: '$',
      trend: 'up',
      trendValue: '+12.5%',
      goodDirection: 'up',
      icon: <CurrencyDollarIcon size={20} />,
    }}
  />
);
Main.storyName = 'Main';

export const ValueEdgeCases = () => (
  <XStack
    gap="$3"
    flexWrap="wrap">
    <KPICard config={{ id: 'zero', title: 'Zero', value: 0 }} />
    <KPICard config={{ id: 'negative', title: 'Negative', value: -4321, format: 'currency' }} />
    <KPICard config={{ id: 'large', title: 'Large', value: 9_876_543_210_123, format: 'number' }} />
    <KPICard config={{ id: 'string', title: 'String Value', value: 'N/A' }} />
    <KPICard config={{ id: 'percent', title: 'Percent', value: 42.5, format: 'percent' }} />
  </XStack>
);

/**
 * LC-36 TREND-SENTIMENT matrix: color = trend × goodDirection. Direction
 * alone never picks success/error — undeclared sentiment renders neutral.
 */
export const Trends = () => (
  <XStack
    gap="$3"
    flexWrap="wrap">
    <KPICard
      config={{
        id: 'up-good',
        title: 'Rising, up is good',
        value: 100,
        trend: 'up',
        trendValue: '+10%',
        goodDirection: 'up',
      }}
    />
    <KPICard
      config={{
        id: 'down-good',
        title: 'Falling, down is good',
        value: 12,
        trend: 'down',
        trendValue: '-8%',
        goodDirection: 'down',
      }}
    />
    <KPICard
      config={{
        id: 'up-bad',
        title: 'Rising, down is good',
        value: 31,
        trend: 'up',
        trendValue: '+4%',
        goodDirection: 'down',
      }}
    />
    <KPICard
      config={{
        id: 'undeclared',
        title: 'Undeclared sentiment',
        value: 90,
        trend: 'down',
        trendValue: '-10%',
      }}
    />
    <KPICard
      config={{
        id: 'none',
        title: 'Sentiment none',
        value: 64,
        trend: 'up',
        trendValue: '+2%',
        goodDirection: 'none',
      }}
    />
    <KPICard
      config={{
        id: 'neutral',
        title: 'Trend Neutral',
        value: 100,
        trend: 'neutral',
        trendValue: '0%',
      }}
    />
  </XStack>
);

export const Clickable = () => (
  <KPICard
    config={{
      id: 'clickable',
      title: 'Clickable KPI',
      value: 55,
      onClick: action('onClick'),
    }}
  />
);

export const LongTitle = () => (
  <KPICard
    width={sizeRecipeEscape(220, 'story fixture: a card narrow enough to truncate the long title')}
    config={{
      id: 'long',
      title: 'An unreasonably long KPI title that describes the metric in far too much detail for a card',
      value: 123_456_789,
      format: 'currency',
      currencySymbol: '€',
      trend: 'down',
      trendValue: '-99.99%',
    }}
  />
);

// ---------------------------------------------------------------------------
// Hermetic aggregate (FrappeKPICard + dataSource): counts come from
// InMemoryFixtureProvider against MOCK_HOST. No bench, no demo.frappe.cloud.
// ---------------------------------------------------------------------------

const todoFixtures = [
  { name: 'TD-1', doctype: 'ToDo', description: 'Fixture todo A', status: 'Open' },
  { name: 'TD-2', doctype: 'ToDo', description: 'Fixture todo B', status: 'Open' },
  { name: 'TD-3', doctype: 'ToDo', description: 'Fixture todo C', status: 'Closed' },
];

const makeTodoFixtures = () => new InMemoryFixtureProvider({ ToDo: todoFixtures });

function ToDoCountCards() {
  return (
    <XStack
      gap="$3"
      flexWrap="wrap">
      <FrappeKPICard
        width={280}
        testID="live-todo-count"
        config={{ id: 'todo-count', title: 'ToDos', value: 0, format: 'number' }}
        dataSource={{ doctype: 'ToDo' }}
      />
      <FrappeKPICard
        width={280}
        testID="live-todo-open-count"
        config={{ id: 'todo-open-count', title: 'Open ToDos', value: 0, format: 'number' }}
        dataSource={{ doctype: 'ToDo', filters: { status: 'Open' } }}
      />
    </XStack>
  );
}

/** Default path: fixture counts on MOCK_HOST (Kitchen Sink / TestFlight). */
export const LiveToDoCount = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    fixtures={makeTodoFixtures()}>
    <ToDoCountCards />
  </FrappeProvider>
);
LiveToDoCount.parameters = {
  docs: {
    description: {
      story:
        'Hermetic server-side count of fixture ToDo documents (3 total, 2 Open) via useFrappeAggregate + InMemoryFixtureProvider. DocType meta is served by the in-story fetch mock at https://frappekpicard.mock.test — nothing leaves the machine.',
    },
  },
};

// ---------------------------------------------------------------------------
// Live bench story — real aggregates when the bench is reachable
// ---------------------------------------------------------------------------

/**
 * Live aggregates against the real bench: frappe.client.get_count, refetched
 * with a 300ms coalescing window on realtime list_update / doc_update /
 * doc_deleted. Falls back to the same fixtures when the bench is down.
 */
export const Live = () => (
  <FrappeStoryProvider fixtures={makeTodoFixtures()}>
    <ToDoCountCards />
  </FrappeStoryProvider>
);
Live.parameters = {
  docs: {
    description: {
      story:
        'LIVE server-side count of ToDo documents (frappe.client.get_count), refetched with a 300ms coalescing window on realtime events. Both cards watch the same doctype and share one refcounted realtime room subscription. Create/delete a ToDo on the bench and the numbers update in place — no reload. Fixture fallback when the bench is down.',
    },
  },
};
