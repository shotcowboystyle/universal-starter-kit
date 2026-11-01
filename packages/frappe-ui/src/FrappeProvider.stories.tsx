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
/** What the probe prints for a config value that is not set. */
const UNSET = '(undefined)';

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- any JSON-serialisable mock envelope the stories answer with
const jsonResponse = (body: unknown, status = 200): Response => Response.json(body, { status });

const requestUrl = (input: RequestInfo | URL): string => {
  if (input instanceof URL) {
    return input.toString();
  }
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- discriminates fetch's declared `string | Request` input union
  return typeof input === 'string' ? input : input.url;
};

(() => {
  if (typeof window === 'undefined') {
    return;
  }
  // SAFETY: the flag is an optional property this module alone sets on window
  const w = window as Window & { __frappeProviderMockFetch?: boolean };
  if (w.__frappeProviderMockFetch === true) {
    return;
  }
  w.__frappeProviderMockFetch = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = requestUrl(input);
    if (urlStr.startsWith(MOCK_HOST)) {
      const url = new URL(urlStr);
      const metaMatch = /^\/api\/resource\/DocType\/(?<doctype>.+)$/u.exec(url.pathname);
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

const ConfigProbe = ({ probeId = 'config-probe' }: { probeId?: string }) => {
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
        baseURL: {config?.baseURL ?? UNSET}
      </Text>
      <Text
        data-testid={`${probeId}-auth`}
        fontSize="$2">
        auth.useToken: {String(config?.auth?.useToken ?? UNSET)}
      </Text>
      <Text
        data-testid={`${probeId}-fixtures`}
        fontSize="$2">
        fixtures: {config?.fixtures ? 'present' : '(none)'}
      </Text>
      <Text
        data-testid={`${probeId}-socketport`}
        fontSize="$2">
        socketPort: {String(config?.socketPort ?? UNSET)}
      </Text>
    </YStack>
  );
};

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
