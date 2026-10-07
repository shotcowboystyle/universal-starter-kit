import { InMemoryFixtureProvider } from '@repo/frappe';
import { Text, YStack } from 'tamagui';

import { FrappeProvider, useFrappeConfig } from './FrappeProvider';

export default {
  title: 'FrappeUI/FrappeProvider',
  component: FrappeProvider,
  tags: ['!test'],
  parameters: {
    status: { type: 'stable' },
    docs: {
      description: {
        component:
          'Non-visual context provider for Frappe connection configuration. Stories render a probe consumer that prints what the provider supplies. The Main story is network-hermetic (G-15/D-05): baseURL is MOCK_HOST and an in-story fetch mock swallows any REST to that origin so nothing leaves the machine.',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Hermetic story host (G-15 story honesty / D-05).
//
// Fixture-backed stories previously pointed at https://demo.frappe.cloud. The
// provider itself does not fetch, but any consumer that resolves DocType meta
// from baseURL would. MOCK_HOST keeps the same code path without leaving the
// machine.
// ---------------------------------------------------------------------------

const MOCK_HOST = 'https://frappeprovider.mock.test';

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
  if (w.__frappeProviderMockFetch) {
    return;
  }
  w.__frappeProviderMockFetch = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (urlStr.startsWith(MOCK_HOST)) {
      const url = new URL(urlStr);
      const metaMatch = /^\/api\/resource\/DocType\/(.+)$/.exec(url.pathname);
      if (metaMatch) {
        return jsonResponse({
          data: {
            name: decodeURIComponent(metaMatch[1]),
            module: 'Custom',
            fields: [],
            permissions: [{ role: 'All', read: 1 }],
          },
        });
      }
      if (url.pathname === '/api/resource/DocType') {
        return jsonResponse({ data: [] });
      }
      if (url.pathname === '/api/method/frappe.desk.form.load.getdoctype') {
        return jsonResponse({ docs: [] });
      }
      return jsonResponse({ data: [] });
    }
    return await realFetch(input as RequestInfo, init);
  };
})();

function ConfigProbe({ probeId = 'config-probe' }: { probeId?: string }) {
  const config = useFrappeConfig();
  return (
    <YStack
      data-testid={probeId}
      padding="$3"
      gap="$1"
      borderWidth={1}
      borderColor="$borderColor">
      <Text fontWeight="600">useFrappeConfig()</Text>
      <Text
        data-testid={`${probeId}-baseurl`}
        fontSize="$2">
        baseURL: {config?.baseURL ?? '(undefined)'}
      </Text>
      <Text
        data-testid={`${probeId}-auth`}
        fontSize="$2">
        auth.useToken: {String(config?.auth?.useToken ?? '(undefined)')}
      </Text>
      <Text
        data-testid={`${probeId}-fixtures`}
        fontSize="$2">
        fixtures: {config?.fixtures ? 'present' : '(none)'}
      </Text>
      <Text
        data-testid={`${probeId}-socketport`}
        fontSize="$2">
        socketPort: {String(config?.socketPort ?? '(undefined)')}
      </Text>
    </YStack>
  );
}

export const Main = () => (
  <FrappeProvider
    baseURL={MOCK_HOST}
    socketPort={9000}
    auth={{ useToken: true, token: 'story-token', type: 'token' }}
    fixtures={new InMemoryFixtureProvider({})}>
    <ConfigProbe />
  </FrappeProvider>
);
Main.storyName = 'Main';

/** No provider at all: consumers must see a deterministic `undefined`, not crash. */
export const WithoutProvider = () => <ConfigProbe probeId="no-provider-probe" />;

/** Nested providers: the innermost provider must win for its subtree. */
export const Nested = () => (
  <FrappeProvider
    baseURL="https://outer.example.com"
    auth={{ useToken: false }}>
    <YStack gap="$3">
      <ConfigProbe probeId="outer-probe" />
      <FrappeProvider
        baseURL="https://inner.example.com"
        auth={{ useToken: true, token: 'inner' }}>
        <ConfigProbe probeId="inner-probe" />
      </FrappeProvider>
    </YStack>
  </FrappeProvider>
);

/** Missing/empty baseURL is passed through verbatim — consumers decide how to fail. */
export const EmptyBaseURL = () => (
  <FrappeProvider baseURL="">
    <ConfigProbe probeId="empty-probe" />
  </FrappeProvider>
);
