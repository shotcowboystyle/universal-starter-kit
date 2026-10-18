// OWNER: backoffice screens workstream (MPO-189).
// NotFoundScreen stories: the unmatched-path surface. Nothing here touches
// the network — the screen reads only the provider's location (the failed
// path becomes the description line) plus its navigator and paths (the "Go
// to workspaces" action), so an empty InMemoryFixtureProvider and a
// MemoryNavigator seeded at the dead path are the whole harness.
import { InMemoryFixtureProvider } from '@repo/frappe';
import { sizeRecipeEscape } from '@repo/theme';
import { YStack } from '@repo/ui';
import type { ReactNode } from 'react';

import { BackofficeProvider } from '../config/BackofficeProvider';
import { createMemoryNavigator } from '../navigation/navigator';

import { NotFoundScreen } from './NotFoundScreen';

const frameHeight = sizeRecipeEscape(420, 'story canvas: a fixed-height frame for a full-height screen to fill');

const meta = {
  title: 'Screens/Backoffice/NotFoundScreen',
  component: NotFoundScreen,
  tags: ['!test'],
  parameters: {
    status: { type: 'stable' },
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Any backoffice path that matches no route pattern lands here (deep or malformed links, and the DeskSurface `not-found` target). Same EmptyState presentation as the SlugScreen unknown-slug state: the failed path is the description, and one button replaces history with the default workspace so Back does not bounce off the dead address again.',
      },
    },
  },
};
export default meta;

const MOCK_HOST = 'https://backoffice-not-found.mock.test';

const deepLink = createMemoryNavigator('/backoffice/sales-invoice/SI-0001/edit');
const bareSlug = createMemoryNavigator('/backoffice/no-such-thing');
const rootPath = createMemoryNavigator('/backoffice');

const Host = ({
  navigation,
  children,
}: {
  navigation: ReturnType<typeof createMemoryNavigator>;
  children: ReactNode;
}) => (
  <BackofficeProvider
    frappe={{ baseURL: MOCK_HOST, fixtures: new InMemoryFixtureProvider({}) }}
    navigation={navigation}>
    <YStack
      flex={1}
      height={frameHeight}
      justifyContent="center">
      {children}
    </YStack>
  </BackofficeProvider>
);

/** A malformed deep link: the whole path is echoed back as the description. */
export const Main = () => (
  <Host navigation={deepLink}>
    <NotFoundScreen />
  </Host>
);
Main.storyName = 'Main';

/** An unknown slug — what the slug index reports when it resolves to nothing. */
export const UnknownSlug = () => (
  <Host navigation={bareSlug}>
    <NotFoundScreen />
  </Host>
);

/**
 * Mounted at the base path itself: `location.path` is the base, so the
 * description shows it rather than collapsing to an empty line.
 */
export const AtBasePath = () => (
  <Host navigation={rootPath}>
    <NotFoundScreen />
  </Host>
);
